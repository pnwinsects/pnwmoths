---
phase: 39-key-matrix-data-pipeline
plan: 01
subsystem: data-pipeline
tags: [key-matrix, csv-parse, duckdb, bitset, zod, tdd]
dependency_graph:
  requires: []
  provides:
    - data/key-characters.csv
    - data/species-synonyms.csv (17 Grammia->Apantesis rows)
    - src/types/schemas.ts (CharacterSchema, KeySpeciesSchema, KeyMatrixSchema)
    - scripts/build-key.ts
    - data/key-matrix.json
    - data/key-coverage-report.json
    - src/components/key-matrix-cache.ts
  affects:
    - Phase 40 (filter logic TDD contract reads key-matrix.json)
    - Phase 41 (identify page uses validateKeyMatrix + key-matrix.json)
tech_stack:
  added: []
  patterns:
    - csv-parse relax_quotes for Lucid export embedded quotes
    - per-character-state base64 Uint8Array bitsets (LSB-first)
    - DuckDB SELECT * -> JS Map<slug,filename> (no SQL interpolation)
    - zod/mini schemas with post-parse structural invariants
    - asserts data is KeyMatrix load-time guard
key_files:
  created:
    - data/key-characters.csv
    - data/key-matrix.json
    - data/key-coverage-report.json
    - scripts/build-key.ts
    - scripts/build-key.test.ts
    - src/components/key-matrix-cache.ts
    - src/components/key-matrix-cache.test.ts
  modified:
    - data/species-synonyms.csv
    - src/types/schemas.ts
    - src/types/schemas.test.ts
decisions:
  - D-01 honored: key-characters.csv committed verbatim (629 KB, no external dependency)
  - D-04 honored: matrix = per-character-state base64 bitsets over matched species only
  - D-05 honored: Zod build-time + zod/mini load-time guard (mirrors v3.0 assertParquetColumns)
  - D-07 honored: both data/key-matrix.json and data/key-coverage-report.json committed
  - Auto-fix: replaced validateCsv() call with inline preflight (Lucid CSV has embedded unescaped quotes in labels)
metrics:
  duration: "~15 minutes"
  completed: "2026-06-25T00:04:21Z"
  tasks_completed: 3
  tests_added: 49
  files_created: 7
  files_modified: 3
---

# Phase 39 Plan 01: Key Matrix Data Pipeline (Source Data + Schema + Pipeline + Guard) Summary

Complete build-time pipeline from Lucid `key.csv` export to validated `data/key-matrix.json` artifact with per-character-state base64 bitsets over 1,192 matched species, plus Zod schemas and a `zod/mini` load-time guard.

## What Was Built

### Task 1 (TDD RED): Source Data + Schemas + Test Scaffold
- Committed `data/key-characters.csv` (629 KB Lucid export, 1,229 columns x 238 rows) verbatim from `~/Downloads/may 6 2015 key files/may 6 2015 key.csv` (D-01).
- Added 17 Grammia->Apantesis entries to `data/species-synonyms.csv` using normalized single-space form (e.g. `Grammia blakei,apantesis-blakei`) — all 17 Grammia binomials in the key map to `apantesis-*` slugs; direct resolution matches none.
- Appended `CharacterSchema`, `KeySpeciesSchema`, `KeyMatrixSchema` (plus inferred types `Character`, `KeySpecies`, `KeyMatrix`) to `src/types/schemas.ts` using `zod/mini` only, `z.nullable(z.string())` convention, no `z.optional`.
- Added accept/reject tests to `src/types/schemas.test.ts` (21 tests, all GREEN).
- Created `scripts/build-key.test.ts` as RED scaffold (fails until Task 2 because `build-key.ts` did not yet exist).

### Task 2 (TDD GREEN): Pipeline Implementation
Created `scripts/build-key.ts` with exports: `normalizeBinomial`, `binomialToSlug`, `resolveSlug`, `parseCharacterLabel`, `buildBitset`, `main`.

Pipeline steps:
1. Inline UTF-8 + existence preflight (cannot use `validateCsv()` — see Deviations).
2. `csv-parse` with `columns: false, relax_quotes: true` — columns: false mandatory (row 0 is species data, not headers); relax_quotes handles Lucid export embedded quotes.
3. Load `data/species.csv` into `siteSlugSet`; load `data/species-synonyms.csv` into `synonymMap`.
4. Resolve 1,228 binomials: direct lowercase-hyphen then synonym fallback; normalize whitespace before both.
5. DuckDB nav-image join: `SELECT * FROM images` ordered by navigational/weight -> JS `Map<slug,filename>` — no slug interpolation into SQL (T-39-01 mitigation).
6. Build `characters[]` (237), `species[]` (1,192 matched), `matrix[]` (237 base64 bitsets, LSB-first).
7. `KeyMatrixSchema.parse()` then post-Zod structural invariants (T-39-02 mitigation).
8. Write `data/key-matrix.json` and `data/key-coverage-report.json`.

