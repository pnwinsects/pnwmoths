# Task: Assign Counties / Regional Districts (data/records.csv district_id)

## What This Changes
- `data/records.csv` — additive fill of `district_id` cells only. A row's
  `district_id` is written ONLY if it was blank before the run; a non-blank
  `district_id` or `county` value is never overwritten and no other column is
  touched. The 15-column shape never changes. Safe to re-run at any time
  (idempotent — a row already filled is skipped on the next run).
- `data/legacy-rejoin-report.csv` and `data/coord-fill-report.csv` — each is
  rewritten in full every run, one row per record the corresponding step
  attempted.
- `data/records-derived-district.csv` — rewritten in full every run of step 4
  below, one row per `data/records.csv` row (100% coverage by construction,
  including no-coord/out-of-bounds/axis-order-suspect rows marked with an
  explicit no-district outcome). Report-only — this step never touches
  `data/records.csv`. The build's QC mismatch report
  (`scripts/emit-records-district-audit.ts`, run as
  `npm run build:records-district-audit`) reads this file and fails the build
  if any `data/records.csv` row is missing from it, so it must be
  regenerated whenever `data/records.csv` gains new rows.
- No other file changes. This is the county/district-**assignment** step
  only — it does not touch `data/boundaries/pnw-districts.geojson` (that is
  `_instructions/REFRESHING_BOUNDARIES.md`'s job) or the Eleventy build.

## When To Run This
Run this sequence any time new records are added to `data/records.csv`
(local upload), so every new occurrence gets a `county`/`district_id` the
same way the rest of the dataset did, and the build-time coverage-gap gate
(which checks the derived-district artifact against `data/records.csv`)
keeps passing. Steps 1-3 are the additive assignment sequence; step 4
regenerates the audit artifact and must be run even if steps 1-3 leave some
records unassigned (`unassigned`, `out-of-bounds`, `axis-order-suspect`,
`no-coords` outcomes are all valid, committed rows in the derived artifact —
only a row's *absence* from that artifact is a problem).

## Steps

1. Start the reference MySQL container (`pnwmoths-mysql`) that step 1 reads
   the curated legacy county/regional-district data from — see
   `scripts/backfill-legacy-county.ts`'s header comment for details on what
   this container holds.

2. Run the legacy re-join — restores the curated county name + `district_id`
   for any record the reference database already has an answer for:
   ```bash
   node scripts/backfill-legacy-county.ts
   ```
   Additive-only and safe to re-run. Fails fast (exit 1, no file written) if
   any matched legacy county name has no entry in
   `data/district-crosswalk.csv` — add the missing (state, name) pair to the
   crosswalk and re-run; do not use a `--force` flag (there isn't one).

   Expected output ends with a summary line, e.g.:
   ```
   [backfill-county] matched & filled:      89817
   [backfill-county] already had a value:   0
   [backfill-county] left blank (no match):  5580
   [backfill-county] fill rate: 2661/95397 (2.79%) -> 92478/95397 (96.94%)
   [backfill-county] wrote data/records.csv and data/legacy-rejoin-report.csv
   ```

3. Run the coordinate fill — derives a `district_id` from point-in-polygon
   containment (with a nearest-boundary fallback) for any record step 2
   couldn't match, using the committed boundary geometry
   (`data/boundaries/pnw-districts.geojson`) and the shared guard/gate module
   (`scripts/lib/district-assignment.ts`):
   ```bash
   node scripts/fill-district-from-coords.ts
   ```
   Also additive-only and safe to re-run — a record filled by step 2 (or a
   prior run of this step) is left untouched. A record whose coordinates fail
   the axis-order guard or the bounds sanity gate is skipped and reported,
   never mutated; one bad row never blocks the rest of the run.

   Real output from the 2026-07-05 live run against the full 95,397-row
   dataset (5,580 records had a blank `district_id` going into this step):
   ```
   [fill-district-from-coords] assigned-contained:  2991
   [fill-district-from-coords] assigned-fallback:   240
   [fill-district-from-coords] out-of-bounds:       0
   [fill-district-from-coords] axis-order-suspect:  0
   [fill-district-from-coords] unassigned:          2349
   [fill-district-from-coords] fill rate: 3231/5580 (57.90%)
   [fill-district-from-coords] wrote data/records.csv and data/coord-fill-report.csv
   ```
   **Read this fill-rate line in context, not as a flat target:** almost all
   of the `unassigned` rows above are Alberta (AB) records — see "Known
   Alberta Gap" below. Every US-state and BC record in that same run reached
   at least a 99% fill rate. If a future run's fill rate for **non-Alberta**
   records drops noticeably below 99%, that is the signal to investigate
   (see Verify below), not the raw combined number.

4. Regenerate the full-coverage derived-district audit artifact — the build's
   coverage-gap gate will not pass without this if new records were added.
   This is append-only-safe: the `row_index` join key is
   only correct because new records are always **appended** to
   `data/records.csv`, never inserted mid-file (mirrors
   `_instructions/ADDING_RECORDS.md`'s "append one row" convention). Reuses
   `resolveByCoordinates()` and `classifyCoordinate()` from steps above
   unmodified — report-only, it never touches `data/records.csv`:
   ```bash
   node scripts/derive-district-audit.ts
   ```
   Deterministic and safe to re-run (a re-run against unchanged inputs
   produces a byte-identical file). This is the expensive one-time spatial
   pass over all ~95k records — expect it to take a few seconds to a couple
   of minutes depending on machine.

   Real output from the 2026-07-05 live run against the full 95,397-row
   dataset (every row gets a derived outcome, not just previously-blank
   ones):
   ```
   [derive-district-audit] assigned-contained:  92177
   [derive-district-audit] assigned-fallback:   760
   [derive-district-audit] unassigned:          2460
   [derive-district-audit] out-of-bounds:       0
   [derive-district-audit] axis-order-suspect:  0
   [derive-district-audit] no-coords:           0
   [derive-district-audit] coverage: 95397/95397 records derived (assigned: 92937)
   [derive-district-audit] wrote data/records-derived-district.csv (report-only, records.csv untouched)
   ```

5. If all scripts exit 0, commit the updated files:
   ```bash
   git add data/records.csv data/legacy-rejoin-report.csv data/coord-fill-report.csv data/records-derived-district.csv
   git commit -m "Assign districts to new records"
   git push
   ```

## Known Alberta Gap

`data/boundaries/pnw-districts.geojson` currently includes only one Alberta
census division (`CA:4804`) — see `scripts/build-boundaries.ts`'s `AB_CDUID`
constant and its D-04 decision comment. That was a deliberate scoping
choice (it matched every Alberta id `data/district-crosswalk.csv`
referenced at the time), not a complete Alberta census-division dataset.

Practical effect: an Alberta record whose coordinates fall inside a
different Alberta census division has no candidate polygon within any
reasonable fallback distance (median nearest-boundary distance for the
2026-07-05 run's unassigned Alberta rows was 81.5 km — this is a coverage
gap, not a fallback-tolerance problem) and is correctly reported
`unassigned`, not `out-of-bounds`. This is expected and does not indicate a
bug in the fill script or the guard module. Alberta is also excluded from
the Browse district-filter dropdown by design (a separate, later phase), so
these `unassigned` Alberta rows do not block that feature.

If full Alberta coverage is later wanted, extend
`scripts/build-boundaries.ts`'s `caDistrictFilter` to include every Alberta
census division inside the project's footprint (not just `AB_CDUID`), add
any new ids `data/district-crosswalk.csv` needs, and re-run
`node scripts/build-boundaries.ts` (see
`_instructions/REFRESHING_BOUNDARIES.md`) before re-running step 3 above.

## Verify
- Expected: `node scripts/backfill-legacy-county.ts` exits 0 and writes
  `data/legacy-rejoin-report.csv`; every previously-blank `county` it could
  match against the reference database is filled.
- Expected: `node scripts/fill-district-from-coords.ts` exits 0 and writes
  `data/coord-fill-report.csv`; every outcome value is one of
  `assigned-contained` / `assigned-fallback` / `out-of-bounds` /
  `axis-order-suspect` / `unassigned`.
- Expected: for non-Alberta records, the coordinate-fill fill rate (assigned
  / attempted, excluding Alberta) stays at or above 99%.
- Expected: `node scripts/derive-district-audit.ts` exits 0 and writes
  `data/records-derived-district.csv` with exactly one row per
  `data/records.csv` row; the `row_index` column is the contiguous range
  `0..N-1` with no gaps or duplicates; every `outcome` value is one of
  `assigned-contained` / `assigned-fallback` / `unassigned` /
  `out-of-bounds` / `axis-order-suspect` / `no-coords`; a second run against
  unchanged inputs produces a byte-identical file.
- Failure: `backfill-legacy-county.ts` prints
  `FAIL-FAST: unmapped (state, legacy_name) pairs found in crosswalk` — add
  the listed pairs to `data/district-crosswalk.csv` and re-run. No files are
  written when this fails.
- Failure: `fill-district-from-coords.ts` throws
  `districts table loaded zero rows from ...` — the committed
  `data/boundaries/pnw-districts.geojson` failed to load; re-run
  `node scripts/verify-boundaries.ts` to confirm the boundary file itself is
  intact before re-running the fill.
- Failure: `derive-district-audit.ts` throws the same
  `districts table loaded zero rows from ...` error for the same reason —
  it reuses the same boundary-loading code as `fill-district-from-coords.ts`.
- Failure: the non-Alberta fill rate drops well below 99% on a future run —
  check whether the new low-fill-rate records are clustered near a
  coastline/island (the ~2 km nearest-boundary fallback in
  `scripts/lib/district-assignment.ts`'s `FALLBACK_KM` constant may need a
  larger, still-conservative tolerance) before assuming a data-quality issue
  in the new records themselves.
- Failure: the build prints a coverage-gap failure from
  `build:records-district-audit` after new records were added — step 4 above
  (`derive-district-audit.ts`) was not re-run and committed after the new
  records were appended; re-run it and commit the updated
  `data/records-derived-district.csv`.
