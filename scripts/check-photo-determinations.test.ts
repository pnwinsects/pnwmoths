import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findViolations, slugClaimedByFilename } from './check-photo-determinations.ts';
import type { PhotoDetermination } from './lib/photo-determinations.ts';

type ImageRow = { species_slug: string; filename: string; specimen: string; view: string };

function determinations(...rows: Partial<PhotoDetermination>[]): Map<string, PhotoDetermination> {
  return new Map(
    rows.map(r => [
      r.photo_stem!,
      {
        photo_stem: r.photo_stem!,
        species_slug: r.species_slug ?? '',
        specimen: r.specimen ?? '',
        source: r.source ?? '#test',
        note: r.note ?? '',
      },
    ]),
  );
}

/** A tiles entry for `slug` covering each `A-D`-style slot. */
function tiles(slug: string, ...slots: string[]) {
  return {
    [slug]: {
      high_res_available: true,
      specimens: slots.map(s => ({ specimen_id: s.split('-')[0]!, view: s.split('-')[1]! })),
    },
  };
}

describe('slugClaimedByFilename', () => {
  it('reads the binomial the filename asserts', () => {
    assert.equal(slugClaimedByFilename('Amphipoea keiferi-A-D.jpg'), 'amphipoea-keiferi');
  });

  it('tolerates the spaced-hyphen separator seen in the Geometridae import', () => {
    assert.equal(slugClaimedByFilename('Dasyfidonia avuncularia - A-D.jpg'), 'dasyfidonia-avuncularia');
  });

  it('collapses whitespace runs, matching normalizeSlug', () => {
    assert.equal(slugClaimedByFilename('Xylophanes nr libya-A-D.jpg'), 'xylophanes-nr-libya');
  });

  it('returns null when there is no parseable binomial to compare against', () => {
    assert.equal(slugClaimedByFilename('IMG_2043.jpg'), null);
    assert.equal(slugClaimedByFilename('Veins_jpg.jpg'), null);
  });
});

describe('findViolations', () => {
  const NO_TILES = {};
  const NO_STEMS = new Set<string>();

  it('passes a catalogue where every filename agrees with its species', () => {
    const images: ImageRow[] = [
      { species_slug: 'abagrotis-apposita', filename: 'Abagrotis apposita-A-D.jpg', specimen: 'A', view: 'dorsal' },
    ];
    assert.deepEqual(findViolations(images, new Map(), NO_TILES, NO_STEMS), []);
  });

  // --- A -------------------------------------------------------------------
  it('[A] rejects a determination that names no photograph anywhere', () => {
    const found = findViolations(
      [],
      determinations({ photo_stem: 'Typo keiferi-A-D', species_slug: 'resapamea-innota', specimen: 'C' }),
      NO_TILES,
      NO_STEMS,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]!.check, 'A');
  });

  it('[A] accepts a determination matched only by the manifest', () => {
    const found = findViolations(
      [],
      determinations({ photo_stem: 'Mniotype ducta-A-V', species_slug: 'mniotype-tenera', specimen: 'A' }),
      NO_TILES,
      new Set(['Mniotype ducta-A-V']),
    );
    assert.deepEqual(found, []);
  });

  // --- B -------------------------------------------------------------------
  it('[B] rejects a determination that disagrees with images.csv about the species', () => {
    const images: ImageRow[] = [
      { species_slug: 'amphipoea-keiferi', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'A', view: 'dorsal' },
    ];
    const found = findViolations(
      images,
      determinations({ photo_stem: 'Amphipoea keiferi-A-D', species_slug: 'resapamea-innota', specimen: 'C' }),
      NO_TILES,
      NO_STEMS,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]!.check, 'B');
    assert.match(found[0]!.message, /stale/);
  });

  it('[B] rejects a determination that disagrees about the specimen letter', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'A', view: 'dorsal' },
    ];
    const found = findViolations(
      images,
      determinations({ photo_stem: 'Amphipoea keiferi-A-D', species_slug: 'resapamea-innota', specimen: 'C' }),
      NO_TILES,
      NO_STEMS,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]!.check, 'B');
    assert.match(found[0]!.message, /specimen C/);
  });

  // --- C: the regression this file exists for (#330 / #336) ----------------
  it('[C] rejects an account publishing tiles for another species’ photograph', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'A', view: 'dorsal' },
    ];
    const found = findViolations(images, new Map(), tiles('amphipoea-keiferi', 'A-D'), NO_STEMS);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.check, 'C');
    assert.match(found[0]!.message, /amphipoea-keiferi/);
  });

  it('[C] is silent once the tiles move off the mis-keyed account', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'C', view: 'dorsal' },
    ];
    assert.deepEqual(
      findViolations(images, new Map(), tiles('resapamea-innota', 'C-D'), NO_STEMS),
      [],
    );
  });

  it('[C] does not fire when the name-species has tiles at a different specimen', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'A', view: 'dorsal' },
    ];
    assert.deepEqual(
      findViolations(images, new Map(), tiles('amphipoea-keiferi', 'B-D'), NO_STEMS),
      [],
    );
  });

  // A recorded determination means a human has already adjudicated this pair;
  // the tile move is tracked elsewhere and must not re-fire here forever.
  it('[C] is suppressed by a recorded determination', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'C', view: 'dorsal' },
    ];
    const found = findViolations(
      images,
      determinations({ photo_stem: 'Amphipoea keiferi-A-D', species_slug: 'resapamea-innota', specimen: 'C' }),
      tiles('amphipoea-keiferi', 'C-D'),
      NO_STEMS,
    );
    assert.deepEqual(found, []);
  });

  // --- D -------------------------------------------------------------------
  it('[D] reports two photographs claiming one specimen slot', () => {
    const images: ImageRow[] = [
      { species_slug: 'trichopolia-rufula', filename: 'Protorthodes perforata-A-D.jpg', specimen: 'A', view: 'dorsal' },
      { species_slug: 'trichopolia-rufula', filename: 'Protorthodes rufula-A-D.jpg', specimen: 'A', view: 'dorsal' },
    ];
    const found = findViolations(images, new Map(), NO_TILES, NO_STEMS);
    assert.equal(found.filter(v => v.check === 'D').length, 1);
  });

  it('[D] ignores rows with no specimen or view, which the Geometridae import left blank', () => {
    const images: ImageRow[] = [
      { species_slug: 'macaria-signaria', filename: 'Macaria signaria - A-D.jpg', specimen: '', view: '' },
      { species_slug: 'macaria-signaria', filename: 'Macaria signaria - A-V.jpg', specimen: '', view: '' },
    ];
    assert.deepEqual(findViolations(images, new Map(), NO_TILES, NO_STEMS), []);
  });
});
