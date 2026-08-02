// src/_data/analytics.test.ts
// Covers the daily-file rollup that feeds /analytics/, in particular the legacy-link
// backlog added in #181 and its back-compatibility with the schema_version 2 archive
// already sitting on Bunny storage (those files have no legacy-link fields at all).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDays, readDay, RawDaySchema, type RawDay } from './analytics.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
