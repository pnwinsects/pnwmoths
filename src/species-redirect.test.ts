// src/species-redirect.test.ts
// Regression guard for the retired-species redirect stub template (issues #155/#156).
// eleventy-plugin-vite's HTML asset scanner treats every <link href> as a copyable
// asset regardless of `rel` (unlike <meta>, which it only sweeps for a small allow-list
// of `name`/`property` values). Without `vite-ignore` on the canonical <link>, Vite's
// html plugin tries to fs.readFile the directory-style "/species/{slug}/" target and
// throws EISDIR at build time. See src/species-redirect.njk for the full explanation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const templateSource = readFileSync(resolve('src/species-redirect.njk'), 'utf8');

test('species-redirect.njk: paginates over speciesRedirects with one page per row', () => {
  assert.match(templateSource, /pagination:\s*\n\s*data:\s*speciesRedirects/);
  assert.match(templateSource, /size:\s*1/);
});

test('species-redirect.njk: permalink emits /species/{old_slug}/index.html (retires the old factsheet URL)', () => {
  assert.match(templateSource, /permalink:\s*"species\/\{\{\s*r\.oldSlug\s*\}\}\/index\.html"/);
});

test('species-redirect.njk: is excluded from Eleventy collections and uses no layout', () => {
  assert.match(templateSource, /layout:\s*false/);
  assert.match(templateSource, /eleventyExcludeFromCollections:\s*true/);
});

test('species-redirect.njk: canonical <link> carries vite-ignore (EISDIR regression guard)', () => {
  const linkTagMatch = templateSource.match(/<link\s+rel="canonical"[^>]*>/);
  assert.ok(linkTagMatch, 'expected a <link rel="canonical"> tag');
  assert.match(
    linkTagMatch![0],
    /\bvite-ignore\b/,
    'the canonical <link> must carry vite-ignore or eleventy-plugin-vite will try to ' +
      'read the directory-style href as a local asset file and throw EISDIR at build time'
  );
});

test('species-redirect.njk: is marked noindex (redirect stubs should not be indexed)', () => {
  assert.match(templateSource, /<meta name="robots" content="noindex">/);
});

test('species-redirect.njk: redirects via meta refresh, canonical link, and a JS fallback, all to the new slug', () => {
  assert.match(templateSource, /http-equiv="refresh"[^>]*url=\{\{\s*\(\s*'\/species\/'\s*\+\s*r\.newSlug/);
  assert.match(templateSource, /window\.location\.replace\(\{\{\s*\(\s*'\/species\/'\s*\+\s*r\.newSlug/);
});
