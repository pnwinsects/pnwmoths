import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  derivativePath,
  derivativeUrl,
  sourceUrl,
  encodePath,
  VARIANT_EXT,
  type VariantToken,
} from './derivative-url.ts';

const CDN = 'https://moths.pnwinsects.org';

describe('derivativePath', () => {
  it('puts derivatives under the derived/ prefix', () => {
    assert.match(derivativePath('a/b.jpg', '320h'), /^derived\//);
  });

  it('replaces the source extension rather than appending to it', () => {
    assert.equal(derivativePath('habrosyne-scripta/a.jpg', '320h'), 'derived/habrosyne-scripta/a@320h.webp');
  });

  it('emits jpg only for the share-card variant', () => {
    assert.equal(derivativePath('t/x_thumbnail.webp', '1200'), 'derived/t/x_thumbnail@1200.jpg');
    assert.equal(VARIANT_EXT['1200'], 'jpg');
    for (const t of Object.keys(VARIANT_EXT) as VariantToken[]) {
      if (t !== '1200') assert.equal(VARIANT_EXT[t], 'webp', t);
    }
  });

  it('only strips a dot in the final segment', () => {
    assert.equal(derivativePath('a.b/c', '530'), 'derived/a.b/c@530.webp');
  });

  it('leaves the source path unencoded — encoding is derivativeUrl\'s job', () => {
    assert.equal(
      derivativePath('x/Habrosyne scripta-A-D.jpg', '320h'),
      'derived/x/Habrosyne scripta-A-D@320h.webp',
    );
  });
});

describe('encodePath', () => {
  it('encodes spaces but preserves separators', () => {
    assert.equal(encodePath('a b/c d.webp'), 'a%20b/c%20d.webp');
  });

  it('escapes @ to %40, which Bunny decodes back to the same object', () => {
    assert.equal(encodePath('derived/a@320h.webp'), 'derived/a%40320h.webp');
  });
});

describe('derivativeUrl', () => {
  it('builds an absolute CDN URL with the path encoded once', () => {
    assert.equal(
      derivativeUrl(CDN, 'habrosyne-scripta/Habrosyne scripta-A-D.jpg', '320h'),
      `${CDN}/derived/habrosyne-scripta/Habrosyne%20scripta-A-D%40320h.webp`,
    );
  });

  it('never emits an optimizer query string', () => {
    for (const t of Object.keys(VARIANT_EXT) as VariantToken[]) {
      assert.equal(derivativeUrl(CDN, 'a/b.jpg', t).includes('?'), false, t);
    }
  });

  it('distinguishes variants that differ only by size', () => {
    assert.notEqual(derivativeUrl(CDN, 'a/b.webp', '530'), derivativeUrl(CDN, 'a/b.webp', '1060'));
  });
});

describe('sourceUrl', () => {
  it('addresses the stored object, not a derivative', () => {
    assert.equal(sourceUrl(CDN, 'a/b c.jpg'), `${CDN}/a/b%20c.jpg`);
    assert.equal(sourceUrl(CDN, 'a/b.jpg').includes('derived/'), false);
  });
});

// The load-bearing regression test: this helper must agree with the 23,172
// objects actually on the CDN. If the naming convention drifts, every image on
// the site 404s — so pin it against the committed record rather than trusting
// two implementations to stay in step.
describe('agreement with data/image-derivatives.csv (what is really on the CDN)', () => {
  const manifestPath = resolve('data/image-derivatives.csv');

  it('reproduces the recorded derived_path for every variant in the manifest', (t) => {
    if (!existsSync(manifestPath)) return t.skip('manifest not present');
    const rows = parse(readFileSync(manifestPath), { columns: true, skip_empty_lines: true }) as
      Array<{ derived_path: string; source_path: string; variant: string }>;
    assert.ok(rows.length > 20_000, `expected the full manifest, got ${rows.length} rows`);

    // One row per distinct variant is enough to catch a convention change, and
    // keeps the test fast; plus a wide sample for filename-shape coverage.
    const perVariant = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!perVariant.has(row.variant)) perVariant.set(row.variant, row);
    const sample = [...perVariant.values(), ...rows.filter((_, i) => i % 997 === 0)];

    for (const row of sample) {
      assert.equal(
        derivativePath(row.source_path, row.variant as VariantToken),
        row.derived_path,
        `convention drift for ${row.source_path} @${row.variant}`,
      );
    }
  });

  it('covers every variant token the manifest uses', (t) => {
    if (!existsSync(manifestPath)) return t.skip('manifest not present');
    const rows = parse(readFileSync(manifestPath), { columns: true, skip_empty_lines: true }) as
      Array<{ variant: string }>;
    const used = new Set(rows.map((r) => r.variant));
    for (const token of used) {
      assert.ok(token in VARIANT_EXT, `manifest uses variant "${token}" that VARIANT_EXT does not know`);
    }
  });
});
