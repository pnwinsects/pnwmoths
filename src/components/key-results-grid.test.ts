// Unit tests for key-results-grid.ts pure helpers — Wave 0 RED scaffold.
// Locks GRID-01..04 testable contracts (count text, CDN URL, placeholder condition, empty-state).
// Plan 42-01, Task 1.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

import { buildCardUrl, buildCountText, KeyResultsGrid } from './key-results-grid.ts';
import type { KeySpecies } from '../types/schemas.ts';

// ---------------------------------------------------------------------------
// GRID-02: CDN URL construction (buildCardUrl)
// ---------------------------------------------------------------------------

describe('buildCardUrl', () => {
  test('constructs a pre-generated derivative URL, not an optimizer query', () => {
    assert.equal(
      buildCardUrl('habrosyne-scripta', 'Habrosyne scripta-A-D.jpg', 320),
      'https://moths.pnwinsects.org/derived/habrosyne-scripta/Habrosyne%20scripta-A-D%40320h.webp',
      'the space must be encoded; the 320px slot now maps to the shared @320h variant (ADR 0022)'
    );
  });

  test('emits no optimizer query string', () => {
    assert.equal(buildCardUrl('s', 'i.jpg', 320).includes('?'), false);
  });

  test('uses the correct CDN base URL', () => {
    const url = buildCardUrl('test-slug', 'image.jpg', 320);
    assert.ok(
      url.startsWith('https://moths.pnwinsects.org/'),
      `expected URL to start with CDN base, got: ${url}`
    );
  });

  test('preserves slug in URL path', () => {
    const url = buildCardUrl('habrosyne-scripta', 'image.jpg', 320);
    assert.ok(url.includes('/habrosyne-scripta/'), `slug not found in URL: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// GRID-01: Count text (buildCountText)
// ---------------------------------------------------------------------------

describe('buildCountText', () => {
  test('at-rest (no selection): renders comma-formatted total', () => {
    assert.equal(
      buildCountText(false, 0, 1192),
      'Showing all 1,192 species',
      'comma-formatted total required — "1,192" not "1192"'
    );
  });

  test('filtering with 47 matches', () => {
    assert.equal(
      buildCountText(true, 47, 1192),
      '47 species match'
    );
  });

  test('zero-match state (GRID-04 count line)', () => {
    assert.equal(
      buildCountText(true, 0, 1192),
      '0 species match',
      'zero-match count line per UI-SPEC State 3'
    );
  });

  test('4-digit match count is also comma-formatted', () => {
    assert.equal(
      buildCountText(true, 1190, 1192),
      '1,190 species match',
      'comma form must apply to 4-digit match counts too'
    );
  });
});

// ---------------------------------------------------------------------------
// GRID-03: Placeholder condition (nav_image === null)
// Real-data gate — locks the null-nav-image set against data drift
// ---------------------------------------------------------------------------

describe('GRID-03 placeholder condition (real-data gate)', () => {
  interface KeyMatrixData {
    meta: { matchedSpecies: number };
    species: KeySpecies[];
  }

  test('no key species has nav_image === null in real data/key-matrix.json', () => {
    // Drift gate: every matched key species must resolve to a catalogued nav image.
    // Until #71 the two hyphenated species (autographa-v-alba, xestia-c-nigrum) were
    // the sole exceptions — their photos were mis-keyed to the hyphen-truncated slugs
    // (autographa-v, xestia-c), so build:key found no image for the full slug and
    // emitted nav_image: null. #71 consolidated the data onto the full slugs, so the
    // null set is now empty. A regression here means an image row lost its slug key.
    //
    // #156 added one deliberate exception, `clostera-brucei`: its only catalogued
    // photos (A/B specimens) were misidentified and were reassigned to
    // clostera-multnoma, leaving it with no CDN-backed image. That exception was
    // written to be removed "once the C specimens are ingested", and they since
    // were — data/images.csv now carries `Clostera brucei-C-D.jpg` (dorsal,
    // weight 1) and its `@320h` derivative resolves on the CDN. So the set is
    // empty again and this is a plain invariant, not an allow-list.
    //
    // The exception outlived its cause for months because data/key-matrix.json
    // was never regenerated after #156's data change, so this test was reading a
    // stale artifact that still said null (#197). scripts/build-key.test.ts now
    // asserts the committed artifact matches a fresh build, which is what stops
    // that from recurring — without it, an exception list here can quietly
    // describe a file nobody has rebuilt.
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')
    ) as KeyMatrixData;
    const nullNavImageSpecies = raw.species.filter((s: KeySpecies) => s.nav_image === null);
    assert.deepEqual(
      nullNavImageSpecies.map((s: KeySpecies) => s.slug),
      [],
      'every matched key species must resolve to a catalogued nav image; a slug listed ' +
        'here lost its image rows in data/images.csv, or gained a key entry before its ' +
        'photos were catalogued',
    );
  });

  test('placeholder predicate: nav_image === null means no <img>', () => {
    // Lock the predicate itself — render-side proof is HUMAN-UAT in Plan 42-02.
    // Synthetic fixtures only: clostera-brucei is the sole real species with a null
    // nav_image right now (see above), a temporary state pending curator photo ingest.
    const speciesWithImage: KeySpecies = {
      slug: 'habrosyne-scripta', genus: 'Habrosyne', epithet: 'scripta',
      common_name: null, nav_image: 'Habrosyne scripta-A-D.jpg',
    };
    const speciesWithoutImage: KeySpecies = {
      slug: 'synthetic-no-image', genus: 'Synthetica', epithet: 'imageless',
      common_name: null, nav_image: null,
    };
    assert.equal(speciesWithImage.nav_image === null, false, 'species with nav_image should NOT use placeholder');
    assert.equal(speciesWithoutImage.nav_image === null, true, 'species with null nav_image MUST use placeholder');
  });
});

// ---------------------------------------------------------------------------
// GRID-01 real-data gate — at-rest count string stays truthful
// ---------------------------------------------------------------------------

describe('GRID-01 real-data gate', () => {
  interface KeyMatrixData {
    meta: { matchedSpecies: number };
    species: KeySpecies[];
  }

  test('meta.matchedSpecies === 1191 in real data/key-matrix.json', () => {
    // Issue #84 deny-lists unpublished species, excluding formerly matched key species.
    // oedemasia-salicis was un-gated (Merrill's guidance: it's the canonical current
    // placement and should show its page/images); schizura-ipomaeae was newly gated
    // instead (the #84 CMS-exclusion actually belongs to it, not to oedemasia-salicis).
    // schizura-ipomaeae was not itself a matched key species, so the swap is a net +1.
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')
    ) as KeyMatrixData;
    assert.equal(
      raw.meta.matchedSpecies,
      1191,
      `expected meta.matchedSpecies to be 1191, got ${raw.meta.matchedSpecies}`
    );
  });
});

// ---------------------------------------------------------------------------
// GRID-04: Empty-state condition (pure boolean predicate)
// ---------------------------------------------------------------------------

describe('GRID-04 empty-state condition', () => {
  test('no selection → not empty state', () => {
    const hasSelection = false;
    const matchedSpecies: KeySpecies[] = [];
    // No selection = at-rest state (not empty state)
    assert.equal(hasSelection && matchedSpecies.length === 0, false);
  });

  test('selection with results → not empty state', () => {
    const hasSelection = true;
    const matchedSpecies: KeySpecies[] = [
      { slug: 'habrosyne-scripta', genus: 'Habrosyne', epithet: 'scripta', common_name: null, nav_image: 'img.jpg' },
    ];
    assert.equal(hasSelection && matchedSpecies.length === 0, false);
  });

  test('selection with zero results → empty state (GRID-04)', () => {
    const hasSelection = true;
    const matchedSpecies: KeySpecies[] = [];
    assert.equal(
      hasSelection && matchedSpecies.length === 0,
      true,
      'hasSelection && matchedSpecies.length === 0 must select the empty state'
    );
  });
});

// GRID-02 / pathPrefix wiring — regression guard for CR-01: pnwm-identify binds the
// camelCase JS property `.pathPrefix`, so the grid MUST expose `pathPrefix` (attribute
// 'path-prefix'), not a kebab-only property. A mismatch silently 404s every card link on
// GitHub Pages (dev prefix '/' masks it). See project memory: pathPrefix is a recurring hazard.
describe('pathPrefix wiring (CR-01 regression)', () => {
  test('_prefix reflects the pathPrefix property set via Lit .pathPrefix binding', () => {
    const grid = new KeyResultsGrid();
    grid.pathPrefix = '/pnwmoths/';
    assert.equal(grid._prefix, '/pnwmoths/');
  });

  test('_prefix defaults to "/" when pathPrefix is unset (local dev)', () => {
    const grid = new KeyResultsGrid();
    assert.equal(grid._prefix, '/');
  });

  test('card href is prefixed (no bare /species/ link on GitHub Pages)', () => {
    const grid = new KeyResultsGrid();
    grid.pathPrefix = '/pnwmoths/';
    // _renderCard builds href as `${this._prefix}species/${slug}/`
    const href = `${grid._prefix}species/habrosyne-scripta/`;
    assert.equal(href, '/pnwmoths/species/habrosyne-scripta/');
  });
});

// GRID-03 hardening — a non-null nav_image that fails to load (e.g. CDN 404 from bad
// nav_image data) must degrade to the gray placeholder, not a broken <img> (SC3).
describe('image load-failure fallback (GRID-03 hardening)', () => {
  test('_onImageError records the slug and triggers a re-render', () => {
    const grid = new KeyResultsGrid();
    assert.equal(grid._failedImages.has('sphinx-luscitiosa'), false);
    grid._onImageError('sphinx-luscitiosa');
    assert.equal(grid._failedImages.has('sphinx-luscitiosa'), true);
  });

  test('_onImageError is idempotent (no duplicate work on repeated errors)', () => {
    const grid = new KeyResultsGrid();
    grid._onImageError('x');
    grid._onImageError('x');
    assert.equal(grid._failedImages.size, 1);
  });
});
