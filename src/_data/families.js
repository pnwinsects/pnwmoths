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

  // For browse/index.njk: distinct genera with family, sorted
  const generaResult = await conn.runAndReadAll(`
    SELECT DISTINCT family, genus,
      lower(replace(genus, ' ', '-')) AS genus_slug
    FROM species
    ORDER BY family, genus
  `);

  // For browse/{genus-slug}/: each genus with its species list
  const speciesResult = await conn.runAndReadAll(`
    SELECT family, genus, species, common_name,
      lower(genus || '-' || species) AS slug,
      lower(replace(genus, ' ', '-')) AS genus_slug
    FROM species
    ORDER BY genus, species
  `);

  conn.closeSync();

  const genera = generaResult.getRowObjectsJS();
  const allSpecies = speciesResult.getRowObjectsJS();

  // Group species by genus_slug for per-genus listing pages
  const byGenus = {};
  for (const sp of allSpecies) {
    if (!byGenus[sp.genus_slug]) {
      byGenus[sp.genus_slug] = { genus: sp.genus, family: sp.family, genus_slug: sp.genus_slug, species: [] };
    }
    byGenus[sp.genus_slug].species.push(sp);
  }

  // Convert to array for Eleventy pagination
  const genusArray = Object.values(byGenus);

  return { genera, genusArray };
}
