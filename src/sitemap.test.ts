import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// src/sitemap.njk lists `collections.all` with no filtering of its own, which is only
// correct because every page that must not be indexed opts out of collections. That is
// an invariant across ~20 templates, enforced nowhere else: a new unlinked page that
// sets `robots: noindex` but forgets `eleventyExcludeFromCollections` would be
// advertised to crawlers by our own sitemap, which is worse than having no sitemap.
//
// Tested at the source level because the alternative — asserting against built output —
// needs a full ~1,300-page build, and this has to fail in `npm test`, before the build.

const SITEMAP = readFileSync(resolve('src/sitemap.njk'), 'utf8');
const ROBOTS = readFileSync(resolve('src/robots.njk'), 'utf8');

function pageTemplates(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === '_includes' || entry === 'content') continue;
      pageTemplates(path, found);
    } else if (/\.(njk|md)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

test('sitemap: every noindex or redirect template is excluded from collections', () => {
  const leaking = pageTemplates(resolve('src'))
    .filter((path) => {
      const source = readFileSync(path, 'utf8');
      const hidden = /^\s*robots:\s*noindex/m.test(source)
        || /<meta name="robots" content="noindex/.test(source)
        || /http-equiv="refresh"/.test(source);
      return hidden && !/^\s*eleventyExcludeFromCollections:\s*true/m.test(source);
    })
    .map((path) => path.replace(`${resolve('.')}/`, '').replaceAll('\\', '/'));
  assert.deepEqual(
    leaking,
    [],
    'this page is kept out of search but still appears in collections.all, so ' +
      'src/sitemap.njk submits it to crawlers — add `eleventyExcludeFromCollections: true`',
  );
});

test('sitemap: emits absolute URLs', () => {
  // A sitemap with pathPrefix-relative or origin-less <loc> values is rejected wholesale
  // by Search Console, and the GitHub Pages staging build has a different origin again.
  assert.match(SITEMAP, /\{\{ item\.url \| url \| absoluteUrl \}\}/);
  assert.match(SITEMAP, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
});

test('sitemap and robots stay out of their own listing', () => {
  for (const [name, source] of [['sitemap', SITEMAP], ['robots', ROBOTS]] as const) {
    assert.match(
      source as string,
      /^eleventyExcludeFromCollections: true$/m,
      `${name} would otherwise list itself as an indexable page`,
    );
  }
});

test('robots.txt allows the unlinked internal pages to be fetched', () => {
  // /analytics/ and /curation/ are kept out of search by `robots: noindex` in their
  // front matter. A crawler can only obey a meta tag on a page it is allowed to fetch,
  // so disallowing them here would make them MORE likely to be indexed, not less.
  assert.doesNotMatch(ROBOTS, /^Disallow: \S/m);
  assert.match(ROBOTS, /^User-agent: \*$/m);
  assert.match(ROBOTS, /^Sitemap: \{\{ "\/sitemap\.xml" \| url \| absoluteUrl \}\}$/m);
});
