---
phase: 37-lit-web-components-migration
plan: "04"
subsystem: src/components
tags: [occurrence-map, phenology-chart, taxon-browser, schema-validation, typed-events, test-migration, SCHEMA-08, MIG-04]
dependency_graph:
  requires:
    - src/types/schemas.ts (zod/mini, browser-safe — Plan 01)
    - src/types/events.ts (FilterChangeDetail + HTMLElementEventMap merge — Plan 01)
    - src/components/parquet-cache.ts (typed loadParquet/filterRecords — Plan 02)
    - src/components/pnwm-occurrence-popup.ts (renamed from .js — Plan 03)
  provides:
    - src/components/pnwm-occurrence-map.ts (typed Leaflet map component)
    - src/components/pnwm-phenology-chart.ts (typed Chart.js phenology component)
    - src/components/pnwm-taxon-browser.ts (typed taxon browser + O(1) species-states validator)
    - src/components/pnwm-taxon-browser.test.ts (renamed + SCHEMA-08 validator tests)
  affects:
    - Plan 05 (wave 3 consumers all typed; main.ts can now import all .ts components)
tech_stack:
  added: []
  patterns:
    - SchemaValidationError extends Error as discriminant for hard-fail vs soft-degradation
    - validateSpeciesStates(rows: unknown): asserts rows is SpeciesState[] — assertion function
    - Array.isArray() + SpeciesStateSchema.safeParse(rows[0]) O(1) validator (D-03/SCHEMA-08)
    - instanceof SchemaValidationError in catch for D-05 hard-fail re-throw
    - Partial<FilterChangeDetail> | null for components receiving filter detail as property
    - L.Map | null / L.FeatureGroup | null typed via @types/leaflet
    - Chart | null typed with ChartConfiguration<'bar'> for typed Chart.js usage
    - as unknown as TaxonFamily/Subfamily/Genus casts for partial test objects
    - PropertyDeclarations/TemplateResult Lit types (Pattern 1)
key_files:
  created: []
  modified:
    - src/components/pnwm-occurrence-map.ts (renamed from .js; typed + FilterChangeDetail)
    - src/components/pnwm-phenology-chart.ts (renamed from .js; typed Chart.js + FilterChangeDetail)
    - src/components/pnwm-taxon-browser.ts (renamed from .js; validateSpeciesStates + SchemaValidationError + full types)
    - src/components/pnwm-taxon-browser.test.ts (renamed from .test.js; 5 new SCHEMA-08 test cases)
decisions:
  - "SCHEMA-08/D-05: SchemaValidationError as discriminant class — catch re-throws schema errors (hard fail), swallows network/fetch errors (soft degradation)"
  - "D-03: validateSpeciesStates uses Array.isArray + single safeParse(rows[0]) probe — O(1), no z.array().parse()"
  - "MIG-04: filters property typed as Partial<FilterChangeDetail> | null (map/phenology receive detail from njk script)"
  - "Assertion function pattern: validateSpeciesStates uses asserts rows is SpeciesState[] so caller narrows type after call"
  - "Test boundary casts: as unknown as TaxonFamily/Subfamily/Genus for partial objects (test-only, documented)"
  - "D-06/D-07: static get properties() getter form and customElements.define kept in all three components; no decorators"
metrics:
  duration: 324s
  completed: "2026-06-10"
  tasks: 3
  files: 4
---

# Phase 37 Plan 04: Consumer Components + Taxon Browser Validator Summary

One-liner: pnwm-occurrence-map.ts and pnwm-phenology-chart.ts typed as parquet-cache consumers with FilterChangeDetail; pnwm-taxon-browser.ts with O(1) species-states.json validator (validateSpeciesStates + SchemaValidationError) resolving D-05 hard-fail discipline, plus 5 new SCHEMA-08 test cases.

## What Was Built

### Task 1: Convert pnwm-occurrence-map.js and pnwm-phenology-chart.js to .ts (MIG-04)

