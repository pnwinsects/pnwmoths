import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { planMoves, retarget, sourcePathParts, storageUrl } from './migrate-determined-photo-tiles.ts';
import type { PhotoDetermination } from './lib/photo-determinations.ts';

function det(rows: [stem: string, slug: string, specimen: string][]): Map<string, PhotoDetermination> {
  return new Map(
    rows.map(([photo_stem, species_slug, specimen]) => [
      photo_stem,
      { photo_stem, species_slug, specimen, source: '#330', note: '' },
    ]),
  );
}

describe('sourcePathParts', () => {
  it('reads the tile path the photograph was keyed at, from its filename', () => {
    assert.deepEqual(sourcePathParts('Amphipoea keiferi-A-D'), {
      slug: 'amphipoea-keiferi',
      specimen: 'A',
      view: 'D',
    });
  });

  it('collapses whitespace runs the way species_slug does', () => {
    assert.deepEqual(sourcePathParts('Mniotype aff tenera-B-V'), {
      slug: 'mniotype-aff-tenera',
      specimen: 'B',
      view: 'V',
    });
  });

  it('admits institutional accession numbers in the specimen slot', () => {
    assert.deepEqual(sourcePathParts('Euxoa lucida-OSAC_12-D')?.specimen, 'OSAC_12');
  });

  it('returns null for a name with no specimen/view tail', () => {
    assert.equal(sourcePathParts('Veins_jpg'), null);
  });
});

describe('planMoves', () => {
  it('moves both the folder and the specimen letter', () => {
    const moves = planMoves(det([['Amphipoea keiferi-A-D', 'resapamea-innota', 'C']]));
    assert.deepEqual(moves.map(m => [m.fromPrefixKey, m.toPrefixKey]), [
      ['species-tiles/amphipoea-keiferi/A-D', 'species-tiles/resapamea-innota/C-D'],
    ]);
  });

  // A determination that merely confirms where a photograph already sits is a
  // useful record (it suppresses check C) but implies no copy.
  it('skips a determination whose source and destination are the same path', () => {
    assert.deepEqual(planMoves(det([['Amphipoea senilis-A-D', 'amphipoea-senilis', 'A']])), []);
  });

  it('plans both halves of a swap', () => {
    const moves = planMoves(
      det([
        ['Mniotype ducta-A-D', 'mniotype-tenera', 'A'],
        ['Mniotype tenera-A-D', 'mniotype-ducta', 'A'],
      ]),
    );
    assert.deepEqual(moves.map(m => [m.fromPrefixKey, m.toPrefixKey]), [
      ['species-tiles/mniotype-ducta/A-D', 'species-tiles/mniotype-tenera/A-D'],
      ['species-tiles/mniotype-tenera/A-D', 'species-tiles/mniotype-ducta/A-D'],
    ]);
  });
});

describe('retarget', () => {
  const FROM = 'species-tiles/amphipoea-keiferi/A-D';
  const TO = 'species-tiles/resapamea-innota/C-D';

  it('rewrites the descriptor', () => {
    assert.equal(retarget(`${FROM}.dzi`, FROM, TO), `${TO}.dzi`);
  });

  // The pyramid is ~200 of the ~230 objects in a tile set. Missing it leaves the
  // viewer opening to a blank canvas with every other check still green.
  it('rewrites deep pyramid tiles', () => {
    assert.equal(
      retarget(`${FROM}_files/12/3_4.webp`, FROM, TO),
      `${TO}_files/12/3_4.webp`,
    );
  });

  it('rewrites the account thumbnail and its pre-generated variants', () => {
    assert.equal(retarget(`${FROM}_thumbnail.webp`, FROM, TO), `${TO}_thumbnail.webp`);
    assert.equal(
      retarget(`derived/${FROM}_thumbnail@530.webp`, FROM, TO),
      `derived/${TO}_thumbnail@530.webp`,
    );
  });

  it('leaves an unrelated key alone', () => {
    const other = 'species-tiles/amphipoea-keiferi/B-D.dzi';
    assert.equal(retarget(other, FROM, TO), other);
  });
});

describe('storageUrl', () => {
  it('encodes each segment but not the separators', () => {
    assert.equal(
      storageUrl('species-tiles/tarache-toddi/C-D.dzi'),
      'https://la.storage.bunnycdn.com/pnwmoths/species-tiles/tarache-toddi/C-D.dzi',
    );
  });
});
