/**
 * scripts/upload-tiles.js
 *
 * Phase 30 (v2.2 high-res photos): manifest-driven DZI tile upload pipeline.
 * Reads data/species-photos-manifest.csv, filters rows with status=tiled,
 * runs a pre-flight storage footprint check, then uploads each row's tile
 * directory to bunny.net Storage Zone `pnwmoths` at
 * `species-tiles/{slug-lowercase}/{specimen_id}-{view}/`.
 *
 * After all files for a row upload successfully, the script advances the row
 * to status=uploaded, logs a success line, then immediately deletes the local
 * tile directory and .dzi descriptor to reclaim disk space (D-03).
 *
 * Usage:
 *   BUNNY_API_KEY=... node scripts/upload-tiles.js
 *   DRY_RUN=1 node scripts/upload-tiles.js         # prints first 5 upload plans; no uploads, no manifest write
 *   TILE_OUTPUT_DIR=/mnt/tiles BUNNY_API_KEY=... node scripts/upload-tiles.js
 *
 * Resume after interruption: re-run the same command. Rows with status=uploaded
 * are skipped at the filter stage. Rows that crashed mid-directory remain at
 * status=tiled (whole-directory granularity per D-02) and will be re-uploaded
 * from the beginning. bunny.net PUT is idempotent — overwriting is safe.
 *
 * All execution targets this local laptop. Default tile output dir is var/tiles
 * (relative to repo root, per scripts/tile-config.json). The TILE_OUTPUT_DIR
 * env var is the only override path mechanism. This script does NOT reference
 * any remote-server-specific paths.
 *
 * BUNNY_API_KEY: Storage Zone password from bunny.net dashboard → pnwmoths
 * Storage Zone. Never commit, log, or hardcode.
 *
 * Requires: curl CLI. Confirm with `curl --version`.
 */

import { resolve, join, relative } from 'node:path';
import { rm, unlink, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readManifest, writeManifest, advanceStatus } from './lib/manifest.js';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention; mirrors upload-plates.js
// and tile-photos.js).
// ---------------------------------------------------------------------------

const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const TILE_CONFIG_PATH = resolve('scripts/tile-config.json');
const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';
const DRY_RUN = process.env.DRY_RUN === '1';
const TILE_OUTPUT_DIR_OVERRIDE = process.env.TILE_OUTPUT_DIR ?? '';
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';

// ---------------------------------------------------------------------------
// Helpers — copied/adapted from tile-photos.js (exponential backoff) and
// upload-plates.js (curl PUT, walk). Project convention: self-contained files.
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
 * Five-attempt exponential backoff (2s/4s/8s/16s/32s). Non-retriable 4xx
 * errors (err.retriable === false) bail immediately. Adapted verbatim from
 * tile-photos.js — use this version, not the linear-backoff in upload-plates.js.
 */
async function withRetry(fn, label) {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safeMsg = redact(err.message ?? String(err));
      if (err.retriable === false) {
        throw new Error(`${label} failed (non-retriable): ${safeMsg}`);
      }
      if (attempt === delays.length - 1) {
        throw new Error(`${label} failed after ${delays.length} attempts: ${safeMsg}`);
      }
      console.log(
        `[upload-tiles] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt] / 1000}s: ${safeMsg}`
      );
      await sleep(delays[attempt]);
    }
  }
  // Unreachable — the loop either returns from fn() or throws on the final attempt.
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

