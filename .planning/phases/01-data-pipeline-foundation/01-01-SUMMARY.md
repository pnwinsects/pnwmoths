---
phase: 01-data-pipeline-foundation
plan: "01"
subsystem: database
tags: [duckdb, parquet, csv, node, eleventy, build-pipeline]

# Dependency graph
requires: []
provides:
  - ESM Node.js project scaffold with @duckdb/node-api, @11ty/eleventy, csv-parse
  - species.csv and records.csv stub data with correct schemas (DATA-01, DATA-02)
  - scripts/build-data.js: pre-flight CSV validation, DuckDB import, Parquet export
  - data/parquet/{slug}/records.parquet per-species output files
  - records-bad.csv validation test fixture
affects:
  - 01-02 (Eleventy data files and species page template depend on data/parquet/ output)
  - 01-03 (Client-side Parquet reading depends on file format and path convention)

# Tech tracking
tech-stack:
  added:
    - "@duckdb/node-api 1.5.1-r.2 — DuckDB Node Neo client (async-only)"
    - "@11ty/eleventy 3.1.5 — static site generator"
    - "csv-parse 6.2.1 — pre-flight CSV parsing and validation"
  patterns:
    - "ESM-first: package.json type:module, import syntax throughout"
    - "Guard main() behind import.meta.url check to allow named exports for tests"
    - "Pre-flight TextDecoder UTF-8 validation before DuckDB import"
    - "Per-species Parquet exported to data/parquet/{genus-species}/records.parquet"
    - "Slug generated as (genus+'-'+species).toLowerCase() — alphanumeric-only validated"
    - "DuckDB runAndReadAll() result: use .getRowObjectsJS() not .rows"
    - "DuckDB connection cleanup: conn.closeSync() not conn.close()"

key-files:
  created:
    - .nvmrc
    - package.json
    - data/species.csv
    - data/records.csv
    - data/records-bad.csv
    - scripts/build-data.js
    - scripts/build-data.test.js
    - .gitignore
  modified: []

key-decisions:
  - "Use data/parquet/{slug}/records.parquet (not _site/) as export target; Eleventy passthrough copy will handle deployment"
  - "DuckDB @duckdb/node-api API: getRowObjectsJS() for plain JS objects, closeSync() for cleanup"
  - "Slug components validated alphanumeric-only before use in file path (T-01-02)"
  - "node:test built-in runner used — no Jest/Vitest needed for a build pipeline"

patterns-established:
  - "Pattern 1: validateCsv() exported from build-data.js for unit testability without running full pipeline"
  - "Pattern 2: Integration tests use execSync with process.chdir wrapper to test pipeline with alternate data dirs"
  - "Pattern 3: DuckDB post-import validation queries (orphaned refs, invalid enums, OOB coords, NULLs)"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-05]

# Metrics
duration: 4min
completed: 2026-04-11
---

# Phase 1 Plan 01: Data Pipeline Foundation Summary

**CSV-to-DuckDB-to-Parquet build pipeline with pre-flight UTF-8 validation, explicit-schema import, and per-species Parquet export for 5 stub species**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-11T22:22:09Z
- **Completed:** 2026-04-11T22:26:30Z
- **Tasks:** 2 (Task 1: scaffold + data; Task 2: build script with TDD)
- **Files created:** 8

## Accomplishments

- Node 22 ESM project scaffold with correct dependencies (@duckdb/node-api, @11ty/eleventy, csv-parse)
- Stub CSV files with correct schemas for species (5 rows, 6 columns) and records (10 rows, 14 columns)
- `build-data.js`: pre-flight UTF-8 check, DuckDB import with explicit column types, 4 post-import validation queries, per-species Parquet export with slug-based paths
- All 5 tests pass via `npm test` (3 unit, 2 integration)
- `npm run build:data` produces 5 Parquet files in data/parquet/ (non-zero bytes each)

## Task Commits

