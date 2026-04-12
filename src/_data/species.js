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
        'authority': 'VARCHAR',
        'family': 'VARCHAR',
        'similar_species': 'VARCHAR'
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
      family,
      CASE WHEN similar_species IS NULL OR similar_species = ''
           THEN []
           ELSE string_split(similar_species, '|')
      END AS similar_slugs,
      lower(genus || '-' || species) AS slug
    FROM species
    ORDER BY genus, species
  `);

  conn.closeSync();

  const rows = result.getRowObjectsJS();
  for (const row of rows) {
    row.id = String(row.id);
  }
  return rows;
}
