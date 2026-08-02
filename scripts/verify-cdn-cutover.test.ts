import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROD_ORIGIN,
  expectedContentType,
  extensionOf,
  isSweepable,
  extractCdnUrls,
  buildTargets,
  classify,
  objectUrl,
  selectProbePaths,
  classifyOptimizerProbe,
  type OptimizerProbe,
  type Target,
} from './verify-cdn-cutover.ts';

const PROD = DEFAULT_PROD_ORIGIN;

describe('expectedContentType', () => {
  it('types derivatives from their extension', () => {
    assert.equal(expectedContentType('derived/x/a@320h.webp'), 'image/webp');
    assert.equal(expectedContentType('derived/x/a@1200.jpg'), 'image/jpeg');
  });

  it('is case-insensitive, since curator filenames are not consistent', () => {
    assert.equal(expectedContentType('x/PHOTO.JPG'), 'image/jpeg');
  });

  it('returns null for extensions we only assert presence on', () => {
    assert.equal(expectedContentType('species-tiles/x/A-D.dzi'), null);
  });
});

describe('extensionOf / isSweepable', () => {
  it('only reads a dot in the final segment', () => {
    // Django-era directories contain dots; a bare filename must not borrow one.
    assert.equal(extensionOf('a.b/c'), '');
    assert.equal(extensionOf('a.b/c.webp'), 'webp');
  });

  it('sweeps images and the dzi descriptor the viewer fetches', () => {
    assert.equal(isSweepable('x/a.webp'), true);
    assert.equal(isSweepable('species-tiles/x/A-D.dzi'), true);
  });

  it('does not sweep site assets or extensionless paths', () => {
    assert.equal(isSweepable('css/theme.css'), false);
    assert.equal(isSweepable('assets/bundle.js'), false);
    assert.equal(isSweepable('browse/'), false);
  });
});

describe('extractCdnUrls', () => {
  it('keeps non-derivative CDN URLs, which the derivative guard ignores', () => {
    // The 1500w hero slot and the legacy og:image are exactly where an
    // Optimizer-off surprise can hide, so the sweep must include them.
    const html =
      `<img srcset="${PROD}/derived/x%40530.webp 530w, ${PROD}/species-tiles/x/A-D_thumbnail.webp 1500w">` +
      `<meta content="${PROD}/abagrotis-apposita/Abagrotis%20apposita-A-D.jpg">`;
    assert.deepEqual(extractCdnUrls(html, PROD), [
      `${PROD}/derived/x%40530.webp`,
      `${PROD}/species-tiles/x/A-D_thumbnail.webp`,
      `${PROD}/abagrotis-apposita/Abagrotis%20apposita-A-D.jpg`,
    ]);
  });

  it('ignores other origins', () => {
    assert.deepEqual(extractCdnUrls('<a href="https://example.com/x.jpg">', PROD), []);
  });

  it('does not treat a same-prefix host as ours', () => {
    assert.deepEqual(extractCdnUrls(`<img src="${PROD}.evil.test/x.jpg">`, PROD), []);
  });
});

