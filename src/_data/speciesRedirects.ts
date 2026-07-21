// Eleventy 11ty-data loader for permanent species-slug redirects (renamed/consolidated
// taxonomy — see data/species-redirects.csv). Each row retires an old factsheet URL
// in favor of the current canonical slug (e.g. #155's obsolete-genus migrations, #156's
// Saturnia -> Calosaturnia mendocino consolidation).
//
// Consumed by src/species-redirect.njk, which paginates over this list to emit a
// static redirect stub at /species/{old_slug}/index.html for each row.
//
// Missing-file path soft-fails (returns []) so deleting the CSV does not crash the
// build — mirrors the soft-fail idiom in src/_data/speciesLinks.ts.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath (not .pathname) so this resolves correctly on Windows, where a bare
// URL.pathname keeps a leading "/" before the drive letter (e.g. "/C:/...") and fails
// existsSync/readFileSync.
const CSV_PATH = fileURLToPath(new URL('../../data/species-redirects.csv', import.meta.url));

export interface SpeciesRedirect {
  oldSlug: string;
  newSlug: string;
  reason: string;
}

export function parseRedirectsCsv(text: string): SpeciesRedirect[] {
  const rows: SpeciesRedirect[] = [];
  const lines = text.trimEnd().split('\n');
  for (const line of lines.slice(1)) {
    if (line === '') continue;
    const c1 = line.indexOf(',');
    const c2 = line.indexOf(',', c1 + 1);
    if (c1 === -1 || c2 === -1) continue;
    rows.push({
      oldSlug: line.slice(0, c1),
      newSlug: line.slice(c1 + 1, c2),
      reason: line.slice(c2 + 1),
    });
  }
  return rows;
}

export default function (): SpeciesRedirect[] {
  if (!existsSync(CSV_PATH)) {
    console.warn(`[species-redirects] CSV not found: ${CSV_PATH} — no redirect stubs emitted`);
    return [];
  }
  return parseRedirectsCsv(readFileSync(CSV_PATH, 'utf8'));
}
