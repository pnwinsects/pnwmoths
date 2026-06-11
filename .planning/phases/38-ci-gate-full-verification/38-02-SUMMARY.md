---
phase: 38-ci-gate-full-verification
plan: "02"
subsystem: testing
tags: [github-actions, ci, yaml, typecheck, tsc, npm-test, bash, verify-parquet]

requires:
  - phase: 38-ci-gate-full-verification (plan 01)
    provides: scripts/check-ts-only.sh guard script wired here as a CI step

provides:
  - .github/workflows/pr-check.yml — CI-01 typecheck gate, MIG-05 test gate, MIG-06 guard gate, SCHEMA-07 verify:parquet gate (all four wired as discrete named steps)
  - .github/workflows/deploy.yml — CI-01 typecheck gate (deploy side only, per D-04/D-05)
  - local red/green proof: all four gates green on clean tree; typecheck gate proven to block a bad type

affects:
  - 38-03 (milestone evidence plan; CI gates are now live)

tech-stack:
  added: []
  patterns:
    - "CI gate ordering: fast checks (typecheck/test/guard) before multi-minute build; verify:parquet after build because it reads build output"
    - "Named run: step idiom: - name: Step Name + run: command, no shell: key, no SHA pin for run: steps"
    - "D-04/D-05 boundary: typecheck in both workflows; test/guard/verify:parquet in PR workflow only"

key-files:
  created: []
  modified:
    - .github/workflows/pr-check.yml
    - .github/workflows/deploy.yml

key-decisions:
  - "Gate ordering in pr-check.yml: typecheck/test/guard before build chain (fast fail), verify:parquet after build chain (reads data/parquet/ produced by build:data)"
  - "deploy.yml gets typecheck only per D-04/D-05: main branch is protected by PR review; re-running test/guard/verify:parquet on deploy push adds minutes for no added safety"
  - "Typecheck placed before install-lychee/cache-lychee steps in deploy.yml: satisfies D-04 fail-fast placement before configure-pages with no dependency on either"

patterns-established:
  - "Workflow gate wiring: discrete named steps, never folded into existing build chain so failures are attributable to the specific gate"

requirements-completed: [CI-01, MIG-05, MIG-06, SCHEMA-07]

duration: 3min
completed: "2026-06-11"
---

# Phase 38 Plan 02: CI Workflow Gate Wiring Summary

**Four verification gates wired into GitHub Actions as discrete named steps: pr-check.yml enforces typecheck/test/guard before build and verify:parquet after build; deploy.yml enforces typecheck only; all gates proven green locally with CI-01 gate proven to block a bad type**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-11T01:09:51Z
- **Completed:** 2026-06-11T01:12:14Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- `pr-check.yml` now enforces CI-01 (typecheck), MIG-05 (npm test), MIG-06 (bash scripts/check-ts-only.sh) before the build chain, and SCHEMA-07 (npm run verify:parquet) after the build chain — all as discrete named steps with no new SHA pins
- `deploy.yml` now enforces CI-01 (typecheck) only — D-04 satisfied, D-05 boundary preserved (no test/guard/verify:parquet in deploy)
- Local red/green proof: all four wired commands exit 0 on clean tree (225 tests pass, 1453 species/92648 rows validated, 0 TS-only violations, 0 type errors); typecheck gate exits non-zero (2) on a deliberate type error then restored to green — proving a type-error PR would be blocked

## Task Commits

1. **Task 1: Wire all four gates into pr-check.yml** - `08663410` (feat)
2. **Task 2: Wire typecheck gate into deploy.yml** - `f0047286` (feat)
3. **Task 3: Red/green proof** - no commit (verification-only task; events.ts revert was clean)

## Files Created/Modified

- `.github/workflows/pr-check.yml` — added Typecheck, Test, TS-only invariant guard (before build), Verify Parquet schema (after build)
- `.github/workflows/deploy.yml` — added Typecheck (before configure-pages)

## Decisions Made

- **Gate ordering in pr-check.yml:** typecheck/test/guard placed before the build chain (fail fast on type errors before 3+ min build); verify:parquet placed after because it reads `data/parquet/` produced by `build:data` (RESEARCH.md Pitfall 1)
- **deploy.yml typecheck placement:** placed immediately after `npm ci` (before install-lychee/cache-lychee/configure-pages) — no dependency on any of those steps, so earliest possible fail-fast position

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both workflow files have all required CI gates wired and verified
- `pr-check.yml` will now block any PR that introduces a type error, a `.js` source file re-introduction, a `@ts-ignore`, or a malformed Parquet schema
- `deploy.yml` will block a deploy push that introduces a type error
- Plan 38-03 can proceed with the milestone evidence documentation (compare-sites.sh run, timing observations)

---
*Phase: 38-ci-gate-full-verification*
*Completed: 2026-06-11*
