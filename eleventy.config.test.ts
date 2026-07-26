// eleventy.config.test.ts
// Tests for CDN_BASE_URL constant and pathPrefix conditional in eleventy.config.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '.');
const configSource = readFileSync(resolve(ROOT, 'eleventy.config.ts'), 'utf8');
const partnersSource = readFileSync(resolve(ROOT, 'src/_data/partners.ts'), 'utf8');

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

test('eleventy.config.ts: Vite publicDir is the top-level "public" directory', () => {
  assert.ok(
    configSource.includes('publicDir: "public"'),
    'viteOptions.publicDir must be the project-root-relative "public" — assets under it are ' +
      'rewritten by string substitution instead of being fs.readFile()d once per page (issue #187)'
  );
});

test('eleventy.config.ts: public/ is not also passthrough-copied', () => {
  assert.ok(
    !/addPassthroughCopy\(\s*["'{][^)]*\bpublic\b/.test(configSource),
    'eleventy-plugin-vite passthrough-copies publicDir itself; a second copy would be redundant'
  );
});

test('public/favicon.ico: exists and is a valid single-image 16x16 ICO', () => {
  const bytes = readFileSync(resolve(ROOT, 'public/favicon.ico'));
  assert.deepEqual(
    [...bytes.subarray(0, 4)],
    [0x00, 0x00, 0x01, 0x00],
    'favicon.ico must start with the ICO magic bytes 00 00 01 00'
  );
  assert.equal(bytes.readUInt16LE(4), 1, 'expected exactly one image in the ICO');
  assert.equal(bytes[6], 16, 'expected 16px width');
  assert.equal(bytes[7], 16, 'expected 16px height');
});

test('base.njk: declares the favicon without a hardcoded prefix', () => {
  const layout = readFileSync(resolve(ROOT, 'src/_includes/base.njk'), 'utf8');
  assert.ok(
    layout.includes('<link rel="icon" href="/favicon.ico"'),
    'base.njk must declare <link rel="icon"> with a plain root-absolute public path'
  );
  assert.ok(
    !layout.includes('/pnwmoths/favicon.ico'),
    'the favicon href must not hardcode the GitHub Pages path prefix'
  );
});

// Regression guard for issue #187. Every root-absolute asset reference that the
// shared layout puts on all ~1,300 pages must resolve inside public/, so Vite's
// checkPublicFile short-circuit fires and no per-page fs.readFile happens. A file
// that drifts out of public/ silently reintroduces the EMFILE fan-out.
test('base.njk: every per-page root-absolute image lives in public/', () => {
  const layout = readFileSync(resolve(ROOT, 'src/_includes/base.njk'), 'utf8');
  const srcs = [...layout.matchAll(/<(?:img|link)[^>]*?(?:src|href)="(\/[^"{}]*\.(?:png|svg|jpg|jpeg|gif|ico|webp))"/g)]
    .map(m => m[1] as string);
  assert.ok(srcs.length > 0, 'expected at least the banner and the favicon');
  for (const url of srcs) {
    assert.ok(
      existsSync(resolve(ROOT, 'public', url.replace(/^\//, ''))),
      `${url} is referenced on every page but is not in public/ — it would be read once per page by Vite`
    );
  }
});

test('base.njk: per-page image URLs do not use the url filter', () => {
  const layout = readFileSync(resolve(ROOT, 'src/_includes/base.njk'), 'utf8');
  assert.ok(
    !/<(?:img|link)[^>]*?(?:src|href)="\{\{[^"]*\|\s*url\s*\}\}"/.test(layout),
    'public assets must be plain root-absolute paths: Vite applies `base` (= pathPrefix) to them, ' +
      'and an already-prefixed URL misses checkPublicFile and gets probed once per page'
  );
});

test('partner logos: every declared logo file exists in public/images/logos/', () => {
  const logos = [...partnersSource.matchAll(/logo:\s*['"]([^'"]+)['"]/g)].map(m => m[1] as string);
  assert.ok(logos.length > 0, 'expected partner logos to be declared');
  for (const logo of logos) {
    assert.ok(
      existsSync(resolve(ROOT, 'public/images/logos', logo)),
      `partner logo ${logo} is missing from public/images/logos/`
    );
  }
});
