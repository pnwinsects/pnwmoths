import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isImagePath,
  queryPattern,
  classifyRequests,
  auditDates,
  renderReport,
} from './audit-optimizer-usage.ts';

function entry(path: string, bytesSent = 1000): {
  path: string; url: string; statusCode: number; bytesSent: number;
} {
  return { path, url: `https://moths.pnwinsects.org${path}`, statusCode: 200, bytesSent };
}

describe('isImagePath', () => {
  it('accepts the extensions the Optimizer can act on', () => {
    for (const p of ['/a/b.jpg', '/a/b.JPEG', '/a/b.webp', '/a/b.png', '/a/b.avif']) {
      assert.equal(isImagePath(p), true, p);
    }
  });

  it('rejects pages, data and tiles metadata', () => {
    for (const p of ['/species/abagrotis-apposita/', '/data/x.parquet', '/x.dzi', '/no-extension']) {
      assert.equal(isImagePath(p), false, p);
    }
  });
});

describe('queryPattern', () => {
  it('sorts keys so param order does not split one pattern in two', () => {
    assert.equal(queryPattern('height=225&width=188&crop_gravity=north'), 'crop_gravity=north&height=225&width=188');
    assert.equal(queryPattern('width=188&crop_gravity=north&height=225'), 'crop_gravity=north&height=225&width=188');
  });

  it('preserves values — each width is a distinct derivative', () => {
    assert.notEqual(queryPattern('width=530'), queryPattern('width=1060'));
  });

  it('drops cache-busters, which are not transforms', () => {
    assert.equal(queryPattern('v=3'), '');
    assert.equal(queryPattern('width=530&v=3'), 'width=530');
  });
});

describe('classifyRequests', () => {
  it('separates bare image requests (auto-WebP exposure) from transformed ones', () => {
    const report = classifyRequests([
      entry('/habrosyne-scripta/a.jpg', 118_963),
      entry('/habrosyne-scripta/b.jpg', 100_000),
      entry('/habrosyne-scripta/a.jpg?height=320', 45_682),
    ]);
    assert.equal(report.imageRequests, 3);
    assert.equal(report.withoutQuery, 2);
    assert.equal(report.withQuery, 1);
    assert.equal(report.bytesWithoutQuery, 218_963);
  });

  it('ignores non-image requests entirely', () => {
    const report = classifyRequests([entry('/species/x/'), entry('/redirect.html?from=/old')]);
    assert.equal(report.imageRequests, 0);
    assert.equal(report.patterns.length, 0);
  });

  it('marks every pattern in the ADR 0022 matrix as expected', () => {
    const report = classifyRequests([
      entry('/species-tiles/x/A-D_thumbnail.webp?width=530'),
      entry('/species-tiles/x/A-D_thumbnail.webp?width=1060'),
      entry('/species-tiles/x/A-D_thumbnail.webp?width=1500'),
      entry('/x/y.jpg?height=186'),
      entry('/x/y.jpg?height=320'),
      entry('/glossary/g.jpg?width=188&height=225&crop_gravity=north'),
      entry('/glossary/g.jpg?width=376&height=450&crop_gravity=north'),
      entry('/species-tiles/x/A-D_thumbnail.webp?width=1200&format=jpg'),
    ]);
    assert.deepEqual(report.unexpected, [], 'known call sites must not report as unexpected');
    assert.equal(report.patterns.length, 8);
  });

  it('flags a transform the migration does not account for', () => {
    const report = classifyRequests([entry('/x/y.jpg?width=800&blur=5')]);
    assert.equal(report.unexpected.length, 1);
    assert.equal(report.unexpected[0]?.pattern, 'blur=5&width=800');
  });

  it('counts distinct files per pattern, not just requests', () => {
    const report = classifyRequests([
      entry('/x/a.jpg?height=320'),
      entry('/x/a.jpg?height=320'),
      entry('/x/b.jpg?height=320'),
    ]);
    const stat = report.patterns.find((p) => p.pattern === 'height=320');
    assert.equal(stat?.requests, 3);
    assert.equal(stat?.distinctPaths, 2);
  });

  it('ranks patterns by request volume', () => {
    const report = classifyRequests([
      entry('/x/a.jpg?height=186'),
      entry('/x/a.jpg?height=320'),
      entry('/x/b.jpg?height=320'),
    ]);
    assert.equal(report.patterns[0]?.pattern, 'height=320');
  });
});

describe('auditDates', () => {
  it('returns the requested span oldest-first, ending today (UTC)', () => {
    assert.deepEqual(
      auditDates(3, new Date('2026-08-01T12:00:00Z')),
      ['2026-07-30', '2026-07-31', '2026-08-01'],
    );
  });

  it('crosses a month boundary correctly', () => {
    assert.deepEqual(auditDates(2, new Date('2026-03-01T00:30:00Z')), ['2026-02-28', '2026-03-01']);
  });
});

describe('renderReport', () => {
  it('states the all-clear when nothing unexpected appears', () => {
    const out = renderReport(classifyRequests([entry('/x/y.jpg?height=320')]), ['2026-08-01']);
    assert.match(out, /No unexpected patterns/);
  });

  it('names each unexpected pattern with a sample path so it can be chased down', () => {
    const out = renderReport(classifyRequests([entry('/x/y.jpg?width=800&blur=5')]), ['2026-08-01']);
    assert.match(out, /UNEXPECTED/);
    assert.match(out, /blur=5&width=800/);
    assert.match(out, /\/x\/y\.jpg/);
  });
});