/**
 * Async recursive directory walk — copied verbatim from upload-plates.js.
 * Returns all file paths (not directories) under dir as an array.
 */
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Exported helpers (exported at module level for unit tests — mirrors the
// tilePrefix / isAlreadyTiled / isTileable pattern from tile-photos.js).
// ---------------------------------------------------------------------------

/**
 * Compute the on-disk prefix path for a manifest row.
 *
 * Returns `{tileOutputDir}/{slug-lowercase}/{specimen_id}-{view}`.
 * vips writes `{prefix}.dzi` (descriptor) and `{prefix}_files/` (tile pyramid).
 * species_slug is lowercased unconditionally (L-08; Phase 28 lesson).
 *
 * @param {string} tileOutputDir  - Root of the tile output directory
 * @param {object} row            - Manifest row
 * @returns {string}              - Prefix path (no extension)
 */
export function tileUploadPath(tileOutputDir, row) {
  return join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`);
}

/**
 * Compute the CDN Pull Zone URL for a manifest row.
 *
 * Used in DRY_RUN output so the operator can paste the URL into a browser
 * after the upload to verify tile resolution. Note: PUT requests go to the
 * Storage Zone URL (BUNNY_STORAGE_HOST), not this Pull Zone URL.
 *
 * @param {object} row  - Manifest row
 * @returns {string}    - Pull Zone URL with trailing slash
 */
export function tilePullZoneUrl(row) {
  const slug = row.species_slug.toLowerCase();
  return `${CDN_BASE_URL}/species-tiles/${slug}/${row.specimen_id}-${row.view}/`;
}

/**
 * Returns true if the row is eligible for upload in this run.
 *
 * Only rows with status=tiled are uploaded. Rows with status=uploaded are
 * skipped at the filter stage (manifest-level idempotency, UPLOAD-02).
 *
 * @param {object} row  - Manifest row
 * @returns {boolean}
 */
export function isUploadable(row) {
  return row.status === 'tiled';
}

// ---------------------------------------------------------------------------
// Pre-flight footprint check (UPLOAD-03, D-04).
// ---------------------------------------------------------------------------

/**
 * Walk all status=tiled rows' tile directories and print the total on-disk
 * size in GB. If not all rows have tiles on disk, prints an extrapolated
 * full-run estimate. Always runs before any upload (D-04).
 *
 * Uses synchronous fs calls (statSync, readdirSync) since this is a
 * one-time startup check and main() is already async.
 *
 * @param {string} tileOutputDir   - Root of the tile output directory
 * @param {Array}  tiledRows       - Rows filtered to status=tiled
 */
function preflightFootprint(tileOutputDir, tiledRows) {
  console.log('[upload-tiles] Pre-flight: measuring tile corpus size (this may take 30-90s)...');

  let totalBytes = 0;
  let measuredRows = 0;

  // Synchronous recursive walk for pre-flight measurement.
  function walkSync(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkSync(full));
      } else {
        files.push(full);
      }
    }
    return files;
  }

  for (const row of tiledRows) {
    const prefix = tileUploadPath(tileOutputDir, row);
    // .dzi descriptor
    const dziPath = `${prefix}.dzi`;
    if (existsSync(dziPath)) {
      totalBytes += statSync(dziPath).size;
    }
    // _files/ tile pyramid
    const filesDir = `${prefix}_files`;
    if (existsSync(filesDir)) {
      for (const f of walkSync(filesDir)) {
        totalBytes += statSync(f).size;
      }
      measuredRows++;
    }
  }

  console.log('[upload-tiles] Pre-flight footprint check:');
  console.log(`  ${tiledRows.length} rows with status=tiled`);
  console.log(`  Tile output dir: ${tileOutputDir}`);
  console.log(`  Total on-disk size: ${(totalBytes / 1e9).toFixed(1)} GB (measured)`);
  if (measuredRows < tiledRows.length && measuredRows > 0) {
    const avgBytesPerRow = totalBytes / measuredRows;
    const estimated = avgBytesPerRow * tiledRows.length;
    console.log(
      `  Estimated full-run size (extrapolated): ~${(estimated / 1e9).toFixed(1)} GB` +
      ` (${tiledRows.length} rows × avg ${(avgBytesPerRow / 1e6).toFixed(0)} MB/dir)`
    );
  }
  console.log('Proceeding with upload...');
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main() {
  // --- Load config (tileOutputDir default from tile-config.json). ---
  const config = JSON.parse(readFileSync(TILE_CONFIG_PATH, 'utf8'));

  // --- Resolve runtime dirs: env override takes precedence over config file. ---
  const tileOutputDir = TILE_OUTPUT_DIR_OVERRIDE || config.tileOutputDir;

  // --- Read manifest. ---
  const rows = await readManifest(MANIFEST_PATH);

  // --- Filter eligible rows. ---
  const tiledRows = rows.filter(isUploadable);

  console.log(
    `[upload-tiles] manifest: ${rows.length} rows total; ${tiledRows.length} eligible (status=tiled)`
  );

  // --- DRY_RUN path: print first 5 upload plans; exit without side-effects. ---
  // Must come BEFORE the !BUNNY_API_KEY guard so DRY_RUN=1 works without an API key (pitfall 6).
  if (DRY_RUN) {
    console.log('[upload-tiles] DRY_RUN=1 — printing first 5 upload plans, not uploading');
    for (const row of tiledRows.slice(0, 5)) {
      const slug = row.species_slug.toLowerCase();
      const pair = `${row.specimen_id}-${row.view}`;
      const cdnUrl = tilePullZoneUrl(row);
      const filesDir = tileUploadPath(tileOutputDir, row) + '_files';
      const tileFileCount = existsSync(filesDir) ? (await walk(filesDir)).length : 0;
      console.log(`  slug: ${slug}  pair: ${pair}`);
      console.log(`    CDN URL: ${cdnUrl}`);
      console.log(`    Files to upload: ${tileFileCount + 1} (${tileFileCount} tiles + 1 .dzi)`);
    }
    if (tiledRows.length > 5) console.log(`  ... (${tiledRows.length - 5} more)`);
    return;
  }

  // --- Missing-secret guard. ---
  if (!BUNNY_API_KEY) {
    console.error(
      '[upload-tiles] BUNNY_API_KEY is required. Set it to your bunny.net Storage Zone password.'
    );
    process.exit(1);
  }

  // --- Pre-flight footprint check (D-04: always-on, pre-upload). ---
  preflightFootprint(tileOutputDir, tiledRows);

  // --- Stats counters. ---
  const stats = {
    uploaded: 0,
    skippedAlreadyUploaded: 0,
    failed: 0,
  };

  let rowsProcessed = 0;
  let fatal = null;

  try {
    for (const row of tiledRows) {
      const slug = row.species_slug.toLowerCase();
      const pair = `${row.specimen_id}-${row.view}`;
      const localPrefix = tileUploadPath(tileOutputDir, row);
      const dziLocalPath = `${localPrefix}.dzi`;
      const filesLocalDir = `${localPrefix}_files`;
      const storageBase = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/species-tiles/${slug}/${pair}`;

      try {
        // --- Upload tile files (recursive walk of _files/ dir). ---
        const tileFiles = existsSync(filesLocalDir) ? await walk(filesLocalDir) : [];
        for (const tileFile of tileFiles) {
          const rel = relative(filesLocalDir, tileFile);
          const url = `${storageBase}_files/${rel}`;
          const args = [
            '-s', '-S', '-f',
            '-X', 'PUT',
            '-H', `AccessKey: ${BUNNY_API_KEY}`,
            '-H', 'Content-Type: application/octet-stream',
            '--data-binary', `@${tileFile}`,
            url,
          ];
          await withRetry(
            () => execFileSync('curl', args, { stdio: ['pipe', 'pipe', 'inherit'] }),
            `upload ${pair}/${rel}`
          );
        }

        // --- Upload thumbnail ---
        const thumbnailLocalPath = `${localPrefix}_thumbnail.webp`;
        const thumbnailUrl = `${storageBase}_thumbnail.webp`;
        if (existsSync(thumbnailLocalPath)) {
          const thumbArgs = [
            '-s', '-S', '-f',
            '-X', 'PUT',
            '-H', `AccessKey: ${BUNNY_API_KEY}`,
            '-H', 'Content-Type: image/webp',
            '--data-binary', `@${thumbnailLocalPath}`,
            thumbnailUrl,
          ];
          await withRetry(
            () => execFileSync('curl', thumbArgs, { stdio: ['pipe', 'pipe', 'inherit'] }),
            `upload ${pair}/_thumbnail`
          );
        }

        // --- Upload .dzi descriptor. ---
        const dziUrl = `${storageBase}.dzi`;
        const dziArgs = [
          '-s', '-S', '-f',
          '-X', 'PUT',
          '-H', `AccessKey: ${BUNNY_API_KEY}`,
          '-H', 'Content-Type: application/octet-stream',
          '--data-binary', `@${dziLocalPath}`,
          dziUrl,
        ];
        await withRetry(
          () => execFileSync('curl', dziArgs, { stdio: ['pipe', 'pipe', 'inherit'] }),
          `upload ${pair}/.dzi`
        );

        // --- Advance manifest status (must happen before deletion per D-03). ---
        advanceStatus(row, 'uploaded');
        logStage(row.content_hash, 'upload', 'ok', `${slug}/${pair}  ${tileFiles.length + 1} files`);
        stats.uploaded++;

        // --- Delete local tile directory, .dzi, and thumbnail (D-03: unconditional, post-status-advance). ---
        await rm(filesLocalDir, { recursive: true, force: true });
        if (existsSync(dziLocalPath)) await unlink(dziLocalPath);
        if (existsSync(thumbnailLocalPath)) await unlink(thumbnailLocalPath);

      } catch (err) {
        const safeMsg = redact(err.message ?? String(err));
        advanceStatus(row, 'failed', { last_error: safeMsg });
        stats.failed++;
        logStage(row.content_hash, 'upload', 'failed', safeMsg);
      }

      rowsProcessed++;
      // Periodic checkpoint write (loses at most 24 rows on kill -9, per L-07).
      if (rowsProcessed % 25 === 0) {
        console.log(`[upload-tiles] ${rowsProcessed}/${tiledRows.length}`);
        await writeManifest(MANIFEST_PATH, rows);
      }
    }
  } catch (fatalErr) {
    fatal = fatalErr;
    console.error(`[upload-tiles] fatal error: ${redact(fatalErr.message ?? String(fatalErr))}`);
  } finally {
    // Always write manifest on exit — success or fatal error (mirrors tile-photos.js).
    await writeManifest(MANIFEST_PATH, rows);
  }

  // Final summary (OPS-01 tail-friendly).
  console.log('');
  console.log('[upload-tiles] summary:');
  console.log(`  uploaded (new):              ${stats.uploaded}`);
  console.log(`  skipped (already uploaded):  ${stats.skippedAlreadyUploaded}`);
  console.log(`  failed (per-row errors):     ${stats.failed}`);
  console.log(`  total eligible rows:         ${tiledRows.length}`);
  console.log(`[upload-tiles] wrote ${MANIFEST_PATH}`);

  if (fatal) process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — verbatim from tile-photos.js.
// Prevents main() from running when the test file imports the exports above.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(redact(err.message)); process.exit(1); });
}
