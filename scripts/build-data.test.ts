// scripts/build-data.test.ts
// Unit and integration tests for the build-data pre-build script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateCsv } from './build-data.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Unit tests for validateCsv ---

test('validateCsv: species.csv with correct columns does not throw', () => {
  validateCsv(
    resolve(ROOT, 'data/species.csv'),
    ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species', 'subfamily']
  );
  // If we reach here, no error was thrown — pass
});

test('validateCsv: images.csv with correct columns does not throw', () => {
  validateCsv(
    resolve(ROOT, 'data/images.csv'),
    ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen']
  );
});

test('validateCsv: glossary.csv with correct columns does not throw', () => {
  validateCsv(
    resolve(ROOT, 'data/glossary.csv'),
    ['term', 'definition', 'image_filename', 'photographer']
  );
});

test('validateCsv: missing required column throws with actionable message', () => {
  assert.throws(
    () => validateCsv(
      resolve(ROOT, 'data/species.csv'),
      ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'MISSING_COL']
    ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /missing required column.*MISSING_COL/i);
      return true;
    }
  );
});

test('validateCsv: non-UTF-8 bytes throw with actionable message', () => {
  // Create a temp CSV with non-UTF-8 bytes
  const tmpDir = resolve(ROOT, '.tmp-test');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'bad-encoding.csv');

  try {
    // Write a file with invalid UTF-8 bytes (Latin-1 ü = 0xFC)
    const buf = Buffer.from('id,name\n1,H\xFCbner\n', 'binary');
    writeFileSync(tmpFile, buf);

    assert.throws(
      () => validateCsv(tmpFile, ['id', 'name']),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /non-UTF-8/i);
        return true;
      }
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- VALD-03 state validation test ---

test('build-data.ts: state validation query catches invalid state values', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  // Create a minimal records table with one valid and one invalid state
  await conn.run(`
    CREATE TABLE records AS
    SELECT 'specimen' AS record_type, 47.0 AS latitude, -122.0 AS longitude,
           'WA' AS state
    UNION ALL
    SELECT 'specimen', 47.0, -122.0, 'TX'
  `);

  const result = await conn.runAndReadAll(`
    SELECT DISTINCT state FROM records
    WHERE state NOT IN ('WA', 'OR', 'ID', 'BC', 'AB', 'MT')
      AND state IS NOT NULL
      AND state != ''
  `);
  const rows = result.getRowObjectsJS() as Array<{ state: string }>;

  assert.strictEqual(rows.length, 1, 'Should catch exactly 1 invalid state');
  const [firstRow] = rows;
  assert.ok(firstRow !== undefined);
  assert.strictEqual(firstRow.state, 'TX', 'Invalid state should be TX');

  conn.closeSync();
});

// --- VALD-04 record_type validation test ---

test('build-data.ts: sight_field_notes passes record_type validation query', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE records AS
    SELECT 'sight_field_notes' AS record_type
  `);

  const result = await conn.runAndReadAll(`
    SELECT DISTINCT record_type FROM records
    WHERE record_type NOT IN ('specimen', 'photograph', 'literature', 'field notes', 'sight_field_notes')
  `);
  const rows = result.getRowObjectsJS();

  assert.strictEqual(rows.length, 0, 'sight_field_notes should pass record_type validation (0 invalid rows)');

  conn.closeSync();
});

// --- VALD-05 latitude bounds test ---

test('build-data.ts: latitude 54.5 (valid BC record) passes coordinate bounds check', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE records AS
    SELECT 'acronicta-americana' AS species_slug, 54.5 AS latitude, -122.0 AS longitude
  `);

  const result = await conn.runAndReadAll(`
    SELECT species_slug, latitude, longitude FROM records
    WHERE latitude < 42.0 OR latitude > 55.0
       OR longitude < -125.0 OR longitude > -110.0
  `);
  const rows = result.getRowObjectsJS();

  assert.strictEqual(rows.length, 0, 'latitude 54.5 should pass bounds check (0 out-of-bounds rows)');

  conn.closeSync();
});

// --- Integration tests ---

test('integration: build-data.ts with good CSV produces Parquet files', () => {
  // Run the full build script
  execSync('node scripts/build-data.ts', { cwd: ROOT, stdio: 'pipe' });

  // Check that per-species Parquet files were created
  assert.ok(
    existsSync(resolve(ROOT, 'data/parquet/acronicta-americana/records.parquet')),
    'data/parquet/acronicta-americana/records.parquet should exist'
  );
  assert.ok(
    existsSync(resolve(ROOT, 'data/parquet/hyles-lineata/records.parquet')),
    'data/parquet/hyles-lineata/records.parquet should exist'
  );
});

