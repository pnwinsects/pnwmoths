/**
 * scripts/upload-analytics.ts
 *
 * Uploads a daily analytics JSON file to the Bunny Storage Zone at
 * `_analytics/YYYY-MM-DD.json`. Called by the nightly analytics workflow
 * after fetch-analytics.ts produces the local file.
 *
 * The `_analytics/` prefix keeps these internal data files separate from
 * the public site content in the same zone.
 *
 * Environment variables:
 *   BUNNY_STORAGE_PASSWORD — Storage Zone password (required)
 *   BUNNY_STORAGE_HOST     — Storage hostname (default: la.storage.bunnycdn.com)
 *   BUNNY_ZONE             — Zone name (default: pnwmoths)
 *   ANALYTICS_DIR          — Local directory to upload from (default: data/analytics)
 *   ANALYTICS_DATE         — Specific date file to upload (YYYY-MM-DD); omit to upload all
 *   DRY_RUN                — "1" to print plan without uploading
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const ANALYTICS_DIR: string = process.env['ANALYTICS_DIR'] ?? 'data/analytics';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

/** Storage prefix for analytics files (underscore signals internal data). */
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

/**
 * Build the Bunny Storage Zone URL for an analytics file.
 */
export function analyticsStorageUrl(filename: string): string {
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${STORAGE_PREFIX}/${encodeURIComponent(filename)}`;
}

/**
 * List local analytics JSON files (YYYY-MM-DD.json pattern).
 */
export function listLocalFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function putFile(filename: string, body: Uint8Array): Promise<void> {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(analyticsStorageUrl(filename), {
        method: 'PUT',
        headers: {
          AccessKey: BUNNY_STORAGE_PASSWORD,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt >= delays.length) throw err;
      const waitMs = delays[attempt]!;
      console.warn(`  ⏳ Network error on ${filename}, retrying in ${waitMs / 1000}s`);
      await sleep(waitMs);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= delays.length) {
        throw new Error(redact(`Upload ${filename}: HTTP ${res.status} after ${delays.length} retries`));
      }
      const waitMs = delays[attempt]!;
      console.warn(`  ⏳ ${res.status} on ${filename}, retrying in ${waitMs / 1000}s`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      throw new Error(redact(`Upload ${filename}: HTTP ${res.status} ${res.statusText}`));
    }
    return;
  }
  throw new Error(`Upload ${filename}: exhausted retries`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dir = resolve(ANALYTICS_DIR);
  const dateFilter = process.env['ANALYTICS_DATE'];

  let files: string[];
  if (dateFilter) {
    const target = `${dateFilter}.json`;
    if (!existsSync(join(dir, target))) {
      console.error(`❌ Analytics file not found: ${join(dir, target)}`);
      process.exit(1);
    }
    files = [target];
  } else {
    files = listLocalFiles(dir);
  }

  if (files.length === 0) {
    console.log('No analytics files to upload.');
    return;
  }

  console.log(`📤 Uploading ${files.length} analytics file(s) to Bunny Storage…`);
  console.log(`   Zone: ${BUNNY_ZONE}, prefix: ${STORAGE_PREFIX}/`);

  if (DRY_RUN) {
    for (const f of files) {
      console.log(`  [dry-run] PUT ${analyticsStorageUrl(f)}`);
    }
    return;
  }

  if (!BUNNY_STORAGE_PASSWORD) {
    console.error('❌ BUNNY_STORAGE_PASSWORD is required.');
    console.error('   Set it to the Storage Zone password from bunny.net dashboard.');
    process.exit(1);
  }

  let uploaded = 0;
  for (const filename of files) {
    const body = readFileSync(join(dir, filename));
    await putFile(filename, body);
    uploaded++;
    console.log(`  ✅ ${filename}`);
  }
  console.log(`\n📤 Done — uploaded ${uploaded} file(s).`);
}

// ---------------------------------------------------------------------------
// Entry guard
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1]?.replace(/\\/g, '/').endsWith('upload-analytics.ts')
  || process.argv[1]?.replace(/\\/g, '/').endsWith('upload-analytics.js');

if (isMainModule) {
  main().catch((err) => {
    console.error(redact(String(err)));
    process.exit(1);
  });
}
