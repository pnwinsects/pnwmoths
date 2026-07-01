import { DuckDBInstance } from '@duckdb/node-api';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../_lib/withheld-families.ts';
import { loadUnpublishedSpecies, isUnpublished } from '../_lib/unpublished-species.ts';

// Local interface covering the post-query DuckDB shape (id as number)
interface SpeciesDbRow {
  id: number;
  genus: string;
  species: string;
  common_name: string | null;
  noc_id: string | null;
  authority: string | null;
  family: string | null;
  subfamily: string | null;
  similar_slugs: string[];
  slug: string;
}

function isSpeciesDbRow(obj: unknown): obj is SpeciesDbRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r['id'] === 'number' &&
    typeof r['genus'] === 'string' &&
    typeof r['species'] === 'string' &&
    Array.isArray(r['similar_slugs']) &&
    typeof r['slug'] === 'string'
  );
}

// Emitted return type: id has been mutated to string post-query
export interface SpeciesRow extends Omit<SpeciesDbRow, 'id'> {
  id: string;
}

export default async function (): Promise<SpeciesRow[]> {
  const withheld = loadWithheldFamilies();
  const unpublished = loadUnpublishedSpecies();
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

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
        'subfamily': 'VARCHAR'
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
      subfamily,
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
  const result_rows: SpeciesRow[] = [];
  for (const row of rows) {
    if (!isSpeciesDbRow(row)) continue;
    if (isWithheldOrUnclassified(row.family, withheld)) continue;
    if (isUnpublished(row.slug, unpublished)) continue;
    result_rows.push({
      id: String(row.id),
      genus: row.genus,
      species: row.species,
      common_name: row.common_name,
      noc_id: row.noc_id,
      authority: row.authority,
      family: row.family,
      subfamily: row.subfamily,
      similar_slugs: row.similar_slugs,
      slug: row.slug,
    });
  }
  return result_rows;
}
