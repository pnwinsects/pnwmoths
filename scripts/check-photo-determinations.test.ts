import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findViolations, slugClaimedByFilename, KNOWN_COLLISIONS } from './check-photo-determinations.ts';
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

  // A recorded determination stops the check re-firing forever — but only once
  // the tiles have actually landed where it says.
  it('[C] is suppressed by a determination the tiles have caught up with', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'C', view: 'dorsal' },
    ];
    const found = findViolations(
      images,
      determinations({ photo_stem: 'Amphipoea keiferi-A-D', species_slug: 'resapamea-innota', specimen: 'C' }),
      // Mid-migration: the source still holds the filename's slot, the
      // destination already holds the determined one.
      { ...tiles('amphipoea-keiferi', 'A-D'), ...tiles('resapamea-innota', 'C-D') },
      NO_STEMS,
    );
    assert.deepEqual(found, []);
  });

  // The half-finished runbook: images.csv edited and the ruling recorded, but
  // `photos:materialize` not run — and it is NOT part of build:site, while
  // species-photos.json is committed. Exempting on the mere existence of a
  // determination made every gate green with the wrong moth still public.
  it('[C] still fires when the ruling is recorded but the tiles never moved', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'C', view: 'dorsal' },
    ];
    const found = findViolations(
      images,
      determinations({ photo_stem: 'Amphipoea keiferi-A-D', species_slug: 'resapamea-innota', specimen: 'C' }),
      // Stale tiles sit at the FILENAME's letter. The first version of this
      // fixture said 'C-D' — the destination letter — which made the test pass
      // for the wrong reason and hid the same bug the code had.
      tiles('amphipoea-keiferi', 'A-D'),
      NO_STEMS,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]!.check, 'C');
    assert.match(found[0]!.message, /specimen A-D/);
  });

  it('[C] is silent once the tiles reach the destination letter', () => {
    const images: ImageRow[] = [
      { species_slug: 'resapamea-innota', filename: 'Amphipoea keiferi-A-D.jpg', specimen: 'C', view: 'dorsal' },
    ];
    const found = findViolations(
      images,
      determinations({ photo_stem: 'Amphipoea keiferi-A-D', species_slug: 'resapamea-innota', specimen: 'C' }),
      { ...tiles('amphipoea-keiferi', 'A-D'), ...tiles('resapamea-innota', 'C-D') },
      NO_STEMS,
    );
    assert.deepEqual(found, []);
  });

  // The gate must see the names ingest admits, or it is blind to the next #330.
  it('[C] sees a space-separated filename', () => {
    const images: ImageRow[] = [
      { species_slug: 'euxoa-absona', filename: 'Euxoa lucida B-V.jpg', specimen: 'B', view: 'ventral' },
    ];
    const found = findViolations(images, new Map(), tiles('euxoa-lucida', 'B-V'), NO_STEMS);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.check, 'C');
  });

  // --- D -------------------------------------------------------------------
  it('[D] reports two photographs claiming one specimen slot', () => {
    const images: ImageRow[] = [
      { species_slug: 'trichopolia-rufula', filename: 'Protorthodes perforata-A-D.jpg', specimen: 'A', view: 'dorsal' },
      { species_slug: 'trichopolia-rufula', filename: 'Protorthodes rufula-A-D.jpg', specimen: 'A', view: 'dorsal' },
    ];
    // No baseline passed, so this reads as newly introduced — see the ratchet suite.
    const found = findViolations(images, new Map(), NO_TILES, NO_STEMS);
    assert.equal(found.filter(v => v.check === 'D-new').length, 1);
  });

  it('[D] ignores rows with no specimen or view, which the Geometridae import left blank', () => {
    const images: ImageRow[] = [
      { species_slug: 'macaria-signaria', filename: 'Macaria signaria - A-D.jpg', specimen: '', view: '' },
      { species_slug: 'macaria-signaria', filename: 'Macaria signaria - A-V.jpg', specimen: '', view: '' },
    ];
    assert.deepEqual(findViolations(images, new Map(), NO_TILES, NO_STEMS), []);
  });
});

describe('check D as a ratchet', () => {
  const collide = (slug: string, a: string, b: string) => [
    { species_slug: slug, filename: a, specimen: 'A', view: 'dorsal' },
    { species_slug: slug, filename: b, specimen: 'A', view: 'dorsal' },
  ];
  const run = (images: ImageRow[], known: ReadonlySet<string>) =>
    findViolations(images, new Map(), {}, new Set<string>(), known);

  it('leaves a pre-existing collision advisory', () => {
    const found = run(collide('trichopolia-rufula', 'Protorthodes perforata-A-D.jpg', 'Protorthodes rufula-A-D.jpg'),
      new Set(['trichopolia-rufula|A|D']));
    assert.deepEqual(found.map(v => v.check), ['D']);
  });

  // The point of the ratchet: the backlog does not block work, but nothing may
  // be added to it silently. A new collision is a latent #330.
  it('fails on a collision that is not in the baseline', () => {
    const found = run(collide('abagrotis-apposita', 'Abagrotis apposita-A-D.jpg', 'Abagrotis baueri-A-D.jpg'),
      new Set<string>());
    assert.deepEqual(found.map(v => v.check), ['D-new']);
    assert.match(found[0]!.message, /NEW/);
  });

  it('fails on a baseline entry that no longer collides, so the list gets pruned', () => {
    const found = run([], new Set(['trichopolia-rufula|A|D']));
    assert.deepEqual(found.map(v => v.check), ['D-resolved']);
    assert.match(found[0]!.message, /no longer collides/);
  });

  it('holds the real baseline at exactly the pairs that predate the check', () => {
    assert.equal(KNOWN_COLLISIONS.size, 22);
    for (const key of KNOWN_COLLISIONS) {
      assert.match(key, /^[a-z0-9-]+\|[A-Z0-9_]+\|[DV]$/, key);
    }
  });
});
