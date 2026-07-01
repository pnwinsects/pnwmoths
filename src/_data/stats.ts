import { DuckDBInstance } from '@duckdb/node-api';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWithheldFamilies } from '../_lib/withheld-families.ts';
import { loadUnpublishedSpecies } from '../_lib/unpublished-species.ts';

/** Directory of per-species narrative markdown files; the basename is the slug. */
const NARRATIVE_DIR = resolve('src/content/species');

/** Slugs that have a written species account (narrative), e.g. `hemileuca-hera`. */
function loadNarrativeSlugs(): Set<string> {
  if (!existsSync(NARRATIVE_DIR)) return new Set<string>();
  return new Set(
    readdirSync(NARRATIVE_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -'.md'.length)),
  );
}

/**
 * Home-page "vanity" metrics, computed at build time from the same data the site
 * serves. All three counts respect the family-withholding gate (see
 * _lib/withheld-families.ts), so they match what visitors can actually browse —
 * withheld families (e.g. Geometridae) are excluded from every count.
 */
export interface SiteStats {
  species: number; // species with a written account (narrative)
  records: number; // specimen occurrence records
  images: number; // specimen images
}

export default async function (): Promise<SiteStats> {
  const withheld = [...loadWithheldFamilies()]; // lowercased family names
  const unpublishedArr = [...loadUnpublishedSpecies()]; // hyphenated, lowercased slugs
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  // Shown species: every species.csv row whose family is not withheld AND whose
  // normalized slug is not in the unpublished deny-list. This is the same predicate
  // species.ts applies to decide which species get pages.
  const withheldList = withheld.length
    ? withheld.map((f) => `'${f.replace(/'/g, "''")}'`).join(', ')
    : "''"; // no families withheld → match nothing
  // T-80-01: single-quote-escape each deny-list value before interpolation.
  // Empty list falls back to the empty-string literal (no slug is '', so no rows excluded).
  const unpublishedList = unpublishedArr.length
    ? unpublishedArr.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')
    : "''"; // no unpublished → match nothing
  await conn.run(`
    CREATE TABLE shown AS
    SELECT lower(genus || '-' || species) AS slug
    FROM read_csv('data/species.csv', header = true, nullstr = '',
      columns = {
        'id': 'INTEGER', 'genus': 'VARCHAR', 'species': 'VARCHAR',
        'common_name': 'VARCHAR', 'noc_id': 'VARCHAR', 'authority': 'VARCHAR',
        'family': 'VARCHAR', 'similar_species': 'VARCHAR', 'subfamily': 'VARCHAR',
        'epithet_quoted': 'VARCHAR'
      })
    WHERE (family IS NULL OR lower(trim(family)) NOT IN (${withheldList}))
      AND replace(lower(genus || '-' || species), ' ', '-') NOT IN (${unpublishedList})
  `);

  const scalar = async (sql: string): Promise<number> => {
    const reader = await conn.runAndReadAll(sql);
    const rows = reader.getRows();
    return Number(rows[0]?.[0] ?? 0);
  };

  // Species profiles = shown species that have a written narrative account.
  // (Not every shown species has prose; those without are excluded from this count.)
  const narrativeSlugs = loadNarrativeSlugs();
  const shownSlugsReader = await conn.runAndReadAll(`SELECT slug FROM shown`);
  const species = shownSlugsReader
    .getRows()
    .filter((r) => narrativeSlugs.has(String(r[0])))
    .length;
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
