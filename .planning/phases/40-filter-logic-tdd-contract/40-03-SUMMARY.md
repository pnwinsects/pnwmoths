---
phase: 40-filter-logic-tdd-contract
plan: "03"
subsystem: filter-logic
tags: [tdd, bitset, key-filter, ident-04]
dependency_graph:
  requires: [40-01, 40-02]
  provides: [src/_lib/key-filter.ts, src/_lib/key-filter.test.ts]
  affects: [Phase 41 pnwm-identify, Phase 42 results grid]
tech_stack:
  added: []
  patterns:
    - "D-03 keepMask: result &= (selectedUnion | ~opposingUnion) per question byte-wise"
    - "node:test describe/it with async import() for real-artifact integration cases"
    - "LSB-first bitset encoding matching scripts/build-key.ts buildBitset()"
key_files:
  created:
    - src/_lib/key-filter.ts
    - src/_lib/key-filter.test.ts
  modified:
    - src/components/key-matrix-cache.test.ts
    - src/types/schemas.test.ts
decisions:
  - "buildQuestionGroups groups by character.question string alone (all 55 globally unique)"
  - "computeMatching returns { matchedSlugs: string[], count: number } — slugs for Phase 42 grid"
  - "Selection type is Map<string, Set<number>> (question text -> character ids), not Map<charId, bool>"
  - "D-04 invariant is free: unscored species have no opposing 1s, ~opposingUnion stays 0xff, they always pass"
  - "Pre-existing test fixture failures from Plan 40-01 fixed in same plan (7 tests now green)"
metrics:
  duration: "5 minutes"
  completed: "2026-06-25"
  tasks_completed: 3
  files_created: 2
  files_modified: 2
---

# Phase 40 Plan 03: Pure Filter Logic TDD Contract Summary

**One-liner:** TDD contract for Identify filter: `buildQuestionGroups` + `computeMatching` with D-03 `result &= (selectedUnion | ~opposingUnion)` keepMask, 10 passing test cases, full suite green.

## What Was Built

Two pure TypeScript functions in `src/_lib/key-filter.ts` implementing the locked D-01..D-04 filter semantics for the Identify feature (IDENT-04):

- **`buildQuestionGroups(characters: Character[]): QuestionGroups`** — groups the 237 character-states by `character.question` string into a `Map<string, Character[]>` with 55 entries. Preserves insertion order for bitset index correctness.
- **`computeMatching(matrix, selection, questionGroups): MatchResult`** — applies the D-03 elimination predicate via byte-wise bitset keepMask, ORing within a question and ANDing across questions. Returns `{ matchedSlugs: string[], count: number }`.

Exported types: `QuestionGroups`, `Selection` (`Map<string, Set<number>>`), `MatchResult`.

A co-located `src/_lib/key-filter.test.ts` proves all 8 TDD cases (10 `it` blocks):

| Case | What it proves |
|------|---------------|
| TC-1 | Single state narrows: species with 0 on selected AND 1 on opposing is eliminated |
| TC-2 | Two states same question widen (D-01 OR-within): result ≥ either alone |
| TC-3 | Two questions AND narrows (D-01 AND-across): result ≤ min(either alone) |
| TC-4 | 0,0 species (all-zero for question) is NOT eliminated (D-03/D-04) |
| TC-5 | Polymorphic species (1 on selected AND opposing) is KEPT (D-02) |
| TC-6 | hypenodes-fractilinea and xestia-normanianus appear in any filtered result (D-04, real artifact); WA selection = 862 |
| TC-7a | Empty synthetic fixture → all species returned |
| TC-7b | Empty selection on real artifact → 1,192 species |
| TC-8a | Fixture character grouping: 3 chars → 2 groups |
| TC-8b | Real artifact: 237 chars → 55 groups, sum = 237 |

## Key Decision: D-03 keepMask (Not Naive Union)

The STACK.md pseudocode's `result &= OR(selected bitsets)` is an anti-pattern that eliminates unscored species. The correct per-question expression:

```typescript
result[i]! &= (selectedUnion[i]! | (~opposingUnion[i]! & 0xff));
```

This keeps a species iff it has ≥1 selected bit OR has no opposing bit. The `& 0xff` masks JavaScript's 32-bit NOT to a single byte. TC-4 is the correctness gate for this distinction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing test fixture failures from Plan 40-01**
- **Found during:** Task 3 full-suite phase gate
- **Issue:** `KeyMatrixSchema` gained a required `meta` field in Plan 40-01, but test fixtures in `src/types/schemas.test.ts` and `src/components/key-matrix-cache.test.ts` were not updated. 7 tests were failing before this plan started.
- **Fix:** Added `meta` field to `makeValidArtifact()` helper in `key-matrix-cache.test.ts` and to the `validArtifact` constant in `schemas.test.ts`; also added `meta` to two inline fixtures in `key-matrix-cache.test.ts`.
- **Files modified:** `src/components/key-matrix-cache.test.ts`, `src/types/schemas.test.ts`
- **Commit:** `e288d934`

## Verification

- `node --test src/_lib/key-filter.test.ts`: 10/10 pass
- `npm test`: 304/304 pass (7 pre-existing failures fixed as deviation)
- `npm run typecheck`: both tsconfigs clean (browser + node)
- `grep selectedUnion src/_lib/key-filter.ts` and `grep '& 0xff' src/_lib/key-filter.ts` both match (D-03 keepMask present)
- TC-6 real-artifact regression: WA selection = 862, empty = 1,192; both unscored slugs confirmed present

## Known Stubs

None. `computeMatching` returns real data from `data/key-matrix.json`; no placeholder values.

## Threat Flags

None. `buildQuestionGroups` and `computeMatching` are pure in-memory functions. No SQL, eval, innerHTML, auth, crypto, or network surface. No new trust boundaries introduced.

## Self-Check

- [x] `src/_lib/key-filter.ts` — created, 148 lines
- [x] `src/_lib/key-filter.test.ts` — created, 297 lines
- [x] Commits: b2f4f05e (RED), 6e5a3d64 (GREEN), e288d934 (fix pre-existing test regression)
- [x] All 8 TDD cases (10 it-blocks) pass; `npm test` 304/304; `npm run typecheck` clean