Results: 1,192 matched + 36 unmatched = 1,228 total. All 21 `scripts/build-key.test.ts` tests GREEN.

### Task 3 (TDD GREEN): Load-time Guard
Created `src/components/key-matrix-cache.ts` exporting `validateKeyMatrix(data: unknown): asserts data is KeyMatrix`. Mirrors `assertParquetColumns` (parquet-cache.ts) and `validateSpeciesStates` (pnwm-taxon-browser.ts):
- Layer 1: `KeyMatrixSchema.parse(data)` — zod/mini structural validation.
- Layer 2: `matrix.length === characters.length` and per-bitset base64 length check.

`src/components/key-matrix-cache.test.ts`: 7 tests, all GREEN. `npm run typecheck` passes with zero errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced validateCsv() call with inline preflight**
- **Found during:** Task 2 initial run
- **Issue:** `data/key-characters.csv` contains embedded unescaped double-quotes inside quoted CSV fields in some character labels (Lucid export artifact, e.g. `dipped" in a different color?`). `validateCsv()` from `build-data.ts` calls `csv-parse` without `relax_quotes: true`, causing an "Invalid Closing Quote" error at line 235.
- **Fix:** Replaced `validateCsv('data/key-characters.csv', [])` call with inline UTF-8 + file-exists preflight (same checks, without the csv-parse step). Added `relax_quotes: true` to the actual data parse call.
- **Files modified:** `scripts/build-key.ts`
- **Commit:** 6cccd40e (included in Task 2 commit)

**2. [Rule 1 - Bug] Removed unused `main` import from build-key.test.ts**
- **Found during:** Task 3 (typecheck)
- **Issue:** `scripts/build-key.test.ts` imported `main` from `build-key.ts` but never called it directly (integration test uses `execSync` per the build-data.test.ts pattern). TypeScript reported TS6133: 'main' is declared but its value is never read.
- **Fix:** Removed `main` from the import list; integration test uses `execSync('node scripts/build-key.ts')`.
- **Files modified:** `scripts/build-key.test.ts`
- **Commit:** b0cb2fb2 (included in Task 3 commit)

## Success Criteria Review

- KEY-01: matrix has 237 base64 bitsets over 1,192 matched species (LSB-first Uint8Array encoding). ✓
- KEY-02: 237 characters with full Category[:Subcategory]:Question:State hierarchy (3-part and 4-part). ✓
- KEY-03: `KeyMatrixSchema.parse()` build-time gate + `validateKeyMatrix` load-time guard. ✓
- MATCH-01: All 1,228 binomials resolved via direct + synonym; whitespace normalized before both lookups. ✓
- MATCH-02: `data/key-coverage-report.json` lists 36 unmatched binomials with `{binomial, direct_slug, reason}`. ✓
- MATCH-03: Matched species carry `nav_image` from DuckDB join; unmatched excluded. ✓

## Known Stubs

- `image_filename: null` on all 237 characters — intentional; Phase 43 curator pass will populate from `data/key-character-images.csv`.
- `common_name: null` on all matched species — intentional; key CSV does not include common names; could be joined from `species.csv` in a future pass.

These stubs do not block Phase 39's goal (stable data contract for Phases 40–43). The `validateKeyMatrix` guard accepts null values as valid per the schema.

## Threat Flags

No new threat surface beyond the plan's threat model. T-39-01 (slug SQL injection) mitigated via JS-side Map. T-39-02 (truncated bitset) mitigated via post-Zod structural invariants in both `build-key.ts` and `validateKeyMatrix`.

## Self-Check: PASSED

Files exist:
- data/key-characters.csv ✓
- data/key-matrix.json ✓
- data/key-coverage-report.json ✓
- scripts/build-key.ts ✓
- scripts/build-key.test.ts ✓
- src/types/schemas.ts (modified) ✓
- src/components/key-matrix-cache.ts ✓
- src/components/key-matrix-cache.test.ts ✓

Commits:
- ceb877a2: test(39-01): scaffold RED tests; commit key CSV + synonyms; add Zod schemas ✓
- 6cccd40e: feat(39-01): implement build-key.ts pipeline; emit key-matrix.json + coverage report ✓
- b0cb2fb2: feat(39-01): add validateKeyMatrix load-time guard + tests; typecheck clean ✓
