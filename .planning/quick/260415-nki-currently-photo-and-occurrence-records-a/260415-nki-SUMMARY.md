---
phase: quick
plan: 260415-nki
subsystem: data-pipeline
tags: [csv, data, slug, refactor]
dependency_graph:
  requires: []
  provides: [slug-keyed-csv-files]
  affects: [data/images.csv, data/records.csv, data/records-bad.csv, src/_data/images.js, scripts/build-data.js, src/species/species.njk]
tech_stack:
  added: []
  patterns: [slug-as-foreign-key]
key_files:
  created: []
  modified:
    - data/images.csv
    - data/records.csv
    - data/records-bad.csv
    - src/_data/images.js
    - scripts/build-data.js
    - scripts/build-data.test.js
    - src/species/species.njk
decisions:
  - "Use species slug (genus-species lowercase) as the cross-reference key in CSV data files instead of numeric IDs"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_changed: 7
---

# Quick Task 260415-nki Summary

**One-liner:** Replaced numeric `species_id` foreign keys in images.csv and records.csv with human-readable `species_slug` strings (e.g. `acronicta-americana`), updating all consumers.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update CSV files — replace species_id with species_slug | a549ffa | data/images.csv, data/records.csv, data/records-bad.csv |
| 2 | Update data loaders, build pipeline, template, and tests | 5a0c09c | src/_data/images.js, scripts/build-data.js, scripts/build-data.test.js, src/species/species.njk |

## What Changed

**data/images.csv, data/records.csv, data/records-bad.csv:** Column renamed from `species_id` (INTEGER) to `species_slug` (VARCHAR). All numeric IDs replaced with corresponding slug strings built from `lower(genus)-lower(species)`. In records-bad.csv, the intentionally invalid row `999` was replaced with `nonexistent-species`.

**src/_data/images.js:** DuckDB schema updated from `species_id: INTEGER` to `species_slug: VARCHAR`. SELECT and ORDER BY updated. Grouping key changed from `String(row.species_id)` to `row.species_slug`.

**src/species/species.njk:** Image lookup changed from `images[sp.id]` to `images[sp.slug]`.

**scripts/build-data.js:**
- `validateCsv` required columns updated for both images.csv and records.csv
- DuckDB records table schema: `species_id INTEGER` -> `species_slug VARCHAR`
- Orphaned records validation: join now uses `r.species_slug = lower(s.genus || '-' || s.species)`
- Coordinate/NULL check queries: `species_id` -> `species_slug`
- Parquet export COPY: `WHERE species_id = ${sp.id}` -> `WHERE species_slug = '${slug}'`

**scripts/build-data.test.js:** Updated expected images.csv column name and the inline test table in the latitude bounds test.

## Verification Results

- `node scripts/build-data.js` — succeeded, exported Parquet for 11 species
- `node --test scripts/build-data.test.js` — 10/10 tests pass
- `npx @11ty/eleventy --dryrun` — succeeded, 0 errors
- `grep -c species_id data/images.csv data/records.csv data/records-bad.csv` — 0 in all files
- `grep -c species_slug data/images.csv data/records.csv data/records-bad.csv` — 1 (header) in all files

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- a549ffa exists in git log
- 5a0c09c exists in git log
- data/images.csv header: `species_slug`
- data/records.csv header: `species_slug`
- data/records-bad.csv header: `species_slug`
- All 7 modified files verified correct
