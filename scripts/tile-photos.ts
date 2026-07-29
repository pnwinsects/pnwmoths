/**
 * scripts/tile-photos.ts
 *
 * Phase 29 (v2.2 high-res photos): bulk DZI tile generation pipeline.
 * Reads data/species-photos-manifest.csv, filters eligible rows, downloads
 * source TIFFs from Dropbox (if not already cached), and invokes `vips dzsave`
 * to produce DZI tile pyramids in the configured tileOutputDir.
 *
 * Usage:
 *   DROPBOX_TOKEN=sl.... node scripts/tile-photos.ts
 *   DRY_RUN=1 node scripts/tile-photos.ts                       # prints first 5 eligible rows, no fetch, no vips, no manifest write
 *   TILE_OUTPUT_DIR=/mnt/tiles TIFF_CACHE_DIR=/mnt/tiffs node scripts/tile-photos.ts
 *
 * THUMBNAIL_ONLY mode — backfill missing thumbnails for already-uploaded rows:
 *   DROPBOX_TOKEN=sl.... BUNNY_STORAGE_PASSWORD=... THUMBNAIL_ONLY=1 node scripts/tile-photos.ts
 *   DRY_RUN=1 THUMBNAIL_ONLY=1 node scripts/tile-photos.ts      # dry-run thumbnail backfill
 *
 * In THUMBNAIL_ONLY mode the script targets rows with status=uploaded, downloads
 * each TIFF, generates only the thumbnail (no dzsave), uploads it to the CDN,
 * then deletes the TIFF. Manifest status is not changed. CDN PUT is idempotent
 * so the run can be safely re-run from the beginning after an interruption.
 *
 * Resume after interruption: re-run the same command. Rows with status=tiled
 * are skipped; rows whose TIFF is already cached skip the download stage.
 * The manifest is written every 25 rows so a kill -9 loses at most 24 rows
 * of in-memory progress (OPS-03, carried from Phase 26).
 *
 * DROPBOX_TOKEN: Dropbox app access token with files.content.read scope.
 * Generate at https://www.dropbox.com/developers/apps. Never commit, log, or hardcode.
 *
 * Requires: vips CLI (libvips-tools). Confirm with `vips --version`.
 *   macOS:         brew install vips
 *   Debian/Ubuntu: sudo apt install libvips-tools
 */

import { resolve, join, dirname } from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { ManifestRow, ManifestStatus } from './lib/manifest.ts';
import { readManifest, writeManifest, advanceStatus } from './lib/manifest.ts';
import type { MatchBucket } from './lib/parse-photo-filename.ts';
import { downloadSharedFile } from './lib/dropbox-download.ts';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention; D-10 env-vars-at-invocation;
// mirrors scripts/ingest-photos.ts:36-46).
// ---------------------------------------------------------------------------

const MANIFEST_PATH: string = resolve('data/species-photos-manifest.csv');
const TILE_CONFIG_PATH: string = resolve('scripts/tile-config.json');
const DROPBOX_TOKEN: string = process.env['DROPBOX_TOKEN'] ?? '';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const TILE_OUTPUT_DIR_OVERRIDE: string = process.env['TILE_OUTPUT_DIR'] ?? '';
const TIFF_CACHE_DIR_OVERRIDE: string = process.env['TIFF_CACHE_DIR'] ?? '';
const THUMBNAIL_ONLY: boolean = process.env['THUMBNAIL_ONLY'] === '1';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';

/**
 * The three match_bucket values for which a row is a tiling candidate.
 * All three have a resolved species_slug and a non-empty dropbox_path.
 * Rows outside these buckets (genus-only, likely-synonym, unparseable,
 * provisional) need curation before they can be tiled.
 *
 * Typed as Set<MatchBucket> to enforce the union at compile time (D-09).
 */
const TILEABLE_BUCKETS: Set<MatchBucket> = new Set([
  'clean-match',
  'slug-match',
  'resolved-via-synonym',
]);

