/**
 * scripts/fetch-analytics.ts
 *
 * Fetches CDN access logs from Bunny's Logging API v2, aggregates them into a
 * daily summary, and writes the result to data/analytics/YYYY-MM-DD.json.
 *
 * Designed to run nightly in a GitHub Action. The aggregated JSON is committed
 * to the repo so the Eleventy build can render an analytics dashboard.
 *
 * Environment variables:
 *   BUNNY_ACCOUNT_API_KEY  — Bunny account API key (required)
 *   BUNNY_PULLZONE_ID      — Pull zone numeric ID (optional; looked up by name if absent)
 *   ANALYTICS_DATE         — ISO date to fetch, e.g. 2026-06-29 (defaults to yesterday UTC)
 *   DRY_RUN                — "1" to print the plan without writing files
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Constants & env
// ---------------------------------------------------------------------------

const BUNNY_ACCOUNT_API_KEY: string = process.env['BUNNY_ACCOUNT_API_KEY'] ?? '';
const BUNNY_PULLZONE_ID: string = process.env['BUNNY_PULLZONE_ID'] ?? '';
const PULLZONE_NAME = 'pnwmoths';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const OUTPUT_DIR = resolve('data/analytics');
const PAGE_SIZE = 10_000; // Bunny's max per request
const MAX_PAGES = 500; // safety cap — 5M rows max

/** File extensions that are static assets, not page views. */
const ASSET_EXTENSIONS = new Set([
  '.js', '.css', '.map', '.woff', '.woff2', '.ttf', '.eot',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.json', '.xml', '.txt', '.parquet', '.dzi',
]);

