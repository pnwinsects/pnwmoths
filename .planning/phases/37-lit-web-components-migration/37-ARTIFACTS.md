# Phase 37 — Artifacts this phase produces

Authoritative manifest of every symbol, file, and contract Phase 37 creates or changes. Downstream consumers (Phase 38 CI gate, future listeners) read this.

## New TypeScript symbols

| Symbol | File | Kind | Plan |
|--------|------|------|------|
| `FilterChangeDetail` | `src/types/events.ts` | exported interface (8 fields: state, recordType, yearMin, yearMax, county, collection, elevationMin, elevationMax) | 01 |
| `HTMLElementEventMap` augmentation | `src/types/events.ts` | global `declare global` merge mapping `'pnwm-filter-change'` → `CustomEvent<FilterChangeDetail>` | 01 |
| `assertParquetColumns(meta)` | `src/components/parquet-cache.ts` | exported pure validator (O(columns); throws `records.parquet schema mismatch: missing column "<col>"`) | 02 |
| `EXPECTED_PARQUET_COLUMNS` | `src/components/parquet-cache.ts` | module-level `Set` of 14 expected column names | 02 |
| `validateSpeciesStates(rows)` (and `SchemaValidationError`) | `src/components/pnwm-taxon-browser.ts` | exported pure validator (O(1) Array.isArray + single-element safeParse) + hard-fail discriminant class | 04 |

## Refactored schema exports (names unchanged; now `zod/mini`)

`src/types/schemas.ts` migrated to `import * as z from 'zod/mini'`. Same export names: `OccurrenceRecordSchema`/`OccurrenceRecord`, `SpeciesSchema`/`Species`, `GlossaryWordSchema`/`GlossaryWord`, `SpeciesImageSchema`/`SpeciesImage`, `SpecimenSchema`/`Specimen`, `SpeciesPhotoSchema`/`SpeciesPhoto`, `SpeciesStateSchema`/`SpeciesState`, `NavImageSchema`/`NavImage`, `TaxonSpeciesSchema`/`TaxonSpecies`, `TaxonGenusSchema`/`TaxonGenus`, `TaxonSubfamilySchema`/`TaxonSubfamily`, `TaxonFamilySchema`/`TaxonFamily`. The 6 `.int()` constraints are dropped (DuckDB INT32-enforced).

## New `.ts` source files (renamed from `.js`)

`src/components/`: `parquet-cache.ts`, `pnwm-filter-bar.ts`, `pnwm-image-slideshow.ts`, `pnwm-occurrence-popup.ts`, `pnwm-plate-viewer.ts`, `glossary-tooltip.ts`, `pnwm-occurrence-map.ts`, `pnwm-phenology-chart.ts`, `pnwm-taxon-browser.ts`, `main.ts`.

`src/types/`: `events.ts` (net-new).

## New `.test.ts` files (renamed from `.test.js`)

`filters.test.ts`, `parquet-cache.test.ts`, `phenology.test.ts`, `pnwm-image-slideshow.test.ts`, `pnwm-taxon-browser.test.ts` — all under `src/components/`. New SCHEMA-08 cases added to `parquet-cache.test.ts` (column validator) and `pnwm-taxon-browser.test.ts` (species-states validator).

## Config changes

- **`package.json`** `test` script glob: `src/components/*.test.js` → `src/components/*.test.ts`.
- **`src/types/index.ts`**: adds `export * from './events.ts'`.
- No tsconfig changes (browser config already includes `src/types/**/*.ts`; `typecheck` script unchanged).

## Plan → wave → requirement map

| Plan | Wave | depends_on | Requirements | Autonomous |
|------|------|------------|--------------|------------|
| 01 — types foundation + baseline | 1 | — | MIG-04, SCHEMA-08 | yes |
| 02 — parquet-cache + validator + filter-bar | 2 | 01 | MIG-04, SCHEMA-08 | yes |
| 03 — standalone display components | 2 | 01 | MIG-04 | yes |
| 04 — parquet-cache consumers + taxon-browser validator | 3 | 01, 02, 03 | MIG-04, SCHEMA-08 | yes |
| 05 — main.ts + test glob + SC-4/SC-5 verification | 4 | 01, 02, 03, 04 | MIG-04, SCHEMA-08 | no (SC-5 checkpoint) |

## Resolved open questions

- **D-05 (RESEARCH Open Q1):** `pnwm-taxon-browser` species-states validator HARD-FAILS on schema mismatch (re-throws a distinguishable `SchemaValidationError`, surfacing the error — "no silently-wrong data") while genuine network/fetch failures keep the prior soft-degradation (empty state filter). Resolved in Plan 04 Task 2.
- **Baseline (RESEARCH Open Q2):** a fresh pre-Phase-37 `_site_baseline/` is captured in Plan 01 Task 3 (the Phase 34 baseline is stale).
