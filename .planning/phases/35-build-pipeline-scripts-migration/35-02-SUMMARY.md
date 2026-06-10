---
phase: 35-build-pipeline-scripts-migration
plan: "02"
subsystem: testing
tags: [typescript, type-safety, migration, string-literal-unions]

# Dependency graph
requires:
  - phase: 34-scripts-lib-src-lib-migration
    provides: parse-photo-filename.ts already converted to TypeScript with existing View inline literal
provides:
  - "export type View = 'D' | 'V' | '' from scripts/lib/parse-photo-filename.ts (D-09)"
  - "export type MatchBucket (7-value union) from scripts/lib/parse-photo-filename.ts (D-09)"
affects:
  - 35-03-ingest-photos
  - 35-04-tile-photos
  - 35-05-upload-tiles
  - 35-06-generate-species-photos

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exported string-literal union aliases (View, MatchBucket) as source-of-truth contracts for consumer scripts"
    - "MatchBucket union value set is canonical; derived from classify() in ingest-photos.js — do not add/remove values"

key-files:
  created: []
  modified:
    - scripts/lib/parse-photo-filename.ts

key-decisions:
  - "View and MatchBucket exported as string-literal unions (no enum — TS-03 prohibition, isolatedModules/erasable-syntax)"
  - "MatchBucket value set locked to exactly 7 values: classify() in ingest-photos.js is the source of truth (D-09)"
  - "ParseSpecimenAndViewResult.view field type references the named View alias (promotes inline literal to named export)"

patterns-established:
  - "Pattern D-09: lib file defines exported union types; pipeline script (ingest-photos.js) is the canonical value source"

requirements-completed: [MIG-02]

# Metrics
duration: 5min
completed: 2026-06-10
---

# Phase 35 Plan 02: Exported View and MatchBucket String-Literal Unions Summary

**Two string-literal union types (View, MatchBucket) promoted to named exports in parse-photo-filename.ts, establishing the D-09 type contract before Wave 2 consumer scripts are converted.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-10T01:44:00Z
- **Completed:** 2026-06-10T01:44:19Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Exported `type View = 'D' | 'V' | ''` from `scripts/lib/parse-photo-filename.ts`, promoting the previously-inline literal on `ParseSpecimenAndViewResult.view`
- Exported `type MatchBucket` with exactly 7 values, matching the complete return set of `classify()` in `scripts/ingest-photos.js`, with per-value provenance comments
- Refactored `ParseSpecimenAndViewResult.view` field and `parseSpecimenAndView` return cast to reference `View` (no repeated inline literal)
- All 22 existing parser tests pass; `npm run typecheck` clean; no enum introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: Add exported View and MatchBucket string-literal unions** - `b7e2b255` (feat)

**Plan metadata:** (final docs commit — separate)

## Files Created/Modified
- `scripts/lib/parse-photo-filename.ts` - Added `export type View` and `export type MatchBucket`; refactored inline literal usage to reference `View`

## Decisions Made
- String-literal unions only — no enum (TS-03 prohibition; isolatedModules/erasable-syntax)
- MatchBucket value set is exactly the 7 values returned by `classify()` in `ingest-photos.js`; anti-pattern warns against adding/removing values without updating the source function

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `View` and `MatchBucket` are ready for import by Wave 2 plans (35-03 through 35-06: ingest-photos, tile-photos, upload-tiles, generate-species-photos)
- No blockers

## Threat Flags

None - type-only change with zero runtime footprint (types erased under Node 24 type-stripping).

---
*Phase: 35-build-pipeline-scripts-migration*
*Completed: 2026-06-10*
