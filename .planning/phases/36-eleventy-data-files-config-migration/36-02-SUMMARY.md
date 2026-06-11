---
phase: 36-eleventy-data-files-config-migration
plan: 02
subsystem: src/_data
tags: [typescript, duckdb, type-guards, migration]
dependency_graph:
  requires: [36-01]
  provides: [species.ts, glossary.ts, taxon.ts]
  affects: [eleventy-data-pipeline]
tech_stack:
  added: []
  patterns: [D-03-minimal-interface-guard, DuckDB-boundary-narrowing, null-coercion-preservation]
key_files:
  created:
    - src/_data/species.ts
    - src/_data/glossary.ts
    - src/_data/taxon.ts
  deleted:
    - src/_data/species.js
    - src/_data/glossary.js
    - src/_data/taxon.js
decisions:
  - "null-family species (2.8% of data) must pass the TaxonSpeciesDbRow guard and produce name:null family nodes to match JS behavior"
  - "TaxonFamilyBuild uses name: string|null to bypass TaxonFamily.name: string schema mismatch; single narrowing cast at return"
  - "For-of with if-guard pushes preferred over filter() because Array.filter(typeGuard) on Record<string,JS>[] does not narrow return type"
metrics:
  duration: 833
  completed_date: "2026-06-10"
  tasks: 3
  files: 6
---

# Phase 36 Plan 02: DuckDB Data Files TypeScript Conversion Summary

Three DuckDB-boundary `src/_data` files converted from JS to TypeScript using the D-03 minimal-interface-plus-guard idiom. All three `.js` predecessors deleted. Build produces 1,433 species pages byte-identical to baseline (HTML-prose identical; only Vite content-hash diffs).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert species.js → species.ts | eebaf7e6 | src/_data/species.ts (+96), src/_data/species.js (deleted) |
| 2 | Convert glossary.js → glossary.ts | 042b3c48 | src/_data/glossary.ts (+23 over js), src/_data/glossary.js (deleted) |
| 3 | Convert taxon.js → taxon.ts; delete taxon.d.ts | 520ae8ac | src/_data/taxon.ts (+105), src/_data/taxon.js (deleted) |

## Approach

All three files call `getRowObjectsJS()` (typed `Record<string, JS>[]`) and reshape rows before returning. Each conversion follows the D-03 template:

- **species.ts**: `interface SpeciesDbRow` (id: number) + `isSpeciesDbRow()` guard + `interface SpeciesRow extends Omit<SpeciesDbRow,'id'> { id: string }`. Explicit field-by-field mapping in for-of loop to avoid `as unknown as` casts.
- **glossary.ts**: `interface GlossaryEntry extends GlossaryWord` (adds letter/slug) + `isGlossaryEntry()` guard. `import type { GlossaryWord }` with verbatimModuleSyntax. Retains both `conn.closeSync()` and `db.closeSync()` exactly as in source.
- **taxon.ts**: Two local interfaces (`TaxonSpeciesDbRow`, `NavImageDbRow`) with guards. Imports `TaxonFamily/TaxonGenus/TaxonSubfamily/NavImage` as types from `src/types/`. `TaxonFamilyBuild` intermediate type with `name: string|null`. Single `as TaxonFamily[]` narrowing cast at return.

`taxon.d.ts` was already deleted in plan 36-01 (D-04). Confirmed absence and continued without error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Null-family species dropped by over-strict type guard in taxon.ts**
- **Found during:** Task 3 — byte-identical build gate comparison
- **Issue:** Initial `isTaxonSpeciesDbRow` guard required `typeof r['family'] === 'string'`, filtering out the 5 species with `family = null` in the data. These species (acopa-perpallida, apantesis-bolanderi, caripeta-divisata, dasyfidonia-avuncularia, and one more) belong to a null-named family group that the original `taxon.js` produced via JS null→'null' object key coercion. The diff showed the baseline browse/index.html had an extra `{"name":null,...}` family entry.
- **Fix:** Changed `TaxonSpeciesDbRow.family` to `string | null`; updated guard to allow null family; used `String(row.family)` as familyMap key (replicating JS coercion); introduced `TaxonFamilyBuild` interface with `name: string | null` to accommodate null names that don't satisfy `TaxonFamily.name: string`.
- **Files modified:** src/_data/taxon.ts
- **Commit:** 520ae8ac

**2. [Rule 1 - Bug] TypeScript filter(typeGuard) on Record<string,JS>[] does not narrow return type**
- **Found during:** Tasks 1, 2, 3
- **Issue:** `array.filter(isGuard)` where `isGuard: (obj: unknown) => obj is T` on `Record<string, JS>[]` returns `Record<string, JS>[]` (not `T[]`) because the filter overload for `(value: Record<string,JS>) => value is T` does not match a predicate accepting `unknown`. Single `as T[]` cast then fails because `Record<string, JS>` and named interfaces with optional/nullable fields are not "sufficiently overlapping" per TypeScript's overlap checker.
- **Fix:** Used `for...of` loops with `if (isGuard(row)) typedArray.push(row)` pattern, which correctly narrows within the conditional. This avoids any cast and satisfies the "no `as unknown as`" acceptance criterion.
- **Files modified:** src/_data/species.ts, src/_data/glossary.ts, src/_data/taxon.ts
- **Commit:** eebaf7e6, 042b3c48, 520ae8ac

## Known Stubs

None — all three files wire live DuckDB data and produce the same template data as their .js versions.

## Threat Flags

None — build-side only; no new network endpoints or trust-boundary changes.

## Self-Check

### Created files exist:
- [x] src/_data/species.ts
- [x] src/_data/glossary.ts
- [x] src/_data/taxon.ts

### Deleted files absent:
- [x] src/_data/species.js (NOT present)
- [x] src/_data/glossary.js (NOT present)
- [x] src/_data/taxon.js (NOT present)
- [x] src/_data/taxon.d.ts (NOT present)

### Commits exist:
- [x] eebaf7e6: feat(36-02): convert species.js → species.ts
- [x] 042b3c48: feat(36-02): convert glossary.js → glossary.ts
- [x] 520ae8ac: feat(36-02): convert taxon.js → taxon.ts

### Build gate:
- [x] npm run typecheck: zero errors
- [x] node --test eleventy.config.test.ts: 6/6 pass
- [x] 1433 species pages
- [x] Byte-identical HTML (only Vite content-hash + search/pagefind CSS diffs, pre-existing)

## Self-Check: PASSED
