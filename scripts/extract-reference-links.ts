/**
 * scripts/extract-reference-links.ts
 *
 * Issue #35 (Restore links to other sites): extract per-species BugGuide, Moth
 * Photographers Group (MPG), and Butterflies and Moths of North America (BAMONA)
 * links from the legacy reference MySQL database and materialize them into
 * data/species-links.csv.
 *
 * These three are the only reference sites with broad, still-live per-species
 * coverage. The legacy DB also holds a long tail of one-off links to mostly
 * defunct hosts (nearctica.com, silkmoths.bizland.com, cbif.gc.ca, …); those are
 * intentionally not extracted. See issue #35 for the rationale.
 *
 * The links are NOT structured columns in the reference DB. They are django-cms
 * LinkPlugin rows (cmsplugin_link) embedded in each species factsheet page,
 * joined to the species by the factsheet page's slug:
 *
 *   species_species (genus+species -> slug)
 *     -> cms_title.slug
 *     -> cms_page_placeholders -> cms_cmsplugin (LinkPlugin)
 *     -> cmsplugin_link.url
 *
 * Output: data/species-links.csv with columns `species_slug,site,url` — one row
 * per distinct link, sorted, deduplicated, and filtered to species present in
 * data/species.csv. `site` is 'bugguide' or 'mpg'. A species may legitimately
 * have more than one link per site (e.g. cochisea-sinuaria has two BugGuide
 * nodes), so this is a long-format file, not one column per site.
 *
 * The reference DB runs as a (stopped-by-default) Docker container, mysql:5.6.
 * There is no local mysql client or driver, so we query via `docker exec`.
 * Start the container first:  docker start pnwmoths-mysql
 *
 * Usage:
 *   node scripts/extract-reference-links.ts
 *   DRY_RUN=1 node scripts/extract-reference-links.ts   # print CSV; no write
 *
 * Env overrides (defaults match the pnwmoths-mysql container):
 *   MYSQL_CONTAINER, MYSQL_DB, MYSQL_USER, MYSQL_PASSWORD
 *
 * The output CSV is committed to the repo (like data/species-photos.json) and
 * read by the site at build time. Re-run only when the reference data changes.
 */

import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { DuckDBInstance } from '@duckdb/node-api';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention).
// ---------------------------------------------------------------------------

const OUTPUT_PATH: string = resolve('data/species-links.csv');
const SPECIES_CSV: string = resolve('data/species.csv');
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

const CONTAINER: string = process.env['MYSQL_CONTAINER'] ?? 'pnwmoths-mysql';
const DB: string = process.env['MYSQL_DB'] ?? 'pnwmoths';
const USER: string = process.env['MYSQL_USER'] ?? 'pnwmoths';
const PASSWORD: string = process.env['MYSQL_PASSWORD'] ?? 'pnwmoths';

// One row per distinct (slug, site, url). DISTINCT collapses the duplicate
// LinkPlugin rows some pages carry (e.g. glena-nigricaria repeats one BugGuide
// node three times) while preserving genuinely different links for a site.
const SQL: string = `
SELECT DISTINCT
  s.slug AS species_slug,
  CASE
    WHEN l.url LIKE '%bugguide%'                THEN 'bugguide'
    WHEN l.url LIKE '%butterfliesandmoths.org%' THEN 'bamona'
    ELSE 'mpg'
  END AS site,
  l.url AS url
FROM (
  SELECT LOWER(CONCAT(genus, '-', species)) AS slug FROM species_species
) s
JOIN cms_title t              ON t.slug = s.slug
JOIN cms_page_placeholders pp ON pp.page_id = t.page_id
JOIN cms_cmsplugin cp         ON cp.placeholder_id = pp.placeholder_id
JOIN cmsplugin_link l         ON l.cmsplugin_ptr_id = cp.id
WHERE l.url LIKE '%bugguide%'
   OR l.url LIKE '%mothphotographers%'
   OR l.url LIKE '%butterfliesandmoths.org%'
ORDER BY species_slug, site, url
`.trim();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkSite = 'bugguide' | 'mpg' | 'bamona';

export interface SpeciesLink {
  species_slug: string;
  site: LinkSite;
  url: string;
}

