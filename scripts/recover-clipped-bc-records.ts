// scripts/recover-clipped-bc-records.ts
// One-off data recovery (ISSUE: PNW bounding box clipped northern/coastal BC).
//
// The original migrate-species.js applied a PNW coordinate box of
// lat[42,55] x lon[-125,-110]. British Columbia and northern Alberta extend
// north to ~60N and west to ~-139W, so ~2,800 legitimate occurrence records
// were silently dropped. The 2021 source dump that migrate-species.js read is
// gone, so this script recovers the clipped records from the live reference
// MySQL container (`pnwmoths-mysql`) instead.
//
// It re-applies the EXACT pipeline filters (linked_photo=0, the six PNW states,
// non-null coords) but with the widened box, then:
//   - appends records that fall in the NEW box but were outside the OLD box to
//     data/records.csv (existing rows are preserved untouched), and
//   - writes records that fall outside even the NEW box (genuinely bad coords,
//     e.g. swapped lat/lon) to data/records-bad-coords.csv for curation.
//
// Records are mapped to slugs via data/species.csv (its `id` column IS the DB
// species_id), so appended slugs match what build-data.ts computes. Records for
// species absent from species.csv (slug-deduped/excluded) are skipped, matching
// the original migration.
//
// Run: node scripts/recover-clipped-bc-records.ts   (container must be running)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Widened PNW bounds: all of BC/AB (north to 60N, west to -139W). Keep these in
// sync with the out-of-bounds validation in scripts/build-data.ts.
const NEW_LAT_MIN = 42.0, NEW_LAT_MAX = 60.0;
const NEW_LON_MIN = -139.0, NEW_LON_MAX = -110.0;
// Original (too-small) box — records inside it are already in records.csv.
const OLD_LAT_MIN = 42.0, OLD_LAT_MAX = 55.0;
const OLD_LON_MIN = -125.0, OLD_LON_MAX = -110.0;

const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes',
];
const BAD_COLUMNS = ['species_id', 'species_slug', ...RECORDS_COLUMNS.slice(1)];

// Records already in records.csv (inside the old box) are excluded here; this
// query returns only the records the old box clipped (band) plus out-of-region
// junk (bad coords). NULLs are coalesced to '' to mirror migrate-species.js.
const SQL = `
SELECT
  r.species_id,
  r.record_type,
  r.latitude, r.longitude,
  st.code AS state,
  IFNULL(c.name,'') AS county,
  IFNULL(r.locality,'') AS locality,
  IFNULL(r.elevation,'') AS elevation_ft,
  IFNULL(r.year,'') AS year, IFNULL(r.month,'') AS month, IFNULL(r.day,'') AS day,
  IFNULL(col.name,'') AS collector,
  IFNULL(cn.name,'') AS collection,
  IFNULL(r.notes,'') AS notes
FROM species_speciesrecord r
JOIN species_state st ON st.id = r.state_id
LEFT JOIN species_county c ON c.id = r.county_id
LEFT JOIN species_collector col ON col.id = r.collector_id
LEFT JOIN species_collection cn ON cn.id = r.collection_id
WHERE r.state_id IN (42,43,61,66,77,80) AND r.linked_photo = 0
  AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
  AND NOT (r.latitude BETWEEN ${OLD_LAT_MIN} AND ${OLD_LAT_MAX}
       AND r.longitude BETWEEN ${OLD_LON_MIN} AND ${OLD_LON_MAX})
`;

/** Decode mysql --batch escaping (\t \n \\ within tab-separated fields). */
function unescapeBatch(s: string): string {
  return s.replace(/\\(.)/g, (_m, c) =>
    c === 't' ? '\t' : c === 'n' ? '\n' : c === '0' ? '\0' : c);
}

function queryContainer(): Record<string, string>[] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'pnwmoths-mysql', 'mysql', '-upnwmoths', '-ppnwmoths', 'pnwmoths', '--batch'],
    { input: SQL, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const lines = out.replace(/\n$/, '').split('\n');
  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t').map(unescapeBatch);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

function inBox(lat: number, lon: number, latMin: number, latMax: number, lonMin: number, lonMax: number): boolean {
  return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
}

function main(): void {
  // species_id -> slug, matching build-data.ts (lower(genus-species) from species.csv).
  const speciesCsvPath = resolve(ROOT, 'data/species.csv');
  const speciesRows = parse(readFileSync(speciesCsvPath), { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
  const slugById = new Map<string, string>();
  for (const r of speciesRows) {
    slugById.set(r.id, `${r.genus}-${r.species}`.toLowerCase());
  }

  const rows = queryContainer();

  const bandToAppend: Record<string, string>[] = [];
  const badCoords: Record<string, string>[] = [];
  let skippedNoSpecies = 0;

  for (const r of rows) {
    const lat = parseFloat(r.latitude);
    const lon = parseFloat(r.longitude);
    const slug = slugById.get(r.species_id) ?? '';

    if (inBox(lat, lon, NEW_LAT_MIN, NEW_LAT_MAX, NEW_LON_MIN, NEW_LON_MAX)) {
      // Recovered, in-bounds record. Append only if its species is in species.csv.
      if (!slug) { skippedNoSpecies++; continue; }
      bandToAppend.push({
        species_slug: slug,
        record_type: r.record_type,
        latitude: r.latitude,
        longitude: r.longitude,
        state: r.state,
        county: r.county,
        locality: r.locality,
        elevation_ft: r.elevation_ft,
        year: r.year, month: r.month, day: r.day,
        collector: r.collector,
        collection: r.collection,
        notes: r.notes,
      });
    } else {
      // Outside even the widened box: bad coordinates (e.g. swapped lat/lon).
      badCoords.push({
        species_id: r.species_id,
        species_slug: slug,
        record_type: r.record_type,
        latitude: r.latitude,
        longitude: r.longitude,
        state: r.state,
        county: r.county,
        locality: r.locality,
        elevation_ft: r.elevation_ft,
        year: r.year, month: r.month, day: r.day,
        collector: r.collector,
        collection: r.collection,
        notes: r.notes,
      });
    }
  }

  // Append band records to records.csv (rewrite whole file for consistent formatting).
  const recordsCsvPath = resolve(ROOT, 'data/records.csv');
  const existing = existsSync(recordsCsvPath)
    ? (parse(readFileSync(recordsCsvPath), { columns: true, skip_empty_lines: true }) as Record<string, string>[])
    : [];
  const merged = [...existing, ...bandToAppend];
  writeFileSync(recordsCsvPath, stringify(merged, { header: true, columns: RECORDS_COLUMNS }), 'utf8');

  // Write bad coordinates to a separate curation file.
  const badPath = resolve(ROOT, 'data/records-bad-coords.csv');
  writeFileSync(badPath, stringify(badCoords, { header: true, columns: BAD_COLUMNS }), 'utf8');

  console.log(`[recover-bc] candidate clipped records: ${rows.length}`);
  console.log(`[recover-bc] appended to records.csv:    ${bandToAppend.length} (now ${merged.length} rows)`);
  console.log(`[recover-bc] skipped (species not in species.csv): ${skippedNoSpecies}`);
  console.log(`[recover-bc] bad coordinates -> data/records-bad-coords.csv: ${badCoords.length}`);
}

main();
