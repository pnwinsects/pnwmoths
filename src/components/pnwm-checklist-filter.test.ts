// src/components/pnwm-checklist-filter.test.ts
// The Checklist filter (#218).
//
// Two things are tested and the DOM walk is not: the visibility predicate, where
// "no filter" has to mean "show everything" (getting that backwards empties the
// page on first paint), and the contract between the component's selectors and the
// markup the page actually emits — the failure that a passing unit test would hide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleSlugs } from './pnwm-checklist-filter.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ALL = ['abagrotis-apposita', 'hemileuca-nuttalli', 'ghost-species'];
const stateMap = {
  'abagrotis-apposita': new Set(['WA', 'OR']),
  'hemileuca-nuttalli': new Set(['OR']),
  // ghost-species has no occurrence rows at all — the case that must still show
  // under "All states".
};
const districtMap = {
  'abagrotis-apposita': new Set(['WA:Whatcom', 'OR:Lane']),
  'hemileuca-nuttalli': new Set(['OR:Lane']),
};

test('visibleSlugs: no state selected shows everything, including species with no records', () => {
  assert.deepEqual(
    [...visibleSlugs(ALL, stateMap, districtMap, '', '')],
    ALL,
    'the default view must be the complete checklist — that is the point of the page',
  );
});

test('visibleSlugs: a state selection filters to species recorded there', () => {
  assert.deepEqual([...visibleSlugs(ALL, stateMap, districtMap, 'WA', '')], ['abagrotis-apposita']);
  assert.deepEqual(
    [...visibleSlugs(ALL, stateMap, districtMap, 'OR', '')].sort(),
    ['abagrotis-apposita', 'hemileuca-nuttalli'],
  );
});

test('visibleSlugs: a district selection narrows within the state', () => {
  assert.deepEqual([...visibleSlugs(ALL, stateMap, districtMap, 'WA', 'Whatcom')], ['abagrotis-apposita']);
  assert.deepEqual(
    [...visibleSlugs(ALL, stateMap, districtMap, 'OR', 'Lane')].sort(),
    ['abagrotis-apposita', 'hemileuca-nuttalli'],
  );
});

test('visibleSlugs: a district with no species yields an empty set, not everything', () => {
  // The "empty result" path is worth pinning: falling back to "show all" when a
  // filter matches nothing would quietly tell the reader the opposite of the truth.
  assert.deepEqual([...visibleSlugs(ALL, stateMap, districtMap, 'WA', 'Lane')], []);
});

test('visibleSlugs: a species recorded in the state but not the chosen district is hidden', () => {
  assert.deepEqual([...visibleSlugs(ALL, stateMap, districtMap, 'OR', 'Lane')].includes('ghost-species'), false);
});

// ---------------------------------------------------------------------------
// The contract with the built page
// ---------------------------------------------------------------------------

test('the emitted Checklist page carries the hooks the component queries', () => {
  const page = resolve(ROOT, '_site/checklist/index.html');
  if (!existsSync(page)) return;   // not built in this run; the CI gate covers it

  const html = readFileSync(page, 'utf8');

  // These four strings are the entire coupling between the component and the page.
  // If the template stops emitting one, the filter silently does nothing — it would
  // hide zero rows and report the full count, which looks like a working page.
  assert.match(html, /<pnwm-checklist-filter/, 'the element must be on the page');
  assert.match(html, /class="checklist-species"/, 'row container the component queries');
  assert.match(html, /<li data-slug="/, 'species rows must carry their slug');
  assert.match(html, /class="checklist-group"/, 'the groups it hides when empty');

  const rows = [...html.matchAll(/<li data-slug="([^"]+)"/g)].length;
  assert.ok(rows > 1000, `expected the full checklist, found ${rows} rows`);
});
