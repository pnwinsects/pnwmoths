---
phase: 19-build-time-glossary-transform
plan: 01
subsystem: build
tags: [node-html-parser, eleventy, glossary, html-transform, regex]

# Dependency graph
requires: []
provides:
  - "src/_lib/glossary-transform.js — pure utility module with four named exports: escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms"
  - "node-html-parser@^7.1.0 installed as production dependency"
affects:
  - 19-02 (test plan imports from this module)
  - 19-03 (eleventy.config.js wires this module into the transform)

# Tech tracking
tech-stack:
  added:
    - "node-html-parser@^7.1.0 — HTML parse and text-node walk for build-time transform"
  patterns:
    - "Pure utility module with named exports only (no default export, no I/O, no module-level state)"
    - "parentNode.exchangeChild(oldNode, newNode) for TextNode replacement in node-html-parser 7.x"
    - "seen Set initialized per applyGlossaryTerms invocation (never at module scope)"
    - "Lookbehind/lookahead word-boundary guards instead of \\b for metacharacter-safe matching"

key-files:
  created:
    - "src/_lib/glossary-transform.js"
  modified:
    - "package.json (node-html-parser added to dependencies)"
    - "package-lock.json"

key-decisions:
  - "Use parentNode.exchangeChild(oldNode, newNode) instead of textNode.replaceWith() — replaceWith is not available on TextNode in node-html-parser 7.x (only on HTMLElement)"
  - "Pass cdnBaseUrl as parameter to buildTermMap rather than importing a shared constant — keeps module pure and easily testable"

patterns-established:
  - "Pattern: TextNode replacement via parentNode.exchangeChild(textNode, parse(newHtml)) in node-html-parser 7.x"
  - "Pattern: Reset regex.lastIndex = 0 before each exec() call on a stateful gi regex"

requirements-completed:
  - GLOS-01
  - GLOS-02
  - GLOS-03
  - GLOS-04
  - GLOS-05
  - GLOS-06

# Metrics
duration: 2min
completed: 2026-04-23
---

# Phase 19 Plan 01: Build-time Glossary Transform — Core Utility Summary

**Pure HTML annotation utility with escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms — wraps first glossary term occurrences in `<abbr class="glossary-term">` using node-html-parser text-node walk**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-23T21:13:51Z
- **Completed:** 2026-04-23T21:16:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Installed node-html-parser@^7.1.0 as production dependency (build-time use)
- Created src/_lib/glossary-transform.js with four named exports matching UI-SPEC element structure contract exactly
- Verified all functions: escapeRegex handles metacharacters, escapeHtml handles quotes/angles/ampersands, buildTermMap sorts longest-first with lookbehind/lookahead regex, applyGlossaryTerms wraps first occurrences only with per-invocation seen Set

## Task Commits

Each task was committed atomically:

1. **Task 1: Install node-html-parser** - `c1978a4` (chore)
2. **Task 2: Implement glossary-transform.js** - `93a8673` (feat)

## Files Created/Modified

- `src/_lib/glossary-transform.js` — Pure utility module: escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms
- `package.json` — node-html-parser@^7.1.0 added to dependencies
- `package-lock.json` — Lock file updated

## Decisions Made

- Used `parentNode.exchangeChild(oldNode, newNode)` for TextNode replacement — the plan's reference code used `textNode.replaceWith()` which does not exist on TextNode in node-html-parser 7.x (only on HTMLElement); discovered via runtime TypeError and fixed inline
- Passed `cdnBaseUrl` as parameter to `buildTermMap(rows, cdnBaseUrl)` per plan spec — avoids shared module state, keeps utility testable in isolation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TextNode replacement API: replaceWith → parentNode.exchangeChild**
- **Found during:** Task 2 (Implement glossary-transform.js) — smoke test run after implementation
- **Issue:** Plan's reference code called `textNode.replaceWith(parse(...))` but `replaceWith` is only available on `HTMLElement`, not on `TextNode` in node-html-parser 7.x. Results in `TypeError: textNode.replaceWith is not a function` at runtime.
- **Fix:** Changed `textNode.replaceWith(parse(before + abbr + after))` to `textNode.parentNode.exchangeChild(textNode, parse(before + abbr + after))`. The `exchangeChild(oldNode, newNode)` method on HTMLElement is the correct API for replacing a child node.
- **Files modified:** src/_lib/glossary-transform.js
- **Verification:** Smoke tests pass: first-occurrence wrapping, word-boundary guard (subcostal/costal), metacharacter term (1A+2A), per-invocation seen Set — all verified.
- **Committed in:** `93a8673` (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — API bug in reference implementation)
**Impact on plan:** Essential fix. Without it, applyGlossaryTerms would throw at runtime. The exchangeChild API produces identical output to what replaceWith would have produced.

## Issues Encountered

- Assumption A3 from 19-RESEARCH.md ("node-html-parser TextNode.replaceWith() accepts HTMLElement") was incorrect — `replaceWith` exists only on HTMLElement, not TextNode. Fixed via Rule 1 auto-fix.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/_lib/glossary-transform.js` is ready for plan 02 to add unit tests
- All four exports verified importable and functional
- The `parentNode.exchangeChild` pattern is established — plan 02 tests should verify it via the applyGlossaryTerms behavioral tests
- Plan 03 can import `buildTermMap` and `applyGlossaryTerms` directly into `eleventy.config.js`

## Self-Check: PASSED

All expected files found:
- `src/_lib/glossary-transform.js` — FOUND
- `package.json` — FOUND
- `19-01-SUMMARY.md` — FOUND

All task commits found:
- `c1978a4` (chore: install node-html-parser) — FOUND
- `93a8673` (feat: implement glossary-transform.js) — FOUND

---
*Phase: 19-build-time-glossary-transform*
*Completed: 2026-04-23*
