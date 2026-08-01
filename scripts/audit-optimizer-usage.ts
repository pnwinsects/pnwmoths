/**
 * scripts/audit-optimizer-usage.ts
 *
 * One-off coverage audit for #222 / #211: find every Bunny Optimizer dependency
 * in the CDN access log before the Optimizer is retired (see docs/adr/0022).
 *
 * The Optimizer is a flat $9.50/month subscription, not metered usage, so this
 * CANNOT attribute cost — request volume is irrelevant to the bill. Its only job
 * is to answer "are the five known call sites the complete set?". Anything that
 * shows up here outside EXPECTED_PATTERNS is a variant the migration would miss.
 *
 * Bunny retains logs for ~72 hours, so this must run before the cutover work and
 * cannot be backfilled afterwards (same constraint as ADR 0019).
 *
 * Usage:
 *   DRY_RUN=1 node scripts/audit-optimizer-usage.ts          # print the plan, zero API calls
 *   BUNNY_ACCOUNT_API_KEY=... node scripts/audit-optimizer-usage.ts
 *   AUDIT_DAYS=3 node scripts/audit-optimizer-usage.ts       # days back to scan (default 3)
 *
 * Environment variables:
 *   BUNNY_ACCOUNT_API_KEY  — Bunny account API key (required unless DRY_RUN)
 *   BUNNY_PULLZONE_ID      — pull zone numeric ID (optional; looked up by name)
 *   AUDIT_DAYS             — how many UTC days back to scan (default 3, Bunny's retention)
 *   DRY_RUN                — "1" to print the plan without calling the API
 */

import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention; mirrors fetch-analytics.ts).
// ---------------------------------------------------------------------------

const BUNNY_ACCOUNT_API_KEY: string = process.env['BUNNY_ACCOUNT_API_KEY'] ?? '';
const BUNNY_PULLZONE_ID: string = process.env['BUNNY_PULLZONE_ID'] ?? '';
const AUDIT_DAYS: number = Number(process.env['AUDIT_DAYS'] ?? '3');
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const PULLZONE_NAME = 'pnwmoths';
const PAGE_SIZE = 10_000;
const MAX_PAGES = 500;

/** Extensions the Optimizer can act on. */
const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tif', '.tiff', '.svg',
]);

/**
 * Query patterns the migration already accounts for (docs/adr/0022 variant matrix).
 * A pattern is the canonical `key=value&key=value` form with keys sorted.
 */
