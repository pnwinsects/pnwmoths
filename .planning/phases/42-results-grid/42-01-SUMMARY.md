---
phase: 42-results-grid
plan: 01
subsystem: identify-page
tags: [tdd, wave-0, test-scaffold, key-results-grid, pnwm-identify]
dependency_graph:
  requires: [41-03]
  provides: [42-02]
  affects: [src/components/key-results-grid.ts, src/components/pnwm-identify.test.ts]
tech_stack:
  added: []
  patterns: [node:test no-DOM harness, real-data gate pattern, base64 bitset fixture]
key_files:
  created:
    - src/components/key-results-grid.ts
    - src/components/key-results-grid.test.ts
  modified:
    - src/components/pnwm-identify.test.ts
decisions:
  - "buildCardUrl and buildCountText exported as pure helpers so Plan 42-02 can reuse them inside the component render without duplication"
  - "Task 2 RED tests use a minimal hand-built KeyMatrix fixture with base64 bitsets ('AQ==' / 'Ag==') rather than slicing real data — simpler and self-documenting"
  - "dispatchEvent stubbed to true on detached LitElement instance to avoid Node DOM error in Task 2 test"
metrics:
  duration: "3 minutes"
  completed: "2026-06-25T18:45:56Z"
  tasks_completed: 2
  files_changed: 3
  commits: 2
---

# Phase 42 Plan 01: Wave 0 RED Test Scaffolds — Summary

Wave 0 test scaffolds for Phase 42's results grid: pure helper stubs (`buildCardUrl`, `buildCountText`) with passing unit tests, and two intentionally RED tests in `pnwm-identify.test.ts` asserting the matched-state plumbing and Clear-all reset that Plan 42-02 must satisfy.

## What Was Built

### Task 1: `key-results-grid.ts` + `key-results-grid.test.ts` (GREEN)

Created `src/components/key-results-grid.ts` with two exported pure helpers:
- `buildCardUrl(slug, navImage, height)` — CDN thumbnail URL with `encodeURIComponent` and `?height=` param (D-07)
- `buildCountText(hasSelection, count, total)` — comma-formatted count line ("47 species match" / "Showing all 1,192 species")

Created `src/components/key-results-grid.test.ts` (14 tests, all GREEN):
- **GRID-02**: CDN URL locked (`'https://pnwmoths.b-cdn.net/habrosyne-scripta/Habrosyne%20scripta-A-D.jpg?height=320'`)
- **GRID-01**: Count text locked for 4 cases including comma-formatting of 4-digit values (`'1,190 species match'`, `'Showing all 1,192 species'`)
- **GRID-03**: Real-data gate asserts exactly 2 `null` `nav_image` species (`autographa-v-alba`, `xestia-c-nigrum`); placeholder predicate locked
- **GRID-04**: Empty-state predicate locked (`hasSelection && matchedSpecies.length === 0`) for all 3 state combinations
- **GRID-01 data gate**: `meta.matchedSpecies === 1192` locked against dataset drift

### Task 2: `pnwm-identify.test.ts` extended (2 new tests, RED)

Added two Phase 42 RED tests to `pnwm-identify.test.ts` (17 existing tests continue to pass):

1. `_dispatchFilterChange sets _matchedSpecies after the matrix is loaded` — instantiates `PnwmIdentify`, assigns minimal `KeyMatrix` fixture and `_questionGroups`, sets a selection, calls `_dispatchFilterChange()`, asserts `c._matchedSpecies` is non-empty and `c._matchedCount === c._matchedSpecies.length`. Currently fails because `_dispatchFilterChange` dispatches the Phase 41 placeholder only.

2. `_clearAll resets _matchedSpecies and _matchedCount (D-09)` — seeds `_selection`, `_matchedSpecies`, `_matchedCount` with non-zero values, stubs `_dispatchFilterChange`, calls `_clearAll()`, asserts all three are reset to zero/empty. Currently fails because `_clearAll` does not reset display state (Pitfall 3).

Full suite result: 338/340 tests pass; 2 fail (the intentional RED tests).

## Verification

- `node --test src/components/key-results-grid.test.ts` → 14/14 PASS
- `node --test src/components/pnwm-identify.test.ts; test $? -ne 0 && echo RED-as-expected` → printed `RED-as-expected` (2 failures on new tests, 17 pass)
- `npm test` → 338 pass, 2 fail (both new RED tests)
- No LitElement import or DOM usage in `key-results-grid.test.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 4f352e2c | Task 1 | test(42-01): add Wave 0 RED/GREEN test scaffold for GRID-01..04 pure helpers |
| 456f622c | Task 2 | test(42-01): add RED tests for matched-state plumbing + Clear-all reset (D-09) |

## Self-Check: PASSED

Files verified:
- `src/components/key-results-grid.ts` — FOUND
- `src/components/key-results-grid.test.ts` — FOUND
- `src/components/pnwm-identify.test.ts` (modified) — FOUND

Commits verified:
- 4f352e2c — FOUND
- 456f622c — FOUND
