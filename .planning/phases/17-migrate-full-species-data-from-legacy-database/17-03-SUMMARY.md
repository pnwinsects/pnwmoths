---
phase: 17-migrate-full-species-data-from-legacy-database
plan: "03"
subsystem: data-pipeline
tags: [migration, build, testing, csv, deduplication]
dependency-graph:
  requires: [17-02]
  provides: [verified-full-pipeline, clean-build]
  affects: [data/species.csv, data/records.csv, scripts/migrate-species.js]
tech-stack:
  added: []
  patterns: [slug-deduplication, worktree-node-modules-symlink]
key-files:
  created: []
  modified:
    - scripts/migrate-species.js
    - data/species.csv
    - data/records.csv
decisions:
  - Deduplicate species by normalized slug (safeSpecies) before seenSlugs check
  - Exclude skipped species' records from records.csv to prevent orphaned-record validation failure
  - Create node_modules symlink in worktree (worktree-only, not committed) to resolve openseadragon path
metrics:
  duration: "~45 minutes"
  completed: "2026-04-22"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 17 Plan 03: Full Pipeline Verification Summary

One-liner: Fixed 5 duplicate-slug species in migrate-species.js and verified npm test (72/72) and npm run build (1,364 species pages) both exit 0.

## What Was Built

- Verified `npm test` passes without modifying `build-data.test.js` (no stub-specific assertions to update — all tests passed on first run)
- Diagnosed and fixed a `build:eleventy` failure caused by 5 duplicate DB species producing identical output slugs
- Re-ran `migrate-species.js` to regenerate `data/species.csv` (1,348 rows) and `data/records.csv` (85,933 rows)
- Ran full `npm run build` (all 8 pipeline steps) to completion; `_site/species/` has 1,364 directories

## Task Outcomes

### Task 1: npm test — diagnose and fix test failures

**Result:** No changes to `build-data.test.js` were needed. All 72 tests passed on the first run without modification. Both `acronicta-americana` and `hyles-lineata` exist in the full dataset (as expected). No exact-count stub assertions were present.

### Task 2: npm run build — verify full pipeline

**Result:** Build passed after fixing the duplicate-slug bug in `migrate-species.js` and creating a `node_modules` symlink in the worktree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate species slugs causing Eleventy permalink conflict**
- **Found during:** Task 2 (build:eleventy failed with `DuplicatePermalinkOutputError`)
- **Issue:** 5 DB species pairs produced the same output slug. One case (`lacinipolia-rectilinea?`) was masked because the slug computation used raw `sp.species` (with trailing `?`) before sanitization — so `seenSlugs` saw `lacinipolia-rectilinea?` as distinct from `lacinipolia-rectilinea`. The other 4 pairs were image-slug conflicts (species 2768/2769/2776/1497 had images pointing to different species' filenames).
- **Fix:** Compute `safeSpecies` (stripping `?`, truncating at `-`) BEFORE deriving the fallback slug. Track `skippedSpeciesIds` and exclude those species' records from `records.csv` to prevent orphaned-record validation failures.
- **Duplicates resolved:** 5 pairs: `lacinipolia-rectilinea`/`?`, `lacinipolia-olivacea`/bucketti, `enargia-fausta`/infumata, `smerinthus-cerisyi`/ophthalmica, `nycteola-frigidana`/frigidana(second)
- **Files modified:** `scripts/migrate-species.js`, `data/species.csv`, `data/records.csv`
- **Commit:** 343f84b

**2. [Rule 3 - Blocker] Missing node_modules in worktree caused copy-images.js to fail**
- **Found during:** Task 2 (`build:eleventy` failed because `pnwm-copy-images` Vite plugin ran `copy-images.js` which used `resolve('node_modules/openseadragon/...')` relative to worktree CWD)
- **Issue:** Git worktrees don't inherit the parent's `node_modules/` directory. The worktree had no `node_modules/` and `resolve('node_modules/...')` resolved to a non-existent path.
- **Fix:** Created a symlink `worktree/node_modules -> /Users/rainhead/dev/pnwmoths/node_modules`. This symlink is NOT committed (it's worktree-specific and already excluded by `.gitignore node_modules/`). The symlink needs to be present for future builds in this worktree.
- **Files modified:** (symlink only — not tracked in git)

## Final State

| Metric | Value |
|--------|-------|
| species.csv rows | 1,348 |
| records.csv rows | 85,933 |
| _site/species/ directories | 1,364 |
| npm test | 72/72 pass |
| npm run build exit code | 0 |
| build-data.test.js modified | No |
| Duplicate slugs in species.csv | 0 |

## Known Stubs

None — all data is real production data from the legacy MySQL dump.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check

- [x] `scripts/migrate-species.js` modified with deduplication fix
- [x] `data/species.csv` regenerated (1,348 rows, no duplicate slugs)
- [x] `data/records.csv` regenerated (85,933 rows, no orphaned slugs)
- [x] Commit 343f84b exists
- [x] `_site/species/` has 1,364 directories (>= 1,300 requirement)
- [x] `npm test` 72/72 pass
- [x] `npm run build` exits 0

## Self-Check: PASSED
