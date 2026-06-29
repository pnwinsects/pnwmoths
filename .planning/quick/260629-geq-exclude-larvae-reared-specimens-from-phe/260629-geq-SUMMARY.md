---
phase: quick-260629-geq
plan: 01
subsystem: ui
tags: [phenology, occurrence-records, parquet-cache, lit, node-test]

requires:
  - phase: v3.0 type migration
    provides: OccurrenceRecord zod schema + parquet-cache.ts (filterRecords/aggregateByMonth)
provides:
  - REARED_TERMS constant (verbatim legacy keyword list)
  - isRearedRecord predicate (case-insensitive notes-only substring scan)
  - reared-record exclusion wired into aggregateByMonth (phenology bars only)
affects: [phenology-chart, occurrence-data]

tech-stack:
  added: []
  patterns:
    - "Replicate legacy data-entry-time filtering as an explicit, testable predicate"

key-files:
  created: []
  modified:
    - src/components/parquet-cache.ts
    - src/components/parquet-cache.test.ts

key-decisions:
  - "Filter inside aggregateByMonth (its sole caller is the phenology chart) to scope exclusion to phenology only; map/popup read filterRecords and stay unchanged"
  - "Match notes field ONLY — short tokens like 'em.' would false-match locality/collector text"
  - "null/empty notes are NOT reared (return false), preserving counts for unannotated records"

patterns-established:
  - "isRearedRecord: lowercase notes once, REARED_TERMS.some(term => lowered.includes(term.toLowerCase()))"

requirements-completed: [ISSUE-59]

duration: ~8min
completed: 2026-06-29
---

# Quick 260629-geq: Exclude Reared Specimens from Phenology Summary

**Reared/immature specimens (larvae, pupae, eggs) are now excluded from phenology month bars via a verbatim replica of the legacy keyword scan, catching the 7 post-2011 stragglers with populated months while leaving them visible on the distribution map.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-06-29
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Added exported `REARED_TERMS` constant — exact legacy `species/models.py` keyword list (order + casing preserved)
- Added exported `isRearedRecord(record)` predicate: case-insensitive substring match against the `notes` field only; null/empty notes → false
- Wired `if (isRearedRecord(r)) continue;` into `aggregateByMonth`, scoping the exclusion to phenology bars
- 13 new unit tests (predicate + aggregation cases), all green; full component+types suite remains 25 passing

## Task Commits

1. **Task 1 (RED): failing tests for reared exclusion** - `ac11a073` (test)
2. **Task 1 (GREEN): REARED_TERMS + isRearedRecord + aggregateByMonth exclusion** - `330b5216` (feat)

## Files Created/Modified
- `src/components/parquet-cache.ts` - Added REARED_TERMS, isRearedRecord, reared-skip in aggregateByMonth
- `src/components/parquet-cache.test.ts` - Added makeRecord helper + REARED_TERMS/isRearedRecord/aggregateByMonth-exclusion describe blocks

## Decisions Made
None beyond those specified in the plan — followed the plan as written (filter inside aggregateByMonth, notes-only match, null/empty → false).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The TDD test file already existed (the plan assumed a new file); the new tests were appended to it rather than overwriting, preserving the existing filterRecords/aggregateByMonth/loadParquet/column-validator coverage.

## TDD Gate Compliance
- RED gate: `ac11a073` (test) — import of missing `REARED_TERMS` export failed as expected
- GREEN gate: `330b5216` (feat) — 25/25 tests pass, typecheck clean (browser + node tsconfigs)
- REFACTOR: not needed (implementation already minimal/clean)

## Verification
- `node --test src/components/parquet-cache.test.ts` → 25 pass / 0 fail
- `npm run typecheck` → clean (tsconfig.browser.json + tsconfig.node.json)
- Real-data grounding: straggler rows (hecatera-dysodea, arctia-yarrowii, deilephila-elpenor) confirmed present in data/records.csv with reared/larva/pupa notes and populated months

## Next Phase Readiness
Closes #59. No follow-up required. filterRecords and the phenology chart's "N records" label are untouched, so reared records still render on the distribution map.

## Self-Check: PASSED

- All modified files present on disk
- Both task commits (`ac11a073` test, `330b5216` feat) exist in git history
- `REARED_TERMS` and `isRearedRecord` exported from parquet-cache.ts

---
*Quick task: 260629-geq*
*Completed: 2026-06-29*
