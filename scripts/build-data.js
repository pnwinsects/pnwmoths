// scripts/build-data.js
// Pre-build script: validates CSV input, imports into DuckDB, exports per-species Parquet files.
// Run via: npm run build:data
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, mkdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

/**
 * Pre-flight CSV validation (before DuckDB import).
 * Checks UTF-8 encoding and required column presence.
 *
 * @param {string} filePath - Absolute or relative path to the CSV file
 * @param {string[]} requiredColumns - Column names that must be present
 * @returns {object[]} Parsed rows (array of objects)
 * @throws {Error} If encoding is invalid or required column is missing
 */
export function validateCsv(filePath, requiredColumns) {
  let raw;
  try {
    raw = readFileSync(filePath);
  } catch (e) {
    throw new Error(`Cannot read ${filePath}: ${e.message}`);
  }

  // Verify UTF-8 encoding — fatal: true rejects invalid byte sequences
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new Error(
      `${filePath} contains non-UTF-8 bytes. If edited in Excel on Windows, re-save as CSV UTF-8.`
    );
  }

  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  if (rows.length === 0) {
    throw new Error(`${filePath} is empty or has no data rows.`);
  }

  const headers = Object.keys(rows[0]);
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      throw new Error(
        `${filePath} is missing required column: "${col}". Found: ${headers.join(', ')}`
      );
    }
  }

  return rows;
}

/**
 * Validate that a slug component (genus or species) contains only safe characters.
 * Prevents path traversal via species names from CSV (T-01-02).
 *
 * @param {string} value - The genus or species string to validate
 * @param {string} fieldName - Field name for error messages
 * @throws {Error} If value contains characters outside [a-zA-Z0-9 ]
 */
function validateSlugComponent(value, fieldName) {
  if (!/^[a-zA-Z0-9 ]+$/.test(value)) {
    throw new Error(
      `Invalid ${fieldName} value "${value}" — only alphanumeric characters and spaces are allowed.`
    );
  }
}

/**
 * Main pipeline: validate CSVs, import into DuckDB, run quality checks, export Parquet files.
 */
export async function main() {
  // --- Pre-flight CSV validation ---
  validateCsv('data/species.csv', ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species']);
  const imageRows = validateCsv('data/images.csv', ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen']);
  for (const row of imageRows) {
    if (!/^[a-zA-Z0-9._-]+$/.test(row.filename)) {
      throw new Error(`Invalid image filename "${row.filename}" in images.csv — only alphanumeric, dots, hyphens, and underscores allowed.`);
    }
  }
  const glossaryRows = validateCsv('data/glossary.csv', ['term', 'definition', 'image_filename', 'photographer']);
  for (const row of glossaryRows) {
    if (row.image_filename && !/^[a-zA-Z0-9._-]+$/.test(row.image_filename)) {
      throw new Error(
        `Invalid image_filename "${row.image_filename}" in glossary.csv — only alphanumeric, dots, hyphens, and underscores allowed.`
      );
    }
  }
  validateCsv('data/records.csv', [
    'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
    'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes'
  ]);

  // --- DuckDB import with explicit schema ---
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv',
      header = true,
      columns = {
        'id': 'INTEGER',
        'genus': 'VARCHAR',
        'species': 'VARCHAR',
        'common_name': 'VARCHAR',
        'noc_id': 'VARCHAR',
        'authority': 'VARCHAR',
        'family': 'VARCHAR',
        'similar_species': 'VARCHAR'
      }
    )
  `);

  await conn.run(`
    CREATE TABLE records AS
    SELECT * FROM read_csv('data/records.csv',
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
      }
    )
  `);

  // --- Post-import validation queries ---
  const validationChecks = [
    {
      description: 'orphaned records (species_slug not in species table)',
      query: `
        SELECT DISTINCT r.species_slug
        FROM records r
        LEFT JOIN species s ON r.species_slug = lower(s.genus || '-' || s.species)
        WHERE s.genus IS NULL
      `
    },
    {
      description: 'invalid record_type values',
      query: `
        SELECT DISTINCT record_type FROM records
        WHERE record_type NOT IN ('specimen', 'photograph', 'literature', 'field notes', 'sight_field_notes')
      `
    },
    {
      description: 'invalid state values',
      query: `
        SELECT DISTINCT state FROM records
        WHERE state NOT IN ('WA', 'OR', 'ID', 'BC', 'AB', 'MT')
          AND state IS NOT NULL
          AND state != ''
      `
    },
    {
      description: 'out-of-bounds coordinates (PNW bounds: lat 42.0-55.0, lon -125.0 to -110.0)',
      query: `
        SELECT species_slug, latitude, longitude FROM records
        WHERE latitude < 42.0 OR latitude > 55.0
           OR longitude < -125.0 OR longitude > -110.0
      `
    },
    {
      description: 'NULL required fields',
      query: `
        SELECT species_slug, latitude, longitude FROM records
        WHERE species_slug IS NULL OR latitude IS NULL OR longitude IS NULL
      `
    }
  ];

  let validationFailed = false;
  for (const check of validationChecks) {
    const result = await conn.runAndReadAll(check.query);
    const rows = result.getRowObjectsJS();
    if (rows.length > 0) {
      console.error(`Validation failed — ${check.description}:`);
      console.error(rows);
      validationFailed = true;
    }
  }

  if (validationFailed) {
    conn.closeSync();
    process.exit(1);
  }

  // --- Parquet export (per-species files) ---
  const speciesResult = await conn.runAndReadAll('SELECT id, genus, species FROM species');
  const speciesRows = speciesResult.getRowObjectsJS();

  let count = 0;
  for (const sp of speciesRows) {
    // Validate slug components to prevent path traversal (T-01-02)
    validateSlugComponent(sp.genus, 'genus');
    validateSlugComponent(sp.species, 'species');

    const slug = `${sp.genus}-${sp.species}`.toLowerCase().replace(/\s+/g, '-');
    const outDir = `data/parquet/${slug}`;
    mkdirSync(outDir, { recursive: true });

    await conn.run(`
      COPY (SELECT * FROM records WHERE species_slug = '${slug}')
      TO '${outDir}/records.parquet'
      (FORMAT parquet, COMPRESSION snappy)
    `);
    count++;
  }

  console.log(`Exported Parquet for ${count} species to data/parquet/`);

  // --- Cleanup ---
  conn.closeSync();
}

// Only run when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
