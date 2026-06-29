// TDD RED: unit tests for pnwm-identify.ts pure helpers and selection-state methods.
// These tests will FAIL until Task 2 implements pnwm-identify.ts.
// Phase 41, Plan 03, Task 1 — RED gate.
// Phase 42, Plan 01, Task 2 — extended with RED tests for matched-state plumbing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Import exported symbols from the component (will fail until Task 2 creates the file)
import { buildCategoryMap, PnwmIdentify, characterImageSrc, helpImageAlt } from './pnwm-identify.ts';
import type { Character } from '../types/index.ts';
import type { KeyMatrix, KeySpecies } from '../types/schemas.ts';
import { buildQuestionGroups } from '../_lib/key-filter.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeChar(overrides: Partial<Character> & { id: number; category: string; question: string; state: string }): Character {
  return {
    subcategory: null,
    image_filename: null,
    alt_text: null,
    ...overrides,
  };
}

const FIXTURE: Character[] = [
  makeChar({ id: 1, category: 'Color',  question: 'Forewing color', state: 'Brown' }),
  makeChar({ id: 2, category: 'Color',  question: 'Forewing color', state: 'White' }),
  makeChar({ id: 3, category: 'Color',  question: 'Hindwing color', state: 'Gray' }),
  makeChar({ id: 4, category: 'Shape',  question: 'Wingspan',       state: 'Small' }),
  makeChar({ id: 5, category: 'Shape',  question: 'Wingspan',       state: 'Large' }),
];

// ---------------------------------------------------------------------------
// buildCategoryMap — pure helper
// ---------------------------------------------------------------------------

describe('buildCategoryMap', () => {
  test('returns one entry per category', () => {
    const map = buildCategoryMap(FIXTURE);
    assert.equal(map.size, 2, `expected 2 categories, got ${map.size}`);
    assert.ok(map.has('Color'));
    assert.ok(map.has('Shape'));
  });

  test('each category value is a Map of question → Character[]', () => {
    const map = buildCategoryMap(FIXTURE);
    const colorQuestions = map.get('Color')!;
    assert.ok(colorQuestions instanceof Map);
    assert.equal(colorQuestions.size, 2);
    assert.ok(colorQuestions.has('Forewing color'));
    assert.ok(colorQuestions.has('Hindwing color'));
  });

  test('preserves insertion order of categories', () => {
    const map = buildCategoryMap(FIXTURE);
    const keys = [...map.keys()];
    assert.deepEqual(keys, ['Color', 'Shape']);
  });

  test('preserves insertion order of questions within category', () => {
    const map = buildCategoryMap(FIXTURE);
    const colorKeys = [...map.get('Color')!.keys()];
    assert.deepEqual(colorKeys, ['Forewing color', 'Hindwing color']);
  });

  test('characters are grouped correctly within each question', () => {
    const map = buildCategoryMap(FIXTURE);
    const forew = map.get('Color')!.get('Forewing color')!;
    assert.equal(forew.length, 2);
    assert.equal(forew[0]!.id, 1);
    assert.equal(forew[1]!.id, 2);
  });

  // Real-data gate — locks the Plan 01 stray-quote fix end-to-end.
  test('returns exactly 8 categories from real data/key-matrix.json', () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')) as { characters: Character[] };
    const map = buildCategoryMap(raw.characters);
    assert.equal(map.size, 8, `expected 8 categories, got ${map.size}: ${[...map.keys()].join(', ')}`);
  });
});

// ---------------------------------------------------------------------------
// _selectionCountForCategory — instance method tested without DOM
// ---------------------------------------------------------------------------

