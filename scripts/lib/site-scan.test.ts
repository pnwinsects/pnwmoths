// scripts/lib/site-scan.test.ts
// Guards for reading the BUILT site (#338).
//
// These moved here from the hidden-images report's own suite when the report stopped
// scanning `_site/` and started asking src/_lib/photo-display-index.ts instead. The scan
// did not become less important in that move — it became the CHECK. It is what
// scripts/check-display-index.ts holds the index to on every build, so if these
// behaviours drift, the thing that catches a wrong model is what breaks.
//
// They exist in the first place because the first version of that report PREDICTED where
// a photograph was shown, by reimplementing three consumers' orderings, and got it wrong:
// six photographs were called invisible while they were on /browse/ and Identify cards.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  extractImageReferences,
  surfaceOf,
  scanBuiltSite,
  describeIncompleteSite,
  formatSurfaces,
  thumbnailKey,
} from './site-scan.ts';

// These exist because the first version of this report PREDICTED where a photograph is
// shown, by reimplementing three consumers' orderings, and got it wrong — it called six
// photographs invisible while they were on /browse/ and Identify cards. The scan reads
// the emitted bytes instead. See scanBuiltSite()'s comment.

describe('extractImageReferences', () => {
  it('finds a raw filename, as the browse payload and key matrix carry it', () => {
    const found = extractImageReferences('{"filename":"Grammia margo-C-D.jpg","x":1}');
    assert.ok(found.has('Grammia margo-C-D.jpg'));
  });

  it('normalizes a percent-encoded derivative back to its source filename', () => {
    const found = extractImageReferences('<img src="/derived/x/Grammia%20margo-C-D%40320h.webp">');
    assert.ok(found.has('Grammia margo-C-D.jpg'), [...found].join(','));
  });

  it('finds both forms of the same photograph on one page', () => {
    const found = extractImageReferences(
      '"Euxoa absona A-D.jpg" <img src="Euxoa%20absona%20A-D%40530.webp">',
    );
    assert.deepEqual([...found], ['Euxoa absona A-D.jpg']);
  });

  it('survives a stem that is not valid percent-encoding', () => {
    assert.doesNotThrow(() => extractImageReferences('bad%ZZ%40320h.webp'));
  });
});

describe('surfaceOf', () => {
  it('classifies the three surfaces that display another species\' photograph', () => {
    assert.equal(surfaceOf('browse/index.html', 'apantesis-margo'), 'browse');
    assert.equal(surfaceOf('identify/index.html', 'apantesis-margo'), 'identify');
    assert.equal(surfaceOf('key-matrix.json', 'apantesis-margo'), 'identify');
    assert.equal(surfaceOf('species/other-species/index.html', 'apantesis-margo'), 'similar');
  });

  // The row's own account is where it is EXPECTED to be absent; counting it would make
  // every displayed photograph look like it was displayed somewhere else.
  it('calls the photograph\'s own account page "account", not a surface', () => {
    assert.equal(surfaceOf('species/apantesis-margo/index.html', 'apantesis-margo'), 'account');
  });
});

