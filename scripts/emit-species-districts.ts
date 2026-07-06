// scripts/emit-species-districts.ts
// Post-Vite build step: query records.csv via DuckDB, write
// _site/species-districts.json — the PNW-scoped species×state×county
// aggregate consumed by the Browse district filter (BFILT-01).
//
// Alberta is dropped (D-05) and Montana is capped to the committed
// western-MT county allow-list (data/mt-county-allowlist.csv, D-06/D-07).
// All filtering happens here, once, at build time, so the browser can
// trust the aggregate's contents (RESEARCH Architectural Responsibility Map).
//
// Run via: npm run build:species-districts
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

// ---------------------------------------------------------------------------
// Pure functions — unit-testable without I/O
// ---------------------------------------------------------------------------

/** One row of the species-districts.json flat array. */
export interface SpeciesDistrictRow {
  species_slug: string;
  state: string;
  county: string;
}

/** PNW states eligible for the Browse district filter (BFILT-03, D-05). */
export const PNW_STATES = new Set(['BC', 'WA', 'OR', 'ID', 'MT']);

const DEFAULT_ALLOWLIST_CSV_PATH = resolve('data/mt-county-allowlist.csv');

/**
 * Load the western-MT county allow-list from a CSV file (D-07).
 *
 * Mirrors loadWithheldFamilies's defensive shape (existsSync guard,
 * warn-and-empty-Set fallback, csv-parse/sync with columns:true), but
 * preserves county name case exactly — county names are compared verbatim
 * against data/records.csv's `county` column, with no case-folding anywhere
 * in this pipeline.
 *
 * @param csvPath Path to the MT county allow-list CSV; defaults to data/mt-county-allowlist.csv.
 */
export function loadMtCountyAllowlist(csvPath: string = DEFAULT_ALLOWLIST_CSV_PATH): Set<string> {
  if (!existsSync(csvPath)) {
    console.warn(`[mt-county-allowlist] ${csvPath} not found — no MT counties selectable (build continues)`);
    return new Set<string>();
  }

  const rows = parse(
    readFileSync(csvPath),
    { columns: true, skip_empty_lines: true }
  ) as Array<{ county: string }>;

  const counties = rows
    .map(r => (r.county ?? '').trim())
    .filter(c => c.length > 0);

  return new Set<string>(counties);
}

/**
 * Filter DISTINCT species×state×county rows to the PNW allow-list.
 *
 * - Drops every row whose state is not in `pnwStates` (removes AB, D-05).
 * - For MT rows, keeps only those whose county is in `mtAllowlist` (western-MT
 *   cap, D-06); other PNW states pass through unfiltered.
 */
export function filterToPnwAllowlist(
  rows: SpeciesDistrictRow[],
  pnwStates: Set<string>,
  mtAllowlist: Set<string>,
): SpeciesDistrictRow[] {
  return rows.filter(r => {
    if (!pnwStates.has(r.state)) return false;
    // WR-03: loadMtCountyAllowlist trims each allow-list entry, so trim the records
    // value too — otherwise a leading/trailing-whitespace mismatch would silently
    // drop a western-MT county. Case is NOT folded (county names are case-sensitive
    // per D-07); only whitespace is normalized so the two sides are symmetric.
    if (r.state === 'MT') return mtAllowlist.has(r.county.trim());
    return true;
  });
}

// ---------------------------------------------------------------------------
// CLI entry-point — wires the real data sources
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE records AS
    SELECT * FROM read_csv('data/records.csv',
      header = true,
      columns = {
        'species_slug': 'VARCHAR',
        'record_type': 'VARCHAR',
        'latitude': 'DOUBLE',
        'longitude': 'DOUBLE',
        'state': 'VARCHAR',
        'county': 'VARCHAR',
        'locality': 'VARCHAR',
        'elevation_ft': 'INTEGER',
        'year': 'INTEGER',
        'month': 'INTEGER',
        'day': 'INTEGER',
        'collector': 'VARCHAR',
        'collection': 'VARCHAR',
        'notes': 'VARCHAR',
        'district_id': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT DISTINCT species_slug, state, county
    FROM records
    WHERE state IS NOT NULL AND state != ''
      AND county IS NOT NULL AND county != ''
    ORDER BY species_slug, state, county
  `);
  const rows = result.getRowObjectsJS() as unknown as SpeciesDistrictRow[];

  conn.closeSync();

  const mtAllowlist = loadMtCountyAllowlist();
  const filtered = filterToPnwAllowlist(rows, PNW_STATES, mtAllowlist);

  const outPath = resolve('_site/species-districts.json');
  mkdirSync(resolve('_site'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(filtered));
  console.log(`Wrote ${filtered.length} species-district triples to _site/species-districts.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
