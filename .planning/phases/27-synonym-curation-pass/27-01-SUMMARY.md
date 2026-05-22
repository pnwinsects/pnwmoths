---
phase: 27-synonym-curation-pass
plan: 01
subsystem: curator-data
tags: [flat-csv, seed-file, species-synonyms, data]

requires:
  - phase: 26-dropbox-ingest-filename-parser-and-manifest
    provides: data/species.csv slug column (to_species_slug shape reference) and flat-CSV ethos

provides:
  - data/species-synonyms.csv header-only seed (from_binomial,to_species_slug) ready for curator PRs

affects:
  - 27-02 (loadSynonyms helper reads this file)
  - 27-03 (curator runbook refers to this exact path)

tech-stack:
  added: []
  patterns:
    - "PR-as-audit-trail flat CSV: two-column header-only seed; every row is a deliberate curator commit"

key-files:
  created:
    - data/species-synonyms.csv
  modified: []

key-decisions:
  - "D-08 enforced: header-only seed — no pre-filled synonyms including the spike's Grammia/Apantesis cluster; every row requires a curator PR"
  - "D-01 enforced: exactly two columns (from_binomial, to_species_slug); no decided_by/decided_on/note columns added"
  - "File size is 30 bytes (not 32 as stated in plan — plan's byte count was a typo; authoritative check is Node string-equality assertion which passed)"

patterns-established:
  - "Flat CSV seed pattern: header-only first commit, rows added by curator PRs with git history as audit trail"

requirements-completed:
  - CURATE-01

duration: 2min
completed: 2026-05-22
---

# Phase 27 Plan 01: Seed species-synonyms.csv Summary

**Header-only two-column CSV seed (from_binomial,to_species_slug) committed at data/species-synonyms.csv, ready for Plan 02's loadSynonyms helper and Plan 03's curator runbook**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-22T17:07:34Z
- **Completed:** 2026-05-22T17:08:49Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created data/species-synonyms.csv with exactly the D-01 two-column schema (from_binomial,to_species_slug)
- File is header-only per D-08: no pre-filled synonyms; every future row will be a deliberate curator PR with audit trail
- csv-parse/sync round-trips the file as zero records confirming the D-08 seed shape
- No other repo files were touched

## Task Commits

1. **Task 1: Create data/species-synonyms.csv seed file with header line only** - `35090b2` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `data/species-synonyms.csv` - Two-column header-only seed file: `from_binomial,to_species_slug` followed by a single LF; UTF-8 no BOM; 30 bytes; 1 line

## Verification Results

| Check | Result |
|-------|--------|
| File exists | OK |
| Node string-equality assert (`=== 'from_binomial,to_species_slug\n'`) | OK |
| File size | 30 bytes |
| Line count (`wc -l`) | 1 |
| Header (`head -1`) | `from_binomial,to_species_slug` |
| First 3 bytes hex (no BOM) | `66726f` (`fro`) |
| Auxiliary columns (grep) | 0 found |
| Data rows after header | 0 bytes |
| csv-parse/sync records count | 0 records, keys: (none) |

## Decisions Made

- **File size is 30 bytes, not 32:** The plan states "Total file size: 32 bytes (header `from_binomial,to_species_slug` = 31 chars + 1 newline = 32 bytes)" but the actual header is 29 characters (not 31), making the correct size 30 bytes. The authoritative verification — Node string-equality assertion against `'from_binomial,to_species_slug\n'` — passed. The 32-byte figure is a typo in the plan document.

## Deviations from Plan

None - plan executed exactly as written. The byte-count discrepancy noted above is a plan documentation error, not a deviation in the delivered artifact.

## Issues Encountered

None. The plan is atomic: create one file with one line.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- data/species-synonyms.csv exists at the committed path; Plan 02's `loadSynonyms` helper can now `existsSync` guard against it and parse it via `csv-parse/sync { columns: true, skip_empty_lines: true }` returning an empty Map
- Plan 03's curator runbook can reference `data/species-synonyms.csv` as a real committed path (not a forward reference)
- No blockers for Plans 02 or 03

## Self-Check

- `data/species-synonyms.csv` found: YES (verified above)
- Commit `35090b2` exists: YES (`git rev-parse --short HEAD` = 35090b2)

## Self-Check: PASSED

---
*Phase: 27-synonym-curation-pass*
*Completed: 2026-05-22*
