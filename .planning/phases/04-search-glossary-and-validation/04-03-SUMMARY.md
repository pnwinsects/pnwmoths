---
phase: 04-search-glossary-and-validation
plan: "03"
subsystem: build-pipeline
tags: [pagefind, search-indexing, lychee, link-validation, page-weight, state-validation, build-pipeline]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [full-build-pipeline, pagefind-index, link-validation, page-weight-check, state-validation]
  affects: [package.json, scripts/build-data.js]
tech_stack:
  added: [pagefind@1.5.2, lychee@0.23.0]
  patterns: [npm-script-chain, env-override-for-testing, duckdb-allowlist-validation]
key_files:
  created:
    - scripts/check-page-weight.js
    - scripts/check-page-weight.test.js
  modified:
    - scripts/build-data.js
    - scripts/build-data.test.js
    - package.json
    - package-lock.json
    - data/glossary.csv
decisions:
  - "check-page-weight.js uses process.env.SITE_DIR || '_site' to allow test override without dynamic import tricks"
  - "State allowlist: WA, OR, ID, BC, AB, MT — covers all PNW states/provinces; existing sample data (WA, OR only) passes"
  - "Removed non-existent antenna.jpg from glossary.csv sample data (lychee caught it; real images tracked via Git LFS)"
  - "lychee --offline flag: prevents any network requests during build, only internal links checked (D-10)"
  - "warn-only exit 0 for page weight: D-11 specifies warn-only; build should not fail for large pages"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 7
---

# Phase 4 Plan 03: Build Pipeline Wiring Summary

**One-liner:** Full 6-step build pipeline with Pagefind search indexing, lychee internal link validation (hard fail), 500KB page weight warning, and VALD-03 state allowlist validation added to build-data.js.

## What Was Built

**Task 1 — Page weight check + state validation:**
- `scripts/check-page-weight.js`: walks `_site/**/*.html`, warns on pages over 500KB (THRESHOLD_BYTES = 500 * 1024), exits 0 (warn-only per D-11). Uses `process.env.SITE_DIR || '_site'` for testability.
- `scripts/check-page-weight.test.js`: two behavioral tests — oversized page triggers WARNING, under-threshold page produces no WARNING. Both assert exit 0.
- `scripts/build-data.js`: added `invalid state values` entry to `validationChecks` array — DuckDB query finds any state NOT IN ('WA', 'OR', 'ID', 'BC', 'AB', 'MT') (VALD-03, D-12, hard fail).
- `scripts/build-data.test.js`: added VALD-03 state validation unit test — creates in-memory DuckDB table with WA (valid) and TX (invalid), asserts query returns exactly TX.

**Task 2 — Pagefind install + pipeline wiring:**
- Installed `pagefind@1.5.2` as devDependency
- Installed `lychee@0.23.0` via Homebrew
- Updated `package.json` scripts: added `build:pagefind`, `build:validate-links`, `build:check-weight`
- Extended `build` script to chain all 6 steps: `build:data && build:eleventy && build:copy-parquet && build:pagefind && build:validate-links && build:check-weight`
- Auto-fixed broken image reference in `data/glossary.csv` (see Deviations)

## Commits

| Task | Commit  | Description |
|------|---------|-------------|
| 1    | bf85351 | feat(04-03): add page weight check script and state validation |
| 2    | e566c8f | feat(04-03): install pagefind, wire build pipeline, fix broken glossary image ref |
| 3    | (human-verify) | Browser verification passed — search and glossary confirmed working |

## Verification

- `node --test scripts/build-data.test.js` — 8/8 tests pass (including new VALD-03 test)
- `node --test scripts/check-page-weight.test.js` — 2/2 tests pass
- `npm run build` — exits 0; all 6 steps complete:
  - build:data: 5 species Parquet files exported
  - build:eleventy: 14 HTML pages rendered
  - build:copy-parquet: Parquet files copied to _site/species/
  - build:pagefind: 13 pages indexed, 207 words, _site/pagefind/ created
  - build:validate-links: 94 links checked, 92 OK, 0 errors, 2 excluded
  - build:check-weight: all pages under 500KB threshold
- `_site/pagefind/pagefind-ui.js` and `_site/pagefind/pagefind-ui.css` exist
- `_site/search/index.html` and `_site/glossary/index.html` exist
- **Task 3 — Human browser verification (approved 2026-04-12):**
  - /search/ page: Pagefind widget renders, species name search returns results
  - /glossary/ page: terms displayed alphabetically with letter headings, navigation works
  - Observation: /browse/ page genus/family listings appear in search results when searching species names — this is expected behavior (genus names on /browse/ legitimately match species searches)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Broken image reference in glossary.csv caused lychee hard fail**
- **Found during:** Task 2 verification (`npm run build` — lychee step)
- **Issue:** `data/glossary.csv` had `antenna.jpg` as image_filename for the Antenna term, but no `/images/glossary/antenna.jpg` file exists in the project. Lychee reported ERROR on `_site/glossary/index.html`.
- **Fix:** Removed the `antenna.jpg` reference from `data/glossary.csv` (cleared to empty). Sample data should not reference non-existent images; real glossary images would be tracked via Git LFS.
- **Files modified:** `data/glossary.csv`
- **Commit:** e566c8f

## Known Stubs

None. The build pipeline is fully wired. Pagefind generates a real search index from built HTML. Lychee checks real links. Page weight checks real file sizes. State validation runs against real data.

The search page (Task 3) was verified by human in browser — search returns species results, glossary renders alphabetically.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Threats addressed:
- T-04-08: lychee `--offline` flag prevents network requests during build — verified (lychee output shows offline mode, 0 external requests)
- T-04-09: VALD-03 state validation uses hard-fail (`process.exit(1)` in validationFailed block) — already present in build-data.js; new check added to validationChecks array participates in that same hard-fail path

## Self-Check: PASSED

| Item | Status |
|------|--------|
| scripts/check-page-weight.js | FOUND |
| scripts/check-page-weight.test.js | FOUND |
| scripts/build-data.js contains 'invalid state values' | FOUND |
| scripts/build-data.test.js contains state validation test | FOUND |
| package.json contains build:pagefind | FOUND |
| package.json contains build:validate-links | FOUND |
| package.json contains build:check-weight | FOUND |
| _site/pagefind/pagefind-ui.js | FOUND |
| _site/pagefind/pagefind-ui.css | FOUND |
| _site/search/index.html | FOUND |
| _site/glossary/index.html | FOUND |
| commit bf85351 | FOUND |
| commit e566c8f | FOUND |
