/**
 * scripts/verify-cdn-cutover.ts
 *
 * Pre-cutover verification for retiring the Bunny Optimizer (#227 / #211,
 * docs/adr/0022): prove that every image the site uses is already a real object
 * on the storage zone, by fetching all of them through a **second pull zone with
 * the Optimizer disabled**.
 *
 * Nothing here touches production. It is pure reads against a throwaway pull
 * zone, and it is the only way to exercise the loss of automatic WebP
 * content-negotiation without experimenting on the live site.
 *
 * Why not just click through five pages: the interesting failures are invisible
 * that way. `pnwm-taxon-browser` and `key-results-grid` assemble thumbnail URLs
 * in the browser, so those never appear in the HTML — which is why the sweep is
 * driven off data/image-derivatives.csv rather than off the built pages alone.
 * The manifest says what upload-derivatives.ts PUT; this asks the CDN whether
 * that is true.
 *
 * Two target sets, and both matter:
 *   1. every `derived_path` in the manifest — what the templates and components
 *      now request;
 *   2. every non-`derived/` CDN URL in the built HTML — the 1500w hero slot,
 *      plates, site images and the legacy og:image. Those are outside the ADR
 *      0022 matrix and so are exactly where an Optimizer-off surprise can hide.
 *
 * Needs NO credentials — CDN reads are public.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/verify-cdn-cutover.ts                     # print the plan
 *   LIMIT=200 STAGING_ORIGIN=https://x.b-cdn.net node scripts/verify-cdn-cutover.ts
 *   STAGING_ORIGIN=https://x.b-cdn.net node scripts/verify-cdn-cutover.ts   # full sweep
 *
 * Environment variables:
 *   STAGING_ORIGIN — Optimizer-disabled pull zone (required unless DRY_RUN)
 *   PROD_ORIGIN    — production origin, for the negotiation probe
 *   CONCURRENCY    — parallel requests (default 16)
 *   LIMIT          — check at most N objects (pilot runs)
 *   PROBE_SAMPLE   — legacy JPEGs to probe for WebP negotiation (default 5)
 *   SITE_DIR       — built site (default _site)
 *   MANIFEST_PATH  — committed manifest (default data/image-derivatives.csv)
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodePath } from '../src/_lib/derivative-url.ts';
import { readPages, readManifestPaths, storagePathOf } from './check-derivatives.ts';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention; mirrors deploy-smoke.ts).
// ---------------------------------------------------------------------------

export const DEFAULT_PROD_ORIGIN = 'https://moths.pnwinsects.org';

const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const STAGING_ORIGIN: string = (process.env['STAGING_ORIGIN'] ?? '').replace(/\/+$/, '');
const PROD_ORIGIN: string = (process.env['PROD_ORIGIN'] ?? DEFAULT_PROD_ORIGIN).replace(/\/+$/, '');
const CONCURRENCY: number = Math.max(1, Number(process.env['CONCURRENCY'] ?? '16') || 16);
const LIMIT: number = Number(process.env['LIMIT'] ?? '0');
const PROBE_SAMPLE: number = Math.max(0, Number(process.env['PROBE_SAMPLE'] ?? '5') || 0);
const SITE_DIR: string = process.env['SITE_DIR'] ?? '_site';
const MANIFEST_PATH: string = process.env['MANIFEST_PATH'] ?? 'data/image-derivatives.csv';

/** Any absolute URL on the production CDN, derivative or not. */
const CDN_URL_RE = /https?:\/\/[^"'\s,]+/g;

// ---------------------------------------------------------------------------
// Exported pure helpers — unit-testable without network or a build
// ---------------------------------------------------------------------------

/** Which target set a path came from, so a failure says what kind of thing broke. */
export type Bucket = 'derivative' | 'source';

export interface Target {
  /** Unencoded storage path, e.g. `derived/abagrotis-apposita/a@320h.webp`. */
  path: string;
  bucket: Bucket;
}

export interface CheckResult extends Target {
  status: number;
  contentType: string | null;
  verdict: 'ok' | 'missing' | 'wrong-type' | 'error';
  detail?: string;
}

/**
 * Extensions worth sweeping: image objects, plus the `.dzi` descriptor the
 * OpenSeadragon viewer fetches.
 *
 * CSS and JS also live on the zone but are irrelevant here — the Optimizer only
 * ever touched images, and `deploy-smoke.ts` already covers site assets.
 */
const SWEEPABLE_EXT = new Set(['webp', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'dzi']);

/** Lowercased extension of a path, or '' when it has none. */
export function extensionOf(path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash ? path.slice(dot + 1).toLowerCase() : '';
}

/** Whether a storage path is an image object this sweep should check. */
export function isSweepable(path: string): boolean {
  return SWEEPABLE_EXT.has(extensionOf(path));
}

/**
 * Content type the CDN should return for a path, by extension.
 *
 * With the Optimizer off Bunny serves the stored bytes and types them from the
 * extension, so this is a real assertion rather than a tautology: a `.webp`
 * answered as `image/jpeg` means the object is not what the pipeline thinks.
 */
export function expectedContentType(path: string): string | null {
  switch (extensionOf(path)) {
    case 'webp': return 'image/webp';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    default: return null; // .dzi — presence is all we assert
  }
}

/** Every production-CDN URL in one HTML document, derivative or not. */
export function extractCdnUrls(html: string, prodOrigin: string): string[] {
  return (html.match(CDN_URL_RE) ?? []).filter((u) => u.startsWith(`${prodOrigin}/`));
}

export interface BuildTargetsOptions {
  /** `derived_path` values from the committed manifest. */
  manifestPaths: Iterable<string>;
  /** Raw HTML of every built page. */
  pages: ReadonlyArray<{ page: string; html: string }>;
  prodOrigin: string;
}

/**
 * The full sweep list: every manifest derivative, plus every non-derivative
 * image URL the built HTML points at.
 *
 * Deduplicated and sorted so a run is deterministic and two runs are diffable.
 * `derived/` URLs found in the HTML are dropped rather than added — the manifest
 * is already the authority on those, and check-derivatives.ts has proved the two
 * agree.
 */
export function buildTargets(opts: BuildTargetsOptions): Target[] {
  const { manifestPaths, pages, prodOrigin } = opts;
  const byPath = new Map<string, Bucket>();

  for (const path of manifestPaths) byPath.set(path, 'derivative');

  for (const { html } of pages) {
    for (const url of extractCdnUrls(html, prodOrigin)) {
      const path = storagePathOf(url, prodOrigin);
      if (path === null || path === '') continue;
      if (path.startsWith('derived/')) continue;
      if (!isSweepable(path)) continue;
      if (!byPath.has(path)) byPath.set(path, 'source');
    }
  }

  return [...byPath]
    .map(([path, bucket]) => ({ path, bucket }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Turn a HEAD response into a verdict. */
export function classify(target: Target, status: number, contentType: string | null): CheckResult {
  if (status !== 200) {
    return { ...target, status, contentType, verdict: 'missing', detail: `HTTP ${status}` };
  }
  const expected = expectedContentType(target.path);
  // Bunny appends charset on some types; compare the media type only.
  const actual = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (expected !== null && actual !== expected) {
    return { ...target, status, contentType, verdict: 'wrong-type', detail: `expected ${expected}, got ${actual || '(none)'}` };
  }
  return { ...target, status, contentType, verdict: 'ok' };
}

/** Full URL for a storage path on a given origin. */
export function objectUrl(origin: string, path: string): string {
  return `${origin}/${encodePath(path)}`;
}

/**
 * A deterministic sample of legacy JPEG sources, for the negotiation probe.
 *
 * Legacy `.jpg` sources are the only place auto-WebP mattered: everything the
 * templates now request is already a stored `.webp`. Evenly spaced rather than
 * the first N, so the sample is not all one genus.
 */
export function selectProbePaths(targets: readonly Target[], sample: number): string[] {
  const jpegs = targets.filter((t) => t.bucket === 'source' && /\.jpe?g$/i.test(t.path)).map((t) => t.path);
  if (sample <= 0 || jpegs.length === 0) return [];
  if (jpegs.length <= sample) return jpegs;
  const step = jpegs.length / sample;
  return Array.from({ length: sample }, (_, i) => jpegs[Math.floor(i * step)]!);
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function headOnce(url: string): Promise<{ status: number; contentType: string | null }> {
  const res = await fetch(url, { method: 'HEAD' });
  return { status: res.status, contentType: res.headers.get('content-type') };
}

/** HEAD with a retry ladder — a blip must not read as a missing object. */
async function head(url: string): Promise<{ status: number; contentType: string | null }> {
  const delays = [500, 2000, 5000, 10000, 20000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await headOnce(url);
    } catch (err) {
      if (attempt >= delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]!));
    }
  }
}

/**
 * Re-check every non-ok result one at a time before believing it.
 *
 * Learned the hard way: a first full run reported 6 consecutive `fetch failed`
 * errors on one species, all of which served 200 when asked again calmly. Under
 * concurrency a local network hiccup lands as a burst, and this script's whole
 * reason to exist is refusing to fail a cutover on a blip. Serial, unbounded by
 * CONCURRENCY, so a genuine 404 still surfaces — just not a contended one.
 */
async function recheck(failures: readonly CheckResult[], origin: string): Promise<CheckResult[]> {
  const settled: CheckResult[] = [];
  for (const f of failures) {
    try {
      const { status, contentType } = await head(objectUrl(origin, f.path));
      settled.push(classify(f, status, contentType));
    } catch (err) {
      settled.push({ ...f, status: 0, contentType: null, verdict: 'error', detail: String(err) });
    }
  }
  return settled;
}

async function sweep(targets: readonly Target[], origin: string): Promise<CheckResult[]> {
  const results: CheckResult[] = new Array(targets.length);
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      const target = targets[index];
      if (!target) return;
      try {
        const { status, contentType } = await head(objectUrl(origin, target.path));
        results[index] = classify(target, status, contentType);
      } catch (err) {
        results[index] = {
          ...target, status: 0, contentType: null, verdict: 'error', detail: String(err),
        };
      }
      done++;
      if (done % 1000 === 0) {
        console.log(`  …${done.toLocaleString('en-US')} / ${targets.length.toLocaleString('en-US')}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return results;
}

/**
 * Ask both origins for the same legacy JPEG with a WebP-capable Accept header.
 *
 * This is the one behaviour the cutover actually removes, and the report should
 * state it as a measured fact rather than an expectation: production converts,
 * staging serves the stored JPEG.
 */
async function probeNegotiation(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  console.log('\nWebP content-negotiation probe (the one behaviour the cutover removes):');
  for (const path of paths) {
    const headers = { 'Accept': 'image/webp,image/avif,image/*,*/*;q=0.8' };
    console.log(`  ${path}`);
    // Diagnostic output only — it must never decide the verdict, and a blip here
    // must never discard a completed sweep. This runs before the PASS/FAIL
    // summary, so an escaping rejection would kill the process holding a clean
    // 26,927-object result (caught in review on #227).
    try {
      const [prod, staging] = await Promise.all([
        fetch(objectUrl(PROD_ORIGIN, path), { method: 'HEAD', headers }),
        fetch(objectUrl(STAGING_ORIGIN, path), { method: 'HEAD', headers }),
      ]);
      const fmt = (r: Response): string =>
        `${r.status} ${(r.headers.get('content-type') ?? '?').split(';')[0]} ${r.headers.get('content-length') ?? '?'}B`;
      console.log(`    production: ${fmt(prod)}`);
      console.log(`    staging:    ${fmt(staging)}`);
    } catch (err) {
      console.log(`    probe unavailable (${String(err)}) — does not affect the verdict`);
    }
  }
  console.log(
    '  Expected: production answers image/webp, staging answers image/jpeg at a larger size.\n' +
    '  Harmless — no template requests these paths any more (ADR 0022); they are reachable\n' +
    '  only by direct link and by already-scraped og:image cards.',
  );
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!DRY_RUN && !STAGING_ORIGIN) {
    console.error(
      '[verify-cdn-cutover] STAGING_ORIGIN is required.\n' +
      '  Create a second pull zone against the pnwmoths storage zone with the Optimizer\n' +
      '  DISABLED, then re-run with STAGING_ORIGIN=https://<zone>.b-cdn.net\n' +
      '  Use DRY_RUN=1 to see the plan without it.',
    );
    process.exit(1);
  }
  if (STAGING_ORIGIN && STAGING_ORIGIN === PROD_ORIGIN) {
    console.error(
      `[verify-cdn-cutover] STAGING_ORIGIN is the production origin (${PROD_ORIGIN}).\n` +
      '  That would verify nothing: production still has the Optimizer enabled.',
    );
    process.exit(1);
  }

  const siteDir = resolve(SITE_DIR);
  if (!existsSync(siteDir)) {
    console.error(`[verify-cdn-cutover] SITE_DIR "${SITE_DIR}" does not exist. Run the build first.`);
    process.exit(1);
  }

  const manifestPaths = readManifestPaths(resolve(MANIFEST_PATH));
  const pages = readPages(siteDir);
  let targets = buildTargets({ manifestPaths, pages, prodOrigin: PROD_ORIGIN });

  const derivatives = targets.filter((t) => t.bucket === 'derivative').length;
  const sources = targets.length - derivatives;
  console.log(
    `[verify-cdn-cutover] ${targets.length.toLocaleString('en-US')} object(s) to check: ` +
    `${derivatives.toLocaleString('en-US')} derivative(s) from ${MANIFEST_PATH}, ` +
    `${sources.toLocaleString('en-US')} non-derivative image(s) from ${pages.length.toLocaleString('en-US')} built page(s)`,
  );

  if (LIMIT > 0 && LIMIT < targets.length) {
    // Evenly spaced rather than the first N, so a pilot is not all one genus.
    const step = targets.length / LIMIT;
    targets = Array.from({ length: LIMIT }, (_, i) => targets[Math.floor(i * step)]!);
    console.log(`[verify-cdn-cutover] LIMIT=${LIMIT} — checking an evenly spaced sample`);
  }

  if (DRY_RUN) {
    console.log('[verify-cdn-cutover] DRY_RUN — no requests made. First few targets:');
    for (const t of targets.slice(0, 5)) console.log(`  ${t.bucket.padEnd(10)} ${t.path}`);
    process.exit(0);
  }

  console.log(`[verify-cdn-cutover] HEAD sweep against ${STAGING_ORIGIN}, concurrency ${CONCURRENCY}…`);
  const results = await sweep(targets, STAGING_ORIGIN);

  let failures = results.filter((r) => r.verdict !== 'ok');
  if (failures.length > 0) {
    console.log(
      `\n[verify-cdn-cutover] ${failures.length} object(s) did not pass — re-checking each serially ` +
      'before reporting, since a network hiccup under concurrency lands as a burst…',
    );
    const settled = await recheck(failures, STAGING_ORIGIN);
    const recovered = settled.filter((r) => r.verdict === 'ok').length;
    if (recovered > 0) console.log(`[verify-cdn-cutover] ${recovered} recovered on re-check (transient)`);
    failures = settled.filter((r) => r.verdict !== 'ok');
  }

  const byVerdict = new Map<string, CheckResult[]>();
  for (const f of failures) {
    const list = byVerdict.get(f.verdict) ?? [];
    list.push(f);
    byVerdict.set(f.verdict, list);
  }

  for (const [verdict, list] of byVerdict) {
    console.error(`\n[verify-cdn-cutover] ${verdict.toUpperCase()}: ${list.length} object(s)`);
    for (const f of list.slice(0, 30)) console.error(`  ${f.path} — ${f.detail}`);
    if (list.length > 30) console.error(`  …and ${list.length - 30} more`);
  }

  await probeNegotiation(selectProbePaths(targets, PROBE_SAMPLE));

  if (failures.length > 0) {
    console.error(
      `\n[verify-cdn-cutover] FAIL: ${failures.length.toLocaleString('en-US')} of ` +
      `${results.length.toLocaleString('en-US')} object(s) are not correctly served with the Optimizer off. ` +
      'Do NOT disable the Optimizer on production until this is empty.',
    );
    process.exit(1);
  }

  console.log(
    `\n[verify-cdn-cutover] PASS: all ${results.length.toLocaleString('en-US')} object(s) served 200 ` +
    'with the expected content type, Optimizer disabled.',
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
