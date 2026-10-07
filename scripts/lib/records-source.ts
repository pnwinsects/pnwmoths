// scripts/lib/records-source.ts
// The single definition of "every occurrence record the site serves" (#23).
//
// Occurrence records live in TWO files with different owners:
//
//   data/records.csv       CURATOR-OWNED. Hand-edited by maintainers, mutated
//                          only by deliberate, one-shot maintainer scripts
//                          (backfill-legacy-county, fill-district-from-coords,
//                          dedup-records, recover-clipped-bc-records). Never
//                          written by anything that talks to a network.
//   data/records-inat.csv  MACHINE-OWNED. Rewritten wholesale from the
//                          iNaturalist project by scripts/sync-inat-records.ts.
//                          A row exists here only for as long as its
//                          observation is in the project at research grade.
//
// The split exists because reconciliation is DESTRUCTIVE: an observation
// removed from the project must disappear from the site (issue #23). A script
// that deletes rows because a remote server changed must not be pointed at the
// curator's file — every existing records.csv writer is additive-only
// (CLAUDE.md) and one-shot (ADR 0025). Rewriting a file nobody hand-edits is a
// categorically safer operation than reaching into one people do.
//
// The two files have DIFFERENT 16th COLUMNS — records.csv carries `record_id`
// (ADR 0044) and records-inat.csv carries `inat_id` — so a DuckDB file-list
// read with an explicit `columns=` spec cannot read both. Every union below
// therefore reads each file with its own spec and selects the 15 canonical
// columns from each in turn. Neither identifier reaches the browser.
//
// Before this module, the 15-column DuckDB spec was copy-pasted verbatim into
// build-data.ts, emit-species-states.ts, emit-species-districts.ts and
// emit-species-audit.ts. It is defined once here.
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

/**
 * The 15 canonical occurrence columns every record the site serves has, in
 * order. Load-bearing: the CSVs have no other schema.
 */
export const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection',
  'notes', 'district_id',
] as const;

/**
 * data/records.csv column order — the 15 canonical columns plus the record's
 * stable identifier (ADR 0044, #178).
 *
 * `record_id` is an opaque positive integer, assigned once by
 * scripts/assign-record-ids.ts and never reused or renumbered. It is source
 * data, not a derived column: a curator appends a row with the cell blank, the
 * script fills it, and from then on it IS the record's identity across edits,
 * re-uploads and references. Last column, so the leading 15 line up with
 * records-inat.csv when a human reads the two side by side.
 */
export const RECORDS_CSV_COLUMNS = [...RECORDS_COLUMNS, 'record_id'] as const;

/**
 * data/records-inat.csv column order — the 15 canonical columns plus the
 * iNaturalist observation id.
 *
 * `inat_id` is the reconciliation key and is deliberately the LAST column, so
 * the leading 15 line up with records.csv when a human reads the two side by
 * side. It never reaches the browser: the Parquet export selects only the
 * canonical 15 (see buildAllRecordsSql), and the observation URL travels to the
 * UI in `notes`, which pnwm-occurrence-popup.ts already renders as a link.
 */
export const RECORDS_INAT_COLUMNS = [...RECORDS_COLUMNS, 'inat_id'] as const;

export const RECORDS_CSV_PATH = 'data/records.csv';
export const RECORDS_INAT_CSV_PATH = 'data/records-inat.csv';

/**
 * DuckDB types for the canonical columns.
 *
 * Read WITHOUT `nullstr=''` (blank cells become NULL) — matching the long-
 * standing behaviour build-data.ts documents. Do not add nullstr here without
 * re-reading that comment; county/district_id nullability is depended upon
 * downstream.
 */
const RECORDS_COLUMN_TYPES: Record<string, string> = {
  species_slug: 'VARCHAR',
  record_type: 'VARCHAR',
  latitude: 'DOUBLE',
  longitude: 'DOUBLE',
  state: 'VARCHAR',
  county: 'VARCHAR',
  locality: 'VARCHAR',
  elevation_ft: 'INTEGER',
  year: 'INTEGER',
  month: 'INTEGER',
  day: 'INTEGER',
  collector: 'VARCHAR',
  collection: 'VARCHAR',
  notes: 'VARCHAR',
  district_id: 'VARCHAR',
  inat_id: 'BIGINT',
  record_id: 'INTEGER',
};

/**
 * Why data/records.csv cannot be built, or [] when every row carries a usable
 * `record_id`. Checked by build-data.ts before the DuckDB import.
 *
 * Three faults, each named with the first offending row so the message points
 * at a line: a blank cell (a row was appended without running
 * `npm run records:assign-ids`), a value that is not a positive integer (a hand
 * edit), and a value used twice (a copy-paste of an existing row that kept its
 * id — the exact thing the column exists to make impossible).
 */
