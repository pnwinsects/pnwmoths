// src/_lib/format-epithet.test.ts
// Run via: node --test src/_lib/format-epithet.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEpithet, isEpithetQuoted } from './format-epithet.ts';

test('formatEpithet: wraps a quoted epithet in straight double quotes', () => {
  assert.strictEqual(formatEpithet('apicalis', true), '"apicalis"');
});

test('formatEpithet: leaves an unquoted epithet untouched', () => {
  assert.strictEqual(formatEpithet('apicalis', false), 'apicalis');
});

test('isEpithetQuoted: only the literal "1" is truthy', () => {
  assert.strictEqual(isEpithetQuoted('1'), true);
  assert.strictEqual(isEpithetQuoted(''), false);
  assert.strictEqual(isEpithetQuoted(null), false);
  assert.strictEqual(isEpithetQuoted(undefined), false);
  assert.strictEqual(isEpithetQuoted('0'), false);
});
