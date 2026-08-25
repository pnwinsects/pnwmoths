// src/_lib/photo-display-index.test.ts
// Guards for the inverse index — "where does this photograph appear" (#338).
//
// The index is what data/hidden-images-report.csv reports from, and the failure that
// matters is UNDER-reporting: a photograph the index misses is one the report calls
// invisible, which sends the curator to rule on something he can already see. That is
// what happened in #299, twice, and every case below is a shape that produced it:
//
//   - a second photograph from the same species in a genus strip
//   - a thumbnail on ANOTHER species' page (similar_species)
//   - a photograph on a tiled species, absent from its own account and present elsewhere
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDisplayIndex, photoKey, formatIndexSurfaces, type IndexSurface } from './photo-display-index.ts';

const IMAGES = {
  'phyllodesma-americana': [
    { filename: 'Phyllodesma americana-A-D.jpg', weight: 1 },
    { filename: 'Phyllodesma coturnix-C-D.jpg', weight: 3 },
  ],
  'apantesis-margo': [{ filename: 'Grammia margo-C-D.jpg', weight: 1 }],
};

function surfaces(index: ReturnType<typeof buildDisplayIndex>, slug: string, filename: string): string {
  return formatIndexSurfaces(index.get(photoKey(slug, filename)));
}

describe('browse comes from the tree the page renders', () => {
  it('records a species card image', () => {
    const index = buildDisplayIndex({
      browseTree: [{
        genera: [{
          species: [{ slug: 'apantesis-margo', navImage: { species_slug: 'apantesis-margo', filename: 'Grammia margo-C-D.jpg' } }],
        }],
      }],
      keySpecies: [],
      accounts: [],
      imagesBySlug: IMAGES,
    });
    assert.equal(surfaces(index, 'apantesis-margo', 'Grammia margo-C-D.jpg'), 'browse');
  });

  // The coturnix case: a genus strip carries a SECOND photograph of a species, one no
  // per-species rule predicts. Reading the tree rather than re-deriving it is what makes
  // this fall out for free.
  it('records a strip image the species\' own card never names', () => {
    const index = buildDisplayIndex({
      browseTree: [{
        subfamilies: [{
          tribes: [{
            genera: [{
              navImages: [
                { species_slug: 'phyllodesma-americana', filename: 'Phyllodesma americana-A-D.jpg' },
                { species_slug: 'phyllodesma-americana', filename: 'Phyllodesma coturnix-C-D.jpg' },
              ],
              species: [{ slug: 'phyllodesma-americana', navImage: { species_slug: 'phyllodesma-americana', filename: 'Phyllodesma americana-A-D.jpg' } }],
            }],
          }],
        }],
      }],
      keySpecies: [],
      accounts: [],
      imagesBySlug: IMAGES,
    });
    assert.equal(surfaces(index, 'phyllodesma-americana', 'Phyllodesma coturnix-C-D.jpg'), 'browse');
  });

  // Synthetic high-res rows stand in for species with no images.csv row at all; they are
  // tile thumbnails, and recording one as a catalogued photograph would invent a display.
  it('ignores a nav image with no filename', () => {
    const index = buildDisplayIndex({
      browseTree: [{ genera: [{ navImages: [{ species_slug: 'tiles-only' }] }] }],
      keySpecies: [],
      accounts: [],
      imagesBySlug: {},
    });
    assert.equal(index.size, 0);
  });
});

describe('identify comes from the committed key matrix', () => {
  it('records the nav_image the key ships', () => {
    const index = buildDisplayIndex({
      browseTree: [],
      keySpecies: [{ slug: 'apantesis-margo', nav_image: 'Grammia margo-C-D.jpg' }],
      accounts: [],
      imagesBySlug: IMAGES,
    });
    assert.equal(surfaces(index, 'apantesis-margo', 'Grammia margo-C-D.jpg'), 'identify');
  });

  it('records nothing for a key entry with no image', () => {
    const index = buildDisplayIndex({
      browseTree: [],
      keySpecies: [{ slug: 'apantesis-margo', nav_image: null }],
      accounts: [],
      imagesBySlug: IMAGES,
    });
    assert.equal(index.size, 0);
  });
});

describe('account and similar are per built page', () => {
  it('records every photograph on an untiled account', () => {
    const index = buildDisplayIndex({
      browseTree: [],
      keySpecies: [],
      accounts: [{ slug: 'phyllodesma-americana', similarSlugs: [], tiled: false }],
      imagesBySlug: IMAGES,
    });
    assert.equal(surfaces(index, 'phyllodesma-americana', 'Phyllodesma americana-A-D.jpg'), 'account');
    assert.equal(surfaces(index, 'phyllodesma-americana', 'Phyllodesma coturnix-C-D.jpg'), 'account');
  });

  it('records NONE of them when the account is tiled', () => {
    const index = buildDisplayIndex({
      browseTree: [],
      keySpecies: [],
      accounts: [{ slug: 'phyllodesma-americana', similarSlugs: [], tiled: true }],
      imagesBySlug: IMAGES,
    });
    assert.equal(index.size, 0);
  });

  // The thumbnail belongs to the OTHER species and renders on this page — which is how a
  // photograph stays visible while its own account shows tiles instead of it.
  it('credits a similar-species thumbnail to the species it depicts', () => {
    const index = buildDisplayIndex({
      browseTree: [],
      keySpecies: [],
      accounts: [{ slug: 'phyllodesma-americana', similarSlugs: ['apantesis-margo'], tiled: true }],
      imagesBySlug: IMAGES,
    });
    assert.equal(surfaces(index, 'apantesis-margo', 'Grammia margo-C-D.jpg'), 'similar');
  });

  it('uses the lowest-weight photograph for that thumbnail', () => {
    const index = buildDisplayIndex({
      browseTree: [],
      keySpecies: [],
      accounts: [{ slug: 'apantesis-margo', similarSlugs: ['phyllodesma-americana'], tiled: false }],
      imagesBySlug: IMAGES,
    });
    assert.equal(surfaces(index, 'phyllodesma-americana', 'Phyllodesma americana-A-D.jpg'), 'similar');
    assert.equal(surfaces(index, 'phyllodesma-americana', 'Phyllodesma coturnix-C-D.jpg'), '');
  });
});

describe('a photograph on several surfaces', () => {
  it('accumulates them all', () => {
    const index = buildDisplayIndex({
      browseTree: [{ genera: [{ navImages: [{ species_slug: 'apantesis-margo', filename: 'Grammia margo-C-D.jpg' }] }] }],
      keySpecies: [{ slug: 'apantesis-margo', nav_image: 'Grammia margo-C-D.jpg' }],
      accounts: [
        { slug: 'apantesis-margo', similarSlugs: [], tiled: false },
        { slug: 'phyllodesma-americana', similarSlugs: ['apantesis-margo'], tiled: false },
      ],
      imagesBySlug: IMAGES,
    });
    assert.equal(surfaces(index, 'apantesis-margo', 'Grammia margo-C-D.jpg'), 'browse identify similar account');
  });

  it('renders in a fixed order, and can exclude the row\'s own account', () => {
    const all = new Set<IndexSurface>(['account', 'similar', 'browse']);
    assert.equal(formatIndexSurfaces(all), 'browse similar account');
    assert.equal(formatIndexSurfaces(all, ['account']), 'browse similar');
    assert.equal(formatIndexSurfaces(undefined), '');
    assert.equal(formatIndexSurfaces(new Set()), '');
  });
});
