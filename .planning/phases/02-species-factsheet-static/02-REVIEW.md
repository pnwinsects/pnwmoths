---
phase: 02-species-factsheet-static
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - data/images.csv
  - src/_data/images.js
  - src/_includes/base.njk
  - src/search/index.njk
  - src/glossary/index.njk
  - data/species.csv
  - scripts/build-data.js
  - scripts/build-data.test.js
  - src/_data/species.js
  - src/species/species.njk
  - eleventy.config.js
  - package.json
  - src/_data/families.js
  - src/browse/index.njk
  - src/browse/genus.njk
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

This phase introduces the species factsheet static site: DuckDB-backed data pipelines, an Eleventy build, browsing/genus pages, and a per-species template. The code is generally well-structured with good preflight validation and path-traversal guards. Three warnings and three info items were found; no critical security or data-loss issues exist.

The most impactful bug is a slug inconsistency between `species.js` and `build-data.js`: species with spaces in their genus or species names would generate mismatched URLs and Parquet directory paths. The current species data has no spaces, so it does not manifest yet, but the `validateSlugComponent` regex explicitly permits spaces, making this a latent bug.

## Warnings

### WR-01: Slug formula omits space-to-hyphen replacement in `species.js` and `families.js`

**File:** `src/_data/species.js:37` and `src/_data/families.js:35`

**Issue:** Both files compute a species slug in DuckDB as `lower(genus || '-' || species)` without replacing spaces with hyphens. The pre-build script `build-data.js` constructs the Parquet output directory with `.replace(/\s+/g, '-')` (line 190). If a genus or species name contains a space, the URL emitted by Eleventy will contain a literal space while the Parquet directory name will use a hyphen, producing a broken link. The `validateSlugComponent` regex (`[a-zA-Z0-9 ]+`) deliberately permits spaces, so this is a reachable path.

**Fix:** Replace the DuckDB slug expression with one that mirrors `build-data.js`:

```sql
-- species.js line 37, families.js line 35
lower(replace(genus, ' ', '-') || '-' || replace(species, ' ', '-')) AS slug
```

This matches the formula already used for `genus_slug` in `families.js` line 27.

---

### WR-02: DuckDB connections are not closed on error in Eleventy data files

**File:** `src/_data/species.js:3-49`, `src/_data/images.js:3-37`, `src/_data/families.js:3-59`

**Issue:** All three Eleventy data functions connect to DuckDB but call `conn.closeSync()` only on the happy path. If `conn.run()` or `conn.runAndReadAll()` throws, the connection is leaked. For an in-memory DuckDB this is not a crash, but the connection handle is never released and could interfere with subsequent builds or test runs that reuse the process.

**Fix:** Wrap the body in a `try/finally` block:

```js
const conn = await db.connect();
try {
  // ... run queries ...
  return rows;
} finally {
  conn.closeSync();
}
```

---

### WR-03: Integration test assumes `data/records.csv` exists without setup

**File:** `scripts/build-data.test.js:70-83`

**Issue:** The "good CSV" integration test (line 72) runs `node scripts/build-data.js` directly against the live project data directory, which requires `data/records.csv` to exist. The file is not created or cleaned up by the test, and it is not present among the reviewed data files. If a fresh checkout omits `records.csv`, this test will exit non-zero with an opaque "Cannot read data/records.csv" error rather than a clear test failure. The test also writes Parquet files to `data/parquet/` as a side effect of a unit-test run, which is unexpected for a test suite.

**Fix:** Either commit a minimal `data/records.csv` fixture alongside the test, or refactor the integration test to use the same `tmpDir` isolation strategy employed by the bad-data test (lines 86-127). At minimum, document the prerequisite with an assertion or skip guard:

```js
import { existsSync } from 'node:fs';
// At top of integration block:
if (!existsSync(resolve(ROOT, 'data/records.csv'))) {
  test.skip('data/records.csv not present — skipping integration test');
}
```

---

## Info

### IN-01: Similar species links display raw slug instead of human-readable name

**File:** `src/species/species.njk:47`

**Issue:** The similar species list renders the raw slug string as the link text (e.g., `acronicta-americana`) rather than the species' common or scientific name. This is the only data available in the template at render time since `similar_slugs` is an array of strings.

**Fix:** To display a proper name, either join the similar-species slugs to the full species data in `species.js` (returning an array of objects instead of strings), or look up the name in the template using Eleventy's `collections` or a cross-reference filter. A minimal improvement would be to capitalise and replace hyphens: `{{ slug | replace("-", " ") | capitalize }}`, though a proper join is preferable.

---

### IN-02: `fileExists` filter resolves paths relative to `process.cwd()` with no guard

**File:** `eleventy.config.js:11`

**Issue:** `resolve(relativePath)` with a single argument resolves relative to `process.cwd()`. The template passes `"src/content/species/" + sp.slug + ".md"`. This works correctly only when Eleventy is invoked from the project root (the normal case), but will silently find or miss files if invoked from a different directory. There is no validation that the resolved path stays within the project tree.

**Fix:** Anchor the resolution to the config file's own directory:

```js
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

eleventyConfig.addFilter("fileExists", function (relativePath) {
  return existsSync(resolve(__dirname, relativePath));
});
```

---

### IN-03: Build-only dependencies listed under `dependencies` instead of `devDependencies`; `.nvmrc` absent

**File:** `package.json`

**Issue:** `csv-parse` and `@duckdb/node-api` are build-time tools used only in `scripts/build-data.js` and the Eleventy data files that run at build time. They are listed under `dependencies` rather than `devDependencies`, which would bloat a production install if this package were ever published or deployed (it is `"private": true` today, so impact is minimal). Additionally, per project conventions (CLAUDE.md), a `.nvmrc` file should specify the Node.js version at the project root; none was found.

**Fix:** Move `csv-parse`, `@duckdb/node-api`, and (optionally) `@11ty/eleventy` to `devDependencies`. Add a `.nvmrc` file containing the target Node.js version (e.g., `22`).

---

_Reviewed: 2026-04-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
