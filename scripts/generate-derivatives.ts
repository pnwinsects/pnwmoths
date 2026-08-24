/**
 * scripts/generate-derivatives.ts
 *
 * Phase 1 of retiring the Bunny Optimizer (#223 / #211, docs/adr/0022):
 * pre-generate every image variant the Optimizer produces on demand today.
 *
 * Sources are read from the CDN, not from Dropbox — the 1500px `_thumbnail.webp`
 * the tiling pipeline already emits (3,811 specimens) and the ~4,034 legacy
 * originals are all that is needed, so the 1 TB of TIFFs is never touched.
 *
 * 23,338 derivatives across 7,858 sources. Manifest-driven, resumable and
 * idempotent: a rerun after a complete run does no work and makes no writes.
 *
 * Needs NO credentials — CDN reads are public and output is local. Uploading is
 * scripts/upload-derivatives.ts (#224), which owns BUNNY_STORAGE_PASSWORD.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/generate-derivatives.ts        # print the plan, no work
 *   LIMIT=8 node scripts/generate-derivatives.ts          # vertical-slice pilot
 *   node scripts/generate-derivatives.ts                  # full run
 *   KIND=glossary node scripts/generate-derivatives.ts    # one source family
 *   ONLY=clostera-brucei node scripts/generate-derivatives.ts   # one species
 *
 * Environment variables:
 *   DRY_RUN       — "1" to print the plan and exit without generating
 *   LIMIT         — process at most N derivatives (pilot runs)
 *   KIND          — restrict to legacy | highres | glossary | plates
 *   ONLY          — restrict to sources whose path contains this substring
 *   OUTPUT_DIR    — local output root (default var/derivatives)
 *   CONCURRENCY   — parallel workers (default 4)
 *
 * Requires: vips CLI (brew install vips).
 */

import { resolve, dirname, join } from 'node:path';
import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  buildWorkList, vipsCommands, DERIVATIVES_MANIFEST_WRITERS,
  readSources, sourcePaths, SOURCE_KINDS,
  type DerivativeSpec, type SourceKind,
} from './lib/derivatives.ts';
import { acquireManifestLock, releaseManifestLock } from './lib/manifest-lock.ts';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Module-level env constants (project convention).
// ---------------------------------------------------------------------------

const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const LIMIT: number = Number(process.env['LIMIT'] ?? '0');
const KIND: string = process.env['KIND'] ?? '';

/**
 * Substring filter on the source path, for adding a photo without re-deriving
 * the corpus (#214).
 *
 * `LIMIT` cannot do this job: it slices the front of the work list, so the eight
 * derivatives you want are only reachable by first regenerating everything ahead
 * of them. And the resumability check below treats any derivative whose local
 * file is missing as outstanding — `var/` is scratch, so on a fresh checkout that
 * is all 23,000 of them, several hours of vips, no matter how few photos actually
 * changed.
 */
const ONLY: string = process.env['ONLY'] ?? '';
const OUTPUT_DIR: string = resolve(process.env['OUTPUT_DIR'] ?? 'var/derivatives');
const CONCURRENCY: number = Math.max(1, Number(process.env['CONCURRENCY'] ?? '4'));
const CDN_BASE_URL = 'https://moths.pnwinsects.org';
const MANIFEST_PATH: string = resolve('var/derivatives-manifest.csv');
const LOCK_PATH: string = resolve('var/derivatives-manifest.lock');
const MANIFEST_COLUMNS = ['derived_path', 'source_path', 'kind', 'variant', 'status', 'bytes', 'error'] as const;

type Status = 'pending' | 'generated' | 'failed';

interface ManifestRow {
  derived_path: string;
  source_path: string;
  kind: string;
  variant: string;
  status: Status;
  bytes: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Self-contained helpers (ADR 0013: each script runs independently).
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function logStage(message: string): void {
  console.log(`[derivatives] ${message}`);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const delays = [500, 1500, 4000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delays.length) throw err;
      console.warn(`  ⚠️  ${label} failed (attempt ${attempt + 1}), retrying…`);
      await sleep(delays[attempt]!);
    }
  }
}

/** Encode each path segment, preserving separators. Django-era names contain spaces. */
export function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------

export function readManifest(path: string): Map<string, ManifestRow> {
  const rows = new Map<string, ManifestRow>();
  if (!existsSync(path)) return rows;
  const parsed = parse(readFileSync(path), { columns: true, skip_empty_lines: true }) as ManifestRow[];
  for (const row of parsed) rows.set(row.derived_path, row);
  return rows;
}

