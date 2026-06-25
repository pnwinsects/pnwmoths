---
phase: 39-key-matrix-data-pipeline
plan: 02
subsystem: data-pipeline
tags: [key-matrix, ci, gzip, byte-budget, copy-script, github-actions]
dependency_graph:
  requires:
    - phase: 39-01
      provides: scripts/build-key.ts, data/key-matrix.json
  provides:
    - scripts/copy-key-matrix.ts
    - scripts/check-key-weight.ts
    - scripts/check-key-weight.test.ts
    - package.json (build:key, build:copy-key-matrix, build:check-key-weight scripts + wired build chain)
    - .github/workflows/deploy.yml (key-matrix CI steps)
    - .github/workflows/pr-check.yml (key-matrix CI steps, identical to deploy.yml)
  affects:
    - Phase 40 (filter logic — build chain now enforces key-matrix.json is always fresh in _site/)
    - Phase 41 (identify page loads _site/key-matrix.json after Eleventy)
tech-stack:
  added: []
  patterns:
    - post-Eleventy copy script (copy-key-matrix.ts mirrors copy-parquet.ts — single-file variant)
    - gzip byte-budget hard gate (check-key-weight.ts exits non-zero on bloat; unlike check-page-weight.ts which only warns)
    - env override seam (KEY_MATRIX_PATH + KEY_BUDGET_BYTES) for unit-testable weight gate
    - spawnSync test pattern for exit-code assertions (mirrors check-page-weight.test.ts)
key-files:
  created:
    - scripts/copy-key-matrix.ts
    - scripts/check-key-weight.ts
    - scripts/check-key-weight.test.ts
  modified:
    - package.json
    - .github/workflows/deploy.yml
    - .github/workflows/pr-check.yml
    - data/key-coverage-report.json (timestamp-only update from e2e re-run)
key-decisions:
  - "D-06 enforced: gzip <= 50 KB hard gate (not raw bytes, not warn-only) via zlib.gzipSync"
  - "Both CI workflows (deploy.yml + pr-check.yml) updated identically — no build:validate-links added to CI"
  - "src/types/schemas.test.ts added to test script (was missing despite existing from Plan 01)"
  - "Task 3 is verification-only: no code changes needed; build:key ran in 236ms (well under 5s KEY-05)"

patterns-established:
  - "Weight gate pattern: KEY_MATRIX_PATH + KEY_BUDGET_BYTES env overrides make check-key-weight.ts testable without touching real _site/"
  - "copy-key-matrix.ts: use copyFile + mkdir (not recursive cp) for single-file post-Eleventy copy"

requirements-completed: [KEY-04, KEY-05, MATCH-03]

duration: ~15min
completed: 2026-06-25
---

# Phase 39 Plan 02: Build/CI Wiring for Key Matrix Pipeline Summary

**`build:key` + `copy-key-matrix.ts` + gzip gate wired into `npm run build` and both GitHub Actions workflows; artifact ships at 41.1 KB gzip (< 50 KB), pipeline runs in 236ms (< 5s), `npm test` 291/291 green.**

## Performance

- **Duration:** ~15 minutes
- **Started:** 2026-06-25T00:04:21Z
- **Completed:** 2026-06-25T00:15:00Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified + 1 data file timestamp update)

## Accomplishments

- `copy-key-matrix.ts` ships `data/key-matrix.json` to `_site/` post-Eleventy (mirrors `copy-parquet.ts`)
- `check-key-weight.ts` hard-gates gzip size at 50 KB via `zlib.gzipSync` — exits non-zero on bloat (KEY-04), unlike warn-only `check-page-weight.ts`
- `npm run build` chain and both CI workflows updated identically with `build:key` (after `build:data`, before `build:eleventy`) and `build:copy-key-matrix` + `build:check-key-weight` (after `build:copy-parquet`)
- E2E verification: `build:key` 236ms (KEY-05), 41.1 KB gzip (KEY-04), `matrix.length=237`, `species=1192`, `nav_image` field present on all matched species (MATCH-03)

## Task Commits

1. **Task 1: Post-Eleventy copy + gzip byte-budget gate** - `e0a43f74` (feat)
2. **Task 2: Wire package.json + both GitHub Actions workflows** - `9c3aa38a` (feat)
3. **Task 3: End-to-end build verification (artifact ships, gate runs, <5s)** - `30c11588` (chore)

## Files Created/Modified

