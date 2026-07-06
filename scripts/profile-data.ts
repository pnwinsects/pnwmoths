// SCHEMA-03 acceptance harness — parses every real production row against its Zod schema.
// Exits 0 with "SCHEMA-03 ACCEPTANCE PASS" if all rows accepted; exits 1 with the first
// rejection printed if any schema rejects a real row.
//
// Usage: node scripts/profile-data.ts
//
// DuckDB read options mirror production exactly:
//   records.csv  — WITHOUT nullstr='' (matches build-data.js)
//   species.csv  — WITH nullstr='' (matches build-data.js and taxon.js)
//   images.csv   — WITH nullstr='' and all-VARCHAR columns (matches taxon.js)
//   glossary.csv — WITH nullstr='' (matches build-data.js / standard read)

import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync } from 'node:fs';
import {
  OccurrenceRecordSchema,
  SpeciesSchema,
  SpeciesImageSchema,
  GlossaryWordSchema,
  SpeciesPhotoSchema,
} from '../src/types/index.ts';

async function main(): Promise<void> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  // ── records.csv — 92,554 rows — WITHOUT nullstr='' (production behavior) ──
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
        'notes': 'VARCHAR',
        'district_id': 'VARCHAR'
      }
    )
  `);

  // ── species.csv — 1,433 rows — WITH nullstr='' ──
  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv',
      header = true,
      nullstr = '',
      columns = {
        'id': 'INTEGER',
        'genus': 'VARCHAR',
        'species': 'VARCHAR',
        'common_name': 'VARCHAR',
        'noc_id': 'VARCHAR',
        'authority': 'VARCHAR',
        'family': 'VARCHAR',
        'similar_species': 'VARCHAR',
        'subfamily': 'VARCHAR',
        'epithet_quoted': 'VARCHAR'
      }
    )
  `);

  // ── images.csv — 4,035 rows — WITH nullstr='', all-VARCHAR (matches taxon.js) ──
  await conn.run(`
    CREATE TABLE images AS
    SELECT * FROM read_csv('data/images.csv',
      header = true,
      nullstr = '',
      delim = ',',
      quote = '"',
      escape = '"',
      auto_detect = false,
      columns = {
        'species_slug': 'VARCHAR',
        'filename': 'VARCHAR',
        'photographer': 'VARCHAR',
        'weight': 'VARCHAR',
        'license': 'VARCHAR',
        'view': 'VARCHAR',
        'specimen': 'VARCHAR',
        'navigational': 'VARCHAR',
        'locality': 'VARCHAR',
        'state': 'VARCHAR',
        'latitude': 'VARCHAR',
        'longitude': 'VARCHAR',
        'elevation_ft': 'VARCHAR',
        'year': 'VARCHAR',
        'month': 'VARCHAR',
        'day': 'VARCHAR',
        'collector': 'VARCHAR',
        'subspecies': 'VARCHAR'
      }
    )
  `);

  // ── glossary.csv — 149 rows — WITH nullstr='' ──
  await conn.run(`
    CREATE TABLE glossary AS
    SELECT * FROM read_csv('data/glossary.csv',
      header = true,
      nullstr = ''
    )
  `);

  let allPassed = true;

  // Helper: parse every row; return { total, rejected, firstError }
  function parseRows<T>(
    rows: T[],
    schema: { safeParse: (row: unknown) => { success: boolean; error?: unknown } },
  ): { total: number; rejected: number; firstError: unknown } {
    let rejected = 0;
    let firstError: unknown = null;
    for (const row of rows) {
      const result = schema.safeParse(row);
      if (!result.success) {
        rejected++;
        if (firstError === null) firstError = result.error;
      }
    }
    return { total: rows.length, rejected, firstError };
  }

  // ── OccurrenceRecord ──
  const recordRows = (await conn.runAndReadAll('SELECT * FROM records')).getRowObjectsJS();
  const recordStats = parseRows(recordRows, OccurrenceRecordSchema);
  console.log(
    `OccurrenceRecord: ${recordStats.total} rows, ${recordStats.rejected} rejected`,
  );
  if (recordStats.rejected > 0) {
    console.error('First OccurrenceRecord rejection:');
    console.error(recordStats.firstError);
    allPassed = false;
  }

  // ── Species ──
  // DuckDB INTEGER columns may return as BigInt in some DuckDB node API versions.
  // Coerce id to Number before parse to match z.number().int()
  const speciesRows = (await conn.runAndReadAll('SELECT * FROM species')).getRowObjectsJS() as Record<string, unknown>[];
  const speciesCoerced = speciesRows.map(row => ({
    ...row,
    id: row['id'] !== null && row['id'] !== undefined ? Number(row['id']) : row['id'],
  }));
  const speciesStats = parseRows(speciesCoerced, SpeciesSchema);
  console.log(`Species: ${speciesStats.total} rows, ${speciesStats.rejected} rejected`);
  if (speciesStats.rejected > 0) {
    console.error('First Species rejection:');
    console.error(speciesStats.firstError);
    allPassed = false;
  }

  // ── SpeciesImage ──
  const imageRows = (await conn.runAndReadAll('SELECT * FROM images')).getRowObjectsJS();
  const imageStats = parseRows(imageRows, SpeciesImageSchema);
  console.log(`SpeciesImage: ${imageStats.total} rows, ${imageStats.rejected} rejected`);
  if (imageStats.rejected > 0) {
    console.error('First SpeciesImage rejection:');
    console.error(imageStats.firstError);
    allPassed = false;
  }

  // ── GlossaryWord ──
  const glossaryRows = (await conn.runAndReadAll('SELECT * FROM glossary')).getRowObjectsJS();
  const glossaryStats = parseRows(glossaryRows, GlossaryWordSchema);
  console.log(`GlossaryWord: ${glossaryStats.total} rows, ${glossaryStats.rejected} rejected`);
  if (glossaryStats.rejected > 0) {
    console.error('First GlossaryWord rejection:');
    console.error(glossaryStats.firstError);
    allPassed = false;
  }

  // ── SpeciesPhoto — parse values of data/species-photos.json ──
  const photosJson = JSON.parse(readFileSync('data/species-photos.json', 'utf-8')) as Record<string, unknown>;
  const photoEntries = Object.values(photosJson);
  const photoStats = parseRows(photoEntries, SpeciesPhotoSchema);
  console.log(`SpeciesPhoto: ${photoStats.total} rows, ${photoStats.rejected} rejected`);
  if (photoStats.rejected > 0) {
    console.error('First SpeciesPhoto rejection:');
    console.error(photoStats.firstError);
    allPassed = false;
  }

  conn.closeSync();

  if (!allPassed) {
    process.exit(1);
  }

  console.log('SCHEMA-03 ACCEPTANCE PASS: all production rows accepted');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
