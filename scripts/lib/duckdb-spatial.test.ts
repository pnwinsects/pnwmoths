import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { loadSpatial } from './duckdb-spatial.ts';

/** A connection that records its SQL and fails LOAD until INSTALL has run. */
function fakeConnection(installed: boolean) {
  const sql: string[] = [];
  return {
    sql,
    async run(statement: string) {
      sql.push(statement);
      if (statement.startsWith('INSTALL')) installed = true;
      if (statement.startsWith('LOAD') && !installed) throw new Error('Extension "spatial" not found');
      return undefined;
    },
  };
}

test('loadSpatial loads an installed extension without installing it again', async () => {
  // Reinstalling is what DuckDB 2.0 refuses when the copy came from another repository.
  const conn = fakeConnection(true);
  await loadSpatial(conn);
  assert.deepEqual(conn.sql, ['LOAD spatial;']);
});

test('loadSpatial installs from the default repository when the extension is missing', async () => {
  // Not from an https:// address: on an empty cache that needs httpfs, which DuckDB
  // cannot fetch over https without httpfs.
  const conn = fakeConnection(false);
  await loadSpatial(conn);
  assert.deepEqual(conn.sql, ['LOAD spatial;', 'INSTALL spatial;', 'LOAD spatial;']);
});

test('loadSpatial gives a real connection the spatial functions', async () => {
  const conn = await (await DuckDBInstance.create(':memory:')).connect();
  try {
    await loadSpatial(conn);
    const reader = await conn.runAndReadAll('SELECT ST_AsText(ST_Point(1, 2)) AS p');
    assert.deepEqual(reader.getRowObjectsJS(), [{ p: 'POINT (1 2)' }]);
  } finally {
    conn.closeSync();
  }
});
