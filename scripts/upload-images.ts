/**
 * scripts/upload-images.ts
 *
 * Phase 43 (v4.0 character illustration images): idempotent vips→WebP→curl-PUT
 * uploader for Lucid key character illustrations.
 *
 * Walks the local Lucid key media Images/ directory, keeps only the ~191 genuine
 * character illustrations (filtering out ~1,812 specimen photos via the layered
 * isCharacterIllustration filter), converts each to WebP at original dimensions via
 * `vips webpsave` (no resize — D-03), and PUTs to `key-images/` on the bunny
 * `pnwmoths` Storage Zone.
 *
 * Idempotency (SC1): At startup, fetches the bunny Storage Zone directory listing
 * for `key-images/`. If the listing parse succeeds, already-present objects are
 * skipped without a PUT. If the listing fails or returns an unexpected shape,
 * falls back to a per-file HEAD check before each PUT. Either way, a rerun with
 * everything already uploaded makes ZERO new PUTs/uploads (SC1).
 *
 * Usage:
 *   DRY_RUN=1 node scripts/upload-images.ts               # print plan, zero API calls
 *   BUNNY_API_KEY=... node scripts/upload-images.ts        # real upload run
 *
 * BUNNY_API_KEY: Storage Zone password from bunny.net dashboard → pnwmoths
 * Storage Zone → FTP & API Access → Password. Never commit, log, or hardcode.
 *
 * Requires: curl CLI, vips CLI (brew install vips).
 */

import { join } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { mkdtemp, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention; mirrors upload-tiles.ts).
// ---------------------------------------------------------------------------

const SOURCE_DIR: string =
  process.env['KEY_IMAGES_SRC'] ??
  '/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key media/Images';
const CDN_BASE_URL = 'https://moths.pnwinsects.org';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_API_KEY: string = process.env['BUNNY_API_KEY'] ?? '';

// ---------------------------------------------------------------------------
// Helpers — verbatim copies from upload-tiles.ts (project convention).
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Redact BUNNY_API_KEY from an error message. Verbatim from upload-tiles.ts:73-77.
 * Guard against the empty-key edge case: new RegExp('', 'g') matches every
 * position and would corrupt error text. When key is empty, returns original message.
 */
function redact(msg: string): string {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}

/**
 * Five-attempt exponential backoff (2s/4s/8s/16s/32s). Non-retriable 4xx
 * errors bail immediately. Verbatim from upload-tiles.ts:84-105.
 */
async function withRetry<T>(fn: () => T | Promise<T>, label: string): Promise<T> {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safeMsg = redact((err as Error).message ?? String(err));
      if ((err as { retriable?: boolean }).retriable === false) {
        throw new Error(`${label} failed (non-retriable): ${safeMsg}`);
      }
      if (attempt === delays.length - 1) {
        throw new Error(`${label} failed after ${delays.length} attempts: ${safeMsg}`);
      }
      console.log(
        `[upload-images] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safeMsg}`
      );
      await sleep(delays[attempt]!);
    }
  }
  // Unreachable — the loop either returns from fn() or throws on the final attempt.
  throw new Error(`${label}: unreachable`);
}

// ---------------------------------------------------------------------------
// Exported helpers (mirroring upload-tiles.ts exporting tileUploadPath /
// isUploadable for unit tests — each function here is exercised by upload-images.test.ts).
// ---------------------------------------------------------------------------

/**
 * The specimen-photo exclusion regex. Matches the canonical binomial-prefix pattern
 * `Genus species.*-ViewCode-ViewCode.jpg` used for specimen photos in the Lucid export.
 * Combined with EXTRA_EXCLUDES below this forms the complete D-02 layered filter.
 * (RESEARCH Pitfall 4: matches the strict capitalized-Genus / lowercase-species /
 * uppercase -A-D view-code suffix.)
 *
 * The stem is case-SENSITIVE on purpose: a blanket /i flag also made `[A-Z][a-z]+`
 * and `-[A-Z]-[A-Z]` case-insensitive, which would wrongly exclude a genuine
 * character illustration named like `forewing dash-a-b.jpg`. Only the file
 * extension is matched case-insensitively (so `.JPG`/`.JPEG` specimen photos are
 * still caught).
 */
const SPECIMEN_RE = /^[A-Z][a-z]+[ -][a-z]+.*-[A-Z]-[A-Z]\.[jJ][pP][eE]?[gG]$/;

/**
 * Explicit exclude set for the 6 enumerated binomial-prefixed specimen photos that
 * slip through SPECIMEN_RE due to irregular naming (space-vs-hyphen, single view
 * code, uppercase .JPG). RESEARCH Pitfall 4.
 */
