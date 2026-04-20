import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE images AS
    SELECT * FROM read_csv('data/images.csv',
      header = true,
      nullstr = '',
      columns = {
        'species_slug': 'VARCHAR',
        'filename': 'VARCHAR',
        'photographer': 'VARCHAR',
        'weight': 'INTEGER',
        'license': 'VARCHAR',
        'view': 'VARCHAR',
        'specimen': 'VARCHAR',
        'navigational': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT species_slug, filename, photographer, weight, license, view, specimen, navigational
    FROM images
    ORDER BY species_slug, weight
  `);

  conn.closeSync();

  const rows = result.getRowObjectsJS();
  const bySpecies = {};
  for (const row of rows) {
    const slug = row.species_slug;
    if (!bySpecies[slug]) bySpecies[slug] = [];
    bySpecies[slug].push(row);
  }
  return bySpecies;
}
