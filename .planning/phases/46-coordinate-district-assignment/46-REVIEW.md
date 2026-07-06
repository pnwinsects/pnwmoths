---
phase: 46-coordinate-district-assignment
reviewed: 2026-07-05T00:00:00Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - scripts/lib/district-assignment.ts
  - scripts/lib/district-assignment.test.ts
  - scripts/fill-district-from-coords.ts
  - scripts/fill-district-from-coords.test.ts
  - package.json
  - _instructions/ASSIGNING_DISTRICTS.md
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-07-05
**Depth:** deep
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 46 adds a pure guard/gate module (`scripts/lib/district-assignment.ts`) and a maintainer CLI (`scripts/fill-district-from-coords.ts`) that closely follow the phase's own research and mirror existing precedent (`backfill-legacy-county.ts`, `build-boundaries.ts`, `verify-boundaries.ts`). The axis-order-guard-before-bounds-gate ordering is correctly implemented and unit-tested, the fallback distance math correctly uses the planar `[lon,lat]`-consistent `ST_Distance` (never the axis-inverted `ST_Distance_Sphere`/`_Spheroid`), no CSV string values are ever interpolated into SQL (only parsed `number`s), the additive/idempotent write-back invariant holds under inspection and under the test suite, and the D-07 fail-soft/fail-loud split (per-row skip vs. zero-districts structural throw) is implemented as specified. I ran the full local test suite (20/20 passing) and spot-checked the committed `data/coord-fill-report.csv`/`data/records.csv` against the numbers documented in `ASSIGNING_DISTRICTS.md` — they match exactly (2991/240/0/0/2349).

Two things worth flagging as real, not stylistic:

1. **The primary containment query has no tie-break, unlike the fallback query.** I verified empirically (against the live committed `data/boundaries/pnw-districts.geojson`) that at least 10 pairs of adjacent US/Canada polygons genuinely overlap near the 49th-parallel border (e.g. `CA:5907` / `US:53047`, overlap area ~0.00036 deg², non-trivial), and a real point I constructed inside one such overlap is reported as `ST_Contains`-matched by **both** the US and the Canadian district simultaneously. The fallback query explicitly guards against exactly this class of non-determinism with `QUALIFY ROW_NUMBER() ... ORDER BY deg_dist ASC = 1` (RESEARCH.md Pitfall 4), but the containment query (run first, and far more heavily used — 2,991 of 3,231 total assignments) has no `ORDER BY`/tie-break at all; the "first" result is whatever order DuckDB's join happens to produce. I confirmed zero of the *current* 2,991 `assigned-contained` rows in `data/coord-fill-report.csv` actually fall inside one of these overlap slivers (lucky, not by design), but this is a live, reproducible latent bug, not a hypothetical one, in exactly the failure mode (cross-border misassignment) the phase's own research called out as the sharpest fallback risk.
2. **A narrow, real false-negative window in the axis-order guard's outcome *labeling*** (not a misassignment risk — the bounds gate still safely rejects these coordinates) for genuine swaps whose original longitude falls in `(-109, -103]` (the East-Montana band PNW_BOUNDS added in Phase 45 but that `AXIS_ORDER_PLAUSIBLE_LON` — copied verbatim from DIST-04's literal, narrower text — does not cover). These rows get reported `out-of-bounds` instead of `axis-order-suspect`, which is a data-quality/curator-facing mislabel, not an assignment-correctness bug.

Everything else is quality/robustness detail (resource cleanup, report-scope asymmetry vs. the sibling script, lenient `parseFloat`, missing determinism test for the primary containment path).

## Warnings

### WR-01: Containment query has no deterministic tie-break; verified-real overlapping US/CA polygons can be matched by `ST_Contains` more than once

**File:** `scripts/fill-district-from-coords.ts:229-233`
**Issue:** The primary containment query:
```sql
SELECT c.row_id AS row_id, d.district_id AS district_id
FROM candidates c
JOIN districts d ON ST_Contains(d.geom, ST_Point(c.lon, c.lat))
```
has no `ORDER BY`/`QUALIFY` clause, and the application code takes whichever row DuckDB returns first per `row_id` (`fill-district-from-coords.ts:239-249`, `if (!containedIds.has(row.row_id))`). This is the *same* non-determinism risk RESEARCH.md's Pitfall 4 identifies and the fallback query explicitly protects against three sections later (`QUALIFY ROW_NUMBER() OVER (PARTITION BY c.row_id ORDER BY deg_dist ASC) = 1`, line 267) — but the containment path, which produces 2,991 of the 3,231 total assignments in the live run, has no equivalent protection.

