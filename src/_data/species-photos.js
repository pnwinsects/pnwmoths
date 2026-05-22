// Eleventy 11ty-data loader for the high-resolution species photo manifest.
// Returns an object keyed by species slug; consumed by src/species/species.njk
// as `speciesPhotos[sp.slug]` to drive the OSD lightbox branch in
// pnwm-image-slideshow. Phase 28 ships this with `{}` and Plan 05 hand-edits
// the first real entry; Phase 31 will replace the JSON with a manifest-derived
// version. Missing-file path soft-fails (returns `{}`) so deleting the JSON
// does not crash the build — mirrors the `[plates]` warning idiom in
// src/_data/plates.js line 165.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MANIFEST_PATH = new URL('../../data/species-photos.json', import.meta.url).pathname;

export default async function () {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`[species-photos] Manifest not found: ${MANIFEST_PATH} — no high-res species`);
    return {};
  }
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}
