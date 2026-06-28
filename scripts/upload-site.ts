/**
 * scripts/upload-site.ts
 *
 * Quick task 260628-jtl (switch production to the custom domain): additive
 * Bunny Storage Zone uploader for the built `_site` directory.
 *
 * Walks the local `_site` build output and PUTs every file to the ROOT of the
 * bunny `pnwmoths` Storage Zone — the SAME zone that holds all the images. The
 * custom domain https://moths.pnwinsects.org/ is the pull zone in front of this
 * bucket, so the site files and the image objects are served together.
 *
 * ADDITIVE-ONLY (D-02 — the single most important safety property): the script
 * does exactly ONE PUT (create/overwrite) per local file and nothing else against
 * the zone. It does NOT list the remote zone to diff, does NOT issue any removal
 * request, and does NOT run a destructive sync. The images live in this same
 * bucket; a destructive sync would wipe them. There is intentionally no removal
 * helper and no purge step. This invariant is locked by a source-introspection
 * test in upload-site.test.ts that forbids the relevant tokens.
 *
 * Modeled directly on scripts/upload-images.ts (same auth + HTTP + retry +
 * redaction pattern). Self-contained: node builtins + the `curl` CLI only — no
 * new npm packages.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/upload-site.ts                       # print plan, zero network calls
 *   BUNNY_STORAGE_PASSWORD=... node scripts/upload-site.ts       # real upload run
 *
 * BUNNY_STORAGE_PASSWORD: Storage Zone password from bunny.net dashboard →
 * pnwmoths Storage Zone → FTP & API Access → Password. Falls back to
 * BUNNY_API_KEY (the image-uploader key — same value) for local convenience.
 * Never commit, log, or hardcode it.
 *
 * Requires: curl CLI.
 */

import { join, posix, sep } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Module-level env constants (same pattern as upload-images.ts).
// ---------------------------------------------------------------------------

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string =
  process.env['BUNNY_STORAGE_PASSWORD'] ?? process.env['BUNNY_API_KEY'] ?? '';
const SITE_DIR: string = process.env['SITE_DIR'] ?? '_site';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

// ---------------------------------------------------------------------------
// Helpers — copied from upload-images.ts (project convention), redacting against
// the storage password rather than the API key.
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
 * Five-attempt exponential backoff (2s/4s/8s/16s/32s). Non-retriable errors bail
 * immediately. Verbatim shape from upload-images.ts.
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
 * Build the bunny Storage Zone PUT URL for a site-relative path.
 *
 * Returns `https://{BUNNY_STORAGE_HOST}/{BUNNY_ZONE}/` followed by relPath with
 * each "/"-separated segment passed through encodeURIComponent and re-joined with
 * "/". This targets the zone ROOT — there is NO `key-images/` (or any) prefix;
 * the site lives at the bucket root alongside the images' own subpaths (D-02).
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

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- SITE_DIR existence guard. ---
  if (!existsSync(SITE_DIR)) {
    console.error(`[upload-site] site dir not found: ${SITE_DIR}`);
    console.error('[upload-site] run the build first (npm run build), or set SITE_DIR.');
    process.exit(1);
  }

  const files = listSiteFiles(SITE_DIR);
  console.log(`[upload-site] site dir: ${SITE_DIR}`);
  console.log(`[upload-site] ${files.length} files to upload (additive — no deletes, no purge)`);

  // --- DRY_RUN path: print the PUT plan and return — ZERO network calls. ---
  // Must come BEFORE the missing-password guard so DRY_RUN works without a secret.
  if (DRY_RUN) {
    console.log('[upload-site] DRY_RUN=1 — printing upload plan; no curl/network calls.');
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

  // --- Missing-secret guard. ---
  if (!BUNNY_STORAGE_PASSWORD) {
    console.error(
      '[upload-site] BUNNY_STORAGE_PASSWORD is required. Set it to your bunny.net Storage Zone password.'
    );
    console.error('[upload-site] bunny.net dashboard → Storage → pnwmoths zone → FTP & API Access → Password');
    console.error('[upload-site] In CI, add it as the repo secret BUNNY_STORAGE_PASSWORD.');
    process.exit(1);
  }

  const stats = { uploaded: 0, failed: 0 };

  for (const relPath of files) {
    const localPath = join(SITE_DIR, ...relPath.split('/'));
    const storageUrl = siteObjectStorageUrl(relPath);
    const contentType = contentTypeFor(relPath);

    try {
      // Single PUT per file — argv-array form because paths may contain spaces.
      await withRetry(
        () => execFileSync('curl', [
          '-s', '-S', '-f',
          '-X', 'PUT',
          '-H', `AccessKey: ${BUNNY_STORAGE_PASSWORD}`,
          '-H', `Content-Type: ${contentType}`,
          '--data-binary', `@${localPath}`,
          storageUrl,
        ], { stdio: ['pipe', 'pipe', 'pipe'] }),
        `upload ${relPath}`
      );
      stats.uploaded++;
      console.log(`[upload-site] uploaded: ${relPath}`);
    } catch (err) {
      const safeMsg = redact((err as Error).message ?? String(err));
      stats.failed++;
      console.error(`[upload-site] failed: ${relPath} — ${safeMsg}`);
    }
  }

  console.log('');
  console.log('[upload-site] summary:');
  console.log(`  uploaded: ${stats.uploaded}`);
  console.log(`  failed:   ${stats.failed}`);
  console.log(`  total:    ${files.length}`);

  if (stats.failed > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — prevents main() from running on test import.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(redact((err as Error).message)); process.exit(1); });
}
