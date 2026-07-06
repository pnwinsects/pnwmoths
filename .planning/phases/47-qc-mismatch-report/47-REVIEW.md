---
phase: 47-qc-mismatch-report
reviewed: 2026-07-05T23:55:07Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - scripts/derive-district-audit.ts
  - scripts/build-district-adjacency.ts
  - scripts/emit-records-district-audit.ts
  - scripts/derive-district-audit.test.ts
  - scripts/build-district-adjacency.test.ts
  - scripts/emit-records-district-audit.test.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 47: Code Review Report

**Reviewed:** 2026-07-05T23:55:07Z
**Depth:** deep
**Files Reviewed:** 6 (+ package.json wiring, `_instructions/ASSIGNING_DISTRICTS.md` / `REFRESHING_BOUNDARIES.md`, `data/records-derived-district.csv`, `data/district-adjacency.csv`, `data/district-crosswalk.csv` spot-checked)
**Status:** issues_found

## Summary

The row_index-keyed join, the four-tier classification, the D-07 coverage gate,
and the D-08 missing-coord pass-through were all traced end-to-end and verified
empirically against the live 95,397-row dataset (`node scripts/emit-records-district-audit.ts`
runs clean, exit 0, produces `far-mismatch=217 adjacent-and-close=1230
outside-all-boundaries=2460 same=91490 total=95397`). The state-scoped crosswalk
lookup is genuinely necessary and correctly implemented — `Lincoln` exists as a
county name in ID/MT/OR/WA, each mapped to a different `stable_id` in
`data/district-crosswalk.csv`, and the lookup key is `${state}|${county}`. Only
numeric, NaN-checked coordinates are ever interpolated into DuckDB SQL in the
reviewed files (ASVS V5 requirement met). The `ST_Boundary()` workaround was
verified directly against DuckDB: across all 20,910 real district-pair
combinations in `data/boundaries/pnw-districts.geojson`, exactly one pair
(`US:53009` Clallam / `US:53045` Mason) exhibits the claimed raw-`ST_Distance`-returns-0
bug on unwrapped polygons (0 vs. the correct 0.259°), and the `ST_Boundary()`
wrap fixes it — the workaround is empirically sound on the current geometry set.

The one Critical finding is a structural gap in the D-07 coverage-gate's
safety guarantee: it only checks *presence* of each `row_index`, never content
alignment, even though the artifact it reads already carries the exact
columns (`species_slug`, `latitude`, `longitude`, `state`, `county`) needed to
cheaply detect drift. See CR-01.

## Critical Issues

### CR-01: Coverage gate only checks row_index presence, not content — silently blind to any records.csv reorder/splice

**File:** `scripts/emit-records-district-audit.ts:108-117` (`findCoverageGaps`), `:338-343` (`RawDerivedDistrictCsvRow`), `:420-425` (`derivedRows` mapping)
**Also relevant:** `scripts/derive-district-audit.ts:66-90` (`DerivedDistrictRow` / `DERIVED_COLUMNS` — the artifact already carries `species_slug, latitude, longitude, state, county` per row)

**Issue:** The entire design (per 47-CONTEXT.md D-07) rests on "absent from the
artifact" being the *only* staleness signal, on the premise that `row_index` is
a safe positional join key because content-based joins are unsafe (14,217
duplicate `(species_slug, latitude, longitude, state, county)` keys in
`records.csv`). But `findCoverageGaps` proves *only* that every integer in
`[0, recordsCount)` has *some* row in the derived artifact at that index — it
never checks that the row at index `i` in `records.csv` today is the *same
record* as the row at index `i` in `data/records-derived-district.csv`.

`data/records-derived-district.csv` already carries `species_slug`,
`latitude`, `longitude`, `state`, and `county` per row (see
`DERIVED_COLUMNS` in `derive-district-audit.ts:79-90`), but
`emit-records-district-audit.ts`'s `RawDerivedDistrictCsvRow` (lines 338-343)
only destructures `row_index`, `outcome`, `district_id`, `distance_km` —
discarding exactly the columns that would make a cheap identity check
possible.

**Concrete failure scenario:** A maintainer edits `records.csv` between two
runs of `derive-district-audit.ts` in any way that preserves the total row
count but changes row *order or identity at a given index* — e.g., a future
"sort records.csv by species_slug" cleanup script, a merge-conflict
resolution that reorders hunks, or someone deleting one record and adding a
different one elsewhere in the file. `recordsRaw.length` still equals
`derivedRaw.length`, every index `0..N-1` is still present in
`artifactRowIndexes`, so `findCoverageGaps` reports zero gaps and the build
proceeds. From that point on, every shifted row is silently paired with the
**wrong** derived district — the audit CSV reports fabricated `far-mismatch` /
`same` verdicts for records that were never actually compared against their
own coordinates. This is the opposite of D-07's intent (fail loud on
staleness) in exactly the failure mode this data model considers "unsafe":
positional identity drift, indistinguishable from correctness by the current
gate.

