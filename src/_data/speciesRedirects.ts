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
import { parse } from 'csv-parse/sync';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../_lib/withheld-families.ts';
import { loadUnpublishedSpecies, isUnpublished, normalizeSlug } from '../_lib/unpublished-species.ts';

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

/**
 * Keep only redirects whose target actually gets a page.
 *
 * A merge can retire a slug into a survivor that is itself display-gated — the
 * #265 Geometridae merges redirect into species the #48 family embargo hides —
 * and a stub pointing at an unemitted page is a built-in 404 the blocking link
 * check fails on. The CSV keeps the row (the retirement is a fact either way);
 * the stub is suppressed here, at the consumer, and appears automatically when
 * the gate lifts (ADR 0015 pattern). A target missing from species.csv entirely
 * is passed through: check-referential-integrity owns that failure.
 */
export function filterToEmittedTargets(
  rows: SpeciesRedirect[],
  slugToFamily: ReadonlyMap<string, string>,
  withheld: Set<string>,
  unpublished: Set<string>,
): SpeciesRedirect[] {
  return rows.filter(r => {
    const family = slugToFamily.get(r.newSlug);
    if (family === undefined) return true;
    return !isWithheldOrUnclassified(family, withheld) && !isUnpublished(r.newSlug, unpublished);
  });
}

const SPECIES_CSV_PATH = fileURLToPath(new URL('../../data/species.csv', import.meta.url));

function loadSlugToFamily(): Map<string, string> {
  if (!existsSync(SPECIES_CSV_PATH)) return new Map();
  const rows = parse(readFileSync(SPECIES_CSV_PATH), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ genus?: string; species?: string; family?: string }>;
  return new Map(
    rows.map(r => [normalizeSlug(`${r.genus ?? ''}-${r.species ?? ''}`), r.family ?? '']),
  );
}

export default function (): SpeciesRedirect[] {
  if (!existsSync(CSV_PATH)) {
    console.warn(`[species-redirects] CSV not found: ${CSV_PATH} — no redirect stubs emitted`);
    return [];
  }
  const rows = parseRedirectsCsv(readFileSync(CSV_PATH, 'utf8'));
  const emitted = filterToEmittedTargets(
    rows, loadSlugToFamily(), loadWithheldFamilies(), loadUnpublishedSpecies(),
  );
  const gated = rows.length - emitted.length;
  if (gated > 0) {
    console.log(`[species-redirects] ${gated} redirect(s) target gated species — stubs suppressed until the gate lifts`);
  }
  return emitted;
}