function writeManifest(path: string, rows: Map<string, ManifestRow>): void {
  mkdirSync(dirname(path), { recursive: true });
  const sorted = [...rows.values()].sort((a, b) => a.derived_path.localeCompare(b.derived_path));
  writeFileSync(path, stringify(sorted, { header: true, columns: [...MANIFEST_COLUMNS] }));
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function downloadSource(sourcePath: string, dest: string): Promise<void> {
  await withRetry(async () => {
    const url = `${CDN_BASE_URL}/${encodeStoragePath(sourcePath)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error(`GET ${url} → empty body`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
  }, `download ${sourcePath}`);
}

async function sourceDimensions(file: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync('vipsheader', ['-f', 'width', file]);
  const { stdout: h } = await execFileAsync('vipsheader', ['-f', 'height', file]);
  return { width: Number(stdout.trim()), height: Number(h.trim()) };
}

async function generateOne(spec: DerivativeSpec, sourceFile: string): Promise<number> {
  const outFile = join(OUTPUT_DIR, spec.derivedPath);
  mkdirSync(dirname(outFile), { recursive: true });
  const dims = await sourceDimensions(sourceFile);

  for (const argv of vipsCommands(spec.variant.transform, sourceFile, outFile, spec.variant.ext, dims)) {
    await execFileAsync('vips', argv);
  }

  const { size } = statSync(outFile);
  if (size === 0) throw new Error(`vips produced an empty file for ${spec.derivedPath}`);
  return size;
}

/** Group specs by source so each source downloads once, not once per variant. */
export function groupBySource(specs: readonly DerivativeSpec[]): Map<string, DerivativeSpec[]> {
  const groups = new Map<string, DerivativeSpec[]>();
  for (const spec of specs) {
    const list = groups.get(spec.sourcePath);
    if (list) list.push(spec);
    else groups.set(spec.sourcePath, [spec]);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const sources = readSources(resolve('data'));
  let specs = buildWorkList(sourcePaths(sources));
  if (KIND) {
    // A typo here used to filter the work list to zero and then report
    // "Nothing to do — all 0 derivatives present", which reads as success. The
    // runbooks now put KIND in front of a maintainer following prose, so an
    // unknown value has to be a refusal rather than a quiet no-op.
    if (!SOURCE_KINDS.includes(KIND as SourceKind)) {
      console.error(`[derivatives] KIND="${KIND}" is not a source kind. Expected one of: ${SOURCE_KINDS.join(', ')}.`);
      process.exit(1);
    }
    specs = specs.filter((s) => s.kind === (KIND as SourceKind));
  }
  if (ONLY) specs = specs.filter((s) => s.sourcePath.includes(ONLY));

  const manifest = readManifest(MANIFEST_PATH);

  // Resumability: a row is done when the manifest says generated AND the file
  // is still on disk. Checking both means a wiped var/ regenerates correctly.
  const todo = specs.filter((spec) => {
    const row = manifest.get(spec.derivedPath);
    if (row?.status !== 'generated') return true;
    return !existsSync(join(OUTPUT_DIR, spec.derivedPath));
  });
  const limited = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;

  // DRY_RUN guard first (ADR 0013) — pre-flight inspection needs no tooling.
  if (DRY_RUN) {
    logStage(`[dry-run] sources: ${sources.legacy.length} legacy, ${sources.highres.length} hi-res, ${sources.glossary.length} glossary, ${sources.plates.length} plates`);
    logStage(`[dry-run] total derivatives: ${specs.length.toLocaleString('en-US')}`);
    logStage(`[dry-run] already generated: ${(specs.length - todo.length).toLocaleString('en-US')}`);
    logStage(`[dry-run] would generate: ${limited.length.toLocaleString('en-US')}`);
    logStage(`[dry-run] output root: ${OUTPUT_DIR}`);
    for (const spec of limited.slice(0, 10)) {
      logStage(`[dry-run]   ${spec.sourcePath} → ${spec.derivedPath} (${spec.variant.transform.op})`);
    }
    if (limited.length > 10) logStage(`[dry-run]   … and ${limited.length - 10} more`);
    logStage('[dry-run] no files written.');
    return;
  }

  acquireManifestLock(LOCK_PATH, process.pid, DERIVATIVES_MANIFEST_WRITERS);
  process.on('exit', () => releaseManifestLock(LOCK_PATH));

  if (limited.length === 0) {
    logStage(`Nothing to do — all ${specs.length.toLocaleString('en-US')} derivatives present.`);
    return;
  }

  const groups = groupBySource(limited);
  logStage(`Generating ${limited.length.toLocaleString('en-US')} derivative(s) from ${groups.size.toLocaleString('en-US')} source(s), concurrency ${CONCURRENCY}…`);

  const cacheDir = resolve('var/derivative-sources');
  mkdirSync(cacheDir, { recursive: true });

  const entries = [...groups.entries()];
  let done = 0;
  let failed = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      const entry = entries[index];
      if (!entry) return;
      const [sourcePath, group] = entry;
      const sourceFile = join(cacheDir, sourcePath);

      try {
        if (!existsSync(sourceFile)) await downloadSource(sourcePath, sourceFile);
        for (const spec of group) {
          const bytes = await generateOne(spec, sourceFile);
          manifest.set(spec.derivedPath, {
            derived_path: spec.derivedPath,
            source_path: spec.sourcePath,
            kind: spec.kind,
            variant: spec.variant.token,
            status: 'generated',
            bytes: String(bytes),
            error: '',
          });
          done++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const spec of group) {
          manifest.set(spec.derivedPath, {
            derived_path: spec.derivedPath,
            source_path: spec.sourcePath,
            kind: spec.kind,
            variant: spec.variant.token,
            status: 'failed',
            bytes: '0',
            error: message.slice(0, 300),
          });
          failed++;
        }
        console.warn(`  ✗ ${sourcePath}: ${message}`);
      } finally {
        // Source cache is scratch; drop it so a full run does not hold ~2 GB
        // of originals alongside ~2 GB of output.
        if (existsSync(sourceFile)) rmSync(sourceFile, { force: true });
      }

      if ((index + 1) % 100 === 0) {
        writeManifest(MANIFEST_PATH, manifest);
        logStage(`  … ${done.toLocaleString('en-US')} generated, ${failed} failed`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker()));
  writeManifest(MANIFEST_PATH, manifest);

  logStage(`Done: ${done.toLocaleString('en-US')} generated, ${failed} failed.`);
  logStage(`Manifest: ${MANIFEST_PATH}`);
  if (failed > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