Converted both parquet-cache consumer components via `git mv`:

**pnwm-occurrence-map.ts:**
- Expanded lit import: `type PropertyDeclarations, type TemplateResult, type PropertyValues`
- Updated import specifier: `./parquet-cache.js` → `./parquet-cache.ts`
- Added `import type { OccurrenceRecord, FilterChangeDetail }` from `../types/index.ts`
- `static get properties(): PropertyDeclarations` — getter form preserved per D-06
- Typed instance fields: `slug: string`, `filters: Partial<FilterChangeDetail> | null`, `_records: OccurrenceRecord[]`, `_loading: boolean`, `_error: unknown`, `_map: L.Map | null`, `_markerGroup: L.FeatureGroup | null`
- `createRenderRoot(): this`, `connectedCallback(): Promise<void>`, `render(): TemplateResult`, `updated(changed: PropertyValues): void`
- `_renderMap()` typed with `HTMLElement | null` container cast; non-null assertions on `_markerGroup!` and `_map!` after the initialization guard
- `document.createElement('pnwm-occurrence-popup')` cast as `HTMLElement & { record: OccurrenceRecord }` for the popup property assignment

**pnwm-phenology-chart.ts:**
- Expanded lit import with same Lit types plus `type CSSResult`
- Chart.js import extended with `type ChartConfiguration`; `_chart: Chart | null` instance field
- Updated import specifier to `./parquet-cache.ts`
- `_renderChart(canvas: HTMLCanvasElement): void` typed; `ChartConfiguration<'bar', number[], string>` config object to satisfy Chart.js generics
- `noUncheckedIndexedAccess`: `dataset` access guarded with `if (dataset)` before mutating data
- `static get styles(): CSSResult` typed return
- No decorators; `customElements.define` kept at tail

### Task 2: Convert pnwm-taxon-browser.js to .ts with O(1) species-states.json validator (SCHEMA-08)

Converted via `git mv` with all type annotations and the SCHEMA-08 validator:

**Validator design (resolves D-05 Open Question 1):**
- `SchemaValidationError extends Error` — discriminant class allowing the catch block to distinguish schema errors from network errors
- `validateSpeciesStates(rows: unknown): asserts rows is SpeciesState[]` — exported assertion function; performs `Array.isArray(rows)` check then `SpeciesStateSchema.safeParse(rows[0])` probe (O(1) per D-03); throws `SchemaValidationError` on failure
- `connectedCallback` catch: `if (err instanceof SchemaValidationError) throw err` (hard fail); else silently degrade (soft fail for network errors)
- This exactly matches the D-05 intent: schema mismatch surfaces the error (no silently-wrong state filter); network failure leaves `_stateMap` empty (select stays disabled)

**Type annotations:**
- All instance fields declared above constructor: `_families: TaxonFamily[]`, `_stateMap: Record<string, Set<string>>`, `_statesAvailable: string[]`, `_selectedState: string`, `_showImages: boolean`, three `Set<string>` expand fields
- `buildStateMap(rows: SpeciesState[]): Record<string, Set<string>>` — typed return
- `taxonHasState(slugs: string[], stateMap: Record<string, Set<string>>, selectedState: string): boolean`
- `collectSlugs(node: TaxonFamily | TaxonSubfamily | TaxonGenus): string[]` — union parameter; uses `'species' in node`, `'subfamilies' in node`, `'genera' in node` discriminants
- `_renderImageStrip`, `_expandToSpecies`, `_mutedStyle`, `_renderSpecies`, `_renderGenus`, `_renderSubfamily`, `_renderFamily`, `render()` — all typed with TemplateResult returns

### Task 3: Rename pnwm-taxon-browser.test.js to .ts and add SCHEMA-08 validator tests