const EXPECTED_PATTERNS: ReadonlySet<string> = new Set([
  'width=530',                                    // species hero srcset 1x
  'width=1060',                                   // species hero srcset 2x
  'width=1500',                                   // species hero srcset 3x
  'height=186',                                   // taxon browser
  'height=320',                                   // identify results grid
  'crop_gravity=north&height=225&width=188',      // glossary 1x
  'crop_gravity=north&height=450&width=376',      // glossary 2x
  'format=jpg&width=1200',                        // social card
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  path: string;
  url: string;
  statusCode: number;
  bytesSent: number;
}

interface LogResponse {
  data: LogEntry[];
  pagination: { returned: number; hasMore: boolean };
}

interface PullZoneListResponse {
  Items: Array<{ Id: number; Name: string }>;
}

export interface PatternStat {
  pattern: string;
  requests: number;
  distinctPaths: number;
  bytesSent: number;
  expected: boolean;
  samplePath: string;
}

export interface AuditReport {
  imageRequests: number;
  withQuery: number;
  withoutQuery: number;
  bytesWithoutQuery: number;
  patterns: PatternStat[];
  unexpected: PatternStat[];
}

// ---------------------------------------------------------------------------
// Self-contained helpers (project convention: copied, not shared-imported, so
// each script runs independently — ADR 0013).
// ---------------------------------------------------------------------------

function redact(message: string): string {
  if (!BUNNY_ACCOUNT_API_KEY) return message;
  return message.split(BUNNY_ACCOUNT_API_KEY).join('***');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** UTC date strings for the last `days` complete-or-partial days, oldest first. */
export function auditDates(days: number, today: Date): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification (pure — unit tested)
// ---------------------------------------------------------------------------

/** True when the path (query stripped) looks like an image the Optimizer could touch. */
export function isImagePath(pathname: string): boolean {
  const dot = pathname.lastIndexOf('.');
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.has(pathname.slice(dot).toLowerCase());
}

/**
 * Canonical query pattern: keys sorted, values preserved, cache-busters dropped.
 * Values are preserved deliberately — `width=530` and `width=1060` are different
 * derivatives and each needs its own pre-generated file.
 */
export function queryPattern(query: string): string {
  const params = new URLSearchParams(query);
  const pairs: string[] = [];
  for (const [key, value] of params) {
    if (key === 'v' || key === 't' || key === '_') continue; // cache-busters, not transforms
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  return pairs.join('&');
}

export function classifyRequests(entries: readonly LogEntry[]): AuditReport {
  const stats = new Map<string, { requests: number; paths: Set<string>; bytes: number; sample: string }>();
  let imageRequests = 0;
  let withQuery = 0;
  let withoutQuery = 0;
  let bytesWithoutQuery = 0;

  for (const entry of entries) {
    const raw = entry.path || entry.url || '';
    const qIndex = raw.indexOf('?');
    const pathname = qIndex === -1 ? raw : raw.slice(0, qIndex);
    if (!isImagePath(pathname)) continue;
    imageRequests++;

    if (qIndex === -1) {
      withoutQuery++;
      bytesWithoutQuery += entry.bytesSent || 0;
      continue;
    }

    const pattern = queryPattern(raw.slice(qIndex + 1));
    if (!pattern) {
      withoutQuery++;
      bytesWithoutQuery += entry.bytesSent || 0;
      continue;
    }
    withQuery++;

    let stat = stats.get(pattern);
    if (!stat) {
      stat = { requests: 0, paths: new Set(), bytes: 0, sample: pathname };
      stats.set(pattern, stat);
    }
    stat.requests++;
    stat.bytes += entry.bytesSent || 0;
    if (stat.paths.size < 5000) stat.paths.add(pathname);
  }

  const patterns: PatternStat[] = [...stats.entries()]
    .map(([pattern, s]) => ({
      pattern,
      requests: s.requests,
      distinctPaths: s.paths.size,
      bytesSent: s.bytes,
      expected: EXPECTED_PATTERNS.has(pattern),
      samplePath: s.sample,
    }))
    .sort((a, b) => b.requests - a.requests);

  return {
    imageRequests,
    withQuery,
    withoutQuery,
    bytesWithoutQuery,
    patterns,
    unexpected: patterns.filter((p) => !p.expected),
  };
}

// ---------------------------------------------------------------------------
// Bunny API
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

    if (!res.ok) throw new Error(redact(`Bunny API error on ${label}: ${res.status} ${res.statusText}`));
    return res;
  }
  throw new Error(redact(`Exhausted retries on ${label}`));
}

async function resolvePullZoneId(): Promise<number> {
  if (BUNNY_PULLZONE_ID) return Number(BUNNY_PULLZONE_ID);
  const res = await bunnyFetch(
    `https://api.bunny.net/pullzone?search=${encodeURIComponent(PULLZONE_NAME)}`,
    'pullzone-lookup',
  );
  const body = (await res.json()) as PullZoneListResponse;
  const match = body.Items.find((z) => z.Name === PULLZONE_NAME);
  if (!match) throw new Error(`Pull zone "${PULLZONE_NAME}" not found.`);
  return match.Id;
}

async function fetchDayLogs(pullZoneId: number, date: string): Promise<LogEntry[]> {
  const from = `${date}T00:00:00Z`;
  const to = `${date}T23:59:59.999Z`;
  const all: LogEntry[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://logging.bunnycdn.com/v2/pullzones/${pullZoneId}/logs`
      + `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      + `&limit=${PAGE_SIZE}&offset=${offset}&order=asc`;
    const res = await bunnyFetch(url, `logs ${date} page ${page + 1}`);
    const body = (await res.json()) as LogResponse;
    all.push(...body.data);
    if (!body.pagination.hasMore) break;
    offset += body.pagination.returned;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

export function renderReport(report: AuditReport, dates: readonly string[]): string {
  const lines: string[] = [];
  lines.push(`# Bunny Optimizer coverage audit (#222)`);
  lines.push('');
  lines.push(`Days scanned: ${dates.join(', ')}`);
  lines.push('');
  lines.push(`Image requests:        ${report.imageRequests.toLocaleString('en-US')}`);
  lines.push(`  with a query string: ${report.withQuery.toLocaleString('en-US')}`);
  lines.push(`  bare (auto-WebP):    ${report.withoutQuery.toLocaleString('en-US')}  (${formatBytes(report.bytesWithoutQuery)})`);
  lines.push('');
  lines.push('| Query pattern | Requests | Distinct files | Bytes | Expected? |');
  lines.push('|---|---:|---:|---:|---|');
  for (const p of report.patterns) {
    lines.push(
      `| \`${p.pattern}\` | ${p.requests.toLocaleString('en-US')} | ${p.distinctPaths.toLocaleString('en-US')}`
      + ` | ${formatBytes(p.bytesSent)} | ${p.expected ? '✅' : '⚠️ **UNEXPECTED**'} |`,
    );
  }
  lines.push('');

  if (report.unexpected.length === 0) {
    lines.push('✅ No unexpected patterns. The five known call sites are the complete set;');
    lines.push('   the ADR 0022 variant matrix covers everything the log saw.');
  } else {
    lines.push(`⚠️  ${report.unexpected.length} unexpected pattern(s) — add to the ADR 0022 variant matrix:`);
    for (const p of report.unexpected) {
      lines.push(`   - \`${p.pattern}\` — ${p.requests.toLocaleString('en-US')} requests, e.g. ${p.samplePath}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dates = auditDates(AUDIT_DAYS, new Date());

  // DRY_RUN guard BEFORE the API-key guard (ADR 0013) so pre-flight needs no key.
  if (DRY_RUN) {
    console.log('[dry-run] Would scan pull zone '
      + `${BUNNY_PULLZONE_ID || `"${PULLZONE_NAME}" (looked up by name)`}`);
    console.log(`[dry-run] Days: ${dates.join(', ')}`);
    console.log(`[dry-run] Expected patterns (${EXPECTED_PATTERNS.size}):`);
    for (const p of [...EXPECTED_PATTERNS].sort()) console.log(`[dry-run]   ${p}`);
    console.log('[dry-run] Zero API calls made.');
    return;
  }

  if (!BUNNY_ACCOUNT_API_KEY) {
    console.error('ERROR: BUNNY_ACCOUNT_API_KEY is required (or set DRY_RUN=1).');
    process.exit(1);
  }

  const pullZoneId = await resolvePullZoneId();
  console.log(`Pull zone ${pullZoneId}; scanning ${dates.length} day(s)…`);

  const entries: LogEntry[] = [];
  for (const date of dates) {
    const dayEntries = await fetchDayLogs(pullZoneId, date);
    console.log(`  ${date}: ${dayEntries.length.toLocaleString('en-US')} log rows`);
    entries.push(...dayEntries);
  }

  console.log('');
  console.log(renderReport(classifyRequests(entries), dates));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(redact(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
}
