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
import { buildCategoryMap, PnwmIdentify } from './pnwm-identify.ts';
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
    assert.equal(forew[0].id, 1);
    assert.equal(forew[1].id, 2);
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
    { id: 0, category: 'Color', subcategory: null, question: 'Wing color', state: 'Brown', image_filename: null },
    { id: 1, category: 'Color', subcategory: null, question: 'Wing color', state: 'White', image_filename: null },
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
