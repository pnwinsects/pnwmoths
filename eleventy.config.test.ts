// eleventy.config.test.ts
// Tests for CDN_BASE_URL constant and pathPrefix conditional in eleventy.config.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '.');
const configSource = readFileSync(resolve(ROOT, 'eleventy.config.ts'), 'utf8');

test('eleventy.config.ts: CDN_BASE_URL constant is defined with exact value', () => {
  assert.ok(
    configSource.includes('const CDN_BASE_URL = "https://moths.pnwinsects.org"'),
    'CDN_BASE_URL must be declared as const with exact value "https://moths.pnwinsects.org"'
  );
});

test('eleventy.config.ts: CDN_BASE_URL does not use process.env', () => {
  assert.ok(
    !configSource.includes('process.env.CDN'),
    'CDN_BASE_URL must not use process.env — it is a hard-coded public constant'
  );
});

test('eleventy.config.ts: CDN_BASE_URL does not use dotenv', () => {
  assert.ok(
    !configSource.includes('dotenv'),
    'eleventy.config.ts must not import or use dotenv'
  );
});

test('eleventy.config.ts: CDN_BASE_URL appears after pathPrefix declaration', () => {
  const pathPrefixIdx = configSource.indexOf('const pathPrefix');
  const cdnBaseIdx = configSource.indexOf('const CDN_BASE_URL');
  assert.ok(pathPrefixIdx !== -1, 'pathPrefix must be declared');
  assert.ok(cdnBaseIdx !== -1, 'CDN_BASE_URL must be declared');
  assert.ok(
    cdnBaseIdx > pathPrefixIdx,
    'CDN_BASE_URL must appear after pathPrefix in the file'
  );
});

test('eleventy.config.ts: CDN_BASE_URL appears before export default function', () => {
  const cdnBaseIdx = configSource.indexOf('const CDN_BASE_URL');
  const exportIdx = configSource.indexOf('export default function');
  assert.ok(cdnBaseIdx !== -1, 'CDN_BASE_URL must be declared');
  assert.ok(exportIdx !== -1, 'export default function must exist');
  assert.ok(
    cdnBaseIdx < exportIdx,
    'CDN_BASE_URL must appear before export default function'
  );
});

test('eleventy.config.ts: GITHUB_PAGES pathPrefix conditional is present', () => {
  assert.ok(
    configSource.includes('process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"'),
    'pathPrefix must use process.env.GITHUB_PAGES ? "/pnwmoths/" : "/" (exact literal required)'
  );
});

test('eleventy.config.ts: favicon is passthrough-copied to the site root', () => {
  assert.ok(
    configSource.includes('addPassthroughCopy({ "src/favicon.ico": "favicon.ico" })'),
    'src/favicon.ico must be copied to _site/favicon.ico — browsers request bare /favicon.ico'
  );
});

test('src/favicon.ico: exists and is a valid single-image 16x16 ICO', () => {
  const bytes = readFileSync(resolve(ROOT, 'src/favicon.ico'));
  assert.deepEqual(
    [...bytes.subarray(0, 4)],
    [0x00, 0x00, 0x01, 0x00],
    'favicon.ico must start with the ICO magic bytes 00 00 01 00'
  );
  assert.equal(bytes.readUInt16LE(4), 1, 'expected exactly one image in the ICO');
  assert.equal(bytes[6], 16, 'expected 16px width');
  assert.equal(bytes[7], 16, 'expected 16px height');
});

test('base.njk: declares the favicon via the url filter, never a hardcoded prefix', () => {
  const layout = readFileSync(resolve(ROOT, 'src/_includes/base.njk'), 'utf8');
  assert.ok(
    layout.includes(`<link rel="icon" href="{{ '/favicon.ico' | url }}"`),
    'base.njk must declare <link rel="icon"> using the url filter'
  );
  assert.ok(
    !layout.includes('/pnwmoths/favicon.ico'),
    'the favicon href must not hardcode the GitHub Pages path prefix'
  );
});
