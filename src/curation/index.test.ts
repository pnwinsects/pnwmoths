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
import nunjucks from 'nunjucks';
import { curationReports, groupByAudience } from '../_data/curationReports.ts';

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

// --- rendered output -------------------------------------------------------
// These render the real template with the real manifest. Asserting on template
// SOURCE could not catch the bug that made them necessary: Nunjucks' selectattr
// accepts a test name and arguments and then ignores them, so both sections
// silently listed every report. The template looked exactly right.

/** The page body, rendered with the real manifest (layout and front matter aside). */
function render(): string {
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(resolve('src/_includes')));
  env.addFilter('url', (value: string) => value);
  const body = page.replace(/^---\n[\s\S]*?\n---\n/, '');
  return env.renderString(body, {
    curationReports: groupByAudience(),
    repoUrl: 'https://github.com/pnwinsects/pnwmoths',
  });
}

/** Section ids in document order, split at the "Data quality" heading. */
function renderedSections(): { curation: string[]; engineering: string[] } {
  const html = render();
  const split = html.indexOf('id="data-quality"');
  assert.ok(split !== -1, 'the page must have a data-quality heading');
  const ids = (part: string): string[] =>
    [...part.matchAll(/class="curation-report" id="([^"]+)"/g)].map((m) => m[1] as string);
  return { curation: ids(html.slice(0, split)), engineering: ids(html.slice(split)) };
}

test('each report is rendered exactly once, in its own section', () => {
  const rendered = renderedSections();
  assert.deepEqual(rendered.curation, groupByAudience().curation.map((r) => r.id));
  assert.deepEqual(rendered.engineering, groupByAudience().engineering.map((r) => r.id));
});

test('every report in the manifest reaches the page', () => {
  const rendered = renderedSections();
  assert.deepEqual(
    [...rendered.curation, ...rendered.engineering].sort(),
    curationReports.map((r) => r.id).sort(),
  );
});

test('a report appears in one section only', () => {
  const rendered = renderedSections();
  const both = rendered.curation.filter((id) => rendered.engineering.includes(id));
  assert.deepEqual(both, [], 'these reports were rendered in both sections');
});

test('the rendered page links every file the manifest names', () => {
  const html = render();
  for (const report of curationReports) {
    for (const file of report.files) {
      assert.ok(html.includes(`href="${file.href}"`), `${report.id} does not link ${file.href}`);
    }
  }
});

test('report links carry the pathPrefix filter', () => {
  // These files are copied into _site after Vite runs, so they are ordinary static
  // assets and need `| url` — the GitHub Pages staging build serves them under
  // /pnwmoths/. See docs/lessons-learned.md.
  assert.match(partial, /href="\{\{ file\.href \| url \}\}"/);
});

test('off-site destinations are linked raw, without pathPrefix or download', () => {
  // `| url` on an absolute URL would prepend /pnwmoths/ to it on the staging build,
  // and `download` on a cross-origin link is ignored by every browser anyway.
  assert.match(partial, /\{% if file\.external %\}<a href="\{\{ file\.href \}\}">/);
});

test('every off-site destination is an absolute URL', () => {
  for (const report of curationReports) {
    for (const file of report.files) {
      if (!file.external) continue;
      assert.match(file.href, /^https:\/\//, `${report.id} marks a non-absolute href external`);
      assert.equal(file.source, null, `${report.id}: an external destination is not a file to copy`);
    }
  }
});
