---
status: complete
phase: quick-260627-kdt
plan: "01"
subsystem: data-pipeline
tags: [withholding, gating, TDD, Geometridae]
decisions:
  - "JS-side filter via shared Set predicate (not SQL) — one consistent predicate across all three choke points; no injection surface"
  - "guard Eleventy .ts data extension parser to skip *.test.ts files"
key_files:
  created:
    - data/withheld-families.csv
    - src/_lib/withheld-families.ts
    - src/_lib/withheld-families.test.ts
    - src/_data/species.test.ts
    - scripts/check-withheld.ts
    - scripts/check-withheld.test.ts
  modified:
    - src/_data/species.ts
    - src/_data/taxon.ts
    - scripts/build-key.ts
    - package.json
    - eleventy.config.ts
    - src/_lib/key-filter.test.ts
    - src/components/key-results-grid.test.ts
    - data/key-matrix.json
    - data/key-coverage-report.json
metrics:
  completed: "2026-06-27"
  tasks: 3
---

# Phase quick-260627-kdt Plan 01: Withhold-Families Gating Summary

**One-liner:** Data-driven family embargo via `data/withheld-families.csv` — a shared JS predicate filters all three choke points (species collection, Browse tree, Identify key) with a build-time gate that hard-fails on any leak.

## Tasks Completed

| # | Name | Commit | Type |
|---|------|--------|------|
| 1 | Create the data-driven withhold list and shared loader | `5cf9059a` | feat |
| 2 | Apply the withhold filter at all three choke points | `1236339e` | feat |
| 3 | Build-time leak gate (pages + key matrix) | `25d93b9d` | feat |

## What Was Built

### data/withheld-families.csv
Single source of truth for the family embargo. `family` header + one row `Geometridae`. Lifting the embargo is deleting that row. No other data file is touched.

### src/_lib/withheld-families.ts
Shared loader and predicate used at all three choke points:
- `loadWithheldFamilies(csvPath?)` — returns `Set<string>` of lowercased family names; gracefully returns empty set if file is missing (non-throwing).
- `isWithheld(family, withheld)` — case/whitespace-insensitive predicate; returns false for null/undefined.

### Three choke points patched
- `src/_data/species.ts` — `isWithheld()` guard in post-query JS loop (`continue` before push).
- `src/_data/taxon.ts` — `isWithheld()` guard when building `speciesRows` array (before family-tree build).
- `scripts/build-key.ts` — `isWithheld()` filter on `speciesRows` before building `siteSlugSet`; withheld binomials resolve to null → land in `unmatchedBinomials` → excluded from key-matrix.json.

### scripts/check-withheld.ts
Build-time gate inserted after `build:eleventy` in the `build` chain:
- Reads `data/withheld-families.csv` (empty → skip, exit 0).
- Computes withheld slugs from `data/species.csv`.
- PAGE GATE: asserts no `_site/species/<slug>/index.html` exists for any withheld slug.
- KEY-MATRIX GATE: asserts no `data/key-matrix.json` species entry matches a withheld slug.
- Exits 1 with actionable slug-listing message on any leak.
- Exports pure `findLeaks()` helper for unit testing.

### Eleventy test-file guard
`eleventy.config.ts` `.ts` data extension parser now skips `*.test.ts` files to prevent test assertion side-effects during Eleventy builds.

## key-matrix.json Content Change

Exactly **1 Geometridae species** was previously matched in the Lucid key: `euthyatira-lorata`.

| Metric | Before | After |
|--------|--------|-------|
| matchedSpecies | 1192 | 1191 |
| unmatchedSpecies | 36 | 37 |
| euthyatira-lorata in species[] | yes | no (in unmatchedBinomials) |

The other 98 Geometridae species in `data/species.csv` were already unmatched in the key (no key entry existed for them). `euthyatira-lorata` is now correctly listed in `unmatchedBinomials` alongside the other 36 pre-existing unmatched binomials.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Guard] Eleventy .ts parser runs test files as data files**
- **Found during:** Task 3 (one-line release check with empty withheld-families.csv)
- **Issue:** `eleventyConfig.addDataExtension("ts")` picks up ALL `.ts` files in `src/_data/`, including `species.test.ts`. When Eleventy imports and runs it, node:test assertions execute as a side effect, printing test output during `build:eleventy`.
- **Fix:** Added a `filePath.endsWith(".test.ts")` early-return guard to the `.ts` parser in `eleventy.config.ts`.
- **Files modified:** `eleventy.config.ts`
- **Commit:** `25d93b9d`

**2. [Rule 1 - Stale Regression Constants] key-filter.test.ts and key-results-grid.test.ts**
- **Found during:** Task 3 `npm test` after running `npm run build`
- **Issue:** Both test files hard-code `1192` and `862` as expected species/WA counts. These are now wrong because `euthyatira-lorata` was removed from key-matrix.json (1192→1191, 862→861 for WA selection).
- **Fix:** Updated expected values and added comments explaining the change.
- **Files modified:** `src/_lib/key-filter.test.ts`, `src/components/key-results-grid.test.ts`
- **Commit:** `25d93b9d`

**3. [Rule 2 - Test Isolation] check-withheld.test.ts used real _site for "no pages" assertion**
- **Found during:** Task 3 RED→GREEN (test run before full rebuild)
- **Issue:** Two test cases used `resolve(ROOT, '_site')` expecting certain slugs to have no pages, but the stale build still had those pages from before the filter was applied.
- **Fix:** Changed those tests to use a temp empty siteDir (`mkdirSync` temp), making them build-state independent.
- **Files modified:** `scripts/check-withheld.test.ts`
- **Commit:** `25d93b9d`

## Verification Results

1. `npm test` — 415/415 tests pass
2. `npm run typecheck` — clean (both browser and node tsconfigs)
3. `npm run build` — completes; `build:check-withheld` passes with 0 leaks
4. `_site/species/` contains NO Geometridae `index.html` pages (99 withheld directories have only `records.parquet` from unfiltered `build:copy-parquet` — expected, out of scope per plan)
5. `data/key-matrix.json` contains 1191 matched species (no Geometridae slugs)
6. `keyMatrix.ts` was NOT modified
7. `data/species.csv` unchanged — 99 Geometridae rows still present
8. One-line release check: removed `Geometridae` row → `build:key` matched 1192 (restored slug), `build:eleventy` wrote `euthyatira-lorata` pages, `check-withheld` skipped cleanly → then restored row

## Known Stubs

None.

## Threat Flags

The `build:copy-parquet` step copies `records.parquet` files for ALL species (including withheld) to `_site/species/<slug>/records.parquet`. These directories exist at predictable URLs but contain no HTML page linking to them and are not indexed by Pagefind. This is an accepted minimal-risk residual — out of scope per the plan's threat model (T-quick-02 is satisfied by the page-emission and key-matrix gates).

## Self-Check: PASSED

- `data/withheld-families.csv` — exists, contains `Geometridae`
- `src/_lib/withheld-families.ts` — exists
- `src/_lib/withheld-families.test.ts` — exists
- `src/_data/species.test.ts` — exists
- `scripts/check-withheld.ts` — exists
- `scripts/check-withheld.test.ts` — exists
- Commits `5cf9059a`, `1236339e`, `25d93b9d` — confirmed in git log
