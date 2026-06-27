// src/_lib/withheld-families.ts
// Shared loader and predicate for the family-withholding gate (ISSUE-48).
// Applied at all three user-facing choke points: species.ts, taxon.ts, build-key.ts.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

const DEFAULT_CSV_PATH = resolve('data/withheld-families.csv');

/**
 * Load the set of withheld family names from a CSV file.
 *
 * Reads `data/withheld-families.csv` (or the supplied path) and returns a Set
 * of lowercased, trimmed family names. With the initial file the set contains
 * "geometridae".
 *
 * Defensive behaviors:
 * - Missing file: warns and returns an empty Set (removing the file is a no-op).
 * - Empty / header-only CSV: returns an empty Set (embargo lifted).
 *
 * @param csvPath Path to the withheld-families CSV; defaults to data/withheld-families.csv.
 */
export function loadWithheldFamilies(csvPath: string = DEFAULT_CSV_PATH): Set<string> {
  if (!existsSync(csvPath)) {
    console.warn(`[withheld-families] ${csvPath} not found — no families withheld (build continues)`);
    return new Set<string>();
  }

  const rows = parse(
    readFileSync(csvPath),
    { columns: true, skip_empty_lines: true }
  ) as Array<{ family: string }>;

  const families = rows
    .map(r => (r.family ?? '').trim().toLowerCase())
    .filter(f => f.length > 0);

  return new Set<string>(families);
}

/**
 * Return true when `family` is in the withheld set.
 *
 * Comparison is case-insensitive and whitespace-trimmed so curator typos
 * ("GEOMETRIDAE", " Geometridae ") still match.
 *
 * @param family Family name from a species row (may be null/undefined for sparse data).
 * @param withheld Set returned by loadWithheldFamilies().
 */
export function isWithheld(family: string | null | undefined, withheld: Set<string>): boolean {
  return family != null && withheld.has(family.trim().toLowerCase());
}
