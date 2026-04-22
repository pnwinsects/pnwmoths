/**
 * scripts/migrate-species.js
 *
 * One-time migration: reads legacy pnwinsects-app MySQL dump, extracts species,
 * taxonomy, and occurrence records, writes data/species.csv and data/records.csv.
 *
 * Usage:
 *   node scripts/migrate-species.js
 *
 * Override source paths via environment:
 *   DUMP_PATH, SPECIESIMAGE_CSV
 */

import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_DUMP_PATH =
  '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/root/pnwmoths-mysqldump--20210201-123033.sql';
const DEFAULT_SPECIESIMAGE_CSV =
  '/Users/rainhead/dev/pnwinsects-app/species_speciesimage.csv';
const DUMP_PATH = process.env.DUMP_PATH ?? DEFAULT_DUMP_PATH;
const SPECIESIMAGE_CSV = process.env.SPECIESIMAGE_CSV ?? DEFAULT_SPECIESIMAGE_CSV;

// Output CSV column orders (must match build-data.js validateCsv() exactly)
const SPECIES_COLUMNS = [
  'id', 'genus', 'species', 'common_name', 'noc_id', 'authority',
  'family', 'similar_species', 'subfamily',
];
const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes',
];

// PNW state IDs from species_state dump (verified)
const PNW_STATE_IDS = new Set(['42', '43', '61', '66', '77', '80']);
// 42=WA, 43=BC, 61=AB, 66=ID, 77=MT, 80=OR

/**
 * Stream the SQL dump line by line, collecting INSERT lines for tables in the pnwmoths section.
 * Stays within the USE `pnwmoths`; ... USE `pnwsawflies`; boundary.
 *
 * Returns a Map<tableName → line> for all tables needed.
 *
 * @param {string} dumpPath
 * @param {string[]} tableNames - Tables to extract
 * @returns {Promise<Map<string, string>>}
 */
