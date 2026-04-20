---
phase: 10-browse-shell-page
plan: "01"
subsystem: browse
tags: [eleventy, nunjucks, custom-element, noscript, pagefind, taxonomy]
dependency_graph:
  requires: [09-build-pipeline-extension]
  provides: [browse-shell-page, taxon-json-embed, noscript-fallback]
  affects: [_site/browse/index.html]
tech_stack:
  added: [tojson filter (JSON.stringify), createRequire for package path resolution]
  patterns: [script[type=application/json] data embed, unregistered custom element placeholder, noscript static fallback]
key_files:
  created: []
  modified:
    - src/browse/index.njk
    - eleventy.config.js
    - scripts/copy-images.js
    - src/_data/species.js
  deleted:
    - src/browse/genus.njk
    - src/_data/families.js
decisions:
  - "JSON embed via <script type=application/json id=taxon-data> (not data- attribute) as specified in D-01"
  - "tojson filter registered in eleventy.config.js using JSON.stringify — was not a Nunjucks built-in despite CONTEXT.md claim"
  - "Pico CSS restored post-Vite via createRequire path resolution in copy-images.js"
metrics:
  duration: "3m 47s"
  completed: "2026-04-20"
  tasks_completed: 2
  files_changed: 6
---

# Phase 10 Plan 01: Browse Shell Page Summary

**One-liner:** Rewrote `/browse/` as a single Eleventy page embedding the full taxonomy tree as JSON, mounting an unregistered `<pnwm-taxon-browser>` custom element, and rendering a 4-level `<noscript>` static listing; retired per-genus pagination template and families.js data file.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Delete retired files and rewrite browse/index.njk | b77ab66 | src/browse/index.njk (rewrite), src/browse/genus.njk (delete), src/_data/families.js (delete) |
| 2 | Build verification — confirm output correct, per-genus pages gone | 8a1d81f | eleventy.config.js, scripts/copy-images.js, src/_data/species.js |

## Files Created / Deleted

**Rewritten:**
- `src/browse/index.njk` — new browse shell template (was 14-line old template using `families` data)

**Deleted:**
- `src/browse/genus.njk` — per-genus pagination template (retired; no longer produces `_site/browse/{genus}/` pages)
- `src/_data/families.js` — old DuckDB data file for browse (retired; `taxon.js` is now the sole taxonomy source)

## Build Verification Results

```
npm run build  → exit 0
_site/browse/index.html  → EXISTS (11.11 kB)
ls _site/browse/  → index.html  (no genus subdirectories)
grep -c taxon-data _site/browse/index.html  → 1
grep -c pnwm-taxon-browser _site/browse/index.html  → 1
grep -c data-pagefind-ignore _site/browse/index.html  → 3 (nav + script element + noscript element)
lychee link check  → 165 Total, 143 OK, 0 Errors, 22 Excluded
npm test  → 45/45 passing (0 failures)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tojson` filter not registered in Nunjucks**
- **Found during:** Task 2 (first build attempt)
- **Issue:** `src/browse/index.njk` used `{{ taxon | tojson }}` but `tojson` is not a Nunjucks built-in filter. CONTEXT.md incorrectly stated it was "confirmed available". Build failed with "filter not found: tojson".
- **Fix:** Registered `tojson` filter in `eleventy.config.js` using `JSON.stringify`.
- **Files modified:** `eleventy.config.js`
- **Commit:** 8a1d81f

**2. [Rule 1 - Bug] `src/_data/species.js` missing `subfamily` column in read_csv schema**
- **Found during:** Task 2 (first build attempt)
- **Issue:** `species.csv` gained a `subfamily` column in Phase 8 but `species.js` still declared an 8-column schema. DuckDB's sniffer detected 9 columns, causing a fatal mismatch error. Build failed with "Invalid Input Error: columns contain 8 columns. It does not match the number of columns found by the sniffer: 9".
- **Fix:** Added `'subfamily': 'VARCHAR'` to the columns map and `nullstr = ''` to the read_csv call (consistent with Phase 8/9 pattern).
- **Files modified:** `src/_data/species.js`
- **Commit:** 8a1d81f

**3. [Rule 3 - Blocking] Pico CSS missing from `_site/` after Vite build wipe**
- **Found during:** Task 2 (second build attempt)
- **Issue:** `eleventy-plugin-vite` wipes `_site/` during its build phase. Eleventy's passthrough copy of `pico.min.css` → `_site/css/pico.min.css` did not survive. The `copy-images.js` post-Vite restoration script copied images and theme CSS but not Pico CSS. Lychee link checker reported 15 errors (one per HTML page) for the missing `/css/pico.min.css` file.
- **Fix:** Added Pico CSS copy to `scripts/copy-images.js` using `createRequire(import.meta.url)` to resolve the installed package path — necessary because the worktree has no local `node_modules/` and `resolve('node_modules/...')` would use the worktree CWD.
- **Files modified:** `scripts/copy-images.js`
- **Commit:** 8a1d81f

## data-pagefind-ignore Confirmation

Both threat mitigations confirmed present in `_site/browse/index.html`:
- T-10-01: `<script type="application/json" id="taxon-data" data-pagefind-ignore>` — JSON taxonomy excluded from Pagefind index
- T-10-02: `<noscript data-pagefind-ignore>` — static listing excluded from Pagefind index

Count of `data-pagefind-ignore` in built HTML: **3** (nav element from base.njk + script element + noscript element).

## Known Stubs

None — the browse shell page embeds real taxonomy data from `taxon.js` (DuckDB-sourced), not placeholder values. The `<pnwm-taxon-browser>` element is intentionally unregistered in Phase 10 (Phase 11 registers it); the noscript block provides full static access for JS-off users.

## Threat Flags

None — all security-relevant surface (JSON embed, noscript listing, custom element placeholder) was covered by the plan's threat model (T-10-01 through T-10-05). No new trust boundaries introduced.

## Self-Check: PASSED

- `src/browse/index.njk` exists and contains required elements: CONFIRMED
- `src/browse/genus.njk` deleted: CONFIRMED (`test ! -f` exits 0)
- `src/_data/families.js` deleted: CONFIRMED (`test ! -f` exits 0)
- `_site/browse/index.html` exists: CONFIRMED
- Commits b77ab66 and 8a1d81f exist in git log: CONFIRMED
- 45/45 tests passing: CONFIRMED
- `npm run build` exits 0: CONFIRMED
