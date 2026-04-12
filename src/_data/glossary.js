import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE glossary AS
    SELECT * FROM read_csv('data/glossary.csv',
      header = true,
      columns = {
        'term': 'VARCHAR',
        'definition': 'VARCHAR',
        'image_filename': 'VARCHAR',
        'photographer': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT
      term,
      definition,
      image_filename,
      photographer,
      upper(left(term, 1)) AS letter,
      lower(replace(term, ' ', '-')) AS slug
    FROM glossary
    WHERE definition IS NOT NULL AND definition != ''
    ORDER BY term ASC
  `);

  conn.closeSync();

  // Group terms by first letter for template iteration.
  // Returns { A: [...], F: [...] } instead of flat array.
  // This avoids Nunjucks array mutation issues (research assumption A2).
  const rows = result.getRowObjectsJS();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.letter]) grouped[row.letter] = [];
    grouped[row.letter].push(row);
  }
  return grouped;
}
