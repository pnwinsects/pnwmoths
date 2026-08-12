/**
 * scripts/generate-species-photos.ts
 *
 * Phase 31 (v2.2 high-res photos): derive data/species-photos.json from the
 * manifest's uploaded rows.
 * Reads data/species-photos-manifest.csv, filters rows with status=uploaded,
 * groups by species_slug, sorts specimens (alphabetical specimen_id, D before V),
 * and writes data/species-photos.json.
 *
 * Usage:
 *   node scripts/generate-species-photos.ts
 *   DRY_RUN=1 node scripts/generate-species-photos.ts   # prints derived JSON; no write
 *
 * The output JSON is committed to the repo; Eleventy reads it at build time
 * via src/_data/speciesPhotos.js. Run after photos:upload; commit the result.
 */

import { resolve } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { readManifest } from './lib/manifest.ts';
import type { ManifestRow } from './lib/manifest.ts';
import type { View, MatchBucket } from './lib/parse-photo-filename.ts';
import type { Specimen } from '../src/types/index.ts';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention).
// ---------------------------------------------------------------------------

const MANIFEST_PATH: string = resolve('data/species-photos-manifest.csv');
const OUTPUT_PATH: string = resolve('data/species-photos.json');
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const BUNNY_STORAGE_PASSWORD: string = '';

// ---------------------------------------------------------------------------
// SCHEMA-05 output type annotation
//
// `photographer` and `license` are curator-entered, not derived from the
// manifest — the manifest has no column for either. They are still part of the
// emitted entry: SpeciesPhotoSchema requires both, src/_data/speciesPhotos.ts
// annotates the imported JSON as Record<string, SpeciesPhoto>, and so a run that
// dropped them failed `tsc --noEmit` — i.e. `npm run photos:materialize` broke
// the build every time and left the fix as an undocumented manual re-annotation
// step (#214).
//
// Carrying the committed values forward is what the additive-only invariant
// requires of every generator here: derived columns are rewritten, curator-entered
// ones are never clobbered (CLAUDE.md "Architecture invariants";
// docs/adr/0017-reproducible-committed-artifacts.md).
// ---------------------------------------------------------------------------

type SpeciesPhotoEntry = {
  high_res_available: boolean;
  specimens: Specimen[];
  photographer: string;
  license: string;
};

/**
 * Attribution applied to a species appearing in the output for the first time.
 *
 * Not a guess: every high-res photo comes from the single Dropbox share in
 * scripts/tile-config.json, and all 1,241 entries carried these exact values
 * before this script learned to preserve them (commit 6632d9be). A new species
 * is a new *page*, not a new photographer.
 *
 * main() names every slug that takes the default so a curator can correct any
 * that are genuinely someone else's work — silence is what would make an
 * inherited default dangerous.
 */
export const DEFAULT_PHOTOGRAPHER = 'Merrill Peterson';
export const DEFAULT_LICENSE = 'CC BY-NC';

// ---------------------------------------------------------------------------
// Helpers — copied/adapted from upload-tiles.ts. Project convention: self-contained files.
// ---------------------------------------------------------------------------

/**
 * Redact BUNNY_STORAGE_PASSWORD from an error message. Mirrors tile-photos.ts verbatim
 * (adapted variable name) — this is the project-wide secret-redaction idiom.
 *
 * Guard against the empty-key edge case: `new RegExp('', 'g')` matches every
 * position in the string and would corrupt error text into a chain of
 * "[REDACTED]" markers. When the key is empty (DRY_RUN path, etc.), the
 * original message is returned unchanged.
 */
function redact(msg: string): string {
  return BUNNY_STORAGE_PASSWORD
    ? msg.replace(new RegExp(BUNNY_STORAGE_PASSWORD, 'g'), '[REDACTED]')
    : msg;
}

// ---------------------------------------------------------------------------
// Exported helpers (exported at module level for unit tests).
// ---------------------------------------------------------------------------

/**
 * Returns true if the row is eligible for materialization.
 * Only rows with status=uploaded are included in the output JSON.
 *
 * `row.match_bucket` is typed as MatchBucket at the check site (D-09).
 */
export function isMaterializable(row: ManifestRow): boolean {
  // D-09: match_bucket union used in the filter (MatchBucket is imported for type-checking)
  const _mb: MatchBucket | string = row.match_bucket; // documents union expectation
  void _mb; // consumed only for type annotation; status is the actual filter
  return row.status === 'uploaded';
}

/**
 * Construct the tiles_path for a manifest row.
 * Convention: species-tiles/{slug-lowercase}/{specimen_id}-{view}  (no trailing slash).
 * species_slug lowercased unconditionally (Phase 28/29 lesson).
 *
 * `row.view` is typed as View union here to satisfy D-09.
 */