Note: this does **not** describe a bug that has already fired — `records.csv`
has not been touched since the artifact was generated (verified via `git log
b5627af1..HEAD -- data/records.csv`, empty). This is a latent gap in the
safety net, not a currently-corrupted report.

**Fix:** Since the derived artifact already carries `species_slug`,
`latitude`, `longitude`, `state`, `county` per row, extend the coverage gate
(or add a sibling check run before it) to assert content equality at each
`row_index`, not just presence:

```ts
// in RawDerivedDistrictCsvRow, keep the columns already in the file:
interface RawDerivedDistrictCsvRow {
  row_index: string;
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
  outcome: string;
  district_id: string;
  distance_km: string;
}

// new pure, unit-testable check, run alongside findCoverageGaps:
export function findContentDrift(
  recordsRows: RecordsCsvRow[],
  derivedRows: RawDerivedDistrictCsvRow[],
): number[] {
  const derivedByIndex = new Map(derivedRows.map((d) => [Number(d.row_index), d]));
  const driftedIndexes: number[] = [];
  recordsRows.forEach((rec, i) => {
    const d = derivedByIndex.get(i);
    if (
      d &&
      (d.species_slug !== rec.species_slug ||
        d.latitude !== rec.latitude ||
        d.longitude !== rec.longitude)
    ) {
      driftedIndexes.push(i);
    }
  });
  return driftedIndexes;
}
```

Call this immediately after `findCoverageGaps` in `main()` and hard-fail with
the same `process.exit(1)` pattern on any drift, with a message pointing at
re-running `derive-district-audit.ts`.

## Warnings

### WR-01: `ST_Boundary()` workaround is empirically sound today but has no regression test against the real-geometry bug case, and no version guard

**File:** `scripts/build-district-adjacency.ts:85-101`, `scripts/build-district-adjacency.test.ts` (whole file)

**Issue:** The code comment claims DuckDB spatial's raw `ST_Distance`/`ST_DWithin`
"silently returns 0/true for raw Polygon-Polygon geometry pairs regardless of
actual separation," discovered empirically. I independently verified this
against the live `pnw-districts.geojson` (205 features, 20,910 district
pairs): exactly one real pair, `US:53009` (Clallam) / `US:53045` (Mason),
returns `ST_Distance(a.geom, b.geom) = 0` while
`ST_Distance(ST_Boundary(a.geom), ST_Boundary(b.geom)) = 0.259` (the correct
value — `ST_Touches` independently confirms `false`, i.e. they do not
actually touch). The workaround is correct and does fix this case.

However:
1. `build-district-adjacency.test.ts` only exercises hand-built synthetic
   squares (simple 4-vertex `Polygon`s). It never pins the specific
   real-geometry regression case (`US:53009`/`US:53045`, or any `MultiPolygon`
   pair — 20 of the 205 committed districts are `MultiPolygon`). If a future
   `spatial` extension version changes `ST_Boundary`'s behavior on
   `MultiPolygon` geometries (untested here), nothing in this test suite would
   catch a regression.
2. `INSTALL spatial;` (line 64) installs whatever version the DuckDB
   extension registry currently serves — there is no version pin and no
   comment noting which `spatial` extension version this workaround was
   verified against. A future maintainer re-running `build-district-adjacency.ts`
   after an extension update has no way to know whether the underlying bug
   (or the fix's correctness) still holds.

**Fix:** Add a test fixture using two real, disjoint `MultiPolygon` districts
from the committed GeoJSON (or a synthetic `MultiPolygon` pair) to
`build-district-adjacency.test.ts`, and add a code comment recording the
`spatial` extension version this was verified against (e.g. via `SELECT
extension_version FROM duckdb_extensions() WHERE extension_name='spatial';`
captured once and pasted into the comment), so a future version bump has a
concrete artifact to diff against.

### WR-02: `parseFloat` accepts partial-numeric-prefix strings, silently admitting malformed coordinates as valid

**File:** `scripts/derive-district-audit.ts:115-116`

**Issue:**
```ts
const lat = parseFloat(row.latitude);
const lon = parseFloat(row.longitude);
if (Number.isNaN(lat) || Number.isNaN(lon)) { ... 'no-coords' ... }
```
`parseFloat` parses a leading numeric prefix and ignores trailing garbage —
`parseFloat('47.25 (approx)')` returns `47.25`, not `NaN`. Any
`records.csv` cell with a malformed-but-numeric-prefixed coordinate (e.g. a
stray annotation, unit suffix, or OCR artifact from historical data entry)
would silently pass the `no-coords` guard and be treated as a fully valid
coordinate, entering `classifyCoordinate` → `resolveByCoordinates` →
`buildDerivedDistrictRows` as if it were clean data, with no signal
anywhere that the source cell was malformed. This same pattern exists
unmodified in Phase 46's `fill-district-from-coords.ts` (this phase reuses it
verbatim per its own comments), but Phase 47 widens its blast radius: it now
runs across *all* ~95k records rather than only the ~5,580 blank-`district_id`
rows Phase 46 touched, so any malformed non-blank coordinate cell that was
never exercised by Phase 46's narrower candidate filter is exercised here for
the first time.

