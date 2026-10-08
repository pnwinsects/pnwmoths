import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchStatus } from './site-search.ts';

test('searchStatus: no results', () => {
  assert.equal(searchStatus('xyz', 0, 0), 'No results found.');
});

test('searchStatus: singular and plural when everything is shown', () => {
  assert.equal(searchStatus('drepana', 1, 1), '1 result for drepana.');
  assert.equal(searchStatus('drepana', 3, 3), '3 results for drepana.');
});

test('searchStatus: names the cap when the query matched more than is shown', () => {
  assert.equal(searchStatus('xestia', 8, 42), 'Showing 8 of 42 results for xestia.');
});
