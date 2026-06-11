---
phase: 38-ci-gate-full-verification
plan: "03"
subsystem: testing
tags: [bash, diff, perl, typescript, ci, milestone, evidence]

requires:
  - phase: 38-ci-gate-full-verification (plan 01)
    provides: scripts/compare-sites.sh and scripts/check-ts-only.sh
  - phase: 38-ci-gate-full-verification (plan 02)
    provides: CI gates wired into pr-check.yml and deploy.yml

provides:
  - .planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md — committed one-shot proof + v3.0 declaration
  - .planning/REQUIREMENTS.md — all five Phase 38 reqs (MIG-05, MIG-06, CI-01, CI-02, CI-03) marked Complete
  - .planning/ROADMAP.md — Phase 38 marked Complete 2026-06-10; v3.0 milestone closed

affects:
  - v3.0 milestone closure (all 6 phases of Phases 33-38 are now Complete)

tech-stack:
  added: []
  patterns:
    - "One-shot milestone proof: run locally, record real output in a committed evidence doc; do NOT wire as a recurring CI step (D-01 framing)"
    - "GNU diff --include workaround: macOS GNU diff 3.12 does not support --include; use find+diff loop instead"

key-files:
  created:
    - .planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md
  modified:
    - scripts/compare-sites.sh
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "compare-sites.sh Bucket A fixed: GNU diff 3.12 does not support --include=*.parquet; replaced with find+diff loop — proof result unchanged (all parquet files byte-identical)"
  - "CI-02 satisfied by local one-shot evidence (D-01): pre-migration baseline stops being meaningful after milestone ships; only the MIG-06 guard is a recurring permanent gate"
  - "CI-03 observed, not gated (D-07): 3.0s build:data is well within budget; no hard-failing timer added to avoid flaky CI on variance"
  - "Test count is 225, not stale ~191: reflects full .ts migration + package.json glob update from 38-01"

duration: 15min
completed: "2026-06-10"
---

# Phase 38 Plan 03: Milestone Evidence & v3.0 Completion Summary

**One-shot byte-identical proof run locally (3.0s build:data, DATA: byte-identical, HTML: identical modulo content-hash), all five Phase 38 requirements marked Complete, v3.0 TypeScript migration milestone declared shipped**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-06-10
- **Tasks:** 3
- **Files modified:** 4 (MILESTONE-EVIDENCE.md created; compare-sites.sh fixed; REQUIREMENTS.md and ROADMAP.md updated)

## Accomplishments

- Rebuilt `_site/` from source after Phase 37 migration; verified baseline freshness (no `data/` changes since baseline built 2026-06-10 11:48)
- Ran `bash scripts/compare-sites.sh` — Bucket A: DATA: byte-identical; Bucket B: HTML: identical modulo content-hash; exit 0
- Ran `{ time npm run build:data }` — 3.0s wall-clock; well under 60s budget (CI-03 satisfied, D-07: no timer assertion added)
- `npm test`: 225 tests, 0 failures; `npm run typecheck`: exit 0; `bash scripts/check-ts-only.sh`: exit 0
- `MILESTONE-EVIDENCE.md` created with all real measurements, D-01/D-07 rationale captions, and v3.0 completion declaration
- REQUIREMENTS.md: CI-03 checkbox and traceability row updated to Complete (all five Phase 38 reqs now Complete)
- ROADMAP.md: Phase 38 checked, 225-test count corrected, Progress table row -> Complete 2026-06-10

## Task Commits

1. **Bug fix: compare-sites.sh Bucket A** - `1a3b732a` (fix) — deviant from original task order, committed immediately on discovery
2. **Tasks 1+2: Run proofs, write MILESTONE-EVIDENCE.md** - `6e0e41e7` (feat)
3. **Task 3: Mark requirements Complete, declare v3.0 done** - `9e270f42` (chore)

## Files Created/Modified

- `scripts/compare-sites.sh` — Bug fix: replaced `diff --include=*.parquet` (not supported on GNU diff 3.12) with `find`+`diff` loop; proof result identical
- `.planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md` — New: all real measurements, CI-02/CI-03/MIG-06 proof sections, D-01/D-07 captions, v3.0 completion declaration
- `.planning/REQUIREMENTS.md` — CI-03 checkbox `[x]`; traceability table row `Complete`
- `.planning/ROADMAP.md` — Phase 38 summary `[x]`; 38-03 wave-3 entry `[x]`; Progress table `Complete 2026-06-10`

## Decisions Made

- **compare-sites.sh --include fix:** GNU diff 3.12 (installed on this macOS machine) does not support `--include`; BSD diff also lacks it. Replaced Bucket A's `diff -r --include=*.parquet` with a `find`+`diff` loop. The loop finds all `.parquet` files in `_site/species/`, diffs each against the baseline counterpart, and prints the relative path of any that differ. On a clean tree, no output → "DATA: byte-identical" is printed. The proof result and semantics are identical.
- **CI-02 one-shot framing preserved:** MILESTONE-EVIDENCE.md explicitly labels the `compare-sites.sh` run as a ONE-SHOT local proof (D-01). The annotation in REQUIREMENTS.md does not claim a recurring CI gate exists for CI-02; the evidence doc is the backing artifact.
- **CI-03 observation-only:** The 3.0s measurement is recorded in MILESTONE-EVIDENCE.md with an explicit "NO timer assertion added" caption (D-07). The 60s budget is satisfied; no code was changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unsupported `--include` flag in compare-sites.sh Bucket A diff**
- **Found during:** Task 1 execution — `bash scripts/compare-sites.sh` printed `diff: unrecognized option '--include=*.parquet'` and never printed "DATA: byte-identical"
- **Issue:** GNU diff 3.12 does not support `--include`; the `&&` chain caused the "DATA: byte-identical" line to be skipped (diff returned non-zero), but `set -e` did not abort because the failure was in a `&&` chain, so the script reached "PROOF COMPLETE" with a false result
- **Fix:** Replaced `diff -r _site/species/ _site_baseline/species/ --include="*.parquet"` with a `find`+`diff` loop that individually compares each `.parquet` file; collects differing paths in `$DIFFERING` and exits 1 if any differ
- **Files modified:** `scripts/compare-sites.sh`
- **Commit:** `1a3b732a`

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correctness — without the fix, the script silently skipped the Bucket A result; the bug was introduced at script-authoring time (RESEARCH.md did not test for `--include` support on macOS's installed diff binary)

## Issues Encountered

None beyond the `--include` flag issue (resolved above).

## User Setup Required

None.

## Next Phase Readiness

- v3.0 milestone is COMPLETE: all 6 phases (33–38) have all plans shipped
- Four permanent CI gates are active: typecheck, test, TS-only guard, verify:parquet
- The `_site_baseline/` working-tree snapshot can be removed (it served its one-time purpose)
- No follow-on v3.0 work remains; see STATE.md Deferred Items for TSF-01/02/03 post-migration improvements

---
*Phase: 38-ci-gate-full-verification*
*Completed: 2026-06-10*
