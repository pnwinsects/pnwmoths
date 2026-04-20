---
phase: 09-build-pipeline-extension
reviewed: 2026-04-20T19:12:17Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - package.json
  - scripts/build-data.test.js
  - scripts/emit-species-states.js
  - src/_data/taxon.js
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-04-20T19:12:17Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files were reviewed: the new `emit-species-states.js` build step, the `taxon.js` Eleventy data function, additions to the shared test file, and `package.json`. The code is generally well-structured. No security vulnerabilities or data-loss bugs were found. Three warnings address correctness risks: a fragile cwd-relative path pattern shared by two new scripts, a potential shell-injection vector in the test harness, and a slug-computation inconsistency that could silently produce broken navImage URLs. Three info items cover minor code clarity and test coverage gaps.

## Warnings

### WR-01: cwd-relative DuckDB paths fail outside project root

**Files:** `scripts/emit-species-states.js:14`, `src/_data/taxon.js:29,48`

**Issue:** Both scripts pass bare relative paths like `'data/records.csv'` and `'data/species.csv'` directly to DuckDB's `read_csv`. DuckDB resolves these against `process.cwd()`, not the script's own directory. The scripts also use `resolve('_site')` (taxon.js: line 45 equivalent; emit-species-states.js: line 46) for output. This works when the project root is the cwd (Eleventy and the npm scripts guarantee this), but it produces an opaque DuckDB "file not found" error when a developer runs the script from any other directory. More critically, the integration test for `emit-species-states` at line 412 of `build-data.test.js` relies on this implicitly.

**Fix:** Derive an absolute path from `import.meta.url` and use it in `read_csv`:

```js
// At the top of emit-species-states.js and taxon.js
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Then in the DuckDB query:
await conn.run(`
  CREATE TABLE records AS
  SELECT * FROM read_csv('${ROOT}/data/records.csv', ...)
`);

const outPath = resolve(ROOT, '_site/species-states.json');
mkdirSync(resolve(ROOT, '_site'), { recursive: true });
```

---

### WR-02: Unquoted path in execSync risks shell word-splitting

**File:** `scripts/build-data.test.js:194,244`

**Issue:** The integration tests construct a shell command by string-interpolating an unquoted absolute path:

```js
execSync(`node ${wrapperScript}`, { cwd: tmpDir, ... })
```

`wrapperScript` is built with `resolve(ROOT, ...)`, so it inherits `ROOT`'s path. If the project is checked out under a directory containing a space (common on some developer machines, e.g. `~/My Projects/pnwmoths`), the shell splits the path at the space and `node` receives a truncated argument. The same pattern appears at line 244.

**Fix:** Quote the interpolated path:

```js
execSync(`node "${wrapperScript}"`, { cwd: tmpDir, timeout: 30000, stdio: 'pipe' });
```

---

### WR-03: genus_slug computation may not match species page URL slugs

**File:** `src/_data/taxon.js:67`

**Issue:** The genus slug is computed as:

```sql
lower(replace(genus, ' ', '-')) AS genus_slug
```

This replaces spaces with hyphens and lowercases the result, but leaves other characters (apostrophes, periods, accented letters) intact. If the species page URL generator uses a different or more aggressive slugification (e.g., stripping punctuation), the `genus_slug` stored in navImages objects will not match the actual URL, producing broken links silently. There is no test or assertion that `genus_slug` values correspond to real pages.

**Fix:** Ensure the genus slug formula matches the formula used in Eleventy page URLs exactly. If there is a shared `slugify` utility in the codebase, use it here. Add an assertion in the `taxon.js` tests that at least one genus slug can be resolved to an existing page path.

---

## Info

### IN-01: `row.subfamily ?? null` is a no-op after DuckDB nullstr

**File:** `src/_data/taxon.js:101`

**Issue:** With `nullstr = ''` in the DuckDB `read_csv` call, blank cells in `subfamily` are already returned as JavaScript `null` by `getRowObjectsJS()`. The expression `row.subfamily ?? null` therefore has no effect — `row.subfamily` is either a non-empty string or already `null`.

**Fix:** Simplify to `row.subfamily` (remove `?? null`). This makes the code clearer about what the DuckDB layer guarantees.

---

### IN-02: Integration test does not assert non-empty output

**File:** `scripts/build-data.test.js:411-423`

**Issue:** The integration test for `emit-species-states.js` checks that `species-states.json` is an array, but does not assert `data.length > 0`. A silent bug that produces an empty array (e.g., the DuckDB query filter accidentally excluding all rows) would pass this test.

**Fix:** Add:

```js
assert.ok(data.length > 0, 'species-states.json should contain at least one entry');
```

---

### IN-03: `navigational === 'true'` string comparison is undocumented

**File:** `src/_data/taxon.js:15`

**Issue:** The `navigational` column is stored as `VARCHAR` in DuckDB, so the sort comparator compares it as the string `'true'` rather than a boolean. This is correct given the schema declaration, but a future maintainer changing the column type to `BOOLEAN` would break the sort silently (the sort would always treat `navA` and `navB` as `1`, making all images equal priority).

**Fix:** Add a short comment explaining the intentional string type:

```js
// navigational is VARCHAR in the DB schema; 'true' string comparison is intentional
const navA = a.navigational === 'true' ? 0 : 1;
```

---

_Reviewed: 2026-04-20T19:12:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