export function toTilesPath(row: ManifestRow): string {
  const _view: View = row.view as View; // D-09: view is 'D' | 'V' | '' at this boundary
  return `species-tiles/${row.species_slug.toLowerCase()}/${row.specimen_id}-${_view}`;
}

/**
 * Build the full species-photos output object from a set of manifest rows.
 * Only rows passing isMaterializable() are included.
 * Specimens within each species are sorted: specimen_id alphabetical, then D before V.
 *
 * SCHEMA-05: result is typed Record<string, SpeciesPhotoEntry> at authoring time.
 *
 * `photographer`/`license` are copied from `existing` per slug when present, so
 * re-running never discards a curator's edit; a slug absent from `existing` (or
 * carrying a blank value) takes the DEFAULT_* constants.
 *
 * @param rows      All manifest rows (unfiltered)
 * @param existing  Previously committed data/species-photos.json, for curator fields
 * @returns Output keyed by species_slug
 */
export function buildSpeciesPhotos(
  rows: ManifestRow[],
  existing: Record<string, Partial<SpeciesPhotoEntry>> = {},
): Record<string, SpeciesPhotoEntry> {
  const uploadedRows = rows.filter(isMaterializable);
  const bySlug: Record<string, Specimen[]> = {};
  for (const row of uploadedRows) {
    const slug = row.species_slug.toLowerCase();
    if (!bySlug[slug]) bySlug[slug] = [];
    bySlug[slug]!.push({
      specimen_id: row.specimen_id,
      view: row.view,
      tiles_path: toTilesPath(row),
    });
  }
  // SCHEMA-05: typed annotation enforces high_res_available + specimens shape at compile time.
  const result: Record<string, SpeciesPhotoEntry> = {};
  for (const [slug, specimens] of Object.entries(bySlug).sort()) {
    specimens.sort((a, b) => {
      const idCmp = a.specimen_id.localeCompare(b.specimen_id);
      if (idCmp !== 0) return idCmp;
      return a.view.localeCompare(b.view); // D < V alphabetically
    });
    const prior = existing[slug];
    result[slug] = {
      high_res_available: true,
      specimens,
      photographer: prior?.photographer || DEFAULT_PHOTOGRAPHER,
      license: prior?.license || DEFAULT_LICENSE,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rows: ManifestRow[] = await readManifest(MANIFEST_PATH);
  const uploadedRows = rows.filter(isMaterializable);

  console.log(
    `[generate-species-photos] manifest: ${rows.length} rows total; ${uploadedRows.length} eligible (status=uploaded)`
  );

  // Read (not import) the previous output: this file is the script's own product,
  // so a static import would pin the build-time copy and defeat the round-trip.
  // Absent or unparseable is not fatal — it just means nothing to carry forward.
  let existing: Record<string, Partial<SpeciesPhotoEntry>> = {};
  if (existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(await readFile(OUTPUT_PATH, 'utf8')) as Record<string, Partial<SpeciesPhotoEntry>>;
    } catch (err) {
      console.warn(
        `[generate-species-photos] could not parse existing ${OUTPUT_PATH} (${(err as Error).message}) — curator attribution will fall back to defaults`
      );
    }
  }

  const result = buildSpeciesPhotos(rows, existing);

  // Name every slug taking inherited defaults so a curator can correct any that
  // are genuinely someone else's work.
  // Either field blank counts: a committed entry with a photographer but no
  // license would otherwise take DEFAULT_LICENSE silently, against the
  // "main() names every slug that takes the default" promise above.
  const defaulted = Object.keys(result).filter(
    slug => !existing[slug]?.photographer || !existing[slug]?.license,
  );
  if (defaulted.length > 0) {
    console.log(
      `[generate-species-photos] ${defaulted.length} species had no curator attribution; defaulted to "${DEFAULT_PHOTOGRAPHER}" / "${DEFAULT_LICENSE}":`
    );
    for (const slug of defaulted) console.log(`    ${slug}`);
  }

  // --- DRY_RUN path: print derived JSON without writing. ---
  if (DRY_RUN) {
    console.log('[generate-species-photos] DRY_RUN=1 — derived JSON (not written):');
    console.log(JSON.stringify(result, null, 2));
    console.log(`[generate-species-photos] ${uploadedRows.length} uploaded rows → ${Object.keys(result).length} species`);
    return;
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n');

  console.log('');
  console.log('[generate-species-photos] summary:');
  console.log(`  uploaded rows processed:  ${uploadedRows.length}`);
  console.log(`  species with high-res:    ${Object.keys(result).length}`);
  console.log(`  total specimens:          ${uploadedRows.length}`);
  console.log(`[generate-species-photos] wrote ${OUTPUT_PATH}`);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — verbatim from tile-photos.ts.
// Prevents main() from running when the test file imports the exports above.
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(redact((err as Error).message)); process.exit(1); });
}
