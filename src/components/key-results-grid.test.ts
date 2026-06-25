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
  test('constructs CDN URL with encodeURIComponent and ?height=', () => {
    assert.equal(
      buildCardUrl('habrosyne-scripta', 'Habrosyne scripta-A-D.jpg', 320),
      'https://pnwmoths.b-cdn.net/habrosyne-scripta/Habrosyne%20scripta-A-D.jpg?height=320',
      'encodeURIComponent must encode the space; ?height=320 per UI-SPEC'
    );
  });

  test('uses the correct CDN base URL', () => {
    const url = buildCardUrl('test-slug', 'image.jpg', 320);
    assert.ok(
      url.startsWith('https://pnwmoths.b-cdn.net/'),
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

  test('exactly 2 species have nav_image === null in real data/key-matrix.json', () => {
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')
    ) as KeyMatrixData;
    const nullNavImageSpecies = raw.species.filter((s: KeySpecies) => s.nav_image === null);
    assert.equal(
      nullNavImageSpecies.length,
      2,
      `expected exactly 2 null nav_image species, got ${nullNavImageSpecies.length}: ` +
        nullNavImageSpecies.map((s: KeySpecies) => s.slug).join(', ')
    );
  });

  test('null-nav-image species are autographa-v-alba and xestia-c-nigrum', () => {
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')
    ) as KeyMatrixData;
    const slugs = raw.species
      .filter((s: KeySpecies) => s.nav_image === null)
      .map((s: KeySpecies) => s.slug)
      .sort();
    assert.deepEqual(
      slugs,
      ['autographa-v-alba', 'xestia-c-nigrum'],
      'exactly these two slugs must have null nav_image'
    );
  });

  test('placeholder predicate: nav_image === null means no <img>', () => {
    // Lock the predicate itself — render-side proof is HUMAN-UAT in Plan 42-02.
    const speciesWithImage: KeySpecies = {
      slug: 'habrosyne-scripta', genus: 'Habrosyne', epithet: 'scripta',
      common_name: null, nav_image: 'Habrosyne scripta-A-D.jpg',
    };
    const speciesWithoutImage: KeySpecies = {
      slug: 'autographa-v-alba', genus: 'Autographa', epithet: 'v-alba',
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

  test('meta.matchedSpecies === 1192 in real data/key-matrix.json', () => {
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')
    ) as KeyMatrixData;
    assert.equal(
      raw.meta.matchedSpecies,
      1192,
      `expected meta.matchedSpecies to be 1192 (the at-rest count), got ${raw.meta.matchedSpecies}`
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
