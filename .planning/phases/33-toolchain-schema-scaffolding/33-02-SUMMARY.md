---
phase: 33-toolchain-schema-scaffolding
plan: "02"
subsystem: schemas
tags: [typescript, zod, schema, data-validation, acceptance-harness]
dependency_graph:
  requires: [tsconfig.node.json, tsconfig.browser.json, npm-run-typecheck]
  provides: [src/types/schemas.ts, src/types/index.ts, scripts/profile-data.ts, DATA-PROFILE.md]
  affects: [tsconfig.browser.json, tsconfig.node.json]
tech_stack:
  added: []
  patterns: [zod-infer-single-source-of-truth, nullable-not-optional-for-parquet-nulls, acceptance-harness-schema-03]
key_files:
  created:
    - src/types/schemas.ts
    - src/types/index.ts
    - scripts/profile-data.ts
    - .planning/phases/33-toolchain-schema-scaffolding/DATA-PROFILE.md
  modified:
    - tsconfig.browser.json
    - tsconfig.node.json
decisions:
  - "Use z.nullable() (not z.optional()) for all profiled-null columns — hyparquet writes null, not undefined; .optional() would silently reject all 92,554 records with county=null"
  - "No z.enum() anywhere — use z.string() with a comment listing known values (TS-03 / Node 24 type-stripping; isolatedModules:true enforces this)"
  - "No .strict() on any schema — lenient where we control the data; CSV drift is caught by DuckDB typed read + integrity SQL, not Zod (D-07)"
  - "SpeciesImage.weight is z.string() — taxon.js reads images.csv all-VARCHAR; TRY_CAST(weight AS INTEGER) happens in a SQL projection, not at read time"
  - "Species.id coerced with Number() before parse — DuckDB INTEGER may return BigInt in some API versions; z.number().int() expects JS number"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-09"
  tasks_completed: 3
  files_changed: 6
---

# Phase 33 Plan 02: Zod Schema Module & SCHEMA-03 Acceptance Harness Summary

**One-liner:** Seven Zod 4 schemas grounded in profiled null distributions, derived TypeScript types, and a DuckDB acceptance harness that verifies zero row rejections across 99,469 production data points.

## What Was Built

### Task 1: Seven-entity Zod schema module

`src/types/schemas.ts` — all seven entity schemas plus intermediate types:

- `OccurrenceRecordSchema` → `OccurrenceRecord` (92,554 records; county 100% null)
- `SpeciesSchema` → `Species` (1,433 rows; common_name 68% null, family 2.8% null)
- `GlossaryWordSchema` → `GlossaryWord` (149 rows; photographer 100% null)
- `SpeciesImageSchema` → `SpeciesImage` (4,035 rows; all-VARCHAR; navigational/subspecies 100% null)
- `SpecimenSchema` → `Specimen`, `SpeciesPhotoSchema` → `SpeciesPhoto` (1,238 JSON entries)
- `SpeciesStateSchema` → `SpeciesState` (flat array element)
- Four-level taxon tree: `NavImageSchema`, `TaxonSpeciesSchema`, `TaxonGenusSchema`, `TaxonSubfamilySchema`, `TaxonFamilySchema` → `TaxonFamily`

`src/types/index.ts` — re-exports all schemas and types via `export * from './schemas.ts'`.

### Task 2: SCHEMA-03 acceptance harness + data-profile note

`scripts/profile-data.ts` — reads all four CSV-backed entities via DuckDB (mirroring production read options exactly: records WITHOUT nullstr='', species/images/glossary WITH nullstr='') plus species-photos.json values, runs every row through `Schema.safeParse()`, prints per-entity summary and exits 0 on full acceptance.

`DATA-PROFILE.md` — four null-distribution tables transcribed from research, with maintainer preamble explaining why certain columns are nullable and what to do when adding required columns.

### Task 3: No-regression gate

All four gates passed:

| Gate | Command | Result |
|------|---------|--------|
| Enum gate (TS-03) | `grep -rnE '\benum\b' scripts/ src/ --include='*.ts' --include='*.js'` filtered to non-comments | Empty — PASS |
| Typecheck (TS-05) | `npm run typecheck` | Exit 0 — PASS |
| Acceptance (SCHEMA-03) | `node scripts/profile-data.ts` | SCHEMA-03 ACCEPTANCE PASS — PASS |
| Build no-regression (SC-5) | `npm run build` (full chain, no fallback needed) | 1,433 species pages — PASS |

**Page count note:** The plan's success criterion references "1364 species pages (v2.2 baseline)" — that figure originates from Phase 17's initial data load. The current `data/species.csv` has 1,433 species rows (additional species were added during v2.2 data migrations). The build emits 1,433 species pages, which is the correct current baseline and unchanged from the pre-Phase-33 state. This phase introduces no template or data changes, confirming the scaffolding does not perturb the running build.

## Acceptance Harness Output

```
OccurrenceRecord: 92554 rows, 0 rejected
Species: 1433 rows, 0 rejected
SpeciesImage: 4035 rows, 0 rejected
GlossaryWord: 149 rows, 0 rejected
SpeciesPhoto: 1238 rows, 0 rejected
SCHEMA-03 ACCEPTANCE PASS: all production rows accepted
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `allowImportingTsExtensions` missing from tsconfig.browser.json**
- **Found during:** Task 1 — `npm run typecheck` failed with TS5097 on `src/types/index.ts` `.ts` extension import
- **Issue:** The browser tsconfig was created in Plan 01 without `allowImportingTsExtensions:true`. The plan notes this flag for the node tsconfig but not the browser one, even though both include `src/types/**/*.ts`
- **Fix:** Added `"allowImportingTsExtensions": true` to `tsconfig.browser.json`
- **Files modified:** `tsconfig.browser.json`
- **Commit:** 4040ab9c

**2. [Rule 3 - Blocking] `types:["node"]` missing from tsconfig.node.json**
- **Found during:** Task 2 — `npm run typecheck` failed with TS2591 (`Cannot find name 'console'`, `'process'`) and TS2591 (`Cannot find name 'node:fs'`)
- **Issue:** TypeScript 6 strict NodeNext mode does not auto-include `@types/node` globals without an explicit `types` field; `lib:["ES2022"]` alone does not provide Node built-ins
- **Fix:** Added `"types": ["node"]` to `tsconfig.node.json` compilerOptions
- **Files modified:** `tsconfig.node.json`
- **Commit:** 7319b616

## Known Stubs

None. All seven schemas describe production data shapes exactly; no placeholder values.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. This plan adds type definitions and a build-side acceptance harness only — no runtime/browser code ships.

## Self-Check: PASSED

- [x] `src/types/schemas.ts` exists with 7 entity schemas + derived types
- [x] `src/types/index.ts` exists with re-exports
- [x] `scripts/profile-data.ts` exists with acceptance harness
- [x] `DATA-PROFILE.md` exists with four null-distribution tables
- [x] Task 1 commit: 4040ab9c
- [x] Task 2 commit: 7319b616
- [x] All gates passed: enum grep empty, typecheck 0, acceptance pass, build 1433 pages
