// scripts/emit-species-audit.ts
// Post-Vite build step: emit an UNLINKED diagnostic CSV, _site/species-audit.csv,
// with one row per data/species.csv species and three boolean flags reconciling
// the four data sources (species registry, occurrence records, visibility gates,
// identification key). Referenced by nothing — reachable only by direct URL.
// Run via: npm run build:species-audit  (after build:data + build:key + build:eleventy)
//
// The `visible` flag is bug-for-bug identical to the `shown` predicate in
// src/_data/stats.ts: a species is visible iff its family is neither withheld nor
// blank AND its normalized slug is not on the unpublished deny-list. All three
// joins normalize slugs via normalizeSlug() so space/hyphen forms reconcile.
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { normalizeSlug, loadUnpublishedSpecies } from '../src/_lib/unpublished-species.ts';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../src/_lib/withheld-families.ts';

// ---------------------------------------------------------------------------
// Pure row-builder + CSV serializer — unit-testable without a DuckDB build
// ---------------------------------------------------------------------------

/** Raw species.csv row fields consumed by the audit. */
export interface SpeciesInput {
  genus: string;
  species: string;
  common_name: string;
  family: string;
  subfamily: string;
}

/** One emitted audit row. */
export interface SpeciesAuditRow {
  slug: string;
  genus: string;
  species: string;
  common_name: string;
  family: string;
  subfamily: string;
  has_records: boolean;
  visible: boolean;
  in_key: boolean;
}

export interface BuildSpeciesAuditRowsOptions {
  /** Raw data/species.csv rows. */
  speciesRows: SpeciesInput[];
  /** Normalized slugs present in data/records.csv (any record counts). */
  recordSlugs: Set<string>;
  /** Normalized slugs from data/key-matrix.json species[].slug. */
  keySlugs: Set<string>;
  /** Lowercased withheld family names (from loadWithheldFamilies()). */
  withheldFamilies: Set<string>;
  /** Normalized unpublished deny-list slugs (from loadUnpublishedSpecies()). */
  unpublishedSlugs: Set<string>;
}

/** CSV header — fixed column order. */
export const AUDIT_HEADER =
  'slug,genus,species,common_name,family,subfamily,has_records,visible,in_key';

/**
 * Build the per-species audit rows. Pure — all data passed in, so it can be
 * tested without a build. The `visible` flag reuses the exact stats.ts predicate:
 *   visible = !isWithheldOrUnclassified(family, withheldFamilies) && !unpublishedSlugs.has(slug)
 * Rows are returned sorted by slug.
 */
export function buildSpeciesAuditRows(
  opts: BuildSpeciesAuditRowsOptions,
): SpeciesAuditRow[] {
  const { speciesRows, recordSlugs, keySlugs, withheldFamilies, unpublishedSlugs } = opts;

  const rows = speciesRows.map((r): SpeciesAuditRow => {
    const slug = normalizeSlug(`${r.genus}-${r.species}`);
    return {
      slug,
      genus: r.genus,
      species: r.species,
      common_name: r.common_name,
      family: r.family,
      subfamily: r.subfamily,
      has_records: recordSlugs.has(slug),
      visible:
        !isWithheldOrUnclassified(r.family, withheldFamilies) &&
        !unpublishedSlugs.has(slug),
      in_key: keySlugs.has(slug),
    };
  });

  rows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return rows;
}

/** Quote-and-escape a single CSV field per RFC-4180 (only when needed). */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize audit rows to RFC-4180 CSV. Fixed header, booleans rendered as
 * `true`/`false`, text fields quoted only when they contain `,` `"` or a newline.
 */
export function toCsv(rows: SpeciesAuditRow[]): string {
  const lines = [AUDIT_HEADER];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.slug),
        csvField(r.genus),
        csvField(r.species),
        csvField(r.common_name ?? ''),
        csvField(r.family ?? ''),
        csvField(r.subfamily ?? ''),
        String(r.has_records),
        String(r.visible),
        String(r.in_key),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI entry-point — wires the real data sources
// ---------------------------------------------------------------------------

/** DISTINCT normalized record slugs from data/records.csv via DuckDB. */
async function loadRecordSlugs(): Promise<Set<string>> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  const reader = await conn.runAndReadAll(`
    SELECT DISTINCT species_slug
    FROM read_csv('data/records.csv',
      header = true,
      columns = {
        'species_slug': 'VARCHAR',
        'record_type': 'VARCHAR',
        'latitude': 'DOUBLE',
        'longitude': 'DOUBLE',
        'state': 'VARCHAR',
        'county': 'VARCHAR',
        'locality': 'VARCHAR',
        'elevation_ft': 'INTEGER',
        'year': 'INTEGER',
        'month': 'INTEGER',
        'day': 'INTEGER',
        'collector': 'VARCHAR',
        'collection': 'VARCHAR',
        'notes': 'VARCHAR'
      })
    WHERE species_slug IS NOT NULL AND species_slug != ''
  `);
  const rows = reader.getRows();
  conn.closeSync();
  return new Set(rows.map((r) => normalizeSlug(String(r[0]))));
}

/** Normalized slugs from data/key-matrix.json species[].slug (empty if missing). */
function loadKeySlugs(): Set<string> {
  const keyMatrixPath = resolve('data/key-matrix.json');
  if (!existsSync(keyMatrixPath)) {
    console.warn('[emit-species-audit] data/key-matrix.json not found — treating key as empty');
    return new Set<string>();
  }
  const raw = JSON.parse(readFileSync(keyMatrixPath, 'utf8')) as {
    species: Array<{ slug: string }>;
  };
  return new Set(raw.species.map((s) => normalizeSlug(s.slug)));
}

export async function main(): Promise<void> {
  const speciesRows = parse(readFileSync(resolve('data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as SpeciesInput[];

  const recordSlugs = await loadRecordSlugs();
  const keySlugs = loadKeySlugs();
  const withheldFamilies = loadWithheldFamilies();
  const unpublishedSlugs = loadUnpublishedSpecies();

  const rows = buildSpeciesAuditRows({
    speciesRows,
    recordSlugs,
    keySlugs,
    withheldFamilies,
    unpublishedSlugs,
  });

  mkdirSync(resolve('_site'), { recursive: true });
  writeFileSync(resolve('_site/species-audit.csv'), toCsv(rows));
  console.log(`Wrote ${rows.length} species to _site/species-audit.csv`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
