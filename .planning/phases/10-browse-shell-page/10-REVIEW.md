---
phase: 10-browse-shell-page
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/browse/index.njk
  - eleventy.config.js
  - scripts/copy-images.js
  - src/_data/species.js
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the browse shell page template, Eleventy config, post-build image copy script, and species data module. The template structure is sound: the `taxon` data variable is correctly resolved from `taxon.js` by filename convention, the noscript fallback iterates the same data and handles null subfamilies, and the `tojson` filter is safe — Nunjucks autoescape HTML-encodes the JSON, but `textContent` in the browser decodes entities before `JSON.parse`, making the round-trip correct and safe against `</script>` injection.

Two warnings: the DuckDB data files lack any error handling, so a missing CSV produces a cryptic stack trace instead of an actionable build error. The image copy script copies two source directories into the same destination in sequence, with no check that the first copy succeeded before the second runs. Two informational items: static imports appearing mid-file after `await` calls in `copy-images.js`, and the `pnwm-taxon-browser` custom element referenced in the template but not yet defined (expected for this phase).

## Warnings

### WR-01: DuckDB connections left open if CSV read fails

**File:** `src/_data/species.js:4-50` (also `src/_data/taxon.js:23-153`, `src/_data/images.js:3-41`)

**Issue:** All three data modules open a DuckDB connection and then call `conn.closeSync()` only at the end of the happy path. If `conn.run(CREATE TABLE ...)` or `conn.runAndReadAll(SELECT ...)` throws — for example, because `data/species.csv` is absent — `closeSync` is never called, leaving the connection open for the lifetime of the Eleventy process. The thrown error also surfaces as an opaque DuckDB exception rather than a message pointing to the missing file.

**Fix:**
```js
export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  try {
    await conn.run(`CREATE TABLE species AS SELECT * FROM read_csv('data/species.csv', ...)`);
    const result = await conn.runAndReadAll(`SELECT ...`);
    const rows = result.getRowObjectsJS();
    for (const row of rows) row.id = String(row.id);
    return rows;
  } catch (err) {
    throw new Error(`Failed to load species data: ${err.message}`);
  } finally {
    conn.closeSync();
  }
}
```

Apply the same `try/finally` pattern in `taxon.js` and `images.js`.

### WR-02: Sequential directory copies with no failure guard between them

**File:** `scripts/copy-images.js:17-26`

**Issue:** The script copies `images/` into `_site/images/` (line 19), then copies `src/images/` into the same `_site/images/` destination (line 25). If the first `cp` fails and throws, the `await` will propagate the rejection and the second copy is skipped — that part is fine. However, if `images/` does not exist at all (e.g., a fresh clone without Git LFS objects), `cp` throws `ENOENT` with a message about `images`, which is clear enough. The concern is the reverse: `src/images/` contains `header.png` and `images/` contains per-species subdirectories — both merge into `_site/images/`. This works today, but a future species slug named `header` would cause a species subdirectory named `header/` to be overwritten by (or overwrite) the `header.png` file from `src/images/`. The script has no guard against this.

**Fix:** Add a slug uniqueness check (or name the banner differently, e.g., `src/images/site/`) to make the two source trees structurally disjoint:

```js
// Option A: move banner to src/images/site/header.png -> _site/images/site/header.png
// Option B: explicit separate dest paths
const bannerDest = resolve('_site/images/_site');   // structurally separate
await cp(bannerSrc, bannerDest, { recursive: true });
```

Or at minimum add a comment documenting the invariant that slug names must not be `header`.

## Info

### IN-01: Static imports appear after top-level await statements

**File:** `scripts/copy-images.js:35-36`

**Issue:** `import { mkdir, copyFile }` and `import { createRequire }` appear at lines 35–36, after several `await cp(...)` calls. Static ES module imports are hoisted at parse time and resolved before any code in the module body executes, so there is no runtime error. However, the placement creates a false impression that these imports are lazy or ordered relative to the `await` calls. Readers may expect the imports to be unavailable on earlier lines.

**Fix:** Move all `import` declarations to the top of the file:

```js
import { cp, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
```

### IN-02: `pnwm-taxon-browser` custom element referenced but not yet defined

**File:** `src/browse/index.njk:12`

**Issue:** The template renders `<pnwm-taxon-browser></pnwm-taxon-browser>`, but no corresponding `customElements.define('pnwm-taxon-browser', ...)` exists anywhere in `src/components/`. The element also is not imported in `src/components/main.js`. The browser will render it as an unknown inline element with no behaviour.

This is expected for the current phase (the component is the next deliverable), but the `id="taxon-data"` script element that will feed the component is already in place. No action needed before the component is implemented; flagged for completeness.

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