const EXTRA_EXCLUDES = new Set([
  'Annaphila miona-A D.jpg',
  'Drasteria parallela-D.jpg',
  'Euxoa absona A-D.jpg',
  'Euxoa lucida A-D.jpg',
  'Euxoa lucida B-D.jpg',
  'Grammia yukona-A-D.JPG',
]);

/**
 * Returns true if `filename` is a genuine Lucid key character illustration.
 *
 * Layered filter (D-02):
 *  1. Must have a .jpg or .jpeg extension (case-insensitive).
 *  2. Must NOT match SPECIMEN_RE (binomial-prefix specimen photos).
 *  3. Must NOT be in EXTRA_EXCLUDES (the 6 irregular specimen-photo leaks).
 *
 * Exported for unit tests (mirrors upload-tiles.ts exporting isUploadable).
 */
export function isCharacterIllustration(filename: string): boolean {
  if (!/\.jpe?g$/i.test(filename)) return false;
  if (SPECIMEN_RE.test(filename)) return false;
  if (EXTRA_EXCLUDES.has(filename)) return false;
  return true;
}

/**
 * Convert a source JPEG filename to the corresponding WebP CDN object name.
 *
 * This is the SINGLE canonical rule (RESEARCH Pitfall 6 — toWebpName() used by
 * BOTH the uploader and the matcher so `.jpg`→`.webp` never drifts across CSV /
 * CDN object / `<img src>`). Case-insensitive extension replacement.
 *
 * Exported for unit tests and imported by match-character-images.ts.
 */
export function toWebpName(jpg: string): string {
  return jpg.replace(/\.jpe?g$/i, '.webp');
}

/**
 * Build the bunny Storage Zone PUT URL for a given WebP object name.
 *
 * Returns `https://{BUNNY_STORAGE_HOST}/{BUNNY_ZONE}/key-images/<encodeURIComponent(webpName)>`.
 * This is the D-04 `key-images/` CDN layout. The filename is URL-encoded because
 * many character illustration names contain spaces, commas, and other special characters
 * (RESEARCH Pitfall 7).
 *
 * Exported for unit tests.
 */
