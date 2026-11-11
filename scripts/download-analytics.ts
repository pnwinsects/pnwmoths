/**
 * scripts/download-analytics.ts
 *
 * Brings the local `data/analytics/` directory up to date with the daily
 * analytics files in the Bunny Storage Zone (`_analytics/`), so the Eleventy
 * site can render the analytics dashboard without the data living in git.
 *
 * Only new or changed files are downloaded. The production workflow keeps
 * `data/analytics/` in the GitHub Actions cache between builds, and a day's
 * file never changes once the nightly job has uploaded it, so a deploy usually
 * downloads one file rather than every day since launch. A cached file counts
 * as current when its SHA256 matches the checksum in Bunny's listing, or, when
 * Bunny gives no checksum, when its size matches.
 *
 * A file that cannot be downloaded does not stop the build (issue #450, ADR
 * 0058). Bunny once answered 502 for one July file for hours, which blocked
 * three deploys of unrelated changes. Instead the cached copy is kept, or the
 * day is left out, and the script exits 2 so the workflow can open a tracking
 * issue. The analytics loader already tolerates missing and malformed days
 * (`src/_data/analytics.ts`).
 *
 * Exit codes:
 *   0 — every file listed on Bunny is present locally and current
 *   1 — misconfiguration or a bug: no password, or an unexpected crash
 *   2 — incomplete: the listing or some downloads failed; see the report
 *
 * Environment variables:
 *   BUNNY_STORAGE_PASSWORD — Storage Zone password (required)
 *   BUNNY_STORAGE_HOST     — Storage hostname (default: la.storage.bunnycdn.com)
 *   BUNNY_ZONE             — Zone name (default: pnwmoths)
 *   ANALYTICS_DIR          — Local output directory (default: data/analytics)
 *   ANALYTICS_REPORT       — If set, path to write a Markdown description of an
 *                            incomplete download (written only on exit 2)
 *   DRY_RUN                — "1" to print plan without downloading
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const ANALYTICS_DIR: string = process.env['ANALYTICS_DIR'] ?? 'data/analytics';
const ANALYTICS_REPORT: string = process.env['ANALYTICS_REPORT'] ?? '';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

/** Storage prefix for analytics files (must match upload-analytics.ts). */
export const STORAGE_PREFIX = '_analytics';

/** Exit code for a download that left some files missing or out of date. */
export const EXIT_INCOMPLETE = 2;

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Downloads that fail in a row before the rest are not attempted. Each failure
 * spends about 30 seconds on retries, so with an empty cache and Bunny failing
 * every request, trying all ~130 files would hold the build for over an hour.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function redact(msg: string): string {
  return BUNNY_STORAGE_PASSWORD
    ? msg.split(BUNNY_STORAGE_PASSWORD).join('[REDACTED]')
    : msg;
}

