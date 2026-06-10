---
phase: 35-build-pipeline-scripts-migration
plan: "03"
subsystem: scripts/build-pipeline
tags: [typescript, migration, duckdb, parquet, schema-validation]
dependency_graph:
  requires: ["35-01"]
  provides: ["build-data.ts", "copy-parquet.ts", "copy-images.ts", "emit-species-states.ts", "check-page-weight.ts", "verifySampleParquetSchema"]
  affects: ["package.json", "src/_data/taxon.d.ts"]
tech_stack:
  added: []
  patterns: ["DuckDB DESCRIBE for column schema check (SCHEMA-04)", "noUncheckedIndexedAccess array destructuring guards", "top-level await preserved for copy scripts (Pitfall 4)", "declare .d.ts for untyped Eleventy JS data file"]
key_files:
  created:
    - scripts/build-data.ts
    - scripts/build-data.test.ts
    - scripts/copy-parquet.ts
    - scripts/copy-images.ts
    - scripts/emit-species-states.ts
    - scripts/check-page-weight.ts
    - scripts/check-page-weight.test.ts
    - src/_data/taxon.d.ts
  modified:
    - package.json
  deleted:
    - scripts/build-data.js
    - scripts/build-data.test.js
    - scripts/copy-parquet.js
    - scripts/copy-images.js
    - scripts/emit-species-states.js
    - scripts/check-page-weight.js
    - scripts/check-page-weight.test.js
decisions:
  - "D-06: build-time one-sample Parquet column-schema check via DuckDB DESCRIBE, fails build on mismatch"
  - "D-07: sample abagrotis-apposita (first alphabetical slug derived from sorted speciesRows)"
  - "D-08: reuse already-open DuckDB connection for SCHEMA-04 readback"
  - "D-11: build side consumes z.infer types only; no validator invocation in hot path"
  - "D-12: DuckDB typed read_csv + integrity SQL is the CSV gate; nullstr handling per 33 D-08"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-10"
  tasks_completed: 3
  tasks_total: 3
  files_created: 8
  files_modified: 1
  files_deleted: 7
---

# Phase 35 Plan 03: Build Pipeline Scripts Migration (data/build scripts) Summary

One-liner: JS→TS conversion of five data/build scripts + SCHEMA-04 DuckDB DESCRIBE column-schema check in build-data.ts (14 columns match OccurrenceRecordSchema on every build).

## What Was Built

Converted five active data/build pipeline scripts and two test files from `.js` to strict `.ts`, and added the SCHEMA-04 build-time Parquet column-schema sanity check inside `build-data.ts`. Updated `package.json` invocations for the converted scripts.

### Files Converted (5 scripts + 2 tests)

| Old File | New File | Notes |
|----------|----------|-------|
| `scripts/build-data.js` | `scripts/build-data.ts` | +SCHEMA-04 `verifySampleParquetSchema()` |
| `scripts/build-data.test.js` | `scripts/build-data.test.ts` | import specifier → `.ts`; noUncheckedIndexedAccess guards |
| `scripts/copy-parquet.js` | `scripts/copy-parquet.ts` | top-level await preserved (Pitfall 4) |
| `scripts/copy-images.js` | `scripts/copy-images.ts` | top-level await preserved (Pitfall 4) |
| `scripts/emit-species-states.js` | `scripts/emit-species-states.ts` | DuckDB types; main() + self-invocation guard |
| `scripts/check-page-weight.js` | `scripts/check-page-weight.ts` | type annotations; entry-point script |
| `scripts/check-page-weight.test.js` | `scripts/check-page-weight.test.ts` | subprocess path → `.ts` (Pitfall 5) |

### New Symbol: `verifySampleParquetSchema`

Located in `scripts/build-data.ts`. After the Parquet export loop and before `conn.closeSync()`:
- Derives `firstSlug` from sorted `speciesRows` (deterministic alphabetical, D-07)
- Runs `DESCRIBE SELECT * FROM read_parquet('data/parquet/${firstSlug}/records.parquet')` on the already-open DuckDB connection (D-08)
- Compares actual column names against `Object.keys(OccurrenceRecordSchema.shape)`
- Throws on missing/extra columns; prints `Parquet schema OK: 14 columns match OccurrenceRecordSchema` on success

