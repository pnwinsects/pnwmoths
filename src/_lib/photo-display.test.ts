// src/_lib/photo-display.test.ts
// Guards for the photo selection rules (#338).
//
// What is worth testing here is not that a sort sorts. It is the SEVEN RULES' points of
// disagreement — the places where two surfaces differ and a future edit is likely to
// "tidy" one into the other:
//
//   - Browse excludes ventral; nothing else does
//   - the genus strip crosses species boundaries; every other rule is per-species
//   - tiles REPLACE the account's photographs, PREFER on share, are a FALLBACK on Browse
//   - a blank view is kept everywhere (unclassified is not confirmed-ventral)
//   - a missing weight sorts last, so it can never silently become a species' thumbnail
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEIGHT_ORDER_SQL,
  NON_VENTRAL_SQL,
  TILE_POLICY,
  STRIP_SIZE,
  compareByWeight,
  isVentral,
  orderByWeight,
  pickAccountPhotos,
  pickCardPhoto,
  pickGenusStrip,
  pickHigherStrip,
  pickIdentifyPhoto,
  pickSimilarPhoto,
  pickSharePhoto,
} from './photo-display.ts';

interface Row {
  species_slug: string;
  filename: string;
  weight: number | null;
  view?: string | null;
}

function row(overrides: Partial<Row> = {}): Row {
  return { species_slug: 'abagrotis-apposita', filename: 'a.jpg', weight: 1, view: 'dorsal', ...overrides };
}

describe('the ordering, in both dialects', () => {
  it('orders low weight first', () => {
    const rows = [row({ filename: 'b.jpg', weight: 2 }), row({ filename: 'a.jpg', weight: 1 })];
    assert.deepEqual(orderByWeight(rows).map((r) => r.filename), ['a.jpg', 'b.jpg']);
  });

  // A row whose weight will not parse must never win a thumbnail slot by accident. The
  // SQL side gets this free (TRY_CAST → NULL sorts last in ASC); the JS side has to say so.
  it('sorts a missing weight LAST, never first', () => {
    const rows = [row({ filename: 'unweighted.jpg', weight: null }), row({ filename: 'first.jpg', weight: 9 })];
    assert.deepEqual(orderByWeight(rows).map((r) => r.filename), ['first.jpg', 'unweighted.jpg']);
    assert.ok(compareByWeight({ weight: null }, { weight: 100 }) > 0);
  });

  it('does not sort the caller\'s array in place', () => {
    const rows = [row({ filename: 'b.jpg', weight: 2 }), row({ filename: 'a.jpg', weight: 1 })];
    orderByWeight(rows);
    assert.equal(rows[0]?.filename, 'b.jpg');
  });

  it('is stable, so equal weights keep the order they arrived in', () => {
    const rows = [row({ filename: 'first.jpg', weight: 1 }), row({ filename: 'second.jpg', weight: 1 })];
    assert.deepEqual(orderByWeight(rows).map((r) => r.filename), ['first.jpg', 'second.jpg']);
  });

  // The SQL fragments are the same rules for the two consumers that select in DuckDB.
  // Asserting their text is not a tautology: they are interpolated into queries, and a
  // change here is a change to Browse and Identify that no unit test would otherwise see.
  it('states the SQL twins the DuckDB consumers interpolate', () => {
    assert.equal(WEIGHT_ORDER_SQL, 'TRY_CAST(weight AS INTEGER)');
    assert.equal(NON_VENTRAL_SQL, `view IS DISTINCT FROM 'ventral'`);
  });

  it('treats only an explicit ventral as ventral', () => {
    assert.equal(isVentral('ventral'), true);
    assert.equal(isVentral('dorsal'), false);
    assert.equal(isVentral(null), false);
    assert.equal(isVentral(undefined), false);
  });
});

