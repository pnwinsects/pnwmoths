import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseKeyScores } from '../build-key.ts';
import {
  derivedColumns,
  deriveKeyScores,
  missingKeyEcoregions,
  keyEcoregionName,
  ECOREGIONS_PATH,
  type DerivableRecord,
} from './key-derived-scores.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const { labels } = parseKeyScores(readFileSync(resolve(ROOT, 'data/key-scores.csv')));
const cols = derivedColumns(labels);
const idOf = (question: string, state: string) =>
  labels.findIndex(l => l.endsWith(`:${question}:${state}`));

function record(overrides: Partial<DerivableRecord>): DerivableRecord {
  return { species_slug: 'aus-bus', state: 'WA', month: null, notes: null, ecoregion: null, ...overrides };
}
function derivedFor(...records: DerivableRecord[]): Set<number> {
  return deriveKeyScores(records, cols).get('aus-bus') ?? new Set();
}

describe('derivedColumns', () => {
  test('finds every Distribution and Seasonality column of the real key', () => {
    assert.equal(cols.state.size, 5);
    assert.equal(cols.month.size, 12);
    assert.equal(cols.ecoregion.size, 47);
    assert.equal(cols.all.size, 64);
  });

  test('refuses a key that lost a month column', () => {
    assert.throws(() => derivedColumns(labels.filter(l => !l.endsWith(':July'))), /no column for .*July/);
  });

  test('refuses a month it does not know', () => {
    const renamed = labels.map(l => l.replace(':July', ':Jul'));
    assert.throws(() => derivedColumns(renamed), /unknown month "Jul"/);
  });

  test('requireAll: false only reports what is there', () => {
    const toy = ['Distribution:In which State/Province was the moth found?:Idaho', 'Cat:Q:Yes'];
    assert.deepEqual([...derivedColumns(toy, { requireAll: false }).all], [0]);
  });
});

describe('deriveKeyScores', () => {
  test('a record scores its state, its ecoregion within that state, and its month', () => {
    const got = derivedFor(record({ state: 'ID', ecoregion: 'Snake River Plain', month: 7 }));
    assert.deepEqual(
      [...got].sort((a, b) => a - b),
      [
        idOf('In which State/Province was the moth found?', 'Idaho'),
        idOf('In which ecoregion in Idaho?', 'Snake River Plain'),
        idOf('In which month was the moth found?', 'July'),
      ].sort((a, b) => a - b)
    );
  });

  test('ecoregion names the key spells differently reach their answer', () => {
    assert.ok(derivedFor(record({ ecoregion: 'Cascades' })).has(idOf('In which ecoregion in Washington?', 'Central Cascades')));
    assert.ok(derivedFor(record({ ecoregion: 'High Olympics' })).has(idOf('In which ecoregion in Washington?', 'Olympic Highlands')));
    assert.ok(
      derivedFor(record({ state: 'MT', ecoregion: 'Northwestern Great Plains' }))
        .has(idOf('In which ecoregion in Western Montana?', 'Northwest Great Plains'))
    );
    assert.equal(keyEcoregionName('Klamath Mountains/California High North Coast Range'), 'Klamath Mts/California High North Coast Range');
  });

  test("the BC file's capitalised names match the key's", () => {
    assert.ok(
      derivedFor(record({ state: 'BC', ecoregion: 'GEORGIA DEPRESSION' }))
        .has(idOf('In which ecoregion in British Columbia?', 'Georgia Depression'))
    );
  });

  test('every Montana record counts as Western Montana', () => {
    assert.ok(derivedFor(record({ state: 'MT' })).has(idOf('In which State/Province was the moth found?', 'Western Montana')));
  });

  test("an ecoregion outside its state's answers adds the state but no ecoregion", () => {
    const got = derivedFor(record({ state: 'WA', ecoregion: 'Snake River Plain' }));
    assert.deepEqual([...got], [idOf('In which State/Province was the moth found?', 'Washington')]);
  });

  test('an Alberta record adds only its month', () => {
    const got = derivedFor(record({ state: 'AB', ecoregion: 'Northern Rockies', month: 6 }));
    assert.deepEqual([...got], [idOf('In which month was the moth found?', 'June')]);
  });

  test('a reared record adds its state but not its month, as on the flight chart (#59)', () => {
    const got = derivedFor(record({ state: 'OR', month: 2, notes: 'reared ex larva' }));
    assert.deepEqual([...got], [idOf('In which State/Province was the moth found?', 'Oregon')]);
  });

  test('species are kept apart', () => {
    const scores = deriveKeyScores(
      [record({ state: 'WA' }), record({ species_slug: 'cus-dus', state: 'OR' })],
      cols
    );
    assert.equal(scores.get('aus-bus')?.size, 1);
    assert.equal(scores.get('cus-dus')?.size, 1);
    assert.notDeepEqual(scores.get('aus-bus'), scores.get('cus-dus'));
  });
});

describe('the committed ecoregion boundaries', () => {
  const geojson = JSON.parse(readFileSync(resolve(ROOT, ECOREGIONS_PATH), 'utf-8')) as {
    features: Array<{ properties: { name: string; country: string; source: string } }>;
  };
  const features = geojson.features.map(f => f.properties);

  test("supply every one of the key's 47 ecoregion answers", () => {
    assert.deepEqual(missingKeyEcoregions(cols, features), []);
  });

  test('carry exactly name, country and source on every feature', () => {
    for (const f of features) {
      assert.deepEqual(Object.keys(f).sort(), ['country', 'name', 'source']);
      assert.ok(f.country === 'US' || f.country === 'CA', `${f.name}: country ${f.country}`);
    }
  });

  test('missingKeyEcoregions names an answer nobody supplies', () => {
    const withoutOlympics = features.filter(f => f.name !== 'High Olympics');
    assert.deepEqual(missingKeyEcoregions(cols, withoutOlympics), [
      'In which ecoregion in Washington?: olympic highlands',
    ]);
  });
});
