/**
 * scripts/lib/manifest.ts
 *
 * Phase 26 (v2.2 high-res photos): CSV I/O for data/species-photos-manifest.csv.
 * Phase 34 (v3.0): converted to strict TypeScript.
 *
 * Exports:
 *   - COLUMNS                  -- the D-05 manifest schema (locked column order)
 *   - ManifestRow              -- mapped type derived from COLUMNS (D-04)
 *   - ManifestStatus           -- string-literal union of all valid status values (D-05)
 *   - readManifest(path)       -- returns [] when path doesn't exist; otherwise
 *                                 parses CSV into row objects keyed by column name
 *   - writeManifest(path, rows)-- rewrites the manifest in full; header emitted
 *                                 from COLUMNS; field order pinned by COLUMNS;
 *                                 csv-stringify auto-quotes any field containing
 *                                 comma, newline, or double-quote
 *                                 (T-26.02-02 mitigation)
 *   - sortForInvestigation(rows) -- pure helper that returns a NEW array with
 *                                   the four investigation buckets at the top,
 *                                   grouped by binomial_raw with most-frequent
 *                                   groups first; clean rows trail in stable
 *                                   original order (D-12)
 *
 * Patterns reused from the in-repo Phase 13 / Phase 17 migration scripts:
 *   scripts/migrate-images.js:21-22, 143, 300, 335-336
 *   scripts/migrate-species.js:32-39, 474-475, 537-538
 */

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * D-05 manifest schema. Order is part of the contract; downstream Phase 27/28/29
 * code must read by column name, never by index — but the on-disk header order
 * matches this array, which is what curators see when they open the CSV in a
 * spreadsheet.
 */
export const COLUMNS = [
  'content_hash',
  'dropbox_path',
  'size_bytes',
  'server_modified',
  'filename_raw',
  'binomial_raw',
  'specimen_id',
  'view',
  'binomial_resolved',
  'species_slug',
  'match_bucket',
  'status',
  'last_error',
] as const;

/**
 * D-05 locked status union. All valid values across the full pipeline:
 * ingest-photos.js, tile-photos.js, upload-tiles.js.
 */
export type ManifestStatus = 'discovered' | 'downloaded' | 'tiled' | 'uploaded' | 'failed';

/**
 * D-04: ManifestRow is a mapped type over the 13 known column keys, so
 * row.status is `string` (not `string | undefined`) even under noUncheckedIndexedAccess.
 */
export type ManifestRow = Record<typeof COLUMNS[number], string>;

/**
 * D-12 investigation buckets — rows with these match_bucket values rise to the
 * top of the manifest after `sortForInvestigation` so the curator works
 * top-down on highest-impact rows first.
 */
const INVESTIGATION_BUCKETS = new Set<string>([
  'genus-only',
  'likely-synonym',
  'provisional',
  'unparseable',
]);

/**
 * Guard for csv-parse output (D-01 / D-02 pattern).
 * Checks each COLUMNS key is present; extra/unknown fields are ignored (D-03).
 */
function isManifestRow(obj: unknown): obj is ManifestRow {
  if (typeof obj !== 'object' || obj === null) return false;
  return COLUMNS.every(col => col in (obj as Record<string, unknown>));
}

/**
 * Read the manifest at `path`. Returns [] if the file does not exist
 * (first-run safe — Plan 03's `ingest-photos.js` calls this before its
 * first write).
 *
 * Uses isManifestRow guard (D-01) rather than an unguarded cast (D-02).
 */
export async function readManifest(path: string): Promise<ManifestRow[]> {
  if (!existsSync(path)) return [];
  const raw = await readFile(path);
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as unknown[];
  return rows.filter(isManifestRow);
}