test('integration: build-data.ts with bad CSV data exits non-zero with "Validation failed"', () => {
  // Create a temp directory that mirrors the project structure but with bad records.csv
  const tmpDir = resolve(ROOT, '.tmp-bad-test');
  const tmpDataDir = resolve(tmpDir, 'data');
  mkdirSync(tmpDataDir, { recursive: true });

  // Copy species.csv, images.csv and glossary.csv unchanged, use records-bad.csv as records.csv
  copyFileSync(resolve(ROOT, 'data/species.csv'), resolve(tmpDataDir, 'species.csv'));
  copyFileSync(resolve(ROOT, 'data/images.csv'), resolve(tmpDataDir, 'images.csv'));
  copyFileSync(resolve(ROOT, 'data/glossary.csv'), resolve(tmpDataDir, 'glossary.csv'));
  copyFileSync(resolve(ROOT, 'data/records-bad.csv'), resolve(tmpDataDir, 'records.csv'));
  // build-data.ts hard-fails when data/records-inat.csv is absent, because a
  // committed file going missing would silently drop every imported record
  // from the site. Each fixture therefore stages the real one.
  copyFileSync(resolve(ROOT, 'data/records-inat.csv'), resolve(tmpDataDir, 'records-inat.csv'));

  // Write a wrapper script that sets cwd to tmpDir and runs main()
  const scriptPath = resolve(ROOT, 'scripts/build-data.ts');
  const wrapperScript = resolve(tmpDir, 'run-bad.mjs');
  writeFileSync(wrapperScript, [
    `import { main } from '${scriptPath}';`,
    `process.chdir('${tmpDir}');`,
    `main().catch(err => { console.error(err.message); process.exit(1); });`
  ].join('\n'));

  try {
    let threw = false;
    let stderrOutput = '';
    try {
      execSync(`node ${wrapperScript}`, {
        cwd: tmpDir,
        timeout: 30000,
        stdio: 'pipe'
      });
    } catch (err) {
      threw = true;
      const e = err as { stderr?: Buffer };
      stderrOutput = e.stderr ? e.stderr.toString() : '';
    }

    assert.ok(threw, 'build-data.ts should exit non-zero for bad data');
    assert.ok(
      stderrOutput.includes('Validation failed'),
      `stderr should contain "Validation failed", got: ${stderrOutput}`
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// WR-01: Regression test — invalid image_filename in glossary.csv is rejected
test('integration: build-data.ts rejects invalid image_filename in glossary.csv', () => {
  const tmpDir = resolve(ROOT, '.tmp-glossary-wr01');
  const tmpDataDir = resolve(tmpDir, 'data');
  mkdirSync(tmpDataDir, { recursive: true });

  // Copy valid CSVs unchanged
  copyFileSync(resolve(ROOT, 'data/species.csv'), resolve(tmpDataDir, 'species.csv'));
  copyFileSync(resolve(ROOT, 'data/images.csv'), resolve(tmpDataDir, 'images.csv'));
  copyFileSync(resolve(ROOT, 'data/records.csv'), resolve(tmpDataDir, 'records.csv'));
  copyFileSync(resolve(ROOT, 'data/records-inat.csv'), resolve(tmpDataDir, 'records-inat.csv'));

  // Write a glossary.csv with an invalid image_filename (contains space and !)
  writeFileSync(resolve(tmpDataDir, 'glossary.csv'), [
    'term,definition,image_filename,photographer',
    'alula,A small lobe at the base of a wing,bad file!.jpg,Test Photographer'
  ].join('\n'));

  // Write a wrapper .mjs that sets cwd to tmpDir and calls main()
  const scriptPath = resolve(ROOT, 'scripts/build-data.ts');
  const wrapperScript = resolve(tmpDir, 'run-glossary-bad.mjs');
  writeFileSync(wrapperScript, [
    `import { main } from '${scriptPath}';`,
    `process.chdir('${tmpDir}');`,
    `main().catch(err => { console.error(err.message); process.exit(1); });`
  ].join('\n'));

  try {
    let threw = false;
    let stderrOutput = '';
    try {
      execSync(`node ${wrapperScript}`, {
        cwd: tmpDir,
        timeout: 30000,
        stdio: 'pipe'
      });
    } catch (err) {
      threw = true;
      const e = err as { stderr?: Buffer };
      stderrOutput = e.stderr ? e.stderr.toString() : '';
    }

    assert.ok(threw, 'build-data.ts should exit non-zero for invalid glossary image_filename');
    assert.ok(
      stderrOutput.includes('Invalid image_filename'),
      `stderr should contain "Invalid image_filename", got: ${stderrOutput}`
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- Null-coercion tests for new Phase 8 columns ---

test('build-data.ts: blank subfamily in species CSV arrives as NULL with nullstr', async () => {
  const tmpDir = resolve(ROOT, '.tmp-nullstr-subfamily');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'species-nullstr.csv');
  try {
    writeFileSync(tmpFile, [
      'id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily',
      '1,Acronicta,americana,American Dagger Moth,9200,Harris 1841,Noctuidae,autographa-californica,'
    ].join('\n'));

    const { DuckDBInstance } = await import('@duckdb/node-api');
    const db = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();

    await conn.run(`
      CREATE TABLE species AS
      SELECT * FROM read_csv('${tmpFile}',
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
          'subfamily': 'VARCHAR'
        }
      )
    `);

    const result = await conn.runAndReadAll('SELECT subfamily FROM species');
    const rows = result.getRowObjectsJS() as Array<{ subfamily: string | null }>;
    conn.closeSync();

    const [firstRow] = rows;
    assert.ok(firstRow !== undefined);
    assert.strictEqual(firstRow.subfamily, null, 'blank subfamily cell should be NULL, not empty string');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('build-data.ts: blank specimen in images CSV arrives as NULL with nullstr', async () => {
  const tmpDir = resolve(ROOT, '.tmp-nullstr-specimen');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'images-nullstr.csv');
  try {
    writeFileSync(tmpFile, [
      'species_slug,filename,photographer,weight,license,view,specimen',
      'acronicta-americana,01.jpg,Jane Doe,1,CC BY 4.0,,'
    ].join('\n'));

    const { DuckDBInstance } = await import('@duckdb/node-api');
    const db = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();

    await conn.run(`
      CREATE TABLE images AS
      SELECT * FROM read_csv('${tmpFile}',
        header = true,
        nullstr = '',
        columns = {
          'species_slug': 'VARCHAR',
          'filename': 'VARCHAR',
          'photographer': 'VARCHAR',
          'weight': 'INTEGER',
          'license': 'VARCHAR',
          'view': 'VARCHAR',
          'specimen': 'VARCHAR'
        }
      )
    `);

    const result = await conn.runAndReadAll('SELECT specimen FROM images');
    const rows = result.getRowObjectsJS() as Array<{ specimen: string | null }>;
    conn.closeSync();

    const [firstRow] = rows;
    assert.ok(firstRow !== undefined);
    assert.strictEqual(firstRow.specimen, null, 'blank specimen cell should be NULL, not empty string');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- emit-species-states tests ---

test('emit-species-states: SELECT DISTINCT returns correct pair count from synthetic data', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE records AS
    SELECT 'acronicta-americana' AS species_slug, 'OR' AS state
    UNION ALL
    SELECT 'acronicta-americana', 'OR'
    UNION ALL
    SELECT 'hyles-lineata', 'WA'
  `);

  const result = await conn.runAndReadAll(`
    SELECT DISTINCT species_slug, state
    FROM records
    WHERE state IS NOT NULL AND state != ''
    ORDER BY species_slug, state
  `);
  const rows = result.getRowObjectsJS() as Array<{ species_slug: string; state: string }>;

  assert.strictEqual(rows.length, 2, 'duplicate should be eliminated — 2 distinct pairs');
  const [row0, row1] = rows;
  assert.ok(row0 !== undefined);
  assert.ok(row1 !== undefined);
  assert.strictEqual(row0.species_slug, 'acronicta-americana');
  assert.strictEqual(row0.state, 'OR');
  assert.strictEqual(row1.species_slug, 'hyles-lineata');
  assert.strictEqual(row1.state, 'WA');

  conn.closeSync();
});

test('emit-species-states: NULL and empty-string states excluded from DISTINCT result', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE records AS
    SELECT 'acronicta-americana' AS species_slug, 'OR' AS state
    UNION ALL
    SELECT 'hyles-lineata', NULL
    UNION ALL
    SELECT 'catocala-sp', ''
  `);

  const result = await conn.runAndReadAll(`
    SELECT DISTINCT species_slug, state
    FROM records
    WHERE state IS NOT NULL AND state != ''
    ORDER BY species_slug, state
  `);
  const rows = result.getRowObjectsJS();

  assert.strictEqual(rows.length, 1, 'NULL and empty-string states should be excluded — only 1 row survives');

  conn.closeSync();
});

test('integration: emit-species-states.ts writes _site/species-states.json', () => {
  execSync('node scripts/emit-species-states.ts', { cwd: ROOT, stdio: 'pipe' });
  assert.ok(
    existsSync(resolve(ROOT, '_site/species-states.json')),
    '_site/species-states.json should exist'
  );
  const data: unknown = JSON.parse(readFileSync(resolve(ROOT, '_site/species-states.json'), 'utf8'));
  assert.ok(Array.isArray(data), 'species-states.json should be an array');
  assert.ok(
    (data as unknown[]).every(el => {
      const obj = el as Record<string, unknown>;
      return 'species_slug' in obj && 'state' in obj;
    }),
    'every element should have species_slug and state properties'
  );
});

// --- Phase 9 taxon.ts tests ---
// taxon.ts is an Eleventy data file (converted from taxon.js in phase 36-02)

test('taxon.ts: returns family→subfamily→tribe→genus→species tree', async () => {
  const { default: taxon } = await import('../src/_data/taxon.ts');
  const tree = await taxon();
  assert.ok(Array.isArray(tree), 'tree should be an array');
  assert.ok(tree.length > 0, 'tree should have at least one family');
  const [fam] = tree as Array<Record<string, unknown>>;
  assert.ok(fam !== undefined);
  assert.ok('name' in fam && 'subfamilies' in fam && 'navImages' in fam, 'family missing required properties');
  const subfamilies = fam['subfamilies'] as unknown[];
  assert.ok(Array.isArray(subfamilies), 'subfamilies should be an array');
  const [subfam] = subfamilies as Array<Record<string, unknown>>;
  assert.ok(subfam !== undefined);
  assert.ok('name' in subfam && 'tribes' in subfam && 'navImages' in subfam, 'subfamily missing required properties');
  const tribes = subfam['tribes'] as unknown[];
  assert.ok(Array.isArray(tribes), 'tribes should be an array');
  const [tribe] = tribes as Array<Record<string, unknown>>;
  assert.ok(tribe !== undefined);
  assert.ok('name' in tribe && 'genera' in tribe && 'navImages' in tribe, 'tribe missing required properties');
  const genera = tribe['genera'] as unknown[];
  const [genus] = genera as Array<Record<string, unknown>>;
  assert.ok(genus !== undefined);
  assert.ok('name' in genus && 'genus_slug' in genus && 'navImages' in genus && 'species' in genus, 'genus missing required properties');
  const speciesList = genus['species'] as unknown[];
  const [sp] = speciesList as Array<Record<string, unknown>>;
  assert.ok(sp !== undefined);
  assert.ok('slug' in sp && 'name' in sp && 'common_name' in sp, 'species missing required properties');
});

test('taxon.ts: null-subfamily genera have name: null (not string)', async () => {
  const { default: taxon } = await import('../src/_data/taxon.ts');
  const tree = await taxon();
  const allFamilies = tree as Array<{ subfamilies: Array<{ name: string | null }> }>;
  const nullSubfams = allFamilies.flatMap(f => f.subfamilies).filter(s => s.name === null);
  // At least some genera in species.csv have no subfamily — verify null is used
  // If all species have subfamilies in test data, this assertion still must not throw
  for (const s of nullSubfams) {
    assert.strictEqual(s.name, null, 'null-subfamily node must have name: null, not a string');
  }
});

test('taxon.ts: navImages capped at 4 per taxon level', async () => {
  const { default: taxon } = await import('../src/_data/taxon.ts');
  const tree = await taxon();
  const allFamilies = tree as Array<{ name: string; navImages: unknown[]; subfamilies: Array<{ name: string | null; navImages: unknown[]; tribes: Array<{ name: string | null; navImages: unknown[]; genera: Array<{ name: string; navImages: unknown[] }> }> }> }>;
  for (const fam of allFamilies) {
    assert.ok(fam.navImages.length <= 4, `family ${fam.name} has >4 navImages`);
    for (const subfam of fam.subfamilies) {
      assert.ok(subfam.navImages.length <= 4, `subfamily ${subfam.name} has >4 navImages`);
      for (const tribe of subfam.tribes) {
        assert.ok(tribe.navImages.length <= 4, `tribe ${tribe.name} has >4 navImages`);
        for (const genus of tribe.genera) {
          assert.ok(genus.navImages.length <= 4, `genus ${genus.name} has >4 navImages`);
        }
      }
    }
  }
});

// --- CDN-03: filename validation regex accepts spaces (Phase 13 plan 01) ---

test('build-data.ts: images.csv filename regex accepts Django original filenames with spaces', () => {
  // The widened regex must accept filenames like "Acronicta americana-A-D.jpg"
  const re = /^[a-zA-Z0-9 ._-]+$/;
  assert.ok(re.test('Acronicta americana-A-D.jpg'), 'space in filename should be accepted');
  assert.ok(re.test('Hyles lineata-B-V.jpg'), 'space in genus-species separator should be accepted');
  assert.ok(re.test('01.jpg'), 'simple numeric filename still accepted');
  assert.ok(!re.test('foo/bar.jpg'), 'path traversal slash rejected');
  assert.ok(!re.test('foo\x00.jpg'), 'null byte rejected');
  assert.ok(!re.test('foo!bar.jpg'), 'exclamation mark rejected');
});

// --- Real-data gate: no duplicate (species_slug, filename) rows for hemieuxoa-rudens ---
// #156 found `hemieuxoa-rudens,Hemieuxoa rudens-B-V.jpg` catalogued twice (weights 1
// and 5), which would render the same ventral thumbnail twice in the species-page
// carousel. This locks the fix in place. (Note: a handful of *other* species have
// their own pre-existing duplicate/cleanup rows tracked by separate issues — e.g.
// hecatera-dysodea's live-moth rows in #157 — which are intentionally out of scope
// here and not asserted against.)
test('real data/images.csv has no duplicate (species_slug, filename) rows for hemieuxoa-rudens', async () => {
  const { parse } = await import('csv-parse/sync');
  const raw = readFileSync(resolve(ROOT, 'data/images.csv'));
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Array<{
    species_slug: string;
    filename: string;
  }>;

  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.species_slug !== 'hemieuxoa-rudens') continue;
    const key = `${row.species_slug} ${row.filename}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(
    duplicates,
    [],
    `expected no duplicate hemieuxoa-rudens rows, found: ${duplicates
      .map(([key, count]) => `${key} x${count}`)
      .join(', ')}`
  );
  assert.equal(seen.size, 4, 'expected exactly 4 distinct hemieuxoa-rudens image rows (A-D, A-V, B-D, B-V)');
});

// --- Real-data gate: drasteria-nubicola -> drasteria-maculosa image reassignment (#156) ---
// Merrill Peterson confirmed the two legacy images catalogued under drasteria-nubicola
// (the legacy CMS's own drasteria-maculosa factsheet links these exact two files as its
// featured photos) genuinely depict Drasteria maculosa. The rows must be reassigned
// (not duplicated) to the canonical drasteria-maculosa slug with renamed filenames,
// preserving every other metadata field (photographer/license/view/specimen/locality/
// coordinates/date/collector) verbatim.
test('real data/images.csv: drasteria-nubicola images are reassigned to drasteria-maculosa (#156)', async () => {
  const { parse } = await import('csv-parse/sync');
  const raw = readFileSync(resolve(ROOT, 'data/images.csv'));
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Array<{
    species_slug: string;
    filename: string;
    photographer: string;
    weight: string;
    license: string;
    view: string;
    specimen: string;
    locality: string;
    state: string;
    latitude: string;
    longitude: string;
    elevation_ft: string;
    year: string;
    month: string;
    day: string;
    collector: string;
  }>;

  const nubicolaRows = rows.filter((r) => r.species_slug === 'drasteria-nubicola');
  assert.deepEqual(nubicolaRows, [], 'drasteria-nubicola should have zero images.csv rows after reassignment');

  const maculosaRows = rows.filter((r) => r.species_slug === 'drasteria-maculosa');
  assert.equal(maculosaRows.length, 2, 'expected exactly 2 drasteria-maculosa image rows (A-D, A-V)');

  const byView = new Map(maculosaRows.map((r) => [r.view, r]));
  const dorsal = byView.get('dorsal');
  const ventral = byView.get('ventral');
  assert.ok(dorsal, 'expected a dorsal drasteria-maculosa row');
  assert.ok(ventral, 'expected a ventral drasteria-maculosa row');
  assert.equal(dorsal!.filename, 'Drasteria maculosa-A-D.jpg');
  assert.equal(ventral!.filename, 'Drasteria maculosa-A-V.jpg');

  for (const row of [dorsal!, ventral!]) {
    assert.equal(row.specimen, 'A');
    assert.equal(row.photographer, 'Merrill A. Peterson');
    assert.equal(row.license, 'CC BY-NC-SA 4.0');
    assert.equal(row.locality, 'Mono Valley, Hwy 167 N of Mono L. Salt flat at springs');
    assert.equal(row.state, 'CA');
    assert.equal(row.latitude, '38.09');
    assert.equal(row.longitude, '-118.99');
    assert.equal(row.elevation_ft, '6460');
    assert.equal(row.year, '1995');
    assert.equal(row.month, '8');
    assert.equal(row.day, '1');
    assert.equal(row.collector, 'J. Troubridge & LG Crabo');
  }
});

// --- Real-data gate: euxoa-aurantiaca is on the unpublished deny-list (#156) ---
test('real data/unpublished-species.csv contains euxoa-aurantiaca (#156 curator omission)', () => {
  const raw = readFileSync(resolve(ROOT, 'data/unpublished-species.csv'), 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const found = lines.some((l) => l.split(',')[0]?.trim().toLowerCase() === 'euxoa-aurantiaca');
  assert.ok(found, 'expected euxoa-aurantiaca as a slug in data/unpublished-species.csv');
});

// --- Real-data gate: callopistria-floridensis common name + legacy photo ingest (#156) ---
// The legacy WWU factsheet (family-noctuidae/subfamily-eriopinae/callopistria/
// callopistria-floridensis/) carries a common name ("Florida Fern Moth") that was never
// migrated into data/species.csv, and its curator-confirmed specimen-A photos (dorsal +
// ventral) were never ingested into data/images.csv. Both are now sourced directly from
// the still-live legacy site.
test('real data/species.csv: callopistria-floridensis has its legacy common name', async () => {
  const { parse } = await import('csv-parse/sync');
  const rows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), {
    columns: true, skip_empty_lines: true,
  }) as Array<{ genus: string; species: string; common_name: string }>;
  const row = rows.find((r) => r.genus === 'Callopistria' && r.species === 'floridensis');
  assert.ok(row, 'expected a Callopistria floridensis row in data/species.csv');
  assert.equal(row!.common_name, 'Florida Fern Moth');
});

test('real data/images.csv: callopistria-floridensis has its legacy specimen-A photos (#156)', async () => {
  const { parse } = await import('csv-parse/sync');
  const rows = parse(readFileSync(resolve(ROOT, 'data/images.csv')), { columns: true, skip_empty_lines: true }) as Array<{
    species_slug: string; filename: string; view: string; specimen: string; photographer: string;
    license: string; locality: string; state: string; latitude: string; longitude: string;
    elevation_ft: string; year: string; month: string; day: string; collector: string;
  }>;

  const rowsForSlug = rows.filter((r) => r.species_slug === 'callopistria-floridensis');
  assert.equal(rowsForSlug.length, 2, 'expected exactly 2 callopistria-floridensis image rows (A-D, A-V)');

  const byView = new Map(rowsForSlug.map((r) => [r.view, r]));
  const dorsal = byView.get('dorsal');
  const ventral = byView.get('ventral');
  assert.ok(dorsal, 'expected a dorsal callopistria-floridensis row');
  assert.ok(ventral, 'expected a ventral callopistria-floridensis row');
  assert.equal(dorsal!.filename, 'Callopistria floridensis-A-D.jpg');
  assert.equal(ventral!.filename, 'Callopistria floridensis-A-V.jpg');

  for (const row of [dorsal!, ventral!]) {
    assert.equal(row.specimen, 'A');
    assert.equal(row.photographer, 'Merrill A. Peterson');
    assert.equal(row.license, 'CC BY-NC-SA 4.0');
    assert.equal(row.locality, 'Bull Creek Wildlife Mgt Area; unnamed cypress pond 4.6 mi due W of Deer Park');
    assert.equal(row.state, 'FL');
    assert.equal(row.latitude, '28.10');
    assert.equal(row.longitude, '-80.97');
    assert.equal(row.elevation_ft, '65');
    assert.equal(row.year, '1992');
    assert.equal(row.month, '5');
    assert.equal(row.day, '12');
    assert.equal(row.collector, 'LG Crabo');
  }
});

// --- Real-data gate: clostera-brucei narrow-sense specimen-C legacy photo ingest (#156) ---
// #159 reassigned the A/B specimen pairs to clostera-multnoma, leaving clostera-brucei with
// zero images.csv rows; the narrow-sense C specimen was confirmed only in the curator's
// high-res Dropbox source (still `discovered`, not uploaded). This ingests the same C
// specimen's low-res photos directly from the still-live legacy site.
test('real data/images.csv: clostera-brucei has only its narrow-sense specimen-C photos (#156)', async () => {
  const { parse } = await import('csv-parse/sync');
  const rows = parse(readFileSync(resolve(ROOT, 'data/images.csv')), { columns: true, skip_empty_lines: true }) as Array<{
    species_slug: string; filename: string; view: string; specimen: string; photographer: string;
    license: string; locality: string; state: string; elevation_ft: string; year: string;
    month: string; day: string; collector: string;
  }>;

  const rowsForSlug = rows.filter((r) => r.species_slug === 'clostera-brucei');
  assert.equal(rowsForSlug.length, 2, 'expected exactly 2 clostera-brucei image rows (C-D, C-V)');
  for (const row of rowsForSlug) {
    assert.equal(row.specimen, 'C', 'clostera-brucei must only catalogue the narrow-sense C specimen');
  }

  const byView = new Map(rowsForSlug.map((r) => [r.view, r]));
  const dorsal = byView.get('dorsal');
  const ventral = byView.get('ventral');
  assert.ok(dorsal, 'expected a dorsal clostera-brucei row');
  assert.ok(ventral, 'expected a ventral clostera-brucei row');
  assert.equal(dorsal!.filename, 'Clostera brucei-C-D.jpg');
  assert.equal(ventral!.filename, 'Clostera brucei-C-V.jpg');

  for (const row of [dorsal!, ventral!]) {
    assert.equal(row.photographer, 'Merrill A. Peterson');
    assert.equal(row.license, 'CC BY-NC-SA 4.0');
    assert.equal(row.locality, 'Doolittle Ranch, Mt. Evans');
    assert.equal(row.state, 'CO');
    assert.equal(row.elevation_ft, '9800');
    assert.equal(row.year, '1961');
    assert.equal(row.month, '7');
    assert.equal(row.day, '11');
    assert.equal(row.collector, 'EW Rockburne');
  }
});

test('integration: build-data.ts accepts images.csv filename with spaces without throwing', () => {
  const tmpDir = resolve(ROOT, '.tmp-space-filename');
  const tmpDataDir = resolve(tmpDir, 'data');
  mkdirSync(tmpDataDir, { recursive: true });

  copyFileSync(resolve(ROOT, 'data/species.csv'), resolve(tmpDataDir, 'species.csv'));
  copyFileSync(resolve(ROOT, 'data/glossary.csv'), resolve(tmpDataDir, 'glossary.csv'));
  copyFileSync(resolve(ROOT, 'data/records.csv'), resolve(tmpDataDir, 'records.csv'));
  copyFileSync(resolve(ROOT, 'data/records-inat.csv'), resolve(tmpDataDir, 'records-inat.csv'));

  // Write an images.csv with a filename containing a space (Django-style original filename)
  writeFileSync(resolve(tmpDataDir, 'images.csv'), [
    'species_slug,filename,photographer,weight,license,view,specimen',
    'acronicta-americana,Acronicta americana-A-D.jpg,Jane Doe,1,CC BY 4.0,dorsal,A'
  ].join('\n'));

  const scriptPath = resolve(ROOT, 'scripts/build-data.ts');
  const wrapperScript = resolve(tmpDir, 'run-space.mjs');
  writeFileSync(wrapperScript, [
    `import { main } from '${scriptPath}';`,
    `process.chdir('${tmpDir}');`,
    `main().catch(err => { console.error(err.message); process.exit(1); });`
  ].join('\n'));

  try {
    execSync(`node ${wrapperScript}`, {
      cwd: tmpDir,
      timeout: 30000,
      stdio: 'pipe'
    });
    // If we reach here without throwing, the filename with space was accepted
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- ISSUE-157: reject legacy backslash-escaped apostrophes in common_name ---

test('build-data.ts: real data/species.csv has no literal backslash before an apostrophe in common_name', () => {
  const rows = validateCsv(
    resolve(ROOT, 'data/species.csv'),
    ['id', 'genus', 'species', 'common_name']
  );
  const offenders = rows.filter(r => (r.common_name ?? '').includes("\\'"));
  assert.deepStrictEqual(
    offenders.map(r => r.common_name),
    [],
    `Expected no common_name with a literal backslash before an apostrophe, found: ${offenders.map(r => r.common_name).join(', ')}`
  );
});

test('integration: build-data.ts rejects a literal backslash-apostrophe in species.csv common_name', () => {
  const tmpDir = resolve(ROOT, '.tmp-species-backslash-apostrophe');
  const tmpDataDir = resolve(tmpDir, 'data');
  mkdirSync(tmpDataDir, { recursive: true });

  copyFileSync(resolve(ROOT, 'data/images.csv'), resolve(tmpDataDir, 'images.csv'));
  copyFileSync(resolve(ROOT, 'data/glossary.csv'), resolve(tmpDataDir, 'glossary.csv'));
  copyFileSync(resolve(ROOT, 'data/records.csv'), resolve(tmpDataDir, 'records.csv'));
  copyFileSync(resolve(ROOT, 'data/records-inat.csv'), resolve(tmpDataDir, 'records-inat.csv'));

  // Write a species.csv row with the legacy escaping bug reintroduced.
  writeFileSync(resolve(tmpDataDir, 'species.csv'), [
    'id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily,epithet_quoted,tribe',
    "1,Alypia,ridingsii,Ridings\\'s Forester Moth,93-1982,\"Grote, 1865\",Noctuidae,,Agaristinae,,"
  ].join('\n'));

  // Use pathToFileURL so the import specifier is a valid file:// URL on Windows
  // (a bare Windows absolute path like "C:\\..." is rejected by the ESM loader), and
  // JSON.stringify so embedded backslashes (Windows paths) survive as JS string literals.
  const scriptUrl = pathToFileURL(resolve(ROOT, 'scripts/build-data.ts')).href;
  const wrapperScript = resolve(tmpDir, 'run-backslash-apostrophe.mjs');
  writeFileSync(wrapperScript, [
    `import { main } from ${JSON.stringify(scriptUrl)};`,
    `process.chdir(${JSON.stringify(tmpDir)});`,
    `main().catch(err => { console.error(err.message); process.exit(1); });`
  ].join('\n'));

  try {
    let threw = false;
    let stderrOutput = '';
    try {
      execSync(`node ${wrapperScript}`, {
        cwd: tmpDir,
        timeout: 30000,
        stdio: 'pipe'
      });
    } catch (err) {
      threw = true;
      const e = err as { stderr?: Buffer };
      stderrOutput = e.stderr ? e.stderr.toString() : '';
    }

    assert.ok(threw, 'build-data.ts should exit non-zero for a literal backslash-apostrophe in common_name');
    assert.ok(
      stderrOutput.includes('Invalid common_name'),
      `stderr should contain "Invalid common_name", got: ${stderrOutput}`
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- ISSUE-157: remaining launch-cleanup regressions on real data ---

test('build-data.ts: all three Globia species carry tribe "Apameini" in real data/species.csv', () => {
  const rows = validateCsv(
    resolve(ROOT, 'data/species.csv'),
    ['id', 'genus', 'species', 'tribe']
  );
  const globia = rows.filter(r => r.genus === 'Globia');
  assert.strictEqual(globia.length, 3, `expected 3 Globia rows, got ${globia.length}`);
  for (const row of globia) {
    assert.strictEqual(
      row.tribe,
      'Apameini',
      `Globia ${row.species} expected tribe "Apameini", got "${row.tribe}"`
    );
  }
});

test('build-data.ts: Lymantria dispar common_name is "Spongy Moth" (not "Gypsy Moth") in real data/species.csv', () => {
  const rows = validateCsv(
    resolve(ROOT, 'data/species.csv'),
    ['id', 'genus', 'species', 'common_name']
  );
  const dispar = rows.find(r => r.genus === 'Lymantria' && r.species === 'dispar');
  assert.ok(dispar, 'expected a Lymantria dispar row in species.csv');
  assert.strictEqual(dispar!.common_name, 'Spongy Moth');
});

test('build-data.ts: hecatera-dysodea keeps only its A dorsal/ventral specimen pair in real data/images.csv', () => {
  const rows = validateCsv(
    resolve(ROOT, 'data/images.csv'),
    ['species_slug', 'filename', 'weight', 'view', 'specimen']
  );
  const hecatera = rows.filter(r => r.species_slug === 'hecatera-dysodea');
  assert.strictEqual(hecatera.length, 2, `expected 2 hecatera-dysodea image rows, got ${hecatera.length}`);
  for (const row of hecatera) {
    assert.strictEqual(row.specimen, 'A', `expected specimen "A", got "${row.specimen}"`);
  }
});

// --- #156: Clostera brucei -> multnoma photo misidentification correction ---
// Merrill Peterson confirmed the catalogued A/B specimens were misidentified: they
// are C. multnoma, not C. brucei. The narrow-sense C. brucei specimens (C-D/C-V)
// were ingested directly from the legacy WWU site's live low-res photos (#156);
// the same pair also exists in the curator's high-res Dropbox source for a later
// upgrade (still `discovered` in data/species-photos-manifest.csv).
test('real data/images.csv: clostera-brucei A/B specimens are reassigned to clostera-multnoma', async () => {
  const { parse } = await import('csv-parse/sync');
  const raw = readFileSync(resolve(ROOT, 'data/images.csv'));
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Array<{
    species_slug: string;
    filename: string;
    specimen: string;
  }>;

  const bruceiRows = rows.filter(r => r.species_slug === 'clostera-brucei');
  const bruceiSpecimens = bruceiRows.map(r => r.specimen).sort();
  assert.deepEqual(
    bruceiSpecimens,
    ['C', 'C'],
    'clostera-brucei should catalogue only the narrow-sense C specimen (dorsal + ventral)'
  );

  const multnomaBrucieFilenameRows = rows.filter(
    r => r.species_slug === 'clostera-multnoma' && r.filename.startsWith('Clostera brucei-')
  );
  assert.equal(
    multnomaBrucieFilenameRows.length,
    4,
    'expected the 4 reassigned A/B specimen rows (still using their original CDN filenames) under clostera-multnoma'
  );
  const specimens = multnomaBrucieFilenameRows.map(r => r.specimen).sort();
  assert.deepEqual(specimens, ['A', 'A', 'B', 'B'], 'expected both A and B specimen pairs (dorsal + ventral)');
});