export function recordIdProblems(rows: readonly { record_id?: string }[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  let blank = 0;
  let firstBlank = -1;
  for (const [i, row] of rows.entries()) {
    const id = (row.record_id ?? '').trim();
    const line = i + 2; // 1-based, after the header
    if (id === '') {
      blank++;
      if (firstBlank < 0) firstBlank = line;
      continue;
    }
    if (!/^[1-9]\d*$/.test(id)) {
      problems.push(`line ${line}: record_id "${id}" is not a positive integer`);
      continue;
    }
    const earlier = seen.get(id);
    if (earlier !== undefined) problems.push(`line ${line}: record_id ${id} is already used on line ${earlier}`);
    else seen.set(id, line);
  }
  if (blank > 0) {
    problems.unshift(
      `${blank} row(s) have a blank record_id (first at line ${firstBlank}). ` +
        'Run `npm run records:assign-ids` to assign them, then build again.',
    );
  }
  return problems;
}

/**
 * The coordinate box an occurrence record may occupy.
 *
 * This is the PUBLISHING rule, and it is deliberately stricter than
 * scripts/lib/district-assignment.ts's PNW_BOUNDS (lat 41-61, lon -140..-103),
 * which is sized to the committed boundary geometry so that full-Montana
 * polygons can be matched. A coordinate can therefore be assignable to a
 * district and still not be publishable.
 *
 * What happens to a record outside it depends on whose file it is in
 * (ADR 0047):
 *
 *   - data/records.csv keeps it, provided it is plausibly from the region —
 *     inside the wider district-assignment box (PNW_BOUNDS). Outside that box
 *     the coordinate is a typo (swapped axes, a missing minus sign) and
 *     build-data.ts fails on it. Inside it, the row is an OUT-OF-BOUNDS RECORD:
 *     it has a record_id and is validated like any other row, but the served union
 *     ({@link buildAllRecordsSql}) leaves it out, so it reaches no map, Parquet
 *     file or count. scripts/emit-out-of-bounds-records.ts lists every one on
 *     /curation/ on every build. Widening these bounds publishes them; nothing
 *     else has to change.
 *   - data/records-inat.csv must never hold one. The sync applies this rule up
 *     front (scripts/lib/inat.ts) and reports what it skipped, so an
 *     out-of-bounds iNaturalist row is a generator bug, and build-data.ts still
 *     fails the build on it.
 */
export const RECORD_COORDINATE_BOUNDS = {
  // The curator's rulings on #367 (C-037): a degree of latitude past the region
  // to the south and north, because species known from just over the border
  // (northern California, the far north) are worth carrying ...
  latMin: 41.0,
  latMax: 61.0,
  lonMin: -139.0,
  // ... and all of Montana, not just the part west of 110° W. Montana's eastern
  // border is 104.04° W; a record in that last 0.04° is held and listed on
  // /curation/ rather than lost.
  lonMax: -104.0,
};

/** True iff a coordinate is inside {@link RECORD_COORDINATE_BOUNDS}. */
export function isWithinRecordBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= RECORD_COORDINATE_BOUNDS.latMin &&
    latitude <= RECORD_COORDINATE_BOUNDS.latMax &&
    longitude >= RECORD_COORDINATE_BOUNDS.lonMin &&
    longitude <= RECORD_COORDINATE_BOUNDS.lonMax
  );
}

/**
 * True iff a data/records.csv row is an out-of-bounds record: both coordinates
 * present and numeric, and the point outside {@link RECORD_COORDINATE_BOUNDS}.
 *
 * A row with a blank or unparseable coordinate is NOT out of bounds — it is
 * invalid, and build-data.ts fails on it. Treating it as merely held would let
 * a typo vanish from the site with a green build. {@link outOfBoundsSql} is the
 * same predicate in SQL; records-source.test.ts holds the two to each other.
 */
export function isOutOfBoundsRecord(row: { latitude: string; longitude: string }): boolean {
  if (row.latitude.trim() === '' || row.longitude.trim() === '') return false;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return !isWithinRecordBounds(latitude, longitude);
}

/**
 * {@link isOutOfBoundsRecord} as a DuckDB predicate over DOUBLE `latitude` and
 * `longitude` columns. NULL coordinates make it false, not NULL, so that
 * `WHERE NOT (…)` keeps a NULL-coordinate row in the served union, where
 * build-data.ts's NULL check can see it and fail.
 */
