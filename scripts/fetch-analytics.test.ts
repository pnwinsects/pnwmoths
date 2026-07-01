import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDate,
  isPageview,
  stripQueryString,
  extractRefererDomain,
  aggregate,
} from './fetch-analytics.ts';

// ---------------------------------------------------------------------------
// Helper to build a minimal log entry for testing
// ---------------------------------------------------------------------------

function entry(overrides: Record<string, unknown> = {}): {
  timestamp: string;
  statusCode: number;
  path: string;
  url: string;
  countryCode: string | null;
  referer: string | null;
  userAgent: string | null;
  cacheStatus: string;
  bytesSent: number;
  scheme: string;
  host: string;
} {
  return {
    timestamp: '2026-06-29T14:00:00.000Z',
    statusCode: 200,
    path: '/species/acronicta-americana/',
    url: 'https://moths.pnwinsects.org/species/acronicta-americana/',
    countryCode: 'US',
    referer: null,
    userAgent: 'Mozilla/5.0',
    cacheStatus: 'HIT',
    bytesSent: 5000,
    scheme: 'https',
    host: 'moths.pnwinsects.org',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveDate
// ---------------------------------------------------------------------------

describe('resolveDate', () => {
  it('parses a valid YYYY-MM-DD override', () => {
    assert.equal(resolveDate('2026-06-29'), '2026-06-29');
  });

  it('rejects invalid date format', () => {
    assert.throws(() => resolveDate('June 29'), /Invalid ANALYTICS_DATE/);
  });

  it('defaults to yesterday UTC when no override', () => {
    const result = resolveDate();
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// stripQueryString
// ---------------------------------------------------------------------------

describe('stripQueryString', () => {
  it('strips query string', () => {
    assert.equal(stripQueryString('/page?foo=bar'), '/page');
  });

  it('strips fragment', () => {
    assert.equal(stripQueryString('/page#section'), '/page');
  });

  it('strips both (query first)', () => {
    assert.equal(stripQueryString('/page?foo=1#sec'), '/page');
  });

  it('leaves clean paths unchanged', () => {
    assert.equal(stripQueryString('/species/acronicta-americana/'), '/species/acronicta-americana/');
  });
});

// ---------------------------------------------------------------------------
// isPageview
// ---------------------------------------------------------------------------

describe('isPageview', () => {
  it('counts a 200 species page as a pageview', () => {
    assert.equal(isPageview(entry()), true);
  });

  it('rejects 404 responses', () => {
    assert.equal(isPageview(entry({ statusCode: 404 })), false);
  });

  it('rejects 301 redirects', () => {
    assert.equal(isPageview(entry({ statusCode: 301 })), false);
  });

  it('rejects CSS files', () => {
    assert.equal(isPageview(entry({ path: '/css/theme.css' })), false);
  });

  it('rejects JS files', () => {
    assert.equal(isPageview(entry({ path: '/components/main.js' })), false);
  });

  it('rejects image files', () => {
    assert.equal(isPageview(entry({ path: '/images/header.png' })), false);
  });

  it('rejects pagefind assets', () => {
    assert.equal(isPageview(entry({ path: '/pagefind/pagefind.js' })), false);
  });

  it('rejects Parquet data files', () => {
    assert.equal(isPageview(entry({ path: '/species/acronicta-americana/records.parquet' })), false);
  });

  it('rejects tiles', () => {
    assert.equal(isPageview(entry({ path: '/tiles/acronicta-americana/0/0_0.jpg' })), false);
  });

  it('counts root as a pageview', () => {
    assert.equal(isPageview(entry({ path: '/' })), true);
  });

  it('counts browse page as a pageview', () => {
    assert.equal(isPageview(entry({ path: '/browse/' })), true);
  });

  it('strips query string before checking extension', () => {
    assert.equal(isPageview(entry({ path: '/species/foo/?ref=google' })), true);
  });

  it('rejects asset with query string', () => {
    assert.equal(isPageview(entry({ path: '/images/header.png?v=123' })), false);
  });
});

// ---------------------------------------------------------------------------
// extractRefererDomain
// ---------------------------------------------------------------------------

describe('extractRefererDomain', () => {
  it('extracts domain from full URL', () => {
    assert.equal(extractRefererDomain('https://www.google.com/search?q=moths', 'moths.pnwinsects.org'), 'www.google.com');
  });

  it('returns null for self-referral', () => {
    assert.equal(extractRefererDomain('https://moths.pnwinsects.org/browse/', 'moths.pnwinsects.org'), null);
  });

  it('returns null for www self-referral', () => {
    assert.equal(extractRefererDomain('https://www.moths.pnwinsects.org/browse/', 'moths.pnwinsects.org'), null);
  });

  it('returns null for empty referer', () => {
    assert.equal(extractRefererDomain(null, 'moths.pnwinsects.org'), null);
  });

  it('returns null for invalid URL', () => {
    assert.equal(extractRefererDomain('not-a-url', 'moths.pnwinsects.org'), null);
  });
});

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------

describe('aggregate', () => {
  const date = '2026-06-29';
  const from = `${date}T00:00:00Z`;
  const to = `${date}T23:59:59.999Z`;

  it('produces correct schema_version', () => {
    const result = aggregate([], date, from, to);
    assert.equal(result.schema_version, 1);
  });

  it('counts total requests', () => {
    const entries = [entry(), entry(), entry({ statusCode: 404 })];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.total_requests, 3);
  });

  it('counts only qualifying pageviews', () => {
    const entries = [
      entry(),                                      // pageview
      entry({ statusCode: 404 }),                    // not a pageview (404)
      entry({ path: '/images/header.png' }),         // not a pageview (asset)
      entry({ path: '/browse/' }),                   // pageview
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.total_pageviews, 2);
  });

  it('groups pageviews by path', () => {
    const entries = [
      entry({ path: '/species/foo/' }),
      entry({ path: '/species/foo/' }),
      entry({ path: '/species/bar/' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.pageviews[0]!.path, '/species/foo/');
    assert.equal(result.pageviews[0]!.count, 2);
    assert.equal(result.pageviews[1]!.path, '/species/bar/');
    assert.equal(result.pageviews[1]!.count, 1);
  });

  it('buckets requests by hour', () => {
    const entries = [
      entry({ timestamp: '2026-06-29T03:15:00Z' }),
      entry({ timestamp: '2026-06-29T03:45:00Z' }),
      entry({ timestamp: '2026-06-29T14:00:00Z' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.requests_by_hour.length, 24);
    assert.equal(result.requests_by_hour[3], 2);
    assert.equal(result.requests_by_hour[14], 1);
  });

  it('aggregates referrer domains', () => {
    const entries = [
      entry({ referer: 'https://www.google.com/search?q=moths' }),
      entry({ referer: 'https://www.google.com/search?q=pnw' }),
      entry({ referer: 'https://en.wikipedia.org/wiki/Moth' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.referrers[0]!.domain, 'www.google.com');
    assert.equal(result.referrers[0]!.count, 2);
  });

  it('excludes self-referrals', () => {
    const entries = [
      entry({ referer: 'https://moths.pnwinsects.org/browse/' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.referrers.length, 0);
  });

  it('aggregates country codes', () => {
    const entries = [
      entry({ countryCode: 'US' }),
      entry({ countryCode: 'US' }),
      entry({ countryCode: 'CA' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.countries[0]!.code, 'US');
    assert.equal(result.countries[0]!.count, 2);
  });

  it('sums total bytes', () => {
    const entries = [entry({ bytesSent: 1000 }), entry({ bytesSent: 2500 })];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.total_bytes, 3500);
  });

  it('caps top pages list', () => {
    // Create 150 unique paths — should be capped at 100
    const entries = Array.from({ length: 150 }, (_, i) =>
      entry({ path: `/species/species-${i}/` }),
    );
    const result = aggregate(entries, date, from, to);
    assert.equal(result.pageviews.length, 100);
  });

  it('strips query strings from paths in aggregation', () => {
    const entries = [
      entry({ path: '/species/foo/?utm_source=twitter' }),
      entry({ path: '/species/foo/' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.pageviews.length, 1);
    assert.equal(result.pageviews[0]!.path, '/species/foo/');
    assert.equal(result.pageviews[0]!.count, 2);
  });
});
