---
phase: 08-schema-extension
plan: "01"
subsystem: data
tags: [csv, schema, taxonomy, images]
dependency_graph:
  requires: []
  provides:
    - "species.csv with subfamily column"
    - "images.csv with navigational column"
  affects:
    - scripts/build-data.js
    - src/_data/families.js
    - src/_data/images.js
tech_stack:
  added: []
  patterns:
    - "Trailing-comma blank field pattern for nullable CSV columns"
key_files:
  modified:
    - data/species.csv
    - data/images.csv
decisions:
  - "All existing rows have blank subfamily/navigational values — blank coerces to NULL via DuckDB nullstr"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-20"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 8 Plan 01: CSV Schema Extension Summary

**One-liner:** Added nullable `subfamily` column to species.csv and nullable `navigational` column to images.csv with blank values for all 11 and 7 existing rows respectively.

## What Was Built

Two CSV flat files extended with new columns required by the v1.3 taxonomy browse feature:

- `data/species.csv`: `subfamily` appended as 9th column (index 8). All 11 existing rows have blank values.
- `data/images.csv`: `navigational` appended as 8th column (index 7). All 7 existing rows have blank values.

Blank values are intentional — they coerce to NULL via DuckDB `nullstr = ''` in the downstream build pipeline (Plan 02). No data rows were added, removed, or modified beyond the new trailing blank field.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add subfamily column to species.csv | daea257 | data/species.csv |
| 2 | Add navigational column to images.csv | b548a09 | data/images.csv |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The blank column values are intentional and documented: they represent unknown/unset data for existing rows, not stubs blocking plan goals. The plan's purpose is purely structural (column presence for build pipeline enforcement).

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's threat model covers.

## Self-Check: PASSED

- data/species.csv exists and header is `id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily` ✓
- data/images.csv exists and header is `species_slug,filename,photographer,weight,license,view,specimen,navigational` ✓
- Commit daea257 exists ✓
- Commit b548a09 exists ✓