describe('the account: tiles REPLACE the catalogued photographs', () => {
  it('shows every row in weight order when there are no tiles', () => {
    const display = pickAccountPhotos([row({ filename: 'b.jpg', weight: 2 }), row({ filename: 'a.jpg', weight: 1 })], false);
    assert.equal(display.mode, 'photos');
    assert.deepEqual(display.photos.map((r) => r.filename), ['a.jpg', 'b.jpg']);
  });

  // This is the asymmetry that made tiling a species remove its photographs from its own
  // page while leaving them on /browse/ and Identify (#299). It is intended; it is only
  // dangerous when it is invisible.
  it('shows NONE of them when the species is tiled', () => {
    const display = pickAccountPhotos([row()], true);
    assert.equal(display.mode, 'tiles');
    assert.deepEqual(display.photos, []);
  });

  it('distinguishes "tiles" from "nothing at all"', () => {
    assert.equal(pickAccountPhotos([], false).mode, 'none');
    assert.equal(pickAccountPhotos([], true).mode, 'tiles');
  });

  it('records that only the account replaces, and what the others do', () => {
    assert.equal(TILE_POLICY['account'], 'replaces');
    assert.equal(TILE_POLICY['share'], 'prefers');
    assert.equal(TILE_POLICY['browse-card'], 'fallback');
    assert.equal(TILE_POLICY['identify'], 'ignores');
    assert.equal(TILE_POLICY['similar'], 'ignores');
  });
});

describe('the Browse card: lowest weight, ventral excluded', () => {
  it('skips a ventral shot even when it is the lightest', () => {
    const chosen = pickCardPhoto([
      row({ filename: 'under.jpg', weight: 1, view: 'ventral' }),
      row({ filename: 'top.jpg', weight: 2, view: 'dorsal' }),
    ]);
    assert.equal(chosen?.filename, 'top.jpg');
  });

  // Unclassified is not confirmed-ventral. The SQL twin says the same with
  // IS DISTINCT FROM, which keeps NULL on this side of the filter.
  it('keeps a row whose view is blank', () => {
    assert.equal(pickCardPhoto([row({ filename: 'unknown.jpg', weight: 1, view: null })])?.filename, 'unknown.jpg');
  });

  it('is null when every row is ventral', () => {
    assert.equal(pickCardPhoto([row({ view: 'ventral' })]), null);
  });
});

describe('the genus strip: four across a WHOLE genus', () => {
  const bySlug = {
    'abagrotis-apposita': [row({ species_slug: 'abagrotis-apposita', filename: 'ap-1.jpg', weight: 1 })],
    'abagrotis-baueri': [
      row({ species_slug: 'abagrotis-baueri', filename: 'ba-1.jpg', weight: 2 }),
      row({ species_slug: 'abagrotis-baueri', filename: 'ba-2.jpg', weight: 3 }),
    ],
  };

  // The rule no per-species model predicts, and the one that made three attempts at the
  // hidden-images report wrong: baueri contributes TWO photographs to the strip.
  it('lets one species contribute more than one image', () => {
    const strip = pickGenusStrip(['abagrotis-apposita', 'abagrotis-baueri'], bySlug, (r) => r.filename);
    assert.deepEqual(strip.map((r) => r.filename), ['ap-1.jpg', 'ba-1.jpg', 'ba-2.jpg']);
  });

  it('orders across species by weight, not by species', () => {
    const strip = pickGenusStrip(['abagrotis-baueri', 'abagrotis-apposita'], bySlug, (r) => r.filename);
    assert.equal(strip[0]?.filename, 'ap-1.jpg');
  });

  it('holds at most four', () => {
    const many = { g: Array.from({ length: 9 }, (_, i) => row({ filename: `${i}.jpg`, weight: i })) };
    assert.equal(pickGenusStrip(['g'], many, (r) => r.filename).length, STRIP_SIZE);
  });

  it('de-duplicates by the caller\'s key, for rows that share one', () => {
    const dupes = { g: [row({ filename: 'same.jpg', weight: 1 }), row({ filename: 'same.jpg', weight: 2 })] };
    assert.equal(pickGenusStrip(['g'], dupes, (r) => r.filename).length, 1);
  });

  it('ignores a slug with no images at all', () => {
    assert.deepEqual(pickGenusStrip(['nothing-here'], bySlug, (r) => r.filename), []);
  });

  // Browse excludes ventral shots at EVERY level, not just the species card. taxon.ts
  // filters them in SQL before this picker ever sees them, so this asserts the module's
  // own rule rather than today's behaviour — a Browse picker that left the Browse rule to
  // its caller would put an underside shot in a genus strip the moment the caller changed.
  it('excludes a ventral row even when it is the lightest in the genus', () => {
    const withVentral = {
      g: [
        row({ filename: 'under.jpg', weight: 1, view: 'ventral' }),
        row({ filename: 'top.jpg', weight: 2, view: 'dorsal' }),
      ],
    };
    assert.deepEqual(pickGenusStrip(['g'], withVentral, (r) => r.filename).map((r) => r.filename), ['top.jpg']);
  });

  // Dropped before it claims a de-duplication key, so it cannot suppress the photograph
  // that should be shown in its place.
  it('does not let a ventral row consume the dedup key of a shown one', () => {
    const sameKey = {
      g: [
        row({ filename: 'shared.jpg', weight: 1, view: 'ventral' }),
        row({ filename: 'shared.jpg', weight: 2, view: 'dorsal' }),
      ],
    };
    const strip = pickGenusStrip(['g'], sameKey, (r) => r.filename);
    assert.equal(strip.length, 1);
    assert.equal(strip[0]?.view, 'dorsal');
  });

  // The synthetic high-res fallback rows carry no view at all; a filter that treated
  // "unknown" as ventral would empty the strips for tile-only species.
  it('keeps a row with no view, which is what the high-res fallback rows look like', () => {
    const noView = { g: [{ species_slug: 'x', filename: 'tiles.webp', weight: null }] };
    assert.equal(pickGenusStrip(['g'], noView, (r) => r.filename).length, 1);
  });
});

