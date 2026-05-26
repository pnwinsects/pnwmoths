#!/usr/bin/env node
/**
 * scripts/cdn-copy-reclassified.js
 *
 * Copies images on bunny.net CDN from old slug folders to new canonical slug
 * folders. This is needed because 292 images were uploaded under filename-derived
 * slugs but now belong under DB-canonical slugs (species reclassification).
 *
 * Usage:
 *   BUNNY_API_KEY=xxx node scripts/cdn-copy-reclassified.js
 *   DRY_RUN=1 node scripts/cdn-copy-reclassified.js   # preview only
 *
 * Outputs:
 *   cdn-old-locations.txt — list of old CDN paths to clean up after deploy
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';

const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const CDN_BASE = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}`;

if (!BUNNY_API_KEY && !DRY_RUN) {
  console.error('BUNNY_API_KEY required (set to your Storage Zone password). Use DRY_RUN=1 to preview.');
  process.exit(1);
}

// --- Load current images.csv (has new canonical slugs) ---
const currentRows = parse(readFileSync('data/images.csv', 'utf8'), { columns: true, skip_empty_lines: true });

// --- Load previous images.csv from git (has old CDN slugs) ---
let previousRaw;
try {
  previousRaw = execFileSync('git', ['show', 'main:data/images.csv'], { encoding: 'utf8' });
} catch {
  previousRaw = execFileSync('git', ['show', 'HEAD~1:data/images.csv'], { encoding: 'utf8' });
}
const previousRows = parse(previousRaw, { columns: true, skip_empty_lines: true });

// Build filename → old slug map
const oldSlugByFilename = new Map();
for (const row of previousRows) {
  oldSlugByFilename.set(row.filename, row.species_slug);
}

// --- Find images that need copying (slug changed) ---
const toCopy = [];
for (const row of currentRows) {
  const oldSlug = oldSlugByFilename.get(row.filename);
  if (oldSlug && oldSlug !== row.species_slug) {
    toCopy.push({
      filename: row.filename,
      oldSlug,
      newSlug: row.species_slug,
    });
  }
}

console.log(`[cdn-copy] Found ${toCopy.length} images to copy to new slug folders`);

if (DRY_RUN) {
  console.log('[cdn-copy] DRY_RUN=1 — showing what would be copied:\n');
  for (const item of toCopy.slice(0, 10)) {
    console.log(`  ${item.oldSlug}/${item.filename}  →  ${item.newSlug}/${item.filename}`);
  }
  if (toCopy.length > 10) console.log(`  ... and ${toCopy.length - 10} more`);
} else {
  // bunny.net Storage API doesn't have a native copy endpoint.
  // Strategy: download from old path, upload to new path.
  let copied = 0;
  let failed = 0;

  for (const item of toCopy) {
    const encodedFilename = encodeURIComponent(item.filename);
    const downloadUrl = `https://pnwmoths.b-cdn.net/${item.oldSlug}/${encodedFilename}`;
    const uploadUrl = `${CDN_BASE}/${item.newSlug}/${encodedFilename}`;

    try {
      // Download from CDN pull zone
      const data = execFileSync('curl', [
        '-s', '-S', '-f', '-L',
        downloadUrl,
      ], { maxBuffer: 50 * 1024 * 1024 });

      // Upload to new location via Storage API
      execFileSync('curl', [
        '-s', '-S', '-f',
        '-X', 'PUT',
        '-H', `AccessKey: ${BUNNY_API_KEY}`,
        '-H', 'Content-Type: application/octet-stream',
        '--data-binary', '@-',
        uploadUrl,
      ], { input: data, maxBuffer: 50 * 1024 * 1024 });

      copied++;
      if (copied % 50 === 0) console.log(`[cdn-copy] ${copied}/${toCopy.length} copied`);
    } catch (err) {
      console.error(`[cdn-copy] FAILED: ${item.oldSlug}/${item.filename} — ${err.message}`);
      failed++;
    }
  }

  console.log(`[cdn-copy] Done: ${copied} copied, ${failed} failed`);
}

// --- Write old locations file for future cleanup ---
const oldLocations = toCopy.map(item => `${item.oldSlug}/${item.filename}`);
writeFileSync('cdn-old-locations.txt', oldLocations.join('\n') + '\n');
console.log(`[cdn-copy] Wrote ${oldLocations.length} old paths to cdn-old-locations.txt`);
