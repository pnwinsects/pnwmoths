// src/_data/analytics.test.ts
// Covers the daily-file rollup that feeds /analytics/, in particular the legacy-link
// backlog added in #181 and its back-compatibility with the schema_version 2 archive
// already sitting on Bunny storage (those files have no legacy-link fields at all).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDays, readDay, RawDaySchema, type RawDay } from './analytics.ts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import nunjucks from 'nunjucks';
import { aggregate, type LegacyReferrals } from '../../scripts/fetch-analytics.ts';

function day(date: string, overrides: Partial<RawDay> = {}): RawDay {
  return {
    date,
    total_requests: 100,
    total_pageviews: 50,
    total_unique_visitors: 10,
    total_bytes: 1000,
    pageviews: [{ path: '/browse/', count: 50 }],
    requests_by_hour: new Array<number>(24).fill(0),
    referrers: [],
    countries: [],
    status_codes: [],
    ...overrides,
  };
}

describe('aggregateDays: legacy links (#181)', () => {
  test('sums redirect outcomes across the rolling window', () => {
    const result = aggregateDays([
      day('2026-06-29', { redirect_hits: { total: 10, matched: 7, missed: 3 } }),
      day('2026-06-28', { redirect_hits: { total: 4, matched: 4, missed: 0 } }),
    ]);
    assert.deepEqual(result.rolling30.redirect_hits, { total: 14, matched: 11, missed: 3, automated: 0 });
  });

  test('merges the same missed URL across days and sorts by total hits', () => {
    const result = aggregateDays([
      day('2026-06-29', {
        redirect_misses: [
          { from: '/browse/aaa-bbb/', count: 2, referrer: null },
          { from: '/browse/ccc-ddd/', count: 5, referrer: null },
        ],
      }),
      day('2026-06-28', {
        redirect_misses: [{ from: '/browse/aaa-bbb/', count: 6, referrer: null }],
      }),
    ]);
    assert.deepEqual(
      result.rolling30.top_redirect_misses.map((m) => [m.from, m.count]),
      [['/browse/aaa-bbb/', 8], ['/browse/ccc-ddd/', 5]],
    );
  });

  test('keeps a referrer for a miss even when a later day reported none', () => {
    const result = aggregateDays([
      day('2026-06-29', {
        redirect_misses: [{ from: '/browse/aaa-bbb/', count: 1, referrer: 'bugguide.net' }],
      }),
      day('2026-06-28', {
        redirect_misses: [{ from: '/browse/aaa-bbb/', count: 1, referrer: null }],
      }),
    ]);
    assert.equal(result.rolling30.top_redirect_misses[0]?.referrer, 'bugguide.net');
  });

  test('sums 404 paths across days', () => {
    const result = aggregateDays([
      day('2026-06-29', { not_found: [{ path: '/old-view/', count: 3 }] }),
      day('2026-06-28', { not_found: [{ path: '/old-view/', count: 4 }] }),
    ]);
    assert.deepEqual(result.rolling30.top_not_found, [{ path: '/old-view/', count: 7 }]);
  });

  test('strips per-day legacy detail from the client payload (rolling30 carries it)', () => {
    const result = aggregateDays([
      day('2026-06-29', {
        redirect_misses: [{ from: '/browse/aaa-bbb/', count: 2, referrer: null }],
        not_found: [{ path: '/old-view/', count: 1 }],
      }),
    ]);
    assert.deepEqual(result.days[0]?.redirect_misses, []);
    assert.deepEqual(result.days[0]?.not_found, []);
    assert.equal(result.rolling30.top_redirect_misses.length, 1);
  });

  test('schema_version 2 files (no legacy fields) roll up to empty rather than throwing', () => {
    const result = aggregateDays([day('2026-06-29'), day('2026-06-28')]);
    assert.deepEqual(result.rolling30.redirect_hits, { total: 0, matched: 0, missed: 0, automated: 0 });
    assert.deepEqual(result.rolling30.top_redirect_misses, []);
    assert.deepEqual(result.rolling30.top_not_found, []);
    // The rest of the rollup is unaffected
    assert.equal(result.cumulative.total_pageviews, 100);
  });

  test('an empty archive produces empty legacy lists', () => {
    const result = aggregateDays([]);
    assert.deepEqual(result.rolling30.top_redirect_misses, []);
    assert.deepEqual(result.rolling30.top_not_found, []);
  });

  // Days written before schema_version 4 carry unfiltered misses. Without this the
  // queue stays full of scanner probes until the whole window has rolled over.
  test('filters automated traffic out of days stored under the old behaviour', () => {
    const result = aggregateDays([
      day('2026-06-29', {
        redirect_misses: [
          { from: '/robots.txt/', count: 5174, referrer: null },
          { from: '/.env.production/', count: 173, referrer: null },
          { from: '/browse/needs-a-mapping/', count: 4, referrer: null },
        ],
      }),
    ]);
    assert.deepEqual(
      result.rolling30.top_redirect_misses.map((m) => m.from),
      ['/browse/needs-a-mapping/'],
      'the real URL was outranked 1,000:1 and is the only actionable row',
    );
    assert.equal(result.rolling30.redirect_hits.automated, 5347);
  });

  test('keeps a 404 on a browser default visible but hides scanner probes', () => {
    const result = aggregateDays([
      day('2026-06-29', {
        not_found: [
          { path: '/robots.txt', count: 6222 },
          { path: '/wp-login.php', count: 16 },
          { path: '/species/typo/', count: 2 },
        ],
      }),
    ]);
    assert.deepEqual(
      result.rolling30.top_not_found,
      [{ path: '/robots.txt', count: 6222 }, { path: '/species/typo/', count: 2 }],
    );
    assert.equal(result.rolling30.not_found_probes, 16);
  });

  test('carries a schema_version 4 day\'s own automated count through', () => {
    const result = aggregateDays([
      day('2026-06-29', {
        redirect_hits: { total: 100, matched: 10, missed: 90, automated: 80 },
        not_found_probes: 7,
      }),
    ]);
    assert.equal(result.rolling30.redirect_hits.automated, 80);
    assert.equal(result.rolling30.not_found_probes, 7);
  });

  test('only the rolling 30-day window contributes to the backlog', () => {
    const days = Array.from({ length: 40 }, (_, i) =>
      day(`2026-06-${String(30 - (i % 30)).padStart(2, '0')}`, {
        redirect_hits: { total: 1, matched: 0, missed: 1 },
      }),
    );
    const result = aggregateDays(days);
    assert.equal(result.rolling30.redirect_hits.total, 30);
  });
});