// ---------------------------------------------------------------------------
// Helpers — copied verbatim from scripts/ingest-photos.ts where indicated.
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Redact DROPBOX_TOKEN from an error message. Mirrors scripts/ingest-photos.ts:redact
 * verbatim — this is the project-wide secret-redaction idiom (CONTEXT.md
 * "Specifics", 26-PATTERNS.md "Shared Patterns §2", T-26.03-01).
 *
 * Guard against the empty-token edge case: `new RegExp('', 'g')` matches every
 * position in the string and would corrupt error text into a chain of
 * "[REDACTED]" markers. When the token is empty (DRY_RUN path, etc.), the
 * original message is returned unchanged.
 */
function redact(msg: string): string {
  let out = DROPBOX_TOKEN ? msg.replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]') : msg;
  out = BUNNY_STORAGE_PASSWORD ? out.replace(new RegExp(BUNNY_STORAGE_PASSWORD, 'g'), '[REDACTED]') : out;
  return out;
}

/**
 * D-15 retry-with-backoff. Five attempts at 2s/4s/8s/16s/32s (total 62s) before
 * giving up. Adapted from scripts/ingest-photos.ts:withRetry — same shape, with
 * the redaction step lifted out into `redact()` and applied to every error so
 * the token never leaks via logs or thrown messages.
 *
 * The final throw surfaces a redacted Error so the caller (main()) can record
 * status=failed and move on without crashing the run (OPS-02).
 */
async function withRetry<T>(fn: () => T | Promise<T>, label: string): Promise<T> {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safeMsg = redact((err as Error).message ?? String(err));
      // Non-retriable errors (e.g. 4xx client errors) must not be retried —
      // they indicate a permanent configuration problem (wrong scope, bad token).
      if ((err as { retriable?: boolean }).retriable === false) {
        throw new Error(`${label} failed (non-retriable): ${safeMsg}`);
      }
      if (attempt === delays.length - 1) {
        throw new Error(`${label} failed after ${delays.length} attempts: ${safeMsg}`);
      }
      console.log(
        `[tile-photos] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safeMsg}`
      );
      await sleep(delays[attempt]!);
    }
  }
  // Unreachable — the loop either returns from `fn()` or throws on the final attempt.
  throw new Error(`${label}: unreachable`);
}

/**
 * D-15 per-stage log line: ISO timestamp, content_hash prefix (12 chars,
 * padded), action (16-char field), outcome, optional extra context.
 * Written to stdout so tmux tail-following sees it interleaved with retry
 * messages.
 */
function logStage(content_hash: string, action: string, outcome: string, extra = ''): void {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}

// ---------------------------------------------------------------------------
// Tile-specific exported helpers (export so tests can import them directly).
// ---------------------------------------------------------------------------

/**
 * Compute the vips dzsave output prefix for a manifest row.
 *
 * vips writes `{prefix}.dzi` (descriptor) and `{prefix}_files/` (tile pyramid).
 * The last path component must be `{specimen_id}-{view}` so the storage layout
 * `species-tiles/{slug}/{specimen_id}-{view}/` is mirrored on disk.
 *
 * species_slug is lowercased unconditionally — Phase 28 lesson: TIFF filenames
 * preserve mixed-case genus but tile directories and CDN paths MUST be lowercase.
 */
