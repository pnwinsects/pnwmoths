import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import {
  resolveDate,
  isWithinRetentionWindow,
  isPageview,
  stripQueryString,
  extractRefererDomain,
  extractRedirectFrom,
  loadSpeciesSlugs,
  aggregate,
  aggregateLegacyReferrals,
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
  remoteIp: string | null;
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
    remoteIp: '192.168.1.1',
    cacheStatus: 'HIT',
    bytesSent: 5000,
    scheme: 'https',
    host: 'moths.pnwinsects.org',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isWithinRetentionWindow
// ---------------------------------------------------------------------------

describe('isWithinRetentionWindow', () => {
  it('returns true for yesterday', () => {
    const now = new Date('2026-07-05T08:00:00Z');
    assert.equal(isWithinRetentionWindow('2026-07-04', now), true);
  });

  it('returns true for exactly 72 hours ago (boundary is inclusive)', () => {
    // now = 2026-07-05T00:00:00Z, from = 2026-07-02T00:00:00Z → exactly 72h
    const now = new Date('2026-07-05T00:00:00Z');
    assert.equal(isWithinRetentionWindow('2026-07-02', now), true);
  });

  it('returns false for a date whose midnight-start is more than 72 hours ago', () => {
    // now = 2026-07-05T08:00:00Z, from = 2026-07-02T00:00:00Z → 80h ago
    const now = new Date('2026-07-05T08:00:00Z');
    assert.equal(isWithinRetentionWindow('2026-07-02', now), false);
  });

  it('returns false for a date 4 days ago', () => {
    const now = new Date('2026-07-05T08:00:00Z');
    assert.equal(isWithinRetentionWindow('2026-07-01', now), false);
  });
});

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
    assert.equal(result.schema_version, 5);
  });

  describe('aggregateLegacyReferrals', () => {
    const legacy = (overrides: Record<string, unknown> = {}) => entry({
      host: 'pnwmoths.biol.wwu.edu',
      statusCode: 301,
      path: '/browse/family-sphingidae/hyles/hyles-lineata/',
      referer: 'https://bugguide.net/node/view/123?private=value',
      ...overrides,
    });

    it('counts only initial legacy moth 301s, not downstream or direct canonical requests', () => {
      const result = aggregateLegacyReferrals([
        legacy(),
        legacy({ host: 'pnwmoths-new.biol.wwu.edu', scheme: 'http' }),
        legacy({ host: 'www.PNWMOTHS.BIOL.WWU.EDU.:443' }),
        legacy({ host: 'pnwsawflies.biol.wwu.edu' }),
        legacy({ host: 'pnwbutterflies.biol.wwu.edu' }),
        legacy({ host: 'pnwantlions.biol.wwu.edu' }),
        legacy({ host: 'moths.pnwinsects.org', path: '/redirect.html?from=/browse/' }),
        legacy({ host: 'moths.pnwinsects.org', path: '/species/hyles-lineata/' }),
        legacy({ host: 'pnwmoths.biol.wwu.edu.example.com' }),
        legacy({ statusCode: 200 }),
        legacy({ statusCode: 302 }),
        legacy({ statusCode: 404 }),
      ]);
      assert.equal(result.total_requests, 3);
      assert.equal(result.external_requests, 3);
      assert.deepEqual(result.sources, [{
        domain: 'bugguide.net',
        count: 3,
        paths: [{ path: '/browse/family-sphingidae/hyles/hyles-lineata/', count: 3 }],
      }]);
    });

    it('merges www aliases, strips queries/fragments, and retains no identifying log fields', () => {
      const result = aggregateLegacyReferrals([
        legacy({ path: '/browse-all/?q=private#section', referer: 'https://WWW.BUGGUIDE.NET.:8443/a?secret=value' }),
        legacy({ path: '/browse-all/?other=value' }),
        legacy({ path: '/', referer: 'http://bugguide.net/another-page' }),
      ]);
      assert.deepEqual(result.sources, [{
        domain: 'bugguide.net',
        count: 3,
        paths: [{ path: '/browse-all/', count: 2 }, { path: '/', count: 1 }],
      }]);
      const json = JSON.stringify(result);
      for (const omitted of ['private', 'secret', 'another-page', '192.168', 'Mozilla', 'timestamp']) {
        assert.ok(!json.includes(omitted), `must not retain ${omitted}`);
      }
    });

    it('separates missing, malformed, and non-web referrers from internal referrals', () => {
      const result = aggregateLegacyReferrals([
        ...[null, '', '-', 'not-a-url', 'javascript:alert(1)', 'file:///local', 'https://'].map(
          (referer) => legacy({ referer }),
        ),
        ...[
          'https://moths.pnwinsects.org/',
          'https://www.moths.pnwinsects.org/',
          'https://pnwmoths.b-cdn.net/',
          'https://www.pnwinsects.org/',
          'https://pnwmoths.biol.wwu.edu/',
          'https://www.pnwmoths-new.biol.wwu.edu/',
          'https://pnwsawflies.biol.wwu.edu/',
          'https://pnwbutterflies.biol.wwu.edu/',
          'https://pnwantlions.biol.wwu.edu/',
        ].map((referer) => legacy({ referer })),
        legacy({ referer: 'https://biology.wwu.edu/' }),
      ]);
      assert.equal(result.unknown_referrer_requests, 7);
      assert.equal(result.internal_referrer_requests, 9);
      assert.equal(result.external_requests, 1, 'other WWU departments remain outreach leads');
      assert.equal(result.sources[0]?.domain, 'biology.wwu.edu');
      assert.equal(result.total_requests, 17);
    });

    it('excludes assets, browser defaults, downloads, probes and recognized automation before ranking', () => {
      const paths = [
        '/media/images/header.jpg?cache=1', '/assets/main.js', '/species/foo/records.parquet',
        '/css/site.css', '/tiles/foo/0/1_1.jpg', '/robots.txt', '/sitemap.xml',
        '/favicon.ico/', '/.well-known/acme-challenge/token', '/.env', '/wp-login.php',
        '/media/checklist.PDF?download=1', '/data/records.csv',
      ];
      const agents = [
        'Googlebot/2.1', 'Bingbot/2.0', 'GPTBot/1.2', 'Bytespider',
        'GoogleOther', 'facebookexternalhit/1.1', 'HeadlessChrome/131.0',
        'curl/8.0', 'Wget/1.2', 'python-requests/2.0', 'Go-http-client/1.1',
        'pnwmoths-legacy-hostname-check/1.0',
      ];
      const result = aggregateLegacyReferrals([
        ...paths.map((path) => legacy({ path })),
        ...agents.map((userAgent) => legacy({ userAgent })),
        legacy({ path: '/', userAgent: null }),
      ]);
      assert.equal(result.excluded_requests, paths.length + agents.length);
      assert.equal(result.external_requests, 1);
      assert.deepEqual(result.sources[0]?.paths, [{ path: '/', count: 1 }]);
      assert.equal(result.total_requests, result.external_requests + result.excluded_requests
        + result.unknown_referrer_requests + result.internal_referrer_requests);
    });

    it('keeps all daily sources and paths so rolling rankings are not biased by daily caps', () => {
      const entries = Array.from({ length: 60 }, (_, i) => legacy({
        referer: `https://source-${i}.example/`,
      }));
      entries.push(...Array.from({ length: 60 }, (_, i) => legacy({ path: `/browse/page-${i}/` })));
      const result = aggregateLegacyReferrals(entries);
      assert.equal(result.sources.length, 61);
      assert.equal(result.sources[0]?.domain, 'bugguide.net');
      assert.equal(result.sources[0]?.count, 60);
      assert.equal(result.sources[0]?.paths.length, 60);
    });

    it('includes the report in the daily schema even on zero-traffic days', () => {
      const result = aggregate([], '2026-10-29', '', '', new Set());
      assert.deepEqual(result.legacy_referrals, {
        total_requests: 0,
        external_requests: 0,
        unknown_referrer_requests: 0,
        internal_referrer_requests: 0,
        excluded_requests: 0,
        sources: [],
      });
    });

    it('wires nonempty initial-request referrals into the uploaded daily artifact', () => {
      const entries = [legacy(), legacy({ host: 'moths.pnwinsects.org', path: '/redirect.html?from=/' })];
      const result = aggregate(entries, '2026-10-29', '', '', new Set());
      assert.equal(result.legacy_referrals.total_requests, 1);
      assert.equal(result.legacy_referrals.sources[0]?.domain, 'bugguide.net');
      assert.equal(result.legacy_referrals.sources[0]?.count, 1);
    });
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

  it('counts unique visitors by IP address', () => {
    const entries = [
      entry({ remoteIp: '1.2.3.4' }),
      entry({ remoteIp: '1.2.3.4' }),
      entry({ remoteIp: '5.6.7.8' }),
      entry({ remoteIp: '9.10.11.12' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.total_unique_visitors, 3);
  });

  it('handles null remoteIp gracefully', () => {
    const entries = [
      entry({ remoteIp: null }),
      entry({ remoteIp: '1.2.3.4' }),
      entry({ remoteIp: null }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.total_unique_visitors, 1);
  });

  it('returns zero unique visitors when no IPs present', () => {
    const entries = [
      entry({ remoteIp: null }),
      entry({ remoteIp: null }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.equal(result.total_unique_visitors, 0);
  });

  it('includes a visitor_hll sketch in output', () => {
    const entries = [
      entry({ remoteIp: '1.2.3.4' }),
      entry({ remoteIp: '5.6.7.8' }),
    ];
    const result = aggregate(entries, date, from, to);
    assert.ok(result.visitor_hll, 'visitor_hll should be present');
    assert.ok(result.visitor_hll.length > 0, 'visitor_hll should be non-empty base64');
    // Verify it's valid base64 that decodes to 16384 bytes (p=14)
    const decoded = Buffer.from(result.visitor_hll, 'base64');
    assert.equal(decoded.length, 16384);
  });
});

// ---------------------------------------------------------------------------
// extractRedirectFrom (#181)
// ---------------------------------------------------------------------------

describe('extractRedirectFrom', () => {
  it('extracts a URL-encoded legacy path', () => {
    assert.equal(
      extractRedirectFrom('/redirect.html?from=%2Fbrowse%2Facronicta-americana%2F'),
      '/browse/acronicta-americana/',
    );
  });

  it('extracts an unencoded legacy path', () => {
    assert.equal(extractRedirectFrom('/redirect.html?from=/browse/foo/'), '/browse/foo/');
  });

  it('ignores other query parameters', () => {
    assert.equal(extractRedirectFrom('/redirect.html?utm_source=x&from=/browse/foo/'), '/browse/foo/');
  });

  it('returns null for the redirect page without a ?from=', () => {
    assert.equal(extractRedirectFrom('/redirect.html'), null);
    assert.equal(extractRedirectFrom('/redirect.html?from='), null);
  });

  it('returns null for any other path', () => {
    assert.equal(extractRedirectFrom('/species/foo/?from=/browse/bar/'), null);
  });
});

// ---------------------------------------------------------------------------
// loadSpeciesSlugs (#181)
// ---------------------------------------------------------------------------

const SLUG_FIXTURE_DIR = resolvePath('.tmp-fetch-analytics-slugs');

function writeSlugFixture(filename: string, contents: string): string {
  mkdirSync(SLUG_FIXTURE_DIR, { recursive: true });
  const path = resolvePath(SLUG_FIXTURE_DIR, filename);
  writeFileSync(path, contents);
  return path;
}

function removeSlugFixtures(): void {
  rmSync(SLUG_FIXTURE_DIR, { recursive: true, force: true });
}

describe('loadSpeciesSlugs', () => {
  it('loads the real committed slug list', () => {
    const slugs = loadSpeciesSlugs();
    assert.ok(slugs.size > 100, 'expected the committed species slug list to be populated');
  });

  it('soft-fails to an empty set when the file is missing (never crashes the nightly job)', () => {
    assert.equal(loadSpeciesSlugs('does/not/exist.json').size, 0);
  });

  it('soft-fails to an empty set when the slug file contains malformed JSON', () => {
    const path = writeSlugFixture('malformed.json', '["acronicta-americana",');
    try {
      assert.equal(loadSpeciesSlugs(path).size, 0);
    } finally {
      removeSlugFixtures();
    }
  });

  it('soft-fails to an empty set when the slug file does not contain an array', () => {
    const objectPath = writeSlugFixture('object.json', '{"slug":"acronicta-americana"}');
    const stringPath = writeSlugFixture('string.json', '"acronicta-americana"');
    try {
      assert.equal(loadSpeciesSlugs(objectPath).size, 0);
      assert.equal(loadSpeciesSlugs(stringPath).size, 0);
    } finally {
      removeSlugFixtures();
    }
  });
});

// ---------------------------------------------------------------------------
// aggregate: legacy redirect + 404 tracking (#181)
// ---------------------------------------------------------------------------

describe('aggregate: legacy link tracking', () => {
  const date = '2026-06-29';
  const from = `${date}T00:00:00Z`;
  const to = `${date}T23:59:59.999Z`;
  const slugs = new Set(['acronicta-americana']);

  const redirectEntry = (legacyPath: string, overrides: Record<string, unknown> = {}) =>
    entry({ path: `/redirect.html?from=${encodeURIComponent(legacyPath)}`, ...overrides });

  it('reports zero redirect hits when none occurred', () => {
    const result = aggregate([entry()], date, from, to, slugs);
    assert.deepEqual(result.redirect_hits, { total: 0, matched: 0, missed: 0, automated: 0 });
    assert.deepEqual(result.redirect_misses, []);
  });

  it('counts a resolvable legacy URL as matched and does not report it', () => {
    const result = aggregate([redirectEntry('/browse/acronicta-americana/')], date, from, to, slugs);
    assert.deepEqual(result.redirect_hits, { total: 1, matched: 1, missed: 0, automated: 0 });
    assert.deepEqual(result.redirect_misses, []);
  });

  it('reports an unresolvable legacy URL as a miss', () => {
    const result = aggregate([redirectEntry('/browse/xestia-unknown/')], date, from, to, slugs);
    assert.deepEqual(result.redirect_hits, { total: 1, matched: 0, missed: 1, automated: 0 });
    assert.equal(result.redirect_misses[0]!.from, '/browse/xestia-unknown/');
    assert.equal(result.redirect_misses[0]!.count, 1);
  });

  it('groups misses by normalized path so tracking params do not fragment the list', () => {
    const result = aggregate(
      [
        redirectEntry('/browse/xestia-unknown'),
        redirectEntry('/browse/xestia-unknown/'),
        redirectEntry('/browse/xestia-unknown/?utm_source=newsletter'),
      ],
      date, from, to, slugs,
    );
    assert.equal(result.redirect_misses.length, 1);
    assert.equal(result.redirect_misses[0]!.from, '/browse/xestia-unknown/');
    assert.equal(result.redirect_misses[0]!.count, 3);
  });

  it('sorts misses by hit count', () => {
    const result = aggregate(
      [
        redirectEntry('/browse/rare-miss/'),
        redirectEntry('/browse/common-miss/'),
        redirectEntry('/browse/common-miss/'),
      ],
      date, from, to, slugs,
    );
    assert.equal(result.redirect_misses[0]!.from, '/browse/common-miss/');
    assert.equal(result.redirect_misses[0]!.count, 2);
  });

  it('records the most frequent external referrer for a miss', () => {
    const result = aggregate(
      [
        redirectEntry('/browse/miss-target/', { referer: 'https://bugguide.net/node/1' }),
        redirectEntry('/browse/miss-target/', { referer: 'https://bugguide.net/node/2' }),
        redirectEntry('/browse/miss-target/', { referer: 'https://example.org/links' }),
      ],
      date, from, to, slugs,
    );
    assert.equal(result.redirect_misses[0]!.referrer, 'bugguide.net');
  });

  it('reports a null referrer when the legacy hit carried none', () => {
    const result = aggregate([redirectEntry('/browse/miss-target/')], date, from, to, slugs);
    assert.equal(result.redirect_misses[0]!.referrer, null);
  });

  it('caps the miss list at 50 entries', () => {
    const entries = Array.from({ length: 80 }, (_, i) => redirectEntry(`/browse/miss-${i}-x/`));
    const result = aggregate(entries, date, from, to, slugs);
    assert.equal(result.redirect_misses.length, 50);
    assert.equal(result.redirect_hits.missed, 80);
  });

  // --- automated traffic (src/_lib/request-noise.ts) -----------------------
  // The miss list is capped per day, so filtering downstream would be too late:
  // noise that reaches this cap evicts real URLs permanently.

  it('keeps automated probes out of the mapping queue but still counts them', () => {
    const result = aggregate(
      [
        redirectEntry('/.env.production'),
        redirectEntry('/wp-login.php'),
        redirectEntry('/robots.txt'),
        redirectEntry('/browse/xestia-unknown/'),
      ],
      date, from, to, slugs,
    );
    assert.deepEqual(
      result.redirect_misses.map((m) => m.from),
      ['/browse/xestia-unknown/'],
      'only the plausible legacy URL belongs in the work queue',
    );
    // The honest totals are untouched: 4 requests arrived and none resolved.
    assert.equal(result.redirect_hits.total, 4);
    assert.equal(result.redirect_hits.missed, 4);
    assert.equal(result.redirect_hits.automated, 3);
  });

  it('does not let automated traffic evict a real URL from the capped list', () => {
    // 60 probes plus one genuine legacy URL. Before the filter the probes could
    // fill all 50 slots and the real one would be dropped and unrecoverable.
    const probes = Array.from({ length: 60 }, (_, i) => redirectEntry(`/.env.v${i}`));
    const result = aggregate(
      [...probes, redirectEntry('/browse/needs-a-mapping/')],
      date, from, to, slugs,
    );
    assert.deepEqual(result.redirect_misses.map((m) => m.from), ['/browse/needs-a-mapping/']);
    assert.equal(result.redirect_hits.automated, 60);
  });

  it('excludes scanner 404s but keeps a 404 on a browser default visible', () => {
    const result = aggregate(
      [
        entry({ path: '/.env', statusCode: 404 }),
        entry({ path: '/wp-login.php', statusCode: 404 }),
        entry({ path: '/robots.txt', statusCode: 404 }),
        entry({ path: '/species/typo/', statusCode: 404 }),
      ],
      date, from, to, slugs,
    );
    assert.deepEqual(
      result.not_found.map((n) => n.path).sort(),
      ['/robots.txt', '/species/typo/'],
      'a 404 on robots.txt is a real gap in what the site serves',
    );
    assert.equal(result.not_found_probes, 2);
  });

  it('aggregates 404 paths, which never reach the redirect handler at all', () => {
    const result = aggregate(
      [
        entry({ path: '/old-django-view/', statusCode: 404 }),
        entry({ path: '/old-django-view/', statusCode: 404 }),
        entry({ path: '/other-missing/', statusCode: 404 }),
        entry({ path: '/species/foo/', statusCode: 200 }),
      ],
      date, from, to, slugs,
    );
    assert.deepEqual(result.not_found[0], { path: '/old-django-view/', count: 2 });
    assert.equal(result.not_found.length, 2);
  });

  it('strips query strings from 404 paths', () => {
    const result = aggregate(
      [
        entry({ path: '/missing/?a=1', statusCode: 404 }),
        entry({ path: '/missing/?a=2', statusCode: 404 }),
      ],
      date, from, to, slugs,
    );
    assert.deepEqual(result.not_found, [{ path: '/missing/', count: 2 }]);
  });
});
