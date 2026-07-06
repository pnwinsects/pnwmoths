// scripts/derive-district-audit.ts
// Maintainer-run FULL-COVERAGE coordinate-to-district derivation (Phase 47:
// QC Mismatch Report, D-04/D-05). Unlike scripts/fill-district-from-coords.ts
// (Phase 46), which only attempts blank-district_id rows and WRITES BACK into
// data/records.csv, this script derives a coordinate district for EVERY row
// in data/records.csv (D-05: candidates.length + preClassified.size ===
// rows.length) and writes a report-only, one-row-per-record artifact,
// data/records-derived-district.csv, keyed by an explicit 0-based row_index
// (the load-bearing join key downstream — content-based joins are unsafe,
// 14,217 of 95,397 records.csv rows share a non-unique (species_slug,
// latitude, longitude, state, county) key). This script NEVER writes
// data/records.csv.
//
// Reuses scripts/fill-district-from-coords.ts's resolveByCoordinates()
// (containment + nearest-boundary fallback, deterministic tie-breaks) and
// scripts/lib/district-assignment.ts's classifyCoordinate() (mandatory
// axis-order guard THEN bounds gate) completely unmodified. The only new
// logic here is (1) widening the candidate filter from "blank district_id"
// to "every row," (2) adding a no-coords outcome distinct from out-of-bounds
// for blank/unparseable coordinate cells, and (3) the row_index-keyed,
// full-coverage output shape.
//
// See .planning/phases/47-qc-mismatch-report/47-CONTEXT.md (D-04, D-05) and
// 47-RESEARCH.md (Pattern 1, Pattern 3, Pitfall 1, Pitfall 4) for the full
// decision record.
//
// Run: node scripts/derive-district-audit.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { classifyCoordinate, parseCoordinate } from './lib/district-assignment.ts';
import {
  resolveByCoordinates,
  type CoordCandidate,
  type CoordResolution,
  type RecordCsvRow,
} from './fill-district-from-coords.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * D-05 mandatory full-coverage outcome vocabulary — the five FillOutcome
 * literals plus a new `no-coords` literal distinct from `out-of-bounds`,
 * for blank/unparseable coordinate cells (QC-03 needs to distinguish "no
 * coordinates at all" from "coordinates present but out of bounds").
 */
export type DerivedOutcome =
  | 'assigned-contained'
  | 'assigned-fallback'
  | 'unassigned'
  | 'out-of-bounds'
  | 'axis-order-suspect'
  | 'no-coords';

/** A resolved outcome for ANY row (full coverage — every row gets one). */
export interface DerivedResolution {
  outcome: DerivedOutcome;
  districtId: string | null;
  distanceKm: number | null;
  notes?: string;
}

/** One data/records-derived-district.csv row — exactly one per records.csv row. */
export interface DerivedDistrictRow {
  row_index: string;
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
  outcome: DerivedOutcome;
  district_id: string;
  distance_km: string;
  notes: string;
}

export const DERIVED_COLUMNS = [
  'row_index',
  'species_slug',
  'latitude',
  'longitude',
  'state',
  'county',
  'outcome',
  'district_id',
  'distance_km',
  'notes',
];

// ---------------------------------------------------------------------------
// Pure functions — no I/O, unit-tested without DuckDB
// ---------------------------------------------------------------------------

/**
 * Partitions EVERY row into either a guard-passing CoordCandidate (ready for
 * resolveByCoordinates) or a preClassified DerivedResolution — no-coords for
 * blank/unparseable lat/lon, axis-order-suspect/out-of-bounds from
 * classifyCoordinate() (mandatory guard-before-DB order, DIST-04). Unlike
 * fill-district-from-coords.ts's candidate filter, there is no "skip
 * non-blank district_id" early return — D-05 requires every row to be
 * classified, not just blanks.
 *
 * Invariant: candidates.length + preClassified.size === rows.length.
 */
export function classifyRecordsForDerivation(rows: RecordCsvRow[]): {
  candidates: CoordCandidate[];
  preClassified: Map<number, DerivedResolution>;
} {
  const candidates: CoordCandidate[] = [];
  const preClassified = new Map<number, DerivedResolution>();

  rows.forEach((row, index) => {
    const lat = parseCoordinate(row.latitude);
    const lon = parseCoordinate(row.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      preClassified.set(index, {
        outcome: 'no-coords',
        districtId: null,
        distanceKm: null,
        notes: 'coordinate could not be parsed as a number',
      });
      return;
    }

    // Guard-before-DB (DIST-04): the axis-order guard runs BEFORE any
    // DuckDB query — an axis-order-suspect or out-of-bounds row never
    // reaches the containment/fallback SQL. Only numeric-parsed
    // coordinates ever reach candidates -> resolveByCoordinates' SQL,
    // never a raw CSV string cell (RESEARCH.md Security Domain V5).
    const outcome = classifyCoordinate(lat, lon);
    if (outcome === 'axis-order-suspect' || outcome === 'out-of-bounds') {
      preClassified.set(index, { outcome, districtId: null, distanceKm: null });
      return;
    }

    candidates.push({ index, lat, lon });
  });

  return { candidates, preClassified };
}

/**
 * Widens a resolveByCoordinates() CoordResolution (assigned-contained /
 * assigned-fallback / unassigned) into a DerivedResolution — those three
 * literals map straight across; districtId's '' sentinel (used by the
 * fill-in-place script to mean "no assignment") becomes null here to match
 * DerivedResolution's full-coverage contract.
 */
function widenResolution(resolution: CoordResolution): DerivedResolution {
  return {
    outcome: resolution.outcome as DerivedOutcome,
    districtId: resolution.districtId === '' ? null : resolution.districtId,
    distanceKm: resolution.distanceKm,
    notes: resolution.notes,
  };
}

/**
 * Maps every input row to exactly one output row (full coverage, D-05).
 * row_index is String(index); district_id is set only for assigned-contained
 * / assigned-fallback outcomes (blank otherwise); distance_km is set only
 * for assigned-fallback (blank otherwise, including assigned-contained which
 * is 0/inside).
 */
export function buildDerivedDistrictRows(
  rows: RecordCsvRow[],
  resolutions: Map<number, DerivedResolution>,
): DerivedDistrictRow[] {
  return rows.map((row, index) => {
    const resolution = resolutions.get(index);
    const outcome: DerivedOutcome = resolution?.outcome ?? 'unassigned';
    const isAssigned = outcome === 'assigned-contained' || outcome === 'assigned-fallback';

    return {
      row_index: String(index),
      species_slug: row.species_slug,
      latitude: row.latitude,
      longitude: row.longitude,
      state: row.state,
      county: row.county,
      outcome,
      district_id: isAssigned && resolution?.districtId ? resolution.districtId : '',
      distance_km:
        outcome === 'assigned-fallback' && resolution?.distanceKm != null
          ? resolution.distanceKm.toFixed(3)
          : '',
      notes: resolution?.notes ?? '',
    };
  });
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

  const { candidates, preClassified } = classifyRecordsForDerivation(rows);

  // The only DB-touching step — reused unmodified from Phase 46 (Pitfall 4:
  // do not reimplement the containment/fallback SQL or its deterministic
  // tie-break).
  const dbResolutions = await resolveByCoordinates(candidates, geojsonPath);

  const resolutions = new Map<number, DerivedResolution>(preClassified);
  for (const [index, resolution] of dbResolutions) {
    resolutions.set(index, widenResolution(resolution));
  }

  const derivedRows = buildDerivedDistrictRows(rows, resolutions);

  // Report-only — this script NEVER writes data/records.csv.
  writeFileSync(
    resolve(ROOT, 'data/records-derived-district.csv'),
    stringify(derivedRows, { header: true, columns: DERIVED_COLUMNS }),
    'utf8',
  );

  const counts: Record<DerivedOutcome, number> = {
    'assigned-contained': 0,
    'assigned-fallback': 0,
    unassigned: 0,
    'out-of-bounds': 0,
    'axis-order-suspect': 0,
    'no-coords': 0,
  };
  for (const r of derivedRows) counts[r.outcome] += 1;

  const assigned = counts['assigned-contained'] + counts['assigned-fallback'];

  console.log(`[derive-district-audit] assigned-contained:  ${counts['assigned-contained']}`);
  console.log(`[derive-district-audit] assigned-fallback:   ${counts['assigned-fallback']}`);
  console.log(`[derive-district-audit] unassigned:          ${counts['unassigned']}`);
  console.log(`[derive-district-audit] out-of-bounds:       ${counts['out-of-bounds']}`);
  console.log(`[derive-district-audit] axis-order-suspect:  ${counts['axis-order-suspect']}`);
  console.log(`[derive-district-audit] no-coords:           ${counts['no-coords']}`);
  console.log(
    `[derive-district-audit] coverage: ${derivedRows.length}/${rows.length} records derived (assigned: ${assigned})`,
  );
  console.log(
    '[derive-district-audit] wrote data/records-derived-district.csv (report-only, records.csv untouched)',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
