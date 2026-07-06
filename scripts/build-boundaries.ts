// scripts/build-boundaries.ts
// Maintainer-run boundary acquisition/conversion (Phase 45: Boundary Data
// Acquisition). Encodes D-01 (feature identity normalized to
// {district_id, name}), D-02 (Canadian side sourced from StatCan Census
// Divisions, keyed by CDUID), D-03 (US side sourced from the US Census
// cartographic county file, keyed by GEOID), D-04 (the single Alberta
// division CA:4804 is included), and D-06 (one merged
// data/boundaries/pnw-districts.geojson). See
// .planning/phases/45-boundary-data-acquisition/45-RESEARCH.md for the
// verified mapshaper pipeline this feeds, and
// .planning/phases/45-boundary-data-acquisition/45-CONTEXT.md for the full
// decision record.
//
// Plan 45-01 established the testable, network-free validation core (the
// three exported pure functions below). Plan 45-02 (this file's main())
// wires them into the real download/filter/reproject/simplify/merge
// pipeline: downloads both government cartographic boundary sources into a
// gitignored `.boundaries-scratch/` dir, shells out to a single `npx
// mapshaper@0.7.37` invocation (array-form execFileSync — no shell string,
// no path/field interpolation, T-45-02), then fail-fasts on any footprint/
// bounds/crosswalk-coverage violation before printing a success summary.
//
// Run: node scripts/build-boundaries.ts

// ---------------------------------------------------------------------------
// Pure functions — no I/O, unit-tested
// ---------------------------------------------------------------------------

/** US STATEFP codes in the PNW footprint: WA=53, OR=41, ID=16, MT=30 (D-03, D-05 — full MT). */
export const PNW_STATEFP = ['53', '41', '16', '30'];

/** StatCan PRUID prefix for British Columbia (D-02) — a CDUID starting with this is a BC census division. */
export const BC_PRUID = '59';

/** The single Alberta census division the crosswalk already references (D-04). */
export const AB_CDUID = '4804';

/**
 * WGS84 bounding box for the committed PNW + BC + AB footprint (lat/lon
 * degrees). `lonMax` must cover D-05's full-Montana commitment: MT's eastern
 * border reaches -104.04 (verified against the real reprojected output,
 * Plan 45-02), well east of a western-MT-only box — -109 (this constant's
 * original Plan 45-01 value) would wrongly flag every eastern MT county as
 * out-of-bounds.
 */
export const PNW_BOUNDS = { latMin: 41, latMax: 61, lonMin: -140, lonMax: -103 };

/**
 * True iff `districtId` (the Phase 44 crosswalk's `US:<GEOID>` / `CA:<CDUID>`
 * format) falls inside the committed PNW footprint: a US county in
 * PNW_STATEFP, or a Canadian district in BC (CDUID starts with BC_PRUID) or
 * the single Alberta division AB_CDUID (D-04). Every id is compared as a
 * string — no numeric coercion of any kind — to avoid leading-zero loss on
 * zero-padded ids (RESEARCH.md §Pitfall 7).
 */
export function isInFootprint(districtId: string): boolean {
  const [country, id] = districtId.split(':');
  if (country === 'US') {
    if (!id || !/^\d{5}$/.test(id)) return false;
    return PNW_STATEFP.includes(id.slice(0, 2));
  }
  if (country === 'CA') {
    if (!id) return false;
    return id.startsWith(BC_PRUID) || id === AB_CDUID;
  }
  return false;
}

/** A GeoJSON position: [lon, lat] or [lon, lat, elevation]. */
export type Position = [number, number] | [number, number, number];
export type PolygonCoordinates = Position[][];
export type MultiPolygonCoordinates = Position[][][];

/**
 * Minimal local GeoJSON feature type covering just what this script needs
 * (Polygon/MultiPolygon geometry) — no external @types/geojson dependency.
 */
export interface GeoFeature {
  type: 'Feature';
  properties?: Record<string, unknown>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  };
}

function positionWithinBounds([lon, lat]: Position): boolean {
  return (
    lon >= PNW_BOUNDS.lonMin &&
    lon <= PNW_BOUNDS.lonMax &&
    lat >= PNW_BOUNDS.latMin &&
    lat <= PNW_BOUNDS.latMax
  );
}

/**
 * True iff every coordinate position in `feature`'s geometry (Polygon or
 * MultiPolygon) is a plausible WGS84 lon/lat inside PNW_BOUNDS — proving
 * reprojection landed and no unprojected easting/northing slipped through.
 */