/**
 * Write `rows` to `path` as a CSV with the COLUMNS header on line 1.
 * Overwrites; the manifest is rewritten in full on every run (D-02).
 *
 * The `columns: [...COLUMNS]` second-arg both emits the header AND enforces
 * field order even when row objects omit fields. csv-stringify automatically
 * quotes any value containing comma, newline, or double-quote, which is the
 * library-level mitigation for T-26.02-02 (CSV injection via Dropbox-supplied
 * filename_raw / binomial_raw).
 *
 * Spread into mutable array to satisfy csv-stringify's `string[]` type
 * without a cast (RESEARCH Pitfall 2).
 */
export async function writeManifest(path: string, rows: ManifestRow[]): Promise<void> {
  const csv = stringify(rows, { header: true, columns: [...COLUMNS] });
  await writeFile(path, csv);
}

/**
 * Advance a manifest row to a new status, updating `status` and `last_error`
 * in-place while leaving all other columns untouched.
 *
 * Convention mirrors the in-place mutation in ingest-photos.js RESORT_ONLY
 * path (scripts/ingest-photos.js:344-350): row properties are set directly on
 * the object reference passed in, not on a copy.
 *
 * Called by Plan 02's scripts/tile-photos.js to advance rows from
 * `downloaded` → `tiled` and to record `failed` with a reason string.
 *
 * @param row         - Manifest row object (must not be null/undefined)
 * @param nextStatus  - New status value; must be a non-empty string
 * @param extra       - Optional extra fields:
 *                      `extra.last_error` (string) stored when nextStatus === 'failed'
 * @returns           - The same `row` reference (for optional chaining)
 * @throws {TypeError} If `row` is null/undefined or `nextStatus` is not a non-empty string
 */
export function advanceStatus(
  row: ManifestRow,
  nextStatus: ManifestStatus,
  extra: Partial<ManifestRow> = {},
): ManifestRow {
  if (row == null) {
    throw new TypeError('advanceStatus: row required');
  }
  if (typeof nextStatus !== 'string' || nextStatus.length === 0) {
    throw new TypeError('advanceStatus: nextStatus must be a non-empty string');
  }
  row.status = nextStatus;
  if (nextStatus === 'failed') {
    row.last_error = String(extra.last_error ?? '');
  } else {
    row.last_error = '';
  }
  return row;
}

/**
 * Return a NEW array (input unmodified) re-ordered so the four investigation
 * buckets (genus-only, likely-synonym, provisional, unparseable) appear FIRST,
 * grouped by binomial_raw with the most-frequent group first. Within the same
 * binomial_raw group, original input order is preserved (stable). Clean-match
 * rows (everything outside INVESTIGATION_BUCKETS) trail in stable original
 * order.
 *
 * This is the D-12 "investigation queue surface": the manifest itself is the
 * queue; the curator opens it in a spreadsheet and works top-down.
 *
 */
export function sortForInvestigation(rows: ManifestRow[]): ManifestRow[] {
  // One-pass partition that ALSO retains original indices for stable secondary
  // ordering (V8's sort is stable since Node 12+; we still pass index as a
  // tiebreaker so the contract doesn't depend on JS engine internals).
  const invest: Array<{ row: ManifestRow; index: number }> = [];
  const clean: Array<{ row: ManifestRow; index: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // noUncheckedIndexedAccess: guard on rows[i]
    if (!row) continue;
    const bucket = row.match_bucket;
    if (INVESTIGATION_BUCKETS.has(bucket)) {
      invest.push({ row, index: i });
    } else {
      clean.push({ row, index: i });
    }
  }

  // Tally binomial_raw frequencies inside the investigation partition.
  // Empty string is its own group (covers the unparseable case where no
  // binomial was extracted).
  const freq = new Map<string, number>();
  for (const { row } of invest) {
    const key = row.binomial_raw;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  // Stable sort: primarily by frequency desc; secondarily by original index asc.
  invest.sort((a, b) => {
    const fa = freq.get(a.row.binomial_raw) ?? 0;
    const fb = freq.get(b.row.binomial_raw) ?? 0;
    if (fb !== fa) return fb - fa;
    return a.index - b.index;
  });

  return [...invest.map(x => x.row), ...clean.map(x => x.row)];
}
