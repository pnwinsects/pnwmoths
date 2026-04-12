// scripts/check-page-weight.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FAKE_SITE = join(ROOT, '_site_test_weight');
const SCRIPT = join(ROOT, 'scripts/check-page-weight.js');

test('check-page-weight.js: warns on page exceeding 500KB', () => {
  mkdirSync(FAKE_SITE, { recursive: true });
  const bigHtml = 'x'.repeat(600 * 1024); // 600KB
  writeFileSync(join(FAKE_SITE, 'big.html'), bigHtml);

  try {
    const result = spawnSync(
      'node',
      [SCRIPT],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SITE_DIR: FAKE_SITE } }
    );
    const output = result.stdout + result.stderr;
    assert.ok(
      output.includes('[page-weight] WARNING:'),
      `Expected WARNING line in output, got: ${output}`
    );
    assert.strictEqual(result.status, 0, 'Script must exit 0 (warn-only, per D-11)');
  } finally {
    rmSync(FAKE_SITE, { recursive: true, force: true });
  }
});

test('check-page-weight.js: no warning on pages under threshold', () => {
  mkdirSync(FAKE_SITE, { recursive: true });
  writeFileSync(join(FAKE_SITE, 'small.html'), '<html>small</html>');

  try {
    const result = spawnSync(
      'node',
      [SCRIPT],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SITE_DIR: FAKE_SITE } }
    );
    const output = result.stdout + result.stderr;
    assert.ok(
      !output.includes('[page-weight] WARNING:'),
      `Expected no WARNING line in output, got: ${output}`
    );
    assert.strictEqual(result.status, 0);
  } finally {
    rmSync(FAKE_SITE, { recursive: true, force: true });
  }
});