describe('buildTargets', () => {
  const pages = [{
    page: 'species/x/index.html',
    html:
      `<img src="${PROD}/derived/x/a%40320h.webp">` +
      `<img src="${PROD}/species-tiles/x/A-D_thumbnail.webp">` +
      `<link rel="stylesheet" href="${PROD}/css/theme.css">` +
      `<a href="${PROD}/browse/">Browse</a>`,
  }];

  it('takes derivatives from the manifest, not from the HTML', () => {
    // The manifest is the authority on derivatives; check-derivatives.ts has
    // already proved the HTML agrees with it.
    const targets = buildTargets({ manifestPaths: ['derived/x/a@320h.webp'], pages, prodOrigin: PROD });
    const derivatives = targets.filter((t) => t.bucket === 'derivative');
    assert.deepEqual(derivatives, [{ path: 'derived/x/a@320h.webp', bucket: 'derivative' }]);
  });

  it('sweeps a manifest derivative no page links to', () => {
    // Components build their thumbnail URLs in the browser, so absence from the
    // HTML says nothing about whether the object is needed.
    const targets = buildTargets({ manifestPaths: ['derived/never/linked@320h.webp'], pages, prodOrigin: PROD });
    assert.ok(targets.some((t) => t.path === 'derived/never/linked@320h.webp'));
  });

  it('picks up non-derivative images from the HTML', () => {
    const targets = buildTargets({ manifestPaths: [], pages, prodOrigin: PROD });
    assert.deepEqual(targets, [{ path: 'species-tiles/x/A-D_thumbnail.webp', bucket: 'source' }]);
  });

  it('skips non-image CDN objects — CSS, JS and page URLs', () => {
    // The Optimizer only ever touched images; deploy-smoke.ts covers site assets.
    const targets = buildTargets({ manifestPaths: [], pages, prodOrigin: PROD });
    assert.equal(targets.some((t) => t.path.startsWith('browse')), false);
    assert.equal(targets.some((t) => t.path.endsWith('.css')), false);
  });

  it('decodes percent-encoding to the stored path', () => {
    const encoded = [{ page: 'p.html', html: `<img src="${PROD}/x/Abagrotis%20apposita-A-D.jpg">` }];
    const targets = buildTargets({ manifestPaths: [], pages: encoded, prodOrigin: PROD });
    assert.equal(targets[0]?.path, 'x/Abagrotis apposita-A-D.jpg');
  });

  it('deduplicates and sorts, so two runs are diffable', () => {
    const dupes = [
      { page: 'a.html', html: `<img src="${PROD}/z/b.webp">` },
      { page: 'b.html', html: `<img src="${PROD}/z/b.webp"><img src="${PROD}/a/a.webp">` },
    ];
    const targets = buildTargets({ manifestPaths: [], pages: dupes, prodOrigin: PROD });
    assert.deepEqual(targets.map((t) => t.path), ['a/a.webp', 'z/b.webp']);
  });
});

describe('classify', () => {
  const target: Target = { path: 'derived/x/a@320h.webp', bucket: 'derivative' };

  it('passes a 200 with the right content type', () => {
    assert.equal(classify(target, 200, 'image/webp').verdict, 'ok');
  });

  it('tolerates a charset parameter on the content type', () => {
    assert.equal(classify(target, 200, 'image/webp; charset=binary').verdict, 'ok');
  });

  it('calls a 404 missing — that is a derivative that was never uploaded', () => {
    const r = classify(target, 404, null);
    assert.equal(r.verdict, 'missing');
    assert.match(r.detail ?? '', /404/);
  });

  it('flags a .webp answered as JPEG, which means the object is not what the pipeline thinks', () => {
    const r = classify(target, 200, 'image/jpeg');
    assert.equal(r.verdict, 'wrong-type');
    assert.match(r.detail ?? '', /expected image\/webp/);
  });

  it('accepts any content type where we only assert presence', () => {
    const dzi: Target = { path: 'species-tiles/x/A-D.dzi', bucket: 'source' };
    assert.equal(classify(dzi, 200, 'application/xml').verdict, 'ok');
  });
});

describe('objectUrl', () => {
  it('percent-encodes segments without touching separators', () => {
    assert.equal(
      objectUrl('https://s.b-cdn.net', 'derived/x/Abagrotis apposita-A-D@320h.webp'),
      'https://s.b-cdn.net/derived/x/Abagrotis%20apposita-A-D%40320h.webp',
    );
  });
});

describe('selectProbePaths', () => {
  const targets: Target[] = [
    { path: 'a/1.jpg', bucket: 'source' },
    { path: 'b/2.jpg', bucket: 'source' },
    { path: 'c/3.jpg', bucket: 'source' },
    { path: 'd/4.webp', bucket: 'source' },
    { path: 'derived/e/5@1200.jpg', bucket: 'derivative' },
  ];

  it('probes only legacy JPEG sources — auto-WebP never applied to anything else', () => {
    assert.deepEqual(selectProbePaths(targets, 3), ['a/1.jpg', 'b/2.jpg', 'c/3.jpg']);
  });

  it('never probes a derivative, which is already the stored format', () => {
    assert.equal(selectProbePaths(targets, 5).some((p) => p.startsWith('derived/')), false);
  });

  it('spreads the sample rather than taking the first N', () => {
    const many: Target[] = Array.from({ length: 100 }, (_, i) => ({ path: `s/${i}.jpg`, bucket: 'source' }));
    const picked = selectProbePaths(many, 2);
    assert.deepEqual(picked, ['s/0.jpg', 's/50.jpg']);
  });

  it('returns nothing when probing is switched off', () => {
    assert.deepEqual(selectProbePaths(targets, 0), []);
  });
});


