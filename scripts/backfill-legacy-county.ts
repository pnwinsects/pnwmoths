// scripts/backfill-legacy-county.ts
// Maintainer-run re-join: restores the reference DB's curated county /
// regional-district assignment onto data/records.csv, additive-only.
//
// The reference MySQL container (`pnwmoths-mysql`) holds a curated
// `species_speciesrecord` table with a `county_id`/`state_id` the 2021
// migration never carried over. This script re-derives the join via a
// two-tier natural key (species + coordinates + date + collector + collection
// + record_type, with `locality` as a tie-breaker only for ambiguous groups —
// see .planning/phases/44-legacy-county-re-join/44-RESEARCH.md), resolves the
// matched county/district name to a committed, curator-reviewable stable ID
// (data/district-crosswalk.csv), and writes both the county name and the
// stable ID back into data/records.csv.
//
// Never overwrites a row that already has a non-blank `county` (additive-only,
// D-01). Fails fast — before any write — if any row it would fill maps to a
// (state, legacy_name) pair absent from the crosswalk (D-03, no --force). Every
// run prints a console summary and writes data/legacy-rejoin-report.csv (D-04).
//
// Run: node scripts/backfill-legacy-county.ts   (container must be running)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// records.csv column order — mirrors recover-clipped-bc-records.ts, with the
// new stable-ID column appended (RESEARCH.md "Records.csv Schema Change").
const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection',
  'notes', 'district_id',
];

const REPORT_COLUMNS = [
  'species_slug', 'latitude', 'longitude', 'year', 'outcome',
  'county_before', 'county_after', 'district_id_after', 'notes',
];

// Fixed literal SQL — no CSV/DB field value is ever interpolated into this
// string (T-44-03). Mirrors scripts/recover-clipped-bc-records.ts's query
// shape (same joins, same six PNW state_ids), but is NOT restricted to any
// coordinate box — every row with a curated county/state is a join candidate.
const SQL = `
SELECT
  r.species_id,
  r.record_type,
  r.latitude, r.longitude,
  st.code AS state,
  IFNULL(c.name,'') AS county,
  IFNULL(r.locality,'') AS locality,
  IFNULL(r.year,'') AS year, IFNULL(r.month,'') AS month, IFNULL(r.day,'') AS day,
  IFNULL(col.name,'') AS collector,
  IFNULL(cn.name,'') AS collection
FROM species_speciesrecord r
JOIN species_state st ON st.id = r.state_id
LEFT JOIN species_county c ON c.id = r.county_id
LEFT JOIN species_collector col ON col.id = r.collector_id
LEFT JOIN species_collection cn ON cn.id = r.collection_id
WHERE r.state_id IN (42,43,61,66,77,80) AND r.linked_photo = 0
  AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
  AND r.county_id IS NOT NULL
`;

// ---------------------------------------------------------------------------
// Pure functions — no I/O, unit-tested without Docker
// ---------------------------------------------------------------------------