describe('scanBuiltSite', () => {
  const images = [{ slug: 'apantesis-margo', filename: 'Grammia margo-C-D.jpg' }];

  it('records a photograph found on browse', () => {
    const { use } = scanBuiltSite(
      [{ path: 'browse/index.html', content: '"Grammia margo-C-D.jpg"' }],
      images,
    );
    assert.equal(formatSurfaces(use.get(thumbnailKey('apantesis-margo', 'Grammia margo-C-D.jpg'))), 'browse');
  });

  it('merges surfaces across files and renders them in a stable order', () => {
    const { use } = scanBuiltSite(
      [
        { path: 'species/zzz/index.html', content: 'Grammia%20margo-C-D%40320h.webp' },
        { path: 'browse/index.html', content: '"Grammia margo-C-D.jpg"' },
        { path: 'key-matrix.json', content: '"Grammia margo-C-D.jpg"' },
      ],
      images,
    );
    assert.equal(
      formatSurfaces(use.get(thumbnailKey('apantesis-margo', 'Grammia margo-C-D.jpg'))),
      'browse identify similar',
    );
  });

  it('ignores the photograph\'s own account page', () => {
    const { use } = scanBuiltSite(
      [{ path: 'species/apantesis-margo/index.html', content: '"Grammia margo-C-D.jpg"' }],
      images,
    );
    assert.equal(use.size, 0);
  });

  it('reports nothing for a photograph the built site never references', () => {
    const { use } = scanBuiltSite([{ path: 'browse/index.html', content: 'nothing here' }], images);
    assert.equal(use.size, 0);
  });

  // One filename can be catalogued under more than one slug; each gets its own answer.
  it('attributes a shared filename to every slug that carries it', () => {
    const { use } = scanBuiltSite(
      [{ path: 'browse/index.html', content: '"Shared-A-D.jpg"' }],
      [{ slug: 'aaa-one', filename: 'Shared-A-D.jpg' }, { slug: 'bbb-two', filename: 'Shared-A-D.jpg' }],
    );
    assert.equal(use.size, 2);
  });

  // `referenced` is the sanity floor, so it must count a photograph found ONLY on its own
  // account — that page is proof the site was built, even though it sets no surface.
  it('counts a photograph referenced only by its own account as referenced', () => {
    const { use, referenced } = scanBuiltSite(
      [{ path: 'species/apantesis-margo/index.html', content: '"Grammia margo-C-D.jpg"' }],
      images,
    );
    assert.equal(use.size, 0);
    assert.deepEqual([...referenced], ['Grammia margo-C-D.jpg']);
  });

  it('leaves `referenced` empty for a site that references nothing catalogued', () => {
    const { referenced } = scanBuiltSite(
      [{ path: 'browse/index.html', content: '<html>no images</html>' }],
      images,
    );
    assert.equal(referenced.size, 0);
  });
});

describe('formatSurfaces', () => {
  it('is empty for a photograph shown nowhere', () => {
    assert.equal(formatSurfaces(undefined), '');
    assert.equal(formatSurfaces(new Set()), '');
  });
});

describe('describeIncompleteSite', () => {
  // The guard exists because an empty _site/ ran to completion, exit 0, reporting every
  // photograph as invisible — the same defect class this report was twice wrong about.
  function buildSite(pages: number, omit: string[] = []): string {
    const dir = mkdtempSync(join(tmpdir(), 'site-'));
    for (const file of ['browse/index.html', 'identify/index.html', 'key-matrix.json']) {
      if (omit.includes(file)) continue;
      mkdirSync(join(dir, dirname(file)), { recursive: true });
      writeFileSync(join(dir, file), 'x');
    }
    for (let i = 0; i < pages; i++) {
      mkdirSync(join(dir, 'species', `sp-${i}`), { recursive: true });
      writeFileSync(join(dir, 'species', `sp-${i}`, 'index.html'), 'x');
    }
    return dir;
  }

  it('accepts a site with every surface and enough species pages', () => {
    assert.equal(describeIncompleteSite(buildSite(3), 3), null);
  });

  it('rejects an empty directory, which existsSync would have accepted', () => {
    const problem = describeIncompleteSite(mkdtempSync(join(tmpdir(), 'site-')), 3);
    assert.match(problem ?? '', /not a built site/);
  });

  it('names the surface that is missing', () => {
    assert.match(describeIncompleteSite(buildSite(3, ['identify/index.html']), 3) ?? '', /identify/);
    assert.match(describeIncompleteSite(buildSite(3, ['key-matrix.json']), 3) ?? '', /key-matrix/);
  });

  it('rejects a build with fewer species pages than the gates allow', () => {
    const problem = describeIncompleteSite(buildSite(2), 3);
    assert.match(problem ?? '', /2 species pages but the visibility gates allow 3/);
  });

  // More pages than expected is not this guard's business — the deploy is additive and a
  // leftover page is #273's problem, not a reason to refuse to report.
  it('accepts a site with more species pages than expected', () => {
    assert.equal(describeIncompleteSite(buildSite(5), 3), null);
  });

  it('does not mistake a species directory with no index.html for a page', () => {
    const dir = buildSite(2);
    mkdirSync(join(dir, 'species', 'sp-empty'), { recursive: true });
    assert.match(describeIncompleteSite(dir, 3) ?? '', /2 species pages/);
  });
});
