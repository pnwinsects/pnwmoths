import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLAST_RADIUS_MIN_ROWS,
  binomialToSlug,
  buildCrosswalkIndex,
  collectCitedObservationIds,
  countyForDistrict,
  extractObservationIds,
  finalizeRow,
  formatSummary,
  guardBlastRadius,
  observationUrl,
  reconcile,
  resolveSpeciesSlug,
  screenObservation,
  stateForDistrictId,
  stateFromNearbyDistricts,
} from './inat.ts';
import type {
  Candidate,
  CrosswalkEntry,
  InatObservation,
  ScreenContext,
  SkipReason,
} from './inat.ts';
import type { InatRecordRow } from './records-source.ts';
import { classifyCoordinate } from './district-assignment.ts';

// A real observation from the PNWMoths project, trimmed to the fields the
// mapper reads.
function observation(overrides: Partial<InatObservation> = {}): InatObservation {
  return {
    id: 3792087,
    quality_grade: 'research',
    observed_on: '2016-08-02',
    geojson: { coordinates: [-123.8290050028, 46.1835989392] },
    obscured: false,
    public_positional_accuracy: 15,
    place_guess: 'Kensington Ave',
    taxon: { id: 224121, name: 'Lophocampa roseata', rank: 'species' },
    user: { id: 15366, login: 'mikepatterson', name: 'Mike Patterson' },
    ...overrides,
  };
}

function context(overrides: Partial<ScreenContext> = {}): ScreenContext {
  return {
    siteSlugs: new Set(['lophocampa-roseata', 'apantesis-doris', 'smerinthus-cerisyi']),
    synonyms: new Map([['grammia doris', 'apantesis-doris']]),
    citedIds: new Set<string>(),
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    inatId: '3792087',
    speciesSlug: 'lophocampa-roseata',
    latitude: 46.1835989392,
    longitude: -123.8290050028,
    locality: 'Kensington Ave',
    year: '2016',
    month: '8',
    day: '2',
    collector: 'Mike Patterson',
    obscured: false,
    accuracyNote: '',
    ...overrides,
  };
}

const CROSSWALK: CrosswalkEntry[] = [
  { state: 'OR', legacy_name: 'Clatsop', stable_id: 'US:41007' },
  // The real ambiguity in data/district-crosswalk.csv: one stable_id, two states.
  { state: 'OR', legacy_name: 'Lake', stable_id: 'US:41037' },
  { state: 'WA', legacy_name: 'Lake', stable_id: 'US:41037' },
  // One stable_id, two names within the SAME state.
  { state: 'ID', legacy_name: 'Beaver', stable_id: 'US:16029' },
  { state: 'ID', legacy_name: 'Caribou', stable_id: 'US:16029' },
  // Curator spells it with an ampersand; the boundary file spells it out.
  { state: 'MT', legacy_name: 'Lewis & Clark', stable_id: 'US:30049' },
];

const crosswalk = buildCrosswalkIndex(CROSSWALK);

function inatRow(overrides: Partial<InatRecordRow> = {}): InatRecordRow {
  return {
    species_slug: 'lophocampa-roseata',
    record_type: 'photograph',
    latitude: '46.1835989392',
    longitude: '-123.8290050028',
    state: 'OR',
    county: 'Clatsop',
    locality: 'Kensington Ave',
    elevation_ft: '',
    year: '2016',
    month: '8',
    day: '2',
    collector: 'Mike Patterson',
    collection: 'iNaturalist',
    notes: 'https://www.inaturalist.org/observations/3792087',
    district_id: 'US:41007',
    inat_id: '3792087',
    ...overrides,
  };
}

