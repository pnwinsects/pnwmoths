# Task: Refresh the Boundary Data (data/boundaries/pnw-districts.geojson)

## What This Changes
- `data/boundaries/pnw-districts.geojson` — rewritten in full (single merged
  FeatureCollection; not additive). Every feature is exactly
  `{district_id, name}`.
- `data/district-adjacency.csv` — regenerated whenever the boundary geometry
  changes, since adjacency is a pure function of that geometry. This step is
  **boundary-lifecycle-scoped**: it belongs here, not in
  [ASSIGNING_DISTRICTS.md](ASSIGNING_DISTRICTS.md) (which only runs when
  *records* are added and never touches boundary geometry or this file).
- No other file changes. This is the boundary-**acquisition** step only —
  it does NOT assign `district_id` onto `data/records.csv`. That is
  [ASSIGNING_DISTRICTS.md](ASSIGNING_DISTRICTS.md)'s job; this file documents
  only the boundary-refresh step.

## Source Reference

| Source | URL | CRS | Identity field |
|--------|-----|-----|-----------------|
| US counties (WA/OR/ID/MT) | `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip` | NAD83 (EPSG:4269) | `GEOID` (5-digit zero-padded string) -> `US:<GEOID>` |
| Canadian census divisions (BC + Alberta division `CA:4804`) | `https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip` | NAD83 / Statistics Canada Lambert (EPSG:3347) | `CDUID` (string), filtered on `PRUID` (`"59"` = BC) -> `CA:<CDUID>` |

Both sources are stable, direct, unauthenticated HTTPS GETs. **StatCan
caveat:** a `HEAD` request against the StatCan URL 302-redirects to a
generic 404 page even though the file downloads fine via `GET` — this is a
server quirk, not a sign the source has moved. Never use a HEAD-only
reachability check against the StatCan URL. `scripts/build-boundaries.ts`'s
own `fetch()` calls always issue `GET`.

If StatCan ever renames or moves the file, the direct URL was originally
derived by decoding the landing page's dynamic form fields
(`lang=_e`, `type=b` Cartographic, `bound=cd_` Census Divisions, `format=a`
Shapefile) into the naming convention `l<bound><year><format>_<lang>.zip`;
re-deriving it requires POSTing that form again and reading the resulting
redirect's `Location` header.

## Steps

1. Confirm both source URLs above are still current (see the StatCan
   GET-not-HEAD caveat if a reachability check is needed).

2. Run the acquisition/conversion pipeline:
   ```bash
   node scripts/build-boundaries.ts
   ```
   This downloads both sources into a gitignored `.boundaries-scratch/`
   directory (skipped on re-run if already present — safe to re-run), runs a
   single `npx mapshaper@0.7.37` pass (filter to footprint -> reproject to
   WGS84 -> simplify -> normalize to `{district_id, name}` -> merge), and
   fail-fasts (`process.exit(1)`, no success reported) if any feature falls
   outside the committed footprint/bounds or if any `data/district-crosswalk.csv`
   `stable_id` fails to match exactly one polygon.

   Expected output ends with:
   ```
   [build-boundaries] features: 205 (US: 175, CA: 30)
   [build-boundaries] file size: 620.9 KB
   [build-boundaries] coverage OK: 184/184
   [build-boundaries] wrote .../data/boundaries/pnw-districts.geojson
   ```

3. Run the DuckDB spatial spot-check:
   ```bash
   node scripts/verify-boundaries.ts
   ```
   Expected output:
   ```
   [verify-boundaries] Tacoma, WA -> US:53053 (Pierce) OK
   [verify-boundaries] Victoria, BC -> CA:5917 (Capital) OK
   [verify-boundaries] Hanna, AB -> CA:4804 (Division No.  4) OK
   [verify-boundaries] file size: 620.9 KB (< 1 MB)
   [verify-boundaries] all reference points resolved correctly. OK
   ```

4. Regenerate the district-adjacency table — **only needed when the boundary
   geometry itself changes**, since adjacency is a pure function of
   `data/boundaries/pnw-districts.geojson`'s polygons. Do
   NOT run this as part of `ASSIGNING_DISTRICTS.md`'s record-addition
   workflow — that runbook never touches boundary geometry, so this table
   never goes stale from adding records.
   ```bash
   node scripts/build-district-adjacency.ts
   ```
   Expected output:
   ```
   [build-district-adjacency] pairs: 535
   [build-district-adjacency] wrote data/district-adjacency.csv
   ```
   The script fails loudly (non-zero exit) if the boundary file loads zero
   districts — never silently commit an empty adjacency table. A second run
   against unchanged boundary data produces a byte-identical file
   (deterministic sort); this is expected and safe to re-run.

5. If all scripts exit 0, commit the updated files:
   ```bash
   git switch -c refresh-boundaries
   git add data/boundaries/pnw-districts.geojson data/district-adjacency.csv
   git commit -m "Refresh boundary data"
   git push -u origin HEAD
   gh pr create --fill
   ```

   The `main` branch is protected: it takes changes only through a pull request whose
   build check passes. `gh pr create` opens one; merge it from the PR page (or with
   `gh pr merge`) once the check is green, and the site deploys automatically.

## Verify
- Expected: `node scripts/build-boundaries.ts` exits 0, coverage `184/184`
  (or the current distinct `data/district-crosswalk.csv` `stable_id` count),
  file size in the hundreds of KB.
- Expected: `node scripts/verify-boundaries.ts` exits 0 with all three
  reference points resolving to their expected `district_id`.
- Expected: `node scripts/build-district-adjacency.ts` exits 0 and reports a
  pair count in the low hundreds (plausible for 205 boundary features); a
  second run produces a byte-identical `data/district-adjacency.csv`.
- Failure: `build-boundaries.ts` prints `FAIL-FAST: footprint/bounds
  validator gate failed` — a feature landed outside the committed WGS84
  bounds; check that reprojection (`-proj wgs84`) actually ran and that
  `PNW_BOUNDS` in `scripts/build-boundaries.ts` still covers the intended
  footprint (it must cover full Montana, which reaches -104.04 longitude).
- Failure: `build-boundaries.ts` prints `FAIL-FAST: crosswalk coverage check
  failed` with a list of `missing`/`duplicated` ids — a
  `data/district-crosswalk.csv` `stable_id` has no matching polygon, or a
  `district_id` appears on more than one polygon. Do not commit; investigate
  the source data or the crosswalk before re-running.
- Failure: `verify-boundaries.ts` prints a reference-point mismatch — the
  committed file's geometry or `district_id` values are wrong for that
  point; do not commit.
- Failure: `build-district-adjacency.ts` prints
  `[build-district-adjacency] FAIL: districts table loaded zero rows` — the
  boundary file failed to load into DuckDB spatial; do not commit an empty
  `data/district-adjacency.csv`.