/** Build the list URL for the analytics directory in the storage zone. */
export function analyticsListUrl(): string {
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${STORAGE_PREFIX}/`;
}

/** Build the download URL for a specific analytics file. */
export function analyticsFileUrl(filename: string): string {
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${STORAGE_PREFIX}/${encodeURIComponent(filename)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StorageObject {
  ObjectName: string;
  Length: number;
  IsDirectory: boolean;
  /** Uppercase SHA256 hex; absent or null on some objects. */
  Checksum?: string | null;
}

/** One daily file as Bunny's listing describes it. */
export interface RemoteFile {
  name: string;
  length: number;
  /** Uppercase SHA256 hex, or null when Bunny gave none. */
  checksum: string | null;
}

/**
 * What happened to one remote file:
 * - `current`    — the local copy already matched, so nothing was downloaded
 * - `downloaded` — fetched and written
 * - `stale`      — the download failed and an older local copy was kept
 * - `missing`    — the download failed and there is no local copy
 */
export type FileStatus = 'current' | 'downloaded' | 'stale' | 'missing';

export interface FileOutcome {
  name: string;
  status: FileStatus;
  /** Why the download failed, for `stale` and `missing`. */
  error?: string;
}

export interface SyncResult {
  /** Set when the listing itself failed; `files` is then empty. */
  listingError: string | null;
  files: FileOutcome[];
  /** Day files on disk after the sync, whether or not Bunny still lists them. */
  localCount: number;
}

export interface SyncDeps {
  list(): Promise<RemoteFile[]>;
  /** The file's bytes, exactly as stored, so they can be checked against the listing. */
  download(name: string): Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  const delays = [2000, 4000, 8000, 16000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { AccessKey: BUNNY_STORAGE_PASSWORD, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt >= delays.length) throw err;
      await sleep(delays[attempt]!);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= delays.length) {
        throw new Error(redact(`${label}: HTTP ${res.status} after ${delays.length} retries`));
      }
      await sleep(delays[attempt]!);
      continue;
    }

    return res;
  }
  throw new Error(`${label}: exhausted retries`);
}

/** List the daily files in the storage zone, oldest first. */
export async function listRemoteFiles(): Promise<RemoteFile[]> {
  const res = await fetchWithRetry(analyticsListUrl(), 'list analytics');

  // 404 means the directory doesn't exist yet — no files uploaded
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(redact(`List analytics: HTTP ${res.status} ${res.statusText}`));
  }

  const objects = (await res.json()) as StorageObject[];
  return objects
    .filter((obj) => !obj.IsDirectory && DAY_FILE.test(obj.ObjectName))
    .map((obj) => ({ name: obj.ObjectName, length: obj.Length, checksum: obj.Checksum || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Download a single analytics file and return its bytes. */
async function downloadFile(filename: string): Promise<Uint8Array> {
  const res = await fetchWithRetry(analyticsFileUrl(filename), `download ${filename}`);
  if (!res.ok) {
    throw new Error(redact(`Download ${filename}: HTTP ${res.status} ${res.statusText}`));
  }
  return new Uint8Array(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Whether `bytes` match `remote`: by SHA256 when Bunny reported one, otherwise
 * by size. Size alone still catches the likely damage, a download cut short.
 */
export function matchesListing(bytes: Uint8Array, remote: RemoteFile): boolean {
  if (remote.checksum) {
    const sha = createHash('sha256').update(bytes).digest('hex');
    return sha.toUpperCase() === remote.checksum.toUpperCase();
  }
  return bytes.byteLength === remote.length;
}

/** Whether the file at `path` exists and matches `remote`. */
export function isCurrent(path: string, remote: RemoteFile): boolean {
  if (!existsSync(path)) return false;
  if (!remote.checksum) return statSync(path).size === remote.length;
  return matchesListing(readFileSync(path), remote);
}

function countLocal(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => DAY_FILE.test(f)).length;
}

/**
 * Bring `outDir` up to date with Bunny. A failure to list or download is
 * recorded in the result rather than thrown; a failure to write locally is
 * thrown, because that is a fault in the build machine, not in Bunny.
 * Existing local files that Bunny no longer lists are left alone.
 */
export async function syncAnalytics(outDir: string, deps: SyncDeps): Promise<SyncResult> {
  let remote: RemoteFile[];
  try {
    remote = await deps.list();
  } catch (err) {
    return { listingError: redact(String((err as Error).message ?? err)), files: [], localCount: countLocal(outDir) };
  }

  mkdirSync(outDir, { recursive: true });
  const files: FileOutcome[] = [];
  let failuresInARow = 0;
  for (const entry of remote) {
    const path = join(outDir, entry.name);
    if (isCurrent(path, entry)) {
      files.push({ name: entry.name, status: 'current' });
      continue;
    }
    if (failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
      const error = `not attempted after ${MAX_CONSECUTIVE_FAILURES} downloads in a row failed`;
      files.push({ name: entry.name, status: existsSync(path) ? 'stale' : 'missing', error });
      continue;
    }
    let content: Uint8Array;
    try {
      content = await deps.download(entry.name);
      if (!matchesListing(content, entry)) {
        throw new Error(`download ${entry.name}: received ${content.byteLength} bytes that do not match Bunny's listing`);
      }
    } catch (err) {
      const error = redact(String((err as Error).message ?? err));
      files.push({ name: entry.name, status: existsSync(path) ? 'stale' : 'missing', error });
      failuresInARow++;
      continue;
    }
    failuresInARow = 0;
    // Write beside the target and rename, so a crash mid-write cannot leave a
    // truncated file for the cache to keep.
    const tmp = `${path}.part`;
    writeFileSync(tmp, content);
    renameSync(tmp, path);
    files.push({ name: entry.name, status: 'downloaded' });
  }
  return { listingError: null, files, localCount: countLocal(outDir) };
}

