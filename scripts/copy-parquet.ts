/**
 * Copy Parquet files from data/parquet/{slug}/ to _site/species/{slug}/
 *
 * The eleventy-plugin-vite build renames _site -> .11ty-vite, runs Vite
 * into a new empty _site/, so binary passthrough-copied files don't survive.
 * This script runs after the full build to restore them.
 *
 * GATED. This used to be an unconditional recursive copy of data/parquet/, which
 * published occurrence data for every species whose page the build deliberately
 * does not emit: 126 embargoed Geometridae and 45 provisional/unpublished
 * species, 171 files in all, each reachable at /species/{slug}/records.parquet
 * while /species/{slug}/ returned 404 (#275). The page gates could not catch it —
 * they ran before this step wrote the files.
 *
 * The gate belongs here rather than in scripts/build-data.ts: data/parquet/ is a
 * build-time query cache read by the site build itself, and keeping it complete
 * is what lets a species be re-included by deleting one CSV line. What must be
 * conditional is publication, which is this copy.
 */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadWithheldFamilies } from '../src/_lib/withheld-families.ts';
import { loadUnpublishedSpecies, normalizeSlug } from '../src/_lib/unpublished-species.ts';

// ---------------------------------------------------------------------------
// Exported pure helper — unit-testable without a build
// ---------------------------------------------------------------------------

export interface SelectPublishableOptions {
  /** Slugs with a directory under data/parquet/ (raw directory basenames). */
  availableSlugs: string[];
  /** Normalized slugs belonging to a withheld family. */
  withheldSlugs: ReadonlySet<string>;
  /** Normalized slugs on the unpublished deny-list. */
  unpublishedSlugs: ReadonlySet<string>;
  /**
   * Normalized slugs of every row in data/species.csv. Omit to skip the check.
   *
   * data/parquet/ is a build cache that is written but never pruned, so a local
   * working copy accumulates directories for species that have since been renamed
   * or deleted — 8 of them here, against 1,424 species rows. CI never sees them
   * (fresh checkout, cache rebuilt from scratch), but a maintainer running
   * `npm run site:upload` from that working copy would publish occurrence data
   * for species the catalog no longer contains.
   */
  catalogSlugs?: ReadonlySet<string>;
}

export interface PublishablePlan {
  /** Slugs whose Parquet may be copied into _site, in input order. */
  publish: string[];
  /** Slugs skipped because their family is embargoed. */
  skippedWithheld: string[];
  /** Slugs skipped because they are on the unpublished deny-list. */
  skippedUnpublished: string[];
  /** Slugs skipped because no data/species.csv row claims them (stale cache). */
  skippedStale: string[];
}

/**
 * Split the available Parquet slugs into publishable and gated.
 *
 * Both gates are applied against the normalized slug, the same form the deny-list
 * and the page gates use — a raw directory basename may carry spaces or mixed
 * case ("aseptis-sp no 1"), and an un-normalized comparison would wave it through.
 *
 * A slug caught by both gates is reported under both, so neither count reads as
 * the whole story on its own.
 */
export function selectPublishableSlugs(opts: SelectPublishableOptions): PublishablePlan {
  const { availableSlugs, withheldSlugs, unpublishedSlugs, catalogSlugs } = opts;

  const publish: string[] = [];
  const skippedWithheld: string[] = [];
  const skippedUnpublished: string[] = [];
  const skippedStale: string[] = [];

  for (const slug of availableSlugs) {
    const normalized = normalizeSlug(slug);
    const withheld = withheldSlugs.has(normalized);
    const unpublished = unpublishedSlugs.has(normalized);
    const stale = catalogSlugs !== undefined && !catalogSlugs.has(normalized);

    if (withheld) skippedWithheld.push(slug);
    if (unpublished) skippedUnpublished.push(slug);
    if (stale) skippedStale.push(slug);
    if (!withheld && !unpublished && !stale) publish.push(slug);
  }

  return { publish, skippedWithheld, skippedUnpublished, skippedStale };
}

/** Normalized slugs of every row in data/species.csv — the catalog itself. */
export function catalogSlugsFromSpeciesCsv(csvPath: string): Set<string> {
  const rows = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true }) as Array<{
    genus: string;
    species: string;
  }>;
  return new Set(rows.map(r => normalizeSlug(`${r.genus}-${r.species}`)));
}

/**
 * Normalized slugs of every species whose family is withheld.
 *
 * Families are matched case-insensitively, the way loadWithheldFamilies stores
 * them; a species with a blank family is never withheld by this rule.
 */
export function withheldSlugsFromSpeciesCsv(
  csvPath: string,
  withheldFamilies: ReadonlySet<string>,
): Set<string> {
  if (withheldFamilies.size === 0) return new Set<string>();

  const rows = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true }) as Array<{
    genus: string;
    species: string;
    family: string;
  }>;

  const slugs = new Set<string>();
  for (const row of rows) {
    const family = (row.family ?? '').trim().toLowerCase();
    if (family.length > 0 && withheldFamilies.has(family)) {
      slugs.add(normalizeSlug(`${row.genus}-${row.species}`));
    }
  }
  return slugs;
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const src = resolve('data/parquet');
  const dest = resolve('_site/species');

  const availableSlugs = (await readdir(src, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  const withheldSlugs = withheldSlugsFromSpeciesCsv(
    resolve('data/species.csv'),
    loadWithheldFamilies(),
  );
  const unpublishedSlugs = loadUnpublishedSpecies();
  const catalogSlugs = catalogSlugsFromSpeciesCsv(resolve('data/species.csv'));

  const { publish, skippedWithheld, skippedUnpublished, skippedStale } = selectPublishableSlugs({
    availableSlugs,
    withheldSlugs,
    unpublishedSlugs,
    catalogSlugs,
  });

  await mkdir(dest, { recursive: true });
  for (const slug of publish) {
    await cp(resolve(src, slug), resolve(dest, slug), { recursive: true });
  }

  console.log(
    `[copy-parquet] copied ${publish.length} of ${availableSlugs.length} species ` +
      `(withheld family: ${skippedWithheld.length}, unpublished: ${skippedUnpublished.length}, ` +
      `stale cache: ${skippedStale.length}) — data/parquet/ -> _site/species/`,
  );
  if (skippedStale.length > 0) {
    console.log(
      `[copy-parquet] ${skippedStale.length} data/parquet/ director(ies) have no data/species.csv ` +
        `row and were not published: ${skippedStale.join(', ')}. Safe to delete.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
