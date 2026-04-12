---
phase: 04-search-glossary-and-validation
fixed_at: 2026-04-12T00:00:00Z
review_path: .planning/phases/04-search-glossary-and-validation/04-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-04-12
**Source review:** .planning/phases/04-search-glossary-and-validation/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: `glossary.csv` image filenames are not validated against the safe-filename pattern

**Files modified:** `scripts/build-data.js`
**Commit:** 07ba873
**Applied fix:** Replaced the discarded `validateCsv('data/glossary.csv', ...)` call with an assignment to `glossaryRows`, then added a loop that throws if any non-empty `image_filename` value fails the `^[a-zA-Z0-9._-]+$` pattern — matching the existing check applied to `images.csv`.

---

### WR-02: `<link>` stylesheet placed in page body, not `<head>`

**Files modified:** `src/_includes/base.njk`, `src/search/index.njk`
**Commit:** 15958d0
**Applied fix:** Added a conditional `<link rel="stylesheet" href="/pagefind/pagefind-ui.css">` inside `<head>` in `base.njk`, gated on `{% if pagefindUi %}`. Added `pagefindUi: true` to `search/index.njk` front matter and removed the inline `<link>` from the page body.

---

### WR-03: DuckDB instance (`db`) never closed in `src/_data/glossary.js`

**Files modified:** `src/_data/glossary.js`
**Commit:** 755673c
**Applied fix:** Added `db.closeSync()` immediately after `conn.closeSync()`. Confirmed via runtime inspection that `DuckDBInstance` exposes `closeSync()` (not an async `close()`), so the synchronous call is correct.

---

### WR-04: `check-page-weight.js` crashes with unhandled ENOENT if `SITE_DIR` does not exist

**Files modified:** `scripts/check-page-weight.js`
**Commit:** 4080a0f
**Applied fix:** Added `existsSync` to the `node:fs` import and inserted a guard block before `walkHtml(SITE_DIR)` that prints a diagnostic error message and exits with code 1 if the directory does not exist.

---

_Fixed: 2026-04-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
