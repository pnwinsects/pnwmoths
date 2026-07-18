import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStateMap,
  taxonHasState,
  collectSlugs,
  validateSpeciesStates,
  SchemaValidationError,
  buildDistrictMap,
  taxonHasDistrict,
  districtsForState,
  districtLabel,
  validateSpeciesDistricts,
  deriveStatesAvailable,
} from './pnwm-taxon-browser.ts';
import type { TaxonFamily, TaxonSubfamily, TaxonTribe, TaxonGenus } from '../types/index.ts';

describe('buildStateMap', () => {
  it('returns empty object for empty input', () => {
    assert.deepEqual(buildStateMap([]), {});
  });

  it('indexes a single species-state pair', () => {
    const result = buildStateMap([{ species_slug: 'alpha-beta', state: 'WA' }]);
    assert.ok(result['alpha-beta'] instanceof Set);
    assert.ok(result['alpha-beta']!.has('WA'));
  });

  it('accumulates multiple states for the same species', () => {
    const result = buildStateMap([
      { species_slug: 'a', state: 'WA' },
      { species_slug: 'a', state: 'OR' },
    ]);
    assert.ok(result['a']!.has('WA'));
    assert.ok(result['a']!.has('OR'));
    assert.equal(result['a']!.size, 2);
  });

  it('handles multiple distinct species', () => {
    const result = buildStateMap([
      { species_slug: 'a', state: 'WA' },
      { species_slug: 'b', state: 'ID' },
    ]);
    assert.ok(result['a']!.has('WA'));
    assert.ok(result['b']!.has('ID'));
    assert.equal(Object.keys(result).length, 2);
  });
});

describe('taxonHasState', () => {
  const stateMap = buildStateMap([
    { species_slug: 'a', state: 'WA' },
    { species_slug: 'b', state: 'OR' },
  ]);

  it('returns true when selectedState is empty string (no filter)', () => {
    assert.equal(taxonHasState(['a'], stateMap, ''), true);
  });

  it('returns true when a slug has the selected state', () => {
    assert.equal(taxonHasState(['a'], stateMap, 'WA'), true);
  });

  it('returns false when no slug has the selected state', () => {
    assert.equal(taxonHasState(['a'], stateMap, 'OR'), false);
  });

  it('returns false when slug is not in stateMap', () => {
    assert.equal(taxonHasState(['unknown-slug'], stateMap, 'WA'), false);
  });

  it('returns true when at least one of multiple slugs matches', () => {
    assert.equal(taxonHasState(['a', 'b'], stateMap, 'OR'), true);
  });

  it('returns false when no slug in array matches', () => {
    assert.equal(taxonHasState(['a', 'b'], stateMap, 'MT'), false);
  });
});

describe('collectSlugs', () => {
  it('collects slugs from a genus node', () => {
    const genus = { species: [{ slug: 'a' }, { slug: 'b' }] } as unknown as TaxonGenus;
    assert.deepEqual(collectSlugs(genus), ['a', 'b']);
  });

  it('collects slugs from a tribe node', () => {
    const tribe = {
      genera: [
        { species: [{ slug: 'c' }] },
        { species: [{ slug: 'd' }] },
      ],
    } as unknown as TaxonTribe;
    assert.deepEqual(collectSlugs(tribe), ['c', 'd']);
  });

  it('collects slugs from a subfamily node through its tribes', () => {
    const subfam = {
      tribes: [
        { genera: [{ species: [{ slug: 'c' }] }] },
        { genera: [{ species: [{ slug: 'd' }] }] },
      ],
    } as unknown as TaxonSubfamily;
    assert.deepEqual(collectSlugs(subfam), ['c', 'd']);
  });

  it('collects slugs from a family node', () => {
    const family = {
      subfamilies: [
        {
          tribes: [{ genera: [{ species: [{ slug: 'e' }] }] }],
        },
        {
          tribes: [{ genera: [{ species: [{ slug: 'f' }, { slug: 'g' }] }] }],
        },
      ],
    } as unknown as TaxonFamily;
    assert.deepEqual(collectSlugs(family), ['e', 'f', 'g']);
  });
});

describe('species-states.json validator', () => {
  it('throws when top-level is not an array', () => {
    assert.throws(
      () => validateSpeciesStates({}),
      SchemaValidationError
    );
  });

  it('throws when top-level is null', () => {
    assert.throws(
      () => validateSpeciesStates(null),
      SchemaValidationError
    );
  });

  it('throws when element shape is wrong (missing state field)', () => {
    assert.throws(
      () => validateSpeciesStates([{ species_slug: 's' }]),
      SchemaValidationError
    );
  });

  it('accepts a valid array with a properly shaped element', () => {
    assert.doesNotThrow(
      () => validateSpeciesStates([{ species_slug: 's', state: 'WA' }])
    );
  });

  it('accepts an empty array (no element to probe)', () => {
    assert.doesNotThrow(
      () => validateSpeciesStates([])
    );
  });
});

// --- District filter helpers (BFILT-02, BFILT-04, D-03) ---

