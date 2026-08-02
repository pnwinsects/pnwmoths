import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { HyperLogLog } from '../../scripts/lib/hyperloglog.ts';
import * as z from 'zod/mini';

const ANALYTICS_DIR = resolve('data/analytics');

interface DayEntry {
  path: string;
  count: number;
}

/** A legacy URL that reached /redirect.html but resolved to no specific page (#181). */
interface RedirectMiss {
  from: string;
  count: number;
  referrer: string | null;
}

interface RedirectHits {
  total: number;
  matched: number;
  missed: number;
}

/**
 * Per-day legacy-link detail is dropped from the client payload after the rolling window
 * is computed — the whole analytics JSON is inlined into /analytics/index.html and this
 * data grows with every day retained. The backlog is a "what is broken lately" list, not
 * a historical series, so only the rolling aggregate is shipped (#181).
 */
interface DaySummary {
  date: string;
  total_requests: number;
  total_pageviews: number;
  total_unique_visitors: number;
  total_bytes: number;
  visitor_hll: string | null;
  pageviews: DayEntry[];
  requests_by_hour: number[];
  referrers: Array<{ domain: string; count: number }>;
  countries: Array<{ code: string; count: number }>;
  status_codes: Array<{ status: number; count: number }>;
  redirect_hits: RedirectHits;
  redirect_misses: RedirectMiss[];
  not_found: DayEntry[];
}

export interface AnalyticsData {
  days: DaySummary[];
  cumulative: {
    total_pageviews: number;
    total_unique_visitors: number;
    total_requests: number;
    first_date: string;
    last_date: string;
  };
  /** Pre-computed unique visitors per year using HLL merging. */
  yearly_unique_visitors: Record<string, number>;
  rolling30: {
    total_requests: number;
    total_pageviews: number;
    total_unique_visitors: number;
    total_bytes: number;
    top_pages: DayEntry[];
    top_referrers: Array<{ domain: string; count: number }>;
    top_countries: Array<{ code: string; count: number }>;
    requests_by_hour: number[];
    /** Legacy-URL redirect outcomes over the window (#181). */
    redirect_hits: RedirectHits;
    /** Unmapped legacy URLs, most-hit first — the mapping backlog (#181). */
    top_redirect_misses: RedirectMiss[];
    /** Most-requested missing paths over the window (#181). */
    top_not_found: DayEntry[];
  };
}

export default function (): AnalyticsData {
  if (!existsSync(ANALYTICS_DIR)) return emptyData();

  const files = readdirSync(ANALYTICS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  if (files.length === 0) return emptyData();

  return aggregateDays(files.flatMap((f) => readDay(resolve(ANALYTICS_DIR, f)) ?? []));
}

/**
 * Parse and validate one day file, or return null after saying why.
 *
 * This is the one JSON the build reads that does not come from the repo: the
 * nightly job fetches it from the CDN's access logs, so its shape is an external
 * input rather than something the compiler can check (#250). The committed
 * artifacts are imported and verified at compile time; this one cannot be, and is
 * also the only one where a bad file is plausible.
 *
 * A malformed day is skipped, not fatal. Analytics aggregation is explicitly
 * soft-fail (docs/lessons-learned.md: "crashing the job to protect data quality
 * costs an entire irrecoverable day of logs") and one corrupt day should not take
 * the analytics page — or a deploy — down with it. Before this, a malformed file
 * flowed straight through the `as RawDay` cast and surfaced as NaN totals on the
 * page, which is the same outcome with none of the warning.
 */
export function readDay(path: string): RawDay | null {
  const file = basename(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.warn(`[analytics] ${file}: not valid JSON — skipping (${(err as Error).message})`);
    return null;
  }
  const result = RawDaySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((iss) => `${iss.path.join('.') || '(root)'}: ${iss.message}`)
      .slice(0, 5)
      .join('; ');
    console.warn(`[analytics] ${file}: unexpected shape — skipping (${issues})`);
    return null;
  }
  return result.data;
}