// ---------------------------------------------------------------------------
// Exported helpers (exported at module level for unit tests).
// ---------------------------------------------------------------------------

/**
 * Parse mysql `--batch -N` output (tab-separated, no header) into SpeciesLink
 * rows. URLs contain no tabs or newlines, so a plain split is safe; mysql's
 * --batch would escape any that did appear as \t / \n.
 */
export function parseTsv(stdout: string): SpeciesLink[] {
  const links: SpeciesLink[] = [];
  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    const [species_slug, site, url] = line.split('\t');
    if (!species_slug || !site || !url) {
      throw new Error(`[extract-reference-links] malformed row: ${JSON.stringify(line)}`);
    }
    if (site !== 'bugguide' && site !== 'mpg' && site !== 'bamona') {
      throw new Error(`[extract-reference-links] unexpected site '${site}' in row: ${line}`);
    }
    links.push({ species_slug, site, url });
  }
  return links;
}

/**
 * Serialize links to CSV. Fields are RFC-4180 quoted only when they contain a
 * comma, quote, or newline (slugs and sites never do; URLs effectively never do).
 */
export function toCsv(rows: SpeciesLink[]): string {
  const esc = (v: string): string =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = ['species_slug,site,url'];
  for (const r of rows) {
    lines.push([r.species_slug, r.site, r.url].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

/**
 * Run the extraction query against the reference MySQL container via
 * `docker exec`. Password is passed through MYSQL_PWD (via `docker exec -e`)
 * rather than -p so it never appears in argv and mysql emits no insecure-password
 * warning. Re-throws with a start-the-container hint on the common failure modes.
 */
function runQuery(): string {
  try {
    return execFileSync(
      'docker',
      [
        'exec',
        '-e', `MYSQL_PWD=${PASSWORD}`,
        CONTAINER,
        'mysql', `-u${USER}`, DB,
        '-N', '--batch',
        '-e', SQL,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    const detail = (e.stderr ?? e.message).trim();
    throw new Error(
      `[extract-reference-links] query against container '${CONTAINER}' failed:\n${detail}\n` +
        `Hint: ensure the reference DB is running:  docker start ${CONTAINER}`,
    );
  }
}

/**
 * Load the set of slugs present in data/species.csv, using the same derivation
 * as src/_data/species.ts (lower(genus || '-' || species)). DuckDB handles the
 * CSV's quoted fields correctly.
 */
async function loadCodebaseSlugs(): Promise<Set<string>> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  const result = await conn.runAndReadAll(
    `SELECT lower(genus || '-' || species) AS slug
       FROM read_csv('${SPECIES_CSV}', header = true, nullstr = '')`,
  );
  conn.closeSync();
  const slugs = new Set<string>();
  for (const row of result.getRowObjectsJS()) {
    slugs.add(String((row as Record<string, unknown>)['slug']));
  }
  return slugs;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const allLinks = parseTsv(runQuery());
  const codebaseSlugs = await loadCodebaseSlugs();

  // Keep only links for species that exist in this codebase. Links for legacy
  // reference species not carried over are dropped (and reported).
  const kept = allLinks.filter(l => codebaseSlugs.has(l.species_slug));
  const dropped = allLinks.length - kept.length;

  const bugguide = kept.filter(l => l.site === 'bugguide').length;
  const mpg = kept.filter(l => l.site === 'mpg').length;
  const bamona = kept.filter(l => l.site === 'bamona').length;
  const speciesWithLinks = new Set(kept.map(l => l.species_slug)).size;

  console.log('[extract-reference-links] summary:');
  console.log(`  links in reference DB:    ${allLinks.length}`);
  console.log(`  dropped (species not in codebase): ${dropped}`);
  console.log(`  kept:                     ${kept.length}  (bugguide ${bugguide}, mpg ${mpg}, bamona ${bamona})`);
  console.log(`  species with >=1 link:    ${speciesWithLinks} / ${codebaseSlugs.size}`);

  const csv = toCsv(kept);

  if (DRY_RUN) {
    console.log('[extract-reference-links] DRY_RUN=1 — CSV (not written):');
    console.log(csv);
    return;
  }

  await writeFile(OUTPUT_PATH, csv);
  console.log(`[extract-reference-links] wrote ${OUTPUT_PATH}`);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — prevents main() from running on test import.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