async function extractInsertLines(dumpPath, tableNames) {
  const tableSet = new Set(tableNames);
  const results = new Map();
  let inPnwmoths = false;

  const rl = createInterface({
    input: createReadStream(dumpPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line === 'USE `pnwmoths`;') {
      inPnwmoths = true;
      continue;
    }
    if (line === 'USE `pnwsawflies`;') {
      break;  // done
    }
    if (!inPnwmoths) continue;

    if (line.startsWith('INSERT INTO `')) {
      // Extract table name from: INSERT INTO `tableName` VALUES ...
      const m = line.match(/^INSERT INTO `([^`]+)` VALUES /);
      if (m && tableSet.has(m[1])) {
        // A table may have multiple INSERT statements (species_speciesrecord has 17).
        // Each line ends with `);` — strip the trailing semicolon and append only
        // the tuple list from subsequent lines.
        if (results.has(m[1])) {
          // Strip "INSERT INTO `tableName` VALUES " prefix from continuation line
          const valuesStart = line.indexOf(' VALUES ') + ' VALUES '.length;
          // Strip trailing `;` from accumulated string, then append new tuples
          let prev = results.get(m[1]);
          if (prev.endsWith(';')) prev = prev.slice(0, -1);
          results.set(m[1], prev + ',' + line.slice(valuesStart));
        } else {
          results.set(m[1], line);
        }
      }
    }
  }

  return results;
}

/**
 * Parse a simple 2-column (id, 'value') INSERT line.
 * Covers: species_author, species_collector, species_state.
 *
 * @param {string} line
 * @returns {Map<string, string>} id → value
 */
function parseIdValue(line) {
  const map = new Map();
  for (const m of line.matchAll(/\((\d+),'((?:[^'\\]|\\.)*)'\)/g)) {
    map.set(m[1], m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  }
  return map;
}

/**
 * Parse species_collection (id, name, url_or_null).
 *
 * @param {string} line
 * @returns {Map<string, string>} id → name
 */
function parseCollection(line) {
  const map = new Map();
  for (const m of line.matchAll(/\((\d+),'((?:[^'\\]|\\.)*)',(?:NULL|'[^']*')\)/g)) {
    map.set(m[1], m[2].replace(/\\'/g, "'"));
  }
  return map;
}

/**
 * Parse species_county (id, name, state_id) — 3-column with int state_id.
 *
 * @param {string} line
 * @returns {Map<string, string>} id → name
 */
function parseCounty(line) {
  const map = new Map();
  for (const m of line.matchAll(/\((\d+),'((?:[^'\\]|\\.)*)',\d+\)/g)) {
    map.set(m[1], m[2].replace(/\\'/g, "'"));
  }
  return map;
}

/**
 * Parse species_species_similar (id, from_species_id, to_species_id).
 *
 * @param {string} line
 * @returns {Map<string, string[]>} from_id → [to_id, ...]
 */
function parseSimilar(line) {
  const map = new Map();  // from_id -> [to_id, ...]
  for (const m of line.matchAll(/\(\d+,(\d+),(\d+)\)/g)) {
    if (!map.has(m[1])) map.set(m[1], []);
    map.get(m[1]).push(m[2]);
  }
  return map;
}

/**
 * Extract family/subfamily from cms_title INSERT line.
 * The URL path encodes taxonomy as: browse/family-X/subfamily-Y/genus/species-slug
 *
 * @param {string} line
 * @returns {Map<string, {family: string, subfamily: string | null}>} page_id → taxonomy
 */
function extractCmsTaxonomy(line) {
  if (!line) return new Map();
  const pageMap = new Map();
  const re = /\((\d+),'en','(?:[^'\\]|\\.)*','[^']*','[^']*','(browse\/family-[^']+)'/g;
  for (const m of line.matchAll(re)) {
    const parts = m[2].split('/');
    if (parts.length >= 5) {
      const family = parts[1].replace('family-', '');
      const capitalizedFamily = family.charAt(0).toUpperCase() + family.slice(1);
      const subfamilyPart = parts[2];
      const subfamily = subfamilyPart.startsWith('subfamily-')
        ? subfamilyPart.replace('subfamily-', '')
        : null;
      const capitalizedSubfamily = subfamily
        ? subfamily.charAt(0).toUpperCase() + subfamily.slice(1)
        : null;
      pageMap.set(m[1], { family: capitalizedFamily, subfamily: capitalizedSubfamily });
    }
  }
  return pageMap;
}

/**
 * Infer family from MONA/MOTH Hodges number.
 * Numbers 6202–7499 belong to Geometridae.
 *
 * @param {string | null} nocId
 * @returns {string | null}
 */
function inferFamily(nocId) {
  if (!nocId) return null;
  const monaMatch = nocId.match(/(?:MONA|MOTH)\s+(\d+(?:\.\d+)?)/);
  const bareMatch = nocId.match(/^(\d{4}(?:\.\d+)?)$/);
  const num = monaMatch
    ? parseFloat(monaMatch[1])
    : bareMatch
    ? parseFloat(bareMatch[1])
    : null;
  if (num !== null && num >= 6202 && num <= 7499) return 'Geometridae';
  return null;
}

/**
 * Derive slug from a species image field (e.g. "moths/Acronicta americana-A-D.jpg").
 *
 * @param {string} imageField
 * @returns {string | null}
 */
function slugFromImageField(imageField) {
  const fname = imageField.startsWith('moths/') ? imageField.slice(6) : imageField;
  const match = fname.match(/^([A-Z][a-z]+) ([a-z]+)-/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`.toLowerCase();
}

/**
 * Parse species_species INSERT line.
 * Actual schema (7 columns, verified from dump):
 *   (id, genus, species, common_name_or_NULL_or_empty, authority_id_or_NULL,
 *    noc_id_or_NULL, factsheet_id_or_NULL)
 *
 * @param {string} line
 * @returns {Array<{id: string, genus: string, species: string, common_name: string|null,
 *   authority_id: string|null, noc_id: string|null, factsheet_id: string|null}>}
 */
function parseSpeciesSpecies(line) {
  const rows = [];
  // common_name may be NULL or '' (empty string) or 'string'
  const re = /\((\d+),'([^'\\]*)','([^'\\]*)',(?:'((?:[^'\\]|\\.)*)'|NULL),(?:(\d+)|NULL),(?:'((?:[^'\\]|\\.)*)'|NULL),(?:(\d+)|NULL)/g;
  for (const m of line.matchAll(re)) {
    rows.push({
      id: m[1],
      genus: m[2],
      species: m[3],
      common_name: m[4] ?? null,
      authority_id: m[5] ?? null,
      noc_id: m[6] ?? null,
      factsheet_id: m[7] ?? null,
    });
  }
  return rows;
}

/**
 * Parse species_speciesrecord INSERT line.
 * Actual schema (23 columns, verified from dump CREATE TABLE + sample data):
 *   (id, species_id, latitude, longitude, locality_or_NULL, county_id_or_NULL,
 *    state_id_or_NULL, elevation_or_NULL, year_or_NULL, month_or_NULL, day_or_NULL,
 *    collector_id_or_NULL, collection_id_or_NULL, males_or_NULL, females_or_NULL,
 *    notes, date_added, date_modified, record_type, csv_file_or_NULL,
 *    type_status_or_NULL, subspecies_or_NULL, linked_photo)
 *
 * @param {string} line
 * @returns {Array<object>}
 */
function parseSpeciesRecord(line) {
  const rows = [];
  // Columns positionally (23 total, verified from CREATE TABLE + sample data):
  // 1=id, 2=species_id, 3=lat, 4=lon, 5=locality, 6=county_id, 7=state_id,
  // 8=elevation, 9=year, 10=month, 11=day, 12=collector_id, 13=collection_id,
  // 14=males(skip), 15=females(skip), 16=notes, 17=date_added(skip), 18=date_modified(skip),
  // 19=record_type, 20=csv_file(skip), 21=type_status(skip), 22=subspecies(skip), 23=linked_photo
  // Note: males/females fields use -?\d+ because the dump contains sentinel values like -999999 and -2
  const re = /\((?:(\d+)|NULL),(?:(\d+)|NULL),(?:([-\d.]+)|NULL),(?:([-\d.]+)|NULL),(?:'((?:[^'\\]|\\.)*)'|NULL),(?:(\d+)|NULL),(?:(\d+)|NULL),(?:(\d+)|NULL),(?:(\d+)|NULL),(?:(\d+)|NULL),(?:(\d+)|NULL),(?:(\d+)|NULL),(?:(\d+)|NULL),(?:-?\d+|NULL),(?:-?\d+|NULL),(?:'((?:[^'\\]|\\.)*)'|NULL),(?:'[^']*'|NULL),(?:'[^']*'|NULL),'(specimen|photograph|literature)',(?:'[^']*'|NULL),(?:'[^']*'|NULL),(?:'[^']*'|NULL),([01])\)/g;
  for (const m of line.matchAll(re)) {
    rows.push({
      id: m[1],
      species_id: m[2],
      latitude: m[3] ?? null,
      longitude: m[4] ?? null,
      locality: m[5] ? m[5].replace(/\\'/g, "'").replace(/\\n/g, ' ').replace(/\\r/g, '') : '',
      county_id: m[6] ?? null,
      state_id: m[7] ?? null,
      elevation: m[8] ?? null,
      year: m[9] ?? null,
      month: m[10] ?? null,
      day: m[11] ?? null,
      collector_id: m[12] ?? null,
      collection_id: m[13] ?? null,
      notes: m[14] ? m[14].replace(/\\'/g, "'").replace(/\\n/g, ' ').replace(/\\r/g, '').replace(/\\\\/g, '\\') : '',
      record_type: m[15],
      linked_photo: m[16],
    });
  }
  return rows;
}

/**
 * Build a Map<species_id → slug> from speciesimage CSV rows and dump INSERT line.
 * Prefers speciesimage CSV (newer, 4256 rows) over dump (4038 rows).
 *
 * @param {string | null} line - species_speciesimage INSERT line (fallback)
 * @param {Array<object>} speciesimageRows - Parsed speciesimage CSV rows
 * @returns {Map<string, string>}
 */
function buildSlugMap(line, speciesimageRows) {
  const map = new Map();
  // From speciesimage CSV rows (already parsed with columns: true)
  for (const row of speciesimageRows) {
    const slug = slugFromImageField(row.image);
    if (slug && !map.has(String(row.species_id))) {
      map.set(String(row.species_id), slug);
    }
  }
  // Fill remaining from dump INSERT (fallback for species not in CSV)
  if (line) {
    const re = /\(\d+,(\d+),'(moths\/[^']+)'/g;
    for (const m of line.matchAll(re)) {
      const sid = m[1];
      if (!map.has(sid)) {
        const slug = slugFromImageField(m[2]);
        if (slug) map.set(sid, slug);
      }
    }
  }
  return map;
}

/**
 * Main migration function. Uses async streaming to read the large dump file.
 */
export async function main() {
  // 1. Check dump exists
  if (!existsSync(DUMP_PATH)) {
    console.error(`[migrate-species] Dump not found: ${DUMP_PATH}`);
    process.exit(1);
  }

  // 2. Stream dump line by line, extracting only the needed INSERT lines
  //    (readFileSync fails for 634 MB dumps due to Node.js string length limit)
  console.log('[migrate-species] Streaming dump (this may take a few seconds)...');
  const NEEDED_TABLES = [
    'species_author',
    'species_collector',
    'species_state',
    'species_county',
    'species_collection',
    'species_species_similar',
    'cms_title',
    'species_speciesimage',
    'species_species',
    'species_speciesrecord',
  ];
  const insertLines = await extractInsertLines(DUMP_PATH, NEEDED_TABLES);
  console.log(`[migrate-species] Extracted ${insertLines.size} INSERT lines from pnwmoths section`);

  if (!insertLines.has('species_species')) {
    console.error('[migrate-species] species_species INSERT not found — pnwmoths section may be missing');
    process.exit(1);
  }

  // 3. Extract lookup tables
  const authorMap = parseIdValue(insertLines.get('species_author') ?? '');
  const collectorMap = parseIdValue(insertLines.get('species_collector') ?? '');
  const stateMap = parseIdValue(insertLines.get('species_state') ?? '');
  const countyMap = parseCounty(insertLines.get('species_county') ?? '');
  const collectionMap = parseCollection(insertLines.get('species_collection') ?? '');
  const similarMap = parseSimilar(insertLines.get('species_species_similar') ?? '');
  const cmsMap = extractCmsTaxonomy(insertLines.get('cms_title') ?? '');

  console.log(`[migrate-species] Loaded: ${authorMap.size} authors, ${stateMap.size} states, ${cmsMap.size} CMS pages`);

  // 4. Read speciesimage CSV (slug source — newer than dump)
  let speciesimageRows = [];
  if (existsSync(SPECIESIMAGE_CSV)) {
    const raw = readFileSync(SPECIESIMAGE_CSV, 'utf8');
    speciesimageRows = parse(raw, { columns: true, skip_empty_lines: true });
    console.log(`[migrate-species] Loaded ${speciesimageRows.length} rows from speciesimage CSV`);
  } else {
    console.warn(`[migrate-species] speciesimage CSV not found: ${SPECIESIMAGE_CSV} — slug fallback only`);
  }

  // 5. Build slug map from speciesimage data
  const slugMap = buildSlugMap(
    insertLines.get('species_speciesimage') ?? null,
    speciesimageRows
  );
  console.log(`[migrate-species] Slug map: ${slugMap.size} species_id → slug mappings`);

  // 6. Parse species_species
  const speciesLine = insertLines.get('species_species');
  const allSpecies = parseSpeciesSpecies(speciesLine);
  console.log(`[migrate-species] Parsed ${allSpecies.length} species from dump`);

  // 7. Parse records
  const recordsLine = insertLines.get('species_speciesrecord');
  if (!recordsLine) {
    console.error('[migrate-species] species_speciesrecord INSERT not found');
    process.exit(1);
  }
  const allRecords = parseSpeciesRecord(recordsLine);
  console.log(`[migrate-species] Parsed ${allRecords.length} records from dump`);

  // 8. Determine which species_ids have images or PNW records
  const speciesWithImages = new Set(slugMap.keys());
  const pnwRecords = allRecords.filter(
    r => r.linked_photo === '0' && r.state_id && PNW_STATE_IDS.has(r.state_id)
  );
  const speciesWithPnwRecords = new Set(pnwRecords.map(r => r.species_id));
  const includedSpeciesIds = new Set([...speciesWithImages, ...speciesWithPnwRecords]);
  console.log(`[migrate-species] Species with images: ${speciesWithImages.size}, with PNW records: ${speciesWithPnwRecords.size}, total included: ${includedSpeciesIds.size}`);

  // 9. Build genus→family fallback from CMS data (for species whose genus appears in CMS)
  const genusFamilyFallback = new Map();
  for (const sp of allSpecies) {
    if (!sp.factsheet_id) continue;
    const cms = cmsMap.get(sp.factsheet_id);
    if (cms) genusFamilyFallback.set(sp.genus, cms.family);
  }

  // 10. Write species.csv
  const speciesOut = [];
  for (const sp of allSpecies) {
    if (!includedSpeciesIds.has(sp.id)) continue;

    const slug = slugMap.get(sp.id) ?? `${sp.genus}-${sp.species}`.toLowerCase();
    const cms = sp.factsheet_id ? cmsMap.get(sp.factsheet_id) : null;
    let family = cms?.family ?? null;
    let subfamily = cms?.subfamily ?? null;

    if (!family) {
      family = inferFamily(sp.noc_id) ?? genusFamilyFallback.get(sp.genus) ?? null;
    }

    // Build similar_species: pipe-joined slugs
    const similarIds = similarMap.get(sp.id) ?? [];
    const similarSlugs = similarIds
      .map(tid => slugMap.get(tid) ?? null)
      .filter(Boolean);

    // Sanitize species epithet for validateSlugComponent (only [a-zA-Z0-9 ] allowed).
    // Hyphens (e.g. "v-alba", "c-nigrum"): truncate at first hyphen so slug matches
    // what slugFromImageField() extracts from the image filename.
    // Periods, slashes, "?", "nr.", "aff.", "sp." etc: strip all non-alphanumeric-or-space chars.
    let safeSpecies = sp.species;
    if (safeSpecies.includes('-')) {
      safeSpecies = safeSpecies.slice(0, safeSpecies.indexOf('-'));
    }
    safeSpecies = safeSpecies.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    if (!safeSpecies) safeSpecies = 'sp';

    speciesOut.push({
      id: sp.id,
      genus: sp.genus,
      species: safeSpecies,
      common_name: sp.common_name ?? '',
      noc_id: sp.noc_id ?? '',
      authority: sp.authority_id ? (authorMap.get(sp.authority_id) ?? '') : '',
      family: family ?? '',
      similar_species: similarSlugs.join('|'),
      subfamily: subfamily ?? '',
    });
  }

  const speciesCsv = stringify(speciesOut, { header: true, columns: SPECIES_COLUMNS });
  writeFileSync(resolve(ROOT, 'data/species.csv'), speciesCsv, 'utf8');
  console.log(`[migrate-species] Wrote ${speciesOut.length} rows to data/species.csv`);

  // 11. Build species_id → genus+species slug for records join.
  // build-data.js validates: lower(genus || '-' || species) matches species_slug in records.
  // Image-derived slugs (slugMap) may differ from DB genus+species due to reclassification.
  // Records must use the same slug as species.csv (genus + safeSpecies) to pass the join.
  const speciesDbSlugMap = new Map(); // species_id → lower(genus+'-'+safeSpecies)
  for (const sp of allSpecies) {
    let safeSpecies = sp.species;
    if (safeSpecies.includes('-')) safeSpecies = safeSpecies.slice(0, safeSpecies.indexOf('-'));
    safeSpecies = safeSpecies.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    if (!safeSpecies) safeSpecies = 'sp';
    speciesDbSlugMap.set(sp.id, `${sp.genus}-${safeSpecies}`.toLowerCase());
  }

  // PNW coordinate bounds from build-data.js validation query
  const LAT_MIN = 42.0, LAT_MAX = 55.0;
  const LON_MIN = -125.0, LON_MAX = -110.0;

  // Write records.csv
  const recordsOut = [];
  for (const rec of pnwRecords) {
    if (!rec.latitude || !rec.longitude) continue;  // exclude unmappable records

    const lat = parseFloat(rec.latitude);
    const lon = parseFloat(rec.longitude);
    if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) continue;  // out of PNW bounds

    // Use DB-derived slug (genus+species) so records join matches species.csv in build-data.js
    const slug = speciesDbSlugMap.get(rec.species_id) ?? null;
    if (!slug) {
      console.warn(`[migrate-species] No species for record species_id=${rec.species_id} — skipping`);
      continue;
    }

    // Only include records for species that appear in species.csv
    if (!includedSpeciesIds.has(rec.species_id)) continue;

    const stateCode = rec.state_id ? stateMap.get(rec.state_id) : null;
    if (!stateCode) continue;

    recordsOut.push({
      species_slug: slug,
      record_type: rec.record_type,
      latitude: rec.latitude,
      longitude: rec.longitude,
      state: stateCode,
      county: rec.county_id ? (countyMap.get(rec.county_id) ?? '') : '',
      locality: rec.locality ?? '',
      elevation_ft: rec.elevation ?? '',
      year: rec.year ?? '',
      month: rec.month ?? '',
      day: rec.day ?? '',
      collector: rec.collector_id ? (collectorMap.get(rec.collector_id) ?? '') : '',
      collection: rec.collection_id ? (collectionMap.get(rec.collection_id) ?? '') : '',
      notes: rec.notes ?? '',
    });
  }

  const recordsCsv = stringify(recordsOut, { header: true, columns: RECORDS_COLUMNS });
  writeFileSync(resolve(ROOT, 'data/records.csv'), recordsCsv, 'utf8');
  console.log(`[migrate-species] Wrote ${recordsOut.length} rows to data/records.csv`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
