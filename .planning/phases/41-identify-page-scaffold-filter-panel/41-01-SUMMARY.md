---
phase: 41-identify-page-scaffold-filter-panel
plan: "01"
subsystem: build-pipeline
tags: [tdd, stray-quote-fix, key-matrix, data-pipeline]
dependency_graph:
  requires: []
  provides: [data/key-matrix.json with 8 clean categories]
  affects: [Phase 42 results grid, Phase 43 character images, Plan 03 filter panel]
tech_stack:
  added: []
  patterns: [TDD RED/GREEN, parseCharacterLabel normalization, csv-parse relax_quotes artifact fix]
key_files:
  created: []
  modified:
    - scripts/build-key.ts
    - scripts/build-key.test.ts
    - data/key-matrix.json
    - data/key-coverage-report.json
decisions:
  - "Strip /^\"|\"$/g in parseCharacterLabel before split(':') — minimal one-line fix, no signature change"
  - "Regenerate data/key-matrix.json via npm run build:key (do not hand-edit)"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-25T04:50:36Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 41 Plan 01: Stray-Quote Fix + 8-Category key-matrix.json Summary

One-liner: Quote-stripping pre-pass in `parseCharacterLabel` eliminates the spurious 9th `"Abdomen and thorax` category; `data/key-matrix.json` regenerated with exactly 8 clean categories and 16 `Abdomen and thorax` states.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add stray-quote test cases and 8-category invariant test (RED) | 5f24fbf9 | scripts/build-key.test.ts |
| 2 | Normalize quotes in parseCharacterLabel and regenerate data/key-matrix.json (GREEN) | 7d724cc6 | scripts/build-key.ts, data/key-matrix.json, data/key-coverage-report.json |

## What Was Built

### Task 1 (TDD RED)
Added two test cases to the existing `describe('parseCharacterLabel', ...)` block:
- **Stray-quote assertion:** `parseCharacterLabel('"Abdomen and thorax:...:Yes"')` returns `category: 'Abdomen and thorax'` and `state: 'Yes'`
- **Regression guard:** clean label with same structure parses unchanged

Added one integration test to `describe('main (integration)', ...)`:
- **8-category invariant:** after `node scripts/build-key.ts`, `new Set(characters.map(c => c.category)).size === 8` and no category starts with `"`

Both new assertions were confirmed RED before the fix (27 tests: 25 pass, 2 fail).

### Task 2 (TDD GREEN)
Added a quote-stripping pre-pass to `parseCharacterLabel` in `scripts/build-key.ts`:

```typescript
const cleaned = label.replace(/^"|"$/g, '');
const parts = cleaned.split(':');
```

This strips the leading `"` that `csv-parse` with `relax_quotes: true` leaves on the embedded-quote field (`..."dipped" in a different color?...`), and the trailing `"` on the `state` field. The existing `.trim()` calls on each field handle any residual whitespace.

Re-ran `npm run build:key` to regenerate `data/key-matrix.json`:
- Before: 9 distinct categories (`Abdomen and thorax` and `"Abdomen and thorax`)
- After: 8 distinct categories (`Distribution`, `Seasonality`, `Size`, `Wing shape and size`, `Forewing color and pattern`, `Hindwing color and pattern`, `Abdomen and thorax`, `Eyes`)
- `Abdomen and thorax` now groups all 16 states (8 questions × 2 states; the stray-quote question's 2 states are correctly merged)

Full test suite result: **307 tests, 0 failures** (up from 305 — 2 new tests added).

## Verification Results

```
node -e "const d=require('./data/key-matrix.json'); ..."
OK 8 categories, no stray quote

node --test scripts/build-key.test.ts
ℹ tests 27
ℹ pass 27
ℹ fail 0

npm test
ℹ tests 307
ℹ pass 307
ℹ fail 0
```

## Deviations from Plan

None — plan executed exactly as written. The fix location (`parseCharacterLabel`), the exact regex (`/^"|"$/g`), and the regeneration step all matched the plan specification.

## TDD Gate Compliance

- RED gate: commit `5f24fbf9` — `test(41-01)` — 2 new assertions failing before fix
- GREEN gate: commit `7d724cc6` — `feat(41-01)` — all 27 assertions passing after fix
- No REFACTOR gate needed (fix is already minimal and clean)

## Known Stubs

None. `data/key-matrix.json` is a complete, clean artifact with no placeholder values.

## Threat Flags

None. This plan modifies a build-time data transform with no network boundary, auth, or user input.

## Self-Check: PASSED

- `scripts/build-key.ts` exists and contains `replace(/^"|"$/g, '')`: confirmed
- `scripts/build-key.test.ts` exists and contains `Abdomen and thorax` and `8 distinct categories`: confirmed
- `data/key-matrix.json` exists and has exactly 8 distinct category strings: confirmed
- Commits `5f24fbf9` and `7d724cc6` exist in git log: confirmed
