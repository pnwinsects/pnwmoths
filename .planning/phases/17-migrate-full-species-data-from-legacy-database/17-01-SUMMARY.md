---
phase: 17-migrate-full-species-data-from-legacy-database
plan: "01"
subsystem: testing
tags: [node-test, csv-parse, migration, smoke-tests, tdd]

# Dependency graph
requires:
  - phase: 17-migrate-full-species-data-from-legacy-database
    provides: "RESEARCH.md with Wave 0 requirements, VALIDATION.md, PATTERNS.md"
provides:
  - "scripts/migrate-species.test.js — 7 smoke tests for species data migration output"
  - "package.json test script updated to include migrate-species.test.js"
affects:
  - "17-02 (migration implementation must make these tests go GREEN)"
  - "17-03 (build:data integration depends on correct species.csv and records.csv)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED phase: write failing tests before implementation exists"
    - "execSync-based integration smoke test pattern from build-data.test.js"
    - "env-var override (DUMP_PATH) for controlling migration script input in tests"

key-files:
  created:
    - "scripts/migrate-species.test.js"
  modified:
    - "package.json"

key-decisions:
  - "Orphaned-slug validation omitted from smoke tests — image-filename-derived slugs vs genus+species slugs diverge for ~326 reclassified species; build:data DuckDB validation already catches this"
  - "Tests 3-7 depend on data written by test 2; node:test sequential ordering makes this safe without explicit test hooks"

patterns-established:
  - "Wave 0 test scaffold: create failing tests in Plan 01, implementation in Plan 02 (RED/GREEN split across plans)"

requirements-completed:
  - SC-1
  - SC-2
  - SC-4

# Metrics
duration: 2min
completed: 2026-04-22
---

# Phase 17 Plan 01: Migrate Full Species Data — Test Scaffold Summary

**7 integration smoke tests for species migration output, asserting row counts, required columns, PNW state codes, and lat/lon presence — RED state confirmed before migrate-species.js exists**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-22T18:07:43Z
- **Completed:** 2026-04-22T18:09:58Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `scripts/migrate-species.test.js` with 7 smoke tests covering all VALIDATION.md Wave 0 requirements
- Tests assert species.csv has >= 1,300 rows and records.csv has >= 3,000 rows after migration
- Tests assert required columns present in both output CSVs (via `validateCsv` from `build-data.js`)
- Tests assert no non-PNW state codes (WA/OR/ID/BC/AB/MT only) and no blank lat/lon values
- Added `migrate-species.test.js` to `package.json` test script
- RED state verified: `node --test scripts/migrate-species.test.js` exits 1 (tests 2 and 4 fail as expected)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migrate-species.test.js with failing smoke tests** - `073794e` (test)

**Plan metadata:** (committed with SUMMARY.md below)

## Files Created/Modified

- `scripts/migrate-species.test.js` — 7 smoke tests for SC-1, SC-2, SC-4 Wave 0 requirements
- `package.json` — "test" script updated to include `scripts/migrate-species.test.js`

## Decisions Made

- Omitted orphaned-slug validation from smoke tests: image-filename-derived slugs in records.csv vs genus+species slugs in species.csv diverge for ~326 reclassified species. A naive set comparison would produce false positives. The DuckDB `build:data` validation step already catches true orphaned slugs with correct slug handling. This is documented in the plan action and code comments.
- Tests 3–7 depend on data written by test 2 (integration run of migrate-species.js). `node:test` runs tests sequentially by default, so this ordering is safe without explicit `before`/`after` hooks.

## Deviations from Plan

None - plan executed exactly as written.

The worktree required an initial fast-forward merge from `main` (824953d → c1c964a) to bring in the Phase 17 planning files that were committed after the worktree was created. This is a worktree setup step, not a plan deviation.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Test scaffold complete in RED state; Plan 02 (migrate-species.js implementation) will make tests GREEN
- `scripts/migrate-species.test.js` is registered in `npm test`; full test suite will report failures until Plan 02 completes

## Self-Check

- [x] `scripts/migrate-species.test.js` exists
- [x] Task commit `073794e` exists
- [x] `node --test scripts/migrate-species.test.js` exits non-zero (RED)
- [x] `grep "rows.length >= 1300" scripts/migrate-species.test.js` matches
- [x] `grep "rows.length >= 3000" scripts/migrate-species.test.js` matches
- [x] `grep "PNW_STATES" scripts/migrate-species.test.js` matches
- [x] `grep "migrate-species.test.js" package.json` matches
- [x] `grep "csv-parse/sync" scripts/migrate-species.test.js` matches
- [x] `grep "validateCsv" scripts/migrate-species.test.js` matches

## Self-Check: PASSED

---
*Phase: 17-migrate-full-species-data-from-legacy-database*
*Completed: 2026-04-22*
