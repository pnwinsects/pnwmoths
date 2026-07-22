/**
 * scripts/migrate-drasteria-maculosa-photos.ts
 *
 * One-off migration for issue #156: Merrill Peterson confirmed the legacy images
 * catalogued under `drasteria-nubicola` (`Drasteria nubicola-A-D.jpg` /
 * `-A-V.jpg`) genuinely depict `Drasteria maculosa` — the legacy CMS's own
 * `drasteria-maculosa` factsheet links these exact two images as its featured
 * photos (see the "old-image-factsheet" / "carousel-other-images" markup at
 * https://pnwmoths.biol.wwu.edu/browse/family-erebidae/subfamily-erebinae/tribe-melipotini/drasteria/drasteria-maculosa/).
 * `data/images.csv` and `data/cdn-retired-images.csv` have already been updated
 * to the canonical `drasteria-maculosa` slug/filenames; this script performs the
 * actual additive CDN copy so `drasteria-maculosa/Drasteria maculosa-A-D.jpg`
 * (etc.) resolves on the public CDN.
 *
 * Both source objects already exist on our OWN bunny CDN (they were migrated
 * from the legacy site under the (mislabeled) `drasteria-nubicola` slug long
 * ago) and are served publicly with no credentials required:
 *   https://moths.pnwinsects.org/drasteria-nubicola/Drasteria%20nubicola-A-D.jpg
 *   https://moths.pnwinsects.org/drasteria-nubicola/Drasteria%20nubicola-A-V.jpg
 * So the READ side of this migration needs no credentials at all — only the
 * WRITE (PUT to the new canonical path) needs BUNNY_STORAGE_PASSWORD. This
 * script downloads from the public CDN pull zone (curl, no auth) and re-uploads
 * to the new path (curl PUT with AccessKey). It never deletes or modifies the
 * old `drasteria-nubicola/` objects — the migration is purely additive, and the
 * retirement is recorded in data/cdn-retired-images.csv.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/migrate-drasteria-maculosa-photos.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-drasteria-maculosa-photos.ts
 *
 * BUNNY_STORAGE_PASSWORD: Storage Zone password (bunny.net → pnwmoths zone →
 * FTP & API Access → Password). Only the real PUT needs it; DRY_RUN previews
 * without any network calls at all.
 * Requires: curl CLI.
 */

import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Env constants (mirrors migrate-legacy-photos.ts / upload-images.ts).
// ---------------------------------------------------------------------------

const CDN_BASE_URL = 'https://moths.pnwinsects.org';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';

/** The two objects being copied, in old (mislabeled) -> new (canonical) form. */
export const MIGRATIONS: ReadonlyArray<{
  oldSlug: string; oldFilename: string; newSlug: string; newFilename: string;
}> = [
  { oldSlug: 'drasteria-nubicola', oldFilename: 'Drasteria nubicola-A-D.jpg', newSlug: 'drasteria-maculosa', newFilename: 'Drasteria maculosa-A-D.jpg' },
  { oldSlug: 'drasteria-nubicola', oldFilename: 'Drasteria nubicola-A-V.jpg', newSlug: 'drasteria-maculosa', newFilename: 'Drasteria maculosa-A-V.jpg' },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Redact BUNNY_STORAGE_PASSWORD from an error message. Verbatim pattern from upload-images.ts. */
function redact(msg: string): string {
  return BUNNY_STORAGE_PASSWORD ? msg.replace(new RegExp(BUNNY_STORAGE_PASSWORD, 'g'), '[REDACTED]') : msg;
}

/** Five-attempt exponential backoff (2/4/8/16/32s). Verbatim pattern from upload-images.ts. */
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
      console.log(`[migrate-drasteria-maculosa-photos] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safeMsg}`);
      await sleep(delays[attempt]!);
    }
  }
  throw new Error(`${label}: unreachable`);
}

// ---------------------------------------------------------------------------
// Pure URL helpers — exported for unit tests.
// ---------------------------------------------------------------------------

