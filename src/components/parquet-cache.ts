import { parquetReadObjects, parquetMetadata } from 'hyparquet';
import type { OccurrenceRecord } from '../types/index.ts';

/** Module-level cache keyed by slug */
const cache = new Map<string, OccurrenceRecord[]>();

/**
 * The 14 expected column names in records.parquet.
 * Used by assertParquetColumns for O(columns) schema validation.
 */
const EXPECTED_PARQUET_COLUMNS = new Set([
  'species_slug', 'record_type', 'latitude', 'longitude', 'state',
  'county', 'locality', 'elevation_ft', 'year', 'month', 'day',
  'collector', 'collection', 'notes',
]);

/**
 * Assert that the given Parquet metadata contains all expected column names.
 * Throws an Error with 'schema mismatch' in the message if any expected column is absent.
 *
 * This is an O(columns) check that reads only the file footer (via parquetMetadata).
 * Exported as a pure function so it can be unit-tested without mocking fetch.
 *
 * @param meta - Parquet metadata object from parquetMetadata(); schema[0] is the root group
 * @throws Error if any expected column is missing
 */
export function assertParquetColumns(meta: { schema: { name: string }[] }): void {
  const actualCols = new Set(meta.schema.slice(1).map(el => el.name));
  for (const col of EXPECTED_PARQUET_COLUMNS) {
    if (!actualCols.has(col)) {
      throw new Error(`records.parquet schema mismatch: missing column "${col}"`);
    }
  }
}

/**
 * Load Parquet occurrence records for a species slug.
 * Returns cached result if already loaded.
 * Validates the Parquet column schema at O(columns) cost before reading records.
 * Throws on fetch failure or schema mismatch (D-05).
 *
 * @param slug - species slug (e.g. 'acronicta-americana')
 * @returns array of typed OccurrenceRecord objects
 */
export async function loadParquet(slug: string): Promise<OccurrenceRecord[]> {
  if (cache.has(slug)) return cache.get(slug)!;
  const url = `${import.meta.env.BASE_URL}species/${slug}/records.parquet`;
  // Fetch the whole file rather than using range requests. GitHub Pages CDN
  // (Fastly) serves gzip-encoded range responses against the compressed bytes,
  // which breaks hyparquet's range-based footer/metadata reads. The files are
  // small enough that a single fetch is fine.
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    // O(columns) Parquet schema validator — reads footer only, independent of row count.
    // parquetMetadata() takes the raw ArrayBuffer directly (not the file object — Pitfall 4).
    const meta = parquetMetadata(arrayBuffer);
    assertParquetColumns(meta);
    const file = {
      byteLength: arrayBuffer.byteLength,
      slice: (start: number, end: number) => arrayBuffer.slice(start, end),
    };
    const records = await parquetReadObjects({ file }) as OccurrenceRecord[];
    cache.set(slug, records);
    return records;
  } catch (err) {
    console.error(`[pnwmoths] Failed to load parquet: ${url}`, err);
    throw err;
  }
}

/**
 * Filter records by state, record type, year range, county, collection, and elevation range.
 */
export function filterRecords(
  records: OccurrenceRecord[],
  filters: {
    state?: string;
    recordType?: string;
    yearMin?: number;
    yearMax?: number;
    county?: string;
    collection?: string;
    elevationMin?: number;
    elevationMax?: number;
  }
): OccurrenceRecord[] {
  return records.filter(r => {
    if (filters.state && filters.state !== 'all' && r.state !== filters.state) return false;
    if (filters.recordType && filters.recordType !== 'all' && r.record_type !== filters.recordType) return false;
    // Null-coercion is intentional: null year/elevation coerce to 0 in numeric comparisons
    // (matching the .js behavior and its tests). TypeScript requires an explicit cast here.
    if (filters.yearMin != null && (r.year as number) < filters.yearMin) return false;
    if (filters.yearMax != null && (r.year as number) > filters.yearMax) return false;
    if (filters.county && filters.county !== 'all' && r.county !== filters.county) return false;
    if (filters.collection && filters.collection !== 'all' && r.collection !== filters.collection) return false;
    if (filters.elevationMin != null && (r.elevation_ft as number) < filters.elevationMin) return false;
    if (filters.elevationMax != null && (r.elevation_ft as number) > filters.elevationMax) return false;
    return true;
  });
}

/**
 * Aggregate records into a 12-element monthly count array.
 * Index 0 = January, Index 11 = December.
 */
export function aggregateByMonth(records: OccurrenceRecord[]): number[] {
  const counts = new Array(12).fill(0) as number[];
  for (const r of records) {
    if (r.month != null && r.month >= 1 && r.month <= 12) {
      const idx = r.month - 1;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
  }
  return counts;
}
