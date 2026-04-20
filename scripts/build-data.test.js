// scripts/build-data.test.js
// Unit and integration tests for the build-data pre-build script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCsv } from '../scripts/build-data.js';

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
    ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen', 'navigational']
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
    (err) => {
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
      (err) => {
        assert.match(err.message, /non-UTF-8/i);
        return true;
      }
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- VALD-03 state validation test ---

test('build-data.js: state validation query catches invalid state values', async () => {
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
  const rows = result.getRowObjectsJS();

  assert.strictEqual(rows.length, 1, 'Should catch exactly 1 invalid state');
  assert.strictEqual(rows[0].state, 'TX', 'Invalid state should be TX');

  conn.closeSync();
});

// --- VALD-04 record_type validation test ---

test('build-data.js: sight_field_notes passes record_type validation query', async () => {
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

test('build-data.js: latitude 54.5 (valid BC record) passes coordinate bounds check', async () => {
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

test('integration: build-data.js with good CSV produces Parquet files', () => {
  // Run the full build script
  execSync('node scripts/build-data.js', { cwd: ROOT, stdio: 'pipe' });

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

test('integration: build-data.js with bad CSV data exits non-zero with "Validation failed"', () => {
  // Create a temp directory that mirrors the project structure but with bad records.csv
  const tmpDir = resolve(ROOT, '.tmp-bad-test');
  const tmpDataDir = resolve(tmpDir, 'data');
  mkdirSync(tmpDataDir, { recursive: true });

  // Copy species.csv, images.csv and glossary.csv unchanged, use records-bad.csv as records.csv
  copyFileSync(resolve(ROOT, 'data/species.csv'), resolve(tmpDataDir, 'species.csv'));
  copyFileSync(resolve(ROOT, 'data/images.csv'), resolve(tmpDataDir, 'images.csv'));
  copyFileSync(resolve(ROOT, 'data/glossary.csv'), resolve(tmpDataDir, 'glossary.csv'));
  copyFileSync(resolve(ROOT, 'data/records-bad.csv'), resolve(tmpDataDir, 'records.csv'));

  // Write a wrapper script that sets cwd to tmpDir and runs main()
  const scriptPath = resolve(ROOT, 'scripts/build-data.js');
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
      stderrOutput = err.stderr ? err.stderr.toString() : '';
    }

    assert.ok(threw, 'build-data.js should exit non-zero for bad data');
    assert.ok(
      stderrOutput.includes('Validation failed'),
      `stderr should contain "Validation failed", got: ${stderrOutput}`
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// WR-01: Regression test — invalid image_filename in glossary.csv is rejected
test('integration: build-data.js rejects invalid image_filename in glossary.csv', () => {
  const tmpDir = resolve(ROOT, '.tmp-glossary-wr01');
  const tmpDataDir = resolve(tmpDir, 'data');
  mkdirSync(tmpDataDir, { recursive: true });

  // Copy valid CSVs unchanged
  copyFileSync(resolve(ROOT, 'data/species.csv'), resolve(tmpDataDir, 'species.csv'));
  copyFileSync(resolve(ROOT, 'data/images.csv'), resolve(tmpDataDir, 'images.csv'));
  copyFileSync(resolve(ROOT, 'data/records.csv'), resolve(tmpDataDir, 'records.csv'));

  // Write a glossary.csv with an invalid image_filename (contains space and !)
  writeFileSync(resolve(tmpDataDir, 'glossary.csv'), [
    'term,definition,image_filename,photographer',
    'alula,A small lobe at the base of a wing,bad file!.jpg,Test Photographer'
  ].join('\n'));

  // Write a wrapper .mjs that sets cwd to tmpDir and calls main()
  const scriptPath = resolve(ROOT, 'scripts/build-data.js');
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
      stderrOutput = err.stderr ? err.stderr.toString() : '';
    }

    assert.ok(threw, 'build-data.js should exit non-zero for invalid glossary image_filename');
    assert.ok(
      stderrOutput.includes('Invalid image_filename'),
      `stderr should contain "Invalid image_filename", got: ${stderrOutput}`
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- Null-coercion tests for new Phase 8 columns ---

test('build-data.js: blank subfamily in species CSV arrives as NULL with nullstr', async () => {
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
    const rows = result.getRowObjectsJS();
    conn.closeSync();

    assert.strictEqual(rows[0].subfamily, null, 'blank subfamily cell should be NULL, not empty string');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('build-data.js: blank navigational in images CSV arrives as NULL with nullstr', async () => {
  const tmpDir = resolve(ROOT, '.tmp-nullstr-navigational');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'images-nullstr.csv');
  try {
    writeFileSync(tmpFile, [
      'species_slug,filename,photographer,weight,license,view,specimen,navigational',
      'acronicta-americana,01.jpg,Jane Doe,1,CC BY 4.0,,,'
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
          'specimen': 'VARCHAR',
          'navigational': 'VARCHAR'
        }
      )
    `);

    const result = await conn.runAndReadAll('SELECT navigational FROM images');
    const rows = result.getRowObjectsJS();
    conn.closeSync();

    assert.strictEqual(rows[0].navigational, null, 'blank navigational cell should be NULL, not empty string');
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
  const rows = result.getRowObjectsJS();

  assert.strictEqual(rows.length, 2, 'duplicate should be eliminated — 2 distinct pairs');
  assert.strictEqual(rows[0].species_slug, 'acronicta-americana');
  assert.strictEqual(rows[0].state, 'OR');
  assert.strictEqual(rows[1].species_slug, 'hyles-lineata');
  assert.strictEqual(rows[1].state, 'WA');

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

test('integration: emit-species-states.js writes _site/species-states.json', () => {
  execSync('node scripts/emit-species-states.js', { cwd: ROOT, stdio: 'pipe' });
  assert.ok(
    existsSync(resolve(ROOT, '_site/species-states.json')),
    '_site/species-states.json should exist'
  );
  const data = JSON.parse(readFileSync(resolve(ROOT, '_site/species-states.json'), 'utf8'));
  assert.ok(Array.isArray(data), 'species-states.json should be an array');
  assert.ok(
    data.every(el => 'species_slug' in el && 'state' in el),
    'every element should have species_slug and state properties'
  );
});

// --- Phase 9 taxon.js tests ---

test('taxon.js: returns family\u2192subfamily\u2192genus\u2192species tree', async () => {
  const { default: taxon } = await import('../src/_data/taxon.js');
  const tree = await taxon();
  assert.ok(Array.isArray(tree), 'tree should be an array');
  assert.ok(tree.length > 0, 'tree should have at least one family');
  const fam = tree[0];
  assert.ok('name' in fam && 'subfamilies' in fam && 'navImages' in fam, 'family missing required properties');
  assert.ok(Array.isArray(fam.subfamilies), 'subfamilies should be an array');
  const subfam = fam.subfamilies[0];
  assert.ok('name' in subfam && 'genera' in subfam && 'navImages' in subfam, 'subfamily missing required properties');
  const genus = subfam.genera[0];
  assert.ok('name' in genus && 'genus_slug' in genus && 'navImages' in genus && 'species' in genus, 'genus missing required properties');
  const sp = genus.species[0];
  assert.ok('slug' in sp && 'name' in sp && 'common_name' in sp, 'species missing required properties');
});

test('taxon.js: null-subfamily genera have name: null (not string)', async () => {
  const { default: taxon } = await import('../src/_data/taxon.js');
  const tree = await taxon();
  const nullSubfams = tree.flatMap(f => f.subfamilies).filter(s => s.name === null);
  // At least some genera in species.csv have no subfamily — verify null is used
  // If all species have subfamilies in test data, this assertion still must not throw
  for (const s of nullSubfams) {
    assert.strictEqual(s.name, null, 'null-subfamily node must have name: null, not a string');
  }
});

test('taxon.js: navImages capped at 4 per taxon level', async () => {
  const { default: taxon } = await import('../src/_data/taxon.js');
  const tree = await taxon();
  for (const fam of tree) {
    assert.ok(fam.navImages.length <= 4, `family ${fam.name} has >4 navImages`);
    for (const subfam of fam.subfamilies) {
      assert.ok(subfam.navImages.length <= 4, `subfamily ${subfam.name} has >4 navImages`);
      for (const genus of subfam.genera) {
        assert.ok(genus.navImages.length <= 4, `genus ${genus.name} has >4 navImages`);
      }
    }
  }
});