- `scripts/copy-key-matrix.ts` — post-Eleventy copy `data/key-matrix.json` -> `_site/key-matrix.json`; `mkdir` + `copyFile` (not recursive `cp`)
- `scripts/check-key-weight.ts` — gzip hard gate; reads `KEY_MATRIX_PATH` / `KEY_BUDGET_BYTES` env overrides (defaults `_site/key-matrix.json` / `50*1024`); exits 1 on missing artifact or > budget
- `scripts/check-key-weight.test.ts` — 3 tests (under-budget exit 0, over-budget exit 1 via 1-byte budget, missing artifact exit 1) using `spawnSync`
- `package.json` — +3 build scripts; build chain wired; test script adds `build-key.test.ts`, `check-key-weight.test.ts`, `src/types/schemas.test.ts`
- `.github/workflows/deploy.yml` — build chain updated with three new steps
- `.github/workflows/pr-check.yml` — identical update; confirmed both chains match byte-for-byte

## Decisions Made

- `check-key-weight.ts` uses `KEY_BUDGET_BYTES='1'` as the over-budget test fixture (not large random data), since gzip of repetitive strings collapses to ~45 bytes and a 100-byte budget would pass. A 1-byte budget guarantees failure for any real artifact.
- `src/types/schemas.test.ts` added to `test` script — it existed from Plan 01 but was not included in the explicit test file list (the `src/types/` directory has no glob coverage in the original test script).
- Task 3 is verification-only; `scripts/build-key.ts` did not require changes (236ms < 5s budget, gzip 41.1KB < 50KB budget).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added src/types/schemas.test.ts to test script**
- **Found during:** Task 2 (package.json wiring)
- **Issue:** Plan 01 created `src/types/schemas.test.ts` (21 schema tests) but did not add it to the `test` script. The file was executed via glob only incidentally if a `src/types/*.test.ts` glob existed — but the current test script uses only `src/components/*.test.ts` and `src/_lib/*.test.ts`. The plan explicitly noted to check and add if missing.
- **Fix:** Added `src/types/schemas.test.ts` to the explicit `node --test` file list in package.json alongside `build-key.test.ts` and `check-key-weight.test.ts`.
- **Files modified:** `package.json`
- **Verification:** `npm test` runs 291 tests including all CharacterSchema / KeySpeciesSchema / KeyMatrixSchema tests.
- **Committed in:** `9c3aa38a` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed test fixture for over-budget case**
- **Found during:** Task 1 test run
- **Issue:** Initial test used `'x'.repeat(10 * 1024)` with a 100-byte budget, expecting gzip to exceed 100 bytes. But gzip compresses 10KB of identical bytes to ~45 bytes (highly repetitive), so the test passed exit 0 instead of exit 1.
- **Fix:** Changed budget to 1 byte (`KEY_BUDGET_BYTES: '1'`) so any real artifact's gzip (minimum ~20-30 bytes for gzip header + content) exceeds the budget.
- **Files modified:** `scripts/check-key-weight.test.ts`
- **Verification:** `node --test scripts/check-key-weight.test.ts` → 3/3 pass.
- **Committed in:** `e0a43f74` (Task 1 commit, fixed before commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both necessary for correctness. No scope creep.

## Issues Encountered

- Plan's Task 2 verification command used line-number comparison (`grep -n ... | cut -d: -f1` and `test "$k" -lt "$e"`) to assert ordering, but the build chains in both CI workflow files are single-line. All steps appear on the same line number, so the comparison fails. String-content ordering was verified instead via `grep -qP` with a regex spanning both steps. The actual chain ordering in the files is correct.

## Known Stubs

None introduced in this plan. (Plan 01 stubs: `image_filename: null` on all 237 characters and `common_name: null` on all species — tracked in 39-01-SUMMARY.md.)

## Threat Flags

None. This plan adds no new network endpoints, auth paths, or trust boundaries. T-39-04, T-39-05, T-39-06 mitigated per plan (gzip gate exits non-zero; both CI workflows updated identically; existsSync guard on missing artifact).

## Self-Check: PASSED

Files exist:
- scripts/copy-key-matrix.ts: exists
- scripts/check-key-weight.ts: exists
- scripts/check-key-weight.test.ts: exists
- package.json: build:key, build:copy-key-matrix, build:check-key-weight scripts present
- .github/workflows/deploy.yml: build:check-key-weight present
- .github/workflows/pr-check.yml: build:check-key-weight present

Commits:
- e0a43f74: feat(39-02): add copy-key-matrix.ts, check-key-weight.ts, and gate tests
- 9c3aa38a: feat(39-02): wire build:key, copy-key-matrix, check-key-weight into build chain + CI
- 30c11588: chore(39-02): e2e verification — build:key 236ms, gzip 41.1KB, npm test 291/291

## Next Phase Readiness

- `_site/key-matrix.json` is a first-class build artifact gated by CI
- Phase 40 (filter logic TDD) can read `data/key-matrix.json` directly; the build pipeline ensures it's always rebuilt before Eleventy
- Phase 41 (identify page) can load `_site/key-matrix.json` after the full build chain runs

---
*Phase: 39-key-matrix-data-pipeline*
*Completed: 2026-06-25*