/**
 * A daily file as written by scripts/fetch-analytics.ts, any schema_version.
 *
 * The optional fields are not laxness: files written before schema_version 3
 * predate legacy-link tracking (#181) and are still in the archive on Bunny, so
 * the schema has to accept them. `aggregateDays` defaults each one below.
 *
 * The type is inferred from the schema so the two cannot drift — the same
 * arrangement as src/types/schemas.ts. Extra keys are allowed (zod/mini objects
 * are non-strict), so a newer schema_version does not fail an older build.
 */
const DayEntrySchema = z.object({ path: z.string(), count: z.number() });

export const RawDaySchema = z.object({
  date: z.string(),
  total_requests: z.number(),
  total_pageviews: z.number(),
  total_unique_visitors: z.optional(z.number()),
  total_bytes: z.number(),
  visitor_hll: z.optional(z.string()),
  pageviews: z.array(DayEntrySchema),
  // Length deliberately unchecked. fetch-analytics.ts builds this as
  // `new Array(24).fill(0)` and writes only indices 0-23, so a wrong length means a
  // corrupt file — but both readers index a fixed 0..23 loop with `?? 0`, so a short
  // array costs one bar of the hourly chart and a long one has its tail ignored.
  // Rejecting the file here would discard the whole day instead: its pageviews,
  // unique visitors, referrers, countries and redirect backlog. Pinned by
  // "aggregateDays tolerates a wrong-length requests_by_hour" in analytics.test.ts.
  requests_by_hour: z.array(z.number()),
  referrers: z.array(z.object({ domain: z.string(), count: z.number() })),
  countries: z.array(z.object({ code: z.string(), count: z.number() })),
  status_codes: z.array(z.object({ status: z.number(), count: z.number() })),
  redirect_hits: z.optional(
    z.object({ total: z.number(), matched: z.number(), missed: z.number() }),
  ),
  redirect_misses: z.optional(
    z.array(z.object({ from: z.string(), count: z.number(), referrer: z.nullable(z.string()) })),
  ),
  not_found: z.optional(z.array(DayEntrySchema)),
});

export type RawDay = z.infer<typeof RawDaySchema>;