export function featureWithinBounds(feature: GeoFeature): boolean {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') {
    return (coordinates as PolygonCoordinates).every((ring) =>
      ring.every((position) => positionWithinBounds(position)),
    );
  }
  if (type === 'MultiPolygon') {
    return (coordinates as MultiPolygonCoordinates).every((polygon) =>
      polygon.every((ring) => ring.every((position) => positionWithinBounds(position))),
    );
  }
  return false;
}

/** Result of {@link checkCrosswalkCoverage}: every crosswalk id with no matching
 * polygon, and every polygon district_id that appears more than once. */
export interface CoverageResult {
  missing: string[];
  duplicated: string[];
}

/**
 * The real DIST-03 acceptance gate (RESEARCH.md Pattern 3): every distinct
 * `data/district-crosswalk.csv` `stable_id` in `crosswalkIds` must map to
 * exactly one polygon `district_id` in `featureIds`. Extra polygons with no
 * crosswalk entry are fine (D-05 commits all MT counties, most of which have
 * no legacy crosswalk row yet) — they are neither missing nor duplicated.
 * Both result arrays are sorted for stable output.
 */
export function checkCrosswalkCoverage(
  crosswalkIds: Iterable<string>,
  featureIds: Iterable<string>,
): CoverageResult {
  const featureCounts = new Map<string, number>();
  for (const id of featureIds) {
    featureCounts.set(id, (featureCounts.get(id) ?? 0) + 1);
  }

  const distinctCrosswalkIds = new Set(crosswalkIds);
  const missing = [...distinctCrosswalkIds].filter((id) => !featureCounts.has(id)).sort();
  const duplicated = [...featureCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  return { missing, duplicated };
}

// ---------------------------------------------------------------------------
// CLI entry-point — download, mapshaper pipeline, fail-fast validator gates
// ---------------------------------------------------------------------------
// See .planning/phases/45-boundary-data-acquisition/45-RESEARCH.md Pattern 1
// (the exact mapshaper flag order — `-filter-fields` MUST run AFTER
// `-merge-layers`, Pitfall 4) and Pitfall 2 (the StatCan URL requires GET,
// never HEAD — a HEAD request 302-redirects to a generic 404 page even
// though the file downloads fine via GET; fetch() below always issues GET).
//
// `name` is passed through from each source verbatim (US Census `NAME`,
// StatCan `CDNAME`) per RESEARCH.md's Open Question #1 recommendation. Two
// StatCan census-division names are known-stale (predate a rename
// data/district-crosswalk.csv's own `notes` column already documents):
// CDUID 5947 ("Skeena-Queen Charlotte", now North Coast) and CDUID 5915
// ("Greater Vancouver", now Metro Vancouver). `name` is cosmetic-only here —
// Phase 46 joins on `district_id`, never `name` — so this phase does not
// rename; a future Phase 48 (Browse UI) planner should apply a display
// override there if these stale names are judged user-facing-unacceptable.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SCRATCH_DIR = resolve(ROOT, '.boundaries-scratch');
const US_DIR = resolve(SCRATCH_DIR, 'us');
const CA_DIR = resolve(SCRATCH_DIR, 'ca');
const US_ZIP = resolve(SCRATCH_DIR, 'cb_2023_us_county_500k.zip');
const CA_ZIP = resolve(SCRATCH_DIR, 'lcd_000b21a_e.zip');
const US_SHP = resolve(US_DIR, 'cb_2023_us_county_500k.shp');
const CA_SHP = resolve(CA_DIR, 'lcd_000b21a_e.shp');

const US_ZIP_URL = 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip';
const CA_ZIP_URL =
  'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip';

const OUTPUT_PATH = resolve(ROOT, 'data/boundaries/pnw-districts.geojson');
const CROSSWALK_PATH = resolve(ROOT, 'data/district-crosswalk.csv');

/** Downloads `url` (GET — never HEAD, Pitfall 2) to `destPath` unless it
 * already exists, so a local re-run is idempotent and skips the ~150 MB
 * combined re-download. */
async function downloadIfMissing(url: string, destPath: string): Promise<void> {
  if (existsSync(destPath)) return;
  console.log(`[build-boundaries] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[build-boundaries] download failed: ${url} -> HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  console.log(`[build-boundaries] downloaded ${destPath} (${buf.byteLength} bytes)`);
}

/** Unzips `zipPath` into `destDir` unless `expectedShp` is already there. */
function unzipIfMissing(zipPath: string, destDir: string, expectedShp: string): void {
  if (existsSync(expectedShp)) return;
  mkdirSync(destDir, { recursive: true });
  execFileSync('unzip', ['-o', zipPath, '-d', destDir], { encoding: 'utf8' });
}

export async function main(): Promise<void> {
  mkdirSync(SCRATCH_DIR, { recursive: true });
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

  await downloadIfMissing(US_ZIP_URL, US_ZIP);
  await downloadIfMissing(CA_ZIP_URL, CA_ZIP);
  unzipIfMissing(US_ZIP, US_DIR, US_SHP);
  unzipIfMissing(CA_ZIP, CA_DIR, CA_SHP);

  // Built from the shared PNW_STATEFP/BC_PRUID/AB_CDUID constants above so
  // the filter expressions can never drift out of sync with isInFootprint.
  const usStatefpFilter = `[${PNW_STATEFP.map((s) => `"${s}"`).join(',')}].includes(STATEFP)`;
  const caDistrictFilter = `PRUID=="${BC_PRUID}" || CDUID=="${AB_CDUID}"`;

  console.log('[build-boundaries] running mapshaper@0.7.37 pipeline...');
  // Array-form execFileSync args — NO shell string, no path/field
  // interpolation into a shell (T-45-02, mirrors recover-clipped-bc-records.ts
  // / backfill-legacy-county.ts's execFileSync(cmd, argsArray, opts) shape).
  // Flag order below is load-bearing: -filter-fields MUST run after
  // -merge-layers (Pitfall 4) or mapshaper hard-errors.
  execFileSync(
    'npx',
    [
      'mapshaper@0.7.37',
      '-i', US_SHP, 'name=us',
      '-i', CA_SHP, 'name=ca',
      '-filter', 'target=us', usStatefpFilter,
      '-filter', 'target=ca', caDistrictFilter,
      '-proj', 'target=us,ca', 'wgs84',
      '-simplify', 'target=us', '10%', 'keep-shapes',
      '-simplify', 'target=ca', '0.2%', 'keep-shapes',
      '-each', 'target=us', 'district_id="US:"+GEOID, name=NAME',
      '-each', 'target=ca', 'district_id="CA:"+CDUID, name=CDNAME',
      '-merge-layers', 'target=us,ca', 'force',
      '-filter-fields', 'district_id,name',
      '-o', 'format=geojson', 'force', OUTPUT_PATH,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  const raw = readFileSync(OUTPUT_PATH, 'utf8');
  const geojson = JSON.parse(raw) as { type: string; features: GeoFeature[] };
  const features = geojson.features;

  // Fail-fast gate 1/2 (Plan 45-01 validators): every feature is inside the
  // committed footprint, and its coordinates are plausible post-reprojection
  // WGS84 — proving the mapshaper -proj step actually landed.
  const outOfFootprint: string[] = [];
  const outOfBounds: string[] = [];
  for (const feature of features) {
    const districtId = (feature.properties?.district_id as string) ?? '';
    if (!isInFootprint(districtId)) outOfFootprint.push(districtId);
    if (!featureWithinBounds(feature)) outOfBounds.push(districtId);
  }
  if (outOfFootprint.length > 0 || outOfBounds.length > 0) {
    console.error('[build-boundaries] FAIL-FAST: footprint/bounds validator gate failed. No success reported.');
    if (outOfFootprint.length > 0) {
      console.error('  out-of-footprint district_ids:', outOfFootprint);
    }
    if (outOfBounds.length > 0) {
      console.error('  out-of-bounds (reprojection) district_ids:', outOfBounds);
    }
    process.exit(1);
  }

  // Fail-fast gate 3 (Plan 45-01 validator): the real DIST-03 acceptance
  // gate — every distinct crosswalk stable_id resolves to exactly one
  // polygon (RESEARCH.md Pattern 3).
  const crosswalkRows = parse(readFileSync(CROSSWALK_PATH), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ stable_id: string }>;
  const crosswalkIds = new Set(crosswalkRows.map((r) => r.stable_id));
  const featureIds = features.map((f) => (f.properties?.district_id as string) ?? '');
  const { missing, duplicated } = checkCrosswalkCoverage(crosswalkIds, featureIds);
  if (missing.length > 0 || duplicated.length > 0) {
    console.error('[build-boundaries] FAIL-FAST: crosswalk coverage check failed. No success reported.');
    if (missing.length > 0) console.error('  crosswalk ids with no matching polygon:', missing);
    if (duplicated.length > 0) console.error('  polygon district_ids appearing more than once:', duplicated);
    process.exit(1);
  }

  const usCount = featureIds.filter((id) => id.startsWith('US:')).length;
  const caCount = featureIds.filter((id) => id.startsWith('CA:')).length;
  const bytes = Buffer.byteLength(raw);

  console.log(`[build-boundaries] features: ${features.length} (US: ${usCount}, CA: ${caCount})`);
  console.log(`[build-boundaries] file size: ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`[build-boundaries] coverage OK: ${crosswalkIds.size}/${crosswalkIds.size}`);
  console.log(`[build-boundaries] wrote ${OUTPUT_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
