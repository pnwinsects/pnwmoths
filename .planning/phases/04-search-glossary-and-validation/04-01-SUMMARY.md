---
phase: 04-search-glossary-and-validation
plan: "01"
subsystem: glossary
tags: [glossary, duckdb, eleventy, csv-validation]
dependency_graph:
  requires: []
  provides: [glossary-page, glossary-csv-validation]
  affects: [build-data-preflight]
tech_stack:
  added: []
  patterns: [duckdb-read-csv, eleventy-data-cascade, grouped-object-return]
key_files:
  created:
    - data/glossary.csv
    - src/_data/glossary.js
  modified:
    - scripts/build-data.js
    - scripts/build-data.test.js
    - src/glossary/index.njk
decisions:
  - "Return glossary as object keyed by letter (not flat array) to enable `for letter, terms in glossary` in Nunjucks"
  - "Use replace(term, ' ', '-') for slug generation instead of regexp_replace to avoid DuckDB regex assumption"
  - "Images referenced under /images/glossary/ prefix to avoid collision with species images"
  - "No safe filter applied to term/definition — Nunjucks auto-escapes by default (XSS prevention)"
metrics:
  duration: "96 seconds"
  completed: "2026-04-12"
  tasks_completed: 2
  files_changed: 5
---

# Phase 4 Plan 01: Glossary Data Pipeline and Page Summary

Glossary CSV data pipeline with DuckDB query returning terms grouped by first letter, pre-flight validation in build-data.js, and full Nunjucks template replacing the stub at /glossary/.

## What Was Built

- `data/glossary.csv` — source data with 5 sample terms (columns: term, definition, image_filename, photographer)
- `src/_data/glossary.js` — DuckDB data file reading glossary.csv, grouping terms by first letter into an object
- `scripts/build-data.js` — added `validateCsv('data/glossary.csv', ...)` call in pre-flight block
- `scripts/build-data.test.js` — added test for glossary.csv validation; fixed integration test to include glossary.csv in temp dir
- `src/glossary/index.njk` — full alphabetic glossary template with nav, dl/dt/dd, deep-link anchors, optional images

## Verification

1. `node --test scripts/build-data.test.js` — 7/7 tests pass
2. `npx @11ty/eleventy` — builds successfully, produces `_site/glossary/index.html`
3. `_site/glossary/index.html` contains `aria-label="Alphabetic index"`, 5 `id="term-"` anchors, 1 `/images/glossary/` reference

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Definition with commas caused CSV parse failure**
- **Found during:** Task 1 verification (`node --test scripts/build-data.test.js`)
- **Issue:** The Antenna definition "A paired segmented sensory appendage on the head of an insect used to detect touch, air motion, odor, and sound." contained commas, causing csv-parse to see 7 columns instead of 4
- **Fix:** Rewrote the definition without internal commas
- **Files modified:** data/glossary.csv
- **Commit:** 3c98fb2

**2. [Rule 3 - Blocking] Integration test failed after glossary.csv validation was added**
- **Found during:** Task 1 verification
- **Issue:** The "bad CSV" integration test creates a temp dir with copies of species.csv, images.csv and records-bad.csv but not glossary.csv — so after our change added glossary.csv validation before records.csv validation, the test errored with "Cannot read data/glossary.csv" instead of "Validation failed"
- **Fix:** Added `copyFileSync` for glossary.csv in the integration test setup
- **Files modified:** scripts/build-data.test.js
- **Commit:** 3c98fb2

## Known Stubs

None — all glossary terms are wired from CSV via DuckDB. The sample data is intentionally minimal (5 terms); production data population is out of scope for this plan.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes. The plan's threat model (T-04-01 through T-04-03) is fully addressed:
- T-04-01: validateCsv pre-flight checks UTF-8 and required columns for glossary.csv
- T-04-02: No `| safe` filter used on term/definition content
- T-04-03: Images rendered with fixed `/images/glossary/` prefix

## Self-Check: PASSED

| Item | Status |
|------|--------|
| data/glossary.csv | FOUND |
| src/_data/glossary.js | FOUND |
| src/glossary/index.njk | FOUND |
| _site/glossary/index.html | FOUND |
| commit 3c98fb2 | FOUND |
| commit ba25a9d | FOUND |
