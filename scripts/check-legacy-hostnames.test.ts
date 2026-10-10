import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  probeUrls,
  classifyResponse,
  formatOutcome,
  LEGACY_HOSTNAMES,
  CANONICAL_ORIGIN,
  PNWINSECTS_LANDING,
} from './check-legacy-hostnames.ts';
import type { LegacyHostnameExpectation } from './check-legacy-hostnames.ts';

const mothsExpectation: LegacyHostnameExpectation = {
  hostname: 'pnwmoths.biol.wwu.edu',
  targetPrefix: `${CANONICAL_ORIGIN}/redirect.html?from=`,
  preservesPath: true,
  note: 'test fixture',
};

const siblingExpectation: LegacyHostnameExpectation = {
  hostname: 'pnwsawflies.biol.wwu.edu',
  targetPrefix: PNWINSECTS_LANDING,
  preservesPath: false,
  note: 'test fixture',
};

// ---------------------------------------------------------------------------
// probeUrls
// ---------------------------------------------------------------------------

describe('probeUrls', () => {
  it('probes every hostname over both schemes', () => {
    const urls = probeUrls([mothsExpectation], '/browse-all/');
    assert.deepEqual(
      urls.map((u) => u.url),
      [
        'http://pnwmoths.biol.wwu.edu/browse-all/',
        'https://pnwmoths.biol.wwu.edu/browse-all/',
      ],
    );
  });

  // The original outage was invisible partly because nothing checked plain
  // HTTP, which is how a decade of citations spell these hostnames.
  it('never drops the http scheme', () => {
    const urls = probeUrls(LEGACY_HOSTNAMES, '/');
    const schemes = new Set(urls.map((u) => new URL(u.url).protocol));
    assert.deepEqual([...schemes].sort(), ['http:', 'https:']);
  });

  it('carries the expectation alongside each URL', () => {
    const urls = probeUrls([siblingExpectation], '/x/');
    assert.ok(urls.every((u) => u.expectation === siblingExpectation));
  });
});

// ---------------------------------------------------------------------------
// classifyResponse
// ---------------------------------------------------------------------------

describe('classifyResponse', () => {
  it('accepts a 301 that carries the path into ?from=', () => {
    const outcome = classifyResponse(
      301,
      `${CANONICAL_ORIGIN}/redirect.html?from=/browse-all/`,
      mothsExpectation,
      '/browse-all/',
    );
    assert.equal(outcome.ok, true);
  });

  it('accepts a 301 to the landing page for a sibling site', () => {
    const outcome = classifyResponse(301, PNWINSECTS_LANDING, siblingExpectation, '/anything/');
    assert.equal(outcome.ok, true);
  });

  // The outage itself: Bunny refusing a hostname it does not own.
  it('reports a 403 as an unclaimed hostname', () => {
    const outcome = classifyResponse(403, null, mothsExpectation, '/browse-all/');
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /not claimed by the pull zone/);
  });

  // The near-miss: hostname added but the edge rule pattern missed, so the
  // whole site gets mirrored under the legacy name.
  it('reports a 200 as an unmatched edge rule rather than success', () => {
    const outcome = classifyResponse(200, null, mothsExpectation, '/browse-all/');
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /mirrored under the legacy name/);
  });

  it('rejects a 302, because the point is to move bookmarks and indexes', () => {
    const outcome = classifyResponse(
      302,
      `${CANONICAL_ORIGIN}/redirect.html?from=/browse-all/`,
      mothsExpectation,
      '/browse-all/',
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /expected 301/);
  });

  it('rejects a 301 with no Location header', () => {
    const outcome = classifyResponse(301, null, mothsExpectation, '/browse-all/');
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /no Location header/);
  });

  it('rejects a redirect to an unexpected origin', () => {
    const outcome = classifyResponse(
      301,
      'https://example.com/',
      mothsExpectation,
      '/browse-all/',
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /expected a target starting/);
  });

  // A rule whose target is a bare URL instead of `?from={{path}}` sends every
  // legacy deep link to the home page. Every hostname still "redirects", so a
  // status-code-only check would pass.
  it('rejects a redirect that drops the original path', () => {
    const outcome = classifyResponse(
      301,
      `${CANONICAL_ORIGIN}/redirect.html?from=/`,
      mothsExpectation,
      '/browse-all/',
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.detail, /path not carried through/);
  });

  it('does not require path preservation for sibling sites', () => {
    const outcome = classifyResponse(301, PNWINSECTS_LANDING, siblingExpectation, '/deep/path/');
    assert.equal(outcome.ok, true);
  });
});

// ---------------------------------------------------------------------------
// formatOutcome
// ---------------------------------------------------------------------------

describe('formatOutcome', () => {
  it('marks passes and failures distinguishably', () => {
    const pass = formatOutcome('https://x/', { ok: true, detail: 'fine' });
    const fail = formatOutcome('https://x/', { ok: false, detail: 'broken' });
    assert.match(pass, /✓/);
    assert.match(fail, /✗/);
    assert.notEqual(pass, fail);
  });
});

// ---------------------------------------------------------------------------
// LEGACY_HOSTNAMES table
// ---------------------------------------------------------------------------

describe('LEGACY_HOSTNAMES', () => {
  it('covers every hostname WWU pointed at this pull zone', () => {
    assert.deepEqual(
      LEGACY_HOSTNAMES.map((h) => h.hostname).sort(),
      [
        'pnwantlions.biol.wwu.edu',
        'pnwbutterflies.biol.wwu.edu',
        'pnwmoths-new.biol.wwu.edu',
        'pnwmoths.biol.wwu.edu',
        'pnwsawflies.biol.wwu.edu',
      ],
    );
  });

  it('only the moths hostnames preserve the request path', () => {
    const preserving = LEGACY_HOSTNAMES.filter((h) => h.preservesPath).map((h) => h.hostname);
    assert.deepEqual(preserving.sort(), ['pnwmoths-new.biol.wwu.edu', 'pnwmoths.biol.wwu.edu']);
  });

  // Bunny caps a condition at 5 trigger patterns and each hostname costs two
  // (http + https). Exceeding it makes the dashboard refuse the save, which is
  // easy to misread as a typo — see ADR 0050.
  it('stays within the trigger budget its edge rules can express', () => {
    const PATTERNS_PER_HOSTNAME = 2;
    const MAX_PATTERNS_PER_CONDITION = 5;
    const maxHostnamesPerRule = Math.floor(MAX_PATTERNS_PER_CONDITION / PATTERNS_PER_HOSTNAME);
    const rulesNeeded = Math.ceil(LEGACY_HOSTNAMES.length / maxHostnamesPerRule);
    assert.equal(maxHostnamesPerRule, 2);
    assert.equal(rulesNeeded, 3);
  });
});
