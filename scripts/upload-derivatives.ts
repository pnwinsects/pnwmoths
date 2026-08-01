/**
 * scripts/upload-derivatives.ts
 *
 * Phase 2 of retiring the Bunny Optimizer (#224 / #211, docs/adr/0022): ship the
 * 23,338 pre-generated variants to the `derived/` prefix on the Bunny Storage Zone.
 *
 * Safe to run well ahead of the template switch (#225). The upload is additive
 * (ADR 0008) and images carry a long TTL (ADR 0009), so derivatives can sit
 * unused on the CDN until the cutover flips the URLs over to them.
 *
 * State lives in var/derivatives-manifest.csv, shared with generate-derivatives.ts:
 * rows advance generated → uploaded. A rerun with everything uploaded makes ZERO
 * PUTs. On completion the committed artifact data/image-derivatives.csv is emitted
 * from the uploaded rows — that file is what the build guard in #226 checks against,
 * so it deliberately records what is *on the CDN*, not what exists locally.
 *
 * Unlike upload-tiles.ts / upload-images.ts this uses fetch rather than curl:
 * `curl -H "AccessKey: $PASSWORD"` puts the secret in argv, where any process on
 * the machine can read it out of the process table. A request header does not.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/upload-derivatives.ts                       # plan, zero API calls
 *   LIMIT=20 BUNNY_STORAGE_PASSWORD=... node scripts/upload-derivatives.ts   # pilot
 *   BUNNY_STORAGE_PASSWORD=... node scripts/upload-derivatives.ts      # full run
 *
 * Environment variables:
 *   BUNNY_STORAGE_PASSWORD — Storage Zone password (required unless DRY_RUN)
 *   BUNNY_STORAGE_HOST     — storage endpoint (default la.storage.bunnycdn.com)
 *   BUNNY_ZONE             — storage zone name (default pnwmoths)
 *   DRY_RUN                — "1" to print the plan without uploading
 *   LIMIT                  — upload at most N files (pilot runs)
 *   CONCURRENCY            — parallel uploads (default 8)
 *   INPUT_DIR              — local derivative root (default var/derivatives)
 */

import { resolve, dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { acquireManifestLock, releaseManifestLock } from './lib/derivatives.ts';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention; mirrors upload-tiles.ts).
// ---------------------------------------------------------------------------

const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const LIMIT: number = Number(process.env['LIMIT'] ?? '0');
const CONCURRENCY: number = Math.max(1, Number(process.env['CONCURRENCY'] ?? '8'));
const INPUT_DIR: string = resolve(process.env['INPUT_DIR'] ?? 'var/derivatives');
const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const MANIFEST_PATH: string = resolve('var/derivatives-manifest.csv');
const OUTPUT_PATH: string = resolve('data/image-derivatives.csv');
const LOCK_PATH: string = resolve('var/derivatives-manifest.lock');
const MANIFEST_COLUMNS = ['derived_path', 'source_path', 'kind', 'variant', 'status', 'bytes', 'error'] as const;
const OUTPUT_COLUMNS = ['derived_path', 'source_path', 'kind', 'variant', 'bytes'] as const;

export interface ManifestRow {
  derived_path: string;
  source_path: string;
  kind: string;
  variant: string;
  status: string;
  bytes: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Self-contained helpers (ADR 0013: each script runs independently).
// ---------------------------------------------------------------------------

/** Redact the storage password from anything headed for a log. */
export function redact(message: string, secret: string = BUNNY_STORAGE_PASSWORD): string {
  if (!secret) return message;
  return message.split(secret).join('[REDACTED]');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function logStage(message: string): void {
  console.log(`[upload-derivatives] ${message}`);
}

/** Encode each path segment, preserving separators. Django-era names contain spaces. */
export function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function storageUrl(derivedPath: string, host: string, zone: string): string {
  return `https://${host}/${zone}/${encodeStoragePath(derivedPath)}`;
}

// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------

export function readManifest(path: string): ManifestRow[] {
  if (!existsSync(path)) return [];
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true }) as ManifestRow[];
}

function writeManifest(path: string, rows: readonly ManifestRow[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify([...rows], { header: true, columns: [...MANIFEST_COLUMNS] }));
}

/**
 * The committed artifact the build guard (#226) checks against.
 *
 * Only `uploaded` rows are included — deliberately. A derivative that exists on
 * this laptop but not on the CDN must fail the guard, not pass it.
 */
