---
phase: 08-schema-extension
plan: "03"
subsystem: data
tags: [duckdb, csv, testing, schema, taxonomy, images, null-coercion]
dependency_graph:
  requires:
    - "species.csv with subfamily column (08-01)"
    - "images.csv with navigational column (08-01)"
    - "build-data.js validateCsv and DuckDB schema extensions (08-02)"
  provides:
    - "Happy-path validateCsv tests assert subfamily and navigational column presence"
    - "DuckDB nullstr null-coercion tests for blank subfamily and navigational values"
  affects:
    - scripts/build-data.test.js
tech_stack:
  added: []
  patterns:
    - "Synthetic temp-file CSV fixture with DuckDB nullstr assertion (extended to new columns)"
key_files:
  modified:
    - scripts/build-data.test.js
decisions:
  - "Null-coercion tests use assert.strictEqual(value, null) — strictEqual enforces both value and type, not truthiness or loose equality"
  - "Two separate temp directories (.tmp-nullstr-subfamily and .tmp-nullstr-navigational) per test — no shared state"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-20"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 8 Plan 03: Test Suite Extension Summary

**One-liner:** Extended build-data.test.js with subfamily and navigational happy-path assertions and two DuckDB nullstr null-coercion tests; all 39 tests pass.

## What Was Built

Four test changes to `scripts/build-data.test.js`:

- **Edit 1 — species.csv happy-path:** Added `'subfamily'` to the required-columns array in the `validateCsv` happy-path test, asserting that `data/species.csv` contains the new column.
- **Edit 2 — images.csv happy-path:** Added `'navigational'` to the required-columns array in the `validateCsv` happy-path test, asserting that `data/images.csv` contains the new column.
- **New test: subfamily null-coercion:** Writes a minimal species CSV with a blank `subfamily` cell to a temp file, reads it via DuckDB `read_csv` with `nullstr = ''`, and asserts `rows[0].subfamily === null` (not empty string).
- **New test: navigational null-coercion:** Writes a minimal images CSV with a blank `navigational` cell to a temp file, reads it via DuckDB `read_csv` with `nullstr = ''`, and asserts `rows[0].navigational === null` (not empty string).

Both null-coercion tests use `assert.strictEqual(value, null)` — enforcing type-safe equality. Temp directories are cleaned up in `finally` blocks.

Test count: 37 (prior) + 2 = 39 total, all passing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update happy-path tests and add null-coercion tests for subfamily and navigational | 2207a7d | scripts/build-data.test.js |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes. T-08-07 (temp directories cleaned in finally blocks) and T-08-08 (in-memory DuckDB instances closed with closeSync()) confirmed mitigated as specified in the plan threat model.

## Self-Check: PASSED

- `scripts/build-data.test.js` exists: confirmed
- Contains `'subfamily'` in happy-path test: confirmed (grep count = 2)
- Contains `'navigational'` in happy-path test: confirmed (grep count = 2)
- Contains `'blank subfamily cell should be NULL'` assertion message: confirmed
- Contains `'blank navigational cell should be NULL'` assertion message: confirmed
- Both null-coercion tests use `assert.strictEqual(rows[0].X, null, ...)`: confirmed
- `npm test` exits 0, all 39 tests green: confirmed
- Commit 2207a7d exists: confirmed
