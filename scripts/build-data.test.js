// scripts/build-data.test.js
// Unit and integration tests for the build-data pre-build script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
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
    ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority']
  );
  // If we reach here, no error was thrown — pass
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

  // Copy species.csv unchanged, use records-bad.csv as records.csv
  copyFileSync(resolve(ROOT, 'data/species.csv'), resolve(tmpDataDir, 'species.csv'));
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
