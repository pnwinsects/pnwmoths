/**
 * scripts/extract-taxon-order.ts
 *
 * Issue #218 (checklist page): extract the *checklist order* of the higher taxa
 * — family, subfamily, tribe, genus — from the legacy reference MySQL database
 * and materialize it into data/taxon-order.csv.
 *
 * Why this can't be derived from data/species.csv:
 *
 *   Checklist order is phylogenetic sequence, not alphabetical. Professional
 *   users expect Drepanidae before Noctuidae and *Habrosyne* before
 *   *Ceranemota*. Nothing in species.csv encodes it: `noc_id` is unusable as a
 *   sort key (26 blanks, three incompatible formats — bare integers,
 *   `93-XXXX` MONA supplements, and `MONA 7731` — plus 10 collisions), and it
 *   says nothing about the order of families, subfamilies, or tribes.
 *
 * Where the order does live: the original site was a django-cms install whose
 * page tree under /browse/ *is* the curated checklist sequence, preserved as an
 * MPTT nested set (`cms_page.lft`). Walking that tree left-to-right yields the
 * order the legacy /browse-all/ page rendered.
 *
 *   cms_page (MPTT: lft/rght/level/parent_id, `published` flag)
 *     <- cms_title (slug, title)  -- one row per language; only 'en' exists
 *
 * Species order is recorded only where it has to be. Within a genus the legacy
 * list is alphabetical by epithet in 361 of the 391 genera — the site does that
 * for free, so recording all ~1,400 species would be mostly redundancy for a
 * curator to maintain by hand. The other 30 genuinely differ (verified against
 * the live reference site, not just the tree: *Apamea* ends
 * `… vultuosa, unanimis, zeta`, *Noctua* is `pronuba, comes`), so those — and
 * only those — are written out in full to data/species-order.csv. Anything
 * absent from that file is alphabetical.
 *
 * 17 of the 30 are in published families; the other 13 are Geometridae, which
 * the site withholds. Their order is captured anyway, for the same reason the
 * withheld higher taxa are: visibility is gated elsewhere and can change.
 *
 * Rank comes from data/species.csv, not from the tree. The CMS titles only
 * prefix families ("Family - Geometridae"); subfamilies, tribes, and genera are
 * bare names, and the tree's depth is irregular (a lineage with no tribe puts
 * its genera one level shallower). species.csv already carries an explicit
 * family/subfamily/tribe/genus for every species, and higher-rank names are
 * globally unique across this dataset (verified: no subfamily appears under two
 * families, no tribe under two subfamilies, no genus under two tribes). So this
 * script uses species.csv for *membership and rank* and the CMS tree only for
 * *sequence*, joining the two on the lowercased name (which equals the CMS
 * slug). That is why it never has to classify a tree node's rank.
 *
 * Outputs, in both of which **row order is the data**. To move a taxon, move
 * its line; to add one, insert a line. There is deliberately no ordinal column
 * — an integer rank field would mean renumbering everything downstream of any
 * insertion.
 *
 *   data/taxon-order.csv    `rank,name`         every family/subfamily/tribe/genus
 *   data/species-order.csv  `genus,species_slug` only genera that aren't alphabetical
 *
 * Unpublished legacy taxa (Geometridae and its whole subtree) keep their
 * position here. Visibility is a separate concern, already gated by
 * data/withheld-families.csv and data/unpublished-species.csv; conflating the
 * two would mean losing the order if a family is ever un-withheld.
 *
 * Site taxa with no node in the legacy tree (added since the CMS dump) are
 * reported, not guessed at — placing them is a curatorial decision. Consumers
 * fall back to alphabetical for anything absent from the file.
 *
 * The reference DB runs as a (stopped-by-default) Docker container, mysql:5.6.
 * There is no local mysql client or driver, so we query via `docker exec`.
 * Start the container first:  docker start pnwmoths-mysql
 *
 * Usage:
 *   node scripts/extract-taxon-order.ts
 *   DRY_RUN=1 node scripts/extract-taxon-order.ts   # print CSV; no write
 *
 * Env overrides (defaults match the pnwmoths-mysql container):
 *   MYSQL_CONTAINER, MYSQL_DB, MYSQL_USER, MYSQL_PASSWORD
 *
 * The output CSV is committed to the repo and read by the site at build time.
 * Re-run only when the reference data changes.
 */

