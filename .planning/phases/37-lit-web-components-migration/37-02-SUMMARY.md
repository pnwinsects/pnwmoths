---
phase: 37-lit-web-components-migration
plan: "02"
subsystem: src/components
tags: [parquet-cache, filter-bar, schema-validation, typed-events, test-migration]
dependency_graph:
  requires:
    - src/types/schemas.ts (zod/mini, browser-safe — Plan 01)
    - src/types/events.ts (FilterChangeDetail + HTMLElementEventMap merge — Plan 01)
  provides:
    - src/components/parquet-cache.ts (typed loadParquet with O(columns) column validator)
    - src/components/pnwm-filter-bar.ts (typed Lit component dispatching CustomEvent<FilterChangeDetail>)
    - src/components/parquet-cache.test.ts (regression + SCHEMA-08 validator tests)
    - src/components/filters.test.ts (renamed from .js)
    - src/components/phenology.test.ts (renamed from .js)
  affects:
    - Plans 03-05 (wave 3 consumers import parquet-cache.ts)
tech_stack:
  added: []
  patterns:
    - hyparquet parquetMetadata(arrayBuffer) for O(columns) Parquet footer validation
    - assertParquetColumns exported pure function (unit-testable without fetch mock)
    - CustomEvent<FilterChangeDetail> typed dispatch (D-09)
    - PropertyDeclarations/CSSResult/TemplateResult Lit types (Pattern 1)
    - as unknown as OccurrenceRecord[] boundary cast in test files (verified-safe)
    - noUncheckedIndexedAccess: (counts[idx] ?? 0) + 1 pattern for array mutation
key_files:
  created: []
  modified:
    - src/components/parquet-cache.ts (renamed from .js; validator + types added)
    - src/components/pnwm-filter-bar.ts (renamed from .js; typed + CustomEvent<FilterChangeDetail>)
    - src/components/parquet-cache.test.ts (renamed from .js; new SCHEMA-08 tests added)
    - src/components/filters.test.ts (renamed from .js; specifier + type casts updated)
    - src/components/phenology.test.ts (renamed from .js; specifier + type casts updated)
decisions:
  - "SCHEMA-08: assertParquetColumns exported as pure function to avoid fetch mock in tests"
  - "D-05: filterRecords null-coercion preserved via (r.year as number) cast — documented behavior"
  - "D-06/D-07: static get properties() getter form and customElements.define kept; no decorators"
  - "noUncheckedIndexedAccess: aggregateByMonth uses (counts[idx] ?? 0) + 1 instead of counts[idx]++"
  - "Test boundary cast: as unknown as OccurrenceRecord[] for partial test objects (documented cast)"
metrics:
  duration: 420s
  completed: "2026-06-10"
  tasks: 3
  files: 5
---

# Phase 37 Plan 02: Parquet Cache + Filter Bar Migration Summary

One-liner: parquet-cache.ts with O(columns) column validator via hyparquet parquetMetadata + pnwm-filter-bar.ts with CustomEvent<FilterChangeDetail> dispatch + three test files converted to .ts with SCHEMA-08 tests.

## What Was Built

### Task 1: Convert parquet-cache.js → .ts with O(columns) Parquet column validator (SCHEMA-08)

Converted `src/components/parquet-cache.js` to `src/components/parquet-cache.ts` via `git mv`. Key additions:

- Added `parquetMetadata` import from `hyparquet` alongside existing `parquetReadObjects`
- Added `EXPECTED_PARQUET_COLUMNS` constant (14 column names)
- Exported `assertParquetColumns(meta: { schema: { name: string }[] }): void` — a pure function that throws `Error('records.parquet schema mismatch: missing column "${col}"')` when any expected column is absent from `meta.schema.slice(1).map(el => el.name)`. Exporting it makes the validator unit-testable without mocking `fetch`.
- In `loadParquet()`, after `const arrayBuffer = await res.arrayBuffer()`, calls `const meta = parquetMetadata(arrayBuffer)` then `assertParquetColumns(meta)` BEFORE the file object construction (correct per Pitfall 4 — `parquetMetadata` takes ArrayBuffer, not the file object)
- Typed all signatures: `loadParquet(slug: string): Promise<OccurrenceRecord[]>`, `filterRecords(records, filters): OccurrenceRecord[]`, `aggregateByMonth(records): number[]`
- `(r.year as number)` and `(r.elevation_ft as number)` boundary casts preserve the documented null-coercion behavior in `filterRecords` (null coerces to 0 in numeric comparisons, matching existing tests)
- `(counts[idx] ?? 0) + 1` pattern for `noUncheckedIndexedAccess` in `aggregateByMonth`
- Existing `try/catch`-and-throw path unchanged (D-05)

### Task 2: Convert pnwm-filter-bar.js → .ts with typed CustomEvent<FilterChangeDetail> (MIG-04)

Converted `src/components/pnwm-filter-bar.js` to `src/components/pnwm-filter-bar.ts` via `git mv`. Key additions:

- Expanded Lit import: `type PropertyDeclarations, type CSSResult, type TemplateResult`
- Updated import specifier: `./parquet-cache.js` → `./parquet-cache.ts`
- Added `import type { OccurrenceRecord }` and `import type { FilterChangeDetail }` from `../types/index.ts`
- `static get properties(): PropertyDeclarations` — getter form preserved per D-06
- `static get styles(): CSSResult` — typed return
- 13 instance fields declared above constructor with type annotations (D-08 / Pitfall 1)
- `connectedCallback(): Promise<void>` with `OccurrenceRecord[]` and `Set<string>` types
- `_dispatchFilterChange(): void` dispatch site typed as `new CustomEvent<FilterChangeDetail>('pnwm-filter-change', {...8 fields...})` (D-09)
- All 8 event handlers typed as `_onXChange(e: Event): void` with `e.target as HTMLSelectElement/HTMLInputElement` narrowing
- `render(): TemplateResult` and `_onClearFilters(e: Event): void`
- No decorators; `customElements.define('pnwm-filter-bar', PnwmFilterBar)` kept at tail (D-06/D-07)

