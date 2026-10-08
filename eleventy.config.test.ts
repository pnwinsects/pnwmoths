// eleventy.config.test.ts
// Tests for CDN_BASE_URL, the shared pathPrefix, and how public/ reaches the site
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

test('eleventy.config.ts: CDN_BASE_URL appears after the pathPrefix import', () => {
  const pathPrefixIdx = configSource.search(/import \{[^}]*\bpathPrefix\b[^}]*\} from "\.\/src\/_lib\/vite-entries\.ts"/);
  const cdnBaseIdx = configSource.indexOf('const CDN_BASE_URL');
  assert.ok(pathPrefixIdx !== -1, 'pathPrefix must be imported from src/_lib/vite-entries.ts');
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

test('vite-entries.ts: GITHUB_PAGES pathPrefix conditional is present, shared by both builds', () => {
  // One definition, because Eleventy (page links, the viteEntry tags) and Vite (URLs inside
  // the bundle) must agree on it (ADR 0049).
  const entriesSource = readFileSync(resolve(ROOT, 'src/_lib/vite-entries.ts'), 'utf8');
  assert.ok(
    entriesSource.includes("export const pathPrefix = process.env['GITHUB_PAGES'] ? '/pnwmoths/' : '/';"),
    "pathPrefix must be process.env['GITHUB_PAGES'] ? '/pnwmoths/' : '/' (exact literal required)"
  );
  const viteSource = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(viteSource, /base: pathPrefix/, 'vite.config.ts must take `base` from the shared pathPrefix');
});

test('vite.config.ts: Vite has no publicDir; Eleventy copies public/ to the site root', () => {
  const viteSource = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(viteSource, /publicDir: false/, 'Vite must not copy public/: it no longer builds the HTML that references it');
  assert.ok(
    configSource.includes('eleventyConfig.addPassthroughCopy({ public: "/" });'),
    'public/ must be passthrough-copied to the site root by Eleventy (ADR 0049)'
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
    layout.includes(`<link rel="icon" href="{{ '/favicon.ico' | url }}"`),
    'base.njk must declare <link rel="icon"> through `| url`, which applies pathPrefix'
  );
  assert.ok(
    !layout.includes('/pnwmoths/favicon.ico'),
    'the favicon href must not hardcode the GitHub Pages path prefix'
  );
});

// Site chrome on every page lives in public/, which Eleventy copies to the site root.
// Nothing rewrites these URLs any more (ADR 0049), so each must go through `| url` to
// pick up pathPrefix, and must name a file that exists in public/.
test('base.njk: every per-page image is a public/ file, referenced through `| url`', () => {
  const layout = readFileSync(resolve(ROOT, 'src/_includes/base.njk'), 'utf8');
  const urls = [...layout.matchAll(/\{\{ '(\/[^']*\.(?:png|svg|jpg|jpeg|gif|ico|webp))' \| url \}\}/g)]
    .map(m => m[1] as string);
  assert.ok(urls.length > 0, 'expected at least the banner and the favicon');
  for (const url of urls) {
    assert.ok(existsSync(resolve(ROOT, 'public', url.replace(/^\//, ''))), `${url} is referenced on every page but is not in public/`);
  }
});

test('base.njk: no per-page image or link uses a bare root-absolute path', () => {
  const layout = readFileSync(resolve(ROOT, 'src/_includes/base.njk'), 'utf8');
  assert.ok(
    !/<(?:img|link)[^>]*?(?:src|href)="\/[^/]/.test(layout),
    'a bare "/..." URL skips pathPrefix and 404s on GitHub Pages: use `| url` (ADR 0049)'
  );
});

test('index.njk: range map is a public/ asset referenced through `| url`', () => {
  const index = readFileSync(resolve(ROOT, 'src/index.njk'), 'utf8');
  assert.ok(
    index.includes(`<img src="{{ '/images/pnw-range.svg' | url }}"`),
    'index.njk must reference the range map through `| url`, which applies pathPrefix (ADR 0049)'
  );
  assert.ok(
    existsSync(resolve(ROOT, 'public/images/pnw-range.svg')),
    'the range map must live in public/ — a generator-path drift would 404 the home page image'
  );
});

test('generate-range-map.ts: writes the range map into public/', () => {
  const generatorSource = readFileSync(resolve(ROOT, 'scripts/generate-range-map.ts'), 'utf8');
  assert.ok(
    /OUT_PATH\s*=\s*['"]public\/images\/pnw-range\.svg['"]/.test(generatorSource),
    'the generator must emit into public/, which Eleventy copies to the site root'
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