export function outOfBoundsSql(): string {
  const b = RECORD_COORDINATE_BOUNDS;
  return (
    `(latitude IS NOT NULL AND longitude IS NOT NULL AND NOT (` +
    `latitude BETWEEN ${b.latMin} AND ${b.latMax} AND longitude BETWEEN ${b.lonMin} AND ${b.lonMax}))`
  );
}

/** Which way(s) an out-of-bounds coordinate lies beyond the bounds, e.g. "east" or "south". */
export function beyondBounds(latitude: number, longitude: number): string {
  const b = RECORD_COORDINATE_BOUNDS;
  const ways: string[] = [];
  if (latitude < b.latMin) ways.push('south');
  if (latitude > b.latMax) ways.push('north');
  if (longitude < b.lonMin) ways.push('west');
  if (longitude > b.lonMax) ways.push('east');
  return ways.join(' and ');
}

/** One occurrence row in the 15-column shape — every value a string. */
export interface RecordRow {
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

/** One data/records.csv row — {@link RecordRow} plus its stable identifier. */
export interface CuratorRecordRow extends RecordRow {
  record_id: string;
}

/** One data/records-inat.csv row — {@link RecordRow} plus the observation id. */
export interface InatRecordRow extends RecordRow {
  inat_id: string;
}

/** A DuckDB `columns = {...}` struct literal for the given column names. */
function columnsSpec(columns: readonly string[]): string {
  const entries = columns.map((c) => `'${c}': '${RECORDS_COLUMN_TYPES[c]}'`);
  return `{ ${entries.join(', ')} }`;
}

/** A `read_csv(...)` call with an explicit, fully-typed column spec. */
export function readCsvSql(path: string, columns: readonly string[]): string {
  // Every caller passes a module constant today, but the function is exported
  // and parameterised, and DuckDB cannot parameterise a file path — so the
  // quote character that would break out of the literal is rejected outright
  // rather than escaped.
  if (path.includes("'")) {
    throw new Error(`Refusing to build SQL for a path containing a quote: ${path}`);
  }
  return `read_csv('${path}', header = true, columns = ${columnsSpec(columns)})`;
}

/**
 * True when data/records-inat.csv exists AND has at least one data row.
 *
 * A header-only file is treated as absent throughout this module: it is the
 * legitimate state of the repo between "the sync script and its runbook were
 * committed" and "the first sync ran", and also the state after a sync that
 * legitimately found nothing. Excluding it from the union keeps that state from
 * being a special case anywhere else — in particular build-data.ts's
 * validateCsv(), which throws on a CSV with zero data rows.
 */
export function hasInatRecords(path: string = RECORDS_INAT_CSV_PATH): boolean {
  if (!existsSync(path)) return false;
  return readInatRecordRows(path).length > 0;
}

/**
 * Assert the iNaturalist file has not gone missing.
 *
 * Called by {@link buildAllRecordsSql}, so every combined-records reader is
 * covered without having to remember.
 *
 * `hasInatRecords` deliberately treats absent and header-only alike, because
 * both mean "no imported rows to union". For a BUILD that is a dangerous
 * conflation: the file is committed, so absence means a bad merge, a stray
 * `rm` or a .gitignore mistake — and the union would quietly drop every
 * imported record from the maps, the state and district aggregates, the
 * species audit and the home-page count, with a green build and no diff in the
 * output. Every other data file in this pipeline hard-fails when missing; this
 * one must too. A header-only file stays silent — that is a legitimate state.
 */
export function assertInatRecordsPresent(path: string = RECORDS_INAT_CSV_PATH): void {
  if (existsSync(path)) return;
  throw new Error(
    `${path} is missing. It is a committed file, so this means it was deleted or lost in a ` +
      'merge — building without it would silently drop every imported iNaturalist record from ' +
      'the site. Restore it (git checkout -- ' + path + ') or, if the import is genuinely ' +
      'being retired, replace it with a header-only file.',
  );
}

/** Options for {@link buildAllRecordsSql} and {@link createAllRecordsTable}. */
export interface AllRecordsOptions {
  /**
   * Keep data/records.csv's out-of-bounds records instead of leaving them out.
   * Only build-data.ts's validation wants this: a held row must still name a
   * real species and a real state, or it would be unpublishable for a second
   * reason nobody can see.
   */
  includeOutOfBounds?: boolean;
}

/**
 * SQL selecting every occurrence record the site serves, in the 15 canonical
 * columns, as the UNION ALL of the curator file and (when non-empty) the
 * iNaturalist file.
 *
 * "Serves" excludes the curator file's out-of-bounds records (ADR 0047). The
 * filter applies to the curator side only: the iNaturalist side is passed
 * through unfiltered so that build-data.ts's bounds check still catches an
 * out-of-bounds row there, which is a sync bug rather than a held record.
 *
 * UNION ALL, never UNION: the two files are disjoint by construction (the sync
 * refuses to emit an observation already cited in records.csv — see
 * scripts/lib/inat.ts), and plain UNION would silently collapse genuinely
 * distinct records that happen to agree on all 15 columns. 14,217 of the
 * curator file's rows already share a non-unique natural key; deduplicating
 * here would quietly delete real records.
 */
export function buildAllRecordsSql(
  recordsPath: string = RECORDS_CSV_PATH,
  inatPath: string = RECORDS_INAT_CSV_PATH,
  options: AllRecordsOptions = {},
): string {
  // Checked HERE, at the seam, rather than at each call site. Five build steps
  // read the combined corpus; a guarantee that depends on all five remembering
  // to assert first is not a guarantee, and the one that matters most
  // (src/_data/stats.ts) runs inside Eleventy where an omission would be
  // easiest to miss. Putting it here also means it cannot be bypassed by
  // running a single build step on its own.
  assertInatRecordsPresent(inatPath);
  const cols = RECORDS_COLUMNS.join(', ');
  const held = options.includeOutOfBounds ? '' : ` WHERE NOT ${outOfBoundsSql()}`;
  const curator = `SELECT ${cols} FROM ${readCsvSql(recordsPath, RECORDS_CSV_COLUMNS)}${held}`;
  if (!hasInatRecords(inatPath)) return curator;
  const inat = `SELECT ${cols} FROM ${readCsvSql(inatPath, RECORDS_INAT_COLUMNS)}`;
  return `${curator}\nUNION ALL\n${inat}`;
}

/** Minimal structural type for the DuckDB connection methods used here. */
interface RunnableConnection {
  run(sql: string): Promise<unknown>;
}

/**
 * Create `tableName` holding every occurrence record the site serves.
 *
 * This is the seam every build step that feeds the site must go through, so
 * that adding a records source is a one-file change: build-data.ts,
 * emit-species-states.ts, emit-species-districts.ts, emit-species-audit.ts and
 * src/_data/stats.ts all call it.
 *
 * The maintainer curation scripts deliberately do NOT: they mutate
 * data/records.csv and must see exactly that file. Likewise
 * derive-district-audit.ts and emit-records-district-audit.ts, whose artifact
 * is keyed by row index into the curator file and whose QC question ("does the
 * curator's stated county agree with the coordinates?") is meaningless for iNat
 * rows, whose county is derived from those same coordinates.
 */
export async function createAllRecordsTable(
  conn: RunnableConnection,
  tableName: string = 'records',
  recordsPath: string = RECORDS_CSV_PATH,
  inatPath: string = RECORDS_INAT_CSV_PATH,
  options: AllRecordsOptions = {},
): Promise<void> {
  await conn.run(
    `CREATE TABLE ${tableName} AS\n${buildAllRecordsSql(recordsPath, inatPath, options)}`,
  );
}

/** Parse a CSV file into string-valued rows, or [] when it does not exist. */
function parseCsvRows<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true }) as T[];
}