import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { DuckDBInstance } from '@duckdb/node-api';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention).
// ---------------------------------------------------------------------------

const OUTPUT_PATH: string = resolve('data/taxon-order.csv');
const SPECIES_OUTPUT_PATH: string = resolve('data/species-order.csv');
const SPECIES_CSV: string = resolve('data/species.csv');
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

const CONTAINER: string = process.env['MYSQL_CONTAINER'] ?? 'pnwmoths-mysql';
const DB: string = process.env['MYSQL_DB'] ?? 'pnwmoths';
const USER: string = process.env['MYSQL_USER'] ?? 'pnwmoths';
const PASSWORD: string = process.env['MYSQL_PASSWORD'] ?? 'pnwmoths';

/**
 * Every descendant of the /browse/ page, in nested-set order.
 *
 * The root is located by slug rather than by its id (6) so the query survives a
 * re-import of the reference dump. `lft`/`rght` containment selects the whole
 * subtree in one pass — `parent_id` recursion would need MySQL 8 CTEs, and this
 * container is 5.6.
 */
const SQL: string = `
SELECT p.lft AS lft, t.slug AS slug
FROM cms_page p
JOIN cms_title t ON t.page_id = p.id AND t.language = 'en'
JOIN cms_page root ON root.id = (
  SELECT rt.page_id FROM cms_title rt
  JOIN cms_page rp ON rp.id = rt.page_id
  WHERE rt.slug = 'browse' AND rp.level = 1 LIMIT 1
)
WHERE p.tree_id = root.tree_id AND p.lft > root.lft AND p.rght < root.rght
ORDER BY p.lft
`.trim();

/** Ranks emitted, outermost first. Also the tie-break order for equal positions. */
const RANKS = ['family', 'subfamily', 'tribe', 'genus'] as const;
export type TaxonRankName = (typeof RANKS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One higher taxon in the site's own data, with the rank it holds. */
export interface SiteTaxon {
  rank: TaxonRankName;
  name: string;
}

/** An output row: a site taxon that was located in the legacy tree. */
export interface OrderedTaxon extends SiteTaxon {
  /** Nested-set left value of the matching legacy page; the sort key. */
  lft: number;
}

/** One species in data/species.csv, reduced to what ordering needs. */
export interface SiteSpecies {
  genus: string;
  slug: string;
}

/** A genus whose legacy species order is not alphabetical, and that order. */
export interface GenusSpeciesOrder {
  genus: string;
  slugs: string[];
}

// ---------------------------------------------------------------------------
// Exported helpers (exported at module level for unit tests).
// ---------------------------------------------------------------------------

/**
 * Parse mysql `--batch -N` output (tab-separated, no header) into lft/slug
 * pairs. A handful of legacy *titles* contain literal tabs, which mysql escapes
 * as `\t`; slugs never do, and this query selects no title column, so the split
 * is safe. Rows are still length-checked rather than trusted.
 */
export function parseRows(stdout: string): Array<{ lft: number; slug: string }> {
  const rows: Array<{ lft: number; slug: string }> = [];
  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    const parts = line.split('\t');
    if (parts.length !== 2) {
      throw new Error(`[extract-taxon-order] malformed row: ${JSON.stringify(line)}`);
    }
    const [lftRaw, slug] = parts as [string, string];
    const lft = Number.parseInt(lftRaw, 10);
    if (!Number.isFinite(lft) || slug === '') {
      throw new Error(`[extract-taxon-order] malformed row: ${JSON.stringify(line)}`);
    }
    rows.push({ lft, slug });
  }
  return rows;
}