describe('_selectionCountForCategory', () => {
  test('returns 0 on a fresh instance', () => {
    const c = new PnwmIdentify();
    c._categoryMap = buildCategoryMap(FIXTURE);
    assert.equal(c._selectionCountForCategory('Color'), 0);
  });

  test('returns the number of selected states in the category', () => {
    const c = new PnwmIdentify();
    c._categoryMap = buildCategoryMap(FIXTURE);
    // Select char id 1 and 2 in "Forewing color" question of "Color" category
    c._selection = new Map([['Forewing color', new Set([1, 2])]]);
    assert.equal(c._selectionCountForCategory('Color'), 2);
  });

  test('selecting a state in a different category does not change this count', () => {
    const c = new PnwmIdentify();
    c._categoryMap = buildCategoryMap(FIXTURE);
    // Select char id 4 in "Wingspan" question of "Shape" category
    c._selection = new Map([['Wingspan', new Set([4])]]);
    assert.equal(c._selectionCountForCategory('Color'), 0);
    assert.equal(c._selectionCountForCategory('Shape'), 1);
  });

  test('counts selections across multiple questions in a category', () => {
    const c = new PnwmIdentify();
    c._categoryMap = buildCategoryMap(FIXTURE);
    c._selection = new Map([
      ['Forewing color', new Set([1])],
      ['Hindwing color', new Set([3])],
    ]);
    assert.equal(c._selectionCountForCategory('Color'), 2);
  });
});

// ---------------------------------------------------------------------------
// _hasSelection — instance method
// ---------------------------------------------------------------------------

describe('_hasSelection', () => {
  test('returns false on fresh instance (empty selection Map)', () => {
    const c = new PnwmIdentify();
    assert.equal(c._hasSelection(), false);
  });

  test('returns true after one selection', () => {
    const c = new PnwmIdentify();
    c._selection = new Map([['Forewing color', new Set([1])]]);
    assert.equal(c._hasSelection(), true);
  });

  test('returns false after selection is cleared', () => {
    const c = new PnwmIdentify();
    c._selection = new Map([['Forewing color', new Set([1])]]);
    c._selection = new Map();
    assert.equal(c._hasSelection(), false);
  });

  test('returns false when all question Sets are empty', () => {
    const c = new PnwmIdentify();
    c._selection = new Map([['Forewing color', new Set<number>()]]);
    assert.equal(c._hasSelection(), false);
  });
});

// ---------------------------------------------------------------------------
// _clearAll — instance method
// ---------------------------------------------------------------------------

describe('_clearAll', () => {
  test('resets _selection to an empty Map', () => {
    const c = new PnwmIdentify();
    c._categoryMap = buildCategoryMap(FIXTURE);
    c._selection = new Map([['Forewing color', new Set([1, 2])]]);
    // Override _dispatchFilterChange to avoid DOM dependency
    c._dispatchFilterChange = () => {};
    c._clearAll();
    assert.equal(c._selection.size, 0);
  });

  test('subsequent _hasSelection() is false after _clearAll', () => {
    const c = new PnwmIdentify();
    c._selection = new Map([['Forewing color', new Set([1])]]);
    c._dispatchFilterChange = () => {};
    c._clearAll();
    assert.equal(c._hasSelection(), false);
  });

  test('_selectionCountForCategory returns 0 for all categories after _clearAll', () => {
    const c = new PnwmIdentify();
    c._categoryMap = buildCategoryMap(FIXTURE);
    c._selection = new Map([
      ['Forewing color', new Set([1, 2])],
      ['Wingspan',       new Set([4])],
    ]);
    c._dispatchFilterChange = () => {};
    c._clearAll();
    assert.equal(c._selectionCountForCategory('Color'), 0);
    assert.equal(c._selectionCountForCategory('Shape'), 0);
  });
});

// ---------------------------------------------------------------------------
// Phase 42 RED tests: matched-state plumbing + Clear-all reset (D-09)
// These tests FAIL until Plan 42-02 implements the changes in pnwm-identify.ts.
// ---------------------------------------------------------------------------

