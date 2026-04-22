---
phase: 17-migrate-full-species-data-from-legacy-database
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/migrate-species.js
  - scripts/migrate-species.test.js
  - package.json
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

`scripts/migrate-species.js` is a well-structured one-time migration script that streams a large MySQL dump, parses multiple tables with hand-rolled regex, and produces `data/species.csv` and `data/records.csv`. The parsing logic is careful and well-commented. There are no critical security issues — this is a local, offline migration tool with no network surface.

Three warnings merit attention before the migration is run in earnest:

- A logic bug silently drops `similar_species` links when the target species was included via PNW records rather than images.
- The `safeSpecies` sanitization logic is duplicated with no shared helper, creating a maintenance hazard.
- The test suite has implicit test-ordering dependencies that make individual test execution unreliable.

No critical issues found.

---

## Warnings

### WR-01: `similar_species` links silently dropped for record-only species

**File:** `scripts/migrate-species.js:457-459`

**Issue:** `similar_species` slugs are resolved exclusively from `slugMap` (image-derived). A species may be included in `species.csv` because it has PNW occurrence records (`speciesWithPnwRecords`) while having no images (`slugMap` miss). When such a species is the *target* of a similarity link, `slugMap.get(tid)` returns `undefined`, and the `.filter(Boolean)` silently discards the link. The species exists in the output but its slug cannot be looked up, so the `similar_species` field of the *source* species is silently truncated.

**Fix:** Build slug resolution for `similar_species` from the same `speciesDbSlugMap` that is already computed for records (or from the final `speciesOut` list after it is built). Since `similar_species` links must point to species that exist in `species.csv`, the correct slug to use is the one that will appear in that file:

```js
// After speciesOut is built, create a lookup from id → output slug
const outputSlugById = new Map(speciesOut.map(sp => [sp.id, slugMap.get(sp.id) ?? speciesDbSlugMap.get(sp.id)]));

// Then in the speciesOut loop, replace lines 457-459 with:
const similarSlugs = similarIds
  .map(tid => outputSlugById.get(tid) ?? null)
  .filter(Boolean);
```

Note: this requires a two-pass approach (build `speciesOut` first without `similar_species`, then backfill). Alternatively, compute the fallback slug during the first pass and store it on `sp`.

---

### WR-02: `safeSpecies` sanitization logic duplicated

**File:** `scripts/migrate-species.js:425-431` and `483-487`

**Issue:** The four-step sanitization (`includes('-')` truncation → `replace(/[^a-zA-Z0-9 ]/g, '')` → `.trim()` → fallback to `'sp'`) is written out identically in two separate loops within `main()`. If these ever diverge (e.g., someone updates one but not the other), species slugs in `species.csv` and `records.csv` will not match, silently causing orphaned records in `build-data.js` validation.

**Fix:** Extract the logic into a named helper function and call it from both places:

```js
/**
 * Sanitize a species epithet for use in a slug.
 * Truncates at first hyphen (e.g. "v-alba" → "v"), strips non-alphanumeric-or-space chars.
 * @param {string} epithet
 * @returns {string}
 */
function sanitizeEpithet(epithet) {
  let safe = epithet.includes('-') ? epithet.slice(0, epithet.indexOf('-')) : epithet;
  safe = safe.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return safe || 'sp';
}
```

---

### WR-03: Integration tests have implicit ordering dependency

**File:** `scripts/migrate-species.test.js:41-78`

**Issue:** Tests 3–7 depend on `data/species.csv` and `data/records.csv` having been written by test 2. `node:test` runs tests sequentially in file order by default, so this works when running the full suite. However, running a subset with `--test-name-pattern` (e.g., only test 5 to debug a column issue) will fail on a missing-file error rather than a useful assertion message. Additionally, if test 2 fails, the `execSync` exception from migration failure swallows stderr, making the root cause invisible.

**Fix 1 (test isolation):** Add a guard at the top of each dependent test that checks for the file's existence and skips with a descriptive message if absent:

```js
test('migrate-species: species.csv has required columns', () => {
  if (!existsSync(resolve(ROOT, 'data/species.csv'))) {
    // Use skip() or throw a skip signal depending on node:test version
    console.warn('Skipping: data/species.csv not found — run test 2 first');
    return;
  }
  validateCsv(resolve(ROOT, 'data/species.csv'), [...]);
});
```

**Fix 2 (migration stderr):** In test 2, wrap `execSync` to surface migration errors:

```js
try {
  execSync('node scripts/migrate-species.js', { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
} catch (err) {
  throw new Error(`Migration failed:\n${err.stderr?.toString() ?? err.message}`);
}
```

---

## Info

### IN-01: Hardcoded absolute paths in default constants

**File:** `scripts/migrate-species.js:25-27`

**Issue:** `DEFAULT_DUMP_PATH` and `DEFAULT_SPECIESIMAGE_CSV` are hardcoded to `/Users/rainhead/dev/...`. Anyone running the script without setting `DUMP_PATH` and `SPECIESIMAGE_CSV` env vars will hit a confusing "dump not found" error (at least it exits non-zero) or silently fall back to dump-only slug resolution for the speciesimage CSV. Suitable for a one-person project but worth flagging for future contributors.

**Fix:** Document the required env vars in the usage block and/or in a `.env.example` file. The `process.exit(1)` guard for the missing dump is already correct. Consider adding a similar hard-fail for the speciesimage CSV if slug coverage is critical.

---

### IN-02: `linked_photo` inverse semantics not commented at filter site

**File:** `scripts/migrate-species.js:400`

**Issue:** The filter `r.linked_photo === '0'` excludes records that *are* linked photos (value `'1'`), keeping only "real" occurrence records. The field name `linked_photo` with value `'0'` meaning "keep this record" is counterintuitive. The column comment at line 265 explains the schema but the filter at the point of use does not.

**Fix:** Add an inline comment at the filter:

```js
const pnwRecords = allRecords.filter(
  // linked_photo='1' means the record is a photo reference, not an occurrence — exclude those
  r => r.linked_photo === '0' && r.state_id && PNW_STATE_IDS.has(r.state_id)
);
```

---

### IN-03: `extractCmsTaxonomy` regex does not handle escaped quotes in CMS title fields

**File:** `scripts/migrate-species.js:167`

**Issue:** The regex for fields 3 and 4 (`'[^']*'`) does not handle escaped quotes (`\'`) within those values, unlike other parsers in this file. Since these fields are CMS title and metadata strings (not taxonomy paths), any escaped single quote would cause the regex to fail to match that row. The taxonomy path (field 5) is the critical one and it uses the URL-safe `browse/family-...` format that won't contain quotes. Low practical risk but inconsistent.

**Fix:** Use the same `(?:[^'\\]|\\.)*` pattern for fields 3 and 4, consistent with the rest of the parsers in this file.

---

### IN-04: `parseIdValue` does not unescape `\n`, `\t`, or `\r`

**File:** `scripts/migrate-species.js:109`

**Issue:** Only `\'` and `\\` are unescaped. MySQL dumps may encode newlines as `\n` in string literals. For author and collector names this is very unlikely but could produce literal `\n` characters in the output CSV. `parseSpeciesRecord` does handle `\n` → space (line 274), so there is a pattern inconsistency.

**Fix:** Add `\n` and `\r` handling to the `replace` chain, or use a shared `unescapeMySQLString` helper:

```js
function unescapeMySQLString(s) {
  return s
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, '');
}
```

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