// ---------------------------------------------------------------------------
// readDay: the one JSON the build reads that does not come from the repo (#250)
// ---------------------------------------------------------------------------

describe('readDay validates the external daily files', () => {
  function withFile<T>(name: string, contents: string, fn: (path: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'pnwm-analytics-'));
    try {
      const path = join(dir, name);
      writeFileSync(path, contents);
      return fn(path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const valid: RawDay = day('2026-06-29');

  test('accepts a well-formed day file', () => {
    withFile('2026-06-29.json', JSON.stringify(valid), (path) => {
      assert.deepEqual(readDay(path)?.date, '2026-06-29');
    });
  });

  test('accepts a schema_version 2 file, which has no legacy-link fields', () => {
    // These are still in the archive on Bunny; rejecting them would drop real days.
    const { redirect_hits: _h, redirect_misses: _m, not_found: _n, ...v2 } = valid;
    withFile('2026-01-01.json', JSON.stringify(v2), (path) => {
      assert.equal(readDay(path)?.date, valid.date);
    });
  });

  test('tolerates unknown keys, so a newer writer does not break an older build', () => {
    withFile('2026-06-29.json', JSON.stringify({ ...valid, schema_version: 99, brand_new: [] }), (path) => {
      assert.equal(readDay(path)?.date, '2026-06-29');
    });
  });

  test('skips a file that is not valid JSON rather than failing the build', () => {
    withFile('broken.json', '{"date": "2026-06-29",', (path) => {
      assert.equal(readDay(path), null);
    });
  });

  test('skips a file whose shape is wrong — the case the `as` cast let through', () => {
    // total_requests as a string reached the page as NaN before this (#250).
    withFile('bad.json', JSON.stringify({ ...valid, total_requests: 'lots' }), (path) => {
      assert.equal(readDay(path), null);
    });
  });

  test('skips a file missing a required field', () => {
    const { pageviews: _p, ...missing } = valid;
    withFile('bad.json', JSON.stringify(missing), (path) => {
      assert.equal(readDay(path), null);
    });
  });

  test('RawDaySchema and the RawDay type stay in step', () => {
    // The type is inferred from the schema, so this is a compile-time tautology
    // that becomes a runtime check if anyone replaces the inference with a hand
    // written interface.
    const parsed = RawDaySchema.safeParse(valid);
    assert.ok(parsed.success);
    const roundTripped: RawDay = parsed.data;
    assert.deepEqual(roundTripped.date, valid.date);
  });
});

// ---------------------------------------------------------------------------
// requests_by_hour is a 24-slot contract. scripts/fetch-analytics.ts builds it
// as `new Array(24).fill(0)` and only ever writes indices 0-23, so a wrong length
// means a corrupt or hand-edited file.
//
// RawDaySchema deliberately does NOT enforce the length, and these tests pin why:
// both readers (aggregateDays below, and pnwm-analytics-dashboard) index a fixed
// 0..23 loop with `?? 0`, so a short array loses one bar of the hourly chart and a
// long one has its tail ignored — while every other metric for that day survives.
// Rejecting the file in readDay would instead discard the whole day: its
// pageviews, unique visitors, referrers, countries, redirect misses and 404s.
// That is a far worse trade for a defect the consumers already absorb, and
// analytics data is irrecoverable after Bunny's 72-hour log retention.
// ---------------------------------------------------------------------------

describe('aggregateDays tolerates a wrong-length requests_by_hour', () => {
  const withHours = (hours: number[]): RawDay => day('2026-06-29', { requests_by_hour: hours });

  test('a full 24-hour day sums every hour', () => {
    const out = aggregateDays([withHours(new Array<number>(24).fill(1))]).rolling30.requests_by_hour;
    assert.equal(out.length, 24);
    assert.equal(out.reduce((a, b) => a + b, 0), 24);
  });

  test('a short array loses only the missing hours — no NaN, no dropped day', () => {
    const result = aggregateDays([withHours(new Array<number>(23).fill(1))]);
    const out = result.rolling30.requests_by_hour;
    assert.equal(out.length, 24, 'output is always 24 slots regardless of input length');
    assert.equal(out.reduce((a, b) => a + b, 0), 23);
    assert.ok(!out.some(Number.isNaN), 'a missing hour reads as 0, never NaN');
    assert.equal(result.days.length, 1, 'the day itself is still counted');
    assert.equal(result.rolling30.total_pageviews, 50, 'its other metrics are intact');
  });

  test('a long array has its tail ignored rather than overflowing the chart', () => {
    const out = aggregateDays([withHours(new Array<number>(25).fill(1))]).rolling30.requests_by_hour;
    assert.equal(out.length, 24);
    assert.equal(out.reduce((a, b) => a + b, 0), 24, 'the 25th entry is not counted');
  });

  test('readDay keeps such a file rather than discarding the day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pnwm-analytics-'));
    try {
      const path = join(dir, '2026-06-29.json');
      writeFileSync(path, JSON.stringify(withHours(new Array<number>(23).fill(1))));
      assert.equal(readDay(path)?.requests_by_hour.length, 23);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function referrals(overrides: Partial<LegacyReferrals> = {}): LegacyReferrals {
  return {
    total_requests: 0,
    external_requests: 0,
    unknown_referrer_requests: 0,
    internal_referrer_requests: 0,
    excluded_requests: 0,
    sources: [],
    ...overrides,
  };
}

describe('aggregateDays: legacy referral outreach', () => {
  test('merges source/path counts before ranking and preserves the raw daily details', () => {
    const raw = [
      day('2026-10-30', { legacy_referrals: referrals({
        total_requests: 10, external_requests: 5, unknown_referrer_requests: 2,
        internal_referrer_requests: 1, excluded_requests: 2,
        sources: [
          { domain: 'bugguide.net', count: 2, paths: [{ path: '/browse-all/', count: 2 }] },
          { domain: 'other.example', count: 3, paths: [{ path: '/', count: 3 }] },
        ],
      }) }),
      day('2026-10-29', { legacy_referrals: referrals({
        total_requests: 5, external_requests: 4, unknown_referrer_requests: 1,
        sources: [{ domain: 'bugguide.net', count: 4, paths: [
          { path: '/browse-all/', count: 3 }, { path: '/', count: 1 },
        ] }],
      }) }),
    ];
    const before = structuredClone(raw);
    const report = aggregateDays(raw).rolling30.legacy_referrals;
    assert.deepEqual(report.sources, [
      { domain: 'bugguide.net', count: 6, paths: [
        { path: '/browse-all/', count: 5 }, { path: '/', count: 1 },
      ] },
      { domain: 'other.example', count: 3, paths: [{ path: '/', count: 3 }] },
    ]);
    assert.equal(report.total_requests, 15);
    assert.equal(report.external_requests, 9);
    assert.equal(report.unknown_referrer_requests, 3);
    assert.equal(report.internal_referrer_requests, 1);
    assert.equal(report.excluded_requests, 2);
    assert.deepEqual(raw, before);
  });

  test('uses 30 calendar days, not the most recent 30 files, and counts zero-traffic collection days', () => {
    const result = aggregateDays([
      day('2026-10-30', { legacy_referrals: referrals() }),
      day('2026-10-28'),
      day('2026-10-01', { legacy_referrals: referrals({ total_requests: 1, unknown_referrer_requests: 1 }) }),
      day('2026-09-30', { legacy_referrals: referrals({ total_requests: 100, unknown_referrer_requests: 100 }) }),
    ]);
    const report = result.rolling30.legacy_referrals;
    assert.equal(report.window_start, '2026-10-01');
    assert.equal(report.window_end, '2026-10-30');
    assert.equal(report.first_date, '2026-10-01');
    assert.equal(report.last_date, '2026-10-30');
    assert.equal(report.days_collected, 2, 'missing fields do not count as measured days');
    assert.equal(report.total_requests, 1, 'September 30 is outside the inclusive window');
    assert.ok(!('legacy_referrals' in result.days[0]!), 'only the rollup goes into the client payload');
  });

  test('reports uncollected data distinctly from a collected zero', () => {
    assert.equal(aggregateDays([day('2026-10-30')]).rolling30.legacy_referrals.days_collected, 0);
    assert.equal(aggregateDays([
      day('2026-10-30', { legacy_referrals: referrals() }),
    ]).rolling30.legacy_referrals.days_collected, 1);
    const empty = aggregateDays([]).rolling30.legacy_referrals;
    assert.equal(empty.days_collected, 0);
    assert.equal(empty.window_start, '');
    assert.deepEqual(empty.sources, []);
  });

  test('publishes the top 25 domains and five paths only after merging the window', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      domain: `source-${String(i).padStart(2, '0')}.example`,
      count: i + 1,
      paths: [{ path: '/', count: i + 1 }],
    }));
    const recurring = {
      domain: 'recurring.example',
      count: 7,
      paths: Array.from({ length: 7 }, (_, i) => ({ path: `/path-${i}/`, count: 1 })),
    };
    const days = Array.from({ length: 10 }, (_, i) => day(`2026-10-${30 - i}`, {
      legacy_referrals: referrals({
        external_requests: 7 + (i === 0 ? 1830 : 0),
        total_requests: 7 + (i === 0 ? 1830 : 0),
        sources: i === 0 ? [...rows, recurring] : [recurring],
      }),
    }));
    const report = aggregateDays(days).rolling30.legacy_referrals;
    assert.equal(report.sources.length, 25);
    assert.equal(report.sources[0]?.domain, 'recurring.example', 'a low-ranked daily source wins across days');
    assert.equal(report.sources[0]?.count, 70);
    assert.equal(report.sources[0]?.paths.length, 5);
    assert.equal(report.sources[0]?.paths[0]?.count, 10);
    assert.equal(report.external_requests, 1900, 'headline totals include domains outside the displayed top 25');
  });

  test('the writer output validates and rolls up, while older schemas remain valid', () => {
    const current = aggregate([], '2026-10-30', '', '', new Set());
    const parsed = RawDaySchema.safeParse(JSON.parse(JSON.stringify(current)));
    assert.ok(parsed.success);
    assert.equal(aggregateDays([parsed.data]).rolling30.legacy_referrals.days_collected, 1);
    assert.ok(RawDaySchema.safeParse(day('2026-10-29')).success);
    assert.equal(RawDaySchema.safeParse({
      ...day('2026-10-30'), legacy_referrals: { sources: [] },
    }).success, false, 'a present but malformed report is not silently treated as a measured day');
  });
});

