/**
 * scripts/download-analytics.ts
 *
 * Downloads analytics JSON files from Bunny Storage Zone (`_analytics/`)
 * into the local `data/analytics/` directory. Called during the build so
 * the Eleventy site can render an analytics dashboard without the data
 * living in git.
 *
 * Environment variables:
 *   BUNNY_STORAGE_PASSWORD — Storage Zone password (required; falls back to BUNNY_API_KEY)
 *   BUNNY_STORAGE_HOST     — Storage hostname (default: la.storage.bunnycdn.com)
 *   BUNNY_ZONE             — Zone name (default: pnwmoths)
 *   ANALYTICS_DIR          — Local output directory (default: data/analytics)
 *   DRY_RUN                — "1" to print plan without downloading
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string =
  process.env['BUNNY_STORAGE_PASSWORD'] ?? process.env['BUNNY_API_KEY'] ?? '';
const ANALYTICS_DIR: string = process.env['ANALYTICS_DIR'] ?? 'data/analytics';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

/** Storage prefix for analytics files (must match upload-analytics.ts). */
export const STORAGE_PREFIX = '_analytics';

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
  Guid: string;
  ObjectName: string;
  Length: number;
  LastChanged: string;
  IsDirectory: boolean;
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

/**
 * List analytics files in the storage zone. Returns filenames matching
 * the YYYY-MM-DD.json pattern.
 */
export async function listRemoteFiles(): Promise<string[]> {
  const res = await fetchWithRetry(analyticsListUrl(), 'list analytics');

  // 404 means the directory doesn't exist yet — no files uploaded
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(redact(`List analytics: HTTP ${res.status} ${res.statusText}`));
  }

  const objects = (await res.json()) as StorageObject[];
  return objects
    .filter((obj) => !obj.IsDirectory && /^\d{4}-\d{2}-\d{2}\.json$/.test(obj.ObjectName))
    .map((obj) => obj.ObjectName)
    .sort();
}

/**
 * Download a single analytics file and return its contents.
 */
async function downloadFile(filename: string): Promise<string> {
  const res = await fetchWithRetry(analyticsFileUrl(filename), `download ${filename}`);
  if (!res.ok) {
    throw new Error(redact(`Download ${filename}: HTTP ${res.status} ${res.statusText}`));
  }
  return await res.text();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!BUNNY_STORAGE_PASSWORD && !DRY_RUN) {
    console.error('❌ BUNNY_STORAGE_PASSWORD is required.');
    console.error('   Set it to the Storage Zone password from bunny.net dashboard.');
    process.exit(1);
  }

  const outDir = resolve(ANALYTICS_DIR);
  console.log(`📥 Downloading analytics from Bunny Storage…`);
  console.log(`   Zone: ${BUNNY_ZONE}, prefix: ${STORAGE_PREFIX}/`);
  console.log(`   Output: ${outDir}`);

  if (DRY_RUN) {
    console.log('[dry-run] Would list and download files from:', analyticsListUrl());
    return;
  }

  const files = await listRemoteFiles();
  if (files.length === 0) {
    console.log('   No analytics files found in storage. Continuing without analytics data.');
    return;
  }

  console.log(`   Found ${files.length} file(s).`);

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let downloaded = 0;
  for (const filename of files) {
    const content = await downloadFile(filename);
    writeFileSync(join(outDir, filename), content);
    downloaded++;
  }
  console.log(`\n📥 Done — downloaded ${downloaded} file(s) to ${outDir}.`);
}

// ---------------------------------------------------------------------------
// Entry guard
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1]?.replace(/\\/g, '/').endsWith('download-analytics.ts')
  || process.argv[1]?.replace(/\\/g, '/').endsWith('download-analytics.js');

if (isMainModule) {
  main().catch((err) => {
    console.error(redact(String(err)));
    process.exit(1);
  });
}
