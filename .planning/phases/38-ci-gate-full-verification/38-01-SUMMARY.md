---
phase: 38-ci-gate-full-verification
plan: "01"
subsystem: testing
tags: [bash, shell, grep, diff, perl, typescript, ci, package.json]

requires:
  - phase: 37-lit-components-migration
    provides: full TS migration of src/components/ — the tree check-ts-only.sh now guards

provides:
  - scripts/check-ts-only.sh — permanent MIG-06 TS-only invariant guard (4 guards, exits 0 on clean tree)
  - scripts/compare-sites.sh — one-shot D-03 two-bucket byte-identical proof helper (Parquet/JSON strict + HTML Perl-normalized)
  - package.json test globs narrowed to .ts-only (MIG-05 cleanup)

affects:
  - 38-02 (wires check-ts-only.sh into pr-check.yml CI step)
  - 38-03 (runs compare-sites.sh locally for milestone proof evidence)

tech-stack:
  added: []
  patterns:
    - "FAIL accumulator pattern in bash: set -e at top for safety, FAIL=0 manual accumulator for guard results so all checks run before exit"
    - "grep no-match safety: use || true on grep pipeline inside $() assignment to prevent set -e from triggering when grep finds no matches"
    - "Two-bucket site diff: Parquet/JSON strict byte-for-byte (Bucket A), HTML Perl-normalized (Bucket B), assets excluded (Bucket C)"

key-files:
  created:
    - scripts/check-ts-only.sh
    - scripts/compare-sites.sh
  modified:
    - package.json

key-decisions:
  - "|| true on grep pipeline assignments: grep exits 1 on no-match; inside $() with set -e, this aborts the script silently — || true prevents that"
  - "compare-sites.sh uses Perl not sed: macOS BSD sed and Linux GNU sed differ on {8} quantifier; Perl is portable across both platforms"
  - "compare-sites.sh is NOT wired into any CI workflow (D-01 one-shot framing preserved)"

patterns-established:
  - "Shell guard scripts: committed to scripts/ directory (not inline YAML), runnable locally via bash scripts/<name>.sh, FAIL accumulator for multi-check exit"

requirements-completed: [MIG-05, MIG-06, CI-02]

duration: 4min
completed: "2026-06-11"
---

# Phase 38 Plan 01: Foundation Scripts & Test Glob Cleanup Summary

**MIG-06 TS-only invariant guard script, D-03 two-bucket site comparison helper, and MIG-05 package.json glob cleanup — all verification logic from RESEARCH.md placed verbatim with one key shell correctness fix**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-11T01:03:00Z
- **Completed:** 2026-06-11T01:06:40Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `scripts/check-ts-only.sh` — permanent MIG-06 guard enforcing 4 invariants (zero .js sources, zero allowJs, zero @ts-ignore, zero unguarded double-casts); exits 0 on clean tree with OK line
- `scripts/compare-sites.sh` — one-shot D-03 two-bucket proof helper using Perl normalization for content-hash segments; not wired into CI (D-01 preserved)
- `package.json` test globs narrowed to `.ts`-only; `npm test` confirms all 225 tests still pass

## Task Commits

1. **Task 1: Create permanent MIG-06 guard script** - `97377202` (feat)
2. **Task 2: Create one-shot proof helper** - `f291b168` (feat)
3. **Task 3: Clean up package.json test globs** - `dd04ba47` (chore)

## Files Created/Modified

- `scripts/check-ts-only.sh` — permanent CI guard; 4 guards; FAIL accumulator; || true on grep assignments
- `scripts/compare-sites.sh` — one-shot local proof helper; Bucket A strict, Bucket B Perl-normalized, Bucket C excluded
- `package.json` — test script `{js,ts}` alternations removed; narrowed to `.test.ts` only

## Decisions Made

- **`|| true` on grep pipeline assignments:** The RESEARCH.md script used bare `$()` assignments for `TS_IGNORE` and `DOUBLE_CAST`. When grep finds no matches it exits 1, and `set -e` inside a subshell `$()` propagates that exit code, aborting the script silently before any output. Added `|| true` to guard both assignments. This is a correctness fix, not a behavioral change — the resulting logic is identical to the verified intent.
- **compare-sites.sh uses Perl:** Follows RESEARCH.md Pitfall 2 exactly — BSD sed vs GNU sed quantifier incompatibility. Perl is portable on both macOS and Ubuntu.
- **compare-sites.sh not wired into CI:** Preserves D-01 one-shot framing. Plan 38-03 will run it locally for the milestone evidence doc.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed set -e abort on grep no-match in check-ts-only.sh**
- **Found during:** Task 1 (verification run)
- **Issue:** `set -e` caused silent exit 1 when `grep` inside `$()` assignments found no matches (correct behavior — tree is clean — but grep exits 1 on no-match, propagated through `$()` assignment)
- **Fix:** Added `|| true` to the two grep pipeline assignments (`TS_IGNORE` and `DOUBLE_CAST`) so the script continues to the success exit path when guards are clean
- **Files modified:** scripts/check-ts-only.sh
- **Verification:** `bash scripts/check-ts-only.sh` exits 0 and prints OK line on clean tree
- **Committed in:** 97377202 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correctness — without the fix the script always exited 1 silently on a clean tree, defeating its purpose as a pass/fail guard.

## Issues Encountered

The RESEARCH.md script was verified to produce the correct grep patterns but had a bash `set -e` + subshell interaction issue. The `|| true` fix is idiomatic bash for this exact scenario and does not change the guard logic.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `scripts/check-ts-only.sh` is ready to be wired into `pr-check.yml` in plan 38-02
- `scripts/compare-sites.sh` is ready to run locally in plan 38-03 for the milestone evidence doc
- `package.json` test glob cleanup complete; `npm test` green (225 tests)
- `npm run typecheck` still exits 0 (verified — no source files touched)

---
*Phase: 38-ci-gate-full-verification*
*Completed: 2026-06-11*
