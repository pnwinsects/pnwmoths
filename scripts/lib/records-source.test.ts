import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RECORDS_COLUMNS,
  RECORDS_INAT_COLUMNS,
  assertInatRecordsPresent,
  buildAllRecordsSql,
  hasInatRecords,
  isWithinRecordBounds,
  readAllRecordRows,
  readCsvSql,
  readInatRecordRows,
} from './records-source.ts';

let dir: string;
let recordsPath: string;
let inatPath: string;

const RECORDS_HEADER = RECORDS_COLUMNS.join(',');
const INAT_HEADER = RECORDS_INAT_COLUMNS.join(',');

const CURATOR_ROW =
  'lophocampa-roseata,photograph,46.18,-123.82,OR,Clatsop,Astoria,230,2016,8,2,M. Patterson,,,US:41007';
const INAT_ROW =
  'lophocampa-roseata,photograph,48.54,-123.01,WA,San Juan,Friday Harbor,,2017,7,28,Jane Doe,iNaturalist,' +
  'https://www.inaturalist.org/observations/7296336,US:53055,7296336';

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'pnwm-records-source-'));
  recordsPath = join(dir, 'records.csv');
  inatPath = join(dir, 'records-inat.csv');
  writeFileSync(recordsPath, `${RECORDS_HEADER}\n${CURATOR_ROW}\n`);
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe('hasInatRecords', () => {
  it('is false when the file does not exist', () => {
    assert.equal(hasInatRecords(join(dir, 'nope.csv')), false);
  });

  it('is false for a header-only file', () => {
    // The legitimate state of the repo between committing the sync script and
    // running it for the first time.
    writeFileSync(inatPath, `${INAT_HEADER}\n`);
    assert.equal(hasInatRecords(inatPath), false);
  });

  it('is true once there is a data row', () => {
    writeFileSync(inatPath, `${INAT_HEADER}\n${INAT_ROW}\n`);
    assert.equal(hasInatRecords(inatPath), true);
  });
});

describe('assertInatRecordsPresent', () => {
  it('passes for a header-only file — a legitimate state', () => {
    writeFileSync(inatPath, `${INAT_HEADER}\n`);
    assert.doesNotThrow(() => assertInatRecordsPresent(inatPath));
  });

  it('throws when the committed file has gone missing', () => {
    // Without this the union quietly drops every imported record from the
    // maps, the aggregates and the home-page count, and the build stays green.
    assert.throws(
      () => assertInatRecordsPresent(join(dir, 'absent.csv')),
      /is missing/,
    );
  });
});

describe('readCsvSql', () => {
  it('refuses a path that would break out of the SQL string literal', () => {
    assert.throws(() => readCsvSql("data/it's.csv", RECORDS_COLUMNS), /quote/);
  });
});

describe('buildAllRecordsSql', () => {
  it('reads the curator file alone when there is no iNaturalist data', () => {
    writeFileSync(inatPath, `${INAT_HEADER}\n`);
    const sql = buildAllRecordsSql(recordsPath, inatPath);
    assert.ok(!sql.includes('UNION ALL'));
    assert.ok(sql.includes(recordsPath));
  });

  it('unions both files once the import has rows', () => {
    writeFileSync(inatPath, `${INAT_HEADER}\n${INAT_ROW}\n`);
    const sql = buildAllRecordsSql(recordsPath, inatPath);
    assert.ok(sql.includes('UNION ALL'));
    assert.ok(sql.includes(inatPath));
  });

  it('selects only the 15 canonical columns, never inat_id', () => {
    writeFileSync(inatPath, `${INAT_HEADER}\n${INAT_ROW}\n`);
    const sql = buildAllRecordsSql(recordsPath, inatPath);
    // inat_id must appear in the read_csv column spec (or the file cannot be
    // parsed) but never in a projected column list — otherwise the two union
    // branches differ in width and the Parquet schema gains a column.
    const selectLists = sql
      .split('\n')
      .filter((l) => l.startsWith('SELECT '))
      .map((l) => l.slice('SELECT '.length, l.indexOf(' FROM ')));
    assert.equal(selectLists.length, 2);
    for (const list of selectLists) {
      assert.deepEqual(list.split(', '), [...RECORDS_COLUMNS]);
    }
  });

  it('uses UNION ALL, never UNION', () => {
    // Plain UNION would collapse genuinely distinct records that happen to
    // agree on all 15 columns; thousands of curator rows share a natural key.
    writeFileSync(inatPath, `${INAT_HEADER}\n${INAT_ROW}\n`);
    const sql = buildAllRecordsSql(recordsPath, inatPath);
    assert.ok(!/\bUNION\b(?!\s+ALL)/.test(sql));
  });
});

describe('readAllRecordRows', () => {
  it('concatenates curator rows and iNaturalist rows', () => {
    writeFileSync(inatPath, `${INAT_HEADER}\n${INAT_ROW}\n`);
    const rows = readAllRecordRows(recordsPath, inatPath);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.collection, '');
    assert.equal(rows[1]?.collection, 'iNaturalist');
  });

  it('returns only curator rows when the import is empty', () => {
    writeFileSync(inatPath, `${INAT_HEADER}\n`);
    assert.equal(readAllRecordRows(recordsPath, inatPath).length, 1);
  });

  it('tolerates a missing import file entirely', () => {
    assert.deepEqual(readInatRecordRows(join(dir, 'absent.csv')), []);
    assert.equal(readAllRecordRows(recordsPath, join(dir, 'absent.csv')).length, 1);
  });
});

describe('isWithinRecordBounds', () => {
  it('accepts a Pacific Northwest coordinate', () => {
    assert.equal(isWithinRecordBounds(47.6, -122.3), true);
  });

  it('rejects the corners build-data.ts rejects', () => {
    assert.equal(isWithinRecordBounds(41.9, -122.3), false);
    assert.equal(isWithinRecordBounds(60.1, -122.3), false);
    assert.equal(isWithinRecordBounds(47.6, -139.1), false);
    assert.equal(isWithinRecordBounds(47.6, -109.9), false);
  });

  it('is stricter than the district-assignment bounds', () => {
    // lon -105 is inside PNW_BOUNDS (which is sized to the boundary geometry)
    // but outside the publishing rule. Anything generating records must apply
    // this narrower gate or it writes a file that fails the build.
    assert.equal(isWithinRecordBounds(45.0, -105.0), false);
  });
});
