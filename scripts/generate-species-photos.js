/**
 * scripts/generate-species-photos.js
 *
 * Phase 31 (v2.2 high-res photos): derive data/species-photos.json from the
 * manifest's uploaded rows.
 * Reads data/species-photos-manifest.csv, filters rows with status=uploaded,
 * groups by species_slug, sorts specimens (alphabetical specimen_id, D before V),
 * and writes data/species-photos.json.
 *
 * Usage:
 *   node scripts/generate-species-photos.js
 *   DRY_RUN=1 node scripts/generate-species-photos.js   # prints derived JSON; no write
 *
 * The output JSON is committed to the repo; Eleventy reads it at build time
 * via src/_data/speciesPhotos.js. Run after photos:upload; commit the result.
 */

import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { readManifest } from './lib/manifest.js';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention).
// ---------------------------------------------------------------------------

const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const OUTPUT_PATH = resolve('data/species-photos.json');
const DRY_RUN = process.env.DRY_RUN === '1';
const BUNNY_API_KEY = '';

// ---------------------------------------------------------------------------
// Helpers — copied/adapted from upload-tiles.js. Project convention: self-contained files.
// ---------------------------------------------------------------------------

/**
 * Redact BUNNY_API_KEY from an error message. Mirrors tile-photos.js verbatim
 * (adapted variable name) — this is the project-wide secret-redaction idiom.
 *
 * Guard against the empty-key edge case: `new RegExp('', 'g')` matches every
 * position in the string and would corrupt error text into a chain of
 * "[REDACTED]" markers. When the key is empty (DRY_RUN path, etc.), the
 * original message is returned unchanged.
 */
function redact(msg) {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}

/**
 * Per-stage log line: ISO timestamp, content_hash prefix (12 chars, padded),
 * action (16-char field), outcome, optional extra context.
 * Copied verbatim from tile-photos.js.
 */
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}

// ---------------------------------------------------------------------------
// Exported helpers (exported at module level for unit tests).
// ---------------------------------------------------------------------------

/**
 * Returns true if the row is eligible for materialization.
 * Only rows with status=uploaded are included in the output JSON.
 */
export function isMaterializable(row) {
  return row.status === 'uploaded';
}

/**
 * Construct the tiles_path for a manifest row.
 * Convention: species-tiles/{slug-lowercase}/{specimen_id}-{view}  (no trailing slash).
 * species_slug lowercased unconditionally (Phase 28/29 lesson).
 */
export function toTilesPath(row) {
  return `species-tiles/${row.species_slug.toLowerCase()}/${row.specimen_id}-${row.view}`;
}

/**
 * Build the full species-photos output object from a set of manifest rows.
 * Only rows passing isMaterializable() are included.
 * Specimens within each species are sorted: specimen_id alphabetical, then D before V.
 *
 * @param {Array<Object>} rows  - All manifest rows (unfiltered)
 * @returns {Object}            - Output keyed by species_slug; value: {high_res_available, specimens}
 */
export function buildSpeciesPhotos(rows) {
  const uploadedRows = rows.filter(isMaterializable);
  const bySlug = {};
  for (const row of uploadedRows) {
    const slug = row.species_slug.toLowerCase();
    if (!bySlug[slug]) bySlug[slug] = [];
    bySlug[slug].push({
      specimen_id: row.specimen_id,
      view: row.view,
      tiles_path: toTilesPath(row),
    });
  }
  const result = {};
  for (const [slug, specimens] of Object.entries(bySlug).sort()) {
    specimens.sort((a, b) => {
      const idCmp = a.specimen_id.localeCompare(b.specimen_id);
      if (idCmp !== 0) return idCmp;
      return a.view.localeCompare(b.view); // D < V alphabetically
    });
    result[slug] = { high_res_available: true, specimens };
  }
  return result;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main() {
  const rows = await readManifest(MANIFEST_PATH);
  const uploadedRows = rows.filter(isMaterializable);

  console.log(
    `[generate-species-photos] manifest: ${rows.length} rows total; ${uploadedRows.length} eligible (status=uploaded)`
  );

  const result = buildSpeciesPhotos(rows);

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
// Self-invocation guard — verbatim from tile-photos.js.
// Prevents main() from running when the test file imports the exports above.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(redact(err.message)); process.exit(1); });
}
