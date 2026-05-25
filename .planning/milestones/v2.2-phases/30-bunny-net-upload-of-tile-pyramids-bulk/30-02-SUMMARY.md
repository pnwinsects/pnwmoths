---
phase: 30-bunny-net-upload-of-tile-pyramids-bulk
plan: 02
subsystem: infra
tags: [runbook, operator-docs, bunny-net, upload, dzi, tile-pyramid]

# Dependency graph
requires:
  - phase: 30-bunny-net-upload-of-tile-pyramids-bulk
    plan: 01
    provides: "scripts/upload-tiles.js CLI with exact output format strings documented in 30-01-SUMMARY"
  - phase: 29-dzi-tile-generation-pipeline-bulk
    provides: "status=tiled rows in manifest + var/tiles DZI corpus (D-02/D-03 recovery semantics)"
provides:
  - "_instructions/UPLOADING_TILES.md — operator runbook for Phase 30 bulk upload"
affects:
  - phase-31 (next-phase-handoff section describes CDN URL convention for data integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator runbook mirrors TILING_HIGH_RES_PHOTOS.md section structure for consistent pipeline operator experience"

key-files:
  created:
    - _instructions/UPLOADING_TILES.md
  modified: []

key-decisions:
  - "Removed 'maderas' references entirely — plan action conflicted with acceptance criteria; used 'on this laptop' / 'local laptop' phrasings instead"
  - "All 9 required section headings match the plan spec exactly; verified with grep"

patterns-established:
  - "Upload runbook section ordering: What This Changes → Prerequisites → Configuration → Dry-Run → Full Pipeline → Resume → Troubleshooting → Verification → Next Phase Handoff"

requirements-completed: [UPLOAD-01, UPLOAD-02, UPLOAD-03]

# Metrics
duration: 3min
completed: 2026-05-23
---

# Phase 30 Plan 02: UPLOADING_TILES.md Summary

**353-line operator runbook for the Phase 30 bunny.net bulk tile upload, with 9 sections mirroring TILING_HIGH_RES_PHOTOS.md, exact CLI output strings from upload-tiles.js, and ROADMAP SC-4 curl -I Pull Zone spot-check**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-23T18:50:55Z
- **Completed:** 2026-05-23T18:53:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `_instructions/UPLOADING_TILES.md` — 353 lines, 9 sections, matches the structure and tone of `_instructions/TILING_HIGH_RES_PHOTOS.md`
- Quoted all CLI output strings verbatim from `scripts/upload-tiles.js` and `30-01-SUMMARY.md` (DRY_RUN format, pre-flight footprint check, logStage format, progress summary, final summary)
- Covers all acceptance criteria: BUNNY_API_KEY (8 occurrences), CDN URLs (5 occurrences), curl -I spot-check (ROADMAP SC-4), var/tiles (10 occurrences), tmux new -s upload, Phase 31 handoff, git add data/species-photos-manifest.csv
- Explicitly states "runs locally on this laptop only — not on any remote server" (multiple phrasings; no remote-server paths)
- Documents UPLOAD-02 (24-row checkpoint window, whole-directory re-upload, idempotent PUT) and UPLOAD-03 (pre-flight footprint cross-reference against bunny.net pricing) per plan requirements

## Task Commits

1. **Task 1: Write _instructions/UPLOADING_TILES.md** — `cd494e2e` (docs)

## Files Created/Modified

- `_instructions/UPLOADING_TILES.md` — operator runbook, 353 lines, 9 sections

## Decisions Made

- Removed "maderas" references: the plan's `<action>` section said to write "NOT on maderas", but the `<acceptance_criteria>` required `grep -i 'maderas'` to return 0 matches. Applied the acceptance criteria as the authoritative constraint and used equivalent phrasings ("on this laptop", "runs locally on this laptop") to satisfy the locality statement requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `maderas` references to satisfy acceptance criteria**
- **Found during:** Task 1 (writing and verifying the runbook)
- **Issue:** Plan `<action>` instructed writing "NOT on maderas or any remote server", but `<acceptance_criteria>` required `grep -i 'maderas'` to return 0 matches — a direct contradiction.
- **Fix:** Used equivalent locality phrasings that satisfy both the acceptance criteria's 0-match requirement and the locality-statement requirement ("on this laptop", "runs locally on this laptop only").
- **Files modified:** `_instructions/UPLOADING_TILES.md`
- **Verification:** `grep -i 'maderas' _instructions/UPLOADING_TILES.md` returns 0; `grep -E 'local laptop|runs locally|on this laptop' _instructions/UPLOADING_TILES.md` returns 3 matches.
- **Committed in:** `cd494e2e`

---

**Total deviations:** 1 auto-fixed (Rule 1 — contradiction between plan action and acceptance criteria; acceptance criteria took precedence)
**Impact on plan:** No functional impact. The operator receives the same correct guidance about local-only execution.

## Issues Encountered

None beyond the plan-internal contradiction described above.

## Verification Criteria Confirmed

All acceptance criteria pass:

| Criterion | Required | Actual |
|---|---|---|
| File exists | yes | yes |
| Line count ≥ 180 | ≥ 180 | 353 |
| Section count | exactly 9 `## ` | 9 |
| `npm run photos:upload` | ≥ 3 | 7 |
| `DRY_RUN=1 npm run photos:upload` | ≥ 1 | 1 |
| `BUNNY_API_KEY` | ≥ 4 | 8 |
| `https://pnwmoths.b-cdn.net/species-tiles/` | ≥ 3 | 5 |
| `https://la.storage.bunnycdn.com` | ≥ 1 | 1 |
| `curl -I https://pnwmoths.b-cdn.net/species-tiles/` | ≥ 1 | 2 |
| `var/tiles` | ≥ 2 | 10 |
| `maderas` | 0 | 0 |
| `/var/lib/pnwmoths` | 0 | 0 |
| Local pipeline statement | ≥ 1 | 3 |
| `tmux new -s upload` | ≥ 1 | 1 |
| Pre-flight | ≥ 2 | 5 |
| `Phase 31` | ≥ 1 | 5 |
| `git add data/species-photos-manifest.csv` | ≥ 1 | 1 |

## Next Phase Readiness

- **Phase 30 is complete.** Both plans are done:
  - Plan 01: `scripts/upload-tiles.js` + `scripts/upload-tiles.test.js` (191 tests passing) + `package.json` `photos:upload` alias
  - Plan 02: `_instructions/UPLOADING_TILES.md` operator runbook
- Phase 30 is ready for `/gsd:verify-work`
- **Phase 31** (data/species-photos.json build integration) reads `status: uploaded` rows from the manifest; the CDN URL convention `https://pnwmoths.b-cdn.net/species-tiles/{slug}/{specimen_id}-{view}/` is documented in the runbook's Next Phase Handoff section

## Known Stubs

None — the runbook contains no placeholder text, no TODO/FIXME markers, and no empty data sources. All CLI output strings are quoted verbatim from the actual script.

## Threat Flags

No new security surface. The runbook:
- Uses `xxxxx` placeholder for `BUNNY_API_KEY` in all example commands (T-30.02-01 mitigated)
- References only `var/tiles` (local) paths, never `/var/lib/pnwmoths` or any remote-server path (T-30.02-02 mitigated)
- Documents the 24-row checkpoint window and ENOENT recovery procedure explicitly (T-30.02-03 mitigated)

## Self-Check: PASSED

- FOUND: `_instructions/UPLOADING_TILES.md` (353 lines)
- FOUND commit: `cd494e2e`
- All 9 section headings present and in correct order
- All acceptance criteria pass (verified above)

---
*Phase: 30-bunny-net-upload-of-tile-pyramids-bulk*
*Completed: 2026-05-23*
