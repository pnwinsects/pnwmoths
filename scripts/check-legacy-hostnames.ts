/**
 * scripts/check-legacy-hostnames.ts
 *
 * Asserts that the retired WWU hostnames still redirect into this site.
 *
 * ## Why this exists
 *
 * In October 2026 WWU's side of the legacy arrangement was decommissioned and
 * every old hostname was left as a CNAME pointing at our Bunny pull zone. The
 * zone did not claim those names, so Bunny answered all of them — HTTP and
 * HTTPS alike — with `403 Domain suspended or not configured`, behind a
 * certificate that did not match the name. Eleven years of citations, BugGuide
 * entries and search results pointed into a wall.
 *
 * Nothing noticed. That is the part worth guarding against.
 *
 * The "Unmapped Legacy Links" queue on `/analytics/` is derived from
 * `/redirect.html?from=` rows in the Bunny access log ([ADR 0019]). With the
 * legacy hostnames refusing every request, no such row was ever written, so the
 * queue read **empty** — which renders identically to "every legacy link
 * resolves correctly". The telemetry could only ever measure misses among
 * requests that arrived; it had no way to say that nothing could arrive at all.
 *
 * So this check deliberately measures the thing the log cannot: that a request
 * sent to a legacy hostname is answered, and answered with the redirect we
 * expect. It is the only assertion in the repo that fails when the front door
 * is bricked up.
 *
 * ## What it asserts
 *
 * For each hostname, over **both** schemes:
 *   1. The response is a 301 (not a 403, not a 200, not a 302).
 *   2. The `Location` points at the expected target.
 *
 * Both schemes matter: these names have no HSTS of their own and a decade of
 * citations spell them `http://`. Bunny edge rules match on the full request
 * URL, so an `https://`-only pattern silently passes plain-HTTP traffic through
 * to a 404.
 *
 * A **deep path** is probed rather than `/`. If the hostname were claimed but
 * the edge rule's pattern were wrong, `/` would still answer 200 — by serving a
 * mirror of this site under the WWU name — and a home-page check would call
 * that healthy. The deep path is where mirroring and redirecting diverge.
 *
 * ## Why it is not part of `npm run build`
 *
 * The build is offline and hermetic. This reaches the public internet and
 * depends on CDN configuration that lives in the Bunny dashboard rather than in
 * the repo, so it sits beside `deploy:smoke` and `verify:cdn-cutover` as a
 * post-deploy/periodic check. Run it after any change to pull-zone hostnames or
 * edge rules, and on a schedule — the configuration it guards can be changed by
 * anyone with dashboard access, with no commit to review.
 *
 * Usage:
 *   node scripts/check-legacy-hostnames.ts
 *   LEGACY_PROBE_PATH=/species/Noctuidae/Apamea-amputatrix/ node scripts/check-legacy-hostnames.ts
 *
 * Environment variables:
 *   LEGACY_PROBE_PATH — site-relative path to probe (default: /browse-all/)
 *   LEGACY_TIMEOUT_MS — per-request timeout (default: 20000)
 */

import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The live site. Legacy traffic is redirected *to* this origin, never served under the old name. */
export const CANONICAL_ORIGIN = 'https://moths.pnwinsects.org';

/** The umbrella landing page the retired sibling sites point at. */
export const PNWINSECTS_LANDING = 'https://www.pnwinsects.org/';

const PROBE_PATH: string = process.env['LEGACY_PROBE_PATH'] ?? '/browse-all/';
const TIMEOUT_MS: number = Math.max(1000, Number(process.env['LEGACY_TIMEOUT_MS'] ?? '20000') || 20000);

const TAG = '[check-legacy-hostnames]';

/**
 * What each retired hostname must do.
 *
 * `targetPrefix` is a prefix rather than an exact URL because the moths names
 * carry the original path through into `?from=`, which varies with the probe.
 *
 * Keep this table in step with the Bunny edge rules recorded in [ADR 0050].
 * Bunny allows at most **5 trigger patterns per condition**, and each hostname
 * costs two (one per scheme) — which is why the sibling sites are spread over
 * two rules. Adding a sixth hostname means adding a rule, not a pattern.
 */
export interface LegacyHostnameExpectation {
  hostname: string;
  /** Expected `Location` prefix. */
  targetPrefix: string;
  /** True when the original path is preserved in the redirect target. */
  preservesPath: boolean;
  note: string;
}

export const LEGACY_HOSTNAMES: readonly LegacyHostnameExpectation[] = [
  {
    hostname: 'pnwmoths.biol.wwu.edu',
    targetPrefix: `${CANONICAL_ORIGIN}/redirect.html?from=`,
    preservesPath: true,
    note: 'the canonical legacy host — the one in every citation',
  },
  {
    hostname: 'pnwmoths-new.biol.wwu.edu',
    targetPrefix: `${CANONICAL_ORIGIN}/redirect.html?from=`,
    preservesPath: true,
    note: 'a staging name that outlived its purpose and is still in the wild',
  },
  {
    hostname: 'pnwantlions.biol.wwu.edu',
    targetPrefix: PNWINSECTS_LANDING,
    preservesPath: false,
    note: 'retired sibling site; never had substantive content',
  },
  {
    hostname: 'pnwbutterflies.biol.wwu.edu',
    targetPrefix: PNWINSECTS_LANDING,
    preservesPath: false,
    note: 'retired sibling site; content archived, no replacement yet',
  },
  {
    hostname: 'pnwsawflies.biol.wwu.edu',
    targetPrefix: PNWINSECTS_LANDING,
    preservesPath: false,
    note: 'retired sibling site; content archived, no replacement yet',
  },
];

