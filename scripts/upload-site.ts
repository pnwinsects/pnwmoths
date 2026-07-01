/**
 * scripts/upload-site.ts
 *
 * Quick task 260628-jtl (switch production to the custom domain): additive
 * Bunny Storage Zone uploader for the built `_site` directory.
 *
 * Walks the local `_site` build output and PUTs files to the ROOT of the bunny
 * `pnwmoths` Storage Zone — the SAME zone that holds all the images. The custom
 * domain https://moths.pnwinsects.org/ is the pull zone in front of this bucket,
 * so the site files and the image objects are served together.
 *
 * ADDITIVE-ONLY (D-02 — the single most important safety property): the script
 * only ever PUTs (creates/overwrites) objects. It never issues a removal request
 * and never runs a destructive sync. The images live in this same bucket; a
 * destructive sync would wipe them. There is intentionally no removal helper and
 * no purge step. This invariant is locked by a source-introspection test in
 * upload-site.test.ts that forbids the relevant tokens.
 *
 * Performance: uploads run CONCURRENTLY (a bounded worker pool) over Node's
 * built-in fetch with connection keep-alive — no per-file subprocess, no fresh
 * TLS handshake each time. Routine deploys are made near-instant by a content-hash
 * manifest (see below) that skips files whose bytes are unchanged.
 *
 * CONTENT-HASH MANIFEST — and how it stays trustworthy:
 *   The manifest is a JSON map { "<storage-relative-path>": "<sha256-hex>" }
 *   stored IN the zone at MANIFEST_KEY and read back from the STORAGE API (not the
 *   CDN, so it is never a stale cached copy). Because it travels with the data it
 *   describes, it cannot drift from a separate "source of truth".
 *     - Self-healing: if the manifest is absent (404) or unparseable, it is treated
 *       as empty → every file uploads. A wiped or first-run zone always does a full
 *       upload; the manifest can never make us upload LESS than a clean slate.
 *     - Write-after-success: the new manifest is PUT only after EVERY file upload in
 *       the run succeeds. A partial/failed deploy leaves the old manifest untouched,
 *       so the next run re-evaluates and retries — nothing is ever recorded as
 *       present when it is not.
 *     - Content hashes, not mtimes: a clean rebuild with identical bytes is correctly
 *       skipped (mtime-based sync tools re-upload everything after a rebuild).
 *     - Escape hatch: FORCE_FULL=1 ignores the remote manifest and uploads everything
 *       (then rewrites the manifest) — use it if you suspect the bucket was mutated
 *       out-of-band.
 *   The manifest governs additive uploads ONLY. Orphaned objects (an old hashed
 *   chunk, a removed species) are never removed — consistent with the additive
 *   invariant — and the manifest does not track them.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/upload-site.ts                   # print plan, zero network calls
 *   BUNNY_STORAGE_PASSWORD=... node scripts/upload-site.ts   # real upload run
 *   FORCE_FULL=1 BUNNY_STORAGE_PASSWORD=... node scripts/upload-site.ts
 *
 * BUNNY_STORAGE_PASSWORD: Storage Zone password from bunny.net dashboard →
 * pnwmoths Storage Zone → FTP & API Access → Password. Falls back to
 * BUNNY_API_KEY (the image-uploader key — same value) for local convenience.
 * Never commit, log, or hardcode it.
 */

import { join, posix, sep } from 'node:path';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Module-level env constants (same auth pattern as upload-images.ts).
// ---------------------------------------------------------------------------

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string =
  process.env['BUNNY_STORAGE_PASSWORD'] ?? process.env['BUNNY_API_KEY'] ?? '';
const SITE_DIR: string = process.env['SITE_DIR'] ?? '_site';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const FORCE_FULL: boolean = process.env['FORCE_FULL'] === '1';
const CONCURRENCY: number = Math.max(1, Number(process.env['UPLOAD_CONCURRENCY'] ?? '24') || 24);

/** Reserved storage key for the content-hash manifest (zone root). */
export const MANIFEST_KEY = '_site-manifest.json';

// ---------------------------------------------------------------------------
// Helpers — redaction + retry (same shape as upload-images.ts).
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Redact BUNNY_STORAGE_PASSWORD from an error message. Guard against the empty
 * edge case: new RegExp('', 'g') matches every position and would corrupt text.
 */