### New File: `src/_data/taxon.d.ts`

Minimal declaration file for the untyped Eleventy JS data file `taxon.js`, enabling typed `import` in `build-data.test.ts` without `allowJs` or `@ts-ignore`.

## Verification Results

- `npm run typecheck`: PASS (0 errors)
- `node --test scripts/build-data.test.ts scripts/check-page-weight.test.ts`: 24/24 tests pass
- `npm run build:data`: PASS — prints `Parquet schema OK: 14 columns match OccurrenceRecordSchema`, completes in ~3.2s (well under 60s budget)
- No `.js` source remains for any of the five converted scripts or their two tests
- `package.json` `build:data`, `build:copy-parquet`, `build:copy-images`, `build:species-states`, `build:check-weight`, test globs all reference `.ts`

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| D-06 | Build-time one-sample Parquet DESCRIBE check | O(columns) cost, negligible; fails build fast on schema drift |
| D-07 | First alphabetical species (abagrotis-apposita) | Deterministic, always present; derived from sorted in-memory speciesRows |
| D-08 | Reuse already-open DuckDB connection | Zero new dependency; connection is open immediately before closeSync |
| D-11 | No per-row Zod in build-data hot path | DuckDB typed read_csv is the gate; column check is sufficient at build time |
| D-12 | DuckDB typed read_csv + integrity SQL | nullstr='' on species.csv preserved; records.csv without nullstr preserved |
| taxon.d.ts | Declare file for taxon.js | Cleanest way to type an untyped Eleventy JS data module without allowJs/ts-ignore |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `src/_data/taxon.d.ts` declaration file**
- **Found during:** Task 1 typecheck
- **Issue:** `scripts/build-data.test.ts` imports `../src/_data/taxon.js` which is an untyped JS file. TypeScript 6 under NodeNext module resolution raises TS7016 "Could not find a declaration file". The original `.test.js` worked because `.js` files are never typechecked. Converting to `.ts` required declaring the module.
- **Fix:** Created `src/_data/taxon.d.ts` with `export default function taxon(): Promise<unknown[]>`. This is the standard pattern for adding types to an existing JS module without `allowJs`.
- **Files modified:** `src/_data/taxon.d.ts` (new), `scripts/build-data.test.ts` (simplified import)
- **Commits:** 2e099c63

**2. [Rule 1 - Bug] Fixed `Record<string, string>` noUncheckedIndexedAccess in build-data.ts**
- **Found during:** Task 1 typecheck
- **Issue:** `row.filename` typed as `string | undefined` under `noUncheckedIndexedAccess` even though `validateCsv` returns `Record<string, string>[]`. TypeScript cannot narrow indexed access for arbitrary string keys without the guard.
- **Fix:** Changed `row.filename` → `row['filename']` with an explicit `if (filename !== undefined)` guard before the regex test. Same for `row['image_filename']`.
- **Files modified:** `scripts/build-data.ts`
- **Commits:** 2e099c63

## Self-Check

**Files exist:**
- `scripts/build-data.ts`: FOUND
- `scripts/build-data.test.ts`: FOUND
- `scripts/copy-parquet.ts`: FOUND
- `scripts/copy-images.ts`: FOUND
- `scripts/emit-species-states.ts`: FOUND
- `scripts/check-page-weight.ts`: FOUND
- `scripts/check-page-weight.test.ts`: FOUND
- `src/_data/taxon.d.ts`: FOUND

**Old .js files deleted:**
- `scripts/build-data.js`: DELETED
- `scripts/build-data.test.js`: DELETED
- `scripts/copy-parquet.js`: DELETED
- `scripts/copy-images.js`: DELETED
- `scripts/emit-species-states.js`: DELETED
- `scripts/check-page-weight.js`: DELETED
- `scripts/check-page-weight.test.js`: DELETED

**Commits exist:**
- `2e099c63`: Task 1 — build-data.ts + SCHEMA-04 + test
- `345d2c4b`: Task 2 — copy-parquet, copy-images, emit-species-states
- `01d0dfd9`: Task 3 — check-page-weight + test

## Self-Check: PASSED
