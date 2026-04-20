---
phase: 09-build-pipeline-extension
plan: "02"
subsystem: build-pipeline
tags: [duckdb, eleventy-data, tdd, taxonomy, navImages]
dependency_graph:
  requires: [09-01]
  provides: [taxon-js-data-file, family-subfamily-genus-species-tree]
  affects: [src/_data/taxon.js, scripts/build-data.test.js]
tech_stack:
  added: []
  patterns: [duckdb-two-query-strategy, null-sentinel-pattern, navImages-rollup]
key_files:
  created:
    - src/_data/taxon.js
  modified:
    - scripts/build-data.test.js
decisions:
  - "Two-query strategy (separate species + images runAndReadAll calls, no JOIN) avoids species row inflation per 09-RESEARCH.md Pitfall 5"
  - "Sentinel '__none__' used as internal map key for null-subfamily genera; exposed as name: null in output"
  - "conn.closeSync() called before all JS tree-building — both runAndReadAll results already materialized"
metrics:
  duration: "1m 33s"
  completed: "2026-04-20"
  tasks_completed: 2
  files_changed: 2
---

# Phase 09 Plan 02: taxon.js Summary

DuckDB two-query strategy builds a family → subfamily → genus → species tree with navImages rolled up at each level (navigational-first, weight ascending, capped at 4); null-subfamily genera exposed with `name: null` via `'__none__'` sentinel key.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Write failing tests for taxon.js tree structure | 1e1e3b9 | scripts/build-data.test.js |
| 2 (GREEN) | Create src/_data/taxon.js | 2c41358 | src/_data/taxon.js |

## TDD Gate Compliance

RED gate: `test(09-02): add failing RED tests for taxon.js tree structure` (1e1e3b9) — Tests D, E, F all fail with "Cannot find module". Prior 16 tests in build-data.test.js green (42 total via npm test). Exit code non-zero confirmed.

GREEN gate: `feat(09-02): add taxon.js Eleventy data file with family→subfamily→genus→species tree` (2c41358) — All 45 tests pass (16 in build-data.test.js + 26 others via npm test).

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
npm test
# tests 45 / pass 45 / fail 0

node -e "import('./src/_data/taxon.js').then(m => m.default()).then(t => { ... })"
# Families: 6
# First family: Drepanidae
# Subfamilies: 1
# First subfamily name: null
# NavImages (family): 0

Null-subfamily groups: 6

Max navImages per genus: 4 (must be <= 4)
```

## Known Stubs

None — `src/_data/taxon.js` queries real `data/species.csv` and `data/images.csv` via DuckDB. The current dataset has ~10 species with no navigational-flagged images (navImages populated only for species that have images in images.csv; families/subfamilies show 0 navImages when no images exist for their genera). This is correct behavior — not a stub.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. T-09-04 through T-09-07 reviewed:
- T-09-05 (DuckDB connection leak): mitigated — `conn.closeSync()` present at line 78, before tree-building
- T-09-06 (sentinel leaking into output): mitigated — `'__none__'` key used only in `subfamilyMap`; output nodes use `name: row.subfamily ?? null`

## Self-Check: PASSED

- src/_data/taxon.js: FOUND
- scripts/build-data.test.js: FOUND (modified)
- Commit 1e1e3b9: FOUND (RED)
- Commit 2c41358: FOUND (GREEN)
- npm test: 45/45 passing