describe('rendered /analytics/ legacy referral report', () => {
  function render(days: RawDay[]): string {
    const env = new nunjucks.Environment(undefined, { autoescape: false });
    env.addFilter('number', (value: number) => value.toLocaleString('en-US'));
    env.addFilter('tojson', (value: unknown) => JSON.stringify(value));
    const template = readFileSync(resolve('src/analytics/index.njk'), 'utf8')
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    return env.renderString(template, { analytics: aggregateDays(days) });
  }

  function reportSection(html: string): string {
    const match = html.match(/<section id="legacy-referral-sources"[\s\S]*?<\/section>/);
    assert.ok(match, 'report must be present in ordinary static HTML');
    return match[0];
  }

  test('older archives say not collected rather than no referrals', () => {
    const section = reportSection(render([day('2026-10-30')]));
    assert.match(section, /Not collected yet/);
    assert.doesNotMatch(section, /No externally referred/);
  });

  test('a collected zero has explicit coverage, totals, limitations and a zero-referral state', () => {
    const html = render([day('2026-10-30', { legacy_referrals: referrals() })]);
    const section = reportSection(html);
    assert.match(section, /1 of 30 days/);
    assert.match(section, /2026-10-01/);
    assert.match(section, /2026-10-30/);
    assert.match(section, /Partial coverage/);
    assert.match(section, /0 initial legacy-host requests/);
    assert.match(section, /No externally referred legacy page requests/);
    assert.match(section, /not verified people or unique visits/);
    assert.match(section, /independent of the year filter/);
    assert.ok(html.indexOf('<section id="legacy-referral-sources"') < html.indexOf('<noscript>'));
    assert.ok(html.indexOf('</pnwm-analytics-dashboard>') < html.indexOf('<section id="legacy-referral-sources"'));
  });

  test('a complete 30-day window does not claim partial coverage', () => {
    const days = Array.from({ length: 30 }, (_, i) => day(`2026-10-${String(30 - i).padStart(2, '0')}`, {
      legacy_referrals: referrals(),
    }));
    const section = reportSection(render(days));
    assert.match(section, /30 of 30 days/);
    assert.doesNotMatch(section, /Partial coverage/);
  });

  test('renders ranked domains and expandable old paths, escaping log data in HTML and script JSON', () => {
    const path = '/browse/</script><img src=x onerror=alert(1)>';
    const html = render([day('2026-10-30', { legacy_referrals: referrals({
      total_requests: 4, external_requests: 3, excluded_requests: 1,
      sources: [
        { domain: 'smaller.example', count: 1, paths: [{ path: '/', count: 1 }] },
        { domain: 'larger.example', count: 2, paths: [{ path, count: 2 }] },
      ],
    }) })]);
    const section = reportSection(html);
    assert.ok(section.indexOf('larger.example') < section.indexOf('smaller.example'));
    assert.match(section, /<details>/);
    assert.match(section, /&lt;\/script&gt;&lt;img/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(section, /3 externally referred/);
    assert.match(section, /1 excluded/);
    const script = html.match(/<script[^>]*id="analytics-data"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(script);
    const data = JSON.parse(script[1]!);
    assert.equal(data.rolling30.legacy_referrals.sources[0].paths[0].path, path);
  });
});