/** Strip punctuation-only variants (periods, quotes) so "sp." / "sp" reconcile. */
export function normalizeBinomial(s: string): string {
  return s.replace(/\./g, '').replace(/"/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Round a coordinate string to 3 decimals (~100m); blank/NaN -> ''. */
export function normalizeCoord(v: string): string {
  if (v === '' || v == null) return '';
  const n = parseFloat(v);
  return Number.isNaN(n) ? '' : n.toFixed(3);
}

export interface CsvSpeciesRow {
  id: string;
  genus: string;
  species: string;
}

export interface DbSpeciesRow {
  genus: string;
  species: string;
}

/**
 * Resolve a species.csv row's DB species_id: trust species.csv's own `id`
 * only when the DB row at that id has a matching (normalized) species
 * epithet — this covers straight matches AND legitimate genus renames.
 * Otherwise fall back to a normalized genus+species lookup; if that is
 * ambiguous (0 or >1 candidates), return null rather than guess.
 * See RESEARCH.md "Species-ID Resolution".
 */
export function resolveDbSpeciesId(
  csvRow: CsvSpeciesRow,
  dbSpeciesById: Map<string, DbSpeciesRow>,
  dbIdsByNormalizedBinomial: Map<string, string[]>,
): string | null {
  const dbRow = dbSpeciesById.get(csvRow.id);
  if (dbRow && normalizeBinomial(dbRow.species) === normalizeBinomial(csvRow.species)) {
    return csvRow.id;
  }
  const key = `${normalizeBinomial(csvRow.genus)}|${normalizeBinomial(csvRow.species)}`;
  const candidates = dbIdsByNormalizedBinomial.get(key);
  if (candidates && candidates.length === 1) {
    return candidates[0] ?? null;
  }
  return null;
}

/** One row from the reference DB extraction (natural-key + payload fields). */
export interface DbRow {
  species_id: string;
  latitude: string;
  longitude: string;
  year: string;
  month: string;
  day: string;
  collector: string;
  collection: string;
  record_type: string;
  locality: string;
  county: string;
  state: string;
}

/**
 * One data/records.csv row plus its resolved DB species_id (null if
 * unresolved by resolveDbSpeciesId — see main()). `district_id` is always the
 * crosswalk's prefixed zero-padded string (e.g. `US:53077` / `CA:5907`),
 * never a parsed number (T-44-05).
 */
export interface JoinCsvRow {
  species_slug: string;
  species_id: string | null;
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

export type JoinOutcome =
  | 'filled'
  | 'already_had_value'
  | 'conflict_unresolved'
  | 'no_match'
  | 'species_unresolved';

export interface JoinReportRow {
  species_slug: string;
  latitude: string;
  longitude: string;
  year: string;
  outcome: JoinOutcome;
  county_before: string;
  county_after: string;
  district_id_after: string;
  notes: string;
}

export interface JoinResult {
  filled: JoinCsvRow[];
  reportRows: JoinReportRow[];
  /** Every "state|legacy_name" pair a fill would need but the crosswalk lacks. */
  unmappedNames: Set<string>;
}

/** Core natural key — species + coords(rounded) + date + collector/collection
 * name + record_type. `locality` is deliberately excluded here (Pitfall 5) —
 * it is applied only as a tie-break for conflicting multi-match groups. */
function coreKey(row: {
  species_id: string;
  latitude: string;
  longitude: string;
  year: string;
  month: string;
  day: string;
  collector: string;
  collection: string;
  record_type: string;
}): string {
  return [
    row.species_id,
    normalizeCoord(row.latitude),
    normalizeCoord(row.longitude),
    row.year ?? '',
    row.month ?? '',
    row.day ?? '',
    row.collector ?? '',
    row.collection ?? '',
    row.record_type ?? '',
  ].join('|');
}

function reportRow(
  row: JoinCsvRow,
  outcome: JoinOutcome,
  countyAfter: string,
  districtIdAfter: string,
  notes: string,
): JoinReportRow {
  return {
    species_slug: row.species_slug,
    latitude: row.latitude,
    longitude: row.longitude,
    year: row.year,
    outcome,
    county_before: row.county,
    county_after: countyAfter,
    district_id_after: districtIdAfter,
    notes,
  };
}

/**
 * Pure natural-key join. Fills a uniquely-matching or multi-match-agreeing
 * row's county/district_id; a conflicting multi-match group is retried
 * narrowed by exact case-insensitive `locality` and filled if that
 * disambiguates, else left blank and reported `conflict_unresolved`. Never
 * overwrites a non-blank `county` (additive-only, reported
 * `already_had_value`). Every (state, legacy_name) pair a fill would need but
 * the crosswalk lacks is collected into `unmappedNames` with NO partial fill,
 * so main() can fail fast before writing anything (D-03).
 */
export function joinNaturalKey(
  csvRows: JoinCsvRow[],
  dbRows: DbRow[],
  crosswalk: Map<string, string>,
): JoinResult {
  const dbIndex = new Map<string, DbRow[]>();
  for (const dbRow of dbRows) {
    const key = coreKey(dbRow);
    const arr = dbIndex.get(key);
    if (arr) arr.push(dbRow);
    else dbIndex.set(key, [dbRow]);
  }

  const filled: JoinCsvRow[] = [];
  const reportRows: JoinReportRow[] = [];
  const unmappedNames = new Set<string>();

  for (const row of csvRows) {
    if (row.county !== '') {
      filled.push(row);
      reportRows.push(reportRow(row, 'already_had_value', row.county, row.district_id, ''));
      continue;
    }

    if (row.species_id === null) {
      filled.push(row);
      reportRows.push(reportRow(row, 'species_unresolved', '', '', 'species_id could not be resolved'));
      continue;
    }

    const key = coreKey({ ...row, species_id: row.species_id });
    const candidates = dbIndex.get(key) ?? [];

    if (candidates.length === 0) {
      filled.push(row);
      reportRows.push(reportRow(row, 'no_match', '', '', 'no reference DB row matched the core key'));
      continue;
    }

    const distinctCounties = new Set(candidates.map((c) => `${c.state}|${c.county}`));
    let match: DbRow | undefined;

    if (distinctCounties.size === 1) {
      match = candidates[0];
    } else {
      const narrowed = candidates.filter(
        (c) => c.locality.toLowerCase() === row.locality.toLowerCase(),
      );
      const narrowedCounties = new Set(narrowed.map((c) => `${c.state}|${c.county}`));
      if (narrowed.length > 0 && narrowedCounties.size === 1) {
        match = narrowed[0];
      }
    }

    if (!match) {
      filled.push(row);
      reportRows.push(
        reportRow(row, 'conflict_unresolved', '', '', 'multiple conflicting DB matches; locality tie-break did not disambiguate'),
      );
      continue;
    }

    const crosswalkKey = `${match.state}|${match.county}`;
    const stableId = crosswalk.get(crosswalkKey);
    if (!stableId) {
      unmappedNames.add(crosswalkKey);
      filled.push(row);
      continue;
    }

    const filledRow: JoinCsvRow = { ...row, county: match.county, district_id: stableId };
    filled.push(filledRow);
    reportRows.push(reportRow(filledRow, 'filled', match.county, stableId, ''));
  }

  return { filled, reportRows, unmappedNames };
}

// ---------------------------------------------------------------------------
// CLI entry-point — wires Docker extraction, crosswalk, and write-back
// ---------------------------------------------------------------------------

/** Decode mysql --batch escaping (\t \n \\ within tab-separated fields). */
function unescapeBatch(s: string): string {
  return s.replace(/\\(.)/g, (_m, c) =>
    c === 't' ? '\t' : c === 'n' ? '\n' : c === '0' ? '\0' : c);
}

/** Run a fixed literal SQL string against the container; array-args
 * execFileSync (no shell) — no CSV/DB field value is ever interpolated into
 * `sql` at any call site (T-44-03). */
function queryContainer(sql: string): Record<string, string>[] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'pnwmoths-mysql', 'mysql', '-upnwmoths', '-ppnwmoths', 'pnwmoths', '--batch'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const lines = out.replace(/\n$/, '').split('\n');
  const header = (lines[0] ?? '').split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t').map(unescapeBatch);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

const SPECIES_SQL = 'SELECT id, genus, species FROM species_species';

/** Load data/district-crosswalk.csv into a "state|legacy_name" -> stable_id map. */
function loadCrosswalk(): Map<string, string> {
  const rows = parse(readFileSync(resolve(ROOT, 'data/district-crosswalk.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ state: string; legacy_name: string; stable_id: string }>;
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(`${r.state}|${r.legacy_name}`, r.stable_id);
  }
  return map;
}

export async function main(): Promise<void> {
  const speciesCsvPath = resolve(ROOT, 'data/species.csv');
  const speciesRows = parse(readFileSync(speciesCsvPath), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ id: string; genus: string; species: string }>;

  const dbSpeciesRowsParsed = queryContainer(SPECIES_SQL);

  const dbSpeciesById = new Map<string, DbSpeciesRow>();
  const dbIdsByNormalizedBinomial = new Map<string, string[]>();
  for (const r of dbSpeciesRowsParsed) {
    dbSpeciesById.set(r.id ?? '', { genus: r.genus ?? '', species: r.species ?? '' });
    const key = `${normalizeBinomial(r.genus ?? '')}|${normalizeBinomial(r.species ?? '')}`;
    const arr = dbIdsByNormalizedBinomial.get(key);
    if (arr) arr.push(r.id ?? '');
    else dbIdsByNormalizedBinomial.set(key, [r.id ?? '']);
  }

  const slugToSpeciesId = new Map<string, string | null>();
  for (const r of speciesRows) {
    const slug = `${r.genus}-${r.species}`.toLowerCase().replace(/\s+/g, '-');
    slugToSpeciesId.set(slug, resolveDbSpeciesId(r, dbSpeciesById, dbIdsByNormalizedBinomial));
  }

  const recordsCsvPath = resolve(ROOT, 'data/records.csv');
  const existingRows = parse(readFileSync(recordsCsvPath), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<Record<string, string>>;

  const csvRows: JoinCsvRow[] = existingRows.map((r) => ({
    species_slug: r.species_slug ?? '',
    species_id: slugToSpeciesId.get(r.species_slug ?? '') ?? null,
    record_type: r.record_type ?? '',
    latitude: r.latitude ?? '',
    longitude: r.longitude ?? '',
    state: r.state ?? '',
    county: r.county ?? '',
    locality: r.locality ?? '',
    elevation_ft: r.elevation_ft ?? '',
    year: r.year ?? '',
    month: r.month ?? '',
    day: r.day ?? '',
    collector: r.collector ?? '',
    collection: r.collection ?? '',
    notes: r.notes ?? '',
    district_id: r.district_id ?? '',
  }));

  const dbRawRows = queryContainer(SQL);
  const dbRows: DbRow[] = dbRawRows.map((r) => ({
    species_id: r.species_id ?? '',
    latitude: r.latitude ?? '',
    longitude: r.longitude ?? '',
    year: r.year ?? '',
    month: r.month ?? '',
    day: r.day ?? '',
    collector: r.collector ?? '',
    collection: r.collection ?? '',
    record_type: r.record_type ?? '',
    locality: r.locality ?? '',
    county: r.county ?? '',
    state: r.state ?? '',
  }));

  const crosswalk = loadCrosswalk();

  const beforeFilled = csvRows.filter((r) => r.county !== '').length;
  const { filled, reportRows, unmappedNames } = joinNaturalKey(csvRows, dbRows, crosswalk);

  if (unmappedNames.size > 0) {
    console.error('[backfill-county] FAIL-FAST: unmapped (state, legacy_name) pairs found in crosswalk:');
    for (const name of Array.from(unmappedNames).sort()) {
      console.error(`  ${name}`);
    }
    console.error('[backfill-county] Add these to data/district-crosswalk.csv and re-run. No changes written.');
    process.exit(1);
  }

  writeFileSync(recordsCsvPath, stringify(filled, { header: true, columns: RECORDS_COLUMNS }), 'utf8');
  writeFileSync(
    resolve(ROOT, 'data/legacy-rejoin-report.csv'),
    stringify(reportRows, { header: true, columns: REPORT_COLUMNS }),
    'utf8',
  );

  const afterFilled = filled.filter((r) => r.county !== '').length;
  const matched = reportRows.filter((r) => r.outcome === 'filled').length;
  const alreadyHad = reportRows.filter((r) => r.outcome === 'already_had_value').length;
  const leftBlank = reportRows.filter(
    (r) => r.outcome === 'no_match' || r.outcome === 'conflict_unresolved' || r.outcome === 'species_unresolved',
  ).length;

  console.log(`[backfill-county] matched & filled:      ${matched}`);
  console.log(`[backfill-county] already had a value:   ${alreadyHad}`);
  console.log(`[backfill-county] left blank (no match):  ${leftBlank}`);
  console.log(
    `[backfill-county] fill rate: ${beforeFilled}/${csvRows.length} (${((beforeFilled / csvRows.length) * 100).toFixed(2)}%) -> ${afterFilled}/${filled.length} (${((afterFilled / filled.length) * 100).toFixed(2)}%)`,
  );
  console.log('[backfill-county] wrote data/records.csv and data/legacy-rejoin-report.csv');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
