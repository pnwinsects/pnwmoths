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
import {
  visibleSlugs,
  allDistrictsLabel,
  unreachableByDistrict,
  combineSelections,
  describeSelections,
  jurisdictionKey,
  jurisdictionLabel,
  type Jurisdiction,
} from './pnwm-checklist-filter.ts';

/** Shorthand for a selection: `area('WA')` is the whole state, `area('WA', 'Whatcom')` one county. */
function area(state: string, county = ''): Jurisdiction {
  return { state, county };
}

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
    [...visibleSlugs(ALL, stateMap, districtMap, [])],
    ALL,
    'the default view must be the complete checklist — that is the point of the page',
  );
});

test('visibleSlugs: a state selection filters to species recorded there', () => {
  assert.deepEqual([...visibleSlugs(ALL, stateMap, districtMap, [area('WA')])], ['abagrotis-apposita']);
  assert.deepEqual(
    [...visibleSlugs(ALL, stateMap, districtMap, [area('OR')])].sort(),
    ['abagrotis-apposita', 'hemileuca-nuttalli'],
  );
});

test('visibleSlugs: a district selection narrows within the state', () => {
  assert.deepEqual([...visibleSlugs(ALL, stateMap, districtMap, [area('WA', 'Whatcom')])], ['abagrotis-apposita']);
  assert.deepEqual(
    [...visibleSlugs(ALL, stateMap, districtMap, [area('OR', 'Lane')])].sort(),
    ['abagrotis-apposita', 'hemileuca-nuttalli'],
  );
});

test('visibleSlugs: a district with no species yields an empty set, not everything', () => {
  // The "empty result" path is worth pinning: falling back to "show all" when a
  // filter matches nothing would quietly tell the reader the opposite of the truth.
  assert.deepEqual([...visibleSlugs(ALL, stateMap, districtMap, [area('WA', 'Lane')])], []);
});

test('visibleSlugs: a species recorded in the state but not the chosen district is hidden', () => {
  // hemileuca-nuttalli is in OR, and in OR:Lane — so widen the fixture rather than
  // assert on ghost-species, which has no state records at all and would pass this
  // for the wrong reason.
  const inOregonNotLane = { ...stateMap, 'sierra-species': new Set(['OR']) };
  const districts = { ...districtMap, 'sierra-species': new Set(['OR:Baker']) };
  const shown = visibleSlugs([...ALL, 'sierra-species'], inOregonNotLane, districts, [area('OR', 'Lane')]);
  assert.equal(shown.has('sierra-species'), false, 'recorded in OR but not in Lane');
  assert.equal(shown.has('hemileuca-nuttalli'), true, 'recorded in OR:Lane');
});

// ---------------------------------------------------------------------------
// Combining areas (#293): the union the curator asked for
// ---------------------------------------------------------------------------

test('visibleSlugs: several areas show species known from ANY of them', () => {
  // The Georgia Basin case: Washington plus British Columbia.
  const states = { ...stateMap, 'island-species': new Set(['BC']) };
  const shown = visibleSlugs([...ALL, 'island-species'], states, districtMap, [area('WA'), area('BC')]);
  assert.deepEqual([...shown].sort(), ['abagrotis-apposita', 'island-species']);
  // The Olympic Peninsula case: several counties of one state.
  const districts = { ...districtMap, 'coast-species': new Set(['WA:Clallam']) };
  const peninsula = visibleSlugs([...ALL, 'coast-species'], states, districts, [area('WA', 'Clallam'), area('WA', 'Whatcom')]);
  assert.deepEqual([...peninsula].sort(), ['abagrotis-apposita', 'coast-species']);
});

test('visibleSlugs: a whole state and a county of another state mix freely', () => {
  const shown = visibleSlugs(ALL, stateMap, districtMap, [area('OR', 'Lane'), area('WA')]);
  assert.deepEqual([...shown].sort(), ['abagrotis-apposita', 'hemileuca-nuttalli']);
});

test('combineSelections: the selects join the pinned areas, deduplicated', () => {
  const pinned = [area('WA'), area('OR', 'Lane')];
  assert.deepEqual(combineSelections(pinned, area('BC')), [area('WA'), area('OR', 'Lane'), area('BC')]);
  assert.deepEqual(combineSelections(pinned, area('WA')), pinned, 'already pinned');
  assert.deepEqual(combineSelections(pinned, null), pinned);
  assert.deepEqual(combineSelections(pinned, area('')), pinned, 'nothing selected');
});

test('combineSelections: a county adds nothing when its whole state is selected', () => {
  // Listing "Whatcom (WA)" beside "Washington" would claim the filter is narrower
  // than it is; the union already contains every WA species.
  assert.deepEqual(combineSelections([area('WA')], area('WA', 'Whatcom')), [area('WA')]);
  assert.deepEqual(combineSelections([area('WA', 'Whatcom')], area('WA')), [area('WA')]);
});

test('describeSelections: reads as a sentence fragment', () => {
  assert.equal(describeSelections([]), '');
  assert.equal(describeSelections([area('WA')]), 'Washington');
  assert.equal(describeSelections([area('WA'), area('BC')]), 'Washington and British Columbia');
  assert.equal(
    describeSelections([area('WA', 'Clallam'), area('WA', 'Jefferson'), area('WA', 'Mason')]),
    'Clallam (WA), Jefferson (WA) and Mason (WA)',
  );
});

test('jurisdiction keys match the aggregates, and labels tag counties with their state', () => {
  // Same-named counties in different states (#133) must never collapse.
  assert.equal(jurisdictionKey(area('WA', 'Lincoln')), 'WA:Lincoln');
  assert.equal(jurisdictionKey(area('MT')), 'MT');
  assert.equal(jurisdictionLabel(area('WA', 'Lincoln')), 'Lincoln (WA)');
  assert.equal(jurisdictionLabel(area('BC')), 'British Columbia');
});

test('unreachableByDistrict: counts each species once across several whole-state selections', () => {
  const states = { a: new Set(['MT', 'WA']), b: new Set(['MT']) };
  const districts = {};
  assert.equal(unreachableByDistrict(['a', 'b'], states, districts, [area('MT'), area('WA')]), 2);
  assert.equal(unreachableByDistrict(['a', 'b'], states, districts, [area('MT', 'Flathead')]), 0, 'a county selection has already excluded them');
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
  assert.equal(unreachableByDistrict(['a', 'b', 'c'], states, districts, [area('MT')]), 1);
  assert.equal(unreachableByDistrict(['a', 'b', 'c'], states, districts, [area('WA')]), 0);
});

test('unreachableByDistrict: is zero when no state is selected', () => {
  const states = { a: new Set(['MT']) };
  assert.equal(unreachableByDistrict(['a'], states, {}, []), 0);
});

test('unreachableByDistrict: a district in another state does not count as reachable', () => {
  // Keys are "STATE:County", so a prefix test is required — plain membership would
  // let an OR record satisfy an MT query.
  const states = { a: new Set(['MT', 'OR']) };
  const districts = { a: new Set(['OR:Lane']) };
  assert.equal(unreachableByDistrict(['a'], states, districts, [area('MT')]), 1);
  assert.equal(unreachableByDistrict(['a'], states, districts, [area('OR')]), 0);
});