// ---------------------------------------------------------------------------
// classifyOptimizerProbe — the ADR 0022 check (#248)
//
// The sweep proves every object answers 200 with a plausible content type. An
// ACTIVE Optimizer does that too, so the sweep alone can never justify the
// "Optimizer disabled" line this script prints. `?width=100` returning the
// full-size original is what distinguishes disabled from a cached transform;
// byte sizes on their own cannot, because a cached transform is a perfectly
// valid-looking 200.
// ---------------------------------------------------------------------------

describe('classifyOptimizerProbe', () => {
  const res = (status: number, contentType: string | null, length: number | null) =>
    ({ status, contentType, length });
  const probe = (plain: OptimizerProbe['plain'], resized: OptimizerProbe['plain']): OptimizerProbe =>
    ({ plain, resized });

  it('reports disabled when ?width=100 returns the stored object unchanged', () => {
    const out = classifyOptimizerProbe(probe(
      res(200, 'image/jpeg', 1251349),
      res(200, 'image/jpeg', 1251349),
    ));
    assert.equal(out.verdict, 'disabled');
    assert.match(out.detail, /unchanged/);
  });

  it('reports active when ?width=100 comes back smaller — the edge still transforms', () => {
    const out = classifyOptimizerProbe(probe(
      res(200, 'image/jpeg', 1251349),
      res(200, 'image/jpeg', 4210),
    ));
    assert.equal(out.verdict, 'active');
    assert.match(out.detail, /still transforming/);
  });

  it('reports active on a format conversion even at an identical size', () => {
    // Belt and braces: auto-WebP at the same byte count would otherwise read as
    // disabled, and format conversion is the dependency ADR 0022 calls the one
    // most likely to be missed.
    const out = classifyOptimizerProbe(probe(
      res(200, 'image/jpeg', 100000),
      res(200, 'image/webp', 100000),
    ));
    assert.equal(out.verdict, 'active');
    assert.match(out.detail, /converted format/);
  });

  it('is inconclusive rather than wrong when either probe is not 200', () => {
    assert.equal(classifyOptimizerProbe(probe(
      res(200, 'image/jpeg', 100), res(404, null, null),
    )).verdict, 'inconclusive');
    assert.equal(classifyOptimizerProbe(probe(
      res(500, null, null), res(200, 'image/jpeg', 100),
    )).verdict, 'inconclusive');
  });

  it('is inconclusive when the origin omits content-length', () => {
    const out = classifyOptimizerProbe(probe(
      res(200, 'image/jpeg', null),
      res(200, 'image/jpeg', null),
    ));
    assert.equal(out.verdict, 'inconclusive');
    assert.match(out.detail, /content-length/);
  });

  it('never returns disabled without having compared two real responses', () => {
    // The property that matters: no input short of a genuine match may produce
    // the verdict that lets the script claim the cutover is verified.
    const notOk: OptimizerProbe[] = [
      probe(res(200, 'image/jpeg', 10), res(200, 'image/jpeg', 9)),
      probe(res(200, 'image/jpeg', 10), res(200, 'image/webp', 10)),
      probe(res(200, 'image/jpeg', null), res(200, 'image/jpeg', null)),
      probe(res(403, null, null), res(403, null, null)),
    ];
    for (const p of notOk) assert.notEqual(classifyOptimizerProbe(p).verdict, 'disabled');
  });
});

describe('selectProbePaths as the Optimizer probe source', () => {
  it('yields a single legacy JPEG for the ADR 0022 check', () => {
    const targets: Target[] = [
      { path: 'derived/x/a@320h.webp', bucket: 'derivative' },
      { path: 'clostera-brucei/Clostera brucei-C-D.jpg', bucket: 'source' },
    ];
    assert.deepEqual(selectProbePaths(targets, 1), ['clostera-brucei/Clostera brucei-C-D.jpg']);
  });

  it('yields nothing when no legacy JPEG is in scope, so the run reports UNVERIFIED', () => {
    const targets: Target[] = [{ path: 'derived/x/a@320h.webp', bucket: 'derivative' }];
    assert.deepEqual(selectProbePaths(targets, 1), []);
  });
});
