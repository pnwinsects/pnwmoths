import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchStatus, nextOptionIndex, optionsHtml } from './site-search.ts';

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

test('nextOptionIndex: ArrowDown starts at the first option and wraps from the last', () => {
  assert.equal(nextOptionIndex(-1, 3, 'ArrowDown'), 0);
  assert.equal(nextOptionIndex(0, 3, 'ArrowDown'), 1);
  assert.equal(nextOptionIndex(2, 3, 'ArrowDown'), 0);
});

test('nextOptionIndex: ArrowUp starts at the last option and wraps from the first', () => {
  assert.equal(nextOptionIndex(-1, 3, 'ArrowUp'), 2);
  assert.equal(nextOptionIndex(1, 3, 'ArrowUp'), 0);
  assert.equal(nextOptionIndex(0, 3, 'ArrowUp'), 2);
});

test('nextOptionIndex: nothing to highlight in an empty list', () => {
  assert.equal(nextOptionIndex(-1, 0, 'ArrowDown'), -1);
});

test('optionsHtml: each result is an option outside the Tab order, named by its title', () => {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const html = optionsHtml(
    [{ url: '/species/a-b/', excerpt: 'a <mark>moth</mark>', meta: { title: 'A & B' } }],
    escape,
  );
  assert.match(html, /role="option" id="site-search-option-0"/);
  assert.match(html, /aria-selected="false" tabindex="-1" href="\/species\/a-b\/"/);
  assert.match(html, /aria-labelledby="site-search-option-0-title" aria-describedby="site-search-option-0-excerpt"/);
  assert.match(html, />A &amp; B</, 'the title is escaped');
  assert.match(html, /a <mark>moth<\/mark>/, "Pagefind's excerpt markup is kept");
});
