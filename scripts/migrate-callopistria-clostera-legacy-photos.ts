/**
 * scripts/migrate-callopistria-clostera-legacy-photos.ts
 *
 * One-off migration for issue #156: ingest the genuine, curator-confirmed legacy
 * low-res photos for `callopistria-floridensis` (specimen A, dorsal+ventral) and
 * the narrow-sense `clostera-brucei` (specimen C, dorsal+ventral) directly from
 * the still-live legacy WWU site, rather than waiting on the separate high-res
 * Dropbox pipeline (tracked independently in data/species-photos-manifest.csv —
 * both pairs are already `clean-match`/`discovered` there for a future high-res
 * upgrade).
 *
 * Both legacy factsheets confirm these are the correct, curator-attributed
 * photos (photographer Merrill A. Peterson, specimen courtesy of LGCC):
 *   https://pnwmoths.biol.wwu.edu/browse/family-noctuidae/subfamily-eriopinae/callopistria/callopistria-floridensis/
 *   https://pnwmoths.biol.wwu.edu/browse/family-notodontidae/subfamily-pygaerinae/clostera/clostera-brucei/
 *
 * data/images.csv has already been updated with the canonical (space-separated)
 * filenames; this script performs the actual CDN upload. The legacy site serves
 * the originals under underscore-separated filenames (old-CMS convention) at
 * `/media/moths/<Genus_species-specimen-view>.jpg` with NO credentials required
 * (a plain public GET) — only the bunny PUT (write) needs BUNNY_STORAGE_PASSWORD.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/migrate-callopistria-clostera-legacy-photos.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-callopistria-clostera-legacy-photos.ts
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
// Env constants (mirrors migrate-drasteria-maculosa-photos.ts).
// ---------------------------------------------------------------------------

const LEGACY_BASE_URL = 'https://pnwmoths.biol.wwu.edu/media/moths';
const CDN_BASE_URL = 'https://moths.pnwinsects.org';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';

/** The four objects being ingested: legacy underscore filename -> canonical CDN slug/filename. */
export const MIGRATIONS: ReadonlyArray<{
  legacyFilename: string; slug: string; canonicalFilename: string;
}> = [
  { legacyFilename: 'Callopistria_floridensis-A-D.jpg', slug: 'callopistria-floridensis', canonicalFilename: 'Callopistria floridensis-A-D.jpg' },
  { legacyFilename: 'Callopistria_floridensis-A-V.jpg', slug: 'callopistria-floridensis', canonicalFilename: 'Callopistria floridensis-A-V.jpg' },
  { legacyFilename: 'Clostera_brucei-C-D.jpg', slug: 'clostera-brucei', canonicalFilename: 'Clostera brucei-C-D.jpg' },
  { legacyFilename: 'Clostera_brucei-C-V.jpg', slug: 'clostera-brucei', canonicalFilename: 'Clostera brucei-C-V.jpg' },
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
      console.log(`[migrate-callopistria-clostera-legacy-photos] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safeMsg}`);
      await sleep(delays[attempt]!);
    }
  }
  throw new Error(`${label}: unreachable`);
}

// ---------------------------------------------------------------------------
// Pure URL helpers — exported for unit tests.
// ---------------------------------------------------------------------------

/** Public legacy WWU site read URL; no API key needed (plain public GET). */
export function legacyReadUrl(legacyFilename: string): string {
  return `${LEGACY_BASE_URL}/${encodeURIComponent(legacyFilename)}`;
}

/** Public CDN read URL for the canonical object; no API key needed. */
export function cdnReadUrl(slug: string, filename: string): string {
  return `${CDN_BASE_URL}/${slug}/${encodeURIComponent(filename)}`;
}

/** Storage-zone PUT URL for the canonical object. Filename is URL-encoded. */
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
  console.log(`[migrate-callopistria-clostera-legacy-photos] ${MIGRATIONS.length} object(s) to ingest (#156)`);

  if (!DRY_RUN && !BUNNY_STORAGE_PASSWORD) {
    console.error('[migrate-callopistria-clostera-legacy-photos] BUNNY_STORAGE_PASSWORD required for a real run (bunny.net → pnwmoths zone → FTP & API Access → Password).');
    console.error('[migrate-callopistria-clostera-legacy-photos] Use DRY_RUN=1 to preview without a key.');
    process.exit(1);
  }

  const stats = { uploaded: 0, skipped: 0, failed: 0 };
  let tmpDir: string | undefined;

  try {
    if (!DRY_RUN) {
      tmpDir = await mkdtemp(join(tmpdir(), 'callopistria-clostera-'));
    }

    for (const { legacyFilename, slug, canonicalFilename } of MIGRATIONS) {
      const srcUrl = legacyReadUrl(legacyFilename);
      const dstUrl = cdnReadUrl(slug, canonicalFilename);

      // Idempotency: skip anything already on the CDN under the canonical name.
      if (isOnCdn(slug, canonicalFilename)) {
        stats.skipped++;
        console.log(`[migrate-callopistria-clostera-legacy-photos] already present: ${slug}/${canonicalFilename}`);
        continue;
      }

      if (DRY_RUN) {
        stats.uploaded++; // "would upload"
        console.log(`  PUT  ${slug}/${canonicalFilename}  (from legacy ${legacyFilename})`);
        console.log(`       source (no auth): ${srcUrl}`);
        console.log(`       target (write):    ${dstUrl}`);
        continue;
      }

      const localPath = join(tmpDir!, canonicalFilename);
      try {
        await withRetry(
          () => execFileSync('curl', ['-s', '-S', '-f', '-o', localPath, srcUrl], { stdio: ['pipe', 'pipe', 'inherit'] }),
          `download ${legacyFilename}`,
        );
        await withRetry(
          () => execFileSync('curl', [
            '-s', '-S', '-f',
            '-X', 'PUT',
            '-H', `AccessKey: ${BUNNY_STORAGE_PASSWORD}`,
            '-H', 'Content-Type: image/jpeg',
            '--data-binary', `@${localPath}`,
            newStorageUrl(slug, canonicalFilename),
          ], { stdio: ['pipe', 'pipe', 'inherit'] }),
          `upload ${slug}/${canonicalFilename}`,
        );
        stats.uploaded++;
        console.log(`[migrate-callopistria-clostera-legacy-photos] uploaded: ${slug}/${canonicalFilename} (from legacy ${legacyFilename})`);
      } catch (err) {
        stats.failed++;
        console.error(`[migrate-callopistria-clostera-legacy-photos] failed: ${slug}/${canonicalFilename} — ${redact((err as Error).message)}`);
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
  console.log('[migrate-callopistria-clostera-legacy-photos] summary:');
  console.log(`  ${DRY_RUN ? 'would upload' : 'uploaded'}: ${stats.uploaded}`);
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