describe('extractObservationIds', () => {
  it('reads an id out of a plain URL', () => {
    assert.deepEqual(
      extractObservationIds('https://www.inaturalist.org/observations/45413899'),
      ['45413899'],
    );
  });

  it('stops at a URL fragment (a real records.csv row has one)', () => {
    assert.deepEqual(
      extractObservationIds(
        'https://www.inaturalist.org/observations/3792087#activity_comment_587056',
      ),
      ['3792087'],
    );
  });

  it('tolerates http and trailing whitespace (both occur in records.csv)', () => {
    assert.deepEqual(
      extractObservationIds('http://www.inaturalist.org/observations/62087089 '),
      ['62087089'],
    );
  });

  it('reads an id preceded by the curator accuracy annotation', () => {
    assert.deepEqual(
      extractObservationIds(
        'location accuracy: 26.94km; https://www.inaturalist.org/observations/49684455',
      ),
      ['49684455'],
    );
  });

  it('finds every id when a note cites several', () => {
    assert.deepEqual(
      extractObservationIds(
        'https://www.inaturalist.org/observations/1; https://www.inaturalist.org/observations/2',
      ),
      ['1', '2'],
    );
  });

  it('is not confused by the module-level regex being stateful across calls', () => {
    const text = 'https://www.inaturalist.org/observations/99';
    assert.deepEqual(extractObservationIds(text), ['99']);
    assert.deepEqual(extractObservationIds(text), ['99']);
  });

  it('returns nothing for blank or unrelated notes', () => {
    assert.deepEqual(extractObservationIds(''), []);
    assert.deepEqual(extractObservationIds(null), []);
    assert.deepEqual(extractObservationIds('Stehr & Cook, 1968'), []);
  });
});

describe('collectCitedObservationIds', () => {
  it('collects across rows and de-duplicates', () => {
    const ids = collectCitedObservationIds([
      { notes: 'https://www.inaturalist.org/observations/1' },
      { notes: 'https://www.inaturalist.org/observations/1' },
      { notes: 'https://www.inaturalist.org/observations/2' },
      { notes: '' },
    ]);
    assert.deepEqual([...ids].sort(), ['1', '2']);
  });
});

describe('binomialToSlug', () => {
  it('lowercases and hyphenates a binomial', () => {
    assert.equal(binomialToSlug('Lophocampa roseata'), 'lophocampa-roseata');
  });

  it('drops the infraspecific epithet', () => {
    assert.equal(binomialToSlug('Smerinthus cerisyi ophthalmica'), 'smerinthus-cerisyi');
  });
});

describe('resolveSpeciesSlug', () => {
  const ctx = context();

  it('resolves a species-rank name to its site slug', () => {
    assert.equal(
      resolveSpeciesSlug('Lophocampa roseata', 'species', ctx.siteSlugs, ctx.synonyms),
      'lophocampa-roseata',
    );
  });

  it('rolls a subspecies up to its binomial', () => {
    assert.equal(
      resolveSpeciesSlug('Smerinthus cerisyi ophthalmica', 'subspecies', ctx.siteSlugs, ctx.synonyms),
      'smerinthus-cerisyi',
    );
  });

  it('follows the curated synonym table', () => {
    assert.equal(
      resolveSpeciesSlug('Grammia doris', 'species', ctx.siteSlugs, ctx.synonyms),
      'apantesis-doris',
    );
  });

  it('returns null for a genus-rank identification', () => {
    assert.equal(resolveSpeciesSlug('Lophocampa', 'genus', ctx.siteSlugs, ctx.synonyms), null);
  });

  it('returns null when the site has no page for the taxon', () => {
    // Both occur in the real data: iNaturalist has moved records onto these.
    assert.equal(resolveSpeciesSlug('Pseudaletia unipuncta', 'species', ctx.siteSlugs, ctx.synonyms), null);
    assert.equal(resolveSpeciesSlug('Furcula gigans', 'species', ctx.siteSlugs, ctx.synonyms), null);
  });
});

describe('stateForDistrictId', () => {
  it('maps every covered prefix', () => {
    assert.equal(stateForDistrictId('US:53033'), 'WA');
    assert.equal(stateForDistrictId('US:41007'), 'OR');
    assert.equal(stateForDistrictId('US:16041'), 'ID');
    assert.equal(stateForDistrictId('US:30049'), 'MT');
    assert.equal(stateForDistrictId('CA:5907'), 'BC');
    assert.equal(stateForDistrictId('CA:4804'), 'AB');
  });

  it('returns null for a state the site does not cover', () => {
    // Wyoming (US:56) and Alaska (US:02) both fall inside the PNW coordinate
    // bounds build-data.ts enforces, so this is the gate that keeps them out.
    assert.equal(stateForDistrictId('US:56039'), null);
    assert.equal(stateForDistrictId('US:02130'), null);
  });
});

