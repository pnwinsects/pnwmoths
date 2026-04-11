import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv',
      header = true,
      columns = {
        'id': 'INTEGER',
        'genus': 'VARCHAR',
        'species': 'VARCHAR',
        'common_name': 'VARCHAR',
        'noc_id': 'VARCHAR',
        'authority': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT
      id,
      genus,
      species,
      common_name,
      noc_id,
      authority,
      lower(genus || '-' || species) AS slug
    FROM species
    ORDER BY genus, species
  `);

  conn.closeSync();
  return result.getRowObjectsJS();
}