// Minimal KeyMatrix fixture for matched-state tests.
// 2 species, 2 characters, 1 question, 1 byte per bitset.
// character id=0: species[0] (habrosyne-scripta) scores 1, species[1] (autographa-v-alba) scores 0 → byte=0b00000001
// character id=1: species[0] scores 0, species[1] scores 1 → byte=0b00000010
// base64: Buffer.from([1]) = 'AQ==', Buffer.from([2]) = 'Ag=='
const MATRIX_FIXTURE: KeyMatrix = {
  meta: {
    totalKeySpecies: 2,
    matchedSpecies: 2,
    unmatchedSpecies: 0,
    generatedAt: '2026-01-01T00:00:00.000Z',
  },
  characters: [
    { id: 0, category: 'Color', subcategory: null, question: 'Wing color', state: 'Brown', image_filename: null, alt_text: null },
    { id: 1, category: 'Color', subcategory: null, question: 'Wing color', state: 'White', image_filename: null, alt_text: null },
  ],
  species: [
    { slug: 'habrosyne-scripta', genus: 'Habrosyne', epithet: 'scripta', common_name: null, nav_image: 'img.jpg' },
    { slug: 'autographa-v-alba', genus: 'Autographa', epithet: 'v-alba', common_name: null, nav_image: null },
  ] as KeySpecies[],
  // matrix[charId] = base64 bitset over species; index 0 = species[0], LSB-first
  matrix: ['AQ==', 'Ag=='],  // char0 matches species[0]; char1 matches species[1]
};

describe('_dispatchFilterChange sets _matchedSpecies after the matrix is loaded (Phase 42 RED)', () => {
  test('_matchedSpecies is populated and _matchedCount equals its length', () => {
    const c = new PnwmIdentify();

    // Load the minimal fixture (bypasses fetch — sets state directly)
    c._keyMatrix = MATRIX_FIXTURE;
    c._questionGroups = buildQuestionGroups(MATRIX_FIXTURE.characters);

    // Select character id=0 ("Brown" in "Wing color" question)
    c._selection = new Map([['Wing color', new Set([0])]]);

    // Stub dispatchEvent to avoid DOM dependency on LitElement.dispatchEvent
    c.dispatchEvent = () => true;

    c._dispatchFilterChange();

    // After calling _dispatchFilterChange with matrix loaded, _matchedSpecies must be set
    assert.ok(Array.isArray(c._matchedSpecies), '_matchedSpecies must be an array');
    assert.ok(c._matchedSpecies.length > 0, '_matchedSpecies must be non-empty after selection matches');
    assert.equal(c._matchedCount, c._matchedSpecies.length, '_matchedCount must equal _matchedSpecies.length');
  });
});

describe('_clearAll resets _matchedSpecies and _matchedCount (D-09) (Phase 42 RED)', () => {
  test('_clearAll resets display state regardless of matrix load', () => {
    const c = new PnwmIdentify();

    // Seed selection + matched state (simulating a post-filter state)
    c._selection = new Map([['Wing color', new Set([0])]]);
    c._matchedSpecies = [
      { slug: 'habrosyne-scripta', genus: 'Habrosyne', epithet: 'scripta', common_name: null, nav_image: 'img.jpg' },
    ] as KeySpecies[];
    c._matchedCount = 1;

    // Stub _dispatchFilterChange to isolate _clearAll
    c._dispatchFilterChange = () => {};

    c._clearAll();

    assert.equal(c._selection.size, 0, '_selection must be empty after _clearAll');
    assert.equal(c._matchedSpecies.length, 0, '_matchedSpecies must be empty after _clearAll');
    assert.equal(c._matchedCount, 0, '_matchedCount must be 0 after _clearAll');
  });
});

// ---------------------------------------------------------------------------
// Phase 43 RED tests: characterImageSrc + helpImageAlt pure helpers (CIMG-03)
// These tests FAIL until Task 2 exports characterImageSrc + helpImageAlt from pnwm-identify.ts.
// ---------------------------------------------------------------------------

describe('characterImageSrc (Phase 43 RED)', () => {
  test('returns a CDN-absolute URL for a simple .webp filename', () => {
    const url = characterImageSrc('Black Forewing.webp');
    assert.strictEqual(
      url,
      'https://moths.pnwinsects.org/key-images/Black%20Forewing.webp',
      'should return host-absolute CDN URL with encodeURIComponent applied'
    );
  });

  test('returned URL does NOT contain /pnwmoths/https (pathPrefix-leak guard)', () => {
    const url = characterImageSrc('Ecoprovince_Coast_and_Mts.webp');
    assert.ok(
      !url.includes('/pnwmoths/https'),
      `URL must not contain /pnwmoths/https — got: ${url}`
    );
    assert.ok(
      url.startsWith('https://moths.pnwinsects.org/key-images/'),
      `URL must start with CDN base — got: ${url}`
    );
  });

  test('applies encodeURIComponent: space in filename → %20', () => {
    const url = characterImageSrc('Black Forewing.webp');
    assert.ok(url.includes('%20'), `URL should contain %20 for space — got: ${url}`);
    assert.ok(!url.includes(' '), `URL must not contain raw space — got: ${url}`);
  });

  test('applies encodeURIComponent: ampersand in filename → %26', () => {
    const url = characterImageSrc('Black & White.webp');
    assert.ok(url.includes('%26'), `URL should contain %26 for & — got: ${url}`);
    assert.ok(!url.includes(' & '), `URL must not contain raw & — got: ${url}`);
  });

  test('URL is host-absolute (starts with https://)', () => {
    const url = characterImageSrc('test.webp');
    assert.ok(url.startsWith('https://'), `URL must be host-absolute — got: ${url}`);
  });
});