function redact(msg: string): string {
  return BUNNY_STORAGE_PASSWORD
    ? msg.replace(new RegExp(BUNNY_STORAGE_PASSWORD, 'g'), '[REDACTED]')
    : msg;
}

/**
 * Five-attempt exponential backoff (2s/4s/8s/16s/32s). Errors flagged
 * retriable:false bail immediately. Verbatim shape from upload-images.ts.
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
        `[upload-site] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safeMsg}`
      );
      await sleep(delays[attempt]!);
    }
  }
  // Unreachable — the loop either returns from fn() or throws on the final attempt.
  throw new Error(`${label}: unreachable`);
}

// ---------------------------------------------------------------------------
// Exported pure helpers (each exercised by upload-site.test.ts).
// ---------------------------------------------------------------------------

/**
 * Build the bunny Storage Zone PUT/GET URL for a site-relative path.
 *
 * Returns `https://{BUNNY_STORAGE_HOST}/{BUNNY_ZONE}/` followed by relPath with
 * each "/"-separated segment passed through encodeURIComponent and re-joined with
 * "/". This targets the zone ROOT — there is no extra prefix; the site lives at
 * the bucket root alongside the images' own subpaths (D-02).
 */
export function siteObjectStorageUrl(relPath: string): string {
  const encoded = relPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${encoded}`;
}

/**
 * Map a filename's extension to a Content-Type. Bunny serves the stored
 * Content-Type, so setting it keeps HTML/CSS/JS/wasm rendering correctly through
 * the pull zone. Unknown extensions fall back to application/octet-stream.
 */
export function contentTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot + 1);
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    json: 'application/json',
    map: 'application/json',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    ico: 'image/x-icon',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    wasm: 'application/wasm',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    parquet: 'application/octet-stream',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Synchronous recursive walk of `dir`, returning POSIX-relative file paths (no
 * directories, no leading "./").
 */
export function listSiteFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const childFs = join(current, entry.name);
      const childRel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(childFs, childRel);
      } else if (entry.isFile()) {
        // Normalize any platform separator to POSIX for the storage key.
        out.push(childRel.split(sep).join(posix.sep));
      }
    }
  };
  walk(dir, '');
  return out;
}

/** sha256 hex of a byte buffer. */
export function hashBytes(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Manifest shape: storage-relative path → sha256 hex of the uploaded bytes. */
export type Manifest = Record<string, string>;

/**
 * Decide which files need uploading: those whose local content hash differs from
 * (or is absent in) the remote manifest. Returns paths in the order of `local`.
 * An empty remote manifest yields every file (self-healing full upload).
 */
export function filesToUpload(local: Manifest, remote: Manifest): string[] {
  return Object.keys(local).filter((relPath) => remote[relPath] !== local[relPath]);
}

// ---------------------------------------------------------------------------
// Network — PUT one object; GET the remote manifest. Built-in fetch (undici)
// pools connections with keep-alive, so concurrent PUTs reuse TLS sessions.
// ---------------------------------------------------------------------------

/** Classify HTTP failures: 4xx (except 429) is non-retriable; everything else retries. */
function httpError(status: number, statusText: string, label: string): Error {
  const err = new Error(`${label}: HTTP ${status} ${statusText}`) as Error & { retriable?: boolean };
  err.retriable = !(status >= 400 && status < 500 && status !== 429);
  return err;
}

async function putObject(relPath: string, body: Uint8Array): Promise<void> {
  const res = await fetch(siteObjectStorageUrl(relPath), {
    method: 'PUT',
    headers: { AccessKey: BUNNY_STORAGE_PASSWORD, 'Content-Type': contentTypeFor(relPath) },
    body,
  });
  if (!res.ok) throw httpError(res.status, res.statusText, `upload ${relPath}`);
}

/**
 * Fetch the remote manifest from the storage API. A missing manifest (404) or any
 * parse failure resolves to {} so the run self-heals into a full upload.
 */
async function fetchRemoteManifest(): Promise<Manifest> {
  try {
    const res = await fetch(siteObjectStorageUrl(MANIFEST_KEY), {
      method: 'GET',
      headers: { AccessKey: BUNNY_STORAGE_PASSWORD },
    });
    if (res.status === 404) return {};
    if (!res.ok) throw httpError(res.status, res.statusText, 'fetch manifest');
    const parsed = JSON.parse(await res.text()) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Manifest;
    return {};
  } catch (err) {
    console.log(`[upload-site] could not read remote manifest (${redact((err as Error).message)}) — treating as empty (full upload).`);
    return {};
  }
}

/** Run `worker` over `items` with at most `limit` in flight at once. */
async function runPool<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runner = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(SITE_DIR)) {
    console.error(`[upload-site] site dir not found: ${SITE_DIR}`);
    console.error('[upload-site] run the build first (npm run build), or set SITE_DIR.');
    process.exit(1);
  }

  // Never treat a stray local copy of the manifest key as a site file.
  const files = listSiteFiles(SITE_DIR).filter((f) => f !== MANIFEST_KEY);
  console.log(`[upload-site] site dir: ${SITE_DIR}`);
  console.log(`[upload-site] ${files.length} files in build (additive — no removals, no purge)`);

  // DRY_RUN: print the plan and return — ZERO network calls. Must precede the
  // missing-password guard so DRY_RUN works without a secret. The manifest skip
  // is intentional (reading it would be a network call).
  if (DRY_RUN) {
    console.log('[upload-site] DRY_RUN=1 — printing upload plan; no network calls (manifest comparison skipped).');
    console.log('');
    for (const relPath of files) {
      console.log(`  ${relPath}`);
      console.log(`    → PUT ${siteObjectStorageUrl(relPath)}`);
      console.log(`      Content-Type: ${contentTypeFor(relPath)}`);
    }
    console.log('');
    console.log(`[upload-site] ${files.length} files would be PUT to the zone root.`);
    return;
  }

  if (!BUNNY_STORAGE_PASSWORD) {
    console.error('[upload-site] BUNNY_STORAGE_PASSWORD is required. Set it to your bunny.net Storage Zone password.');
    console.error('[upload-site] bunny.net dashboard → Storage → pnwmoths zone → FTP & API Access → Password');
    console.error('[upload-site] In CI, add it as the repo/environment secret BUNNY_STORAGE_PASSWORD.');
    process.exit(1);
  }

  // Hash every local file (one read pass), then diff against the remote manifest.
  const local: Manifest = {};
  for (const relPath of files) {
    local[relPath] = hashBytes(readFileSync(join(SITE_DIR, ...relPath.split('/'))));
  }

  const remote = FORCE_FULL ? {} : await fetchRemoteManifest();
  if (FORCE_FULL) console.log('[upload-site] FORCE_FULL=1 — ignoring remote manifest; uploading everything.');
  const toUpload = filesToUpload(local, remote);
  const skipped = files.length - toUpload.length;
  console.log(`[upload-site] ${toUpload.length} changed/new, ${skipped} unchanged (skipped via manifest), concurrency=${CONCURRENCY}`);

  const stats = { uploaded: 0, failed: 0 };
  await runPool(toUpload, CONCURRENCY, async (relPath) => {
    try {
      const body = readFileSync(join(SITE_DIR, ...relPath.split('/')));
      await withRetry(() => putObject(relPath, body), `upload ${relPath}`);
      stats.uploaded++;
      console.log(`[upload-site] uploaded: ${relPath}`);
    } catch (err) {
      stats.failed++;
      console.error(`[upload-site] failed: ${relPath} — ${redact((err as Error).message ?? String(err))}`);
    }
  });

  console.log('');
  console.log('[upload-site] summary:');
  console.log(`  uploaded: ${stats.uploaded}`);
  console.log(`  skipped:  ${skipped}`);
  console.log(`  failed:   ${stats.failed}`);
  console.log(`  total:    ${files.length}`);

  if (stats.failed > 0) {
    console.error('[upload-site] some uploads failed — manifest NOT updated; next run will retry the missing/changed files.');
    process.exit(1);
  }

  // Write-after-success: persist the full current state so the next run can skip
  // everything that did not change. `local` reflects every file we just uploaded
  // or confirmed already-current.
  await withRetry(
    () => putObject(MANIFEST_KEY, Buffer.from(JSON.stringify(local))),
    `upload ${MANIFEST_KEY}`
  );
  console.log(`[upload-site] manifest updated (${Object.keys(local).length} entries).`);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — prevents main() from running on test import.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(redact((err as Error).message)); process.exit(1); });
}