describe('countyForDistrict', () => {
  it('returns the crosswalk name when there is exactly one', () => {
    assert.equal(countyForDistrict('US:41007', 'OR', 'Clatsop', crosswalk), 'Clatsop');
  });

  it('disambiguates a cross-state stable_id by the derived state', () => {
    // US:41037 is in the crosswalk as both OR,Lake and WA,Lake. The state comes
    // from the FIPS prefix, so Oregon wins and Washington is never selected.
    assert.equal(countyForDistrict('US:41037', 'OR', 'Lake', crosswalk), 'Lake');
  });

  it('disambiguates two names in one state by the boundary file name', () => {
    assert.equal(countyForDistrict('US:16029', 'ID', 'Caribou', crosswalk), 'Caribou');
  });

  it('prefers the curator spelling over the boundary spelling', () => {
    // Writing the GeoJSON's "Lewis and Clark" would split the Browse filter
    // into two entries for one county.
    assert.equal(
      countyForDistrict('US:30049', 'MT', 'Lewis and Clark', crosswalk),
      'Lewis & Clark',
    );
  });

  it('is blank when the district has no crosswalk row at all', () => {
    // 21 eastern-Montana districts are in this position.
    assert.equal(countyForDistrict('US:30011', 'MT', 'Carter', crosswalk), '');
  });

  it('is blank when the ambiguity cannot be resolved', () => {
    assert.equal(countyForDistrict('US:16029', 'ID', 'Something Else', crosswalk), '');
    assert.equal(countyForDistrict('US:16029', 'ID', null, crosswalk), '');
  });
});

describe('screenObservation', () => {
  it('accepts a research-grade, in-bounds, resolvable observation', () => {
    const result = screenObservation(observation(), context());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidate.speciesSlug, 'lophocampa-roseata');
    assert.equal(result.candidate.collector, 'Mike Patterson');
    assert.deepEqual(
      [result.candidate.year, result.candidate.month, result.candidate.day],
      ['2016', '8', '2'],
    );
  });

  it('reads the date as text, never through a timezone', () => {
    // An evening observation must not roll to the next day. Parsing
    // "2016-08-02" as a Date in a UTC-negative zone is the classic way to
    // lose a day; splitting the string cannot.
    const result = screenObservation(observation({ observed_on: '2016-08-02' }), context());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidate.day, '2');
  });

  it('rejects a needs_id observation', () => {
    const result = screenObservation(observation({ quality_grade: 'needs_id' }), context());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'not-research-grade');
  });

  it('rejects an observation already entered by hand in records.csv', () => {
    const ctx = context({ citedIds: new Set(['3792087']) });
    const result = screenObservation(observation(), ctx);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'already-curated');
  });

  it('rejects a genus-level identification', () => {
    const result = screenObservation(
      observation({ taxon: { id: 1, name: 'Lophocampa', rank: 'genus' } }),
      context(),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'rank-above-species');
  });

  it('rejects a taxon with no page on the site, naming it for the report', () => {
    const result = screenObservation(
      observation({ taxon: { id: 1, name: 'Pseudaletia unipuncta', rank: 'species' } }),
      context(),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'unresolved-taxon');
    assert.equal(result.skipped.detail, 'Pseudaletia unipuncta');
  });

  it('rejects an observation far outside the Pacific Northwest', () => {
    const result = screenObservation(
      observation({ geojson: { coordinates: [-95.0, 45.0] } }),
      context(),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'out-of-bounds');
  });

  it('rejects a point the district gate would accept but the build would reject', () => {
    // Eastern Montana at lon -105 is inside PNW_BOUNDS (lon -140..-103, sized
    // to the boundary geometry) but outside the publishing bounds build-data.ts
    // enforces (lon -139..-110). Importing it would write a row that hard-fails
    // the very next build.
    assert.equal(classifyCoordinate(45.0, -105.0), 'ok');
    const result = screenObservation(
      observation({ geojson: { coordinates: [-105.0, 45.0] } }),
      context(),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'out-of-bounds');
  });

  it('rejects an observation with no coordinates', () => {
    const result = screenObservation(observation({ geojson: null }), context());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'no-coordinates');
  });

  it('annotates an obscured observation with its published accuracy', () => {
    const result = screenObservation(
      observation({ obscured: true, public_positional_accuracy: 26940 }),
      context(),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidate.obscured, true);
    // Matches the curator's own hand-entered wording.
    assert.equal(result.candidate.accuracyNote, 'location accuracy: 26.94km');
  });

  it('falls back to the login when the observer has no display name', () => {
    const result = screenObservation(
      observation({ user: { id: 1, login: 'luca_hickey', name: null } }),
      context(),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidate.collector, 'luca_hickey');
  });
});

