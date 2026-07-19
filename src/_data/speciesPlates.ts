// Eleventy 11ty-data loader for the per-species photographic-plate assignment
// (issue #53), extracted from the legacy reference database into
// data/species-plates.csv by scripts/extract-species-plates.ts.
//
// Returns an object keyed by species slug -> plate slug; consumed by
// src/species/species.njk as `speciesPlates[sp.slug]` to look up the matching
// entry in the global `plates` data and render the "View Photographic Plate"
// link the original site showed on every species page.
//
// Missing-file path soft-fails (returns `{}`) so deleting the CSV does not
// crash the build — mirrors the soft-fail idiom in src/_data/speciesLinks.ts.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSV_PATH = fileURLToPath(new URL('../../data/species-plates.csv', import.meta.url));

/**
 * Parse the species-plates CSV (header: species_slug,plate_slug) into a
 * slug-keyed map. Both columns are always plain alphanumeric-and-hyphen slugs
 * (see scripts/extract-species-plates.ts), so no quoting/escaping is needed.
 */
export function parsePlatesCsv(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = text.trimEnd().split('\n');
  for (const line of lines.slice(1)) {
    if (line === '') continue;
    const [speciesSlug, plateSlug] = line.split(',');
    if (!speciesSlug || !plateSlug) continue;
    map[speciesSlug] = plateSlug;
  }
  return map;
}

export default function (): Record<string, string> {
  if (!existsSync(CSV_PATH)) {
    console.warn(`[species-plates] CSV not found: ${CSV_PATH} — no plate links`);
    return {};
  }
  return parsePlatesCsv(readFileSync(CSV_PATH, 'utf8'));
}