/** Path prefixes that are infrastructure, not page views. */
const ASSET_PREFIXES = [
  '/pagefind/', '/assets/', '/images/', '/css/', '/fonts/',
  '/tiles/', '/_/', '/components/',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PullZoneListResponse {
  Items: Array<{ Id: number; Name: string }>;
  CurrentPage: number;
  TotalItems: number;
  HasMoreItems: boolean;
}

interface LogEntry {
  timestamp: string;
  statusCode: number;
  path: string;
  url: string;
  countryCode: string | null;
  referer: string | null;
  userAgent: string | null;
  remoteAddress: string | null;
  cacheStatus: string;
  bytesSent: number;
  scheme: string;
  host: string;
}

interface PaginationInfo {
  offset: number;
  limit: number;
  returned: number;
  hasMore: boolean;
}

interface LogResponse {
  data: LogEntry[];
  pagination: PaginationInfo;
}

export interface DailyAnalytics {
  schema_version: number;
  date: string;
  generated_at: string;
  source_window: { from: string; to: string };
  log_rows_processed: number;
  total_requests: number;
  total_pageviews: number;
  total_unique_visitors: number;
  total_bytes: number;
  pageviews: Array<{ path: string; count: number }>;
  requests_by_hour: number[];
  referrers: Array<{ domain: string; count: number }>;
  countries: Array<{ code: string; count: number }>;
  status_codes: Array<{ status: number; count: number }>;
  cache_statuses: Array<{ status: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function redact(msg: string): string {
  return BUNNY_ACCOUNT_API_KEY
    ? msg.replace(new RegExp(BUNNY_ACCOUNT_API_KEY, 'g'), '[REDACTED]')
    : msg;
}

/**
 * Compute yesterday's date in UTC, or parse ANALYTICS_DATE override.
 */
export function resolveDate(override?: string): string {
  if (override) {
    const match = /^\d{4}-\d{2}-\d{2}$/.exec(override);
    if (!match) throw new Error(`Invalid ANALYTICS_DATE: ${override}. Expected YYYY-MM-DD.`);
    return override;
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Determine whether a log entry counts as a pageview (HTML page, not an asset).
 */
export function isPageview(entry: LogEntry): boolean {
  if (entry.statusCode < 200 || entry.statusCode >= 300) return false;

  const path = stripQueryString(entry.path);

  // Check extension — if it has a recognized asset extension, skip it.
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = path.slice(dotIndex).toLowerCase();
    if (ASSET_EXTENSIONS.has(ext)) return false;
  }

  // Check prefix
  for (const prefix of ASSET_PREFIXES) {
    if (path.startsWith(prefix)) return false;
  }

  return true;
}

/**
 * Strip query string and fragment from a URL path.
 */
export function stripQueryString(path: string): string {
  const qIndex = path.indexOf('?');
  const hIndex = path.indexOf('#');
  let end = path.length;
  if (qIndex !== -1 && qIndex < end) end = qIndex;
  if (hIndex !== -1 && hIndex < end) end = hIndex;
  return path.slice(0, end);
}

/**
 * Extract domain from a referer URL. Returns null for empty/self referrers.
 */
export function extractRefererDomain(referer: string | null, siteHost: string): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const domain = url.hostname.toLowerCase();
    // Exclude self-referrals
    if (domain === siteHost || domain === `www.${siteHost}`) return null;
    return domain;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API interaction
// ---------------------------------------------------------------------------

async function bunnyFetch(url: string, label: string): Promise<Response> {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(url, {
      headers: { 'AccessKey': BUNNY_ACCOUNT_API_KEY, 'Accept': 'application/json' },
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? delays[attempt] ?? 16000) * 1000;
      const waitMs = Math.min(retryAfter, 60_000);
      console.warn(`  ⏳ Rate-limited on ${label}, waiting ${waitMs}ms (attempt ${attempt + 1})`);
      if (attempt >= delays.length) throw new Error(redact(`Rate-limited on ${label} after ${delays.length} retries`));
      await sleep(waitMs);
      continue;
    }

    if (res.status >= 500 && attempt < delays.length) {
      console.warn(`  ⚠️  ${res.status} on ${label}, retrying in ${delays[attempt]}ms`);
      await sleep(delays[attempt]!);
      continue;
    }

    if (!res.ok) {
      let detail = '';
      try {
        const errText = await res.text();
        const parsed = JSON.parse(errText) as { error?: { message?: string; details?: string[] } };
        if (parsed.error?.details?.length) {
          detail = ` — ${parsed.error.details.join('; ')}`;
        } else if (parsed.error?.message) {
          detail = ` — ${parsed.error.message}`;
        } else if (errText) {
          detail = ` — ${errText.slice(0, 200)}`;
        }
      } catch { /* ignore body parse errors */ }
      throw new Error(redact(`Bunny API error on ${label}: ${res.status} ${res.statusText}${detail}`));
    }

    return res;
  }

  throw new Error(redact(`Exhausted retries on ${label}`));
}

/**
 * Resolve the pull zone ID by name using the Bunny API.
 */
async function resolvePullZoneId(): Promise<number> {
  if (BUNNY_PULLZONE_ID) return Number(BUNNY_PULLZONE_ID);

  console.log(`  Looking up pull zone "${PULLZONE_NAME}" by name…`);
  const res = await bunnyFetch(
    `https://api.bunny.net/pullzone?search=${encodeURIComponent(PULLZONE_NAME)}`,
    'pullzone-lookup',
  );
  const body = (await res.json()) as PullZoneListResponse;
  const zones = body.Items;
  const match = zones.find((z) => z.Name === PULLZONE_NAME);
  if (!match) throw new Error(`Pull zone "${PULLZONE_NAME}" not found. Available: ${zones.map((z) => z.Name).join(', ')}`);
  console.log(`  Found pull zone ID: ${match.Id}`);
  return match.Id;
}

/**
 * Fetch all log entries for a given UTC day, paginating through all results.
 */
async function fetchDayLogs(pullZoneId: number, date: string): Promise<LogEntry[]> {
  const from = `${date}T00:00:00Z`;
  const to = `${date}T23:59:59.999Z`;
  const allEntries: LogEntry[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://logging.bunnycdn.com/v2/pullzones/${pullZoneId}/logs`
      + `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      + `&limit=${PAGE_SIZE}&offset=${offset}&order=asc`;

    const res = await bunnyFetch(url, `logs page ${page + 1}`);
    const body = (await res.json()) as LogResponse;

    allEntries.push(...body.data);
    console.log(`  Page ${page + 1}: ${body.pagination.returned} entries (total so far: ${allEntries.length})`);

    if (!body.pagination.hasMore) break;
    offset += body.pagination.returned;
  }

  return allEntries;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const TOP_PAGES = 100;
const TOP_REFERRERS = 50;
const TOP_COUNTRIES = 50;

export function aggregate(entries: LogEntry[], date: string, _from: string, _to: string): DailyAnalytics {
  const hourCounts = new Array<number>(24).fill(0);
  const pathCounts = new Map<string, number>();
  const refererCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const statusCounts = new Map<number, number>();
  const cacheCounts = new Map<string, number>();
  const uniqueIPs = new Set<string>();
  let totalPageviews = 0;
  let totalBytes = 0;

  // Site host for self-referral filtering
  const siteHost = 'moths.pnwinsects.org';

  for (const entry of entries) {
    totalBytes += entry.bytesSent;

    // Track unique visitors by IP
    if (entry.remoteAddress) {
      uniqueIPs.add(entry.remoteAddress);
    }

    // Hour bucket
    const hour = new Date(entry.timestamp).getUTCHours();
    hourCounts[hour]!++;

    // Status codes
    statusCounts.set(entry.statusCode, (statusCounts.get(entry.statusCode) ?? 0) + 1);

    // Cache status
    if (entry.cacheStatus) {
      cacheCounts.set(entry.cacheStatus, (cacheCounts.get(entry.cacheStatus) ?? 0) + 1);
    }

    // Country
    if (entry.countryCode) {
      countryCounts.set(entry.countryCode, (countryCounts.get(entry.countryCode) ?? 0) + 1);
    }

    // Pageview-specific
    if (isPageview(entry)) {
      totalPageviews++;
      const cleanPath = stripQueryString(entry.path);
      pathCounts.set(cleanPath, (pathCounts.get(cleanPath) ?? 0) + 1);
    }

    // Referrer (all requests, not just pageviews)
    const domain = extractRefererDomain(entry.referer, siteHost);
    if (domain) {
      refererCounts.set(domain, (refererCounts.get(domain) ?? 0) + 1);
    }
  }

  const sortedTop = <T extends string | number>(map: Map<T, number>, limit: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

  return {
    schema_version: 2,
    date,
    generated_at: new Date().toISOString(),
    source_window: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59.999Z` },
    log_rows_processed: entries.length,
    total_requests: entries.length,
    total_pageviews: totalPageviews,
    total_unique_visitors: uniqueIPs.size,
    total_bytes: totalBytes,
    pageviews: sortedTop(pathCounts, TOP_PAGES).map(([path, count]) => ({ path: path as string, count })),
    requests_by_hour: hourCounts,
    referrers: sortedTop(refererCounts, TOP_REFERRERS).map(([domain, count]) => ({ domain: domain as string, count })),
    countries: sortedTop(countryCounts, TOP_COUNTRIES).map(([code, count]) => ({ code: code as string, count })),
    status_codes: sortedTop(statusCounts, 20).map(([status, count]) => ({ status: status as number, count })),
    cache_statuses: sortedTop(cacheCounts, 10).map(([status, count]) => ({ status: status as string, count })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!BUNNY_ACCOUNT_API_KEY) {
    console.error('❌ BUNNY_ACCOUNT_API_KEY is required.');
    process.exit(1);
  }

  const date = resolveDate(process.env['ANALYTICS_DATE']);
  console.log(`📊 Fetching analytics for ${date}…`);

  const pullZoneId = await resolvePullZoneId();
  console.log(`  Pull zone: ${pullZoneId}`);

  const entries = await fetchDayLogs(pullZoneId, date);
  console.log(`  Total log entries: ${entries.length}`);

  const analytics = aggregate(entries, date, `${date}T00:00:00Z`, `${date}T23:59:59.999Z`);
  console.log(`  Pageviews: ${analytics.total_pageviews} / ${analytics.total_requests} requests`);
  console.log(`  Top page: ${analytics.pageviews[0]?.path ?? '(none)'} (${analytics.pageviews[0]?.count ?? 0} hits)`);

  if (DRY_RUN) {
    console.log('\n🏜️  DRY_RUN — would write:');
    console.log(JSON.stringify(analytics, null, 2));
    return;
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = resolve(OUTPUT_DIR, `${date}.json`);
  writeFileSync(outPath, JSON.stringify(analytics, null, 2) + '\n');
  console.log(`✅ Wrote ${outPath}`);
}

// ---------------------------------------------------------------------------
// Main — only run when this file is the entry point
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1]?.replace(/\\/g, '/').endsWith('fetch-analytics.ts')
  || process.argv[1]?.replace(/\\/g, '/').endsWith('fetch-analytics.js');

if (isMainModule) {
  main().catch((err) => {
    console.error(redact(String(err)));
    process.exit(1);
  });
}
