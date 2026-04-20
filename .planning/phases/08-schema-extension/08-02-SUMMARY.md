---
phase: 08-schema-extension
plan: "02"
subsystem: data
tags: [duckdb, csv, schema, taxonomy, images, build-pipeline]
dependency_graph:
  requires:
    - "species.csv with subfamily column (08-01)"
    - "images.csv with navigational column (08-01)"
  provides:
    - "build-data.js enforces subfamily in species.csv and navigational in images.csv"
    - "families.js returns subfamily per genus with NULLS LAST ordering"
    - "images.js returns navigational per image row"
  affects:
    - scripts/build-data.js
    - src/_data/families.js
    - src/_data/images.js
tech_stack:
  added: []
  patterns:
    - "DuckDB nullstr = '' for blank-to-NULL coercion on nullable VARCHAR columns"
    - "validateCsv column presence enforcement before DuckDB import"
key_files:
  modified:
    - scripts/build-data.js
    - src/_data/families.js
    - src/_data/images.js
decisions:
  - "nullstr = '' applied only to read_csv calls for species.csv and images.csv — records.csv has no new nullable columns in Phase 8 and is not modified"
  - "speciesResult query in families.js left unchanged — subfamily is a genus-level attribute, not needed in per-genus species list"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-20"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 8 Plan 02: Data Pipeline Schema Extension Summary

**One-liner:** Updated build-data.js, families.js, and images.js to enforce and expose the new subfamily and navigational CSV columns via DuckDB nullstr coercion.

## What Was Built

Three JavaScript data pipeline files updated to recognise the new CSV columns added in Plan 01:

- `scripts/build-data.js`: Added `'subfamily'` to species.csv validateCsv check; added `'navigational'` to images.csv validateCsv check; added `nullstr = ''` and `'subfamily': 'VARCHAR'` to DuckDB species table read_csv.
- `src/_data/families.js`: Added `nullstr = ''` and `'subfamily': 'VARCHAR'` to read_csv; added `subfamily` to genera SELECT projection; updated ORDER BY to `family, subfamily NULLS LAST, genus`.
- `src/_data/images.js`: Added `nullstr = ''` and `'navigational': 'VARCHAR'` to read_csv; added `navigational` to SELECT projection.

All blank values in existing CSV rows arrive as NULL (not empty string) via DuckDB nullstr coercion. The build pipeline now fails loudly if either new column is absent from its CSV.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update build-data.js validateCsv calls and DuckDB species schema | edd34b7 | scripts/build-data.js |
| 2 | Update families.js to include subfamily in schema, SELECT, and ORDER BY | 76209f0 | src/_data/families.js |
| 3 | Update images.js to include navigational in schema and SELECT | eb42e6b | src/_data/images.js |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All blank column values (subfamily=NULL, navigational=NULL) are intentional structural additions — existing rows have no subfamily or navigational data yet. These are not stubs blocking the plan's goal; the plan's purpose is pipeline enforcement and data pass-through.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes beyond what the plan's threat model covers. T-08-03 (validateCsv enforcement) confirmed mitigated — build now rejects CSVs missing either new column.

## Self-Check: PASSED

- scripts/build-data.js contains `'subfamily'` in validateCsv and DuckDB columns map: confirmed
- scripts/build-data.js contains `'navigational'` in validateCsv: confirmed
- scripts/build-data.js contains `nullstr = ''` in species read_csv block: confirmed
- scripts/build-data.js records table read_csv does NOT contain `nullstr = ''`: confirmed
- src/_data/families.js contains `'subfamily': 'VARCHAR'` in columns map: confirmed
- src/_data/families.js contains `subfamily NULLS LAST` in ORDER BY: confirmed
- src/_data/families.js contains `nullstr = ''`: confirmed
- src/_data/images.js contains `'navigational': 'VARCHAR'` in columns map: confirmed
- src/_data/images.js SELECT ends with `specimen, navigational`: confirmed
- src/_data/images.js contains `nullstr = ''`: confirmed
- `node scripts/build-data.js` exits 0: confirmed (exported 11 species)
- families.js genera rows contain `subfamily` key (value null): confirmed
- images.js image rows contain `navigational` key (value null): confirmed
- Commit edd34b7 exists: confirmed
- Commit 76209f0 exists: confirmed
- Commit eb42e6b exists: confirmed
