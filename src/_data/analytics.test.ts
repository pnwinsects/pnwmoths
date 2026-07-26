// src/_data/analytics.test.ts
// Covers the daily-file rollup that feeds /analytics/, in particular the legacy-link
// backlog added in #181 and its back-compatibility with the schema_version 2 archive
// already sitting on Bunny storage (those files have no legacy-link fields at all).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDays, type RawDay } from './analytics.ts';

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
    assert.deepEqual(result.rolling30.redirect_hits, { total: 14, matched: 11, missed: 3 });
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
    assert.deepEqual(result.rolling30.redirect_hits, { total: 0, matched: 0, missed: 0 });
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
