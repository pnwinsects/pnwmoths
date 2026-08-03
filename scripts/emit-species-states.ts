// scripts/emit-species-states.ts
// Post-Vite build step: query every occurrence record via DuckDB, write
// _site/species-states.json
// Run via: npm run build:species-states
import { DuckDBInstance } from '@duckdb/node-api';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAllRecordsTable } from './lib/records-source.ts';

export async function main(): Promise<void> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await createAllRecordsTable(conn);

  const result = await conn.runAndReadAll(`
    SELECT DISTINCT species_slug, state
    FROM records
    WHERE state IS NOT NULL AND state != ''
    ORDER BY species_slug, state
  `);
  const rows = result.getRowObjectsJS() as Record<string, unknown>[];

  conn.closeSync();

  const outPath = resolve('_site/species-states.json');
  mkdirSync(resolve('_site'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows));
  console.log(`Wrote ${rows.length} species-state pairs to _site/species-states.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
