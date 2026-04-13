import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE images AS
    SELECT * FROM read_csv('data/images.csv',
      header = true,
      columns = {
        'species_id': 'INTEGER',
        'filename': 'VARCHAR',
        'photographer': 'VARCHAR',
        'weight': 'INTEGER',
        'license': 'VARCHAR',
        'view': 'VARCHAR',
        'specimen': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT species_id, filename, photographer, weight, license, view, specimen
    FROM images
    ORDER BY species_id, weight
  `);

  conn.closeSync();

  const rows = result.getRowObjectsJS();
  const bySpecies = {};
  for (const row of rows) {
    const id = String(row.species_id);
    if (!bySpecies[id]) bySpecies[id] = [];
    bySpecies[id].push(row);
  }
  return bySpecies;
}