Converted test via `git mv`:
- Updated import specifier from `./pnwm-taxon-browser.js` → `./pnwm-taxon-browser.ts`
- Added `validateSpeciesStates` and `SchemaValidationError` to imports
- Added `import type { TaxonFamily, TaxonSubfamily, TaxonGenus }` for cast targets
- Applied `as unknown as TaxonFamily/Subfamily/Genus` casts to partial test objects (documented boundary cast — test objects only provide the fields under test, not all schema-required fields)
- Fixed `result['key']` access patterns to use `result['key']!` (non-null assertion) under `noUncheckedIndexedAccess`
- New `describe('species-states.json validator')` block with 5 test cases:
  1. `throws when top-level is not an array` — input: `{}`
  2. `throws when top-level is null` — input: `null`
  3. `throws when element shape is wrong (missing state field)` — input: `[{ species_slug: 's' }]`
  4. `accepts a valid array with a properly shaped element` — input: `[{ species_slug: 's', state: 'WA' }]`
  5. `accepts an empty array (no element to probe)` — input: `[]`
- All 18 tests pass (13 pre-existing pure-function tests + 5 new SCHEMA-08 cases)

## Deviations from Plan

None — plan executed exactly as written.

The `filters` property on map/phenology components is typed as `Partial<FilterChangeDetail> | null` rather than `FilterChangeDetail | null` because the component receives the event detail from the `species.njk` template script (not by calling `addEventListener` directly). The plan's reference to "listener sites" was accurate conceptually (the detail type flows from the event), and the type annotation correctly uses `FilterChangeDetail` as the source type.

## Self-Check

### Created Files Exist
- [x] `src/components/pnwm-occurrence-map.ts` — exists
- [x] `src/components/pnwm-phenology-chart.ts` — exists
- [x] `src/components/pnwm-taxon-browser.ts` — exists
- [x] `src/components/pnwm-taxon-browser.test.ts` — exists

### Files Removed
- [x] `src/components/pnwm-occurrence-map.js` — removed
- [x] `src/components/pnwm-phenology-chart.js` — removed
- [x] `src/components/pnwm-taxon-browser.js` — removed
- [x] `src/components/pnwm-taxon-browser.test.js` — removed

### Commits Exist
- [x] 08a47ec0 — feat(37-04): convert pnwm-occurrence-map.js and pnwm-phenology-chart.js to .ts (MIG-04)
- [x] 7466da24 — feat(37-04): convert pnwm-taxon-browser.js to .ts with O(1) species-states validator (SCHEMA-08)
- [x] f8d1c986 — feat(37-04): rename pnwm-taxon-browser.test.js to .ts and add SCHEMA-08 validator cases

### Verification Results
- [x] `grep -c "safeParse" src/components/pnwm-taxon-browser.ts` = 1 (single-element probe)
- [x] `grep -c "z.array(" src/components/pnwm-taxon-browser.ts` = 0 (no O(rows) parse)
- [x] `grep -c "export function validateSpeciesStates\|class SchemaValidationError" src/components/pnwm-taxon-browser.ts` = 2
- [x] `grep -c "FilterChangeDetail" src/components/pnwm-occurrence-map.ts` = 2
- [x] `grep -c "FilterChangeDetail" src/components/pnwm-phenology-chart.ts` = 2
- [x] `grep -c "@customElement\|@property\|@state" src/components/*.ts` = 0 (no decorators in any file)
- [x] `npm run typecheck` exits 0 with zero errors
- [x] `node --test src/components/pnwm-taxon-browser.test.ts` passes 18/18 (13 pre-existing + 5 new SCHEMA-08 cases)

## Self-Check: PASSED

## Known Stubs

None — this plan converts existing functionality to TypeScript. No new UI data flows introduced.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced beyond those in the plan's threat register:
- T-37-05 (mitigated): species-states.json O(1) validator with SchemaValidationError hard-fail implemented
- T-37-06 (accepted): SpeciesStateSchema closed z.object handles prototype-pollution-style keys
- T-37-07 (accepted): O(1) validation unchanged DoS surface
