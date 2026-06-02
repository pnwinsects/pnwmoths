#!/usr/bin/env node
/**
 * scripts/cdn-fix-bad-slugs.js
 *
 * Copies images on bunny.net CDN from malformed slug folders (containing spaces)
 * to corrected slug folders (spaces replaced with hyphens).
 *
 * These images were originally uploaded under slugs derived from provisional
 * species names like "aff curialis" or "n sp" which produced CDN paths with
 * spaces. The corrected slugs use hyphens throughout.
 *
 * Usage:
 *   BUNNY_API_KEY=xxx node scripts/cdn-fix-bad-slugs.js
 *   DRY_RUN=1 node scripts/cdn-fix-bad-slugs.js   # preview only
 *
 * Outputs:
 *   cdn-bad-slug-old-locations.txt — old CDN paths to clean up after verification
 */

import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const CDN_BASE = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}`;
const CDN_PULL = 'https://pnwmoths.b-cdn.net';

if (!BUNNY_API_KEY && !DRY_RUN) {
  console.error('BUNNY_API_KEY required (set to your Storage Zone password). Use DRY_RUN=1 to preview.');
  process.exit(1);
}

// Images that need moving: [oldSlug, newSlug, filename]
const moves = [
  ['caripeta -divisata', 'caripeta-divisata', 'Caripeta divisata-A-D.jpg'],
  ['caripeta -divisata', 'caripeta-divisata', 'Caripeta divisata-A-V.jpg'],
  ['egira-aff curialis', 'egira-aff-curialis', 'Egira aff curialis-A-V.jpg'],
  ['egira-aff curialis', 'egira-aff-curialis', 'Egira_aff_curialis-A-D.jpg'],
  ['plataea-n sp', 'plataea-n-sp', 'Plataea sp-A-D.jpg'],
  ['plataea-n sp', 'plataea-n-sp', 'Plataea sp-A-V.jpg'],
  ['resapamea-aff passer', 'resapamea-aff-passer', 'Resapamea aff passer-A-D.jpg'],
  ['resapamea-aff passer', 'resapamea-aff-passer', 'Resapamea aff passer-A-V.jpg'],
  ['schinia-aff verna', 'schinia-aff-verna', 'Schinia aff verna-A-D.jpg'],
  ['schinia-aff verna', 'schinia-aff-verna', 'Schinia aff verna-A-V.jpg'],
];

console.log(`[cdn-fix-slugs] ${moves.length} images to copy to corrected slug folders\n`);

if (DRY_RUN) {
  console.log('[cdn-fix-slugs] DRY_RUN=1 — showing what would be copied:\n');
  for (const [oldSlug, newSlug, filename] of moves) {
    console.log(`  ${oldSlug}/${filename}  →  ${newSlug}/${filename}`);
  }
} else {
  let copied = 0;
  let failed = 0;

  for (const [oldSlug, newSlug, filename] of moves) {
    const encodedFilename = encodeURIComponent(filename);
    // Old paths with spaces need encoding for the download URL
    const encodedOldSlug = encodeURIComponent(oldSlug);
    const downloadUrl = `${CDN_PULL}/${encodedOldSlug}/${encodedFilename}`;
    const uploadUrl = `${CDN_BASE}/${newSlug}/${encodedFilename}`;

    try {
      const dlResp = await fetch(downloadUrl);
      if (!dlResp.ok) {
        // Try without encoding the slug (bunny may have stored it literally)
        const altUrl = `${CDN_PULL}/${oldSlug}/${encodedFilename}`;
        const altResp = await fetch(altUrl);
        if (!altResp.ok) {
          throw new Error(`Download failed from both encoded and raw paths: ${dlResp.status}, ${altResp.status}`);
        }
        var data = Buffer.from(await altResp.arrayBuffer());
      } else {
        var data = Buffer.from(await dlResp.arrayBuffer());
      }

      const ulResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': BUNNY_API_KEY,
          'Content-Type': 'application/octet-stream',
        },
        body: data,
      });
      if (!ulResp.ok) throw new Error(`Upload failed: ${ulResp.status} ${ulResp.statusText}`);

      copied++;
      console.log(`[cdn-fix-slugs] ✓ ${newSlug}/${filename}`);
    } catch (err) {
      console.error(`[cdn-fix-slugs] ✗ FAILED: ${oldSlug}/${filename} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[cdn-fix-slugs] Done: ${copied} copied, ${failed} failed`);
}

// Write old locations for cleanup
const oldLocations = moves.map(([oldSlug, , filename]) => `${oldSlug}/${filename}`);
writeFileSync('cdn-bad-slug-old-locations.txt', oldLocations.join('\n') + '\n');
console.log(`[cdn-fix-slugs] Wrote ${oldLocations.length} old paths to cdn-bad-slug-old-locations.txt`);