/** True when every file Bunny lists is present locally and current. */
export function isComplete(result: SyncResult): boolean {
  return result.listingError === null
    && result.files.every((f) => f.status === 'current' || f.status === 'downloaded');
}

/** How many files this run wrote, which is what decides whether to re-save the cache. */
export function downloadedCount(result: SyncResult): number {
  return result.files.filter((f) => f.status === 'downloaded').length;
}

/**
 * Describe an incomplete download in Markdown, for the tracking issue. Says
 * what the analytics page will show, then lists each failure.
 */
export function renderReport(result: SyncResult): string {
  const lines: string[] = [];
  if (result.listingError !== null) {
    lines.push(
      `The production build could not list the analytics files on Bunny, so it built \`/analytics/\` from the ${result.localCount} daily file(s) cached by earlier deploys. Any day uploaded since then is missing from the page.`,
      '',
      '```',
      result.listingError,
      '```',
    );
    return lines.join('\n') + '\n';
  }

  const failed = result.files.filter((f) => f.status === 'stale' || f.status === 'missing');
  const missing = failed.filter((f) => f.status === 'missing').length;
  const stale = failed.length - missing;
  const effects: string[] = [];
  if (missing > 0) effects.push(`${missing} day(s) are missing from \`/analytics/\``);
  if (stale > 0) effects.push(`${stale} day(s) are shown from an older copy cached by an earlier deploy`);
  lines.push(
    `The production build could not download ${failed.length} of the ${result.files.length} analytics files on Bunny. The build continued, but ${effects.join(', and ')}.`,
    '',
  );
  for (const f of failed) {
    const kept = f.status === 'stale' ? 'older copy kept' : 'no copy';
    lines.push(`- \`${f.name}\` (${kept}): ${f.error ?? 'unknown error'}`);
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  if (!BUNNY_STORAGE_PASSWORD && !DRY_RUN) {
    console.error('❌ BUNNY_STORAGE_PASSWORD is required.');
    console.error('   Set it to the Storage Zone password from bunny.net dashboard.');
    return 1;
  }

  const outDir = resolve(ANALYTICS_DIR);
  console.log(`📥 Downloading analytics from Bunny Storage…`);
  console.log(`   Zone: ${BUNNY_ZONE}, prefix: ${STORAGE_PREFIX}/`);
  console.log(`   Output: ${outDir} (${countLocal(outDir)} file(s) already present)`);

  if (DRY_RUN) {
    console.log('[dry-run] Would list and download files from:', analyticsListUrl());
    return 0;
  }

  const result = await syncAnalytics(outDir, { list: listRemoteFiles, download: downloadFile });

  if (isComplete(result)) {
    const current = result.files.length - downloadedCount(result);
    console.log(`📥 Done — ${result.files.length} file(s) on Bunny: downloaded ${downloadedCount(result)}, ${current} already current.`);
    return 0;
  }

  const report = renderReport(result);
  console.warn(`⚠️  Analytics download incomplete; continuing without the missing data.\n${report}`);
  if (ANALYTICS_REPORT) writeFileSync(ANALYTICS_REPORT, report);
  return EXIT_INCOMPLETE;
}

// ---------------------------------------------------------------------------
// Entry guard
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1]?.replace(/\\/g, '/').endsWith('download-analytics.ts')
  || process.argv[1]?.replace(/\\/g, '/').endsWith('download-analytics.js');

if (isMainModule) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(redact(String(err)));
      process.exit(1);
    },
  );
}