/**
 * Normalize a legacy page slug to a joinable taxon key.
 *
 * Two artifacts to strip:
 *
 *  - A rank prefix. Published lineages slug their higher taxa as
 *    `family-erebidae` / `subfamily-lymantriinae` / `tribe-orgyiini` (these are
 *    the legacy URL segments, e.g.
 *    /browse/family-notodontidae/subfamily-pygaerinae/clostera/). Genus and
 *    species pages are never prefixed. The unpublished Geometridae subtree,
 *    entered later under a different convention, uses bare names at every rank
 *    — so the prefix must be optional, not assumed.
 *  - A `-copy` / `-copy2` suffix (e.g. `xanthorhoe-alticolata-copy`), left by
 *    editors duplicating a page rather than creating one. An artifact of the
 *    CMS UI, not part of the name.
 *
 * What remains contains a hyphen only for binomial (species) pages, which is
 * what lets buildPositionIndex reject them without knowing any taxonomy.
 */
export function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/^(?:family|subfamily|tribe)-/, '')
    .replace(/-copy\d*$/, '');
}

/**
 * Collapse a taxon name to its join key. Higher-taxon names are single words,
 * so this is just a lowercase — but legacy titles are whitespace-dirty (literal
 * tabs, trailing spaces), so trim defensively.
 */
export function taxonKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Index the legacy tree by taxon key, keeping the FIRST (leftmost) position for
 * a key that appears more than once. Duplicates are `-copy` pages, which sit
 * next to their original; the original comes first in nested-set order, so
 * taking the minimum `lft` picks the real page.
 *
 * Species pages are skipped: their slugs are binomial (they contain a hyphen)
 * and this file records higher taxa only.
 */
export function buildPositionIndex(rows: Array<{ lft: number; slug: string }>): Map<string, number> {
  const index = new Map<string, number>();
  for (const { lft, slug } of rows) {
    const key = normalizeSlug(slug);
    if (key.includes('-')) continue;
    const existing = index.get(key);
    if (existing === undefined || lft < existing) index.set(key, lft);
  }
  return index;
}

/**
 * Index the legacy tree's *species* pages by slug, restricted to species the
 * site actually has.
 *
 * Membership is decided by the caller's set rather than by a shape test on the
 * slug: a genus whose name contains a space slugs with a hyphen and would
 * otherwise be mistaken for a binomial. Legacy-only species (withheld, renamed,
 * or since removed) fall out for free by not being in the set.
 *
 * As in buildPositionIndex, a `-copy` duplicate collapses onto the original and
 * the leftmost position wins.
 */
export function buildSpeciesPositionIndex(
  rows: Array<{ lft: number; slug: string }>,
  known: Set<string>,
): Map<string, number> {
  const index = new Map<string, number>();
  for (const { lft, slug } of rows) {
    const key = normalizeSlug(slug);
    if (!known.has(key)) continue;
    const existing = index.get(key);
    if (existing === undefined || lft < existing) index.set(key, lft);
  }
  return index;
}

/**
 * Sort located taxa into checklist order.
 *
 * `lft` alone is a total order over the legacy tree and already nests children
 * inside parents, so a plain ascending sort emits family → subfamily → tribe →
 * genus in the right places. The rank tie-break only matters for the
 * impossible-in-practice case of two taxa sharing a position.
 */
export function sortByPosition(taxa: OrderedTaxon[]): OrderedTaxon[] {
  return [...taxa].sort((a, b) =>
    a.lft !== b.lft ? a.lft - b.lft : RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank),
  );
}

/**
 * Serialize to CSV. Ranks are from a fixed vocabulary and higher-taxon names
 * are single alphabetic words, so no RFC-4180 quoting is ever needed.
 */
export function toCsv(rows: SiteTaxon[]): string {
  const lines = ['rank,name'];
  for (const r of rows) lines.push(`${r.rank},${r.name}`);
  return lines.join('\n') + '\n';
}

/**
 * Order one genus's species the way the legacy site listed them.
 *
 * Species the legacy tree doesn't know (added since the CMS dump) have no
 * position, so they sort alphabetically after everything it does know rather
 * than being dropped or silently interleaved — the same "fall back to
 * alphabetical, never guess" rule the higher-taxon file uses.
 */
