// eleventy.config.test.js
// Tests for CDN_BASE_URL constant in eleventy.config.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '.');
const configSource = readFileSync(resolve(ROOT, 'eleventy.config.js'), 'utf8');

test('eleventy.config.js: CDN_BASE_URL constant is defined with exact value', () => {
  assert.ok(
    configSource.includes('const CDN_BASE_URL = "https://pnwmoths.b-cdn.net"'),
    'CDN_BASE_URL must be declared as const with exact value "https://pnwmoths.b-cdn.net"'
  );
});

test('eleventy.config.js: CDN_BASE_URL does not use process.env', () => {
  assert.ok(
    !configSource.includes('process.env.CDN'),
    'CDN_BASE_URL must not use process.env — it is a hard-coded public constant'
  );
});

test('eleventy.config.js: CDN_BASE_URL does not use dotenv', () => {
  assert.ok(
    !configSource.includes('dotenv'),
    'eleventy.config.js must not import or use dotenv'
  );
});

test('eleventy.config.js: CDN_BASE_URL appears after pathPrefix declaration', () => {
  const pathPrefixIdx = configSource.indexOf('const pathPrefix');
  const cdnBaseIdx = configSource.indexOf('const CDN_BASE_URL');
  assert.ok(pathPrefixIdx !== -1, 'pathPrefix must be declared');
  assert.ok(cdnBaseIdx !== -1, 'CDN_BASE_URL must be declared');
  assert.ok(
    cdnBaseIdx > pathPrefixIdx,
    'CDN_BASE_URL must appear after pathPrefix in the file'
  );
});

test('eleventy.config.js: CDN_BASE_URL appears before export default function', () => {
  const cdnBaseIdx = configSource.indexOf('const CDN_BASE_URL');
  const exportIdx = configSource.indexOf('export default function');
  assert.ok(cdnBaseIdx !== -1, 'CDN_BASE_URL must be declared');
  assert.ok(exportIdx !== -1, 'export default function must exist');
  assert.ok(
    cdnBaseIdx < exportIdx,
    'CDN_BASE_URL must appear before export default function'
  );
});
