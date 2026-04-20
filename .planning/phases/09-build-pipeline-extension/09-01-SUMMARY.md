---
phase: 09-build-pipeline-extension
plan: "01"
subsystem: build-pipeline
tags: [duckdb, build-script, json-emit, tdd]
dependency_graph:
  requires: []
  provides: [species-states-json, build-species-states-npm-step]
  affects: [package.json, scripts/build-data.test.js]
tech_stack:
  added: []
  patterns: [duckdb-select-distinct, import-meta-url-guard, post-vite-file-write]
key_files:
  created:
    - scripts/emit-species-states.js
  modified:
    - scripts/build-data.test.js
    - package.json
decisions:
  - "Use JSON (not Parquet) for species-state distribution — 29 pairs is ~1 KB, no hyparquet overhead needed"
  - "Build chain position: after build:copy-images (post-Vite), before build:pagefind"
metrics:
  duration: "1m 37s"
  completed: "2026-04-20"
  tasks_completed: 2
  files_changed: 3
---

# Phase 09 Plan 01: emit-species-states.js Summary

DuckDB DISTINCT query on `data/records.csv` writes `_site/species-states.json` with 29 species-state pairs; wired into build chain via `npm run build:species-states` after `build:copy-images`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Write failing tests for emit-species-states.js | 2e94648 | scripts/build-data.test.js |
| 2 (GREEN) | Create emit-species-states.js and update package.json | 83d5e04 | scripts/emit-species-states.js, package.json, scripts/build-data.test.js |

## TDD Gate Compliance

RED gate: `test(09-01): add failing RED tests for emit-species-states` (2e94648) — Tests A and B passed (in-memory DuckDB); Test C failed (script not yet created). Exit code non-zero confirmed.

GREEN gate: `feat(09-01): add emit-species-states.js and build:species-states npm step` (83d5e04) — All 42 tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `readFileSync` in test file imports**
- **Found during:** Task 2 (GREEN) — test C threw `ReferenceError: readFileSync is not defined`
- **Issue:** The plan specified using `readFileSync` in Test C but the test file's existing `node:fs` import did not include it
- **Fix:** Added `readFileSync` to the existing destructured import on line 5 of `build-data.test.js`
- **Files modified:** scripts/build-data.test.js
- **Commit:** 83d5e04 (included in GREEN commit)

**Note:** The plan states "39 prior tests + 3 new = 42 total" — this is correct when running `npm test` (which includes `scripts/check-page-weight.test.js` and `src/components/*.test.js`). Running `build-data.test.js` alone shows 16 tests (13 prior + 3 new).

## Verification Results

```
node scripts/emit-species-states.js
# Wrote 29 species-state pairs to _site/species-states.json

node -e "const d=JSON.parse(require('fs').readFileSync('_site/species-states.json','utf8')); console.log(d.length, Object.keys(d[0]))"
# 29 [ 'species_slug', 'state' ]

npm test
# tests 42 / pass 42 / fail 0
```

## Known Stubs

None — `_site/species-states.json` is fully wired from real `data/records.csv` via DuckDB DISTINCT query.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The threat model in the plan (T-09-01 through T-09-03) was reviewed; all dispositions are `accept` or covered by existing build chain ordering.

## Self-Check: PASSED

- scripts/emit-species-states.js: FOUND
- scripts/build-data.test.js: FOUND (modified)
- package.json: FOUND (modified)
- Commit 2e94648: FOUND (RED)
- Commit 83d5e04: FOUND (GREEN)
- _site/species-states.json: FOUND (29 entries, correct shape)
