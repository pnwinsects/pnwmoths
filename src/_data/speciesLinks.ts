// Eleventy 11ty-data loader for per-species external resource links
// (BugGuide and Moth Photographers Group), extracted from the legacy reference
// database into data/species-links.csv by scripts/extract-reference-links.ts.
//
// Returns an object keyed by species slug; consumed by src/species/species.njk
// as `speciesLinks[sp.slug]` to render the "External resources" section. A
// species may have more than one link per site, so each site is a string[].
//
// Missing-file path soft-fails (returns `{}`) so deleting the CSV does not crash
// the build — mirrors the soft-fail idiom in src/_data/speciesPhotos.ts.

import { readFileSync, existsSync } from 'node:fs';

const CSV_PATH = new URL('../../data/species-links.csv', import.meta.url).pathname;

export interface SpeciesLinks {
  bugguide: string[];
  mpg: string[];
}

/**
 * Parse the species-links CSV (header: species_slug,site,url) into a slug-keyed
 * map. Splits on the first two commas only, so URLs containing commas survive;
 * RFC-4180 surrounding quotes (written only when a field contains a comma/quote)
 * are stripped and doubled quotes unescaped.
 */
export function parseLinksCsv(text: string): Record<string, SpeciesLinks> {
  const unquote = (v: string): string =>
    v.startsWith('"') && v.endsWith('"')
      ? v.slice(1, -1).replace(/""/g, '"')
      : v;

  const map: Record<string, SpeciesLinks> = {};
  const lines = text.trimEnd().split('\n');
  for (const line of lines.slice(1)) {
    if (line === '') continue;
    const c1 = line.indexOf(',');
    const c2 = line.indexOf(',', c1 + 1);
    if (c1 === -1 || c2 === -1) continue;
    const slug = line.slice(0, c1);
    const site = line.slice(c1 + 1, c2);
    const url = unquote(line.slice(c2 + 1));
    const entry = (map[slug] ??= { bugguide: [], mpg: [] });
    if (site === 'bugguide') entry.bugguide.push(url);
    else if (site === 'mpg') entry.mpg.push(url);
  }
  return map;
}

export default function (): Record<string, SpeciesLinks> {
  if (!existsSync(CSV_PATH)) {
    console.warn(`[species-links] CSV not found: ${CSV_PATH} — no external links`);
    return {};
  }
  return parseLinksCsv(readFileSync(CSV_PATH, 'utf8'));
}
