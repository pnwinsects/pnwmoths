// TDD RED: unit tests for pnwm-identify.ts pure helpers and selection-state methods.
// These tests will FAIL until Task 2 implements pnwm-identify.ts.
// Phase 41, Plan 03, Task 1 — RED gate.
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