describe('finalizeRow', () => {
  it('builds a complete row with the observation URL in notes', () => {
    const result = finalizeRow(
      candidate(),
      { kind: 'district', districtId: 'US:41007', districtName: 'Clatsop' },
      crosswalk,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.row.state, 'OR');
    assert.equal(result.row.county, 'Clatsop');
    assert.equal(result.row.district_id, 'US:41007');
    assert.equal(result.row.record_type, 'photograph');
    assert.equal(result.row.collection, 'iNaturalist');
    assert.equal(result.row.notes, 'https://www.inaturalist.org/observations/3792087');
    assert.equal(result.row.inat_id, '3792087');
  });

  it('refuses a candidate that could not be placed at all', () => {
    const result = finalizeRow(candidate(), { kind: 'none' }, crosswalk);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'no-district');
  });

  it('refuses a district outside the covered states rather than writing a blank state', () => {
    // The failure this prevents: build-data.ts exempts an empty state from its
    // allow-list check, so such a row would build cleanly and then be invisible
    // to every filter on the species page.
    const result = finalizeRow(
      candidate(),
      { kind: 'district', districtId: 'US:56039', districtName: 'Teton' },
      crosswalk,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.skipped.reason, 'no-district');
  });

  it('keeps the state but asserts no district for an obscured record', () => {
    const obscured = candidate({ obscured: true, accuracyNote: 'location accuracy: 26.94km' });
    const result = finalizeRow(
      obscured,
      { kind: 'district', districtId: 'US:41007', districtName: 'Clatsop' },
      crosswalk,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.row.state, 'OR');
    assert.equal(result.row.county, '');
    assert.equal(result.row.district_id, '');
    assert.equal(
      result.row.notes,
      'location accuracy: 26.94km; https://www.inaturalist.org/observations/3792087',
    );
  });
});

describe('stateFromNearbyDistricts', () => {
  it('returns the state when every nearby district agrees', () => {
    // Observation 90573451 sits in the Strait of Georgia, 5.7 km from Nanaimo
    // and 5.9 km from Cowichan Valley. Which district is a coin flip; which
    // province is not.
    assert.equal(stateFromNearbyDistricts(['CA:5921', 'CA:5919', 'CA:5917']), 'BC');
  });

  it('returns null when nearby districts straddle a border', () => {
    assert.equal(stateFromNearbyDistricts(['CA:5915', 'US:53073']), null);
  });

  it('returns null when nothing is nearby', () => {
    assert.equal(stateFromNearbyDistricts([]), null);
  });

  it('returns null when a nearby district is outside the covered states', () => {
    assert.equal(stateFromNearbyDistricts(['US:53073', 'US:56039']), null);
  });
});

describe('finalizeRow with a state-only placement', () => {
  it('keeps an unplaceable-but-in-state record, asserting no district', () => {
    const result = finalizeRow(candidate(), { kind: 'state-only', state: 'BC' }, crosswalk);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.row.state, 'BC');
    assert.equal(result.row.county, '');
    assert.equal(result.row.district_id, '');
  });
});

