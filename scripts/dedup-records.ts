// scripts/dedup-records.ts
// Maintainer-run duplicate-record purge (GitHub issue #173).
//
// Batch CSV uploads have historically inserted the same occurrence record more
// than once (e.g. Euxoa aurantiaca in the legacy database). The old database
// distinguished such rows only by an upload date/time; records.csv carries no
// upload-timestamp column, so duplicate occurrences are otherwise identical and
// which copy is "most recent" is moot — they are the same record.
//
// Two rows are the same occurrence when they agree on every CURATOR-ENTERED
// column. district_id is excluded from that comparison: it is a derived
// write-back column (assigned from coordinates by fill-district-from-coords.ts),
// not source data, so a pair that differs only in district_id is still a
// duplicate. When such a pair is collapsed the copy that already carries a
// district_id is retained, so the derived value is never lost.
//
// Rows that differ in any curator-entered field — including a blank vs. filled
// locality — are NOT duplicates and are left untouched. The purge is idempotent:
// a second run finds nothing to remove.
//
// Output is byte-faithful to the input except for the removed lines (parse ->
// stringify with pinned columns is a verified round-trip; see the test), so the
// git diff shows only deletions. There is no separate report file: the diff of
// data/records.csv is the record of what was purged, reversible via git.
//
// Run: node scripts/dedup-records.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS_PATH = resolve(ROOT, 'data/records.csv');

// Derived write-back columns — populated by the build pipeline from other
// fields, never entered by a curator, so they carry no record identity and are
// excluded from the duplicate comparison.
export const DERIVED_COLUMNS = ['district_id'];

export type RecordRow = Record<string, string>;

/**
 * Two collapsed duplicates carried DIFFERENT non-empty values in a derived
 * column. Derived columns are assigned deterministically from other fields, so
 * identical records should derive the same value; a divergence means the
 * artifact is stale or the deriving logic changed. Reported as an advisory (the
 * first value is kept) rather than failing the purge — see the additive/
 * idempotent, advisory-not-fatal data invariant in CLAUDE.md.
 */
export interface DerivedConflict {
  column: string;
  kept: string;
  discarded: string;
  /** The shared identity key (JSON array of curator-entered column values). */
  identity: string;
}

export interface DedupeResult {
  /** Rows retained, in original order (first occurrence of each record). */
  kept: RecordRow[];
  /** Number of rows removed as duplicates of an earlier record. */
  removedCount: number;
  /** Number of distinct records that had at least one duplicate. */
  duplicateGroups: number;
  /** Derived-value disagreements between collapsed duplicates (advisory). */
  conflicts: DerivedConflict[];
}

/**
 * Remove rows that duplicate an earlier row across every curator-entered column
 * (all columns except {@link DERIVED_COLUMNS}), keeping the first occurrence.
 * When a collapsed duplicate carries a district_id the first occurrence lacks,
 * the derived value is copied onto the retained row so it is not lost. Order of
 * retained rows is preserved.
 *
 * @param rows - Parsed records.
 * @param columns - Column names in order (the CSV header).
 */
export function dedupeRecords(rows: RecordRow[], columns: string[]): DedupeResult {
  const identityColumns = columns.filter((c) => !DERIVED_COLUMNS.includes(c));
  const keyOf = (r: RecordRow) => JSON.stringify(identityColumns.map((c) => r[c]));

  const positionByKey = new Map<string, number>();
  const duplicated = new Set<string>();
  const kept: RecordRow[] = [];
  const conflicts: DerivedConflict[] = [];
  let removedCount = 0;

  for (const row of rows) {
    const key = keyOf(row);
    const seenAt = positionByKey.get(key);
    if (seenAt === undefined) {
      positionByKey.set(key, kept.length);
      kept.push(row);
      continue;
    }
    removedCount++;
    duplicated.add(key);
    const retained = kept[seenAt];
    if (retained) {
      for (const c of DERIVED_COLUMNS) {
        const have = retained[c];
        const incoming = row[c];
        if (!have && incoming) {
          retained[c] = incoming; // fill a derived value the first occurrence lacked
        } else if (have && incoming && have !== incoming) {
          conflicts.push({ column: c, kept: have, discarded: incoming, identity: key });
        }
      }
    }
  }

  return { kept, removedCount, duplicateGroups: duplicated.size, conflicts };
}

/**
 * True when `rewritten` is `original` with zero or more whole physical lines
 * deleted and nothing else changed — i.e. every line of `rewritten` occurs in
 * `original`, in order. A re-serialisation that normalises line endings (CRLF ->
 * LF), re-quotes a field, or drops a blank line breaks this, because the
 * affected lines no longer match byte-for-byte.
 */
function isLineDeletionOnly(original: string, rewritten: string): boolean {
  const from = original.split('\n');
  let i = 0;
  for (const line of rewritten.split('\n')) {
    while (i < from.length && from[i] !== line) i++;
    if (i === from.length) return false;
    i++;
  }
  return true;
}

/**
 * Parse a records CSV, remove duplicate records, and re-serialise.
 *
 * The parse -> stringify round-trip is byte-faithful for records.csv (LF line
 * endings, RFC-4180 quoting, no blank lines), so the output is the input with
 * only the duplicate lines removed. That guarantee is not universal, so it is
 * enforced: if the round-trip would alter any retained bytes (e.g. a CRLF or
 * blank-line input), this throws rather than silently rewriting the file.
 *
 * @throws {Error} If deletion-only, byte-faithful output cannot be guaranteed.
 */
export function dedupeCsv(raw: string): { output: string; result: DedupeResult } {
  const rows: RecordRow[] = parse(raw, { columns: true, skip_empty_lines: true });
  const [first] = rows;
  const columns = first ? Object.keys(first) : [];
  const result = dedupeRecords(rows, columns);
  const output = stringify(result.kept, { header: true, columns });
  if (!isLineDeletionOnly(raw, output)) {
    throw new Error(
      'Refusing to rewrite records.csv: the parse/stringify round-trip is not ' +
        'byte-faithful (the input may use CRLF line endings or contain blank ' +
        'lines). Re-save the file as UTF-8 with Unix (LF) line endings and no ' +
        'blank lines, then re-run.'
    );
  }
  return { output, result };
}

function main(): void {
  const raw = readFileSync(RECORDS_PATH, 'utf8');
  const { output, result } = dedupeCsv(raw);
  const { removedCount, duplicateGroups, kept, conflicts } = result;
  const total = kept.length + removedCount;

  for (const c of conflicts) {
    console.warn(
      `[advisory] conflicting ${c.column}: kept "${c.kept}", discarded "${c.discarded}" ` +
        `for record ${c.identity}. Regenerate the derived artifact to resolve.`
    );
  }

  if (removedCount === 0) {
    console.log(`No duplicate records found in ${total} rows — nothing to purge.`);
    return;
  }

  writeFileSync(RECORDS_PATH, output);
  console.log(
    `Purged ${removedCount} duplicate record${removedCount === 1 ? '' : 's'} ` +
      `across ${duplicateGroups} group${duplicateGroups === 1 ? '' : 's'}: ` +
      `${total} -> ${kept.length} rows.` +
      (conflicts.length > 0 ? ` (${conflicts.length} derived-value conflict advisory)` : '')
  );
}

// Run only when invoked directly, not when imported by the test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
