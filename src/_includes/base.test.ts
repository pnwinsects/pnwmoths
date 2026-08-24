// src/_includes/base.test.ts
// Regression guards for the sharing metadata emitted by the shared layout (issue #198).
//
// The load-bearing invariant is that every URL in these tags is ABSOLUTE. Crawlers
// require it, and it is also what keeps eleventy-plugin-vite's HTML asset scanner
// off them: Vite sweeps every <link href> regardless of `rel`, plus the `content`
// of <meta property="og:image">, and tries to fs.readFile the target as a local
// asset. A root-relative canonical pointing at a directory-style URL throws EISDIR
// at build time — the failure src/species-redirect.njk documents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const layout = readFileSync(resolve('src/_includes/base.njk'), 'utf8');
const speciesTemplate = readFileSync(resolve('src/species/species.njk'), 'utf8');
const plateTemplate = readFileSync(resolve('src/plates/plate.njk'), 'utf8');
const config = readFileSync(resolve('eleventy.config.ts'), 'utf8');

/** The `content`/`href` expression of a tag in the layout, by attribute selector. */
function attrValue(pattern: RegExp): string {
  const match = layout.match(pattern);
  assert.ok(match, `base.njk must contain a tag matching ${pattern}`);
  return match[1] as string;
}

test('base.njk: emits a meta description', () => {
  assert.match(layout, /<meta name="description" content="\{\{ pageDescription \}\}">/);
});

test('base.njk: falls back to the site description when a page sets none', () => {
  assert.match(layout, /set pageDescription = description or siteDescription/);
});

test('base.njk: emits the Open Graph tags link previews actually read', () => {
  for (const property of [
    'og:site_name',
    'og:type',
    'og:title',
    'og:description',
    'og:url',
    'og:image',
    'og:image:alt',
  ]) {
    assert.ok(
      layout.includes(`<meta property="${property}" content="`),
      `base.njk must emit an ${property} tag`,
    );
  }
});

test('base.njk: declares a large summary card for Twitter/X', () => {
  assert.match(layout, /<meta name="twitter:card" content="summary_large_image">/);
});

test('base.njk: emits a canonical link', () => {
  assert.match(layout, /<link rel="canonical" href="\{\{ pageUrl \}\}">/);
});

test('base.njk: canonical and og:url are absolute — `page.url | url | absoluteUrl` (EISDIR guard)', () => {
  const pageUrl = layout.match(/set pageUrl = ([^-]*?)\s*-%\}/);
  assert.ok(pageUrl, 'base.njk must derive pageUrl');
  assert.match(
    pageUrl[1] as string,
    /page\.url\s*\|\s*url\s*\|\s*absoluteUrl/,
    'pageUrl must apply `url` (pathPrefix) then `absoluteUrl` (origin); a root-relative ' +
      'canonical is both wrong for crawlers and an EISDIR failure in the Vite build',
  );
  assert.equal(attrValue(/<link rel="canonical" href="([^"]*)">/), '{{ pageUrl }}');
  assert.equal(attrValue(/<meta property="og:url" content="([^"]*)">/), '{{ pageUrl }}');
});

test('base.njk: the default share card URL is absolute', () => {
  const fallback = layout.match(/set pageSocialImage = "\/images\/social-card\.png"([^-]*?)-%\}/);
  assert.ok(fallback, 'base.njk must fall back to /images/social-card.png');
  assert.match(
    fallback[1] as string,
    /\|\s*url\s*\|\s*absoluteUrl/,
    'the default card must go through `url | absoluteUrl` — og:image cannot be root-relative',
  );
});

test('base.njk: og:image alt text tracks the image, not the page', () => {
  // A species with no photos on file emits an empty `socialImage` and gets the site
  // card; describing that card as "Specimen photograph of <species>" would be a lie.
  const branch = layout.match(/\{%-\s*if socialImage\s*-%\}([\s\S]*?)\{%-\s*endif\s*-%\}/);
  assert.ok(branch, 'base.njk must branch on whether the page supplied a social image');
  const [withImage, withoutImage] = (branch[1] as string).split(/\{%-\s*else\s*-%\}/);
  assert.match(withImage as string, /pageSocialImageAlt = socialImageAlt or siteImageAlt/);
  assert.match(
    withoutImage as string,
    /pageSocialImageAlt = siteImageAlt/,
    'the fallback branch must use the site card alt text, never the page-supplied one',
  );
});