Each task was committed atomically:

1. **Task 1: Project scaffold and stub CSV data** - `d06617c` (chore)
2. **Task 2 RED: Failing tests for validateCsv and integration** - `329d89b` (test)
3. **Task 2 GREEN: Implement build-data.js** - `d167732` (feat)

## Files Created/Modified

- `.nvmrc` - Node 22 LTS version pin
- `package.json` - ESM-first project manifest with build:data and test scripts
- `package-lock.json` - Dependency lock file
- `data/species.csv` - 5 stub species rows (id, genus, species, common_name, noc_id, authority)
- `data/records.csv` - 10 stub occurrence rows (14 columns)
- `data/records-bad.csv` - Validation test fixture (orphaned species ref, invalid_type, OOB coords)
- `scripts/build-data.js` - Pre-build pipeline: validate, import, validate, export Parquet
- `scripts/build-data.test.js` - Unit tests for validateCsv + integration tests for pipeline
- `.gitignore` - Excludes data/parquet/ (generated build output)

## Decisions Made

- **data/parquet/ as export target (not _site/)**: Decouples DuckDB script from Eleventy output directory. Eleventy passthrough copy handles deployment. This follows RESEARCH.md Pitfall 2 recommendation.
- **@duckdb/node-api actual API shape**: Research assumption A2 was wrong — `runAndReadAll()` does not return `{ rows: [...] }`. Actual API: call `.getRowObjectsJS()` on the result object for plain JS objects; call `conn.closeSync()` for cleanup. Verified by direct API inspection.
- **Slug component validation**: Added `validateSlugComponent()` to check genus/species contain only `[a-zA-Z0-9 ]` before generating file paths, implementing T-01-02 mitigation from the threat model.
- **node:test for test runner**: No Jest/Vitest install — Node 22 built-in `node:test` is sufficient for a build pipeline with no UI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected @duckdb/node-api result API shape**
- **Found during:** Task 2 GREEN (integration test failure)
- **Issue:** Research assumed `result.rows` array but actual API returns an object with methods. `runAndReadAll()` returns a result object; rows accessed via `.getRowObjectsJS()`. Connection closed via `conn.closeSync()` not `conn.close()`.
- **Fix:** Replaced all `result.rows` with `result.getRowObjectsJS()` and `conn.close()` with `conn.closeSync()`. Confirmed by direct Node REPL inspection of the package API.
- **Files modified:** scripts/build-data.js
- **Verification:** `npm test` passes all 5 tests
- **Committed in:** d167732 (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - API shape bug)
**Impact on plan:** Necessary correction — no scope creep. Research flagged A2 as an assumption to verify; it was wrong in practice.

## Issues Encountered

- `@duckdb/node-api` `runAndReadAll()` return shape differed from blog post documentation (assumption A2 in RESEARCH.md was flagged as low confidence). Resolved by inspecting the actual prototype methods via Node REPL.

## Known Stubs

The CSV data files contain 5 species and 10 records — representative enough to test the pipeline but not real production data. These are intentional stubs; real data will be added in a future content phase (out of scope for Phase 1).

## Threat Surface Scan

No new threat surface beyond what is documented in the plan's threat model. All T-01-01 through T-01-03 mitigations are implemented:
- T-01-01: Pre-flight UTF-8 validation + DuckDB strict mode + explicit column typing
- T-01-02: `validateSlugComponent()` enforces alphanumeric-only genus/species before slug/path use
- T-01-03: Accepted — species_id is INTEGER from typed column, no SQL injection vector

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- data/parquet/{slug}/records.parquet output format established and tested
- species.csv and records.csv schemas locked (DATA-01, DATA-02)
- build-data.js ready for integration into full build pipeline (pre-Eleventy step)
- Ready for Plan 01-02: Eleventy data files querying DuckDB + species page template

---
*Phase: 01-data-pipeline-foundation*
*Completed: 2026-04-11*