describe('the higher strips: the first of each genus below', () => {
  it('takes one per genus, in tree order, until full', () => {
    const strips = [['a1', 'a2'], ['b1'], ['c1'], ['d1'], ['e1']];
    assert.deepEqual(pickHigherStrip(strips), ['a1', 'b1', 'c1', 'd1']);
  });

  it('steps over a genus with no images rather than stopping', () => {
    assert.deepEqual(pickHigherStrip([[], ['b1'], [], ['d1']]), ['b1', 'd1']);
  });
});

describe('Identify and similar species: lowest weight, ventral INCLUDED', () => {
  // The point of these two: they differ from the Browse card only in the ventral filter,
  // which is precisely the difference a well-meaning refactor would erase.
  it('will show a ventral photograph when it is the lightest', () => {
    const rows = [row({ filename: 'under.jpg', weight: 1, view: 'ventral' }), row({ filename: 'top.jpg', weight: 2 })];
    assert.equal(pickIdentifyPhoto(rows)?.filename, 'under.jpg');
    assert.equal(pickSimilarPhoto(rows)?.filename, 'under.jpg');
    assert.equal(pickCardPhoto(rows)?.filename, 'top.jpg');
  });

  it('is null for a species with no catalogued photograph', () => {
    assert.equal(pickIdentifyPhoto([]), null);
    assert.equal(pickSimilarPhoto([]), null);
  });
});

describe('the share image: tiles PREFERRED, not mandatory', () => {
  it('takes the tile when there is one', () => {
    const chosen = pickSharePhoto([row()], 'species-tiles/x/A-D_thumbnail.webp');
    assert.deepEqual(chosen, { kind: 'tile', tile: 'species-tiles/x/A-D_thumbnail.webp' });
  });

  // Unlike the account, a species whose tiles are unusable still shows its photographs
  // rather than nothing — 'prefers', not 'replaces'.
  it('falls back to the lowest-weight photograph when there is no tile', () => {
    const chosen = pickSharePhoto([row({ filename: 'b.jpg', weight: 2 }), row({ filename: 'a.jpg', weight: 1 })], null);
    assert.equal(chosen.kind === 'photo' ? chosen.photo.filename : null, 'a.jpg');
  });

  it('reports none when there is neither', () => {
    assert.deepEqual(pickSharePhoto([], null), { kind: 'none' });
  });
});