test('eleventy.config.ts: SITE_ORIGIN switches on GITHUB_PAGES, like pathPrefix', () => {
  assert.match(
    config,
    /const SITE_ORIGIN = process\.env\.GITHUB_PAGES/,
    'SITE_ORIGIN must be conditional on GITHUB_PAGES so staging never advertises production URLs',
  );
  assert.match(config, /"https:\/\/pnwinsects\.github\.io"/);
  assert.match(config, /"https:\/\/moths\.pnwinsects\.org"/);
});

test('eleventy.config.ts: registers the filters the layout and templates depend on', () => {
  for (const filter of [
    'absoluteUrl',
    'speciesDescription',
    'speciesSocialImage',
    'speciesSocialImageAlt',
  ]) {
    assert.ok(
      config.includes(`addFilter("${filter}"`),
      `eleventy.config.ts must register the ${filter} filter`,
    );
  }
  for (const data of ['siteName', 'siteDescription', 'siteImageAlt']) {
    assert.ok(
      config.includes(`addGlobalData("${data}"`),
      `eleventy.config.ts must expose ${data} to the layout`,
    );
  }
});

test('species.njk: derives its description and share image from the species row', () => {
  assert.match(speciesTemplate, /description:\s*"\{\{ sp \| speciesDescription \| safe \}\}"/);
  assert.match(
    speciesTemplate,
    /socialImage:\s*"\{\{ sp\.slug \| speciesSocialImage\(speciesPhotos\[sp\.slug\], images\[sp\.slug\]\) \| safe \}\}"/,
  );
  assert.match(speciesTemplate, /socialImageAlt:\s*"\{\{ sp \| speciesSocialImageAlt \| safe \}\}"/);
});

test('species.njk: computed sharing values carry `safe` so base.njk escapes them once', () => {
  // Same reason as the title (issue #85): factsheet prose contains quotes and
  // ampersands, and double-escaping would put &amp;quot; in the meta content.
  const frontMatter = speciesTemplate.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(frontMatter);
  for (const line of (frontMatter[1] as string).split('\n')) {
    if (!/^\s+(description|socialImage|socialImageAlt|title):/.test(line)) continue;
    assert.match(line, /\|\s*safe\s*\}\}/, `computed value must end in \`| safe\`: ${line.trim()}`);
  }
});

test('plate.njk: shares the plate thumbnail already published to the CDN', () => {
  assert.match(
    plateTemplate,
    /socialImage:\s*"\{\{ cdnBaseUrl \}\}\/plates\/\{\{ plate\.slug \}\}\/thumbnail\.jpg"/,
  );
  assert.match(plateTemplate, /^\s+description:\s*"\{\{ plate\.title/m);
});

/** Every page template that renders through base.njk, found by walking src/. */
function pageTemplates(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      // _includes holds layouts, content/ holds prose partials rendered into pages.
      if (entry === '_includes' || entry === 'content') continue;
      pageTemplates(path, found);
    } else if (/\.(njk|md)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

test('every page rendered through base.njk supplies its own description', () => {
  const missing = pageTemplates(resolve('src'))
    .filter((path) => {
      const source = readFileSync(path, 'utf8');
      return source.includes('layout: base.njk') && !/^\s*description:/m.test(source);
    })
    .map((path) => path.replace(`${resolve('.')}/`, ''));
  assert.deepEqual(
    missing,
    [],
    'these pages would fall back to the generic site description — give each one a ' +
      '`description:` in its front matter (issue #198)',
  );
});

// --- robots directive (issue #332) -----------------------------------------
// An absent robots meta already means "index, follow", so the tag must stay opt-in:
// emitting `content=""` or a hardcoded default on every page would be a site-wide
// crawler directive introduced by accident.

test('base.njk: emits a robots meta only for pages that ask for one', () => {
  assert.match(layout, /\{%-? if robots %\}/);
  assert.match(layout, /<meta name="robots" content="\{\{ robots \}\}">/);
});

test('base.njk: only the unlinked internal pages set robots', () => {
  const setters = pageTemplates(resolve('src'))
    .filter((path) => /^\s*robots:/m.test(readFileSync(path, 'utf8')))
    .map((path) => path.replace(`${resolve('.')}/`, ''));
  assert.deepEqual(
    setters,
    ['src/curation/index.njk'],
    'a page started setting `robots:` — that is a crawler directive, so it needs a reason',
  );
});
