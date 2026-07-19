// src/_data/speciesPlates.test.ts
// Verifies the species -> photographic-plate CSV parser (issue #53).
// Run via: node --test src/_data/speciesPlates.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlatesCsv } from './speciesPlates.ts';

test('parsePlatesCsv: parses species_slug,plate_slug rows into a map', () => {
  const csv =
    'species_slug,plate_slug\n' +
    'acronicta-americana,plate-35-noctuidae-vi-acronictinae-i\n' +
    'idia-concisa,plate-20-erebidae-vii-herminiinae\n';
  assert.deepEqual(parsePlatesCsv(csv), {
    'acronicta-americana': 'plate-35-noctuidae-vi-acronictinae-i',
    'idia-concisa': 'plate-20-erebidae-vii-herminiinae',
  });
});

test('parsePlatesCsv: ignores blank trailing lines', () => {
  const csv = 'species_slug,plate_slug\nacronicta-americana,plate-35-noctuidae-vi-acronictinae-i\n\n';
  assert.equal(Object.keys(parsePlatesCsv(csv)).length, 1);
});

test('parsePlatesCsv: returns {} for a header-only CSV', () => {
  assert.deepEqual(parsePlatesCsv('species_slug,plate_slug\n'), {});
});

test('default export: resolves a known species to its plate slug against real data', async () => {
  const { default: getSpeciesPlates } = await import('./speciesPlates.ts');
  const result = getSpeciesPlates();
  assert.equal(result['acronicta-americana'], 'plate-35-noctuidae-vi-acronictinae-i');
});
