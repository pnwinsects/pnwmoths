---
phase: 04-search-glossary-and-validation
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - data/glossary.csv
  - package.json
  - scripts/build-data.js
  - scripts/build-data.test.js
  - scripts/check-page-weight.js
  - scripts/check-page-weight.test.js
  - src/_data/glossary.js
  - src/_includes/base.njk
  - src/glossary/index.njk
  - src/search/index.njk
  - src/species/species.njk
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This phase introduced Pagefind-based search, a glossary page with alphabetic grouping, CSV validation improvements, a page-weight check script, and species page enhancements. The overall code quality is good: path traversal is guarded at the build stage for species slugs and image filenames in `images.csv`, DuckDB integration is solid, and the test coverage is appropriate for the scope.

Four warnings were found: an unvalidated `image_filename` field in `glossary.csv` (inconsistency with the validation applied to `images.csv`), a `<link>` stylesheet placed in page body content (causes FOUC and invalid HTML), unclosed DuckDB instance in the glossary data file, and no error handling when the page-weight script's target directory is absent. Three info items cover a missing explicit type for the `sp.id` interpolation into SQL, display quality for similar-species links, and a test glob that may miss subdirectory test files.

---

## Warnings

### WR-01: `glossary.csv` image filenames are not validated against the safe-filename pattern

**File:** `scripts/build-data.js:80`

`images.csv` filenames are validated against `^[a-zA-Z0-9._-]+$` (lines 76-78), which prevents path traversal and unexpected characters. The same validation is not applied to the `image_filename` column in `glossary.csv`. An entry with a value like `../admin.html` or `javascript:alert(1)` would be written directly into an `src` attribute in the glossary template (`src/glossary/index.njk:26`) with no further escaping.

**Fix:** After the existing `validateCsv('data/glossary.csv', ...)` call, add filename validation for any non-empty `image_filename` values, identical to the images.csv check:
```js
const glossaryRows = validateCsv('data/glossary.csv', ['term', 'definition', 'image_filename', 'photographer']);
for (const row of glossaryRows) {
  if (row.image_filename && !/^[a-zA-Z0-9._-]+$/.test(row.image_filename)) {
    throw new Error(
      `Invalid image_filename "${row.image_filename}" in glossary.csv — only alphanumeric, dots, hyphens, and underscores allowed.`
    );
  }
}
```
(The existing line 80 `validateCsv(...)` call can be replaced by this assignment — the return value was previously discarded.)

---

### WR-02: `<link>` stylesheet placed in page body, not `<head>`

**File:** `src/search/index.njk:7`

The Pagefind UI stylesheet is inserted as `<link href="/pagefind/pagefind-ui.css" rel="stylesheet">` at the top of the search page template. Because `base.njk` renders page content inside `<main>` (line 19), this `<link>` element ends up as a child of `<main>` in the final HTML. This is invalid per the HTML spec (link[rel=stylesheet] must be in `<head>`) and will cause a flash of unstyled content (FOUC) in browsers that tolerate it, or be outright ignored in strict parsers.

**Fix:** Move the stylesheet reference into `base.njk`'s `<head>` block, gated on a front-matter flag, or use Eleventy's `<head>` block injection mechanism. A pragmatic approach is to add a block in `base.njk`:
```html
<!-- base.njk <head> -->
{% if pagefindUi %}
  <link rel="stylesheet" href="/pagefind/pagefind-ui.css">
{% endif %}
```
And set `pagefindUi: true` in `search/index.njk`'s front matter. Alternatively, unconditionally include the stylesheet in `base.njk` since it is small and every page has a search link in the nav.

---

### WR-03: DuckDB instance (`db`) never closed in `src/_data/glossary.js`

**File:** `src/_data/glossary.js:33`

`conn.closeSync()` is called, but the `DuckDBInstance` (`db`) is never explicitly closed or destroyed. Depending on the `@duckdb/node-api` lifecycle, this may keep a native handle open for the duration of the Eleventy build process, or prevent clean shutdown. The pattern in `build-data.js` (line 215) also only calls `conn.closeSync()` without closing `db`, so this is a systemic gap.

**Fix:** After `conn.closeSync()`, call the appropriate `db` teardown method. Based on the `@duckdb/node-api` API:
```js
conn.closeSync();
await db.close(); // or db.closeSync() if available
```
If the `DuckDBInstance` does not expose a close method, document that explicitly so future maintainers know it is intentionally left to GC.

---

### WR-04: `check-page-weight.js` crashes with unhandled ENOENT if `SITE_DIR` does not exist

**File:** `scripts/check-page-weight.js:28`

`walkHtml(SITE_DIR)` calls `readdirSync(dir)` with no error handling. If `_site` does not exist (e.g., the script is run before the Eleventy build, or with a misconfigured `SITE_DIR`), Node.js will throw an unhandled `ENOENT` error with a full stack trace rather than a diagnostic message. Because `build:check-weight` is the last step in the `build` pipeline, this is low-risk in normal use, but could cause confusing failures in CI environments.

**Fix:**
```js
import { existsSync } from 'node:fs';

if (!existsSync(SITE_DIR)) {
  console.error(`[page-weight] ERROR: SITE_DIR "${SITE_DIR}" does not exist. Run the build first.`);
  process.exit(1);
}

walkHtml(SITE_DIR);
```

---

## Info

### IN-01: `sp.id` is interpolated directly into DuckDB SQL string

**File:** `scripts/build-data.js:204-208`

The COPY query uses template-literal interpolation: `` WHERE species_id = ${sp.id} ``. `sp.id` is retrieved from a prior DuckDB query against the typed `INTEGER` column, so in practice it will always be an integer. However, the pattern of string-interpolating values into SQL is fragile — if the column type ever changes or the value is coerced to a string unexpectedly, it would produce a syntax error or worse. Parameterized queries are not available for `COPY … TO` in DuckDB, but a cast guard would make the intent explicit.

**Fix:** Add an explicit integer coerce/assert before the interpolation:
```js
const id = Number(sp.id);
if (!Number.isInteger(id)) throw new Error(`Unexpected non-integer species id: ${sp.id}`);
// then use ${id} in the query
```

---

### IN-02: Similar species rendered as raw slugs in link text

**File:** `src/species/species.njk:69`

The similar species section renders `{{ slug }}` as the visible link text:
```html
<li><a href="/species/{{ slug }}/">{{ slug }}</a></li>
```
This displays machine slugs (e.g., `hyles-lineata`) to end users rather than a human-readable name. This is a display quality issue — the current data model for `sp.similar_slugs` may not carry display names, which would be a data model gap rather than a template bug.

**Fix:** If the data pipeline can resolve slugs to display names (e.g., `"Genus species"`) at build time, inject those into the similar_slugs array as objects: `{ slug, label }`. Otherwise, format the slug for display: replace hyphens with spaces and title-case.

---

### IN-03: `test` script glob may miss component tests in subdirectories

**File:** `package.json:15`

The test command is:
```
node --test scripts/build-data.test.js src/components/*.test.js
```

The glob `src/components/*.test.js` only matches top-level files in `src/components/`. Any test files placed in subdirectories (e.g., `src/components/map/*.test.js`) will be silently skipped.

**Fix:** Use a recursive glob or `--test` with the `--test-recursive` flag:
```
node --test scripts/build-data.test.js 'src/components/**/*.test.js'
```
Or pass a pattern with `--test`:
```
node --test --test-name-pattern='.*' scripts/ src/
```

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
