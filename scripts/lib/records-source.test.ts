import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RECORDS_COLUMNS,
  RECORDS_CSV_COLUMNS,
  RECORDS_INAT_COLUMNS,
  assertInatRecordsPresent,
  buildAllRecordsSql,
  createAllRecordsTable,
  hasInatRecords,
  beyondBounds,
  isOutOfBoundsRecord,
  isWithinRecordBounds,
  outOfBoundsSql,
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

describe('buildAllRecordsSql — fail closed on a missing file', () => {
  it('throws rather than quietly returning the curator file alone', () => {
    // The regression this guards: every combined-records reader goes through
    // here, so a deleted records-inat.csv would otherwise drop every imported
    // record from the maps, the state and district aggregates, the species
    // audit and the home-page count — with a green build and no diff.
    assert.throws(
      () => buildAllRecordsSql(recordsPath, join(dir, 'absent.csv')),
      /is missing/,
    );
  });

  it('covers every reader, so no call site has to remember', async () => {
    // createAllRecordsTable delegates to buildAllRecordsSql, so the four
    // DuckDB-based readers inherit the check; readAllRecordRows asserts
    // directly. (Awaited — an unawaited assert.rejects passes vacuously.)
    const conn = { run: async (): Promise<undefined> => undefined };
    await assert.rejects(
      () => createAllRecordsTable(conn, 'records', recordsPath, join(dir, 'absent.csv')),
      /is missing/,
    );
    assert.throws(
      () => readAllRecordRows(recordsPath, join(dir, 'absent.csv')),
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

  it('reads an absent file as empty at the low level, but the combined reader refuses', () => {
    // readInatRecordRows is the raw parser and stays tolerant — migrate and the
    // sync both need to read a file that may legitimately not exist yet. Only
    // the COMBINED view, which claims to be every record the site serves, is
    // entitled to refuse.
    assert.deepEqual(readInatRecordRows(join(dir, 'absent.csv')), []);
    assert.throws(() => readAllRecordRows(recordsPath, join(dir, 'absent.csv')), /is missing/);
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

// ---------------------------------------------------------------------------
// Out-of-bounds records (ADR 0047): kept in records.csv, left out of the union
// ---------------------------------------------------------------------------

// These tests execute the SQL, so the fixture needs the real 16-column header.
const CURATOR_HEADER = RECORDS_CSV_COLUMNS.join(',');
let nextId = 1;

/** A records.csv row at the given coordinates (blank string = blank cell). */
function curatorRowAt(latitude: string, longitude: string, slug = 'lophocampa-roseata'): string {
  return `${slug},specimen,${latitude},${longitude},MT,Carbon,Red Lodge,,1988,7,26,Crabo,WSU,,,${nextId++}`;
}

// The edges are inclusive, and a blank coordinate is invalid, not held.
const PREDICATE_CASES: { latitude: string; longitude: string; outOfBounds: boolean; why: string }[] = [
  { latitude: '47.6', longitude: '-122.3', outOfBounds: false, why: 'inside' },
  { latitude: '42', longitude: '-110', outOfBounds: false, why: 'south-east corner, inclusive' },
  { latitude: '60', longitude: '-139', outOfBounds: false, why: 'north-west corner, inclusive' },
  { latitude: '46.73', longitude: '-109.75', outOfBounds: true, why: 'east of 110° W (Greycliff, MT)' },
  { latitude: '41.947', longitude: '-120.419', outOfBounds: true, why: 'south of 42° N (Goose L.)' },
  { latitude: '60.1', longitude: '-122.3', outOfBounds: true, why: 'north' },
  { latitude: '47.6', longitude: '-139.1', outOfBounds: true, why: 'west' },
  { latitude: '', longitude: '-109.75', outOfBounds: false, why: 'blank latitude is invalid, not held' },
  { latitude: '46.73', longitude: '', outOfBounds: false, why: 'blank longitude is invalid, not held' },
];

describe('isOutOfBoundsRecord and outOfBoundsSql', () => {
  for (const c of PREDICATE_CASES) {
    it(`TypeScript: ${c.why}`, () => {
      assert.equal(isOutOfBoundsRecord({ latitude: c.latitude, longitude: c.longitude }), c.outOfBounds);
    });
  }

  it('agree on every case — the served union and the report must partition the file', async () => {
    const { DuckDBInstance } = await import('@duckdb/node-api');
    const db = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();
    const values = PREDICATE_CASES.map(
      (c, i) => `(${i}, ${c.latitude === '' ? 'NULL' : c.latitude}::DOUBLE, ${c.longitude === '' ? 'NULL' : c.longitude}::DOUBLE)`,
    ).join(', ');
    const reader = await conn.runAndReadAll(
      `SELECT i, ${outOfBoundsSql()} AS held FROM (VALUES ${values}) t(i, latitude, longitude) ORDER BY i`,
    );
    const sqlHeld = reader.getRows().map((r) => r[1]);
    conn.closeSync();
    // false, never NULL: `WHERE NOT NULL` would drop a blank-coordinate row
    // from the served union, and build-data.ts's NULL check would never see it.
    assert.deepEqual(sqlHeld, PREDICATE_CASES.map((c) => c.outOfBounds));
  });
});

describe('beyondBounds', () => {
  it('names the edge a point lies past', () => {
    assert.equal(beyondBounds(46.73, -109.75), 'east');
    assert.equal(beyondBounds(41.013, -121.601), 'south');
    assert.equal(beyondBounds(41.5, -105), 'south and east');
    assert.equal(beyondBounds(61, -140), 'north and west');
  });
});

describe('buildAllRecordsSql — out-of-bounds records', () => {
  const count = async (sql: string): Promise<number> => {
    const { DuckDBInstance } = await import('@duckdb/node-api');
    const db = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();
    const reader = await conn.runAndReadAll(`SELECT count(*) FROM (${sql})`);
    conn.closeSync();
    return Number(reader.getRows()[0]?.[0]);
  };

  it('leaves the curator file\'s out-of-bounds rows out of what the site serves', async () => {
    const path = join(dir, 'records-held.csv');
    writeFileSync(path, `${CURATOR_HEADER}\n${curatorRowAt('46.5', '-112')}\n${curatorRowAt('46.73', '-109.75')}\n`);
    writeFileSync(inatPath, `${INAT_HEADER}\n`);
    assert.equal(await count(buildAllRecordsSql(path, inatPath)), 1);
    assert.equal(await count(buildAllRecordsSql(path, inatPath, { includeOutOfBounds: true })), 2);
  });

  it('keeps a blank-coordinate curator row, so the build\'s NULL check can fail on it', async () => {
    const path = join(dir, 'records-blank.csv');
    writeFileSync(path, `${CURATOR_HEADER}\n${curatorRowAt('', '-109.75')}\n`);
    writeFileSync(inatPath, `${INAT_HEADER}\n`);
    assert.equal(await count(buildAllRecordsSql(path, inatPath)), 1);
  });

  it('does not filter the iNaturalist side — an out-of-bounds row there is a sync bug the build must see', async () => {
    const path = join(dir, 'records-inbounds.csv');
    writeFileSync(path, `${CURATOR_HEADER}\n${curatorRowAt('46.5', '-112')}\n`);
    const inatOut = INAT_ROW.replace('48.54,-123.01', '46.73,-109.75');
    writeFileSync(inatPath, `${INAT_HEADER}\n${inatOut}\n`);
    assert.equal(await count(buildAllRecordsSql(path, inatPath)), 2);
  });

  it('is applied by readAllRecordRows too, so the two readers still agree', () => {
    const path = join(dir, 'records-held-rows.csv');
    writeFileSync(path, `${CURATOR_HEADER}\n${curatorRowAt('46.5', '-112')}\n${curatorRowAt('46.73', '-109.75')}\n`);
    writeFileSync(inatPath, `${INAT_HEADER}\n`);
    assert.equal(readAllRecordRows(path, inatPath).length, 1);
  });
});
