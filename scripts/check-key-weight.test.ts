// scripts/check-key-weight.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const SCRIPT = join(ROOT, 'scripts/check-key-weight.ts');
const TEMP_DIR = join(ROOT, '_tmp_key_weight_test');

test('check-key-weight.ts: exits 0 when artifact is under budget', () => {
  mkdirSync(TEMP_DIR, { recursive: true });
  const smallJson = JSON.stringify({ matrix: [], species: [], characters: [] });
  const artifactPath = join(TEMP_DIR, 'key-matrix.json');
  writeFileSync(artifactPath, smallJson);

  try {
    const result = spawnSync('node', [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        KEY_MATRIX_PATH: artifactPath,
        KEY_BUDGET_BYTES: String(50 * 1024),
      },
    });
    const output = result.stdout + result.stderr;
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. Output: ${output}`);
    assert.ok(output.includes('[key-weight] OK:'), `Expected OK line, got: ${output}`);
  } finally {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
});

test('check-key-weight.ts: exits 1 when artifact exceeds budget', () => {
  mkdirSync(TEMP_DIR, { recursive: true });
  // Any non-empty JSON file will gzip to at least ~20 bytes (gzip header + content).
  // Set budget to 1 byte so any artifact exceeds it.
  const smallJson = JSON.stringify({ matrix: [], species: [], characters: [] });
  const artifactPath = join(TEMP_DIR, 'key-matrix-over.json');
  writeFileSync(artifactPath, smallJson);

  try {
    const result = spawnSync('node', [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        KEY_MATRIX_PATH: artifactPath,
        KEY_BUDGET_BYTES: '1', // 1-byte budget — any gzip output exceeds this
      },
    });
    const output = result.stdout + result.stderr;
    assert.strictEqual(result.status, 1, `Expected exit 1, got ${result.status}. Output: ${output}`);
    assert.ok(output.includes('[key-weight] FAIL:'), `Expected FAIL line, got: ${output}`);
  } finally {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
});

test('check-key-weight.ts: exits 1 when artifact is missing', () => {
  const result = spawnSync('node', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KEY_MATRIX_PATH: join(TEMP_DIR, 'nonexistent.json'),
    },
  });
  const output = result.stdout + result.stderr;
  assert.strictEqual(result.status, 1, `Expected exit 1, got ${result.status}. Output: ${output}`);
  assert.ok(output.includes('[key-weight] ERROR:'), `Expected ERROR line, got: ${output}`);
});
