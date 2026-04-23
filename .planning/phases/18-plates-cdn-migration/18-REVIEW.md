---
phase: 18-plates-cdn-migration
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - data/plates.json
  - scripts/copy-plates.js
  - scripts/upload-plates.js
  - src/_data/plates.js
  - src/plates/index.njk
  - src/plates/plate.njk
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the plates CDN migration files: the static data manifest (`data/plates.json`), two build scripts (`copy-plates.js`, `upload-plates.js`), the Eleventy data module (`src/_data/plates.js`), and two Nunjucks templates (`index.njk`, `plate.njk`). Overall the code is well-structured with clear error handling and a sensible CDN URL pattern. One security issue was found: the Bunny.net API key is exposed in error output when `upload-plates.js` exhausts retries. Two logic warnings were identified around the manifest sort and a redundant `parseDirName` call. Two low-priority info items round out the findings.

## Critical Issues

### CR-01: Bunny.net API key leaked to stderr on persistent upload failure

**File:** `scripts/upload-plates.js:105-127`

**Issue:** When `curl` fails and all 5 retry attempts are exhausted, `execFileSync` throws an `Error` whose `.message` contains the full command line, including the literal `AccessKey: <BUNNY_API_KEY>` header value. This error propagates to `main().catch`, which logs `err.message` to stderr via `console.error`. Confirmed empirically: `err.message` is `"Command failed: curl … -H AccessKey: MYSECRET …"`.

```js
// current — leaks key on persistent failure
} catch (err) {
  attempts++;
  if (attempts >= 5) throw err;   // err.message contains the full CLI including the key
  ...
}
// later:
main().catch(err => {
  console.error(err.message);     // prints: "Command failed: curl -H AccessKey: abc123 ..."
  process.exit(1);
});
```

**Fix:** Sanitize the error message before logging, or catch the unredacted error locally:

```js
// In the retry block — replace the terminal rethrow:
if (attempts >= 5) {
  throw new Error(`Upload failed for ${rel} after 5 attempts: ${err.status ?? 'unknown error'}`);
}

// Or in main().catch — strip the key from the message:
main().catch(err => {
  const safe = err.message.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]');
  console.error(safe);
  process.exit(1);
});
```

## Warnings

### WR-01: `manifest.sort` in `copy-plates.js` has no secondary key, unlike `plates.js`

**File:** `scripts/copy-plates.js:140`

**Issue:** The manifest sort uses only `parseInt(a.number, 10) - parseInt(b.number, 10)`. Plates `"0"` and `"00"` both parse to `0`, so their relative order is determined by stable-sort insertion order (Map iteration order, which depends on `readdir` filesystem ordering). The Eleventy data module `src/_data/plates.js:205-208` uses a secondary `a.family.localeCompare(b.family)` tiebreaker, which would consistently place `"00": "Commonly Reported Moths 1"` before `"0": "Commonly Reported Moths 2"`. The two sorts can produce different orderings of these two plates, causing `data/plates.json` to have a different sequence than the live data path. While the current `data/plates.json` happens to have `0` before `00` (matching the family alphabetical order only by coincidence of filesystem ordering), this is fragile.

**Fix:** Add the same secondary sort key to `copy-plates.js`:

```js
// copy-plates.js line 140 — match the secondary sort in plates.js
manifest.sort((a, b) => {
  const n = parseInt(a.number, 10) - parseInt(b.number, 10);
  return n !== 0 ? n : a.family.localeCompare(b.family);
});
```

### WR-02: `parseDirName` called twice on the same `dirName` in `copy-plates.js`

**File:** `scripts/copy-plates.js:135-137`

**Issue:** Inside the main loop, `parseDirName(dirName)` is called at line 135 to recover `parsed.family` for the manifest entry. However, the `dirName` was already parsed during the deduplication pass (line 69), and only `number` was retained in `toProcess` (not `family`). If `parseDirName` ever returns `null` for a previously-accepted `dirName` (which should not happen given consistent input, but is defensively possible), the subsequent `parsed.family` access at line 137 would throw a `TypeError: Cannot read properties of null`.

**Fix:** Store `family` alongside `number` in the `toProcess` map:

```js
// Line 77 — include family in the stored value
toProcess.set(slug, { dirName: dir.name, number: parsed.number, family: parsed.family });

// Line 137 — use stored family instead of re-parsing
manifest.push({ number, family, slug, width, height });
// (remove the redundant parseDirName call at line 135)
```

## Info

### IN-01: Dry-run output in `upload-plates.js` shows storage zone URL, not CDN pull zone URL

**File:** `scripts/upload-plates.js:71`

**Issue:** The dry-run preview prints `https://la.storage.bunnycdn.com/pnwmoths/plates/...` (the storage endpoint used for PUT operations). The actual CDN URL served to browsers is `https://pnwmoths.b-cdn.net/plates/...`. This is potentially confusing when verifying the dry-run output against the expected CDN paths in templates.

**Fix:** Add a comment clarifying the distinction, or print the equivalent CDN URL alongside the storage URL:

```js
console.log(`  UPLOAD -> ${url}`);
console.log(`  CDN    -> https://pnwmoths.b-cdn.net/plates/${rel}`);
```

### IN-02: `src/_data/plates.js` is dead code when `data/plates.json` exists

**File:** `src/_data/plates.js:17-19`

**Issue:** The live data path (reading from `PLATES_Z_SOURCE` directory) is only reachable when `DEFAULT_SOURCE` exists at `/Users/rainhead/dev/pnwinsects-app/…`. In CI and in standard development (where `data/plates.json` is committed), execution always follows the manifest-read path. The full `readdir` + `readDimensions` + deduplication logic in `plates.js` (lines 169-210) is unreachable in practice. This is not a bug, but represents significant dead code that adds maintenance surface.

**Fix:** No immediate action required. Consider documenting the live path as "local-only developer tooling" in a comment, or removing it once `copy-plates.js` is the sole manifest generator.

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
