// src/_lib/unpublished-species.ts
/**
 * Shared loader and predicate for the provisional/undescribed-species deny-list (ISSUE-80).
 *
 * This is a DISPLAY deny-list — occurrence records, images, per-species parquet directories,
 * and Lucid key source data for listed species are preserved intact. Any species can be
 * re-included on the next build by deleting its line from data/unpublished-species.csv.
 *
 * Applied at the same four choke points as the family-withholding gate:
 *   - src/_data/species.ts  (species pages + Pagefind search index)
 *   - src/_data/taxon.ts    (Browse taxonomy tree)
 *   - scripts/build-key.ts  (Identify / data/key-matrix.json)
 *   - src/_data/stats.ts    (home-page vanity counts)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

const DEFAULT_CSV_PATH = resolve('data/unpublished-species.csv');

/**
 * Normalize a raw species slug to a hyphen-only, lowercase form for matching.
 *
 * The site slug is lower(genus || '-' || species); when the `species` field
 * contains spaces (e.g. "sp No 1"), the raw slug has embedded spaces
 * ("aseptis-sp no 1"). The deny-list uses hyphenated forms ("aseptis-sp-no-1").
 * This function is the single source of truth for reconciling both forms:
 *   trim → lowercase → replace all whitespace runs with a hyphen.
 *
 * @param raw Raw slug (may contain spaces, mixed case, leading/trailing whitespace).
 */
export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Load the set of unpublished (provisional/undescribed) species slugs from a CSV file.
 *
 * Reads `data/unpublished-species.csv` (or the supplied path) and returns a Set
 * of normalized slugs (hyphenated, lowercased); e.g. the set
 * contains "aseptis-sp-no-1".
 *
 * Defensive behaviors:
 * - Missing file: warns and returns an empty Set (removing the file is a no-op).
 * - Empty / header-only CSV: returns an empty Set (deny-list lifted).
 *
 * @param csvPath Path to the unpublished-species CSV; defaults to data/unpublished-species.csv.
 */
export function loadUnpublishedSpecies(csvPath: string = DEFAULT_CSV_PATH): Set<string> {
  if (!existsSync(csvPath)) {
    console.warn(`[unpublished-species] ${csvPath} not found — no species unpublished (build continues)`);
    return new Set<string>();
  }

  const rows = parse(
    readFileSync(csvPath),
    { columns: true, skip_empty_lines: true }
  ) as Array<{ slug: string; reason: string }>;

  const slugs = rows
    .map(r => normalizeSlug(r.slug ?? ''))
    .filter(s => s.length > 0);

  return new Set<string>(slugs);
}

/**
 * Return true when the normalized form of `slug` is in the unpublished deny-set.
 *
 * Accepts raw space-containing slugs ("aseptis-sp no 1") and hyphenated forms
 * alike — normalization happens here, so callers pass whatever slug form they hold.
 *
 * @param slug Raw or normalized species slug (may be null/undefined for sparse data).
 * @param denySet Set returned by loadUnpublishedSpecies().
 */
export function isUnpublished(slug: string | null | undefined, denySet: Set<string>): boolean {
  return slug != null && denySet.has(normalizeSlug(slug));
}
