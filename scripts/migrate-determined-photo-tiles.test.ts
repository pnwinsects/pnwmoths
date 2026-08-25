import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { appliedMoves, planMoves, retarget, sourcePathParts, storageUrl, tileSetPrefixOf } from './migrate-determined-photo-tiles.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('tileSetPrefixOf', () => {
  // The swap refusal prints these. A pair naming the wrong species — or naming
  // 576 objects instead of two tile sets — is a warning nobody can act on.
  it('collapses every object in a tile set to the one name a human recognises', () => {
    const want = 'species-tiles/mniotype-ducta/A-D';
    assert.equal(tileSetPrefixOf('species-tiles/mniotype-ducta/A-D.dzi'), want);
    assert.equal(tileSetPrefixOf('species-tiles/mniotype-ducta/A-D_files/12/3_4.webp'), want);
    assert.equal(tileSetPrefixOf('species-tiles/mniotype-ducta/A-D_thumbnail.webp'), want);
    assert.equal(tileSetPrefixOf('derived/species-tiles/mniotype-ducta/A-D_thumbnail@530.webp'), want);
    assert.equal(tileSetPrefixOf('derived/species-tiles/mniotype-ducta/A-D_thumbnail@1200.jpg'), want);
  });

  it('keeps A-D and A-V apart', () => {
    assert.notEqual(
      tileSetPrefixOf('species-tiles/mniotype-ducta/A-D_thumbnail.webp'),
      tileSetPrefixOf('species-tiles/mniotype-ducta/A-V_thumbnail.webp'),
    );
  });
});

describe('planMoves: unparseable stems', () => {
  // Silently skipping was the dangerous option: generate-species-photos.ts looks
  // the stem up directly and needs no parse, so it re-files species-photos.json
  // regardless — leaving the account pointing at tiles this script never made.
  it('throws rather than dropping a determination whose tiles it cannot locate', () => {
    assert.throws(
      () => planMoves(det([['Apantesis bolanderi D', 'apantesis-nevadensis', 'B']])),
      /cannot read a specimen and view/,
    );
  });

  it('plans a space-separated name instead of dropping it', () => {
    const moves = planMoves(det([['Euxoa lucida B-V', 'euxoa-absona', 'C']]));
    assert.deepEqual(moves.map(m => [m.fromPrefixKey, m.toPrefixKey]), [
      ['species-tiles/euxoa-lucida/B-V', 'species-tiles/euxoa-absona/C-V'],
    ]);
  });
});

describe('appliedMoves', () => {
  function ledger(body: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'retired-'));
    const path = join(dir, 'cdn-retired-images.csv');
    writeFileSync(path, 'old_path,superseded_by,reason,retired_on\n' + body);
    return path;
  }

  it('reads applied moves off the retirement ledger', () => {
    const path = ledger(
      'species-tiles/mniotype-ducta/A-D_thumbnail.webp,species-tiles/mniotype-tenera/A-D_thumbnail.webp,swap,2026-08-24\n',
    );
    assert.ok(appliedMoves(path).has('species-tiles/mniotype-ducta/A-D -> species-tiles/mniotype-tenera/A-D'));
  });

  it('ignores retirement rows that are not tile-set thumbnails', () => {
    const path = ledger('capsula-alameda/Capsula alameda-A-D.jpg,globia-alameda/Globia alameda-A-D.jpg,rename,2026-07-19\n');
    assert.equal(appliedMoves(path).size, 0);
  });

  it('is empty when no ledger exists', () => {
    assert.equal(appliedMoves('/nonexistent/cdn-retired-images.csv').size, 0);
  });

  // THE REASON THIS LEDGER EXISTS. A swap's two sides are indistinguishable by
  // length before and after, so without a record a re-run reverts production.
  it('makes an already-applied swap plan nothing', () => {
    const swap = det([
      ['Mniotype ducta-A-D', 'mniotype-tenera', 'A'],
      ['Mniotype tenera-A-D', 'mniotype-ducta', 'A'],
    ]);
    assert.equal(planMoves(swap).length, 2);
    const applied = new Set([
      'species-tiles/mniotype-ducta/A-D -> species-tiles/mniotype-tenera/A-D',
      'species-tiles/mniotype-tenera/A-D -> species-tiles/mniotype-ducta/A-D',
    ]);
    assert.deepEqual(planMoves(swap, applied), []);
  });

  it('still plans a NEW determination alongside applied ones', () => {
    const applied = new Set(['species-tiles/mniotype-ducta/A-D -> species-tiles/mniotype-tenera/A-D']);
    const moves = planMoves(
      det([['Mniotype ducta-A-D', 'mniotype-tenera', 'A'], ['Tarache areli-C-D', 'tarache-toddi', 'C']]),
      applied,
    );
    assert.deepEqual(moves.map(m => m.toPrefixKey), ['species-tiles/tarache-toddi/C-D']);
  });
});