// ---------------------------------------------------------------------------
// Exported helpers (tested in check-legacy-hostnames.test.ts)
// ---------------------------------------------------------------------------

/** Every URL to probe: each hostname over both schemes. */
export function probeUrls(
  expectations: readonly LegacyHostnameExpectation[],
  probePath: string,
): { url: string; expectation: LegacyHostnameExpectation }[] {
  const urls: { url: string; expectation: LegacyHostnameExpectation }[] = [];
  for (const expectation of expectations) {
    for (const scheme of ['http', 'https'] as const) {
      urls.push({ url: `${scheme}://${expectation.hostname}${probePath}`, expectation });
    }
  }
  return urls;
}

export interface ProbeOutcome {
  ok: boolean;
  detail: string;
}

/**
 * Judge one response.
 *
 * The 403 and 200 cases get their own messages on purpose. Both are failures,
 * but they are *different* failures with different fixes, and a bare
 * "unexpected status" would send the next person reading this output looking in
 * the wrong place:
 *
 * - **403** — the hostname is not on the pull zone at all. This is the original
 *   outage. Nothing reaches us; no telemetry will show it.
 * - **200** — the hostname is claimed but no edge rule matched, so Bunny is
 *   serving a full mirror of this site under the WWU name. Duplicate content,
 *   split cache, and the `/analytics/` queue stays empty because nobody is
 *   being sent through `/redirect.html`.
 */
export function classifyResponse(
  status: number,
  location: string | null,
  expectation: LegacyHostnameExpectation,
  expectedFromPath: string,
): ProbeOutcome {
  if (status === 403) {
    return {
      ok: false,
      detail:
        'HTTP 403 — hostname is not claimed by the pull zone. Legacy links are dead. ' +
        'Add it under Bunny → Pull Zone → Hostnames (see ADR 0050).',
    };
  }

  if (status === 200) {
    return {
      ok: false,
      detail:
        'HTTP 200 — hostname is claimed but no edge rule matched, so the site is being ' +
        'mirrored under the legacy name. Check the rule patterns cover this scheme (ADR 0050).',
    };
  }

  if (status !== 301) {
    return { ok: false, detail: `HTTP ${status} — expected 301.` };
  }

  if (!location) {
    return { ok: false, detail: 'HTTP 301 with no Location header.' };
  }

  if (!location.startsWith(expectation.targetPrefix)) {
    return {
      ok: false,
      detail: `redirects to ${location} — expected a target starting ${expectation.targetPrefix}`,
    };
  }

  if (expectation.preservesPath) {
    const expected = `${expectation.targetPrefix}${expectedFromPath}`;
    if (location !== expected) {
      return {
        ok: false,
        detail:
          `path not carried through: got ${location}, expected ${expected}. ` +
          'The edge rule target should end `?from={{path}}`.',
      };
    }
  }

  return { ok: true, detail: `301 -> ${location}` };
}

/** Format one line of console output. */
export function formatOutcome(url: string, outcome: ProbeOutcome): string {
  return `  ${outcome.ok ? '✓' : '✗'} ${url}\n      ${outcome.detail}`;
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function probe(url: string): Promise<{ status: number; location: string | null }> {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'User-Agent': 'pnwmoths-legacy-hostname-check/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, location: res.headers.get('location') };
}

async function main(): Promise<void> {
  const targets = probeUrls(LEGACY_HOSTNAMES, PROBE_PATH);
  console.log(`${TAG} probing ${targets.length} URL(s) with path ${PROBE_PATH}`);
  console.log('');

  let failed = 0;
  for (const { url, expectation } of targets) {
    let outcome: ProbeOutcome;
    try {
      const { status, location } = await probe(url);
      outcome = classifyResponse(status, location, expectation, PROBE_PATH);
    } catch (err) {
      outcome = { ok: false, detail: `request failed: ${(err as Error).message}` };
    }
    if (!outcome.ok) failed++;
    console.log(formatOutcome(url, outcome));
  }

  console.log('');
  console.log(`${TAG} ${targets.length - failed} passed, ${failed} failed out of ${targets.length}`);

  if (failed > 0) {
    console.error(
      `${TAG} legacy inbound links are broken. This does NOT show up in the ` +
        `/analytics/ unmapped-links queue — that queue only sees requests which arrive.`,
    );
    process.exit(1);
  }

  console.log(`${TAG} all legacy hostnames redirect correctly.`);
}

// ---------------------------------------------------------------------------
// Self-invocation guard
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error((err as Error).message); process.exit(1); });
}