export function emitCommittedManifest(rows: readonly ManifestRow[]): string {
  const uploaded = rows
    .filter((r) => r.status === 'uploaded')
    .map((r) => ({
      derived_path: r.derived_path,
      source_path: r.source_path,
      kind: r.kind,
      variant: r.variant,
      bytes: r.bytes,
    }))
    .sort((a, b) => a.derived_path.localeCompare(b.derived_path));
  return stringify(uploaded, { header: true, columns: [...OUTPUT_COLUMNS] });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

async function putFile(localFile: string, derivedPath: string): Promise<void> {
  const url = storageUrl(derivedPath, BUNNY_STORAGE_HOST, BUNNY_ZONE);
  const body = readFileSync(localFile);
  const delays = [2000, 4000, 8000, 16000, 32000];

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: { 'AccessKey': BUNNY_STORAGE_PASSWORD, 'Content-Type': 'application/octet-stream' },
        body,
      });
    } catch (err) {
      if (attempt >= delays.length) {
        throw new Error(redact(`PUT ${derivedPath} failed after ${delays.length} retries: ${String(err)}`));
      }
      await sleep(delays[attempt]!);
      continue;
    }

    if (res.ok) return;

    // 4xx other than 429 is a real rejection — retrying just burns time.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new Error(redact(`PUT ${derivedPath} → ${res.status} ${res.statusText}`));
    }
    if (attempt >= delays.length) {
      throw new Error(redact(`PUT ${derivedPath} → ${res.status} after ${delays.length} retries`));
    }
    await sleep(delays[attempt]!);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rows = readManifest(MANIFEST_PATH);
  if (rows.length === 0) {
    console.error(`ERROR: no manifest at ${MANIFEST_PATH}. Run generate-derivatives.ts first.`);
    process.exit(1);
  }

  // Self-heal from the committed record. data/image-derivatives.csv is the
  // durable statement of what is on the CDN; var/ is scratch. If a manifest row
  // is already listed there, it is uploaded regardless of what the scratch file
  // says — which recovers both a wiped var/ and the concurrent-write race that
  // reset 20 rows during the #224 pilot.
  const alreadyOnCdn = new Set(
    readManifest(OUTPUT_PATH).map((r) => r.derived_path),
  );
  let reconciled = 0;
  for (const row of rows) {
    if (row.status === 'generated' && alreadyOnCdn.has(row.derived_path)) {
      row.status = 'uploaded';
      reconciled++;
    }
  }
  if (reconciled > 0) logStage(`Reconciled ${reconciled} row(s) already recorded on the CDN.`);

  const byStatus: Record<string, number> = {};
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

  const pending = rows.filter((r) => r.status === 'generated');
  const todo = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

  // DRY_RUN guard BEFORE the password guard (ADR 0013) — pre-flight needs no key.
  if (DRY_RUN) {
    logStage(`[dry-run] manifest: ${rows.length.toLocaleString('en-US')} rows ${JSON.stringify(byStatus)}`);
    logStage(`[dry-run] would upload: ${todo.length.toLocaleString('en-US')}`);
    logStage(`[dry-run] destination: https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/derived/…`);
    const missing = todo.filter((r) => !existsSync(join(INPUT_DIR, r.derived_path)));
    if (missing.length > 0) {
      logStage(`[dry-run] ⚠️  ${missing.length} manifest row(s) have no local file — regenerate first`);
      for (const row of missing.slice(0, 5)) logStage(`[dry-run]     ${row.derived_path}`);
    }
    for (const row of todo.slice(0, 5)) {
      logStage(`[dry-run]   ${row.derived_path} (${row.bytes} B)`);
    }
    if (todo.length > 5) logStage(`[dry-run]   … and ${(todo.length - 5).toLocaleString('en-US')} more`);
    logStage('[dry-run] zero API calls made.');
    return;
  }

  if (!BUNNY_STORAGE_PASSWORD) {
    console.error('ERROR: BUNNY_STORAGE_PASSWORD is required (or set DRY_RUN=1).');
    process.exit(1);
  }

  acquireManifestLock(LOCK_PATH);
  process.on('exit', () => releaseManifestLock(LOCK_PATH));

  if (todo.length === 0) {
    logStage(`Nothing to upload — ${byStatus['uploaded'] ?? 0} already on the CDN.`);
    writeFileSync(OUTPUT_PATH, emitCommittedManifest(rows));
    logStage(`Committed manifest: ${OUTPUT_PATH}`);
    return;
  }

  logStage(`Uploading ${todo.length.toLocaleString('en-US')} derivative(s), concurrency ${CONCURRENCY}…`);

  let uploaded = 0;
  let failed = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      const row = todo[index];
      if (!row) return;
      const localFile = join(INPUT_DIR, row.derived_path);

      if (!existsSync(localFile)) {
        row.status = 'failed';
        row.error = 'local file missing at upload time';
        failed++;
        continue;
      }

      try {
        await putFile(localFile, row.derived_path);
        // Status advances only after the PUT returns ok, so an interrupted run
        // never records an upload that did not happen (ADR 0013).
        row.status = 'uploaded';
        row.bytes = String(statSync(localFile).size);
        row.error = '';
        uploaded++;
      } catch (err) {
        row.status = 'failed';
        row.error = redact(err instanceof Error ? err.message : String(err)).slice(0, 300);
        failed++;
        console.warn(`  ✗ ${row.derived_path}: ${row.error}`);
      }

      if ((index + 1) % 250 === 0) {
        writeManifest(MANIFEST_PATH, rows);
        logStage(`  … ${uploaded.toLocaleString('en-US')} uploaded, ${failed} failed`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, () => worker()));
  writeManifest(MANIFEST_PATH, rows);
  writeFileSync(OUTPUT_PATH, emitCommittedManifest(rows));

  logStage(`Done: ${uploaded.toLocaleString('en-US')} uploaded, ${failed} failed.`);
  logStage(`Committed manifest: ${OUTPUT_PATH}`);
  if (failed > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(redact(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
}