export function keyImageStorageUrl(webpName: string): string {
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/key-images/${encodeURIComponent(webpName)}`;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Walk source directory, keep only genuine character illustrations (D-01, D-02). ---
  if (!existsSync(SOURCE_DIR)) {
    console.error(`[upload-images] source dir not found: ${SOURCE_DIR}`);
    console.error('[upload-images] set KEY_IMAGES_SRC to override the default path.');
    process.exit(1);
  }

  const allFiles = readdirSync(SOURCE_DIR);
  const keptFiles = allFiles.filter(isCharacterIllustration);

  console.log(
    `[upload-images] source: ${SOURCE_DIR}`
  );
  console.log(
    `[upload-images] ${allFiles.length} total files; ${keptFiles.length} character illustrations kept`
  );

  // --- DRY_RUN path: print upload plan and return — ZERO API calls (SC1, D-04). ---
  // Must come BEFORE the !BUNNY_API_KEY guard so DRY_RUN=1 works without a key.
  if (DRY_RUN) {
    console.log('[upload-images] DRY_RUN=1 — printing upload plan; no curl/vips calls.');
    console.log('[upload-images] A real run will skip any file already present on the CDN (SC1: zero new PUTs on rerun).');
    console.log('');
    for (const filename of keptFiles) {
      const webpName = toWebpName(filename);
      const cdnReadUrl = `${CDN_BASE_URL}/key-images/${encodeURIComponent(webpName)}`;
      console.log(`  ${filename}`);
      console.log(`    → CDN: ${cdnReadUrl}`);
    }
    console.log('');
    console.log(`[upload-images] ${keptFiles.length} files would be converted + uploaded (skipping any already on CDN).`);
    return;
  }

  // --- Missing-secret guard. ---
  if (!BUNNY_API_KEY) {
    console.error(
      '[upload-images] BUNNY_API_KEY is required. Set it to your bunny.net Storage Zone password.'
    );
    console.error('[upload-images] bunny.net dashboard → Storage → pnwmoths zone → FTP & API Access → Password');
    process.exit(1);
  }

  // --- Idempotency: fetch the directory listing to build a Set of existing objects. ---
  // (RESEARCH Pitfall 3 / D-04 SC1). One GET at startup; skip PUT for any name already present.
  // If the listing fails or returns an unexpected shape, fall back to per-file HEAD checks.
  const listingUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/key-images/`;
  let existingNames: Set<string> | null = null;

  try {
    const listOutput = execFileSync('curl', [
      '-s', '-S', '-f',
      '-H', `AccessKey: ${BUNNY_API_KEY}`,
      listingUrl,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const listJson = JSON.parse(listOutput.toString()) as unknown;
    if (
      Array.isArray(listJson) &&
      listJson.every(item => typeof item === 'object' && item !== null && 'ObjectName' in item)
    ) {
      existingNames = new Set(
        (listJson as Array<{ ObjectName: string }>).map(item => item.ObjectName)
      );
      console.log(`[upload-images] directory listing: ${existingNames.size} objects already on CDN`);
    } else {
      console.log(
        '[upload-images] directory listing returned unexpected shape — falling back to per-file HEAD checks'
      );
      console.log('[upload-images] listing response (first 200 chars):', JSON.stringify(listJson).slice(0, 200));
    }
  } catch (err) {
    const safeMsg = redact((err as Error).message ?? String(err));
    console.log(`[upload-images] directory listing failed (${safeMsg}) — falling back to per-file HEAD checks`);
  }

  // --- Stats counters. ---
  const stats = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
  };

  // --- Create a temp dir for WebP conversions. ---
  const tmpDir = await mkdtemp(join(tmpdir(), 'pnwmoths-upload-images-'));

  try {
    for (const filename of keptFiles) {
      const webpName = toWebpName(filename);
      const sourceJpg = join(SOURCE_DIR, filename);
      const tmpWebpPath = join(tmpDir, webpName);
      const storageUrl = keyImageStorageUrl(webpName);

      try {
        // --- Check if already present on CDN (idempotency). ---
        let alreadyPresent = false;

        if (existingNames !== null) {
          // Fast path: check the startup listing.
          alreadyPresent = existingNames.has(webpName);
        } else {
          // Fallback path: per-file HEAD check (acceptable — SC1 counts PUTs, not HEADs).
          // Capture the HTTP status explicitly (no -f) so a transient 5xx / network
          // failure is retried rather than mistaken for a 404 — otherwise a degraded
          // run would re-PUT files that already exist, breaking SC1.
          const code = await withRetry(() => {
            const out = execFileSync('curl', [
              '-s', '-S', '-o', '/dev/null', '-w', '%{http_code}', '-I',
              '-H', `AccessKey: ${BUNNY_API_KEY}`,
              storageUrl,
            ], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
            const status = Number(out);
            // 000 = no HTTP response (network failure); 5xx = server hiccup — both retriable.
            if (status === 0 || (status >= 500 && status < 600)) {
              throw new Error(`HEAD got transient status ${out}`);
            }
            return status;
          }, `HEAD ${webpName}`);
          // 2xx → present (skip); 404/4xx → absent (upload).
          alreadyPresent = code >= 200 && code < 300;
        }

        if (alreadyPresent) {
          stats.skipped++;
          continue;
        }

        // --- Convert JPEG to WebP at original dimensions via vips (D-03, no resize). ---
        // argv-array form required because source names contain spaces (RESEARCH T-43-03 / tile-photos.ts:250-253).
        execFileSync('vips', [
          'webpsave',
          sourceJpg,
          tmpWebpPath,
          '--Q', '82',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        // --- PUT the WebP to bunny Storage (D-04). ---
        await withRetry(
          () => execFileSync('curl', [
            '-s', '-S', '-f',
            '-X', 'PUT',
            '-H', `AccessKey: ${BUNNY_API_KEY}`,
            '-H', 'Content-Type: image/webp',
            '--data-binary', `@${tmpWebpPath}`,
            storageUrl,
          ], { stdio: ['pipe', 'pipe', 'inherit'] }),
          `upload ${webpName}`
        );

        stats.uploaded++;
        console.log(`[upload-images] uploaded: ${webpName}`);

        // --- Clean up temp WebP after upload. ---
        await unlink(tmpWebpPath).catch(() => { /* ignore cleanup errors */ });

      } catch (err) {
        const safeMsg = redact((err as Error).message ?? String(err));
        stats.failed++;
        console.error(`[upload-images] failed: ${webpName} — ${safeMsg}`);
        // Best-effort cleanup of temp file on failure.
        await unlink(tmpWebpPath).catch(() => { /* ignore */ });
      }
    }
  } finally {
    // Best-effort cleanup of temp dir.
    try {
      const remaining = readdirSync(tmpDir);
      for (const f of remaining) {
        await unlink(join(tmpDir, f)).catch(() => { /* ignore */ });
      }
    } catch { /* ignore */ }
  }

  // Final summary (tail-friendly, mirroring upload-tiles.ts).
  console.log('');
  console.log('[upload-images] summary:');
  console.log(`  uploaded (new):         ${stats.uploaded}`);
  console.log(`  skipped (already on CDN): ${stats.skipped}`);
  console.log(`  failed:                 ${stats.failed}`);
  console.log(`  total kept illustrations: ${keptFiles.length}`);

  if (stats.failed > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — verbatim from upload-tiles.ts:417-419.
// Prevents main() from running when the test file imports the exports above.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(redact((err as Error).message)); process.exit(1); });
}
