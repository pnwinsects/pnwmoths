// scripts/assign-record-ids.ts
// Maintainer-run: give every data/records.csv row a stable identifier (ADR 0044, #178).
//
// A curator appends a row with the `record_id` cell blank. This script fills every
// blank with the next integer above the highest id in the file, in file order, and
// touches nothing else — an id, once written, is never changed, renumbered or reused.
// The build refuses a file with a blank or duplicated id (build-data.ts), so the
// runbook step is: append rows, run this, build.
//
// The first run adds the column itself: a file whose header lacks `record_id` gets it
// appended and every row numbered 1..N in file order. That is the backfill for the
// 94,132 rows that predate the column. Their legacy database ids were not recovered
// — the reference MySQL container is not on every maintainer's machine and the rows
// have been deduplicated, county-backfilled and clipped since the export, so a
// field-by-field join would be lossy — and an opaque sequence is enough for what the
// column is for: telling two identical-looking rows apart, and giving a row a handle.
//
// Byte-faithful outside the new column: every retained line must be the original
// line plus `,<id>` (or unchanged, when it already had one), verified before writing.
// The git diff of records.csv is the record of what was assigned.
//
// Run: npm run records:assign-ids
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { RECORDS_CSV_COLUMNS, RECORDS_CSV_PATH } from './lib/records-source.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface AssignResult {
  output: string;
  /** Rows that received an id in this run. */
  assigned: number;
  /** The first id handed out, or null when nothing was assigned. */
  firstId: number | null;
  /** The highest id in the file after the run. */
  maxId: number;
  /** True when the run added the column to a header that lacked it. */
  addedColumn: boolean;
}

/**
 * Fill every blank `record_id` in a records CSV, adding the column when absent.
 *
 * Pure: takes the file's text, returns the new text. Existing ids are validated
 * (positive integers, unique) so a corrupt file is refused rather than extended.
 *
 * @throws {Error} On a malformed or duplicated existing id, or when the rewrite would
 *   alter any byte other than appending the new column or filling a blank id.
 */
export function assignRecordIds(raw: string): AssignResult {
  const rows: Record<string, string>[] = parse(raw, { columns: true, skip_empty_lines: true });
  const [first] = rows;
  const headerColumns = first ? Object.keys(first) : raw.split('\n')[0]?.split(',') ?? [];
  const addedColumn = !headerColumns.includes('record_id');
  const columns = addedColumn ? [...headerColumns, 'record_id'] : headerColumns;
  if (columns.join(',') !== RECORDS_CSV_COLUMNS.join(',')) {
    throw new Error(
      `data/records.csv columns are not the expected ${RECORDS_CSV_COLUMNS.length} ` +
        `(${RECORDS_CSV_COLUMNS.join(', ')}); found ${headerColumns.join(', ')}. Not touching it.`,
    );
  }

  let maxId = 0;
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const id = (row['record_id'] ?? '').trim();
    if (id === '') return;
    if (!/^[1-9]\d*$/.test(id)) {
      throw new Error(`line ${i + 2}: record_id "${id}" is not a positive integer; fix it by hand before assigning`);
    }
    if (seen.has(id)) {
      throw new Error(`line ${i + 2}: record_id ${id} is used twice; an id is never shared — remove the duplicate row or blank its id`);
    }
    seen.add(id);
    maxId = Math.max(maxId, Number(id));
  });

  let assigned = 0;
  let firstId: number | null = null;
  for (const row of rows) {
    if ((row['record_id'] ?? '').trim() !== '') continue;
    maxId++;
    row['record_id'] = String(maxId);
    if (firstId === null) firstId = maxId;
    assigned++;
  }

  const output = stringify(rows, { header: true, columns });
  assertOnlyIdsChanged(raw, output, addedColumn);
  return { output, assigned, firstId, maxId, addedColumn };
}

/**
 * Every output line must be its input line, or that line with `,<digits>` appended
 * (the header gains `,record_id`). Anything else means the parse/stringify round-trip
 * re-quoted or re-terminated something, and the diff would no longer be reviewable as
 * "ids were assigned".
 */
function assertOnlyIdsChanged(raw: string, output: string, addedColumn: boolean): void {
  const before = raw.split('\n');
  const after = output.split('\n');
  if (before.length !== after.length) {
    throw new Error(
      'Refusing to rewrite records.csv: the round-trip changed the line count (CRLF line ' +
        'endings or blank lines?). Re-save as UTF-8 with LF line endings and no blank lines.',
    );
  }
  for (let i = 0; i < before.length; i++) {
    const a = before[i] ?? '';
    const b = after[i] ?? '';
    if (a === b) continue;
    const suffix = i === 0 ? ',record_id' : null;
    const ok = suffix !== null
      ? addedColumn && b === a + suffix
      : b.startsWith(a) && /^,?[1-9]\d*$/.test(b.slice(a.length)) && (addedColumn ? b[a.length] === ',' : a.endsWith(','));
    if (!ok) {
      throw new Error(
        `Refusing to rewrite records.csv: line ${i + 1} would change beyond its record_id ` +
          '(the parse/stringify round-trip is not byte-faithful for this file).',
      );
    }
  }
}

function main(): void {
  const path = resolve(ROOT, RECORDS_CSV_PATH);
  const raw = readFileSync(path, 'utf8');
  const { output, assigned, firstId, maxId, addedColumn } = assignRecordIds(raw);
  if (assigned === 0) {
    console.log(`Every row already has a record_id (highest is ${maxId}) — nothing to assign.`);
    return;
  }
  writeFileSync(path, output);
  console.log(
    (addedColumn ? 'Added the record_id column and ' : '') +
      `assigned ${assigned} record_id${assigned === 1 ? '' : 's'} (${firstId}–${maxId}) in ${RECORDS_CSV_PATH}.`,
  );
}

// Run only when invoked directly, not when imported by the test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