export function orderGenusSpecies(slugs: string[], positions: Map<string, number>): string[] {
  return [...slugs].sort((a, b) => {
    const pa = positions.get(a) ?? Number.POSITIVE_INFINITY;
    const pb = positions.get(b) ?? Number.POSITIVE_INFINITY;
    return pa !== pb ? pa - pb : a.localeCompare(b);
  });
}

/**
 * Find the genera whose legacy order differs from plain alphabetical, and
 * return that order in full.
 *
 * Only these genera are written out: for the other ~95% the site's own
 * alphabetical sort already reproduces the legacy page, and recording them
 * would be redundancy a curator has to keep in sync. A genus is emitted whole
 * rather than as a diff so the file reads as "this is the order" instead of
 * "these are the corrections".
 *
 * **The deviation test looks only at species the legacy tree positioned.**
 * Species added since the CMS dump have no position and land at the end (see
 * orderGenusSpecies), which would otherwise flag a genus as non-alphabetical
 * purely because a new species sorts late — that is our fallback showing
 * through, not evidence about the legacy order. Judging on the positioned
 * subsequence alone keeps the two apart: 30 genera really differ, where
 * testing the whole list claimed 44.
 *
 * Within a genus every slug shares the same `genus-` prefix, so sorting slugs
 * and sorting epithets are the same operation.
 */
export function findDeviatingGenera(
  species: SiteSpecies[],
  positions: Map<string, number>,
): GenusSpeciesOrder[] {
  const byGenus = new Map<string, string[]>();
  for (const { genus, slug } of species) {
    const bucket = byGenus.get(genus);
    if (bucket) bucket.push(slug);
    else byGenus.set(genus, [slug]);
  }

  const deviating: GenusSpeciesOrder[] = [];
  for (const [genus, slugs] of byGenus) {
    const ordered = orderGenusSpecies(slugs, positions);
    const legacyOrdered = ordered.filter(slug => positions.has(slug));
    const alphabetical = [...legacyOrdered].sort((a, b) => a.localeCompare(b));
    if (legacyOrdered.some((slug, i) => slug !== alphabetical[i])) {
      deviating.push({ genus, slugs: ordered });
    }
  }
  return deviating;
}

/**
 * Serialize the species-order exceptions. Genus names are single alphabetic
 * words and slugs are alphanumerics-and-hyphens by construction, so no
 * RFC-4180 quoting is ever needed.
 */
export function toSpeciesCsv(genera: GenusSpeciesOrder[]): string {
  const lines = ['genus,species_slug'];
  for (const { genus, slugs } of genera) {
    for (const slug of slugs) lines.push(`${genus},${slug}`);
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
      `[extract-taxon-order] query against container '${CONTAINER}' failed:\n${detail}\n` +
        `Hint: ensure the reference DB is running:  docker start ${CONTAINER}`,
    );
  }
}

/**
 * Load every distinct higher taxon named in data/species.csv, tagged with its
 * rank. Blank family/subfamily/tribe cells are legitimate (a lineage with no
 * tribal subdivision, or an unclassified species) and are skipped.
 *
 * Returned in a stable rank-then-name order so the "unplaced" report below is
 * deterministic; real ordering is applied later from the legacy tree.
 */
async function loadSiteTaxa(): Promise<SiteTaxon[]> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  const result = await conn.runAndReadAll(`
    WITH src AS (SELECT * FROM read_csv('${SPECIES_CSV}', header = true, nullstr = ''))
    SELECT DISTINCT rank, name FROM (
      SELECT 'family'    AS rank, family    AS name FROM src
      UNION ALL SELECT 'subfamily', subfamily FROM src
      UNION ALL SELECT 'tribe',     tribe     FROM src
      UNION ALL SELECT 'genus',     genus     FROM src
    )
    WHERE name IS NOT NULL AND trim(name) <> ''
    ORDER BY rank, name
  `);
  conn.closeSync();

  const taxa: SiteTaxon[] = [];
  for (const row of result.getRowObjectsJS()) {
    const r = row as Record<string, unknown>;
    taxa.push({ rank: String(r['rank']) as TaxonRankName, name: String(r['name']) });
  }
  return taxa;
}

