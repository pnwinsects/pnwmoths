---
phase: 40-filter-logic-tdd-contract
plan: 01
subsystem: types
tags: [zod, zod-mini, typescript, key-matrix, events, schemas]

# Dependency graph
requires:
  - phase: 39-key-matrix-data-pipeline
    provides: KeyMatrixSchema, CharacterSchema, KeySpeciesSchema, data/key-matrix.json
provides:
  - KeyMatrixMetaSchema (zod/mini schema, four build-provenance fields)
  - KeyMatrixMeta (z.infer type alias)
  - meta field on KeyMatrixSchema (first property, required)
  - KeyFilterChangeDetail interface (matchedSlugs, count, hasSelection)
  - pnwm-key-filter-change entry on HTMLElementEventMap
  - build-key.ts updated to emit meta block; data/key-matrix.json regenerated
affects: [41-identify-page, 42-results-grid, 40-02, 40-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Export z.infer<typeof Schema> type alias immediately after each schema constant"
    - "Event-bus isolation: KeyFilterChangeDetail is fully separate from FilterChangeDetail (no extension/inheritance)"
    - "Single declare global HTMLElementEventMap block; never split across multiple blocks"

key-files:
  created: []
  modified:
    - src/types/schemas.ts
    - src/types/events.ts
    - scripts/build-key.ts
    - data/key-matrix.json

key-decisions:
  - "meta field placed first in KeyMatrixSchema for alignment with JSON schema conventions and readability"
  - "KeyFilterChangeDetail is completely separate from FilterChangeDetail — no extension — per event-bus isolation rule (PITFALLS Pitfall 12)"
  - "build-key.ts meta emission is part of this plan (not deferred to Plan 02) because KeyMatrixSchema.parse() fails without it"

patterns-established:
  - "Paired schema + type alias: export const FooSchema = z.object({...}); export type Foo = z.infer<typeof FooSchema>"
  - "Only one declare global block in events.ts; new event types added into the existing block"

requirements-completed: [MATCH-01, MATCH-02, MATCH-03]

# Metrics
duration: 12min
completed: 2026-06-24
---

# Phase 40 Plan 01: Filter Logic TDD Contract — Type Surface Summary

**KeyMatrixMetaSchema, KeyFilterChangeDetail, and meta-emitting build-key.ts — the type contracts consumed by Plans 02-03 and Phases 41-42**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-25T02:00:00Z
- **Completed:** 2026-06-25T02:12:00Z
- **Tasks:** 3 (plus 1 auto-fix)
- **Files modified:** 4

## Accomplishments
- Exported `KeyMatrixMetaSchema` (zod/mini) with `totalKeySpecies`, `matchedSpecies`, `unmatchedSpecies`, `generatedAt`; paired with `KeyMatrixMeta` type alias
- Added `meta` as first required field on `KeyMatrixSchema` — `validateKeyMatrix()` inherits meta validation at browser load for free (T-40-01 mitigated)
- Exported `KeyFilterChangeDetail` interface and added `pnwm-key-filter-change` to the single `HTMLElementEventMap` declare-global block; `FilterChangeDetail` byte-for-byte unchanged
- Updated `scripts/build-key.ts` to emit the `meta` block; regenerated `data/key-matrix.json` (now includes meta); MATCH-01/02/03 confirmed green: 24/24 build-key tests pass, 1,192 species with slug + nav_image

## Task Commits

Each task was committed atomically:

1. **Task 1: Add KeyMatrixMetaSchema + meta field to schemas.ts** - `8ee74746` (feat)
2. **Task 2: Add KeyFilterChangeDetail + pnwm-key-filter-change to events.ts** - `0d50717b` (feat)
3. **Task 3: Confirm MATCH-01/02/03 Phase 39 artifacts remain green** - `a0496e89` (fix — Rule 3 auto-fix required to unblock)

## Files Created/Modified
- `src/types/schemas.ts` — Added `KeyMatrixMetaSchema`, `KeyMatrixMeta`, and `meta` field on `KeyMatrixSchema`
- `src/types/events.ts` — Added `KeyFilterChangeDetail` interface and `pnwm-key-filter-change` event map entry
- `scripts/build-key.ts` — Updated `KeyMatrixSchema.parse()` call to include `meta` block
- `data/key-matrix.json` — Regenerated to include `meta` field (totalKeySpecies: 1228, matchedSpecies: 1192, unmatchedSpecies: 36)

## Decisions Made
- `meta` placed first in `KeyMatrixSchema` (before `characters`) to match JSON schema conventions
- `KeyFilterChangeDetail` is a completely separate interface (not extending `FilterChangeDetail`) per the event-bus isolation rule
- `build-key.ts` meta emission done here rather than in Plan 02 because `KeyMatrixSchema.parse()` fails at build time without it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added meta emission to build-key.ts to unblock Task 3 verification**
- **Found during:** Task 3 (Confirm MATCH-01/02/03 Phase 39 artifacts remain green)
- **Issue:** Adding `meta` as a required field on `KeyMatrixSchema` (Task 1) caused `KeyMatrixSchema.parse()` in `build-key.ts` to fail — the integration test runs `build-key.ts` as a subprocess and it exits with a Zod validation error: `{ "expected": "object", "code": "invalid_type", "path": ["meta"] }`
- **Fix:** Updated `scripts/build-key.ts` line 277: replaced `KeyMatrixSchema.parse({ characters, species, matrix })` with a multi-line call including `meta: { totalKeySpecies: speciesBinomials.length, matchedSpecies: matchedSlugs.length, unmatchedSpecies: unmatchedBinomials.length, generatedAt: new Date().toISOString() }`. All three variables already in scope at that point. Regenerated `data/key-matrix.json`.
- **Files modified:** scripts/build-key.ts, data/key-matrix.json
- **Verification:** `node --test scripts/build-key.test.ts` — 24/24 pass; `npm run typecheck` — clean
- **Committed in:** a0496e89

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking issue)
**Impact on plan:** The meta emission in build-key.ts was always planned for Plan 02, but it became blocking in Plan 01 because the schema change made the current build-key.ts fail. No scope creep; this is exactly the change PATTERNS.md describes for build-key.ts.

## Issues Encountered
- The Task 3 acceptance criterion `grep -c 'declare global' src/types/events.ts` returns 2 (not 1) because the comment on line 2 ("enabling declare global augmentation") also matches. There is only one actual `declare global { ... }` block at line 27. The acceptance criterion is met in intent; the grep pattern matches the comment text as well as the block keyword.

## Threat Surface Scan
- T-40-01 mitigated: `KeyMatrixSchema.parse()` (via `validateKeyMatrix`) now validates the four meta fields against `KeyMatrixMetaSchema`; malformed meta blocks fail closed at the build output → browser load boundary (ASVS V5)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `KeyMatrixMetaSchema`, `KeyMatrixMeta`, `KeyFilterChangeDetail`, and `pnwm-key-filter-change` are fully exported and typecheck clean
- `data/key-matrix.json` includes the `meta` block; Plan 02 (build-key meta emission) may skip that step since it's already done
- Plans 02 and 03 can reference these types immediately; Phases 41 and 42 have their event transport typed

---
*Phase: 40-filter-logic-tdd-contract*
*Completed: 2026-06-24*
