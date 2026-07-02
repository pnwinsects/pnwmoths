import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ANALYTICS_DIR = resolve('data/analytics');

interface DayEntry {
  path: string;
  count: number;
}

interface DaySummary {
  date: string;
  total_requests: number;
  total_pageviews: number;
  total_unique_visitors: number;
  total_bytes: number;
  pageviews: DayEntry[];
  requests_by_hour: number[];
  referrers: Array<{ domain: string; count: number }>;
  countries: Array<{ code: string; count: number }>;
  status_codes: Array<{ status: number; count: number }>;
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
  rolling30: {
    total_requests: number;
    total_pageviews: number;
    total_unique_visitors: number;
    total_bytes: number;
    top_pages: DayEntry[];
    top_referrers: Array<{ domain: string; count: number }>;
    top_countries: Array<{ code: string; count: number }>;
    requests_by_hour: number[];
  };
}

export default function (): AnalyticsData {
  if (!existsSync(ANALYTICS_DIR)) return emptyData();

  const files = readdirSync(ANALYTICS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  if (files.length === 0) return emptyData();

  const days: DaySummary[] = files.map((f) => {
    const raw = JSON.parse(readFileSync(resolve(ANALYTICS_DIR, f), 'utf-8'));
    return {
      date: raw.date,
      total_requests: raw.total_requests,
      total_pageviews: raw.total_pageviews,
      total_unique_visitors: raw.total_unique_visitors ?? 0,
      total_bytes: raw.total_bytes,
      pageviews: raw.pageviews,
      requests_by_hour: raw.requests_by_hour,
      referrers: raw.referrers,
      countries: raw.countries,
      status_codes: raw.status_codes,
    };
  });

  // Cumulative totals across all days
  let cumPageviews = 0;
  let cumVisitors = 0;
  let cumRequests = 0;
  for (const day of days) {
    cumPageviews += day.total_pageviews;
    cumVisitors += day.total_unique_visitors;
    cumRequests += day.total_requests;
  }

  // Rolling 30-day aggregate
  const recent = days.slice(0, 30);
  const pathCounts = new Map<string, number>();
  const refCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const hourCounts = new Array<number>(24).fill(0);
  let totalReqs = 0;
  let totalPvs = 0;
  let totalVisitors = 0;
  let totalBytes = 0;

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
  }

  const topN = <T extends string | number>(map: Map<T, number>, limit: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

  return {
    days,
    cumulative: {
      total_pageviews: cumPageviews,
      total_unique_visitors: cumVisitors,
      total_requests: cumRequests,
      first_date: days[days.length - 1]!.date,
      last_date: days[0]!.date,
    },
    rolling30: {
      total_requests: totalReqs,
      total_pageviews: totalPvs,
      total_unique_visitors: totalVisitors,
      total_bytes: totalBytes,
      top_pages: topN(pathCounts, 50).map(([path, count]) => ({ path: path as string, count })),
      top_referrers: topN(refCounts, 25).map(([domain, count]) => ({ domain: domain as string, count })),
      top_countries: topN(countryCounts, 25).map(([code, count]) => ({ code: code as string, count })),
      requests_by_hour: hourCounts,
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
    rolling30: {
      total_requests: 0,
      total_pageviews: 0,
      total_unique_visitors: 0,
      total_bytes: 0,
      top_pages: [],
      top_referrers: [],
      top_countries: [],
      requests_by_hour: new Array(24).fill(0),
    },
  };
}
