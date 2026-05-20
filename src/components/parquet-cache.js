import { parquetReadObjects } from 'hyparquet';

/** Module-level cache keyed by slug */
const cache = new Map();

/**
 * Load Parquet occurrence records for a species slug.
 * Returns cached result if already loaded.
 * @param {string} slug - species slug (e.g. 'acronicta-americana')
 * @returns {Promise<Array>} array of record objects
 */
export async function loadParquet(slug) {
  if (cache.has(slug)) {
    return cache.get(slug);
  }
  const url = `${import.meta.env.BASE_URL}species/${slug}/records.parquet`;
  // Fetch the whole file rather than using range requests. GitHub Pages CDN
  // (Fastly) serves gzip-encoded range responses against the compressed bytes,
  // which breaks hyparquet's range-based footer/metadata reads. The files are
  // small enough that a single fetch is fine.
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const file = {
      byteLength: arrayBuffer.byteLength,
      slice: (start, end) => arrayBuffer.slice(start, end),
    };
    const records = await parquetReadObjects({ file });
    cache.set(slug, records);
    return records;
  } catch (err) {
    console.error(`[pnwmoths] Failed to load parquet: ${url}`, err);
    throw err;
  }
}

/**
 * Filter records by state, record type, year range, county, collection, and elevation range.
 * @param {Array} records
 * @param {{ state?: string, recordType?: string, yearMin?: number, yearMax?: number,
 *           county?: string, collection?: string, elevationMin?: number, elevationMax?: number }} filters
 * @returns {Array} filtered records
 */
export function filterRecords(records, filters) {
  return records.filter(r => {
    if (filters.state && filters.state !== 'all' && r.state !== filters.state) return false;
    if (filters.recordType && filters.recordType !== 'all' && r.record_type !== filters.recordType) return false;
    if (filters.yearMin != null && r.year < filters.yearMin) return false;
    if (filters.yearMax != null && r.year > filters.yearMax) return false;
    if (filters.county && filters.county !== 'all' && r.county !== filters.county) return false;
    if (filters.collection && filters.collection !== 'all' && r.collection !== filters.collection) return false;
    if (filters.elevationMin != null && r.elevation_ft < filters.elevationMin) return false;
    if (filters.elevationMax != null && r.elevation_ft > filters.elevationMax) return false;
    return true;
  });
}

/**
 * Aggregate records into a 12-element monthly count array.
 * Index 0 = January, Index 11 = December.
 * @param {Array} records
 * @returns {number[]} 12-element array of counts
 */
export function aggregateByMonth(records) {
  const counts = new Array(12).fill(0);
  for (const r of records) {
    if (r.month >= 1 && r.month <= 12) {
      counts[r.month - 1]++;
    }
  }
  return counts;
}
