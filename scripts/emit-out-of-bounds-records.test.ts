import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { OUT_OF_BOUNDS_COLUMNS, outOfBoundsRows, toCsv } from './emit-out-of-bounds-records.ts';
import {
  RECORDS_INAT_COLUMNS,
  buildAllRecordsSql,
  readCuratorRecordRows,
  type CuratorRecordRow,
} from './lib/records-source.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function row(record_id: string, latitude: string, longitude: string): CuratorRecordRow {
  return {
    species_slug: 'apamea-devastator', record_type: 'specimen', latitude, longitude,
    state: 'MT', county: '', locality: '', elevation_ft: '', year: '', month: '', day: '',
    collector: '', collection: '', notes: '', district_id: '', record_id,
  };
}

describe('outOfBoundsRows', () => {
  it('lists only out-of-bounds rows, in file order, with their record_id', () => {
    const rows = outOfBoundsRows([
      row('1', '46.5', '-112'),
      row('2', '46.73', '-109.75'),
      row('3', '41.947', '-120.419'),
      row('4', '', '-109.75'),
    ]);
    assert.deepEqual(rows.map((r) => [r.record_id, r.beyond]), [['2', 'east'], ['3', 'south']]);
  });

  it('writes the header even when nothing is held, so the /curation/ link never 404s or misleads', () => {
    assert.equal(toCsv([]), `${OUT_OF_BOUNDS_COLUMNS.join(',')}\n`);
  });
});

describe('real data', () => {
  const curator = readCuratorRecordRows(resolve(ROOT, 'data/records.csv'));
  const report = outOfBoundsRows(curator);

  it('every held record has a record_id — a ruling can name it', () => {
    assert.ok(report.every((r) => /^[1-9]\d*$/.test(r.record_id)));
  });

  it('the report and what the site serves split records.csv exactly', async () => {
    // The served union is SQL; the report is TypeScript. If the two predicates
    // drift, a record is either published and listed as held, or in neither.
    const { DuckDBInstance } = await import('@duckdb/node-api');
    const db = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();
    // A header-only iNaturalist file, so the union is the curator side alone.
    const dir = mkdtempSync(join(tmpdir(), 'pnwm-oob-'));
    const noInat = join(dir, 'records-inat.csv');
    writeFileSync(noInat, `${RECORDS_INAT_COLUMNS.join(',')}\n`);
    const reader = await conn.runAndReadAll(
      `SELECT count(*) FROM (${buildAllRecordsSql(resolve(ROOT, 'data/records.csv'), noInat)})`,
    );
    conn.closeSync();
    rmSync(dir, { recursive: true, force: true });
    const servedCurator = Number(reader.getRows()[0]?.[0]);
    assert.equal(servedCurator + report.length, curator.length);
  });

  it('round-trips through CSV without losing a row — notes can span lines', () => {
    const back = parse(toCsv(report), { columns: true }) as unknown[];
    assert.equal(back.length, report.length);
  });
});
