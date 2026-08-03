/**
 * scripts/report-link-rot.ts
 *
 * Turns the weekly link check into something a person will actually read: one
 * GitHub issue, maintained in place, closed when the links recover.
 *
 * Run via `npm run links:report` from `.github/workflows/link-rot.yml`, after a
 * `lychee --format json` run. See docs/adr/0028-link-rot-reporting.md.
 *
 * Why an issue and not a log line: the advisory link check in `production.yml`
 * had been failing on two hosts for days and nobody noticed, because a
 * `continue-on-error` step reports to a place with no owner (#261, #263). Issues
 * are this project's authoritative shared surface, and the collaborator who does
 * not use a terminal can see them.
 *
 * THE TWO-STRIKE RULE is the part that makes the report worth reading. A URL is
 * only listed as broken once it has failed **two consecutive weekly runs**. CI
 * cannot distinguish "this link is dead" from "this host refuses GitHub's runner
 * network" — that distinction cost a full PR cycle to learn (ADR 0027) — and a
 * report carrying that noise gets closed unread, which is the same failure as
 * having no report at all. Two strikes a week apart, likely from different
 * runner IPs, filters transient outages and single-run flakes.
 *
 * State lives in the issue body, in a machine-readable comment. That is
 * deliberate: the report and the memory of the report cannot drift apart, there
 * is no cache to poison (ADR 0027) and no bot commit to a protected branch.
 *
 * Usage:
 *   node scripts/report-link-rot.ts                    # reads link-report.json
 *   LYCHEE_JSON=other.json node scripts/report-link-rot.ts
 *   DRY_RUN=1 node scripts/report-link-rot.ts          # print, touch no issue
 *
 * Environment variables:
 *   LYCHEE_JSON  — lychee JSON report path (default: link-report.json)
 *   ISSUE_LABEL  — label identifying the tracking issue (default: link-rot)
 *   TODAY        — ISO date override, for tests (default: today, UTC)
 *   DRY_RUN      — when set, print the rendered issue instead of writing it
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Consecutive failing runs before a URL is reported. See the header. */
export const STRIKES_REQUIRED = 2;

const LYCHEE_JSON: string = process.env['LYCHEE_JSON'] ?? 'link-report.json';
const ISSUE_LABEL: string = process.env['ISSUE_LABEL'] ?? 'link-rot';
const ISSUE_TITLE = 'Broken external links';

/** Marker delimiting the machine-readable state inside the issue body. */
const STATE_OPEN = '<!-- link-rot-state:';
const STATE_CLOSE = '-->';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One failing URL as this run observed it. */
export interface BrokenLink {
  url: string;
  /** lychee's own words — "Rejected status code: 404 Not Found", "Timeout". */
  reason: string;
  /** Site-relative pages that link to it, so the fix has an address. */
  sources: string[];
}

/** What we remember about a URL across runs. */
export interface UrlState {
  firstSeen: string;
  lastSeen: string;
  /** Consecutive runs this URL has failed, including the most recent. */
  strikes: number;
  reason: string;
  sources: string[];
}

export type State = Readonly<Record<string, UrlState>>;

/** A `UrlState` with its key folded back in, for rendering. */
export type ReportedUrl = UrlState & { url: string };

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/**
 * Extract failing URLs from a lychee `--format json` report.
 *
 * Both `error_map` and `timeout_map` count: a host that hangs is as broken as
 * one that 404s, and the two hosts that started this were timeouts, not errors.
 * Keys are input sources (`_site/species/foo/index.html`); one URL can appear
 * under many, so sources are merged per URL and the URL is the identity.
 */
