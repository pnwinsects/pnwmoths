---
phase: 05-maintainability
plan: 02
subsystem: docs
tags: [git-lfs, csv, eleventy, docker, maintainability]

requires:
  - phase: 05-01
    provides: project context for which files maintainers must edit

provides:
  - "_instructions/ADDING_SPECIES.md: LLM-actionable recipe for adding a species via data/species.csv"
  - "_instructions/ADDING_RECORDS.md: LLM-actionable recipe for adding occurrence records via data/records.csv"
  - "_instructions/EDITING_DESCRIPTION.md: LLM-actionable recipe for editing species prose descriptions"
  - "_instructions/ADDING_PHOTO.md: LLM-actionable recipe for adding photos with Git LFS"

affects: [maintainers, ci-cd, documentation]

tech-stack:
  added: []
  patterns:
    - "LLM-actionable instruction format: schema table first, exact file paths, numbered steps with commands, verify section with failure modes"

key-files:
  created:
    - _instructions/ADDING_SPECIES.md
    - _instructions/ADDING_RECORDS.md
    - _instructions/EDITING_DESCRIPTION.md
    - _instructions/ADDING_PHOTO.md
  modified: []

key-decisions:
  - "D-04: Primary audience is an LLM acting as editing assistant — structured, terse, machine-actionable format"
  - "D-06: One file per task in _instructions/ — ADDING_SPECIES.md, ADDING_RECORDS.md, EDITING_DESCRIPTION.md, ADDING_PHOTO.md"
  - "D-07: ADDING_PHOTO.md includes explicit Git LFS steps (install, status, add) per .gitattributes tracking patterns"

patterns-established:
  - "Instruction file structure: What This Changes → Schema table → Steps → Verify → Docker Alternative"

requirements-completed: [MAINT-01]

duration: 8min
completed: 2026-04-12
---

# Phase 5 Plan 02: Maintainer Instruction Files Summary

**Four LLM-actionable `_instructions/` files covering species, records, description, and photo editing tasks — each with exact CSV schemas derived from actual data headers and explicit Git LFS steps**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-12T00:00:00Z
- **Completed:** 2026-04-12T00:08:00Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Created `_instructions/ADDING_SPECIES.md` with full species.csv schema (8 fields), slug convention, optional description file step, and npm build verification
- Created `_instructions/ADDING_RECORDS.md` with full records.csv schema (14 fields), valid states (WA/OR/ID/MT/BC), and all four record types (specimen/photograph/literature/field notes)
- Created `_instructions/EDITING_DESCRIPTION.md` with YAML frontmatter format requirements and slug-to-filename matching rules
- Created `_instructions/ADDING_PHOTO.md` with images.csv schema, explicit Git LFS steps (git lfs install, git lfs status, git add as pointer), and .gitattributes tracking pattern reference

## Task Commits

Each task was committed atomically:

1. **Task 1: Create all four instruction files in _instructions/** - `3d897df` (feat)

**Plan metadata:** (committed with SUMMARY.md — see docs commit)

## Files Created/Modified
- `_instructions/ADDING_SPECIES.md` — Recipe for adding a new species: species.csv row + optional content/species/{slug}.md
- `_instructions/ADDING_RECORDS.md` — Recipe for adding occurrence records: records.csv rows with full field schema
- `_instructions/EDITING_DESCRIPTION.md` — Recipe for creating/editing species prose: content/species/{slug}.md with YAML frontmatter
- `_instructions/ADDING_PHOTO.md` — Recipe for adding photos: images/{slug}/ + images.csv + Git LFS workflow

## Decisions Made
- Used record_type values from actual records.csv header (specimen, photograph, literature, field notes) rather than the plan template's abbreviated list
- Verified CSV schemas against actual data file headers before documenting them

## Deviations from Plan

None - plan executed exactly as written. Minor improvement: `record_type` values in ADDING_RECORDS.md reflect actual values from records.csv (specimen, photograph, literature, field notes) rather than the plan's abbreviated "specimen or observation" — accurate schema documentation.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MAINT-01 complete — all four `_instructions/` files ready for maintainer use
- Instruction files are self-contained; a maintainer with only that file and an LLM can complete each task
- MAINT-02 through MAINT-04 (GitHub Actions CI/CD, Docker, build time) remain in Phase 5

## Self-Check

**Files exist:**
- `_instructions/ADDING_SPECIES.md` — FOUND
- `_instructions/ADDING_RECORDS.md` — FOUND
- `_instructions/EDITING_DESCRIPTION.md` — FOUND
- `_instructions/ADDING_PHOTO.md` — FOUND

**Commits exist:**
- `3d897df` — FOUND

## Self-Check: PASSED

---
*Phase: 05-maintainability*
*Completed: 2026-04-12*
