/**
 * scripts/migrate-legacy-photos.ts
 *
 * One-off migration: upload legacy species photos that exist in the original
 * WWU site backup (django/pnwmoths/static/media/moths/) but were never copied
 * to the bunny CDN — so `{slug}/{filename}` 404s and the Identify grid / species
 * browse cards fall back to the gray placeholder.
 *
 * These files ARE catalogued in data/images.csv; they were simply left out of the
 * original old-site→bunny image migration (the high-res .tif/Dropbox pipeline is a
 * separate, later system). Recovers photos for ~73 species (incl. Smerinthus
 * cerisyi, Apantesis bolanderi, …) with no data loss.
 *
 * Source: extract media/moths/ from pnwmoths_https.tar.xz, then point
 * LEGACY_PHOTOS_SRC at the extracted `.../static/media/moths/` directory:
 *   tar --fast-read -xJf pnwmoths_https.tar.xz -T members.txt -C /tmp/legacy-moths
 *
 * Each data/images.csv row whose `filename` exists in LEGACY_PHOTOS_SRC and is
 * missing on the CDN is PUT to `{slug}/{filename}` on the bunny `pnwmoths` storage
 * zone, verbatim (no rename — the filename already matches the catalog, so the grid
 * finds it immediately). Idempotent: a HEAD against the public CDN skips files
 * already present.
 *
 * Usage:
 *   DRY_RUN=1 LEGACY_PHOTOS_SRC=/tmp/legacy-moths/.../media/moths node scripts/migrate-legacy-photos.ts
 *   BUNNY_API_KEY=... LEGACY_PHOTOS_SRC=... node scripts/migrate-legacy-photos.ts
 *
 * BUNNY_API_KEY: Storage Zone password (bunny.net → pnwmoths zone → FTP & API
 * Access → Password). Only the real PUT needs it; DRY_RUN runs read-only.
 * Requires: curl CLI.
 */

import { resolve, join } from 'node:path';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';

// ---------------------------------------------------------------------------
// Env constants (mirrors upload-images.ts / upload-tiles.ts).
// ---------------------------------------------------------------------------

const SOURCE_DIR: string = process.env['LEGACY_PHOTOS_SRC'] ?? '';
const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_API_KEY: string = process.env['BUNNY_API_KEY'] ?? '';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Redact BUNNY_API_KEY from an error message. Verbatim from upload-images.ts. */
function redact(msg: string): string {
  return BUNNY_API_KEY ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]') : msg;
}

/** Five-attempt exponential backoff (2/4/8/16/32s). Verbatim from upload-images.ts. */
async function withRetry<T>(fn: () => T | Promise<T>, label: string): Promise<T> {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safeMsg = redact((err as Error).message ?? String(err));
      if (attempt === delays.length - 1) {
        throw new Error(`${label} failed after ${delays.length} attempts: ${safeMsg}`);
      }
      console.log(`[migrate-legacy-photos] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safeMsg}`);
      await sleep(delays[attempt]!);
    }
  }
  throw new Error(`${label}: unreachable`);
}

// ---------------------------------------------------------------------------
// Pure URL helpers — exported for unit tests.
// ---------------------------------------------------------------------------

/**
 * Canonical CDN name for a legacy photo. The backup files use the old-site
 * separators between genus and species — underscore ('Xestia_atrata-A-D.jpg') OR
 * hyphen ('Tarache-flavipennis-A-D.jpg') — while the CDN and data/images.csv use
 * the space convention ('Xestia atrata-A-D.jpg'). Normalizes both:
 *   1. every underscore → space (handles Genus_species and irregular Genus_species_D)
 *   2. the leading genus↔species hyphen → space, while preserving the uppercase
 *      view-code hyphens (-A-D) via the lowercase lookahead.
 * Idempotent. Exported for unit tests.
 */
export function normalizePhotoName(filename: string): string {
  return filename.replace(/_/g, ' ').replace(/^([A-Z][a-z]+)-(?=[a-z])/, '$1 ');
}