/**
 * Load every species in data/species.csv as genus + slug. The slug derivation
 * mirrors src/_data/taxon.ts exactly — it is the project's foreign key, and a
 * second definition of it here that drifted would silently mis-order.
 */
async function loadSiteSpecies(): Promise<SiteSpecies[]> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  const result = await conn.runAndReadAll(`
    SELECT genus, replace(lower(genus || '-' || species), ' ', '-') AS slug
    FROM read_csv('${SPECIES_CSV}', header = true, nullstr = '')
    WHERE genus IS NOT NULL AND species IS NOT NULL
  `);
  conn.closeSync();

  const species: SiteSpecies[] = [];
  for (const row of result.getRowObjectsJS()) {
    const r = row as Record<string, unknown>;
    species.push({ genus: String(r['genus']), slug: String(r['slug']) });
  }
  return species;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const legacyRows = parseRows(runQuery());
  const positions = buildPositionIndex(legacyRows);
  const [siteTaxa, siteSpecies] = await Promise.all([loadSiteTaxa(), loadSiteSpecies()]);

  const placed: OrderedTaxon[] = [];
  const unplaced: SiteTaxon[] = [];
  for (const taxon of siteTaxa) {
    const lft = positions.get(taxonKey(taxon.name));
    if (lft === undefined) unplaced.push(taxon);
    else placed.push({ ...taxon, lft });
  }

  const ordered = sortByPosition(placed);

  const countsByRank = (rows: SiteTaxon[]): string =>
    RANKS.map(rank => `${rank} ${rows.filter(r => r.rank === rank).length}`).join(', ');

  console.log('[extract-taxon-order] summary:');
  console.log(`  legacy browse-tree pages:  ${legacyRows.length}`);
  console.log(`  higher taxa in legacy tree: ${positions.size}`);
  console.log(`  higher taxa in species.csv: ${siteTaxa.length} (${countsByRank(siteTaxa)})`);
  console.log(`  placed:                     ${ordered.length} (${countsByRank(ordered)})`);
  console.log(`  unplaced (no legacy page):  ${unplaced.length} (${countsByRank(unplaced)})`);
  for (const t of unplaced) console.log(`    - ${t.rank} ${t.name}`);

  const knownSlugs = new Set(siteSpecies.map(s => s.slug));
  const speciesPositions = buildSpeciesPositionIndex(legacyRows, knownSlugs);
  const deviating = findDeviatingGenera(siteSpecies, speciesPositions);
  const deviatingSpecies = deviating.reduce((n, g) => n + g.slugs.length, 0);
  const appended = deviating
    .flatMap(g => g.slugs)
    .filter(slug => !speciesPositions.has(slug));

  console.log(`  species in species.csv:     ${siteSpecies.length} (${speciesPositions.size} with a legacy position)`);
  console.log(`  genera not alphabetical:    ${deviating.length} (${deviatingSpecies} species written out)`);
  if (appended.length) {
    console.log(`  ...of which appended alphabetically for want of a legacy page: ${appended.join(', ')}`);
  }

  const csv = toCsv(ordered.map(({ rank, name }) => ({ rank, name })));
  const speciesCsv = toSpeciesCsv(deviating);

  if (DRY_RUN) {
    console.log('[extract-taxon-order] DRY_RUN=1 — CSVs (not written):');
    console.log(csv);
    console.log(speciesCsv);
    return;
  }

  await Promise.all([writeFile(OUTPUT_PATH, csv), writeFile(SPECIES_OUTPUT_PATH, speciesCsv)]);
  console.log(`[extract-taxon-order] wrote ${OUTPUT_PATH} and ${SPECIES_OUTPUT_PATH}`);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — prevents main() from running on test import.
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
