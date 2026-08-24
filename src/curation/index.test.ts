// src/curation/index.test.ts
// Guards for the /curation/ index (issue #332).
//
// The page is deliberately UNLINKED: absent from the nav and the footer, noindex, and
// excluded from the Pagefind index. Each of those is one line that a well-meaning edit
// could delete without any other check noticing — the page would keep building, keep
// passing the link check, and quietly start appearing in search results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { curationReports } from '../_data/curationReports.ts';

const page = readFileSync(resolve('src/curation/index.njk'), 'utf8');
const partial = readFileSync(resolve('src/_includes/curation-report.njk'), 'utf8');
const layout = readFileSync(resolve('src/_includes/base.njk'), 'utf8');

test('/curation/ asks not to be indexed by crawlers', () => {
  assert.match(page, /^robots:\s*noindex/m);
});

test('/curation/ is excluded from the Pagefind index', () => {
  assert.match(page, /data-pagefind-ignore/);
});

test('/curation/ is excluded from Eleventy collections', () => {
  assert.match(page, /^eleventyExcludeFromCollections:\s*true$/m);
});

test('/curation/ is not linked from the site nav or footer', () => {
  // A mention in a comment is fine; an <a href> is what makes the page discoverable.
  assert.ok(
    !/href="\{\{ '\/curation\/' \| url \}\}"/.test(layout),
    'base.njk must not link the unlinked page',
  );
});

/** Every page template that renders through base.njk, found by walking src/. */
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

test('no other page links to /curation/', () => {
  const linkers = pageTemplates(resolve('src'))
    .filter((path) => !path.endsWith('curation/index.njk'))
    .filter((path) => readFileSync(path, 'utf8').includes("'/curation/'"))
    .map((path) => path.replace(`${resolve('.')}/`, ''));
  assert.deepEqual(linkers, [], '/curation/ is reached by bookmark, not by a site link');
});

// The manifest is the source of truth for BOTH the page and the copy step. A report
// hand-written into the template would link a file nothing copies.
test('the page renders the manifest rather than hand-listing reports', () => {
  assert.match(page, /curationReports/);
  for (const report of curationReports) {
    assert.ok(
      !page.includes(report.title),
      `${report.id}'s title is hardcoded in the template; it should come from the manifest`,
    );
  }
});

test('both audience sections are rendered, curator-facing first', () => {
  const curator = page.indexOf('"curation"');
  const engineering = page.indexOf('"engineering"');
  assert.ok(curator !== -1 && engineering !== -1, 'both audience filters must be present');
  assert.ok(curator < engineering, 'the curator section comes first');
});

test('report links carry the pathPrefix filter', () => {
  // These files are copied into _site after Vite runs, so they are ordinary static
  // assets and need `| url` — the GitHub Pages staging build serves them under
  // /pnwmoths/. See docs/lessons-learned.md.
  assert.match(partial, /href="\{\{ file\.href \| url \}\}"/);
});
