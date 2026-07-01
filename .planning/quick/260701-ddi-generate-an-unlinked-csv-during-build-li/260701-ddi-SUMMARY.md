---
phase: quick-260701-ddi
plan: 01
subsystem: build-pipeline
tags: [audit, csv, diagnostics, build-step]
requires:
  - src/_lib/unpublished-species.ts (normalizeSlug, loadUnpublishedSpecies)
  - src/_lib/withheld-families.ts (loadWithheldFamilies, isWithheldOrUnclassified)
  - data/species.csv, data/records.csv, data/key-matrix.json
provides:
  - build:species-audit → _site/species-audit.csv (unlinked per-species audit)
affects:
  - package.json (build + test chains)
tech-stack:
  added: []
  patterns: [pure-row-builder + DuckDB/loader-wired main(), dependency-free RFC-4180 CSV]
key-files:
  created:
    - scripts/emit-species-audit.ts
    - scripts/emit-species-audit.test.ts
  modified:
    - package.json
decisions:
  - Reused stats.ts visibility predicate (isWithheldOrUnclassified + unpublished deny-list) verbatim — visible column is bug-for-bug identical
  - Kept toCsv dependency-free (RFC-4180) despite csv-stringify being available, to keep the serializer a pure unit-testable export per plan
metrics:
  duration: ~12 minutes
  completed: 2026-07-01
---

# Quick Task 260701-ddi: Unlinked species-audit CSV build step — Summary

Added an **unlinked** diagnostic build step `build:species-audit` that emits
`_site/species-audit.csv` — one row per `data/species.csv` species with three
boolean flags (`has_records`, `visible`, `in_key`) reconciling the species
registry, occurrence records, visibility gates, and the identification key. The
file is referenced by no template or nav; it exists purely for curators to audit
coverage via a direct URL.

## What was built

- **`scripts/emit-species-audit.ts`** — pure `buildSpeciesAuditRows()` +
  dependency-free `toCsv()` + DuckDB/loader-wired `main()`. The `visible` flag
  reuses `isWithheldOrUnclassified(family, withheldFamilies)` and the unpublished
  deny-list, so it matches the `stats.ts` `shown` CTE exactly. All three joins
  (records / key / deny-list) run slugs through `normalizeSlug()` so space and
  hyphen forms (`aseptis-sp no 1` ↔ `aseptis-sp-no-1`) reconcile to one row.
- **`scripts/emit-species-audit.test.ts`** — 9 `node:test` cases covering flag
  computation, withheld family, deny-list, blank/null family fail-closed, slug
  reconciliation, sort order, and RFC-4180 quoting (comma + doubled quote).
- **`package.json`** — `build:species-audit` added to the top-level `build` chain
  immediately after `build:species-states`; test registered in the `test` list.

## Verification results

- `node --test scripts/emit-species-audit.test.ts` → 9 pass, 0 fail.
- `npm run typecheck` → exit 0.
- `npm run build:species-audit` → `Wrote 1431 species to _site/species-audit.csv`.
  Data rows (1431) equal `data/species.csv` data rows (1431).
- Header line: `slug,genus,species,common_name,family,subfamily,has_records,visible,in_key`
- First data row: `abagrotis-apposita,Abagrotis,apposita,,Noctuidae,Noctuinae,true,true,true`
- Spot-checks: all Geometridae rows `visible=false` (0 visible=true); deny-listed
  `aseptis-sp-no-1` → `visible=false` with `has_records=true` (as predicted).
- `grep -rn "species-audit" src eleventy.config.ts` → no matches (stays unlinked).
- `_site/species-audit.csv` is gitignored (build artifact, not committed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Non-null assertions in test for `noUncheckedIndexedAccess`**
- **Found during:** Task 3 typecheck (`npm run typecheck`).
- **Issue:** `tsconfig.node.json` enables `noUncheckedIndexedAccess`; `rows[0].slug`
  style access in the new test file was `TS2532: Object is possibly 'undefined'`.
- **Fix:** Added non-null assertions (`rows[0]!.slug`) to the index accesses in
  `scripts/emit-species-audit.test.ts`. No production-code change; tests still pass.
- **Files modified:** scripts/emit-species-audit.test.ts
- **Commit:** 459a54ea (amended into the test commit)

## Commits

- `f4c27d47` feat(quick-260701-ddi): add emit-species-audit build script
- `459a54ea` test(quick-260701-ddi): unit-test emit-species-audit pure helpers
- `3c207ca4` chore(quick-260701-ddi): wire build:species-audit into build + test

## Self-Check: PASSED

- FOUND: scripts/emit-species-audit.ts
- FOUND: scripts/emit-species-audit.test.ts
- FOUND commit: f4c27d47
- FOUND commit: 459a54ea
- FOUND commit: 3c207ca4