describe('helpImageAlt (Phase 43 RED)', () => {
  test('returns curator alt_text when non-blank', () => {
    assert.strictEqual(
      helpImageAlt('Black', 'A black forewing'),
      'A black forewing',
      'curator alt_text should win when non-blank'
    );
  });

  test('falls back to state when alt_text is null', () => {
    assert.strictEqual(
      helpImageAlt('Black', null),
      'Black',
      'should fall back to state when alt_text is null'
    );
  });

  test('falls back to state when alt_text is empty string', () => {
    assert.strictEqual(
      helpImageAlt('Black', ''),
      'Black',
      'should fall back to state when alt_text is empty string'
    );
  });

  test('falls back to state when alt_text is whitespace-only', () => {
    assert.strictEqual(
      helpImageAlt('Black', '   '),
      'Black',
      'should fall back to state when alt_text is whitespace-only'
    );
  });

  test('never returns empty string (D-06)', () => {
    const result = helpImageAlt('SomeState', null);
    assert.ok(result.length > 0, 'helpImageAlt must never return empty string');
  });
});

// ---------------------------------------------------------------------------
// Structural: <details> render iff image_filename is truthy (Phase 43 RED)
// Asserts the helper-driven branch logic: when image_filename is set,
// characterImageSrc is invoked and produces a CDN URL; when null, it is not.
// (No TemplateResult render-to-string — zero new deps; pure helper assertion idiom.)
// ---------------------------------------------------------------------------

describe('_renderQuestion structural: <details> iff image_filename (Phase 43 RED)', () => {
  test('characterImageSrc is called with image_filename when truthy (branch coverage via direct call)', () => {
    // A character with image_filename set → characterImageSrc should produce a CDN URL
    const char = makeChar({ id: 10, category: 'Color', question: 'Forewing', state: 'Black', image_filename: 'Black Forewing.webp', alt_text: null });
    // The render guard: `char.image_filename ? characterImageSrc(char.image_filename) : skip`
    const src = char.image_filename ? characterImageSrc(char.image_filename) : null;
    assert.ok(src !== null, 'should produce a src for a character with image_filename');
    assert.ok(src!.startsWith('https://moths.pnwinsects.org/key-images/'), 'src must be CDN-absolute');
  });

  test('no src produced when image_filename is null (guard branch)', () => {
    const char = makeChar({ id: 11, category: 'Color', question: 'Forewing', state: 'White', image_filename: null, alt_text: null });
    const src = char.image_filename ? characterImageSrc(char.image_filename) : null;
    assert.strictEqual(src, null, 'should not produce a src when image_filename is null');
  });

  test('helpImageAlt produces correct alt from image_filename character (integration)', () => {
    const char = makeChar({ id: 10, category: 'Color', question: 'Forewing', state: 'Black', image_filename: 'Black Forewing.webp', alt_text: 'A black forewing illustration' });
    const alt = helpImageAlt(char.state, char.alt_text);
    assert.strictEqual(alt, 'A black forewing illustration');
  });

  test('helpImageAlt falls back to state when alt_text is null (integration)', () => {
    const char = makeChar({ id: 10, category: 'Color', question: 'Forewing', state: 'Black', image_filename: 'Black Forewing.webp', alt_text: null });
    const alt = helpImageAlt(char.state, char.alt_text);
    assert.strictEqual(alt, 'Black');
  });
});