### Task 3: Rename test files to .ts and add SCHEMA-08 validator tests

Renamed all three test files via `git mv`:
- `parquet-cache.test.js` → `parquet-cache.test.ts`
- `filters.test.js` → `filters.test.ts`
- `phenology.test.js` → `phenology.test.ts`

In each file:
- Updated import specifier from `./parquet-cache.js` to `./parquet-cache.ts`
- Added `import type { OccurrenceRecord }` for test data casts
- Applied `as unknown as OccurrenceRecord[]` casts to partial test objects (the documented boundary cast — test data only has the fields under test, not all 14 OccurrenceRecord fields)

In `parquet-cache.test.ts`, added `assertParquetColumns` import and a new `describe('Parquet column validator')` block with two SCHEMA-08 test cases:
1. `passes for a complete column set` — builds a fabricated meta with root group element + all 14 column names, asserts `doesNotThrow`
2. `throws when a required column is missing` — builds meta missing `collection`, asserts `throws` matching `/schema mismatch/`

**Auto-fixed (Rule 1):** `yearMax only filter` assertion in `filters.test.ts` had incorrect semantics after adding explicit null checks. Original asserted `r.year === undefined || r.year <= 2010` — with TypeScript, needed to understand that null year records pass through `yearMax` filter (null > 2010 = 0 > 2010 = false). Fixed to `r.year == null || r.year <= 2010`.

All 35 tests pass under `node --test` with no additional loader.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect yearMax assertion in filters.test.ts after type migration**
- **Found during:** Task 3 test run
- **Issue:** Converting `r.year === undefined || r.year <= 2010` to TypeScript required explicit null handling. My initial version `r.year === undefined || (r.year != null && r.year <= 2010)` incorrectly excluded null year records from the "pass" condition. Null year records are NOT filtered by `yearMax` because `(null as number) > 2010` = `0 > 2010` = false, so they pass through.
- **Fix:** Changed assertion to `r.year == null || r.year <= 2010` — null and undefined both pass the `==` check, correctly expressing "non-numeric year values are not filtered by yearMax"
- **Files modified:** `src/components/filters.test.ts`
- **Commit:** d3bfff0a

**2. [Rule 2 - Missing critical functionality] noUncheckedIndexedAccess in aggregateByMonth**
- **Found during:** Task 1 typecheck
- **Issue:** `counts[r.month - 1]++` returns `number | undefined` under `noUncheckedIndexedAccess: true`
- **Fix:** Changed to `counts[idx] = (counts[idx] ?? 0) + 1` with `const idx = r.month - 1`
- **Files modified:** `src/components/parquet-cache.ts`
- **Commit:** dee07a25

## Self-Check

### Created Files Exist
- [x] `src/components/parquet-cache.ts` — exists
- [x] `src/components/pnwm-filter-bar.ts` — exists
- [x] `src/components/parquet-cache.test.ts` — exists
- [x] `src/components/filters.test.ts` — exists
- [x] `src/components/phenology.test.ts` — exists

### Files Removed
- [x] `src/components/parquet-cache.js` — removed
- [x] `src/components/pnwm-filter-bar.js` — removed
- [x] `src/components/parquet-cache.test.js` — removed
- [x] `src/components/filters.test.js` — removed
- [x] `src/components/phenology.test.js` — removed

### Commits Exist
- [x] dee07a25 — feat(37-02): convert parquet-cache.js to .ts with O(columns) column validator (SCHEMA-08)
- [x] 4806cf14 — feat(37-02): convert pnwm-filter-bar.js to .ts with typed CustomEvent<FilterChangeDetail> (MIG-04)
- [x] d3bfff0a — feat(37-02): rename parquet-related test files to .ts and add SCHEMA-08 validator tests

### Verification Results
- [x] `grep -c "parquetMetadata" src/components/parquet-cache.ts` = 5 (import + calls)
- [x] `grep -c "export function assertParquetColumns" src/components/parquet-cache.ts` = 1
- [x] `grep -c "CustomEvent<FilterChangeDetail>" src/components/pnwm-filter-bar.ts` = 1
- [x] `grep -c "@customElement\|@property\|@state" src/components/pnwm-filter-bar.ts` = 0 (no decorators)
- [x] `grep -c "static get properties" src/components/pnwm-filter-bar.ts` = 1 (getter form)
- [x] `grep -c "customElements.define('pnwm-filter-bar'" src/components/pnwm-filter-bar.ts` = 1
- [x] `grep -c "parquet-cache.js" src/components/*.test.ts` = 0 (all specifiers updated)
- [x] `grep -c "assertParquetColumns" src/components/parquet-cache.test.ts` = 3 (import + 2 test uses)
- [x] `npm run typecheck` exits 0 with zero errors
- [x] `node --test src/components/parquet-cache.test.ts src/components/filters.test.ts src/components/phenology.test.ts` passes (35/35)

## Self-Check: PASSED

## Known Stubs

None — this plan converts existing functionality to TypeScript. No new UI data flows introduced; existing data flows are type-annotated not restructured.

## Threat Flags

None — no new runtime/network security surface introduced beyond the T-37-02 mitigation already planned and implemented (the `assertParquetColumns` validator is the mitigation for T-37-02 in the plan's threat register).
