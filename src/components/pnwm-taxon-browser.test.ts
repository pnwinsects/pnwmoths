import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStateMap, taxonHasState, collectSlugs, validateSpeciesStates, SchemaValidationError } from './pnwm-taxon-browser.ts';
import type { TaxonFamily, TaxonSubfamily, TaxonGenus } from '../types/index.ts';

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

  it('collects slugs from a subfamily node', () => {
    const subfam = {
      genera: [
        { species: [{ slug: 'c' }] },
        { species: [{ slug: 'd' }] },
      ],
    } as unknown as TaxonSubfamily;
    assert.deepEqual(collectSlugs(subfam), ['c', 'd']);
  });

  it('collects slugs from a family node', () => {
    const family = {
      subfamilies: [
        {
          genera: [
            { species: [{ slug: 'e' }] },
          ],
        },
        {
          genera: [
            { species: [{ slug: 'f' }, { slug: 'g' }] },
          ],
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
