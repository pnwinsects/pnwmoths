---
phase: 36-eleventy-data-files-config-migration
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - eleventy.config.ts
  - eleventy.config.test.ts
  - src/_data/species.ts
  - src/_data/glossary.ts
  - src/_data/taxon.ts
  - src/_data/images.ts
  - src/_data/plates.ts
  - src/_data/speciesPhotos.ts
  - src/types/eleventy.d.ts
  - scripts/build-data.test.ts
  - tsconfig.node.json
  - package.json
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-06-09
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the Phase 36 JS-to-TypeScript migration of `src/_data/*.ts` and `eleventy.config.ts`. The migration is technically sound: no `@ts-ignore`, no `allowJs`, no `as unknown as` double-casts, and the `GITHUB_PAGES` pathPrefix conditional is both preserved and test-asserted. The `addDataExtension("ts")` wiring, `--config=eleventy.config.ts` flags, execFile path repoints, and `taxon.d.ts` deletion all landed correctly.

One warning-level finding: the `as TaxonFamily[]` cast in `taxon.ts` papers over a real type mismatch (`TaxonFamilyBuild.name: string | null` vs `TaxonFamily.name: string`). This is documented and intentional, but it violates the phase's "no unguarded casts" bar when the cast is over a known schema deviation rather than a narrow projection. The remaining findings are informational: one style inconsistency in `images.ts`, two dead-code/redundancy observations in `taxon.ts`, and a DuckDB lifecycle inconsistency across data files that mirrors the original JS behavior.

The byte-identical build gate passed and all 218 tests pass. No behavior regressions were introduced.

## Warnings

### WR-01: `taxon.ts` casts `TaxonFamilyBuild[]` to `TaxonFamily[]` across a real schema mismatch

**File:** `src/_data/taxon.ts:257`
**Issue:** `TaxonFamilyBuild.name` is `string | null` (deliberately, to accommodate the 2.8% of species with `family = null` in the CSV), while `TaxonFamily.name` from the Zod schema is `string` (non-nullable). The single `as TaxonFamily[]` cast is TypeScript-legal (the types overlap sufficiently), but it lies to downstream consumers: anything receiving `TaxonFamily[]` and accessing `.name` will get `null` at runtime for those entries, even though the type says `string`. The `CONTEXT.md` acceptance criterion specifically calls out "no unguarded `as unknown as T`"; this is a single cast, not a double, but it coerces over a real runtime discrepancy.

The downstream impact is limited because Nunjucks renders `null` as an empty string (`{{ family.name }}` in `browse/index.njk` is safe), and the `pnwm-taxon-browser.js` already guards `subfam.name` but does not guard `family.name`. A `null` family name used as a `Set<string>` member produces a `null` key (not the string `"null"`), which would cause the expand/collapse logic to silently fail for null-family entries in the browser component — though those entries presumably appear in both JS and TS builds identically.

**Fix:** Either widen `TaxonFamilySchema.name` to `z.string().nullable()` in `src/types/schemas.ts` (making the schema match reality) or introduce a local `TaxonFamilyOut` return type with `name: string | null` so the lie stays inside `taxon.ts` rather than propagating through a public type:

```typescript
// Option A: widen the exported return type to reflect the actual data
export default async function (): Promise<Array<Omit<TaxonFamily, 'name'> & { name: string | null }>> {
  // ...
  return families; // no cast needed
}

// Option B: keep TaxonFamily but make the cast explicit with a comment referencing the data gap
// (current approach is acceptable if the schema can't be changed — just document it with a
//  cast-suppression comment so the next reader knows this is load-bearing)
```

Option A is the structurally honest fix. If changing the schema is blocked, Option B (the current approach) is acceptable but should have an explicit `// eslint-disable-next-line @typescript-eslint/no-unsafe-return` (or equivalent) comment so the cast is visibly intentional, not an oversight.

## Info

### IN-01: `images.ts` imports from `"fs"` instead of `"node:fs"`

**File:** `src/_data/images.ts:1`
**Issue:** `import { readFileSync } from "fs"` uses the bare specifier while every other file in the same directory (`plates.ts`, `speciesPhotos.ts`) and the config (`eleventy.config.ts`) consistently use the `"node:"` prefix. Under `"moduleResolution": "NodeNext"` both work, but mixing them is inconsistent and the `node:` prefix is the project convention.
**Fix:** Change to `import { readFileSync } from "node:fs";`.

### IN-02: `TaxonGenusBuild` adds no fields over `TaxonGenus` — pure alias

**File:** `src/_data/taxon.ts:51-53`
**Issue:**
```typescript
interface TaxonGenusBuild extends TaxonGenus {
  // no extra fields beyond TaxonGenus
}
```
`TaxonGenusBuild` extends `TaxonGenus` with no additions. It exists only to be referenced from `TaxonSubfamilyBuild.genera: TaxonGenusBuild[]` and `TaxonSubfamilyBuild.genusMap?: Record<string, TaxonGenusBuild>`. Using `TaxonGenus` directly in those positions is structurally identical and removes a hollow intermediary type.
**Fix:** Replace `TaxonGenusBuild` references in `TaxonSubfamilyBuild` with `TaxonGenus` and delete the `TaxonGenusBuild` interface.

### IN-03: DuckDB `db.closeSync()` called inconsistently across data files

**File:** `src/_data/glossary.ts:53`
**Issue:** `glossary.ts` calls both `conn.closeSync()` and `db.closeSync()` (line 52–53), matching its original `glossary.js`. `species.ts` and `taxon.ts` each call only `conn.closeSync()`, also matching their JS predecessors. Since these are `:memory:` databases that are GC'd when the function returns, omitting `db.closeSync()` has no observable effect. However, the inconsistency may cause confusion about the intended lifecycle pattern.

This is a faithful migration of the original JS behavior and not a regression. Noting it for completeness.
**Fix:** Either add `db.closeSync()` after `conn.closeSync()` in `species.ts` (line 77) and `taxon.ts` (line 157) for consistency, or remove it from `glossary.ts`. Consistency with `glossary.ts` is the path of least surprise:
```typescript
conn.closeSync();
db.closeSync();  // add to species.ts and taxon.ts for consistency
```

### IN-04: `isSpeciesDbRow` guard validates `similar_slugs` is an array but not that elements are strings

**File:** `src/_data/species.ts:24`
**Issue:** The type guard asserts `Array.isArray(r['similar_slugs'])` to narrow to `string[]`, but does not verify that array elements are strings. This matches the Phase 34/35 guard template (which also does not check element types). At runtime DuckDB's `string_split()` returns a list of VARCHAR values, so the element types are reliably strings. The guard is correct for the current data. Worth noting in case the query changes to return heterogeneous arrays.
**Fix:** Acceptable as-is. If a deeper guard is desired, add: `Array.isArray(r['similar_slugs']) && r['similar_slugs'].every((x: unknown) => typeof x === 'string')`.

---

_Reviewed: 2026-06-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