**Fix:** Use a stricter numeric check before or instead of `parseFloat`, e.g.:
```ts
const latStr = row.latitude.trim();
const lonStr = row.longitude.trim();
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
const lat = NUMERIC_RE.test(latStr) ? parseFloat(latStr) : NaN;
const lon = NUMERIC_RE.test(lonStr) ? parseFloat(lonStr) : NaN;
```

## Info

### IN-01: Crosswalk lookup key is not trimmed/case-normalized (currently masked by the name-fallback path's own normalization)

**File:** `scripts/emit-records-district-audit.ts:201`

**Issue:** `crosswalk.get(\`${state}|${county}\`)` uses the raw `county` cell
verbatim. I verified against the live data that all 176 distinct
`(state, county)` pairs currently present in `records.csv` have an exact
crosswalk entry (zero misses), so this is not presently causing incorrect
tiers — a formatting difference would fall through to the D-02 name-fallback
path, which *does* normalize (`trim().toLowerCase()`) before comparing against
the derived district name, so the tier outcome is usually still correct by
luck. The visible side effect of any future drift (e.g. a new record entered
with trailing whitespace or different casing in `county`) would be a silently
mislabeled `stated_resolution_method` (`'name-fallback'` instead of
`'crosswalk'`), and a real risk of a false `far-mismatch` if the derived
district's human-readable name ever differs textually from the crosswalk's
canonical legacy name for the same county.

**Fix:** Normalize both sides of the lookup key, e.g.
`\`${state}|${county.trim()}\`` and build the crosswalk `Map` with the same
normalization applied to `legacy_name`.

### IN-02: Redundant in-JS re-sort duplicates the SQL's `ORDER BY` — two sources of truth for the same ordering

**File:** `scripts/build-district-adjacency.ts:93-121`

**Issue:** The SQL query already specifies `ORDER BY a.district_id,
b.district_id` (line 102). The subsequent JS-level `.sort()` (lines 109-121)
re-implements the identical lexicographic ordering by hand. This is dead
weight: if one is ever changed (e.g. someone "simplifies" the SQL by dropping
`ORDER BY` since a sort follows) without updating the other, the two could
silently diverge, and a reader has to verify both blocks agree rather than
trusting a single source of truth.

**Fix:** Drop either the SQL `ORDER BY` or the JS `.sort()` — one is
sufficient. Given DuckDB result-row order isn't guaranteed as an API contract
across versions, keeping the JS `.sort()` and dropping the SQL `ORDER BY`
(which is purely cosmetic/redundant here) is the more defensive choice.

### IN-03: `notes` provenance field from the derived artifact is dropped, never surfaced in the final audit CSV

**File:** `scripts/emit-records-district-audit.ts:338-343` (`RawDerivedDistrictCsvRow` — no `notes` field), compare `scripts/derive-district-audit.ts:76,190` (`notes` populated, e.g. `'coordinate could not be parsed as a number'`)

**Issue:** `data/records-derived-district.csv` carries a `notes` column with
useful per-record detail (currently only populated for `no-coords`, per
`buildDerivedDistrictRows`'s `resolution?.notes ?? ''`). `emit-records-district-audit.ts`
never reads or forwards it into `_site/records-district-audit.csv`. The
coarser `derived_outcome` column does preserve the outcome category
(`no-coords` vs. `out-of-bounds` vs. `axis-order-suspect` vs. `unassigned`),
so no information needed for the QC-03 pass-through logic is lost, but a
curator reading the final audit CSV loses the specific note text that would
otherwise help distinguish e.g. an unparseable-string case from a
future note variant without re-opening the intermediate artifact.

**Fix:** Add a `notes` field to `RawDerivedDistrictCsvRow`/`DerivedDistrictCsvRow`
and to `AuditRow`/`AUDIT_HEADER` if curator-facing detail is desired; otherwise
no action needed — this is a minor completeness gap, not a defect.

---

_Reviewed: 2026-07-05T23:55:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
