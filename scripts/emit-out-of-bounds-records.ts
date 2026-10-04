// scripts/emit-out-of-bounds-records.ts
// Post-build step: list every out-of-bounds record in data/records.csv at
// _site/records-out-of-bounds.csv, for the /curation/ index (ADR 0047).
//
// An out-of-bounds record is kept in records.csv — it has a record_id and is
// validated like any other row — but its coordinates fall outside
// RECORD_COORDINATE_BOUNDS, so the served union leaves it out of every map,
// Parquet file and count. This report is the only place it shows.
//
// Derived from committed data on every build, so it cannot go stale and has
// nothing to resolve by hand. A record leaves the report when a ruling changes
// the data: its coordinates are corrected, the bounds are widened to include it,
// or its row is deleted (its id stays retired, ADR 0044). The ruling itself goes
// in docs/curation-log.md.
//
// Run via: npm run build:records-out-of-bounds  (after build:eleventy)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stringify } from 'csv-stringify/sync';
import {
  beyondBounds,
  isOutOfBoundsRecord,
  readCuratorRecordRows,
  type CuratorRecordRow,
} from './lib/records-source.ts';

/** Report columns: the id first, then which edge the point is past, then the record. */
export const OUT_OF_BOUNDS_COLUMNS = [
  'record_id', 'beyond', 'species_slug', 'record_type', 'latitude', 'longitude',
  'state', 'county', 'locality', 'elevation_ft', 'year', 'month', 'day',
  'collector', 'collection', 'notes',
] as const;

export type OutOfBoundsRow = Record<(typeof OUT_OF_BOUNDS_COLUMNS)[number], string>;

/**
 * The report rows for the given records.csv rows, in file order. `beyond` names
 * the edge or edges the point lies past ("east", "south", "south and east"),
 * which is how the curator's questions divide: east of 110° W is the Montana
 * coverage question, south of 42° N the border records (#367).
 */
export function outOfBoundsRows(rows: readonly CuratorRecordRow[]): OutOfBoundsRow[] {
  return rows.filter(isOutOfBoundsRecord).map((r) => ({
    record_id: r.record_id,
    beyond: beyondBounds(Number(r.latitude), Number(r.longitude)),
    species_slug: r.species_slug,
    record_type: r.record_type,
    latitude: r.latitude,
    longitude: r.longitude,
    state: r.state,
    county: r.county,
    locality: r.locality,
    elevation_ft: r.elevation_ft,
    year: r.year,
    month: r.month,
    day: r.day,
    collector: r.collector,
    collection: r.collection,
    notes: r.notes,
  }));
}

export function toCsv(rows: readonly OutOfBoundsRow[]): string {
  return stringify(rows as OutOfBoundsRow[], { header: true, columns: [...OUT_OF_BOUNDS_COLUMNS] });
}

function main(): void {
  const rows = outOfBoundsRows(readCuratorRecordRows());
  mkdirSync(resolve('_site'), { recursive: true });
  writeFileSync(resolve('_site/records-out-of-bounds.csv'), toCsv(rows));
  console.log(`Wrote ${rows.length} out-of-bounds record(s) to _site/records-out-of-bounds.csv`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
