import { DuckDBInstance } from '@duckdb/node-api';
import type { GlossaryWord } from '../types/index.ts';

// GlossaryWord from src/types/schemas.ts has: term, definition, image_filename, photographer
// Extended with letter and slug derived by the query
interface GlossaryEntry extends GlossaryWord {
  letter: string;
  slug: string;
}

function isGlossaryEntry(obj: unknown): obj is GlossaryEntry {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r['term'] === 'string' &&
    typeof r['definition'] === 'string' &&
    typeof r['letter'] === 'string' &&
    typeof r['slug'] === 'string'
  );
}

export default async function (): Promise<Record<string, GlossaryEntry[]>> {
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
  db.closeSync();

  // Group terms by first letter for template iteration.
  // Returns { A: [...], F: [...] } instead of flat array.
  // This avoids Nunjucks array mutation issues (research assumption A2).
  const rows = result.getRowObjectsJS();
  const grouped: Record<string, GlossaryEntry[]> = {};
  for (const row of rows) {
    if (!isGlossaryEntry(row)) continue;
    if (!grouped[row.letter]) grouped[row.letter] = [];
    grouped[row.letter]!.push(row);
  }
  return grouped;
}