I confirmed this is not hypothetical: querying the committed `data/boundaries/pnw-districts.geojson` directly, at least 10 pairs of adjacent US/Canada polygons genuinely overlap (e.g. `CA:5907`/`US:53047` intersection area ≈ 0.00036 deg² — several km² near the 49th-parallel border, almost certainly a simplification/reprojection artifact of independently-sourced US Census vs. StatCan boundary files). A concrete point I constructed inside that overlap (`ST_PointOnSurface` of the intersection, lon=-119.602, lat=49.00017) is reported as contained by **both** `US:53047` and `CA:5907` when queried directly. I also confirmed none of the *current* 2,991 `assigned-contained` rows in `data/coord-fill-report.csv` happen to fall in one of these slivers — so today's committed output is unaffected — but a future record whose coordinate lands in one of these ~10 overlap zones will get a `district_id` that is effectively arbitrary (whichever the DuckDB join scan order happens to produce first), and could plausibly assign a US record to a Canadian district_id or vice versa — exactly the "false-positive assignment...across an international line" risk RESEARCH.md's Pitfall 4 called out.
**Fix:** Apply the same nearest-match tie-break used in the fallback query to the containment query, e.g.:
```sql
SELECT c.row_id AS row_id, d.district_id AS district_id
FROM candidates c
JOIN districts d ON ST_Contains(d.geom, ST_Point(c.lon, c.lat))
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY c.row_id
  ORDER BY ST_Distance(ST_Centroid(d.geom), ST_Point(c.lon, c.lat)) ASC
) = 1
```
(or, more simply, prefer the smaller-area polygon per row when more than one contains the point — a point that's genuinely inside both a small county and a larger overlapping sliver is more likely to "belong" to the smaller/more specific one). Either way, the tie-break must be deterministic, not join-order-dependent.

### WR-02: Axis-order guard has a real (but fail-safe) false-negative labeling window for East-Montana-range longitudes

**File:** `scripts/lib/district-assignment.ts:27-28, 56-64`
**Issue:** `AXIS_ORDER_PLAUSIBLE_LON = { min: -140, max: -109 }` is copied verbatim from DIST-04's literal requirement text, but `PNW_BOUNDS.lonMax` (imported from `build-boundaries.ts`) is `-103` — a band the phase's own module doc comment (lines 21-26) explicitly acknowledges is "NOT the accept/reject boundary." For a genuine axis-swap whose *original* longitude value is in `(-109, -103]` (real, legitimate East-Montana longitudes covered by `PNW_BOUNDS` since Phase 45), the swapped-in latitude-field value (e.g. `-106`) fails `latPlausibleAsLon` (since `-106 > -109`), so `isAxisOrderSuspect` returns `false` — the swap is never caught. It then correctly fails `isWithinAssignmentBounds` (the swapped value `-106` is nowhere near `[41,61]`), so the row is still safely rejected and never reaches a DuckDB query (no misassignment occurs) — but it is reported as `out-of-bounds` rather than `axis-order-suspect`, i.e. mislabeled for a curator triaging Phase 47's QC report. Today's `data/records.csv` has zero rows with `longitude > -110` (confirmed empirically), so this window is currently unreachable, but any future record with a genuinely swapped East-Montana coordinate will be silently mislabeled.
**Fix:** Widen `AXIS_ORDER_PLAUSIBLE_LON.min`/`max` to match `PNW_BOUNDS.lonMin`/`lonMax` (or import them), or explicitly document in the module comment that this is a known, accepted labeling gap for the East-Montana band and that Phase 47's report review should treat `out-of-bounds` rows with an East-Montana-range value in the *longitude* column as also worth an axis-swap sanity check.

### WR-03: DuckDB connections/instances are never closed in `resolveByCoordinates`

**File:** `scripts/fill-district-from-coords.ts:202-203`
**Issue:** `resolveByCoordinates` creates a fresh `DuckDBInstance`/`DuckDBConnection` on every call and never calls `conn.disconnectSync()`/`instance.closeSync()` (both exist on the `@duckdb/node-api` types). For the one-shot CLI (`main()`, called once per process) this is harmless — process exit reclaims everything — but `resolveByCoordinates` is an *exported*, reusable function, and `fill-district-from-coords.test.ts` calls it four separate times in the same test process (three `describe` blocks plus the determinism test's two sequential calls), each leaking a full DuckDB instance/connection. `verify-boundaries.ts` has the same gap but is only ever invoked once per process, so it's a weaker precedent for a function explicitly designed for reuse by this phase and Phase 47.
**Fix:**
```typescript
try {
  // ...existing query logic...
  return resolutions;
} finally {
  conn.disconnectSync();
  instance.closeSync();
}
```

### WR-04: `data/coord-fill-report.csv`'s scope (only currently-blank rows) diverges silently from the sibling `legacy-rejoin-report.csv`'s scope (every row, including `already_had_value`)

**File:** `scripts/fill-district-from-coords.ts:129-176` vs. `scripts/backfill-legacy-county.ts:262-266`
**Issue:** `backfill-legacy-county.ts`'s `joinNaturalKey` emits a report row for **every** record, including ones that already had a value (`outcome: 'already_had_value'`), so `legacy-rejoin-report.csv` is a full-dataset snapshot every run. `applyDistrictAssignments` in this phase instead **silently skips** any row with a non-blank `district_id` — no report row at all (`fill-district-from-coords.ts:137-143`). This is a defensible reading of D-05's "one row per attempted record" wording (and is documented correctly in `ASSIGNING_DISTRICTS.md`), but it means a second run of this script produces a `coord-fill-report.csv` that has *shrunk* relative to the first run's report — every row that got `assigned-contained`/`assigned-fallback` on run 1 silently disappears from run 2's report, whereas the equivalent legacy report never loses a row across reruns. A maintainer used to `legacy-rejoin-report.csv`'s always-full-dataset behavior could be surprised that `coord-fill-report.csv` isn't a durable per-record history.
**Fix:** Not a required change (behavior matches the literal spec and is documented in the runbook), but consider either (a) noting the scope difference explicitly in the module's header comment for future readers/Phase 47, or (b) emitting a passthrough report row (e.g. `outcome: 'already_had_value'`, mirroring the sibling script) for symmetry if Phase 47's QC tooling ever wants a full-dataset view without re-deriving it from two different report files.

## Info

### IN-01: `parseFloat` accepts trailing garbage, silently treating a partially-numeric coordinate string as valid

**File:** `scripts/fill-district-from-coords.ts:317-318`
**Issue:** `parseFloat(row.latitude)` / `parseFloat(row.longitude)` will parse e.g. `"47.2529 (est.)"` as `47.2529` rather than `NaN`, so a coordinate cell with trailing annotation/garbage silently passes the "could not be parsed as a number" check and proceeds through the guard/gate/DB pipeline as if it were clean data. This mirrors the exact same pattern already used by `backfill-legacy-county.ts`'s `normalizeCoord` (line 78-82), so it's consistent with existing project convention rather than a new defect, but it's worth noting since D-07 and the axis-order guard are explicitly about not trusting a coordinate until validated.
**Fix:** If stricter validation is ever wanted, use a regex anchor (`/^-?\d+(\.\d+)?$/.test(row.latitude)`) before `parseFloat`, or `Number(row.latitude)` (which returns `NaN` for any trailing non-numeric character) instead of `parseFloat`.

### IN-02: No automated test verifies "guard runs before any DuckDB query" as its own assertion

**File:** `scripts/fill-district-from-coords.test.ts` (whole file)
**Issue:** RESEARCH.md's own Phase-Requirements-to-Test map calls for a test asserting "a rejected row never reaches the containment/fallback SQL" (e.g. via a spy/mock query counter). The shipped test suite verifies the *outcome* (guard-rejected rows get `axis-order-suspect`/`out-of-bounds` and are never in the `district_id`-filled output) but there is no test that directly proves a guard-rejected row's coordinates never touch `resolveByCoordinates`/DuckDB. In the current code this is true by construction (`main()`'s `candidates` array is only populated after the guard/gate check, `fill-district-from-coords.ts:334-340`), so this is a coverage gap rather than a live defect, but a future refactor that moves the guard check after candidate-building would not be caught by any existing test.
**Fix:** Optional — add a unit test that passes a mix of guard-passing/failing rows through `main()`'s candidate-filter logic (extracted or inlined) and asserts the guard-failing rows' indices never appear in the `candidates` array passed to `resolveByCoordinates`.

### IN-03: `build-data.ts`'s build-blocking bounds validator still uses the stale `[42,60]×[-139,-110]` box, unreconciled with this phase's `PNW_BOUNDS` (`-103`) adoption

**File:** `scripts/build-data.ts:209-213` (not modified by this phase)
**Issue:** RESEARCH.md flagged this as an optional, out-of-scope reconciliation ("four inconsistent PNW bounds boxes"). It was correctly left unaddressed by this phase (confirmed: `build-data.ts` still hardcodes `lat 42.0-60.0, lon -139.0 to -110.0`), and `_instructions/ASSIGNING_DISTRICTS.md` doesn't call this out as a known gap. A future record with `district_id` successfully assigned by this phase's `fill-district-from-coords.ts` (longitude between -110 and -103, e.g. East Montana) would still trip `npm run build:data`'s own build-blocking out-of-bounds check — a confusing failure mode for whoever adds that record, unrelated on its face to the coordinate-fill step they just ran successfully.
**Fix:** No action required for this phase (correctly scoped out per RESEARCH.md), but worth a one-line mention in `ASSIGNING_DISTRICTS.md`'s "Verify"/"Known [X] Gap" section so a maintainer hitting this doesn't waste time debugging the wrong script.

---

_Reviewed: 2026-07-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