/** Storage-zone PUT URL for a legacy photo. Filename is URL-encoded (spaces/commas). */
export function legacyPhotoStorageUrl(slug: string, filename: string): string {
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${slug}/${encodeURIComponent(filename)}`;
}

/** Public CDN read URL (for the idempotency HEAD check; no API key needed). */
export function cdnReadUrl(slug: string, filename: string): string {
  return `${CDN_BASE_URL}/${slug}/${encodeURIComponent(filename)}`;
}

/** Returns true if the object is already on the CDN (HEAD 2xx). */
function isOnCdn(slug: string, filename: string): boolean {
  try {
    execFileSync('curl', ['-s', '-S', '-f', '-I', cdnReadUrl(slug, filename)], { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false; // 4xx (404 = absent)
  }
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!SOURCE_DIR || !existsSync(SOURCE_DIR)) {
    console.error(`[migrate-legacy-photos] LEGACY_PHOTOS_SRC not set or missing: '${SOURCE_DIR}'`);
    console.error('[migrate-legacy-photos] Extract media/moths/ from pnwmoths_https.tar.xz and point LEGACY_PHOTOS_SRC at it.');
    process.exit(1);
  }

  // Index data/images.csv by canonical (space) filename → owning slug(s).
  const rows = parse(readFileSync(resolve('data/images.csv')), {
    columns: true, skip_empty_lines: true, bom: true, relax_quotes: true,
  }) as Array<{ species_slug: string; filename: string }>;

  const slugsByName = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.species_slug || !r.filename) continue;
    const key = normalizePhotoName(r.filename);
    (slugsByName.get(key) ?? slugsByName.set(key, new Set()).get(key)!).add(r.species_slug);
  }

  // Work-list: each source file (old underscore name) → its catalogued slug(s),
  // uploaded under the canonical space name so the catalog and CDN agree.
  const work: Array<{ slug: string; sourceFile: string; targetName: string }> = [];
  for (const sourceFile of readdirSync(SOURCE_DIR)) {
    const targetName = normalizePhotoName(sourceFile);
    for (const slug of slugsByName.get(targetName) ?? []) {
      work.push({ slug, sourceFile, targetName });
    }
  }

  console.log(`[migrate-legacy-photos] source: ${SOURCE_DIR}`);
  console.log(`[migrate-legacy-photos] ${work.length} source files matched to a catalogued slug`);

  if (!DRY_RUN && !BUNNY_API_KEY) {
    console.error('[migrate-legacy-photos] BUNNY_API_KEY required for a real run (bunny.net → pnwmoths zone → FTP & API Access → Password).');
    console.error('[migrate-legacy-photos] Use DRY_RUN=1 to preview without a key.');
    process.exit(1);
  }

  const stats = { uploaded: 0, skipped: 0, failed: 0 };

  for (const { slug, sourceFile, targetName } of work) {
    // Idempotency: skip anything already on the CDN (under the canonical name).
    if (isOnCdn(slug, targetName)) {
      stats.skipped++;
      continue;
    }

    if (DRY_RUN) {
      stats.uploaded++; // "would upload"
      console.log(`  PUT  ${slug}/${targetName}${sourceFile !== targetName ? `   (from ${sourceFile})` : ''}`);
      console.log(`       → ${cdnReadUrl(slug, targetName)}`);
      continue;
    }

    const srcPath = join(SOURCE_DIR, sourceFile);
    try {
      await withRetry(
        () => execFileSync('curl', [
          '-s', '-S', '-f',
          '-X', 'PUT',
          '-H', `AccessKey: ${BUNNY_API_KEY}`,
          '-H', 'Content-Type: image/jpeg',
          '--data-binary', `@${srcPath}`,
          legacyPhotoStorageUrl(slug, targetName),
        ], { stdio: ['pipe', 'pipe', 'inherit'] }),
        `upload ${slug}/${targetName}`,
      );
      stats.uploaded++;
      console.log(`[migrate-legacy-photos] uploaded: ${slug}/${targetName}`);
    } catch (err) {
      stats.failed++;
      console.error(`[migrate-legacy-photos] failed: ${slug}/${targetName} — ${redact((err as Error).message)}`);
    }
  }

  console.log('');
  console.log('[migrate-legacy-photos] summary:');
  console.log(`  ${DRY_RUN ? 'would upload' : 'uploaded'}: ${stats.uploaded}`);
  console.log(`  skipped (already on CDN): ${stats.skipped}`);
  if (!DRY_RUN) console.log(`  failed: ${stats.failed}`);
  if (stats.failed > 0) process.exit(1);
}

// Self-invocation guard — verbatim from upload-tiles.ts:417-419.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(redact((err as Error).message)); process.exit(1); });
}
