// scripts/build-data.ts
// Pre-build script: validates CSV input, imports into DuckDB, exports per-species Parquet files.
// Run via: npm run build:data
import { DuckDBInstance } from '@duckdb/node-api';
import type { DuckDBConnection } from '@duckdb/node-api';
import { readFileSync, mkdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { OccurrenceRecordSchema } from '../src/types/schemas.ts';
import {
  RECORDS_COLUMNS,
  RECORDS_INAT_COLUMNS,
  RECORDS_INAT_CSV_PATH,
  RECORD_COORDINATE_BOUNDS,
  createAllRecordsTable,
  hasInatRecords,
} from './lib/records-source.ts';
import { pathToFileURL } from 'node:url';

/**
 * Pre-flight CSV validation (before DuckDB import).
 * Checks UTF-8 encoding and required column presence.
 *
 * @param filePath - Absolute or relative path to the CSV file
 * @param requiredColumns - Column names that must be present
 * @returns Parsed rows (array of objects)
 * @throws {Error} If encoding is invalid or required column is missing
 */
export function validateCsv(filePath: string, requiredColumns: string[]): Record<string, string>[] {
  let raw: Buffer;
  try {
    raw = readFileSync(filePath);
  } catch (e) {
    throw new Error(`Cannot read ${filePath}: ${(e as Error).message}`);
  }

  // Verify UTF-8 encoding — fatal: true rejects invalid byte sequences
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new Error(
      `${filePath} contains non-UTF-8 bytes. If edited in Excel on Windows, re-save as CSV UTF-8.`
    );
  }

  const rows: Record<string, string>[] = parse(raw, { columns: true, skip_empty_lines: true });

  if (rows.length === 0) {
    throw new Error(`${filePath} is empty or has no data rows.`);
  }

  const [firstRow] = rows;
  if (!firstRow) throw new Error(`${filePath} is empty or has no data rows.`);
  const headers = Object.keys(firstRow);
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
 * Prevents path traversal via species names from CSV (T-01-02 / T-35P3-01).
 * COPY TO parquet cannot be parameterized — this regex guard is the correct mitigation.
 *
 * @param value - The genus or species string to validate
 * @param fieldName - Field name for error messages
 * @throws {Error} If value contains characters outside [a-zA-Z0-9 -]
 */
function validateSlugComponent(value: string, fieldName: string): void {
  if (!/^[a-zA-Z0-9 -]+$/.test(value)) {
    throw new Error(
      `Invalid ${fieldName} value "${value}" — only alphanumeric characters, spaces, and hyphens are allowed.`
    );
  }
}

/**
 * SCHEMA-04: After Parquet generation, read back one species' Parquet (first alphabetically)
 * via DuckDB DESCRIBE and compare column names to OccurrenceRecordSchema.shape.
 * Throws if any column is missing or extra, failing the build.
 * O(columns) cost — not per-row.
 *
 * @param conn - Already-open DuckDB connection (D-08: reuse existing connection)
 * @param firstSlug - Slug of the first species (deterministic alphabetical order, D-07)
 */
async function verifySampleParquetSchema(conn: DuckDBConnection, firstSlug: string): Promise<void> {
  const parquetPath = `data/parquet/${firstSlug}/records.parquet`;
  const result = await conn.runAndReadAll(
    `DESCRIBE SELECT * FROM read_parquet('${parquetPath}')`
  );
  const actualCols: string[] = (result.getRowObjectsJS() as Array<{ column_name: string }>)
    .map(r => r.column_name);
  const expectedCols: string[] = Object.keys(OccurrenceRecordSchema.shape);
  const missing = expectedCols.filter(c => !actualCols.includes(c));
  const extra = actualCols.filter(c => !expectedCols.includes(c));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Parquet column schema mismatch on ${firstSlug}.\n` +
      `  Missing: ${missing.join(', ') || 'none'}\n` +
      `  Extra:   ${extra.join(', ') || 'none'}`
    );
  }
  console.log(`Parquet schema OK: ${actualCols.length} columns match OccurrenceRecordSchema`);
}

/**
 * Main pipeline: validate CSVs, import into DuckDB, run quality checks, export Parquet files.
 */
export async function main(): Promise<void> {
  // --- Pre-flight CSV validation ---
  const speciesCsvRows = validateCsv('data/species.csv', ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species', 'subfamily', 'epithet_quoted', 'tribe']);
  for (const row of speciesCsvRows) {
    const commonName = row['common_name'];
    if (commonName && commonName.includes("\\'")) {
      throw new Error(
        `Invalid common_name "${commonName}" in species.csv — remove the legacy backslash before the apostrophe (write it as a plain "'").`
      );
    }
  }
  const imageRows = validateCsv('data/images.csv', ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen']);
  for (const row of imageRows) {
    const filename = row['filename'];
    if (filename !== undefined && !/^[a-zA-Z0-9 ._-]+$/.test(filename)) {
      throw new Error(`Invalid image filename "${filename}" in images.csv — only alphanumeric, spaces, dots, hyphens, and underscores allowed.`);
    }
  }
  const glossaryRows = validateCsv('data/glossary.csv', ['term', 'definition', 'image_filename', 'photographer']);
  for (const row of glossaryRows) {
    const imageFilename = row['image_filename'];
    if (imageFilename && !/^[a-zA-Z0-9 ._-]+$/.test(imageFilename)) {
      throw new Error(
        `Invalid image_filename "${imageFilename}" in glossary.csv — only alphanumeric, spaces, dots, hyphens, and underscores allowed.`
      );
    }
  }
  validateCsv('data/records.csv', [...RECORDS_COLUMNS]);
  // The iNaturalist import (#23) is validated only when it has rows. A
  // header-only file is the legitimate state of the repo before the first sync
  // runs, and validateCsv throws on a CSV with no data rows.
  if (hasInatRecords()) {
    validateCsv(RECORDS_INAT_CSV_PATH, [...RECORDS_INAT_COLUMNS]);
  }

  // --- DuckDB import with explicit schema ---
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  // species.csv — WITH nullstr='' (empty strings become NULL, e.g. common_name, subfamily, tribe)
  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv',
      header = true,
      nullstr = '',
      columns = {
        'id': 'INTEGER',
        'genus': 'VARCHAR',
        'species': 'VARCHAR',
        'common_name': 'VARCHAR',
        'noc_id': 'VARCHAR',
        'authority': 'VARCHAR',
        'family': 'VARCHAR',
        'similar_species': 'VARCHAR',
        'subfamily': 'VARCHAR',
        'epithet_quoted': 'VARCHAR',
        'tribe': 'VARCHAR'
      }
    )
  `);

  // Every occurrence record the site serves: the curator file plus, when
  // present, the machine-owned iNaturalist import (#23). Read WITHOUT
  // nullstr='' (blank cells become NULL; county/district_id are now populated
  // for ~96%+ of rows following the Phase 44 legacy re-join). The column spec
  // and the union live in scripts/lib/records-source.ts.
  await createAllRecordsTable(conn);

  // --- Post-import validation queries ---
  const validationChecks: { description: string; query: string }[] = [
    {
      description: 'orphaned records (species_slug not in species table)',
      query: `
        SELECT DISTINCT r.species_slug
        FROM records r
        LEFT JOIN species s ON r.species_slug = regexp_replace(lower(trim(s.genus) || '-' || trim(s.species)), '\\s+', '-', 'g')
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
      description:
        `out-of-bounds coordinates (PNW bounds: lat ${RECORD_COORDINATE_BOUNDS.latMin}-${RECORD_COORDINATE_BOUNDS.latMax}, ` +
        `lon ${RECORD_COORDINATE_BOUNDS.lonMin} to ${RECORD_COORDINATE_BOUNDS.lonMax})`,
      query: `
        SELECT species_slug, latitude, longitude FROM records
        WHERE latitude < ${RECORD_COORDINATE_BOUNDS.latMin} OR latitude > ${RECORD_COORDINATE_BOUNDS.latMax}
           OR longitude < ${RECORD_COORDINATE_BOUNDS.lonMin} OR longitude > ${RECORD_COORDINATE_BOUNDS.lonMax}
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
    const rows = result.getRowObjectsJS() as Record<string, unknown>[];
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
  const speciesRows = speciesResult.getRowObjectsJS() as Array<{ id: number; genus: string; species: string }>;

  let count = 0;
  for (const sp of speciesRows) {
    // Validate slug components to prevent path traversal (T-35P3-01)
    // COPY TO parquet does not support parameterized file paths — validateSlugComponent is the correct mitigation
    validateSlugComponent(sp.genus, 'genus');
    validateSlugComponent(sp.species, 'species');

    const slug = `${sp.genus}-${sp.species}`.toLowerCase().replace(/\s+/g, '-');
    const outDir = `data/parquet/${slug}`;
    mkdirSync(outDir, { recursive: true });

    // String interpolation is intentional here — COPY TO parquet cannot use parameterized paths.
    // validateSlugComponent above ensures no path traversal is possible (T-35P3-01).
    await conn.run(`
      COPY (SELECT * FROM records WHERE species_slug = '${slug}')
      TO '${outDir}/records.parquet'
      (FORMAT parquet, COMPRESSION snappy)
    `);
    count++;
  }

  console.log(`Exported Parquet for ${count} species to data/parquet/`);

  // --- SCHEMA-04: Verify sample Parquet column schema (D-06, D-07, D-08, D-11) ---
  // Sort speciesRows to get deterministic first slug (alphabetical by genus+species, D-07)
  const sortedSpecies = [...speciesRows].sort((a, b) =>
    (a.genus + a.species).toLowerCase().localeCompare((b.genus + b.species).toLowerCase())
  );
  const [firstSp] = sortedSpecies;
  if (!firstSp) throw new Error('No species rows found — cannot verify Parquet schema');
  const firstSlug = `${firstSp.genus}-${firstSp.species}`.toLowerCase().replace(/\s+/g, '-');
  await verifySampleParquetSchema(conn, firstSlug);

  // --- Cleanup ---
  conn.closeSync();
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
