---
phase: 37-lit-web-components-migration
reviewed: 2026-06-10T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - src/types/schemas.ts
  - src/types/events.ts
  - src/types/index.ts
  - src/components/parquet-cache.ts
  - src/components/pnwm-taxon-browser.ts
  - src/components/pnwm-filter-bar.ts
  - src/components/pnwm-occurrence-map.ts
  - src/components/pnwm-phenology-chart.ts
  - src/components/pnwm-image-slideshow.ts
  - src/components/pnwm-occurrence-popup.ts
  - src/components/pnwm-plate-viewer.ts
  - src/components/glossary-tooltip.ts
  - src/components/main.ts
  - eleventy.config.ts
  - package.json
  - src/types/schemas.test.ts
  - src/components/parquet-cache.test.ts
  - src/components/filters.test.ts
  - src/components/phenology.test.ts
  - src/components/pnwm-image-slideshow.test.ts
  - src/components/pnwm-taxon-browser.test.ts
  - src/components/main.js (deleted — verified via git diff)
  - src/components/parquet-cache.js (deleted — verified via git diff)
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-06-10
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Phase 37 is a TypeScript rename-and-annotate migration of `src/components/*.js` plus two genuinely new runtime validators at CDN trust boundaries. All 10 component files, 5 test files, `src/types/schemas.ts`, `src/types/events.ts`, `src/types/index.ts`, `eleventy.config.ts`, and `package.json` were reviewed.

The validators are correct at the stated design point: `assertParquetColumns` is O(columns) (reads Parquet footer via `parquetMetadata()`), and `validateSpeciesStates` is O(1)/O(shape) (probes `rows[0]` only, per D-03). The zod/mini migration is mechanically correct — all schemas converted, `z.infer<>` types are preserved, `safeParse()` error structure compatible with `verify-parquet.ts`. The `FilterChangeDetail` declaration merge is sound. The build is verified working (225 tests passing, SC-4 grep clean, SC-5 byte-identical).

Three warnings and two info items were found. No blockers. All findings are in production source files; test file usages of `as unknown as` are excluded per review scope.

---

## Warnings

### WR-01: `as unknown as TileSourceSpecifier` violates "no unguarded as unknown as T" constraint

**File:** `src/components/pnwm-image-slideshow.ts:337` and `:345`
**Issue:** `_prevSpecimen()` and `_nextSpecimen()` both cast the DZI URL string to `TileSourceSpecifier` via `as unknown as import('openseadragon').TileSourceSpecifier`. The constraint from 37-CONTEXT.md (hard constraints block) is "no unguarded `as unknown as T`". A comment explains the rationale (OSD runtime accepts strings; `@types/openseadragon` TileSourceSpecifier excludes raw strings), but the constraint is written without a "documented" exception clause. At runtime there is no actual type mismatch — OSD.open() genuinely accepts DZI URL strings — so this is not a correctness issue. However, it sets a precedent and the cast silently bypasses the type system at a public API call site.

**Fix:** Use an explicit overload or a typed helper to avoid the double cast. If `@types/openseadragon` is insufficient, an ambient module augmentation or a minimal hand-typed wrapper is cleaner:
```typescript
// Option 1: local function that asserts a well-known OSD runtime behavior
function dziUrlAsTileSource(url: string): import('openseadragon').TileSourceSpecifier {
  // OSD.open() accepts DZI URL strings at runtime; @types/openseadragon omits this overload.
  return url as unknown as import('openseadragon').TileSourceSpecifier;
}
// Then: this._osdViewer?.open(dziUrlAsTileSource(this._buildDziUrl(spec)));
```
This isolates the cast to one named function with a single documented justification, rather than two inline double-casts.

---

### WR-02: `_prefix` getter changes `||` to `??` — subtle SC-5 behavior drift

**File:** `src/components/pnwm-taxon-browser.ts:106`
**Issue:** The original JS used `this['path-prefix'] || '/'` (falsy fallback — treats empty string `''` as absent). The TypeScript conversion uses `?? '/'` (nullish fallback — `''` would pass through as the prefix). This is a behavior change when `path-prefix=""` is set. In practice the only template usage is `path-prefix="{{ '/' | url }}"` which always yields `'/'` or `'/pnwmoths/'`, so the empty-string case is unreachable. But SC-5 requires behavior-identical conversion, and this quietly widens the accepted input range — if a future template sets `path-prefix=""`, the component would issue fetch requests against empty-string-prefixed URLs (e.g. `species-states.json` rather than `/species-states.json`) and silently fail to load state data rather than falling back to `'/'`.
```typescript
// Original JS behavior (falsy fallback — matches SC-5):
get _prefix(): string {
  return (this as unknown as Record<string, string>)['path-prefix'] || '/';
}
```

---

### WR-03: `species-states.json` fetch does not check `res.ok` before calling `res.json()`

**File:** `src/components/pnwm-taxon-browser.ts:130-131`
**Issue:** The fetch of `species-states.json` calls `res.json()` without first checking `res.ok`. An HTTP 404 or 500 response body is typically an HTML error page; `res.json()` would throw a `SyntaxError` (not the custom `SchemaValidationError`) which is caught by the outer catch block and silently swallowed as a "network error" (soft degradation). This is the same behavior as the original JS, so it is not a regression. However, the new `SchemaValidationError` hard-fail path and the D-05 intent ("showing no data beats silently wrong data") would be better served by checking `res.ok`, which would make all failure modes explicit:
```typescript
const res = await fetch(`${this._prefix}species-states.json`);
if (!res.ok) throw new Error(`species-states.json: fetch failed ${res.status}`);
const rows: unknown = await res.json();
```
`loadParquet()` in `parquet-cache.ts` already has this check at line 54. The asymmetry between the two dynamic fetches is a consistency gap. Network failures for `species-states.json` should produce the same explicit throw path as `loadParquet()` failures.

---

## Info

### IN-01: Duplicate import from the same module in `pnwm-filter-bar.ts`

**File:** `src/components/pnwm-filter-bar.ts:3-4`
**Issue:** Two separate `import type` statements import from `'../types/index.ts'`:
```typescript
import type { OccurrenceRecord } from '../types/index.ts';
import type { FilterChangeDetail } from '../types/index.ts';
```
These can be merged. Not harmful at runtime, but `noUnusedLocals` / linter tools may flag the duplication in future.
**Fix:**
```typescript
import type { OccurrenceRecord, FilterChangeDetail } from '../types/index.ts';
```

---

### IN-02: `Math.random()` in Lit `render()` produces non-deterministic shadow DOM

**File:** `src/components/pnwm-phenology-chart.ts:81`
**Issue:** The skeleton loading state renders 12 bars with heights generated by `Math.floor(Math.random() * 60 + 20)`. This was present in the original JS and is not a regression. However, it means: (1) the loading skeleton re-renders to a different layout on every update cycle while `_loading` is true; (2) if server-side rendering or test snapshots are ever added, the output is non-deterministic. The bars are purely decorative (`aria-hidden="true"`), so there is no accessibility impact now.
**Fix:** Use a fixed repeating pattern or seeded heights to make the skeleton deterministic:
```typescript
// Fixed heights: visually varied but stable across renders
const SKELETON_HEIGHTS = [25, 40, 55, 70, 60, 45, 50, 65, 55, 35, 40, 30];
// ...
${MONTHS.map((_, i) => html`
  <div style="flex:1;background:...;height:${SKELETON_HEIGHTS[i]}px;..."></div>
`)}
```

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
