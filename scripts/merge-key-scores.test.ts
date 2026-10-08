import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planMerge, separatorFor } from './merge-key-scores.ts';

const header = 'binomial,Cat:Q:Yes,Cat:Q:No\n';
const existing = header + 'Aus bus,1,\n';
const species = new Set(['aus-bus', 'cus-dus', 'eus-fus']);

describe('planMerge', () => {
  test('appends a scored row for a species the key lacks', () => {
    const plan = planMerge(existing, header + 'Cus dus,,1\n', species, new Map());
    assert.deepStrictEqual(plan.append, [['Cus dus', '', '1']]);
  });

  test('normalizes 0 to blank, matching the committed file', () => {
    const plan = planMerge(existing, header + 'Cus dus,1,0\n', species, new Map());
    assert.deepStrictEqual(plan.append, [['Cus dus', '1', '']]);
  });

  test('skips template rows nobody filled in', () => {
    // An all-blank row would put the species in every Identify result.
    const plan = planMerge(existing, header + 'Cus dus,,\nEus fus,1,\n', species, new Map());
    assert.deepStrictEqual(plan.unscored, ['Cus dus']);
    assert.deepStrictEqual(plan.append.map(r => r[0]), ['Eus fus']);
  });

  test('never overwrites a species the key already scores', () => {
    const plan = planMerge(existing, header + 'Aus bus,,1\n', species, new Map());
    assert.deepStrictEqual(plan.alreadyScored, ['Aus bus']);
    assert.deepStrictEqual(plan.append, []);
  });

  test('reports a name that matches no species (a typo)', () => {
    const plan = planMerge(existing, header + 'Cus duss,1,\n', species, new Map());
    assert.deepStrictEqual(plan.unknown, ['Cus duss']);
    assert.deepStrictEqual(plan.append, []);
  });

  test('accepts a name that resolves through a synonym', () => {
    const plan = planMerge(existing, header + 'Oldus dus,1,\n', species, new Map([['Oldus dus', 'cus-dus']]));
    assert.deepStrictEqual(plan.append.map(r => r[0]), ['Oldus dus']);
  });

  test('refuses a template whose columns differ from the key', () => {
    assert.throws(
      () => planMerge(existing, 'binomial,Cat:Q:No,Cat:Q:Yes\nCus dus,1,\n', species, new Map()),
      /columns do not match.*column 2/
    );
  });

  test('accepts the BOM Excel writes on "CSV UTF-8"', () => {
    const plan = planMerge(existing, '﻿' + header + 'Cus dus,1,\n', species, new Map());
    assert.deepStrictEqual(plan.append.map(r => r[0]), ['Cus dus']);
  });

  test('treats a species the key scores under a retired name as already scored', () => {
    // The key holds "Oldus dus", a synonym of cus-dus. A row submitted under the
    // accepted name must not be appended: build-key would OR the two rows together.
    const keyed = header + 'Aus bus,1,\nOldus dus,,1\n';
    const plan = planMerge(keyed, header + 'Cus dus,1,\n', species, new Map([['Oldus dus', 'cus-dus']]));
    assert.deepStrictEqual(plan.alreadyScored, ['Cus dus']);
    assert.deepStrictEqual(plan.append, []);
  });

  test('rejects a name with a stray extra word instead of resolving its first two', () => {
    const plan = planMerge(existing, header + 'Cus dus typo,1,\n', species, new Map());
    assert.deepStrictEqual(plan.unknown, ['Cus dus typo']);
  });

  test('accepts a provisional name whose epithet has spaces', () => {
    const withProvisional = new Set([...species, 'xus-nr-yus']);
    const plan = planMerge(existing, header + 'Xus nr yus,1,\n', withProvisional, new Map());
    assert.deepStrictEqual(plan.append.map(r => r[0]), ['Xus nr yus']);
  });
});

describe('separatorFor', () => {
  test('adds a newline when the file does not end with one', () => {
    assert.equal(separatorFor('binomial,a\nAus bus,1'), '\n');
  });
  test('adds nothing when it does, or when the file is empty', () => {
    assert.equal(separatorFor('binomial,a\nAus bus,1\n'), '');
    assert.equal(separatorFor('binomial,a\r\nAus bus,1\r\n'), '');
    assert.equal(separatorFor(''), '');
  });
});
