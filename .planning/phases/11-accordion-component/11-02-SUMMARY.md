---
phase: 11-accordion-component
plan: "02"
subsystem: client-side-components
tags: [lit, web-components, accordion, state-filter, light-dom, tdd, browse]
dependency_graph:
  requires:
    - phase: 11-01
      provides: pnwm-taxon-browser.test.js (RED test contract)
  provides:
    - src/components/pnwm-taxon-browser.js — full Lit accordion component
    - buildStateMap, taxonHasState, collectSlugs — exported pure functions
  affects: [11-03-PLAN, browse-page]
tech-stack:
  added: []
  patterns:
    - Lit light DOM via createRenderRoot() returning this
    - Set expansion state via new-Set spread pattern (not .add() mutation)
    - opacity:0.35 muting for filtered taxa (not display:none)
    - Sync JSON.parse of embedded script element in connectedCallback
    - Async fetch with try/catch graceful degradation in connectedCallback
key-files:
  created:
    - src/components/pnwm-taxon-browser.js
  modified: []
key-decisions:
  - "Genus key uses `familyKey__genus_slug` compound key — ensures genus names unique across families"
  - "Null-subfamily case flattens genera directly under family (no h3, no expand button)"
  - "buildStateMap uses .add() on local Set (not reactive state) — only toggle handlers use new Set spread"
patterns-established:
  - "Light DOM Lit component: createRenderRoot() { return this; } for Pico CSS compatibility"
  - "Set reactive state: always replace with new Set([...existing, item]) or new Set([...existing].filter(...))"
  - "Accordion image strip: inline-flex, 93px height, object-fit:cover, overflow-x:auto"
requirements-completed: [BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05, BROWSE-06, SFILT-02]
duration: 78s
completed: 2026-04-20
---

# Phase 11 Plan 02: Accordion Component Implementation Summary

**Full Lit accordion component with 4-level expand/collapse, navigation image strips, show/hide toggle, and state filter muting — 13 unit tests green (GREEN phase)**

## Performance

- **Duration:** 78s
- **Started:** 2026-04-20T21:12:30Z
- **Completed:** 2026-04-20T21:13:48Z
- **Tasks:** 1
- **Files modified:** 1 created

## Accomplishments

- Implemented `pnwm-taxon-browser.js` — a Lit web component that turns the Phase 10 shell page into a fully interactive accordion
- All 13 unit tests from Plan 01's RED phase now pass (GREEN state confirmed)
- Full test suite: 58/58 tests pass across all test files
- Component correctly handles null-subfamily genera by flattening them directly under the family

## Task Commits

1. **Task 1: Implement pnwm-taxon-browser.js — pure functions + full component (GREEN)** — `d17c555` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `src/components/pnwm-taxon-browser.js` — Lit accordion component: 258 lines; exports `buildStateMap`, `taxonHasState`, `collectSlugs`; `PnwmTaxonBrowser` class with light DOM, 4-level rendering, image strips, state filter

## Test Results

```
# tests 13
# suites 3
# pass 13
# fail 0

Full suite:
# tests 58
# suites 8
# pass 58
# fail 0
```

## Acceptance Criteria Verification

```
grep "export function buildStateMap"     → FOUND
grep "export function taxonHasState"     → FOUND
grep "export function collectSlugs"      → FOUND
grep "createRenderRoot"                  → FOUND: createRenderRoot() { return this; }
grep "species_slug"                      → FOUND: src="/images/${img.species_slug}/${img.filename}"
grep "taxon-data"                        → FOUND: document.getElementById('taxon-data')
grep "species-states.json"              → FOUND: fetch('/species-states.json')
grep "opacity:0.35"                     → FOUND
grep "new Set(\[" (toggle pattern)      → FOUND (6 matches — all 3 expand sets)
grep -c "transition:"                   → 0 (no CSS transitions)
grep -c "animation:"                    → 0 (no CSS animations)
customElements.define last non-comment  → CONFIRMED
```

## Decisions Made

- Genus key uses compound `${familyKey}__${genus_slug}` — ensures uniqueness across all families even if genus names were shared
- `buildStateMap` uses `.add()` on a locally-built Map (not reactive state) — this is correct; the plan's "no .add()" constraint applies only to toggle handlers that mutate reactive Sets
- Null-subfamily genera rendered as flat list without `<h3>` or expand button (Pitfall 2 in plan context)

## Deviations from Plan

None — plan executed exactly as written. Implementation matches the specification in the `<action>` block precisely.

## Issues Encountered

None.

## Known Stubs

None — all data paths are wired: taxonomy from `#taxon-data` script element, state filter from `/species-states.json`, image URLs from `navImages[]` array.

## Threat Flags

None — all threats assessed in plan's `<threat_model>` are accepted with documented rationale. No new security surface introduced beyond what was planned.

## TDD Gate Compliance

- RED gate: CONFIRMED in Plan 11-01 — commit `7a25bca`, exit code 1 (ERR_MODULE_NOT_FOUND)
- GREEN gate: CONFIRMED in this plan — commit `d17c555`, 13/13 tests pass

## Next Phase Readiness

- Component is fully implemented and tested; `/browse/` page is now interactive
- Plan 11-03 (verifier/visual check) can proceed
- No blockers

## Self-Check: PASSED

- [x] `src/components/pnwm-taxon-browser.js` exists
- [x] Commit `d17c555` present in git log
- [x] All 13 unit tests pass
- [x] Full suite 58/58 pass
- [x] All acceptance criteria verified with grep

---
*Phase: 11-accordion-component*
*Completed: 2026-04-20*
