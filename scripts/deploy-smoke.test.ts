import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectUrls, formatResult, DEFAULT_CDN_ORIGIN } from './deploy-smoke.ts';
import type { SmokeResult } from './deploy-smoke.ts';

// ---------------------------------------------------------------------------
// selectUrls
// ---------------------------------------------------------------------------

describe('selectUrls', () => {
  it('returns explicit URLs split by comma', () => {
    const result = selectUrls([], 5, 'browse/index.html, about/index.html');
    assert.deepEqual(result, ['browse/index.html', 'about/index.html']);
  });

  it('trims whitespace and drops empty entries from explicit list', () => {
    const result = selectUrls([], 5, ' a.html , , b.html ');
    assert.deepEqual(result, ['a.html', 'b.html']);
  });

  it('filters to .html files when no explicit list', () => {
    const files = ['style.css', 'index.html', 'app.js', 'about/index.html'];
    const result = selectUrls(files, 10);
    assert.deepEqual(result, ['about/index.html', 'index.html']);
  });

  it('returns all HTML files when count is at or below sample size', () => {
    const files = ['a.html', 'b.html', 'c.html'];
    assert.deepEqual(selectUrls(files, 5), ['a.html', 'b.html', 'c.html']);
    assert.deepEqual(selectUrls(files, 3), ['a.html', 'b.html', 'c.html']);
  });

  it('returns a deterministic evenly-spaced sample when HTML count exceeds sample', () => {
    const files = Array.from({ length: 20 }, (_, i) => `page${String(i).padStart(2, '0')}.html`);
    const result = selectUrls(files, 5);
    assert.equal(result.length, 5);
    // Same input → same output
    assert.deepEqual(result, selectUrls(files, 5));
    // All results are from the original list
    for (const r of result) {
      assert.ok(files.includes(r), `${r} should be in the file list`);
    }
  });

  it('returns empty array when no HTML files exist', () => {
    assert.deepEqual(selectUrls(['app.js', 'style.css'], 5), []);
  });
});

// ---------------------------------------------------------------------------
// formatResult
// ---------------------------------------------------------------------------

describe('formatResult', () => {
  it('shows ✓ for a passing result', () => {
    const r: SmokeResult = {
      url: 'https://example.com/index.html',
      relPath: 'index.html',
      ok: true,
      cacheControl: 'no-cache',
      cdnCache: 'MISS',
      cacheControlOk: true,
      contentOk: true,
      expectedHash: 'abc123',
      actualHash: 'abc123',
    };
    const out = formatResult(r);
    assert.ok(out.includes('✓'));
    assert.ok(out.includes('index.html'));
  });

  it('shows ✗ and cache-control detail for a cache-control failure', () => {
    const r: SmokeResult = {
      url: 'https://example.com/browse/index.html',
      relPath: 'browse/index.html',
      ok: false,
      cacheControl: 'public, max-age=2592000',
      cdnCache: 'HIT',
      cacheControlOk: false,
      contentOk: true,
      expectedHash: 'abc123',
      actualHash: 'abc123',
    };
    const out = formatResult(r);
    assert.ok(out.includes('✗'));
    assert.ok(out.includes('max-age=2592000'));
    assert.ok(out.includes('expected no-cache'));
  });

  it('shows ✗ and hash detail for a content mismatch', () => {
    const r: SmokeResult = {
      url: 'https://example.com/about/index.html',
      relPath: 'about/index.html',
      ok: false,
      cacheControl: 'no-cache',
      cdnCache: null,
      cacheControlOk: true,
      contentOk: false,
      expectedHash: 'aaaa11112222',
      actualHash: 'bbbb33334444',
    };
    const out = formatResult(r);
    assert.ok(out.includes('✗'));
    assert.ok(out.includes('content mismatch'));
    assert.ok(out.includes('aaaa11112222'));
    assert.ok(out.includes('bbbb33334444'));
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CDN_ORIGIN
// ---------------------------------------------------------------------------

describe('DEFAULT_CDN_ORIGIN', () => {
  it('points to the production CDN', () => {
    assert.equal(DEFAULT_CDN_ORIGIN, 'https://moths.pnwinsects.org');
  });
});