/** Roll daily files (newest first) into the shape the analytics page consumes. */
export function aggregateDays(rawDays: RawDay[]): AnalyticsData {
  if (rawDays.length === 0) return emptyData();

  const days: DaySummary[] = rawDays.map((raw) => {
    return {
      date: raw.date,
      total_requests: raw.total_requests,
      total_pageviews: raw.total_pageviews,
      total_unique_visitors: raw.total_unique_visitors ?? 0,
      total_bytes: raw.total_bytes,
      visitor_hll: raw.visitor_hll ?? null,
      pageviews: raw.pageviews,
      requests_by_hour: raw.requests_by_hour,
      referrers: raw.referrers,
      countries: raw.countries,
      status_codes: raw.status_codes,
      // schema_version < 3 files predate legacy-link tracking (#181) — treat as empty
      // rather than crashing the build on the analytics archive already on Bunny.
      redirect_hits: raw.redirect_hits ?? { total: 0, matched: 0, missed: 0 },
      redirect_misses: raw.redirect_misses ?? [],
      not_found: raw.not_found ?? [],
    };
  });

  // Cumulative totals across all days
  // Use HLL sketch merging for accurate cross-day unique visitor counts
  let cumPageviews = 0;
  let cumRequests = 0;
  const hllSketches = days
    .map((d) => d.visitor_hll)
    .filter((s): s is string => s !== null);
  const cumVisitors = hllSketches.length > 0
    ? HyperLogLog.union(hllSketches).count()
    : days.reduce((sum, d) => sum + d.total_unique_visitors, 0);

  for (const day of days) {
    cumPageviews += day.total_pageviews;
    cumRequests += day.total_requests;
  }

  // Rolling 30-day aggregate
  const recent = days.slice(0, 30);
  const pathCounts = new Map<string, number>();
  const refCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const missCounts = new Map<string, number>();
  const missReferrers = new Map<string, string | null>();
  const notFoundCounts = new Map<string, number>();
  const hourCounts = new Array<number>(24).fill(0);
  let totalReqs = 0;
  let totalPvs = 0;
  let totalVisitors = 0;
  let totalBytes = 0;
  const redirectHits: RedirectHits = { total: 0, matched: 0, missed: 0 };

  for (const day of recent) {
    totalReqs += day.total_requests;
    totalPvs += day.total_pageviews;
    totalVisitors += day.total_unique_visitors;
    totalBytes += day.total_bytes;
    for (const pv of day.pageviews) {
      pathCounts.set(pv.path, (pathCounts.get(pv.path) ?? 0) + pv.count);
    }
    for (const ref of day.referrers) {
      refCounts.set(ref.domain, (refCounts.get(ref.domain) ?? 0) + ref.count);
    }
    for (const c of day.countries) {
      countryCounts.set(c.code, (countryCounts.get(c.code) ?? 0) + c.count);
    }
    for (let h = 0; h < 24; h++) {
      hourCounts[h]! += day.requests_by_hour[h] ?? 0;
    }
    redirectHits.total += day.redirect_hits.total;
    redirectHits.matched += day.redirect_hits.matched;
    redirectHits.missed += day.redirect_hits.missed;
    for (const miss of day.redirect_misses) {
      missCounts.set(miss.from, (missCounts.get(miss.from) ?? 0) + miss.count);
      // Keep the first referrer seen (days are newest-first) purely as a hint about
      // who is still linking the dead URL.
      if (miss.referrer && !missReferrers.get(miss.from)) missReferrers.set(miss.from, miss.referrer);
    }
    for (const nf of day.not_found) {
      notFoundCounts.set(nf.path, (notFoundCounts.get(nf.path) ?? 0) + nf.count);
    }
  }

  const topN = <T extends string | number>(map: Map<T, number>, limit: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

  // Compute per-year unique visitors by merging HLL sketches within each year
  const yearlyUniqueVisitors: Record<string, number> = {};
  const yearGroups = new Map<string, string[]>();
  for (const day of days) {
    const year = day.date.slice(0, 4);
    if (!yearGroups.has(year)) yearGroups.set(year, []);
    if (day.visitor_hll) yearGroups.get(year)!.push(day.visitor_hll);
  }
  for (const [year, sketches] of yearGroups) {
    yearlyUniqueVisitors[year] = sketches.length > 0
      ? HyperLogLog.union(sketches).count()
      : 0;
  }

  // Strip HLL sketches from days before sending to client (saves ~12KB/day)
  for (const day of days) {
    day.visitor_hll = null;
    // Legacy-link detail is carried only by rolling30 (#181) — see the note above.
    day.redirect_misses = [];
    day.not_found = [];
  }

  return {
    days,
    cumulative: {
      total_pageviews: cumPageviews,
      total_unique_visitors: cumVisitors,
      total_requests: cumRequests,
      first_date: days[days.length - 1]!.date,
      last_date: days[0]!.date,
    },
    yearly_unique_visitors: yearlyUniqueVisitors,
    rolling30: {
      total_requests: totalReqs,
      total_pageviews: totalPvs,
      total_unique_visitors: totalVisitors,
      total_bytes: totalBytes,
      top_pages: topN(pathCounts, 50).map(([path, count]) => ({ path: path as string, count })),
      top_referrers: topN(refCounts, 25).map(([domain, count]) => ({ domain: domain as string, count })),
      top_countries: topN(countryCounts, 25).map(([code, count]) => ({ code: code as string, count })),
      requests_by_hour: hourCounts,
      redirect_hits: redirectHits,
      top_redirect_misses: topN(missCounts, 25).map(([from, count]) => ({
        from: from as string,
        count,
        referrer: missReferrers.get(from as string) ?? null,
      })),
      top_not_found: topN(notFoundCounts, 25).map(([path, count]) => ({ path: path as string, count })),
    },
  };
}

function emptyData(): AnalyticsData {
  return {
    days: [],
    cumulative: {
      total_pageviews: 0,
      total_unique_visitors: 0,
      total_requests: 0,
      first_date: '',
      last_date: '',
    },
    yearly_unique_visitors: {},
    rolling30: {
      total_requests: 0,
      total_pageviews: 0,
      total_unique_visitors: 0,
      total_bytes: 0,
      top_pages: [],
      top_referrers: [],
      top_countries: [],
      requests_by_hour: new Array(24).fill(0),
      redirect_hits: { total: 0, matched: 0, missed: 0 },
      top_redirect_misses: [],
      top_not_found: [],
    },
  };
}
