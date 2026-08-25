// scripts/check-display-index.test.ts
// Guards for the gate that holds the display index to the emitted HTML (#338).
//
// A gate exercised only by the thing it guards is a gate nobody has checked — and this
// one's whole job is to fail. Both directions are tested explicitly, because they are
// different bugs with different victims:
//
//   missing  the site shows what the index does not predict → the hidden-images report
//            calls a visible photograph invisible. This is the #299 failure, the one that
//            put six photographs in front of the curator that were on /browse/ already.
//   extra    the index predicts what the site does not show → the report calls an
//            invisible photograph visible, and quietly drops it from a report whose whole
//            premise is completeness.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareDisplay, describeDisagreement } from './check-display-index.ts';
import { photoKey, type IndexSurface } from '../src/_lib/photo-display-index.ts';
import { thumbnailKey, type ThumbnailSurface } from './lib/site-scan.ts';

const PHOTO = { slug: 'apantesis-margo', filename: 'Grammia margo-C-D.jpg' };

function predicted(...s: IndexSurface[]): Map<string, Set<IndexSurface>> {
  return new Map([[photoKey(PHOTO.slug, PHOTO.filename), new Set(s)]]);
}
function observed(...s: ThumbnailSurface[]): Map<string, Set<ThumbnailSurface>> {
  return new Map([[thumbnailKey(PHOTO.slug, PHOTO.filename), new Set(s)]]);
}

describe('compareDisplay', () => {
  it('is silent when the index and the site agree', () => {
    assert.deepEqual(compareDisplay(predicted('browse', 'identify'), observed('browse', 'identify'), [PHOTO]), []);
  });

  it('is silent about a photograph shown nowhere and predicted nowhere', () => {
    assert.deepEqual(compareDisplay(new Map(), new Map(), [PHOTO]), []);
  });

  it('reports a surface the site shows and the index missed', () => {
    const [d] = compareDisplay(predicted('browse'), observed('browse', 'similar'), [PHOTO]);
    assert.deepEqual(d?.missing, ['similar']);
    assert.deepEqual(d?.extra, []);
  });

  it('reports a surface the index predicted and the site does not show', () => {
    const [d] = compareDisplay(predicted('browse', 'identify'), observed('browse'), [PHOTO]);
    assert.deepEqual(d?.extra, ['identify']);
    assert.deepEqual(d?.missing, []);
  });

  it('catches a photograph the index has no entry for at all', () => {
    const [d] = compareDisplay(new Map(), observed('browse'), [PHOTO]);
    assert.deepEqual(d?.missing, ['browse']);
  });

  // `account` is invisible to the scan by design — it labels a species' own page and then
  // skips it — so comparing on it would fail every tiled species on every build.
  it('ignores the account surface, which the scan deliberately does not report', () => {
    assert.deepEqual(compareDisplay(predicted('account'), new Map(), [PHOTO]), []);
  });

  // 'other' is the scan's escape hatch for a filename found on a page that is none of the
  // three surfaces. It has never fired; if it does, that is not a wrong prediction.
  it('ignores the scan-only "other" surface', () => {
    assert.deepEqual(compareDisplay(new Map(), observed('other'), [PHOTO]), []);
  });

  it('checks every photograph it is given, not only the ones with entries', () => {
    const photos = [PHOTO, { slug: 'zzz-none', filename: 'z.jpg' }];
    assert.equal(compareDisplay(predicted('browse'), observed('browse'), photos).length, 0);
  });
});

describe('describeDisagreement', () => {
  it('names the photograph and both directions', () => {
    const text = describeDisagreement({ slug: PHOTO.slug, filename: PHOTO.filename, missing: ['browse'], extra: ['identify'] });
    assert.match(text, /apantesis-margo/);
    assert.match(text, /Grammia margo-C-D\.jpg/);
    assert.match(text, /shown on browse but not predicted/);
    assert.match(text, /predicted on identify but not shown/);
  });
});