export function tilePrefix(tileOutputDir: string, row: ManifestRow): string {
  return join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`);
}

/**
 * Compute the local TIFF cache path for a manifest row.
 *
 * Content-hash prefix makes cache hits deterministic across renames;
 * appending filename_raw makes the file human-recognizable when the
 * operator inspects the cache directory with `ls`.
 */
export function tiffCachePath(tiffCacheDir: string, row: ManifestRow): string {
  return join(tiffCacheDir, row.content_hash + '-' + row.filename_raw);
}

/**
 * Returns true if the .dzi file for this row already exists on disk.
 *
 * This is the filesystem-level idempotency guard (TILE-02). It catches rows
 * whose tiles were generated in a prior interrupted run before the manifest
 * was updated to status=tiled.
 */
export function isAlreadyTiled(tileOutputDir: string, row: ManifestRow): boolean {
  return existsSync(`${tilePrefix(tileOutputDir, row)}.dzi`);
}

/**
 * Returns true if the row should be processed in this run.
 *
 * A row is tileable when ALL of the following hold:
 *   - status is not already 'tiled' (manifest-level idempotency guard, TILE-02)
 *   - match_bucket is one of the three resolved buckets (clean-match, slug-match,
 *     resolved-via-synonym) — other buckets need curation before tiling
 *   - specimen_id, view, species_slug, dropbox_path are all non-empty — absence
 *     of any field makes either the output path or the download call impossible
 */
export function isTileable(row: ManifestRow): boolean {
  return (
    row.status !== 'tiled' &&
    TILEABLE_BUCKETS.has(row.match_bucket as MatchBucket) &&
    Boolean(row.specimen_id) &&
    Boolean(row.view) &&
    Boolean(row.species_slug) &&
    Boolean(row.dropbox_path)
  );
}

/**
 * Returns true if the row needs a thumbnail backfill (THUMBNAIL_ONLY mode).
 *
 * Targets rows that are fully uploaded (tiles on CDN) but whose thumbnail was
 * never generated — this happens when runVipsThumbnail was added to the script
 * after the bulk tile run had already advanced all rows to status=uploaded.
 *
 * Same field requirements as isTileable since the same download + vips steps
 * apply; status=uploaded is the only difference.
 */
export function isMissingThumbnail(row: ManifestRow): boolean {
  return (
    row.status === 'uploaded' &&
    TILEABLE_BUCKETS.has(row.match_bucket as MatchBucket) &&
    Boolean(row.specimen_id) &&
    Boolean(row.view) &&
    Boolean(row.species_slug) &&
    Boolean(row.dropbox_path)
  );
}

// ---------------------------------------------------------------------------
// vips invocation
// ---------------------------------------------------------------------------

interface TileConfig {
  tileSize: number;
  overlap: number;
  suffix: string;
  layout: string;
  thumbnailWidth: number;
  tileOutputDir: string;
  tiffCacheDir: string;
  dropboxShareUrl: string;
}

/**
 * Invoke `vips dzsave` synchronously to produce a DZI tile pyramid.
 *
 * The argv array is constructed from the config object so the committed
 * scripts/tile-config.json is the single source of truth for tile parameters
 * (TILE-03 — deterministic across reruns). Changing tile-config.json and
 * rerunning produces deterministically different output without code changes.
 *
 * execFileSync with an argv array (not a shell string) means vips receives the
 * source TIFF path as a discrete argument, which handles filenames containing
 * spaces correctly without quoting acrobatics. Phase 26 TIFF names contain
 * spaces (e.g. "Abagrotis apposita-A-D.tif") — this is the correct approach.
 */
function runVipsDzsave(sourceTiff: string, prefix: string, config: TileConfig): void {
  execFileSync('vips', [
    'dzsave',
    sourceTiff + '[unlimited]',
    prefix,
    '--tile-size', String(config.tileSize),
    '--overlap', String(config.overlap),
    '--suffix', config.suffix,
    '--layout', config.layout,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * Invoke `vips thumbnail` synchronously to produce a single-file WebP thumbnail.
 *
 * The [unlimited] flag is required for large TIFFs (matches the dzsave pattern
 * above). vips thumbnail auto-computes height to preserve aspect ratio.
 *
 * Output file: `{prefix}_thumbnail.webp`
 */
function runVipsThumbnail(sourceTiff: string, prefix: string, config: TileConfig): void {
  execFileSync('vips', [
    'thumbnail',
    sourceTiff + '[unlimited]',
    `${prefix}_thumbnail.webp`,
    String(config.thumbnailWidth),
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * PUT a single thumbnail file to the bunny.net Storage Zone.
 *
 * Mirrors the thumbnail upload block in upload-tiles.ts verbatim (project
 * convention: self-contained scripts). Throws on non-zero curl exit so the
 * caller's withRetry handles transient failures.
 */
function uploadThumbnailToCdn(localPath: string, row: ManifestRow): void {
  const slug = row.species_slug.toLowerCase();
  const pair = `${row.specimen_id}-${row.view}`;
  const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/species-tiles/${slug}/${pair}_thumbnail.webp`;
  execFileSync('curl', [
    '-s', '-S', '-f',
    '-X', 'PUT',
    '-H', `AccessKey: ${BUNNY_STORAGE_PASSWORD}`,
    '-H', 'Content-Type: image/webp',
    '--data-binary', `@${localPath}`,
    url,
  ], { stdio: ['pipe', 'pipe', 'inherit'] });
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Load config (TILE-03: parameters live in tile-config.json, not the script). ---
  const config = JSON.parse(readFileSync(TILE_CONFIG_PATH, 'utf8')) as TileConfig;

  // --- Resolve runtime dirs: env override takes precedence over config file. ---
  const tileOutputDir: string = TILE_OUTPUT_DIR_OVERRIDE || config.tileOutputDir;
  const tiffCacheDir: string  = TIFF_CACHE_DIR_OVERRIDE  || config.tiffCacheDir;

  // --- Read manifest. ---
  const rows: ManifestRow[] = await readManifest(MANIFEST_PATH);

  // --- THUMBNAIL_ONLY mode: backfill thumbnails for already-uploaded rows. ---
  if (THUMBNAIL_ONLY) {
    await mainThumbnailOnly(rows, config, tileOutputDir, tiffCacheDir);
    return;
  }

  // --- Filter eligible rows. ---
  const eligible = rows.filter(isTileable);

  console.log(
    `[tile-photos] manifest: ${rows.length} rows total; ${eligible.length} eligible for tiling`
  );

  // --- DRY_RUN path: print first 5 eligible rows; exit without side-effects. ---
  if (DRY_RUN) {
    console.log('[tile-photos] DRY_RUN=1 — printing first 5 eligible rows, not invoking fetch or vips, not writing manifest');
    for (const row of eligible.slice(0, 5)) {
      const prefix = tilePrefix(tileOutputDir, row);
      const cachePath = tiffCachePath(tiffCacheDir, row);
      console.log(`  -> tile prefix : ${prefix}`);
      console.log(`     source TIFF : ${cachePath}`);
      console.log(`     dropbox_path: ${row.dropbox_path}`);
      console.log(`     status      : ${row.status}`);
    }
    if (eligible.length > 5) console.log(`  ... (${eligible.length - 5} more)`);
    return;
  }

  // --- Missing-secret guard (matches scripts/ingest-photos.ts format). ---
  if (!DROPBOX_TOKEN) {
    console.error(
      '[tile-photos] DROPBOX_TOKEN is required. Generate a Dropbox app token with files.content.read scope at https://www.dropbox.com/developers/apps'
    );
    process.exit(1);
  }

  // --- Pre-create output directories. ---
  await mkdir(tileOutputDir, { recursive: true });
  await mkdir(tiffCacheDir, { recursive: true });

  // --- Stats counters. ---
  const stats = {
    tiled: 0,
    downloaded: 0,
    skippedAlreadyTiled: 0,
    failed: 0,
  };

  let rowsProcessed = 0;
  let fatal: Error | null = null;

  try {
    for (const row of eligible) {
      // Manifest-level idempotency: status=tiled rows are excluded by isTileable
      // but can appear here if isTileable was overridden by a caller; belt-and-suspenders.
      if (row.status === 'tiled') {
        stats.skippedAlreadyTiled++;
        continue;
      }

      // Filesystem-level idempotency: tiles exist but manifest hadn't caught up.
      if (isAlreadyTiled(tileOutputDir, row) && row.status !== 'tiled') {
        advanceStatus(row, 'tiled');
        logStage(row.content_hash, 'tile', 'already-on-disk-advance', row.species_slug);
        stats.skippedAlreadyTiled++;
        rowsProcessed++;
        if (rowsProcessed % 25 === 0) await writeManifest(MANIFEST_PATH, rows);
        continue;
      }

      let currentStage = 'download';
      try {
        // --- Download stage ---
        const cachePath = tiffCachePath(tiffCacheDir, row);
        if (!existsSync(cachePath)) {
          await withRetry(
            () => downloadSharedFile({
              shareUrl: config.dropboxShareUrl,
              dropboxPath: row.dropbox_path,
              token: DROPBOX_TOKEN,
              destPath: cachePath,
            }),
            `download ${row.content_hash.slice(0, 12)}`
          );
          advanceStatus(row, 'downloaded');
          logStage(row.content_hash, 'download', 'ok', `${row.size_bytes} bytes`);
          stats.downloaded++;
        } else {
          // Cache hit — advance manifest status if it hadn't recorded the download.
          if (row.status === 'discovered') {
            advanceStatus(row, 'downloaded');
          }
          logStage(row.content_hash, 'download', 'cache-hit');
        }

        // --- Tile stage ---
        currentStage = 'tile';
        const prefix = tilePrefix(tileOutputDir, row);
        await mkdir(dirname(prefix), { recursive: true });
        runVipsDzsave(cachePath, prefix, config);
        runVipsThumbnail(cachePath, prefix, config);
        await unlink(cachePath);
        advanceStatus(row, 'tiled');
        logStage(row.content_hash, 'tile', 'ok', `${row.species_slug}/${row.specimen_id}-${row.view}`);
        stats.tiled++;
      } catch (err) {
        const safeMsg = redact((err as Error).message ?? String(err));
        advanceStatus(row, 'failed' as ManifestStatus, { last_error: safeMsg });
        stats.failed++;
        logStage(row.content_hash, currentStage, 'failed', safeMsg);
      }

      rowsProcessed++;
      // Periodic checkpoint write (OPS-03): loses at most 24 rows on kill -9.
      if (rowsProcessed % 25 === 0) await writeManifest(MANIFEST_PATH, rows);
    }
  } catch (fatalErr) {
    fatal = fatalErr as Error;
    console.error(`[tile-photos] fatal error: ${redact((fatalErr as Error).message ?? String(fatalErr))}`);
  } finally {
    // Always write manifest on exit — success or fatal error (mirrors ingest-photos.ts).
    await writeManifest(MANIFEST_PATH, rows);
  }

  // Final summary (OPS-01 tail-friendly).
  console.log('');
  console.log('[tile-photos] summary:');
  console.log(`  tiled (new):                  ${stats.tiled}`);
  console.log(`  downloaded (without re-tile): ${stats.downloaded}`);
  console.log(`  skipped (already tiled):      ${stats.skippedAlreadyTiled}`);
  console.log(`  failed (per-row errors):      ${stats.failed}`);
  console.log(`  total eligible rows:          ${eligible.length}`);
  console.log(`[tile-photos] wrote ${MANIFEST_PATH}`);

  if (fatal) process.exit(1);
}