describe('buildDistrictMap', () => {
  it('returns empty object for empty input', () => {
    assert.deepEqual(buildDistrictMap([]), {});
  });

  it('keys the set with the compound `${state}:${county}` string, never a bare county name (Pitfall 3)', () => {
    const result = buildDistrictMap([
      { species_slug: 'a', state: 'WA', county: 'Lincoln' },
      { species_slug: 'b', state: 'MT', county: 'Lincoln' },
    ]);
    assert.ok(result['a']!.has('WA:Lincoln'));
    assert.ok(result['b']!.has('MT:Lincoln'));
    assert.ok(!result['a']!.has('Lincoln'));
    assert.ok(!result['b']!.has('Lincoln'));
  });

  it('accumulates multiple districts for the same species', () => {
    const result = buildDistrictMap([
      { species_slug: 'a', state: 'WA', county: 'Lincoln' },
      { species_slug: 'a', state: 'WA', county: 'Whatcom' },
    ]);
    assert.equal(result['a']!.size, 2);
  });
});

describe('taxonHasDistrict', () => {
  // Pitfall 3: WA Lincoln vs MT Lincoln must never conflate.
  const districtMap = buildDistrictMap([
    { species_slug: 'a', state: 'WA', county: 'Lincoln' },
    { species_slug: 'b', state: 'MT', county: 'Lincoln' },
  ]);

  it('returns true when selectedCounty is empty string (no filter active)', () => {
    assert.equal(taxonHasDistrict(['a'], districtMap, 'WA', ''), true);
  });

  it('does not conflate same-named counties across states', () => {
    assert.equal(taxonHasDistrict(['b'], districtMap, 'WA', 'Lincoln'), false);
    assert.equal(taxonHasDistrict(['a'], districtMap, 'WA', 'Lincoln'), true);
  });

  it('returns false when no slug matches the compound key', () => {
    assert.equal(taxonHasDistrict(['a'], districtMap, 'OR', 'Lincoln'), false);
  });

  it('returns true when at least one of multiple slugs matches', () => {
    assert.equal(taxonHasDistrict(['a', 'b'], districtMap, 'MT', 'Lincoln'), true);
  });
});

describe('districtsForState', () => {
  const rows = [
    { species_slug: 'a', state: 'WA', county: 'Whatcom' },
    { species_slug: 'b', state: 'WA', county: 'Adams' },
    { species_slug: 'c', state: 'MT', county: 'Missoula' },
    { species_slug: 'd', state: 'WA', county: 'Whatcom' },
  ];

  it('returns only the given state\'s counties', () => {
    assert.deepEqual(districtsForState(rows, 'WA'), ['Adams', 'Whatcom']);
  });

  it('dedupes repeated counties', () => {
    const result = districtsForState(rows, 'WA');
    assert.equal(result.filter(c => c === 'Whatcom').length, 1);
  });

  it('returns alphabetical order with no counts (D-04)', () => {
    assert.deepEqual(districtsForState(rows, 'WA'), ['Adams', 'Whatcom']);
  });

  it('returns an empty array for a state with no rows', () => {
    assert.deepEqual(districtsForState(rows, 'OR'), []);
  });
});

describe('districtLabel', () => {
  it('returns "Regional District" for BC (BFILT-04)', () => {
    assert.equal(districtLabel('BC'), 'Regional District');
  });

  it('returns "County" for a US state', () => {
    assert.equal(districtLabel('WA'), 'County');
  });

  it('returns "County" (neutral default) when no state is selected', () => {
    assert.equal(districtLabel(''), 'County');
  });
});

describe('species-districts.json validator', () => {
  it('throws when top-level is not an array', () => {
    assert.throws(
      () => validateSpeciesDistricts({}),
      SchemaValidationError
    );
  });

  it('throws when top-level is null', () => {
    assert.throws(
      () => validateSpeciesDistricts(null),
      SchemaValidationError
    );
  });

  it('throws when element shape is wrong (missing county field)', () => {
    assert.throws(
      () => validateSpeciesDistricts([{ species_slug: 's', state: 'WA' }]),
      SchemaValidationError
    );
  });

  it('accepts a valid array with a properly shaped element', () => {
    assert.doesNotThrow(
      () => validateSpeciesDistricts([{ species_slug: 's', state: 'WA', county: 'Whatcom' }])
    );
  });

  it('accepts an empty array (no element to probe)', () => {
    assert.doesNotThrow(
      () => validateSpeciesDistricts([])
    );
  });
});

describe('deriveStatesAvailable', () => {
  // Pitfall 1's stated warning sign: a test that only checks STATE_NAMES['AB'] is
  // undefined does NOT prove _statesAvailable excludes 'AB' — assert directly on the
  // derived list instead (D-05, BFILT-03).
  it('excludes AB even when species-states.json has AB rows', () => {
    const rows = [
      { species_slug: 'a', state: 'WA' },
      { species_slug: 'b', state: 'AB' },
      { species_slug: 'c', state: 'BC' },
    ];
    const result = deriveStatesAvailable(rows);
    assert.ok(!result.includes('AB'));
    assert.deepEqual(result, ['BC', 'WA']);
  });

  it('returns sorted, deduped states', () => {
    const rows = [
      { species_slug: 'a', state: 'WA' },
      { species_slug: 'b', state: 'WA' },
      { species_slug: 'c', state: 'ID' },
    ];
    assert.deepEqual(deriveStatesAvailable(rows), ['ID', 'WA']);
  });
});
