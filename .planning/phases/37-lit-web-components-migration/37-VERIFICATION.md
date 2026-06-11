---
phase: 37-lit-web-components-migration
verified: 2026-06-10T21:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "SC-5: fresh post-fix build confirmed data files byte-identical and HTML diffs only in asset-hash references"
    - "SC-1/WR-01: two as unknown as TileSourceSpecifier casts eliminated via new openseadragon.d.ts module augmentation (commit 7d6d8f77)"
  gaps_remaining: []
  regressions: []
---

# Phase 37: Lit Web Components Migration — Verification Report

**Phase Goal:** All Lit web components in `src/components/` are converted to strict TypeScript (consumer side); the `pnwm-filter-change` event is typed via a shared `FilterChangeDetail` interface; dynamically-fetched data is validated at load time by structure (not per-row), with only a minimal validator (`zod/mini`) in the client bundle, never full Zod.
**Verified:** 2026-06-10T21:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (2026-06-10)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No `.js` source remains in `src/components/`; all tests renamed to `.test.ts`; typecheck exits 0; no `@ts-ignore` or `allowJs` in production source; no unguarded `as unknown as` (SC-1) | ✓ VERIFIED | `ls src/components/*.js` returns nothing; `npm run typecheck` exits 0; `npm test` passes 225/225; zero `@ts-ignore` grep result; `allowJs` absent from both tsconfigs. WR-01 resolved: commit `7d6d8f77` removed both `as unknown as TileSourceSpecifier` casts and introduced `src/types/openseadragon.d.ts` module augmentation declaring the missing `open(tileSources: string, initialPage?: number): Viewer` overload. `grep -rn "as unknown as" src/ --include="*.ts"` (excluding test/d.ts) returns zero occurrences. |
| 2 | `FilterChangeDetail` defined in `src/types/` with 8 fields; used as `CustomEvent<FilterChangeDetail>` at the `pnwm-filter-bar` dispatch site; global `HTMLElementEventMap` declaration merge in `src/types/events.ts` (SC-2) | ✓ VERIFIED | `src/types/events.ts` contains `export interface FilterChangeDetail` (8 fields confirmed) and `declare global { interface HTMLElementEventMap { 'pnwm-filter-change': CustomEvent<FilterChangeDetail> } }`; `pnwm-filter-bar.ts:122` dispatches `new CustomEvent<FilterChangeDetail>('pnwm-filter-change', ...)`; occurrence-map and phenology-chart expose `filters: Partial<FilterChangeDetail> | null` typed property |
| 3 | Two O(columns/shape) load-time validators exist: `assertParquetColumns` in `parquet-cache.ts` uses `parquetMetadata()` column schema (not row array); `validateSpeciesStates` in `pnwm-taxon-browser.ts` checks Array.isArray + single-element probe; both throw on mismatch (SC-3) | ✓ VERIFIED | `assertParquetColumns` reads `meta.schema.slice(1)` — O(columns); `validateSpeciesStates` checks `!Array.isArray(rows)` then `SpeciesStateSchema.safeParse(rows[0])` — O(1); `grep -c "z.array(" pnwm-taxon-browser.ts` = 0; tests pass 5/5 for validator cases |
| 4 | Production bundle contains no full classic Zod (`ZodError`/`ZodType` non-`$`-prefixed absent); only `zod/mini` ships; gzip delta over baseline recorded (SC-4) | ✓ VERIFIED | Fresh build: `grep -cP '(?<!\$)ZodError\|(?<!\$)ZodType'` on new bundle = 0; `ZodMiniType` present; gzip 125,178 bytes vs baseline 121,833 bytes = +3,345 bytes (+2.7%); 225/225 tests pass |
| 5 | Build-generated data files byte-identical to `_site_baseline/`; rendered HTML differs only in content-hashed asset filenames (SC-5) | ✓ VERIFIED | Fresh `npm run build` on post-fix HEAD: all `.parquet`/`.json` data files byte-identical to `_site_baseline/` (empty diff); 1537/1537 differing files are `.html`; 0 non-HTML differing files; no non-asset `Only in` entries (all new files are re-hashed `/assets/` bundles); across all 1537 differing HTML files every changed line is an asset-hash reference (`main-*.js`, `index-*.js/css`, modulepreload/crossorigin) — zero prose/markup changes |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/schemas.ts` | zod/mini-only schemas; `import * as z from 'zod/mini'`; no classic zod | ✓ VERIFIED | Line 6: `import * as z from 'zod/mini'`; zero `.nullable()` chained calls; zero `.int()` calls; zero `from 'zod'` |
| `src/types/events.ts` | `FilterChangeDetail` (8 fields) + `HTMLElementEventMap` merge | ✓ VERIFIED | All 8 fields present; `declare global { interface HTMLElementEventMap ... }` present |
| `src/types/index.ts` | Re-exports both `./schemas.ts` and `./events.ts` | ✓ VERIFIED | `export * from './schemas.ts'; export * from './events.ts'` |
| `src/types/openseadragon.d.ts` | Module augmentation declaring `open(tileSources: string, initialPage?: number): Viewer` overload | ✓ VERIFIED | Introduced in commit `7d6d8f77`; eliminates the need for `as unknown as TileSourceSpecifier` casts entirely |
| `src/components/parquet-cache.ts` | `assertParquetColumns` uses `parquetMetadata()`; exports `loadParquet`, `filterRecords`, `aggregateByMonth` | ✓ VERIFIED | `parquetMetadata` imported and called; `assertParquetColumns` exported; all 3 functions exported |
| `src/components/pnwm-filter-bar.ts` | Dispatches `CustomEvent<FilterChangeDetail>` with 8 fields | ✓ VERIFIED | Line 122: `new CustomEvent<FilterChangeDetail>('pnwm-filter-change', { detail: {...8 fields...} })` |
| `src/components/pnwm-taxon-browser.ts` | `validateSpeciesStates` + `SchemaValidationError` exported; O(1) probe; hard-fail on schema mismatch | ✓ VERIFIED | Both exported; `safeParse(rows[0])` probe confirmed; re-throw on `instanceof SchemaValidationError` confirmed |
| `src/components/pnwm-image-slideshow.ts` | No unguarded `as unknown as` (SC-1 constraint) | ✓ VERIFIED | Commit `7d6d8f77` removed both casts; both call sites now call `this._osdViewer?.open(this._buildDziUrl(spec))` with no cast; `grep -rn "as unknown as" src/ --include="*.ts"` returns zero occurrences in production source |
| `src/components/main.ts` | All 8 side-effect imports use `.ts` specifiers | ✓ VERIFIED | All 8 specifiers end in `.ts`; no `.js` imports |
| `package.json` | Test glob updated to `*.test.ts` | ✓ VERIFIED | `src/components/*.test.ts` in test script; no `.test.js` reference |
| `_site_baseline/` | Pre-Phase-37 snapshot for SC-5 comparison | ✓ VERIFIED | `_site_baseline/assets/main-mhZWKs7f.js` exists; parquet files present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/types/index.ts` | `src/types/events.ts` | `export * from './events.ts'` | ✓ WIRED | Line 5 confirmed |
| `src/types/events.ts` | global `HTMLElementEventMap` | `declare global` augmentation | ✓ WIRED | Lines 18–22 confirmed |
| `src/components/pnwm-filter-bar.ts` | `FilterChangeDetail` | `new CustomEvent<FilterChangeDetail>` at dispatch | ✓ WIRED | Line 122 confirmed |
| `src/components/pnwm-taxon-browser.ts` | `SpeciesStateSchema.safeParse(rows[0])` | O(1) single-element probe | ✓ WIRED | Lines 39–44 confirmed |
| `src/components/pnwm-occurrence-map.ts` | `parquet-cache.ts loadParquet` | `import { loadParquet, filterRecords } from './parquet-cache.ts'` | ✓ WIRED | Line 4 confirmed |
| `src/components/pnwm-phenology-chart.ts` | `parquet-cache.ts loadParquet` | `import { loadParquet, filterRecords, aggregateByMonth } from './parquet-cache.ts'` | ✓ WIRED | Line 11 confirmed |
| `src/components/main.ts` | all 8 component `.ts` modules | side-effect imports | ✓ WIRED | All 8 imports present with `.ts` specifiers |
| `src/types/openseadragon.d.ts` | `pnwm-image-slideshow.ts` OSD `open()` call sites | module augmentation satisfies `open(string)` overload | ✓ WIRED | Commit `7d6d8f77`; both call sites now type-check without casts; `npm run typecheck` exit 0 |
| Post-fix source | `_site/` bundle | `npm run build` | ✓ WIRED | Fresh build on post-fix HEAD confirmed; `_prefix` getter in bundle now uses `\|\|` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `pnwm-taxon-browser.ts` | `_stateMap` / `_statesAvailable` | `validateSpeciesStates` → `buildStateMap` → CDN `species-states.json` fetch | Yes — real CDN fetch, validated at load time | ✓ FLOWING |
| `parquet-cache.ts` | `records: OccurrenceRecord[]` | `parquetReadObjects()` after `assertParquetColumns()` metadata check | Yes — real Parquet rows after column validation | ✓ FLOWING |
| `pnwm-occurrence-map.ts` | `filters: Partial<FilterChangeDetail>` | Set by `species.njk` inline script on `pnwm-filter-change` event → `FilterChangeDetail` typed detail | Yes — typed `e.detail` from typed dispatch | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| No `.js` source in `src/components/` | `ls src/components/*.js` | No output | ✓ PASS |
| Typecheck exits 0 | `npm run typecheck` | Exit 0, no errors | ✓ PASS |
| Full test suite passes | `npm test` | 225/225 pass, 0 fail | ✓ PASS |
| `FilterChangeDetail` defined with 8 fields | `grep -c "export interface FilterChangeDetail" src/types/events.ts` | 1 | ✓ PASS |
| `HTMLElementEventMap` merge present | `grep -c "interface HTMLElementEventMap" src/types/events.ts` | 1 | ✓ PASS |
| zod/mini only (non-`$`-prefixed ZodError absent) | `grep -cP '(?<!\$)ZodError\|(?<!\$)ZodType'` on fresh bundle | 0 | ✓ PASS |
| zod/mini confirmed in bundle | `grep -c "ZodMiniType"` on fresh bundle | 1 | ✓ PASS |
| No `z.array(` O(rows) parse in taxon-browser | `grep -c "z.array(" src/components/pnwm-taxon-browser.ts` | 0 | ✓ PASS |
| O(1) safeParse probe present | `grep -c "safeParse" src/components/pnwm-taxon-browser.ts` | 1 | ✓ PASS |
| `_prefix` uses `\|\|` (not `??`) in source | `grep "_prefix" src/components/pnwm-taxon-browser.ts` | Line 106: `\|\| '/'` | ✓ PASS |
| `_prefix` uses `\|\|` (not `??`) in fresh bundle | confirmed on fresh post-fix build | `??` absent from `_prefix` getter | ✓ PASS |
| `as unknown as` absent from production source | `grep -rn "as unknown as" src/ --include="*.ts"` (excl. test/d.ts) | Zero occurrences | ✓ PASS |
| SC-5 data files byte-identical | `diff -rq _site_baseline/ _site/` filtering `.parquet`/`.json` | Empty (no diff) | ✓ PASS |
| SC-5 HTML diffs only in asset-hash refs | 1537 differing HTML files, all changes are `main-*.js`/`index-*.js/css` lines | Zero prose/markup changes | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MIG-04 | 37-01, 37-02, 37-03, 37-04, 37-05 | All Lit web components in `src/components/` converted to TS; `pnwm-filter-change` event typed via shared `FilterChangeDetail` | ✓ SATISFIED | All 10 component files exist as `.ts`; no `.js` source remains; `FilterChangeDetail` typed at dispatch site and used as `Partial<FilterChangeDetail>` at listener property sites |
| SCHEMA-08 | 37-01, 37-02, 37-04 | Dynamically-fetched data validated at load time by structure (O(columns)), not per-row | ✓ SATISFIED | `assertParquetColumns` in `parquet-cache.ts` (O(columns) via `parquetMetadata`); `validateSpeciesStates` in `pnwm-taxon-browser.ts` (O(1) via `Array.isArray` + `safeParse(rows[0])`); both throw on mismatch (D-05); test suite confirms behavior |

---

### Anti-Patterns Found

No blockers. No warnings remaining.

- WR-01 (`as unknown as TileSourceSpecifier` in `pnwm-image-slideshow.ts`): resolved in commit `7d6d8f77` via `src/types/openseadragon.d.ts` module augmentation. Zero cast occurrences in production source.
- Stale bundle anti-pattern: resolved. Fresh build on post-fix HEAD confirms `_prefix` getter compiles with `||`.

No `TBD`, `FIXME`, or `XXX` markers found in any production source file touched by this phase.

---

## Per-Success-Criterion Summary

### SC-1: No `.js` source; tests via `node --test`; zero `tsc --noEmit` errors; no `@ts-ignore`, `allowJs`; no unguarded `as unknown as`

**Status: ✓ VERIFIED**

- `ls src/components/*.js` → no output (PASS)
- `npm run typecheck` → exit 0 (PASS)
- `npm test` → 225/225 pass (PASS)
- `grep -rc "@ts-ignore" src/components/*.ts | grep -v ':0'` → empty (PASS)
- `allowJs` absent from both tsconfigs (PASS)
- Test glob `src/components/*.test.ts` in `package.json` (PASS)
- `grep -rn "as unknown as" src/ --include="*.ts"` (excl. test/d.ts) → zero occurrences (PASS) — WR-01 resolved via module augmentation in `src/types/openseadragon.d.ts` (commit `7d6d8f77`)

### SC-2: `FilterChangeDetail` defined + used at dispatch; `HTMLElementEventMap` merge exists

**Status: ✓ VERIFIED**

- `src/types/events.ts` has `export interface FilterChangeDetail` with 8 fields (PASS)
- `declare global { interface HTMLElementEventMap { 'pnwm-filter-change': CustomEvent<FilterChangeDetail> } }` present (PASS)
- `pnwm-filter-bar.ts:122`: `new CustomEvent<FilterChangeDetail>('pnwm-filter-change', { detail: {...8 fields...} })` (PASS)
- `pnwm-occurrence-map.ts` and `pnwm-phenology-chart.ts` both declare `filters: Partial<FilterChangeDetail> | null` (PASS)

### SC-3: Two O(columns/shape) validators; neither `z.array().parse()`; both throw on mismatch

**Status: ✓ VERIFIED**

- `assertParquetColumns` in `parquet-cache.ts`: reads `parquetMetadata(arrayBuffer)`, checks `meta.schema.slice(1)` column names — O(columns) (PASS)
- `validateSpeciesStates` in `pnwm-taxon-browser.ts`: `!Array.isArray(rows)` + `SpeciesStateSchema.safeParse(rows[0])` — O(1) (PASS)
- `grep -c "z.array(" pnwm-taxon-browser.ts` = 0 — no O(rows) parse (PASS)
- `SchemaValidationError` re-thrown in `connectedCallback` catch (hard-fail per D-05) (PASS)
- Test suite: 5 validator cases pass (non-array, null, wrong element shape, valid, empty array) (PASS)

### SC-4: No full-Zod in bundle; gzip delta recorded

**Status: ✓ VERIFIED**

- `grep -cP '(?<!\$)ZodError|(?<!\$)ZodType'` on fresh bundle = 0 (PASS)
- `$ZodError` / `$ZodType` in bundle are zod v4 internal symbols present in zod/mini itself — not the full classic-zod public API
- `ZodMiniType` count = 1 (zod/mini confirmed in bundle) (PASS)
- Gzip: 125,178 bytes post-migration vs 121,833 bytes baseline = +3,345 bytes (+2.7%) (PASS, recorded)

### SC-5: Data byte-identical; HTML identical modulo content-hash; test suite confirms features unchanged

**Status: ✓ VERIFIED**

- `_site_baseline/` exists with pre-Phase-37 snapshot (PASS)
- Fresh `npm run build` on post-fix HEAD (commit `7d6d8f77`): all `.parquet`/`.json` data files byte-identical to `_site_baseline/` (empty diff) (PASS)
- 1537/1537 differing files are `.html`; 0 non-HTML differing files (PASS)
- No non-asset `Only in` entries — all new files are re-hashed `/assets/` bundles (PASS)
- Across all 1537 differing HTML files, every changed line is an asset-hash reference (`main-*.js`, `index-*.js/css`, modulepreload/crossorigin) — zero prose/markup changes (PASS)
- 225/225 test suite green (PASS)

---

_Initially verified: 2026-06-10T21:00:00Z_
_Re-verified: 2026-06-10 (gap closure: SC-5 post-fix build + WR-01 cast elimination via commit 7d6d8f77)_
_Verifier: Claude (gsd-verifier)_
