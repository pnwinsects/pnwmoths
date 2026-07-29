// scripts/fill-district-from-coords.ts
// Maintainer-run coordinate-to-district fill (Phase 46: Coordinate ->
// District Assignment, DIST-05). Derives a `district_id` for every
// blank-district_id record in data/records.csv (D-01 — including the 2,660
// that already carry a stated county name Phase 44's re-join couldn't map)
// using point-in-polygon containment against the Phase 45 committed
// data/boundaries/pnw-districts.geojson, with a nearest-boundary ~2 km
// fallback (D-04) for near-shore/island points that fall just outside every
// polygon.
//
// Every candidate coordinate is classified by the shared, DB-free
// scripts/lib/district-assignment.ts guard/gate module BEFORE it ever
// reaches a DuckDB query (DIST-04) — an axis-order-suspect or out-of-bounds
// row never runs a containment/fallback query. The write-back is strictly
// additive: a row with a non-blank `district_id` is never touched, county/
// state/every other column is preserved verbatim, and no new column is
// added to records.csv (D-02/D-03/D-06). A bad row is skipped and reported,
// never mutated and never a hard failure for the whole run (D-07) — the
// only loud failure is a structural one (the boundary GeoJSON loading zero
// rows). Every run writes a full data/coord-fill-report.csv (one row per
// attempted i.e. blank-district_id record, D-05) and prints a per-outcome
// console summary + fill-rate line.
//
// See .planning/phases/46-coordinate-district-assignment/46-CONTEXT.md for
// the full decision record and 46-RESEARCH.md for the fallback-distance
// axis-order rationale (planar ST_Distance only — never
// ST_Distance_Sphere/_Spheroid/_DWithin_Spheroid, Pitfall 1).
//
// Run: node scripts/fill-district-from-coords.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { DuckDBInstance } from '@duckdb/node-api';
import { classifyCoordinate, parseCoordinate, FALLBACK_DEGREE_THRESHOLD, KM_PER_DEGREE_LAT } from './lib/district-assignment.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// records.csv column order — copied verbatim from backfill-legacy-county.ts.
// D-06: this phase adds no new column; it only fills the already-present
// (Phase 44) district_id column.
const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection',
  'notes', 'district_id',
];

const REPORT_COLUMNS = [
  'species_slug', 'latitude', 'longitude', 'state', 'county', 'outcome',
  'district_id_before', 'district_id_after', 'distance_km', 'notes',
];

// Rows per INSERT statement in resolveByCoordinates. The audit caller
// (derive-district-audit.ts) passes every records.csv row (~95k), and a
// single INSERT ... VALUES with that many tuples builds a multi-megabyte SQL
// string; chunking bounds the size of each generated statement (#128).
export const INSERT_CHUNK_SIZE = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** D-05 mandatory report outcome vocabulary — exactly these five literals. */
export type FillOutcome =
  | 'assigned-contained'
  | 'assigned-fallback'
  | 'out-of-bounds'
  | 'axis-order-suspect'
  | 'unassigned';

/** One data/records.csv row (15-column shape, D-06 — every value a string). */
export interface RecordCsvRow {
  species_slug: string;
  record_type: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
  locality: string;
  elevation_ft: string;
  year: string;
  month: string;
  day: string;
  collector: string;
  collection: string;
  notes: string;
  district_id: string;
}

/** One data/coord-fill-report.csv row — one per attempted (blank-district_id) record. */
export interface CoordFillReportRow {
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
  outcome: FillOutcome;
  district_id_before: string;
  district_id_after: string;
  distance_km: string;
  notes: string;
}

/** A resolved outcome for one attempted (blank-district_id) row, keyed by row index. */
export interface CoordResolution {
  outcome: FillOutcome;
  districtId: string;
  distanceKm: number | null;
  notes?: string;
}

