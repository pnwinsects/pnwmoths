// scripts/emit-species-states.js
// Post-Vite build step: query records.csv via DuckDB, write _site/species-states.json
// Run via: npm run build:species-states
import { DuckDBInstance } from '@duckdb/node-api';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export async function main() {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE records AS
    SELECT * FROM read_csv('data/records.csv',
      header = true,
      columns = {
        'species_slug': 'VARCHAR',
        'record_type': 'VARCHAR',
        'latitude': 'DOUBLE',
        'longitude': 'DOUBLE',
        'state': 'VARCHAR',
        'county': 'VARCHAR',
        'locality': 'VARCHAR',
        'elevation_ft': 'INTEGER',
        'year': 'INTEGER',
        'month': 'INTEGER',
        'day': 'INTEGER',
        'collector': 'VARCHAR',
        'collection': 'VARCHAR',
        'notes': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT DISTINCT species_slug, state
    FROM records
    WHERE state IS NOT NULL AND state != ''
    ORDER BY species_slug, state
  `);
  const rows = result.getRowObjectsJS();

  conn.closeSync();

  const outPath = resolve('_site/species-states.json');
  mkdirSync(resolve('_site'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows));
  console.log(`Wrote ${rows.length} species-state pairs to _site/species-states.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
