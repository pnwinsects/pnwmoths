// src/components/pnwm-checklist-filter.test.ts
// The Checklist filter (#218).
//
// Two things are tested and the DOM walk is not: the visibility predicate, where
// "no filter" has to mean "show everything" (getting that backwards empties the
// page on first paint), and the contract between the component's selectors and the
// markup the page actually emits — the failure that a passing unit test would hide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleSlugs, allDistrictsLabel, unreachableByDistrict } from './pnwm-checklist-filter.ts';

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
  // hemileuca-nuttalli is in OR, and in OR:Lane — so widen the fixture rather than
  // assert on ghost-species, which has no state records at all and would pass this
  // for the wrong reason.
  const inOregonNotLane = { ...stateMap, 'sierra-species': new Set(['OR']) };
  const districts = { ...districtMap, 'sierra-species': new Set(['OR:Baker']) };
  const shown = visibleSlugs([...ALL, 'sierra-species'], inOregonNotLane, districts, 'OR', 'Lane');
  assert.equal(shown.has('sierra-species'), false, 'recorded in OR but not in Lane');
  assert.equal(shown.has('hemileuca-nuttalli'), true, 'recorded in OR:Lane');
});

// ---------------------------------------------------------------------------
// The contract with the built page
// ---------------------------------------------------------------------------

test('the Checklist template carries the hooks the component queries', () => {
  // Asserted against the TEMPLATE, not _site/. A test that returns early when the
  // build output is missing is a green no-op on a clean checkout — and in CI, where
  // `npm test` runs before `build:site`, it would never have run at all.
  const html = readFileSync(resolve(ROOT, 'src/checklist/index.njk'), 'utf8');

  // These four strings are the entire coupling between the component and the page.
  // If the template stops emitting one, the filter silently does nothing — it would
  // hide zero rows and report the full count, which looks like a working page.
  assert.match(html, /<pnwm-checklist-filter/, 'the element must be on the page');
  assert.match(html, /class="checklist-species"/, 'row container the component queries');
  assert.match(html, /<li data-slug="/, 'species rows must carry their slug');
  assert.match(html, /class="checklist-group"/, 'the groups it hides when empty');

  // pathPrefix is a recurring hazard here (project memory, lessons-learned): the
  // element fetches two JSON aggregates, and on the GitHub Pages staging deploy the
  // prefix is "/pnwmoths/". Omitting the attribute 404s the fetch, the catch
  // swallows it, and the filters silently never render — which is exactly what
  // shipped in the first draft of this page.
  assert.match(
    html,
    /<pnwm-checklist-filter[^>]*path-prefix="\{\{ '\/' \| url \}\}"/,
    'the element must be passed path-prefix, as src/browse/index.njk does',
  );
});

// ---------------------------------------------------------------------------
// allDistrictsLabel
// ---------------------------------------------------------------------------

test('allDistrictsLabel: pluralises both jurisdictions correctly', () => {
  // The obvious `districtLabel(state).toLowerCase() + 's'` produces "All countys",
  // which shipped in the first draft and was caught by driving the real page.
  assert.equal(allDistrictsLabel(''), 'All counties');
  assert.equal(allDistrictsLabel('WA'), 'All counties');
  assert.equal(allDistrictsLabel('BC'), 'All regional districts');
});

// ---------------------------------------------------------------------------
// unreachableByDistrict
// ---------------------------------------------------------------------------

test('unreachableByDistrict: counts species in the state that no district can reach', () => {
  // Montana is capped to a western-MT county allow-list while the state aggregate is
  // not, so 86 of its 344 species sit under "Montana" and under no county. Without
  // this the page would hand a curator a quietly incomplete county list.
  const states = { a: new Set(['MT']), b: new Set(['MT']), c: new Set(['WA']) };
  const districts = { a: new Set(['MT:Flathead']), c: new Set(['WA:Whatcom']) };
  assert.equal(unreachableByDistrict(['a', 'b', 'c'], states, districts, 'MT'), 1);
  assert.equal(unreachableByDistrict(['a', 'b', 'c'], states, districts, 'WA'), 0);
});

test('unreachableByDistrict: is zero when no state is selected', () => {
  const states = { a: new Set(['MT']) };
  assert.equal(unreachableByDistrict(['a'], states, {}, ''), 0);
});

test('unreachableByDistrict: a district in another state does not count as reachable', () => {
  // Keys are "STATE:County", so a prefix test is required — plain membership would
  // let an OR record satisfy an MT query.
  const states = { a: new Set(['MT', 'OR']) };
  const districts = { a: new Set(['OR:Lane']) };
  assert.equal(unreachableByDistrict(['a'], states, districts, 'MT'), 1);
  assert.equal(unreachableByDistrict(['a'], states, districts, 'OR'), 0);
});
