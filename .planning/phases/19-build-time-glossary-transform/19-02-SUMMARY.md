---
phase: 19-build-time-glossary-transform
plan: 02
subsystem: testing
tags: [node:test, glossary, unit-tests, escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms]

# Dependency graph
requires:
  - phase: 19-01
    provides: "src/_lib/glossary-transform.js — four named exports: escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms"
provides:
  - "src/_lib/glossary-transform.test.js — 24 unit tests across 4 describe blocks covering all QA-01 behaviors"
  - "package.json test script extended to include src/_lib/*.test.js"
affects:
  - 19-03 (integration plan can rely on unit-test coverage as regression guard)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reset regex.lastIndex = 0 before each .test() call when testing a gi (global+case-insensitive) RegExp"
    - "Inline buildTermMap fixture defined in describe scope for shared reuse across it() cases"

key-files:
  created:
    - "src/_lib/glossary-transform.test.js"
  modified:
    - "package.json (test script: appended src/_lib/*.test.js)"

key-decisions:
  - "Reset regex.lastIndex before each .test() call in buildTermMap tests — gi regexes are stateful; omitting the reset caused the case-insensitive uppercase test to fail spuriously"

patterns-established:
  - "Pattern: Always reset lastIndex = 0 before .test() on a gi regex in node:test unit tests"

requirements-completed:
  - QA-01

# Metrics
duration: 2min
completed: 2026-04-23
---

# Phase 19 Plan 02: Glossary Transform Tests Summary

**24 unit tests for escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms using node:test — all QA-01 behaviors covered; npm test suite extended to include src/_lib/*.test.js**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-23T21:18:45Z
- **Completed:** 2026-04-23T21:20:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created src/_lib/glossary-transform.test.js with 24 tests across 4 describe blocks matching codebase conventions (node:test, assert/strict, describe+it)
- All QA-01 behaviors verified: metacharacter escaping (1A+2A, W-mark, M1.M3), whole-word guard (subcostal/costal), longest-term priority (forewing before wing), first-occurrence deduplication, per-invocation seen Set, abbr attribute structure, HTML escaping in definition values
- Extended package.json test script to include src/_lib/*.test.js — npm test now runs 96 total tests (all pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create glossary-transform.test.js** - `a9661fe` (test)
2. **Task 2: Add src/_lib/*.test.js to npm test glob** - `d586ab9` (chore)

## Files Created/Modified

- `src/_lib/glossary-transform.test.js` — Unit test suite: 4 describe blocks, 24 it() cases
- `package.json` — test script appended `src/_lib/*.test.js`

## Decisions Made

- Reset `regex.lastIndex = 0` before each `.test()` call in buildTermMap regex tests — the `gi` flag makes RegExp objects stateful; consecutive `.test()` calls on the same regex object advance `lastIndex`, causing a spurious failure on the second assertion. Fixed inline during test authoring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reset regex.lastIndex before each .test() call in case-insensitive test**
- **Found during:** Task 1 (Create glossary-transform.test.js) — first test run after file creation
- **Issue:** The "pre-compiles regex with case-insensitive flag" test called `.test('forewing')` then `.test('FOREWING')` on the same `gi` regex without resetting `lastIndex`. The first `.test()` advanced `lastIndex` past the end of the string, so the second `.test()` found no match and failed with `AssertionError: should match uppercase`.
- **Fix:** Added `map[0].regex.lastIndex = 0` before each `.test()` call in that test case, matching the pattern already used in the adjacent "regex does not match partial words" test.
- **Files modified:** src/_lib/glossary-transform.test.js
- **Verification:** `node --test src/_lib/glossary-transform.test.js` → 24/24 pass.
- **Committed in:** `a9661fe` (Task 1 test commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test authoring bug)
**Impact on plan:** Minimal; one-line fix to the test itself. No changes to the implementation or plan scope.

## Issues Encountered

- `node-html-parser` not found on first test run — the worktree had no `node_modules`. Ran `npm install` to resolve (Rule 3: blocking issue). This is expected for a fresh worktree; no plan change needed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All four glossary-transform exports are verified correct by 24 passing unit tests
- npm test is green at 96 tests — safe baseline for plan 03 integration work
- Plan 03 can wire `buildTermMap` and `applyGlossaryTerms` into `eleventy.config.js` with confidence that unit-level regressions will be caught

## Self-Check: PASSED

All expected files found:
- `src/_lib/glossary-transform.test.js` — FOUND
- `package.json` (modified) — FOUND
- `19-02-SUMMARY.md` — FOUND (this file)

All task commits found:
- `a9661fe` (test: add unit tests for glossary-transform) — FOUND
- `d586ab9` (chore: add src/_lib/*.test.js to npm test glob) — FOUND

---
*Phase: 19-build-time-glossary-transform*
*Completed: 2026-04-23*