export function parseLycheeReport(report: unknown): BrokenLink[] {
  const maps = ['error_map', 'timeout_map'] as const;
  const byUrl = new Map<string, BrokenLink>();

  for (const mapName of maps) {
    const map = (report as Record<string, unknown>)[mapName];
    if (!map || typeof map !== 'object') continue;

    for (const [source, entries] of Object.entries(map as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const url = (entry as { url?: unknown }).url;
        if (typeof url !== 'string' || !url) continue;

        const status = (entry as { status?: { text?: unknown } }).status;
        const reason = typeof status?.text === 'string' && status.text
          ? status.text
          : mapName === 'timeout_map' ? 'Timeout' : 'Error';

        const existing = byUrl.get(url);
        if (existing) {
          if (!existing.sources.includes(source)) existing.sources.push(source);
        } else {
          byUrl.set(url, { url, reason, sources: [source] });
        }
      }
    }
  }

  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Fold this run's failures into the remembered state.
 *
 * A URL absent from `current` is dropped outright rather than decremented —
 * "strikes" means *consecutive*, so one recovery resets the count. Without that,
 * a link that fails every third week would accumulate to the threshold and be
 * reported as persistently broken, which it is not.
 */
export function mergeState(previous: State, current: BrokenLink[], today: string): State {
  const next: Record<string, UrlState> = {};

  for (const link of current) {
    const before = previous[link.url];
    next[link.url] = {
      firstSeen: before?.firstSeen ?? today,
      lastSeen: today,
      strikes: (before?.strikes ?? 0) + 1,
      reason: link.reason,
      sources: link.sources,
    };
  }

  return next;
}

/** Split remembered state into what to report and what is still on probation. */
export function classify(state: State): { confirmed: ReportedUrl[]; pending: ReportedUrl[] } {
  const entries: ReportedUrl[] = Object.entries(state)
    .map(([url, s]) => ({ ...s, url }))
    .sort((a, b) => a.url.localeCompare(b.url));

  return {
    confirmed: entries.filter((e) => e.strikes >= STRIKES_REQUIRED),
    pending: entries.filter((e) => e.strikes < STRIKES_REQUIRED),
  };
}

/** Read the embedded state back out of an issue body. Absent or corrupt → empty. */
export function parseIssueBody(body: string): State {
  const start = body.indexOf(STATE_OPEN);
  if (start === -1) return {};
  const from = start + STATE_OPEN.length;
  const end = body.indexOf(STATE_CLOSE, from);
  if (end === -1) return {};

  try {
    const parsed: unknown = JSON.parse(body.slice(from, end).trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as State;
  } catch {
    // A hand-edited body should cost one run's memory, never a crashed report.
    return {};
  }
}

function pageList(sources: string[]): string {
  const shown = sources.slice(0, 3).map((s) => `\`${s}\``).join(', ');
  const rest = sources.length - 3;
  return rest > 0 ? `${shown} …and ${rest} more` : shown;
}

/** Render the issue body, state comment included. */
export function renderIssueBody(state: State, today: string): string {
  const { confirmed, pending } = classify(state);
  const lines: string[] = [];

  lines.push(
    'Maintained automatically by [`link-rot.yml`](../blob/main/.github/workflows/link-rot.yml).',
    'This issue closes itself when every link below recovers — no need to close it by hand.',
    '',
    `Last checked: **${today}**`,
    '',
  );

  if (confirmed.length > 0) {
    lines.push(
      `## Broken (failed ${STRIKES_REQUIRED}+ consecutive weekly checks)`,
      '',
      '| URL | Failing since | Reason | Linked from |',
      '| --- | --- | --- | --- |',
      ...confirmed.map((e) =>
        `| ${e.url} | ${e.firstSeen} (${e.strikes} checks) | ${e.reason} | ${pageList(e.sources)} |`),
      '',
      '**Open each one in a browser before editing anything.** CI cannot tell a dead link from a',
      'host that refuses GitHub\'s runner network — see [ADR 0027](../blob/main/docs/adr/0027-no-link-check-cache.md),',
      'where exactly that mistake cost a PR cycle. If it loads fine for you, the fix is an `exclude`',
      'entry in [`lychee.toml`](../blob/main/lychee.toml) with a note saying why, not a link edit.',
      '',
    );
  } else {
    lines.push('## Broken', '', 'Nothing confirmed this week.', '');
  }

  if (pending.length > 0) {
    lines.push(
      '<details>',
      `<summary>Observed once, not yet confirmed (${pending.length}) — no action needed</summary>`,
      '',
      '| URL | First seen | Reason |',
      '| --- | --- | --- |',
      ...pending.map((e) => `| ${e.url} | ${e.firstSeen} | ${e.reason} |`),
      '',
      'These failed a single check. They are listed for transparency only; if the next weekly run',
      'passes they disappear. A one-off failure is usually the runner, not the site.',
      '',
      '</details>',
      '',
    );
  }

  lines.push(`${STATE_OPEN} ${JSON.stringify(state)} ${STATE_CLOSE}`);
  return lines.join('\n');
}

/** Title carries the actionable count, so the list view alone says whether to look. */
export function renderIssueTitle(state: State): string {
  const { confirmed } = classify(state);
  return confirmed.length > 0 ? `${ISSUE_TITLE} (${confirmed.length})` : ISSUE_TITLE;
}

/** Whether an issue should exist at all: nothing observed → nothing to track. */
export function shouldTrack(state: State): boolean {
  return Object.keys(state).length > 0;
}

// ---------------------------------------------------------------------------
// IO shell — `gh`, because it already carries the workflow's credentials
// ---------------------------------------------------------------------------

interface ExistingIssue {
  number: number;
  body: string;
}

function gh(args: string[], input?: string): string {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed (${result.status}): ${result.stderr?.trim()}`);
  }
  return result.stdout;
}

function findOpenIssue(label: string): ExistingIssue | null {
  const raw = gh(['issue', 'list', '--label', label, '--state', 'open', '--limit', '1',
    '--json', 'number,body']);
  const parsed = JSON.parse(raw) as ExistingIssue[];
  return parsed.length > 0 ? (parsed[0] ?? null) : null;
}

function main(): void {
  if (!existsSync(LYCHEE_JSON)) {
    console.error(`[link-rot] ERROR: ${LYCHEE_JSON} not found. Run the link check first.`);
    process.exit(1);
  }

  const today = process.env['TODAY'] ?? new Date().toISOString().slice(0, 10);
  const report: unknown = JSON.parse(readFileSync(LYCHEE_JSON, 'utf8'));
  const broken = parseLycheeReport(report);

  const dryRun = Boolean(process.env['DRY_RUN']);
  const existing = dryRun ? null : findOpenIssue(ISSUE_LABEL);
  const previous = existing ? parseIssueBody(existing.body) : {};
  const state = mergeState(previous, broken, today);
  const { confirmed, pending } = classify(state);

  console.log(
    `[link-rot] ${broken.length} failing URL(s) this run; ` +
    `${confirmed.length} confirmed (${STRIKES_REQUIRED}+ strikes), ${pending.length} pending`,
  );

  if (dryRun) {
    console.log(`\n--- ${renderIssueTitle(state)} ---\n${renderIssueBody(state, today)}`);
    return;
  }

  if (!shouldTrack(state)) {
    if (existing) {
      gh(['issue', 'close', String(existing.number), '--comment',
        `All previously reported links passed the ${today} check. Closing automatically.`]);
      console.log(`[link-rot] all links recovered — closed #${existing.number}`);
    } else {
      console.log('[link-rot] all links OK; no issue to open');
    }
    return;
  }

  const body = renderIssueBody(state, today);
  const title = renderIssueTitle(state);

  if (existing) {
    gh(['issue', 'edit', String(existing.number), '--title', title, '--body-file', '-'], body);
    console.log(`[link-rot] updated #${existing.number}`);
  } else {
    const url = gh(['issue', 'create', '--title', title, '--label', ISSUE_LABEL,
      '--body-file', '-'], body).trim();
    console.log(`[link-rot] opened ${url}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