describe('reconcile', () => {
  const none = new Map<string, SkipReason>();

  it('reports a new observation as added', () => {
    const changes = reconcile([], [inatRow()], none);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.kind, 'added');
  });

  it('reports no change when nothing moved', () => {
    assert.deepEqual(reconcile([inatRow()], [inatRow()], none), []);
  });

  it('reports a changed identification as an updated field', () => {
    const changes = reconcile(
      [inatRow()],
      [inatRow({ species_slug: 'smerinthus-ophthalmica' })],
      none,
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.kind, 'updated');
    assert.deepEqual(changes[0]?.fields, [
      { column: 'species_slug', before: 'lophocampa-roseata', after: 'smerinthus-ophthalmica' },
    ]);
  });

  it('matches on inat_id, not on content', () => {
    // The one observation currently in both the project and records.csv has a
    // different observer spelling on each side; content matching would call
    // this two records rather than one changed record.
    const changes = reconcile(
      [inatRow({ collector: 'M. Patterson' })],
      [inatRow({ collector: 'Mike Patterson' })],
      none,
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.kind, 'updated');
  });

  it('carries the reason a record is being removed', () => {
    const changes = reconcile(
      [inatRow()],
      [],
      new Map<string, SkipReason>([['3792087', 'not-research-grade']]),
    );
    assert.equal(changes[0]?.kind, 'removed');
    assert.equal(changes[0]?.reason, 'not-research-grade');
  });

  it('defaults a removal with no recorded reason to leaving the project', () => {
    const changes = reconcile([inatRow()], [], none);
    assert.equal(changes[0]?.reason, null);
  });
});

describe('guardBlastRadius', () => {
  it('permits a run that removes nothing', () => {
    assert.equal(guardBlastRadius(100, 0).tripped, false);
  });

  it('permits a small removal from a small file', () => {
    // 13 of 63 is over the fraction but under the absolute floor. Tripping
    // here would teach the maintainer to pass --force by reflex.
    assert.equal(guardBlastRadius(63, 13).tripped, false);
  });

  it('trips on a large proportional removal from a large file', () => {
    const guard = guardBlastRadius(1000, 500);
    assert.equal(guard.tripped, true);
    assert.match(guard.message, /500 of 1000/);
  });

  it('does not trip on a large absolute removal that is a small share', () => {
    assert.equal(guardBlastRadius(10000, BLAST_RADIUS_MIN_ROWS + 1).tripped, false);
  });

  it('always trips when a non-empty file would be emptied', () => {
    // The iNaturalist-outage case: few or no results is indistinguishable from
    // "the project was emptied" without a human looking.
    assert.equal(guardBlastRadius(3, 3).tripped, true);
    assert.equal(guardBlastRadius(1, 1).tripped, true);
  });
});

describe('formatSummary', () => {
  it('says so plainly when nothing changed', () => {
    assert.match(formatSummary([], []), /No changes/);
  });

  it('describes each change in terms the curator recognises', () => {
    const summary = formatSummary(reconcile([], [inatRow()], new Map()), []);
    assert.match(summary, /Added \(1\)/);
    assert.match(summary, /lophocampa-roseata/);
    assert.match(summary, /Mike Patterson/);
    assert.match(summary, /Kensington Ave/);
  });

  it('shows before and after for an updated field', () => {
    const changes = reconcile([inatRow()], [inatRow({ species_slug: 'x-y' })], new Map());
    assert.match(formatSummary(changes, []), /species_slug: lophocampa-roseata -> x-y/);
  });

  it('gives the reason for each removal', () => {
    const changes = reconcile(
      [inatRow()],
      [],
      new Map<string, SkipReason>([['3792087', 'left-project']]),
    );
    assert.match(formatSummary(changes, []), /no longer in the iNaturalist project/);
  });

  it('counts ordinary rejections but lists the migration worklist individually', () => {
    const summary = formatSummary(
      [],
      [
        { inatId: '1', reason: 'unresolved-taxon', detail: 'Pseudaletia unipuncta' },
        { inatId: '2', reason: 'unresolved-taxon', detail: 'Furcula gigans' },
        { inatId: '3', reason: 'already-curated', detail: observationUrl('3') },
      ],
    );
    assert.match(summary, /2 identified as a taxon with no page on the site/);
    assert.match(summary, /Already in records.csv by hand \(1\)/);
    assert.match(summary, /inat:migrate/);
  });
});
