/**
 * scripts/deploy-smoke.ts
 *
 * Post-deploy CDN smoke check: fetches a sample of recently-uploaded HTML URLs
 * through the CDN pull zone and verifies they are fresh (not stale edge cache).
 *
 * Checks:
 *   1. `cache-control` header is `no-cache` (not an old long-TTL policy).
 *   2. Response body SHA-256 matches the local `_site/` build output.
 *
 * Designed to run immediately after `npm run site:upload`. It reads the local
 * build in `_site/` to know what the correct content should be.
 *
 * The script is advisory: it exits 0 on success or when all URLs pass, and
 * exits 1 if any URL is stale. It does NOT modify anything — pure reads.
 *
 * Usage:
 *   node scripts/deploy-smoke.ts                          # default: up to 5 HTML pages
 *   SMOKE_URLS="browse/index.html,about/index.html" \
 *     node scripts/deploy-smoke.ts                        # explicit URL list
 *   SMOKE_SAMPLE=10 node scripts/deploy-smoke.ts          # sample 10 pages
 *   CDN_ORIGIN=https://custom.example.com \
 *     node scripts/deploy-smoke.ts                        # override CDN origin
 *
 * Environment variables:
 *   CDN_ORIGIN      — CDN pull-zone origin (default: https://moths.pnwinsects.org)
 *   SMOKE_URLS      — comma-separated list of site-relative paths to check
 *   SMOKE_SAMPLE    — max number of HTML pages to sample when SMOKE_URLS is not set (default: 5)
 *   SITE_DIR        — local build directory (default: _site)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listSiteFiles, hashBytes } from './upload-site.ts';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_CDN_ORIGIN = 'https://moths.pnwinsects.org';

const CDN_ORIGIN: string = (process.env['CDN_ORIGIN'] ?? DEFAULT_CDN_ORIGIN).replace(/\/+$/, '');
const SITE_DIR: string = process.env['SITE_DIR'] ?? '_site';
const SMOKE_SAMPLE: number = Math.max(1, Number(process.env['SMOKE_SAMPLE'] ?? '5') || 5);

// ---------------------------------------------------------------------------
// Exported helpers (tested in deploy-smoke.test.ts)
// ---------------------------------------------------------------------------

/**
 * Pick which site-relative HTML paths to smoke-check.
 *
 * If `explicit` is provided (from SMOKE_URLS), use those verbatim.
 * Otherwise, list all HTML files in the build dir and return a
 * deterministic sample of up to `sample` paths. The sample is
 * deterministic (sorted, then evenly spaced) so repeated runs on the
 * same build check the same pages.
 */
export function selectUrls(
  buildFiles: string[],
  sample: number,
  explicit?: string,
): string[] {
  if (explicit) {
    return explicit
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
  }

  const htmlFiles = buildFiles
    .filter((f) => f.endsWith('.html'))
    .sort();

  if (htmlFiles.length === 0) return [];
  if (htmlFiles.length <= sample) return htmlFiles;

  // Evenly-spaced deterministic sample
  const step = htmlFiles.length / sample;
  const picked: string[] = [];
  for (let i = 0; i < sample; i++) {
    picked.push(htmlFiles[Math.floor(i * step)]!);
  }
  return picked;
}

/** Result of checking a single URL. */
export interface SmokeResult {
  url: string;
  relPath: string;
  ok: boolean;
  cacheControl: string | null;
  cdnCache: string | null;
  cacheControlOk: boolean;
  contentOk: boolean;
  expectedHash: string;
  actualHash: string | null;
}

/**
 * Check one URL through the CDN. Returns a result object — never throws.
 */
export async function checkUrl(
  cdnOrigin: string,
  relPath: string,
  localHash: string,
): Promise<SmokeResult> {
  const url = `${cdnOrigin}/${relPath}`;
  const result: SmokeResult = {
    url,
    relPath,
    ok: false,
    cacheControl: null,
    cdnCache: null,
    cacheControlOk: false,
    contentOk: false,
    expectedHash: localHash,
    actualHash: null,
  };

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'pnwmoths-deploy-smoke/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`  ✗ ${relPath} — HTTP ${res.status} ${res.statusText}`);
      return result;
    }

    result.cacheControl = res.headers.get('cache-control');
    result.cdnCache = res.headers.get('cdn-cache') ?? res.headers.get('x-cache');

    // Cache-control check: must contain "no-cache" and must NOT contain a long max-age
    const cc = (result.cacheControl ?? '').toLowerCase();
    result.cacheControlOk = cc.includes('no-cache') && !(/max-age=\d{4,}/.test(cc));

    // Content hash check
    const body = new Uint8Array(await res.arrayBuffer());
    result.actualHash = hashBytes(body);
    result.contentOk = result.actualHash === localHash;

    result.ok = result.cacheControlOk && result.contentOk;
  } catch (err) {
    console.error(`  ✗ ${relPath} — fetch error: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Format a single smoke result for console output.
 */
export function formatResult(r: SmokeResult): string {
  const icon = r.ok ? '✓' : '✗';
  const parts = [`  ${icon} ${r.relPath}`];

  if (!r.ok) {
    if (!r.cacheControlOk) {
      parts.push(`    cache-control: ${r.cacheControl ?? '(missing)'} — expected no-cache`);
    }
    if (!r.contentOk) {
      parts.push(`    content mismatch: expected ${r.expectedHash.slice(0, 12)}… got ${r.actualHash?.slice(0, 12) ?? '(none)'}…`);
    }
    if (r.cdnCache) {
      parts.push(`    cdn-cache: ${r.cdnCache}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(SITE_DIR)) {
    console.error(`[deploy-smoke] site dir not found: ${SITE_DIR}`);
    console.error('[deploy-smoke] run the build first (npm run build), or set SITE_DIR.');
    process.exit(1);
  }

  const buildFiles = listSiteFiles(SITE_DIR);
  const urls = selectUrls(buildFiles, SMOKE_SAMPLE, process.env['SMOKE_URLS']);

  if (urls.length === 0) {
    console.error('[deploy-smoke] no HTML files found to check.');
    process.exit(1);
  }

  console.log(`[deploy-smoke] checking ${urls.length} URL(s) against ${CDN_ORIGIN}`);
  console.log('');

  // Hash the local files
  const localHashes: Record<string, string> = {};
  let localFailures = 0;
  for (const relPath of urls) {
    const localPath = join(SITE_DIR, ...relPath.split('/'));
    if (!existsSync(localPath)) {
      console.error(`  ✗ ${relPath} — local file not found in ${SITE_DIR}`);
      localFailures++;
      continue;
    }
    localHashes[relPath] = hashBytes(readFileSync(localPath));
  }

  // Fetch and check each URL (sequentially to avoid hammering the CDN)
  const results: SmokeResult[] = [];
  for (const relPath of urls) {
    if (!localHashes[relPath]) continue;
    const result = await checkUrl(CDN_ORIGIN, relPath, localHashes[relPath]);
    results.push(result);
    console.log(formatResult(result));
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length + localFailures;

  console.log('');
  console.log(`[deploy-smoke] ${passed} passed, ${failed} failed out of ${results.length + localFailures} checked`);

  if (failed > 0) {
    console.error('[deploy-smoke] stale content detected — consider a pull-zone purge (bunny.net dashboard → Pull Zone → Purge Cache).');
    process.exit(1);
  }

  console.log('[deploy-smoke] all checks passed — CDN is serving fresh content.');
}

// ---------------------------------------------------------------------------
// Self-invocation guard
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error((err as Error).message); process.exit(1); });
}
