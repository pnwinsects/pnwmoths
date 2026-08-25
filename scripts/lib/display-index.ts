// scripts/lib/display-index.ts
//
// Loading the display index from the repo's own artifacts (#338).
//
// src/_lib/photo-display-index.ts is pure: hand it the four things the surfaces render
// from and it inverts them into "where does this photograph appear". This is the loader
// that fetches those four things — and it fetches them by calling the SAME Eleventy data
// modules the site builds from, not by re-reading data/*.csv into a parallel model:
//
//   src/_data/taxon.ts    the Browse tree, navImages and all
//   src/_data/species.ts  the species collection, with similar_slugs and the visibility
//                         gates already applied — this is exactly what /species/ pages
//                         iterate, so "which accounts exist" needs no second answer
//   src/_data/images.ts   images.csv grouped by slug, in display order
//   data/key-matrix.json  the committed Identify artifact, nav_image included
//
// The cost is that the report now spins up DuckDB (a few seconds) where it used to parse
// CSVs. The gain is that it no longer needs a built `_site/` at all, and that every rule
// it depends on is one someone else already ran.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import taxonData from '../../src/_data/taxon.ts';
import speciesData from '../../src/_data/species.ts';
import imagesData from '../../src/_data/images.ts';
import {
  buildDisplayIndex,
  type DisplayIndex,
  type AccountInput,
  type BrowseNode,
  type IndexImage,
} from '../../src/_lib/photo-display-index.ts';

const ROOT = resolve(import.meta.dirname, '../..');

interface KeyMatrixSpecies {
  slug: string;
  nav_image?: string | null;
}

/** The Identify artifact's per-species entries, or [] when the key has not been built. */
export function readKeySpecies(path: string = resolve(ROOT, 'data/key-matrix.json')): KeyMatrixSpecies[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) return [];
  const species = (parsed as { species?: unknown }).species;
  if (!Array.isArray(species)) return [];
  const rows: KeyMatrixSpecies[] = [];
  for (const entry of species) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as { slug?: unknown; nav_image?: unknown };
    if (typeof row.slug !== 'string') continue;
    rows.push({ slug: row.slug, nav_image: typeof row.nav_image === 'string' ? row.nav_image : null });
  }
  return rows;
}

/**
 * Tiled species, by `high_res_available` ALONE.
 *
 * No `specimens?.length` guard, because that is what src/species/species.njk branches on:
 * an entry flagged available with no specimens still takes the tiles branch and shows
 * nothing. Requiring specimens here would report those photographs as displayed.
 */
export function readTiledSlugs(path: string = resolve(ROOT, 'data/species-photos.json')): Set<string> {
  const photos: Record<string, { high_res_available?: boolean }> = JSON.parse(readFileSync(path, 'utf8'));
  const tiled = new Set<string>();
  for (const [slug, entry] of Object.entries(photos)) {
    if (entry.high_res_available) tiled.add(slug);
  }
  return tiled;
}

/** Where every catalogued photograph appears, derived from the artifacts the site renders. */
export async function loadDisplayIndex(): Promise<DisplayIndex> {
  const [browseTree, species] = await Promise.all([taxonData(), speciesData()]);
  const imagesBySlug: Record<string, IndexImage[]> = imagesData();
  const tiled = readTiledSlugs();

  // The accounts that exist are the species collection, gates already applied. A
  // similar-species link renders only when its target is in that same collection —
  // src/species/species.njk resolves it by scanning `species` — so an unpublished or
  // withheld target contributes no thumbnail and must not contribute one here.
  const built = new Set(species.map((row) => row.slug));
  const accounts: AccountInput[] = species.map((row) => ({
    slug: row.slug,
    similarSlugs: row.similar_slugs.filter((slug) => built.has(slug)),
    tiled: tiled.has(row.slug),
  }));

  return buildDisplayIndex({
    browseTree: browseTree as readonly BrowseNode[],
    keySpecies: readKeySpecies(),
    accounts,
    imagesBySlug,
  });
}
