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
// The two files have DIFFERENT WIDTHS — records-inat.csv carries a 16th
// `inat_id` column — so a DuckDB file-list read with an explicit `columns=`
// spec cannot read both. Every union below therefore selects the 15 canonical
// columns explicitly from each file in turn.
//
// Before this module, the 15-column DuckDB spec was copy-pasted verbatim into
// build-data.ts, emit-species-states.ts, emit-species-districts.ts and
// emit-species-audit.ts. It is defined once here.
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

/** data/records.csv column order. Load-bearing: the CSV has no other schema. */
export const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection',
  'notes', 'district_id',
] as const;

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
};

/**
 * The coordinate box an occurrence record may occupy.
 *
 * This is the PUBLISHING rule, and it is deliberately stricter than
 * scripts/lib/district-assignment.ts's PNW_BOUNDS (lat 41-61, lon -140..-103),
 * which is sized to the committed boundary geometry so that full-Montana
 * polygons can be matched. A coordinate can therefore be assignable to a
 * district and still not be publishable.
 *
 * Defined here because build-data.ts hard-fails the build on any record
 * outside it — so anything that GENERATES records has to apply the same rule
 * up front, or it produces a file that cannot be built. scripts/lib/inat.ts is
 * the first such generator.
 */
export const RECORD_COORDINATE_BOUNDS = {
  latMin: 42.0,
  latMax: 60.0,
  lonMin: -139.0,
  lonMax: -110.0,
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

/**
 * SQL selecting every occurrence record the site serves, in the 15 canonical
 * columns, as the UNION ALL of the curator file and (when non-empty) the
 * iNaturalist file.
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
): string {
  // Checked HERE, at the seam, rather than at each call site. Five build steps
  // read the combined corpus; a guarantee that depends on all five remembering
  // to assert first is not a guarantee, and the one that matters most
  // (src/_data/stats.ts) runs inside Eleventy where an omission would be
  // easiest to miss. Putting it here also means it cannot be bypassed by
  // running a single build step on its own.
  assertInatRecordsPresent(inatPath);
  const cols = RECORDS_COLUMNS.join(', ');
  const curator = `SELECT ${cols} FROM ${readCsvSql(recordsPath, RECORDS_COLUMNS)}`;
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
): Promise<void> {
  await conn.run(
    `CREATE TABLE ${tableName} AS\n${buildAllRecordsSql(recordsPath, inatPath)}`,
  );
}

/** Parse a CSV file into string-valued rows, or [] when it does not exist. */
function parseCsvRows<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true }) as T[];
}

/** Every data/records.csv row, in file order. */
export function readCuratorRecordRows(path: string = RECORDS_CSV_PATH): RecordRow[] {
  return parseCsvRows<RecordRow>(path);
}

/** Every data/records-inat.csv row, in file order ([] when absent/header-only). */
export function readInatRecordRows(path: string = RECORDS_INAT_CSV_PATH): InatRecordRow[] {
  return parseCsvRows<InatRecordRow>(path);
}

/**
 * Every occurrence record the site serves, curator rows first, as plain parsed
 * rows. The non-DuckDB counterpart to {@link createAllRecordsTable}, for
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
  return [...readCuratorRecordRows(recordsPath), ...readInatRecordRows(inatPath)];
}
