// scripts/assign-record-ids.test.ts
// The record_id assigner (ADR 0044, #178). What matters: ids are appended and never
// touched again, the backfill numbers a column-less file in order, and any other
// byte change is refused rather than written.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignRecordIds } from './assign-record-ids.ts';
import { RECORDS_COLUMNS, RECORDS_CSV_COLUMNS, recordIdProblems } from './lib/records-source.ts';

const OLD_HEADER = RECORDS_COLUMNS.join(',') + '\n';
const HEADER = RECORDS_CSV_COLUMNS.join(',') + '\n';
// A row with a comma-quoted field, to exercise stringify's quoting.
const ROW_A = 'euxoa-aurantiaca,specimen,42.02,-113.115,ID,Cassia,"Black Pine Mts, Formation Cyn",6312,2012,7,12,L. G. Crabo,LGCC,,US:16031';
const ROW_B = 'euxoa-aurantiaca,specimen,42.02,-113.115,ID,Cassia,"Black Pine Mts, Formation Cyn",6312,2011,7,22,L. G. Crabo,LGCC,,US:16031';

describe('assignRecordIds', () => {
  it('backfills a file without the column: header gains record_id, rows are numbered in order', () => {
    const raw = OLD_HEADER + ROW_A + '\n' + ROW_B + '\n';
    const r = assignRecordIds(raw);
    assert.equal(r.addedColumn, true);
    assert.equal(r.assigned, 2);
    assert.deepEqual([r.firstId, r.maxId], [1, 2]);
    assert.equal(r.output, HEADER + ROW_A + ',1\n' + ROW_B + ',2\n');
  });

  it('fills only the blank ids, above the highest existing one, and leaves the rest byte-identical', () => {
    const raw = HEADER + ROW_A + ',7\n' + ROW_B + ',\n' + ROW_A + ',3\n' + ROW_B + ',\n';
    const r = assignRecordIds(raw);
    assert.equal(r.addedColumn, false);
    assert.equal(r.assigned, 2);
    assert.deepEqual([r.firstId, r.maxId], [8, 9]);
    assert.equal(r.output, HEADER + ROW_A + ',7\n' + ROW_B + ',8\n' + ROW_A + ',3\n' + ROW_B + ',9\n');
  });

  it('is a no-op when every row has an id', () => {
    const raw = HEADER + ROW_A + ',1\n' + ROW_B + ',2\n';
    const r = assignRecordIds(raw);
    assert.equal(r.assigned, 0);
    assert.equal(r.output, raw);
  });

  // An id is never reused: a gap left by a purged row stays a gap.
  it('never reuses an id below the maximum', () => {
    const raw = HEADER + ROW_A + ',5\n' + ROW_B + ',\n';
    assert.equal(assignRecordIds(raw).output, HEADER + ROW_A + ',5\n' + ROW_B + ',6\n');
  });

  it('refuses a duplicated or malformed existing id rather than extending a corrupt file', () => {
    assert.throws(() => assignRecordIds(HEADER + ROW_A + ',4\n' + ROW_B + ',4\n'), /used twice/);
    assert.throws(() => assignRecordIds(HEADER + ROW_A + ',x9\n'), /not a positive integer/);
    assert.throws(() => assignRecordIds(HEADER + ROW_A + ',0\n'), /not a positive integer/);
  });

  it('refuses a file whose columns are not records.csv\'s', () => {
    assert.throws(() => assignRecordIds('species_slug,notes\na,b\n'), /columns are not the expected/);
  });

  it('refuses to rewrite when the round-trip would change anything but the ids', () => {
    const crlf = (OLD_HEADER + ROW_A + '\n').replaceAll('\n', '\r\n');
    assert.throws(() => assignRecordIds(crlf), /Refusing to rewrite/);
  });
});

describe('recordIdProblems — the build gate', () => {
  const row = (record_id: string) => ({ record_id });

  it('passes a file of unique positive integers', () => {
    assert.deepEqual(recordIdProblems([row('1'), row('2'), row('10')]), []);
  });

  it('names the first blank and says what to run', () => {
    const problems = recordIdProblems([row('1'), row(''), row('  ')]);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /2 row\(s\) have a blank record_id \(first at line 3\)/);
    assert.match(problems[0]!, /records:assign-ids/);
  });

  it('reports a duplicate with both lines, and a non-integer', () => {
    const problems = recordIdProblems([row('5'), row('5'), row('05')]);
    assert.deepEqual(problems, [
      'line 3: record_id 5 is already used on line 2',
      'line 4: record_id "05" is not a positive integer',
    ]);
  });
});