/** Every data/records.csv row, in file order. */
export function readCuratorRecordRows(path: string = RECORDS_CSV_PATH): CuratorRecordRow[] {
  return parseCsvRows<CuratorRecordRow>(path);
}

/** Every data/records-inat.csv row, in file order ([] when absent/header-only). */
export function readInatRecordRows(path: string = RECORDS_INAT_CSV_PATH): InatRecordRow[] {
  return parseCsvRows<InatRecordRow>(path);
}

/**
 * Every occurrence record the site serves, curator rows first, as plain parsed
 * rows — the curator file's out-of-bounds records left out, as in
 * {@link buildAllRecordsSql}. The non-DuckDB counterpart to {@link createAllRecordsTable}, for
 * callers already using csv-parse.
 */
export function readAllRecordRows(
  recordsPath: string = RECORDS_CSV_PATH,
  inatPath: string = RECORDS_INAT_CSV_PATH,
): RecordRow[] {
  // Fails closed on the same terms as buildAllRecordsSql. Both answer "every
  // record the site serves"; one of them silently answering "all but the
  // imported ones" would be the worse kind of inconsistency, since the two are
  // used interchangeably to cross-check each other.
  assertInatRecordsPresent(inatPath);
  const served = readCuratorRecordRows(recordsPath).filter((row) => !isOutOfBoundsRecord(row));
  return [...served, ...readInatRecordRows(inatPath)];
}