/** Public CDN read URL for the existing (old or new) object; no API key needed. */
export function cdnReadUrl(slug: string, filename: string): string {
  return `${CDN_BASE_URL}/${slug}/${encodeURIComponent(filename)}`;
}

/** Storage-zone PUT URL for the new canonical object. Filename is URL-encoded. */
export function newStorageUrl(slug: string, filename: string): string {
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${slug}/${encodeURIComponent(filename)}`;
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
  console.log(`[migrate-drasteria-maculosa-photos] ${MIGRATIONS.length} object(s) to copy (#156)`);

  if (!DRY_RUN && !BUNNY_STORAGE_PASSWORD) {
    console.error('[migrate-drasteria-maculosa-photos] BUNNY_STORAGE_PASSWORD required for a real run (bunny.net → pnwmoths zone → FTP & API Access → Password).');
    console.error('[migrate-drasteria-maculosa-photos] Use DRY_RUN=1 to preview without a key.');
    process.exit(1);
  }

  const stats = { copied: 0, skipped: 0, failed: 0 };
  let tmpDir: string | undefined;

  try {
    if (!DRY_RUN) {
      tmpDir = await mkdtemp(join(tmpdir(), 'drasteria-maculosa-'));
    }

    for (const { oldSlug, oldFilename, newSlug, newFilename } of MIGRATIONS) {
      const oldUrl = cdnReadUrl(oldSlug, oldFilename);
      const newUrl = cdnReadUrl(newSlug, newFilename);

      // Idempotency: skip anything already on the CDN under the new canonical name.
      if (isOnCdn(newSlug, newFilename)) {
        stats.skipped++;
        console.log(`[migrate-drasteria-maculosa-photos] already present: ${newSlug}/${newFilename}`);
        continue;
      }

      if (DRY_RUN) {
        stats.copied++; // "would copy"
        console.log(`  COPY  ${oldSlug}/${oldFilename}  ->  ${newSlug}/${newFilename}`);
        console.log(`        source (no auth): ${oldUrl}`);
        console.log(`        target (write):    ${newUrl}`);
        continue;
      }

      const localPath = join(tmpDir!, newFilename);
      try {
        await withRetry(
          () => execFileSync('curl', ['-s', '-S', '-f', '-o', localPath, oldUrl], { stdio: ['pipe', 'pipe', 'inherit'] }),
          `download ${oldSlug}/${oldFilename}`,
        );
        await withRetry(
          () => execFileSync('curl', [
            '-s', '-S', '-f',
            '-X', 'PUT',
            '-H', `AccessKey: ${BUNNY_STORAGE_PASSWORD}`,
            '-H', 'Content-Type: image/jpeg',
            '--data-binary', `@${localPath}`,
            newStorageUrl(newSlug, newFilename),
          ], { stdio: ['pipe', 'pipe', 'inherit'] }),
          `upload ${newSlug}/${newFilename}`,
        );
        stats.copied++;
        console.log(`[migrate-drasteria-maculosa-photos] copied: ${oldSlug}/${oldFilename} -> ${newSlug}/${newFilename}`);
      } catch (err) {
        stats.failed++;
        console.error(`[migrate-drasteria-maculosa-photos] failed: ${oldSlug}/${oldFilename} -> ${newSlug}/${newFilename} — ${redact((err as Error).message)}`);
      } finally {
        try { await rm(localPath, { force: true }); } catch { /* best-effort cleanup */ }
      }
    }
  } finally {
    if (tmpDir) {
      try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    }
  }

  console.log('');
  console.log('[migrate-drasteria-maculosa-photos] summary:');
  console.log(`  ${DRY_RUN ? 'would copy' : 'copied'}: ${stats.copied}`);
  console.log(`  skipped (already on CDN): ${stats.skipped}`);
  if (!DRY_RUN) console.log(`  failed: ${stats.failed}`);
  if (stats.failed > 0) process.exit(1);
}

// Self-invocation guard. Uses pathToFileURL (not a bare `file://${argv[1]}` string
// concatenation) so it resolves correctly on Windows, where process.argv[1] uses
// backslashes and import.meta.url uses a normalized forward-slash file:// form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(redact((err as Error).message)); process.exit(1); });
}
