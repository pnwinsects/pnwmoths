// Unit tests for the contingent-reveal logic (issue #97).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHARACTER_DEPENDENCIES,
  isQuestionVisible,
  pruneHiddenSelections,
} from './key-dependencies.ts';
import { buildQuestionGroups, type Selection } from './key-filter.ts';
import type { Character } from '../types/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Fixture: one parent question ("stigma?") gating one child ("very large?"),
// plus an unrelated independent question. Mirrors real question strings so the
// dependency table matches.
// ---------------------------------------------------------------------------

function makeChar(o: Partial<Character> & { id: number; category: string; question: string; state: string }): Character {
  return { subcategory: null, image_filename: null, alt_text: null, ...o };
}

const FIXTURE: Character[] = [
  makeChar({ id: 1, category: 'Forewing', question: 'Does the forewing have a stigma?', state: 'Yes' }),
  makeChar({ id: 2, category: 'Forewing', question: 'Does the forewing have a stigma?', state: 'No' }),
  makeChar({ id: 3, category: 'Forewing', question: 'Is the stigma very large?', state: 'Yes' }),
  makeChar({ id: 4, category: 'Forewing', question: 'Is the stigma very large?', state: 'No' }),
  makeChar({ id: 5, category: 'Forewing', question: 'Main color of forewing', state: 'Black' }),
];
const GROUPS = buildQuestionGroups(FIXTURE);

// ---------------------------------------------------------------------------
// isQuestionVisible
// ---------------------------------------------------------------------------

describe('isQuestionVisible', () => {
  test('non-dependent questions are always visible', () => {
    assert.equal(isQuestionVisible('Main color of forewing', new Map(), GROUPS), true);
    assert.equal(isQuestionVisible('Does the forewing have a stigma?', new Map(), GROUPS), true);
  });

  test('dependent child is hidden when nothing is selected', () => {
    assert.equal(isQuestionVisible('Is the stigma very large?', new Map(), GROUPS), false);
  });

  test('dependent child is hidden when the opposing (No) state is selected', () => {
    const sel: Selection = new Map([['Does the forewing have a stigma?', new Set([2])]]); // No
    assert.equal(isQuestionVisible('Is the stigma very large?', sel, GROUPS), false);
  });

  test('dependent child is visible when the trigger (Yes) state is selected', () => {
    const sel: Selection = new Map([['Does the forewing have a stigma?', new Set([1])]]); // Yes
    assert.equal(isQuestionVisible('Is the stigma very large?', sel, GROUPS), true);
  });

  test('trigger + opposing both selected still reveals (OR semantics)', () => {
    const sel: Selection = new Map([['Does the forewing have a stigma?', new Set([1, 2])]]);
    assert.equal(isQuestionVisible('Is the stigma very large?', sel, GROUPS), true);
  });
});

// ---------------------------------------------------------------------------
// pruneHiddenSelections
// ---------------------------------------------------------------------------

describe('pruneHiddenSelections', () => {
  test('keeps child selection while the parent trigger is set', () => {
    const sel: Selection = new Map([
      ['Does the forewing have a stigma?', new Set([1])], // Yes
      ['Is the stigma very large?', new Set([3])],
    ]);
    const pruned = pruneHiddenSelections(sel, GROUPS);
    assert.deepEqual([...(pruned.get('Is the stigma very large?') ?? [])], [3]);
  });

  test('drops child selection when the parent trigger is deselected', () => {
    // Parent went from Yes → No; the child selection is now orphaned.
    const sel: Selection = new Map([
      ['Does the forewing have a stigma?', new Set([2])], // No
      ['Is the stigma very large?', new Set([3])],
    ]);
    const pruned = pruneHiddenSelections(sel, GROUPS);
    assert.equal(pruned.has('Is the stigma very large?'), false);
    // parent selection is untouched
    assert.deepEqual([...(pruned.get('Does the forewing have a stigma?') ?? [])], [2]);
  });

  test('drops child selection when the parent has no selection at all', () => {
    const sel: Selection = new Map([['Is the stigma very large?', new Set([3])]]);
    const pruned = pruneHiddenSelections(sel, GROUPS);
    assert.equal(pruned.has('Is the stigma very large?'), false);
  });

  test('leaves independent selections alone', () => {
    const sel: Selection = new Map([['Main color of forewing', new Set([5])]]);
    const pruned = pruneHiddenSelections(sel, GROUPS);
    assert.deepEqual([...(pruned.get('Main color of forewing') ?? [])], [5]);
  });
});

// ---------------------------------------------------------------------------
// Real-data guard: every referenced question and trigger state must exist in
// the built matrix, or the reveal rules are silently dead.
// ---------------------------------------------------------------------------

describe('CHARACTER_DEPENDENCIES integrity against data/key-matrix.json', () => {
  const raw = JSON.parse(readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')) as { characters: Character[] };
  const groups = buildQuestionGroups(raw.characters);

  test('all 15 documented rules are present', () => {
    assert.equal(CHARACTER_DEPENDENCIES.length, 15);
  });

  for (const dep of CHARACTER_DEPENDENCIES) {
    test(`"${dep.childQuestion}" ← "${dep.parentQuestion}"`, () => {
      assert.ok(groups.has(dep.childQuestion), `child question missing: ${dep.childQuestion}`);
      const parentStates = groups.get(dep.parentQuestion);
      assert.ok(parentStates, `parent question missing: ${dep.parentQuestion}`);
      const stateNames = new Set(parentStates!.map(c => c.state));
      for (const trigger of dep.triggerStates) {
        assert.ok(stateNames.has(trigger), `trigger state "${trigger}" not in "${dep.parentQuestion}"`);
      }
    });
  }
});
