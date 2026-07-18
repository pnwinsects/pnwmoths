import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  titleCaseTribe,
  buildTribeMap,
  applyTribes,
} from './backfill-tribe.ts';

describe('titleCaseTribe', () => {
  it('capitalizes a lowercase tribe slug to match the subfamily convention', () => {
    assert.equal(titleCaseTribe('arctiini'), 'Arctiini');
    assert.equal(titleCaseTribe('acontiini'), 'Acontiini');
  });

  it('returns empty for an empty slug', () => {
    assert.equal(titleCaseTribe(''), '');
  });
});

describe('buildTribeMap', () => {
  it('lowercases the genus key and title-cases the tribe value', () => {
    const map = buildTribeMap([{ genus: 'Tarache', tribe: 'acontiini' }]);
    assert.equal(map.get('tarache'), 'Acontiini');
  });

  it('keeps the first tribe when a genus appears more than once (never guesses a second)', () => {
    const map = buildTribeMap([
      { genus: 'apamea', tribe: 'apameini' },
      { genus: 'apamea', tribe: 'elsewhere' },
    ]);
    assert.equal(map.get('apamea'), 'Apameini');
  });

  it('skips rows with a blank genus or blank tribe', () => {
    const map = buildTribeMap([
      { genus: '', tribe: 'arctiini' },
      { genus: 'foo', tribe: '' },
    ]);
    assert.equal(map.size, 0);
  });
});

describe('applyTribes', () => {
  const tribeMap = new Map([['tarache', 'Acontiini'], ['apamea', 'Apameini']]);

  it('fills a blank tribe from the genus map', () => {
    const { rows, filled, leftBlank } = applyTribes(
      [{ id: '1', genus: 'Tarache', species: 'areli', tribe: '' }],
      tribeMap,
    );
    assert.equal(rows[0]!.tribe, 'Acontiini');
    assert.equal(filled, 1);
    assert.equal(leftBlank, 0);
  });

  it('leaves a genus the legacy paths do not classify blank (never guesses)', () => {
    const { rows, filled, leftBlank } = applyTribes(
      [{ id: '2', genus: 'Eilema', species: 'x', tribe: '' }],
      tribeMap,
    );
    assert.equal(rows[0]!.tribe, '');
    assert.equal(filled, 0);
    assert.equal(leftBlank, 1);
  });

  it('is additive-only: never overwrites an existing non-blank tribe (idempotent re-run)', () => {
    const { rows, filled, alreadyHad } = applyTribes(
      [{ id: '3', genus: 'Tarache', species: 'y', tribe: 'CuratorPicked' }],
      tribeMap,
    );
    assert.equal(rows[0]!.tribe, 'CuratorPicked');
    assert.equal(filled, 0);
    assert.equal(alreadyHad, 1);
  });

  it('preserves every other column verbatim', () => {
    const { rows } = applyTribes(
      [{
        id: '4', genus: 'Apamea', species: 'plutonia', common_name: 'x',
        noc_id: '93-0001', authority: '(Author, 1900)', family: 'Noctuidae',
        similar_species: 'a|b', subfamily: 'Noctuinae', epithet_quoted: '', tribe: '',
      }],
      tribeMap,
    );
    assert.deepEqual(rows[0], {
      id: '4', genus: 'Apamea', species: 'plutonia', common_name: 'x',
      noc_id: '93-0001', authority: '(Author, 1900)', family: 'Noctuidae',
      similar_species: 'a|b', subfamily: 'Noctuinae', epithet_quoted: '',
      tribe: 'Apameini',
    });
  });
});