// ---------------------------------------------------------------------------
// THUMBNAIL_ONLY mode — download TIFF → generate thumbnail → upload → delete
// ---------------------------------------------------------------------------

async function mainThumbnailOnly(
  rows: ManifestRow[],
  config: TileConfig,
  tileOutputDir: string,
  tiffCacheDir: string,
): Promise<void> {
  const eligible = rows.filter(isMissingThumbnail);

  console.log(
    `[tile-photos] THUMBNAIL_ONLY=1 — manifest: ${rows.length} rows total; ${eligible.length} eligible (status=uploaded)`
  );

  if (DRY_RUN) {
    console.log('[tile-photos] DRY_RUN=1 — printing first 5 eligible rows, not invoking fetch, vips, or upload');
    for (const row of eligible.slice(0, 5)) {
      const cachePath = tiffCachePath(tiffCacheDir, row);
      console.log(`  -> ${row.species_slug}/${row.specimen_id}-${row.view}`);
      console.log(`     tiff cache  : ${cachePath}`);
      console.log(`     dropbox_path: ${row.dropbox_path}`);
    }
    if (eligible.length > 5) console.log(`  ... (${eligible.length - 5} more)`);
    return;
  }

  if (!DROPBOX_TOKEN) {
    console.error('[tile-photos] DROPBOX_TOKEN is required for THUMBNAIL_ONLY mode.');
    process.exit(1);
  }
  if (!BUNNY_STORAGE_PASSWORD) {
    console.error('[tile-photos] BUNNY_STORAGE_PASSWORD is required for THUMBNAIL_ONLY mode.');
    process.exit(1);
  }

  await mkdir(tiffCacheDir, { recursive: true });

  const stats = { thumbnailed: 0, failed: 0 };
  let fatal: Error | null = null;

  try {
    for (const row of eligible) {
      const cachePath = tiffCachePath(tiffCacheDir, row);
      const prefix = tilePrefix(tileOutputDir, row);
      const thumbnailPath = `${prefix}_thumbnail.webp`;

      try {
        // --- Download stage ---
        if (!existsSync(cachePath)) {
          await withRetry(
            () => downloadSharedFile({
              shareUrl: config.dropboxShareUrl,
              dropboxPath: row.dropbox_path,
              token: DROPBOX_TOKEN,
              destPath: cachePath,
            }),
            `download ${row.content_hash.slice(0, 12)}`
          );
          logStage(row.content_hash, 'download', 'ok', `${row.size_bytes} bytes`);
        } else {
          logStage(row.content_hash, 'download', 'cache-hit');
        }

        // --- Thumbnail stage ---
        await mkdir(dirname(prefix), { recursive: true });
        runVipsThumbnail(cachePath, prefix, config);
        await unlink(cachePath);
        logStage(row.content_hash, 'thumbnail', 'ok', `${row.species_slug}/${row.specimen_id}-${row.view}`);

        // --- Upload stage ---
        await withRetry(
          () => uploadThumbnailToCdn(thumbnailPath, row),
          `upload ${row.specimen_id}-${row.view}/_thumbnail`
        );
        await unlink(thumbnailPath);
        logStage(row.content_hash, 'upload', 'ok', `${row.species_slug}/${row.specimen_id}-${row.view}`);

        stats.thumbnailed++;
      } catch (err) {
        const safeMsg = redact((err as Error).message ?? String(err));
        stats.failed++;
        logStage(row.content_hash, 'thumbnail', 'failed', safeMsg);
        if (existsSync(cachePath)) await unlink(cachePath);
        if (existsSync(thumbnailPath)) await unlink(thumbnailPath);
      }
    }
  } catch (fatalErr) {
    fatal = fatalErr as Error;
    console.error(`[tile-photos] fatal error: ${redact((fatalErr as Error).message ?? String(fatalErr))}`);
  }

  console.log('');
  console.log('[tile-photos] thumbnail-only summary:');
  console.log(`  thumbnailed (new):   ${stats.thumbnailed}`);
  console.log(`  failed:              ${stats.failed}`);
  console.log(`  total eligible rows: ${eligible.length}`);

  if (fatal) process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — verbatim from scripts/ingest-photos.ts.
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(redact((err as Error).message)); process.exit(1); });
}
