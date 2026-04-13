import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

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
  const file = await asyncBufferFromUrl({ url });
  const records = await parquetReadObjects({ file });
  cache.set(slug, records);
  return records;
}

/**
 * Filter records by state, record type, and year range.
 * @param {Array} records
 * @param {{ state?: string, recordType?: string, yearMin?: number, yearMax?: number }} filters
 * @returns {Array} filtered records
 */
export function filterRecords(records, filters) {
  return records.filter(r => {
    if (filters.state && filters.state !== 'all' && r.state !== filters.state) return false;
    if (filters.recordType && filters.recordType !== 'all' && r.record_type !== filters.recordType) return false;
    if (filters.yearMin != null && r.year < filters.yearMin) return false;
    if (filters.yearMax != null && r.year > filters.yearMax) return false;
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
