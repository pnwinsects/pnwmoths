// src/species-redirect.test.ts
// Regression guard for the retired-species redirect stub template (issues #155/#156).
// eleventy-plugin-vite's HTML asset scanner treats every <link href> as a copyable
// asset regardless of `rel` (unlike <meta>, which it only sweeps for a small allow-list
// of `name`/`property` values). Without `vite-ignore` on the canonical <link>, Vite's
// html plugin tries to fs.readFile the directory-style "/species/{slug}/" target and
// throws EISDIR at build time. See src/species-redirect.njk for the full explanation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import Eleventy from '@11ty/eleventy';
import { build as viteBuild } from 'vite';
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

test('species-redirect output survives a real Vite MPA build (EISDIR regression test)', async () => {
  // Reproduces the exact production layout: rendered redirect stubs alongside synthetic
  // "real species page" directories at each newSlug target (the directory-vs-file
  // collision that threw EISDIR before the vite-ignore fix). Runs a real vite.build()
  // and asserts it does not throw.
  const pages = await renderRedirectPages('/');
  const expected = getSpeciesRedirects();
  const dir = mkdtempSync(join(tmpdir(), 'pnwm-vite-eisdir-'));
  try {
    const input: Record<string, string> = {};
    for (const page of pages) {
      const outDir = join(dir, page.url.replace(/^\//, ''));
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'index.html'), page.content);
      input[page.url.replace(/^\/|\/$/g, '') + '/index'] = join(outDir, 'index.html');
    }
    for (const row of expected) {
      const targetDir = join(dir, 'species', row.newSlug);
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'index.html'), `<!DOCTYPE html><html><body>${row.newSlug}</body></html>`);
    }

    await assert.doesNotReject(
      () =>
        viteBuild({
          root: dir,
          logLevel: 'silent',
          build: {
            write: false,
            rollupOptions: { input },
          },
        }),
      'Vite build must not throw EISDIR when redirect canonical links point at sibling species output directories',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
