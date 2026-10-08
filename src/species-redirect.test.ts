// src/species-redirect.test.ts
// Regression guard for the retired-species redirect stub template (issues #155/#156).
// (It also guarded an EISDIR failure in eleventy-plugin-vite's HTML asset scanner, via a
// `vite-ignore` attribute on the canonical <link>. Vite no longer reads the HTML, so the
// attribute and that guard went with the plugin; ADR 0049.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import Eleventy from '@11ty/eleventy';
import getSpeciesRedirects from './_data/speciesRedirects.ts';

const templateSource = readFileSync(resolve('src/species-redirect.njk'), 'utf8');

// Drives a real Eleventy build of just src/species-redirect.njk (mirroring the
// eleventy.config.ts `ts` data-extension wiring, including the .test.ts skip) so
// the rendered output — not just the template source — is asserted against.
// Eleventy's programmatic `config` callback return value is ignored, so pathPrefix
// must go through the constructor options, not the callback's returned object.
async function renderRedirectPages(pathPrefix: string) {
  const elev = new Eleventy('src/species-redirect.njk', undefined, {
    pathPrefix,
    config(eleventyConfig) {
      eleventyConfig.setInputDirectory('src');
      eleventyConfig.addDataExtension('ts', {
        read: false,
        parser: async (filePath: string) => {
          if (filePath.endsWith('.test.ts')) return undefined;
          const absolutePath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
          const m = (await import(pathToFileURL(absolutePath).href)) as { default: unknown };
          const exported = m.default;
          return typeof exported === 'function' ? exported() : exported;
        },
      });
    },
  });
  const json = (await elev.toJSON()) as Array<{ url: string; content: string }>;
  return json;
}

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

test('species-redirect.njk: is marked noindex (redirect stubs should not be indexed)', () => {
  assert.match(templateSource, /<meta name="robots" content="noindex">/);
});

test('species-redirect.njk: redirects via meta refresh, canonical link, and a JS fallback, all to the new slug', () => {
  assert.match(templateSource, /http-equiv="refresh"[^>]*url=\{\{\s*\(\s*'\/species\/'\s*\+\s*r\.newSlug/);
  assert.match(templateSource, /window\.location\.replace\(\{\{\s*\(\s*'\/species\/'\s*\+\s*r\.newSlug/);
});

test('species-redirect.njk: every redirect target (meta refresh, canonical, anchor, script) is pathPrefix-safe via the `url` filter', () => {
  // Line-based (not first-`)`-terminated regex) so the `(` inside `('/species/' + r.newSlug + '/')`
  // doesn't truncate the match before reaching the filter chain.
  const metaMatch = templateSource.match(/<meta http-equiv="refresh"[^>]*>/);
  const linkMatch = templateSource.match(/<link rel="canonical"[^>]*>/);
  const anchorMatch = templateSource.match(/<a href="[^"]*">/);
  const scriptLine = templateSource.split('\n').find(line => line.includes('window.location.replace'));

  assert.ok(metaMatch && metaMatch[0].includes('| url'), 'meta refresh target must apply the `url` filter');
  assert.ok(linkMatch && linkMatch[0].includes('| url'), 'canonical href must apply the `url` filter');
  assert.ok(anchorMatch && anchorMatch[0].includes('| url'), 'fallback anchor href must apply the `url` filter');
  assert.ok(
    scriptLine && scriptLine.includes('| url | dump'),
    'inline JS fallback must apply `| url` before `| dump` — otherwise the JS redirect ignores pathPrefix on GitHub Pages staging',
  );
});

test('species-redirect.njk: renders exactly the 8 distinct old-slug paths from data/species-redirects.csv, each to its correct canonical target, with no output collisions', async () => {
  const pages = await renderRedirectPages('/');
  const expected = getSpeciesRedirects();

  assert.equal(pages.length, expected.length, `expected exactly ${expected.length} rendered redirect pages`);

  const urls = pages.map(p => p.url);
  assert.equal(new Set(urls).size, urls.length, 'rendered redirect page URLs must be distinct (no output collisions)');

  const urlToNewSlug = new Map(
    pages.map(p => {
      const canonicalMatch = p.content.match(/<link rel="canonical" href="([^"]*)"/);
      return [p.url, canonicalMatch?.[1]];
    }),
  );

  for (const row of expected) {
    const pageUrl = `/species/${row.oldSlug}/`;
    assert.ok(urls.includes(pageUrl), `expected a rendered page at ${pageUrl}`);
    assert.equal(
      urlToNewSlug.get(pageUrl),
      `/species/${row.newSlug}/`,
      `${pageUrl} must canonicalize to /species/${row.newSlug}/`,
    );
  }
});

test('species-redirect.njk: pathPrefix "/pnwmoths/" (GitHub Pages) prefixes every redirect target, including the inline script', async () => {
  const pages = await renderRedirectPages('/pnwmoths/');
  assert.ok(pages.length > 0);
  for (const page of pages) {
    assert.match(page.content, /http-equiv="refresh" content="0; url=\/pnwmoths\/species\//);
    assert.match(page.content, /<link rel="canonical" href="\/pnwmoths\/species\//);
    assert.match(page.content, /<a href="\/pnwmoths\/species\//);
    assert.match(
      page.content,
      /window\.location\.replace\("\/pnwmoths\/species\//,
      'inline JS fallback must also be prefixed with pathPrefix on GitHub Pages staging',
    );
  }
});
