import { DuckDBInstance } from '@duckdb/node-api';
import { existsSync } from 'node:fs';
import { loadWithheldFamilies } from '../_lib/withheld-families.ts';

/**
 * Home-page "vanity" metrics, computed at build time from the same data the site
 * serves. All three counts respect the family-withholding gate (see
 * _lib/withheld-families.ts), so they match what visitors can actually browse —
 * withheld families (e.g. Geometridae) are excluded from every count.
 */
export interface SiteStats {
  species: number; // species profiles (pages)
  records: number; // specimen occurrence records
  images: number; // specimen images
}

export default async function (): Promise<SiteStats> {
  const withheld = [...loadWithheldFamilies()]; // lowercased family names
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  // Shown species: every species.csv row whose family is not withheld. This is the
  // same predicate species.ts applies to decide which species get pages.
  const withheldList = withheld.length
    ? withheld.map((f) => `'${f.replace(/'/g, "''")}'`).join(', ')
    : "''"; // no families withheld → match nothing
  await conn.run(`
    CREATE TABLE shown AS
    SELECT lower(genus || '-' || species) AS slug
    FROM read_csv('data/species.csv', header = true, nullstr = '',
      columns = {
        'id': 'INTEGER', 'genus': 'VARCHAR', 'species': 'VARCHAR',
        'common_name': 'VARCHAR', 'noc_id': 'VARCHAR', 'authority': 'VARCHAR',
        'family': 'VARCHAR', 'similar_species': 'VARCHAR', 'subfamily': 'VARCHAR'
      })
    WHERE family IS NULL OR lower(trim(family)) NOT IN (${withheldList})
  `);

  const scalar = async (sql: string): Promise<number> => {
    const reader = await conn.runAndReadAll(sql);
    const rows = reader.getRows();
    return Number(rows[0]?.[0] ?? 0);
  };

  const species = await scalar(`SELECT count(*) FROM shown`);
  const records = await scalar(`
    SELECT count(*) FROM read_csv_auto('data/records.csv', header = true)
    WHERE species_slug IN (SELECT slug FROM shown)
  `);
  const images = existsSync('data/images.csv')
    ? await scalar(`
        SELECT count(*) FROM read_csv_auto('data/images.csv', header = true)
        WHERE species_slug IN (SELECT slug FROM shown)
      `)
    : 0;

  conn.closeSync();
  return { species, records, images };
}
