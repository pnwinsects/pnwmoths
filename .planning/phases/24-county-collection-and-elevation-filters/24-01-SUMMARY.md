---
phase: 24-county-collection-and-elevation-filters
plan: 01
subsystem: data-layer
tags: [lit, filters, parquet, web-components, tdd]
requires: []
provides: [filterRecords-county, filterRecords-collection, filterRecords-elevation]
affects: [pnwm-occurrence-map, pnwm-phenology-chart]
tech_stack:
  added: []
  patterns: [dropdown-guard, range-guard, null-coercion-passthrough]
key_files:
  created: []
  modified:
    - src/components/parquet-cache.js
    - src/components/filters.test.js
decisions:
  - "No null guard on r.elevation_ft: null < N evaluates false at default bounds (0, 15000), so null records pass through correctly without an explicit guard — matches the plan's locked contract"
metrics:
  duration_minutes: 12
  completed: 2026-05-20T22:50:00Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 24 Plan 01: County, Collection, and Elevation Filter Data Layer Summary

**One-liner:** Extended `filterRecords()` with four new filter dimensions (county, collection, elevationMin, elevationMax) using established null-guard patterns, with ten new TDD tests locking in the full behavioral contract.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add failing tests for county, collection, elevation dimensions | `1d5bd6e8` | src/components/filters.test.js |
| 2 | Extend filterRecords() with county/collection/elevation conditions | `6a728bdf` | src/components/parquet-cache.js |

## What Was Built

**Task 1 (TDD RED):** Appended a new `describe('filterRecords — geo and elevation dimensions', ...)` block to `filters.test.js` with a 5-record `geoRecords` fixture covering King/Pierce/Whatcom/null counties, UW/PSU/null collections, and elevation_ft values 100/500/2000/null/5000. Ten `it()` cases exercise county dropdown filtering, county "all" passthrough, null county inclusion, collection dropdown filtering, collection "all" passthrough, elevationMin exclusion (including null-coerces-to-0 behavior), elevationMax inclusion (including null passthrough), range exclusion, default-bounds null passthrough, and combined multi-dimension filtering. All ten tests confirmed RED before Task 2.

**Task 2 (TDD GREEN):** Added four guard conditions inside `filterRecords()` in `parquet-cache.js`, between the existing yearMax guard and `return true`:
- County dropdown guard: `filters.county && filters.county !== 'all' && r.county !== filters.county`
- Collection dropdown guard: same shape for collection
- elevationMin range guard: `filters.elevationMin != null && r.elevation_ft < filters.elevationMin`
- elevationMax range guard: `filters.elevationMax != null && r.elevation_ft > filters.elevationMax`

Updated JSDoc to document all eight filter dimensions. All 17 tests (7 existing + 10 new) pass GREEN.

## Decisions Made

- **No `r.elevation_ft != null` guard on record field:** The plan's locked behavioral contract specifies that `null < 0` is false in JS, so null elevation_ft records pass through at default bounds (elevationMin=0, elevationMax=15000). Adding a `!= null` guard would break this passthrough. The null-coercion behavior is intentional and tested explicitly.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Both files deliver complete, non-stub implementations.

## Threat Flags

None. This plan modifies only pure JS helpers and tests — no DOM writes, no event handlers, no third-party calls, no new network endpoints.

## Pre-existing Failures

`migrate-species: species.csv has >= 1,300 rows` fails because the MySQL dump file is absent from this developer's local filesystem. This failure is pre-existing and unrelated to this plan's changes.

## Self-Check: PASSED

- `src/components/filters.test.js` — FOUND (modified)
- `src/components/parquet-cache.js` — FOUND (modified)
- Commit `1d5bd6e8` — FOUND
- Commit `6a728bdf` — FOUND
- All 10 new test names present and verified GREEN
- All 7 existing tests still pass