/** A guard-passing candidate ready for the DuckDB containment/fallback pass. */
export interface CoordCandidate {
  index: number;
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Pure functions — no I/O, unit-tested without DuckDB
// ---------------------------------------------------------------------------

/**
 * Pure additive merge + report builder (mirrors joinNaturalKey's pure/
 * exported/DB-free shape). `rows` is every parsed records.csv row, in
 * order; `resolutions` is populated ONLY for attempted (blank-district_id)
 * rows. A row whose district_id is already non-blank passes through
 * untouched and gets NO report row (additive-only, D-02) — county/state/
 * every other column is preserved verbatim. A blank-district_id row is
 * filled ONLY when its resolved outcome is 'assigned-contained' or
 * 'assigned-fallback'; it always gets a report row regardless of outcome
 * (district_id_before is always '' since only blank rows are attempted).
 */
export function applyDistrictAssignments(
  rows: RecordCsvRow[],
  resolutions: Map<number, CoordResolution>,
): { filled: RecordCsvRow[]; reportRows: CoordFillReportRow[] } {
  const filled: RecordCsvRow[] = [];
  const reportRows: CoordFillReportRow[] = [];

  rows.forEach((row, index) => {
    if (row.district_id !== '') {
      // Additive-only (D-02): never overwrite a non-blank district_id, and
      // a non-attempted row gets no report row (report = one row per
      // *attempted* record, D-05).
      filled.push(row);
      return;
    }

    const resolution = resolutions.get(index);
    if (!resolution) {
      // Not attempted (no resolution supplied for this blank row) — pass
      // through untouched, no report row.
      filled.push(row);
      return;
    }

    const isAssigned =
      resolution.outcome === 'assigned-contained' || resolution.outcome === 'assigned-fallback';
    const districtIdAfter = isAssigned ? resolution.districtId : '';
    filled.push(isAssigned ? { ...row, district_id: districtIdAfter } : row);

    reportRows.push({
      species_slug: row.species_slug,
      latitude: row.latitude,
      longitude: row.longitude,
      state: row.state,
      county: row.county,
      outcome: resolution.outcome,
      district_id_before: '',
      district_id_after: districtIdAfter,
      distance_km:
        resolution.outcome === 'assigned-fallback' && resolution.distanceKm !== null
          ? resolution.distanceKm.toFixed(3)
          : '',
      notes: resolution.notes ?? '',
    });
  });

  return { filled, reportRows };
}

// ---------------------------------------------------------------------------
// DuckDB containment + fallback — the only DB-touching step
// ---------------------------------------------------------------------------

/**
 * Runs the DuckDB `spatial` session against the committed boundary GeoJSON
 * for a batch of guard-passing candidates: containment first
 * (ST_Contains), then a nearest-boundary fallback (planar ST_Distance,
 * NEVER ST_Distance_Sphere/_Spheroid/_DWithin_Spheroid — RESEARCH.md
 * Pitfall 1) for anything containment missed, ranked by distance ascending
 * with exactly one nearest match taken per row (RESEARCH.md Pitfall 4).
 * Fails loudly if the districts table loads zero rows (a malformed/empty
 * GeoJSON must not silently produce all-`unassigned`).
 *
 * Only numeric-parsed coordinates are ever interpolated into SQL below —
 * never a raw CSV string cell (RESEARCH.md Security Domain V5).
 */
export async function resolveByCoordinates(
  candidates: CoordCandidate[],
  geojsonPath: string,
): Promise<Map<number, CoordResolution>> {
  const resolutions = new Map<number, CoordResolution>();
  if (candidates.length === 0) return resolutions;

  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  // Close the connection on every exit path (WR-03). resolveByCoordinates is
  // designed for reuse (Phase 47's QC report calls it too), so an unclosed
  // connection would leak once per call — harmless for this one-shot CLI but
  // not for a repeated caller.
  try {
    // Custom extension repository workaround for a documented HTTP-302
    // redirect gotcha installing `spatial` from the default repo — copied
    // verbatim from scripts/verify-boundaries.ts (load-bearing).
    await conn.run("SET custom_extension_repository='https://extensions.duckdb.org';");
    await conn.run('INSTALL spatial;');
    await conn.run('LOAD spatial;');
    await conn.run(`CREATE TABLE districts AS SELECT * FROM ST_Read('${geojsonPath}');`);

    const countResult = await conn.run('SELECT COUNT(*) AS n FROM districts;');
    const countRows = (await countResult.getRowObjectsJS()) as Array<{ n: bigint | number }>;
    const districtCount = Number(countRows[0]?.n ?? 0);
    if (districtCount === 0) {
      throw new Error(
        `[fill-district-from-coords] FAIL: districts table loaded zero rows from ${geojsonPath} — refusing to assign against an empty/malformed boundary file`,
      );
    }

    await conn.run('CREATE TABLE candidates (row_id INTEGER, lon DOUBLE, lat DOUBLE);');
    // Only numeric coordinate values are interpolated here — never a raw
    // records.csv string cell (RESEARCH.md Security Domain V5). Inserted in
    // INSERT_CHUNK_SIZE batches so the full-coverage audit caller (~95k
    // candidates) never builds one multi-megabyte statement (#128).
    for (let i = 0; i < candidates.length; i += INSERT_CHUNK_SIZE) {
      const valuesSql = candidates
        .slice(i, i + INSERT_CHUNK_SIZE)
        .map((c) => `(${c.index}, ${c.lon}, ${c.lat})`)
        .join(', ');
      await conn.run(`INSERT INTO candidates VALUES ${valuesSql};`);
    }

    // Containment — ST_Point(lon, lat) matches ST_Contains's (x, y) = (lon,
    // lat) convention, the same convention used throughout this module.
    // QUALIFY takes exactly one match per row with a deterministic tie-break
    // (district_id ascending) so a point contained by two overlapping
    // polygons — real cross-border polygon pairs exist in the committed
    // boundary file — always resolves to the same district_id across runs
    // (RESEARCH.md Pitfall 4 — determinism), mirroring the fallback query.
    // Materialized as a table so the fallback query can exclude contained
    // rows via a subquery instead of a giant interpolated id list (#128).
    await conn.run(`
      CREATE TABLE contained AS
      SELECT c.row_id AS row_id, d.district_id AS district_id
      FROM candidates c
      JOIN districts d ON ST_Contains(d.geom, ST_Point(c.lon, c.lat))
      QUALIFY ROW_NUMBER() OVER (PARTITION BY c.row_id ORDER BY d.district_id ASC) = 1
    `);
    const containedResult = await conn.run('SELECT row_id, district_id FROM contained;');
    const containedRows = (await containedResult.getRowObjectsJS()) as Array<{
      row_id: number;
      district_id: string;
    }>;

    const containedIds = new Set<number>();
    for (const row of containedRows) {
      if (!containedIds.has(row.row_id)) {
        resolutions.set(row.row_id, {
          outcome: 'assigned-contained',
          districtId: row.district_id,
          distanceKm: null,
        });
        containedIds.add(row.row_id);
      }
    }

    const unmatched = candidates.filter((c) => !containedIds.has(c.index));
    if (unmatched.length > 0) {
      // Fallback — PLANAR ST_Distance keeps the same [lon, lat] convention as
      // ST_Point/ST_Contains above (RESEARCH.md Pitfall 1: never
      // ST_Distance_Sphere/_Spheroid/_DWithin_Spheroid — those require
      // [lat, lon] and are POINT-only). QUALIFY takes exactly one nearest
      // match per row, ranked by distance ascending (RESEARCH.md Pitfall 4 —
      // determinism, no unordered "any polygon within tolerance" match).
      const fallbackResult = await conn.run(`
        SELECT c.row_id AS row_id, d.district_id AS district_id,
               ST_Distance(d.geom, ST_Point(c.lon, c.lat)) AS deg_dist
        FROM candidates c
        JOIN districts d
          ON ST_Distance(d.geom, ST_Point(c.lon, c.lat)) < ${FALLBACK_DEGREE_THRESHOLD}
        WHERE c.row_id NOT IN (SELECT row_id FROM contained)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY c.row_id ORDER BY deg_dist ASC) = 1
      `);
      const fallbackRows = (await fallbackResult.getRowObjectsJS()) as Array<{
        row_id: number;
        district_id: string;
        deg_dist: number;
      }>;

      const fallbackIds = new Set<number>();
      for (const row of fallbackRows) {
        resolutions.set(row.row_id, {
          outcome: 'assigned-fallback',
          districtId: row.district_id,
          distanceKm: row.deg_dist * KM_PER_DEGREE_LAT,
        });
        fallbackIds.add(row.row_id);
      }

      for (const c of unmatched) {
        if (!fallbackIds.has(c.index)) {
          resolutions.set(c.index, { outcome: 'unassigned', districtId: '', distanceKm: null });
        }
      }
    }
  } finally {
    conn.closeSync();
  }

  return resolutions;
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const recordsCsvPath = resolve(ROOT, 'data/records.csv');
  const geojsonPath = resolve(ROOT, 'data/boundaries/pnw-districts.geojson');

  const rows = parse(readFileSync(recordsCsvPath), {
    columns: true,
    skip_empty_lines: true,
  }) as RecordCsvRow[];

  const resolutions = new Map<number, CoordResolution>();
  const candidates: CoordCandidate[] = [];

  // Candidate filter (D-01): EVERY row whose district_id is blank,
  // including rows that already have a stated county name — county
  // presence never excludes a row from a coord-derived attempt.
  rows.forEach((row, index) => {
    if (row.district_id !== '') return;

    const lat = parseCoordinate(row.latitude);
    const lon = parseCoordinate(row.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      // Skip + report, never mutate, never hard-fail (D-07).
      resolutions.set(index, {
        outcome: 'out-of-bounds',
        districtId: '',
        distanceKm: null,
        notes: 'coordinate could not be parsed as a number',
      });
      return;
    }

    // Guard-before-DB (DIST-04): the axis-order guard runs BEFORE any
    // DuckDB query — an axis-order-suspect or out-of-bounds row never
    // reaches the containment/fallback SQL.
    const outcome = classifyCoordinate(lat, lon);
    if (outcome === 'axis-order-suspect' || outcome === 'out-of-bounds') {
      resolutions.set(index, { outcome, districtId: '', distanceKm: null });
      return;
    }

    candidates.push({ index, lat, lon });
  });

  const dbResolutions = await resolveByCoordinates(candidates, geojsonPath);
  for (const [index, resolution] of dbResolutions) {
    resolutions.set(index, resolution);
  }

  const { filled, reportRows } = applyDistrictAssignments(rows, resolutions);

  writeFileSync(recordsCsvPath, stringify(filled, { header: true, columns: RECORDS_COLUMNS }), 'utf8');
  writeFileSync(
    resolve(ROOT, 'data/coord-fill-report.csv'),
    stringify(reportRows, { header: true, columns: REPORT_COLUMNS }),
    'utf8',
  );

  const counts: Record<FillOutcome, number> = {
    'assigned-contained': 0,
    'assigned-fallback': 0,
    'out-of-bounds': 0,
    'axis-order-suspect': 0,
    unassigned: 0,
  };
  for (const r of reportRows) counts[r.outcome] += 1;

  const attempted = reportRows.length;
  const assigned = counts['assigned-contained'] + counts['assigned-fallback'];
  const fillRate = attempted > 0 ? ((assigned / attempted) * 100).toFixed(2) : '0.00';

  console.log(`[fill-district-from-coords] assigned-contained:  ${counts['assigned-contained']}`);
  console.log(`[fill-district-from-coords] assigned-fallback:   ${counts['assigned-fallback']}`);
  console.log(`[fill-district-from-coords] out-of-bounds:       ${counts['out-of-bounds']}`);
  console.log(`[fill-district-from-coords] axis-order-suspect:  ${counts['axis-order-suspect']}`);
  console.log(`[fill-district-from-coords] unassigned:          ${counts['unassigned']}`);
  console.log(`[fill-district-from-coords] fill rate: ${assigned}/${attempted} (${fillRate}%)`);
  console.log('[fill-district-from-coords] wrote data/records.csv and data/coord-fill-report.csv');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
