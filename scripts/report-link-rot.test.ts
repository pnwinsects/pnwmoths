import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLycheeReport,
  mergeState,
  classify,
  parseIssueBody,
  renderIssueBody,
  renderIssueTitle,
  shouldTrack,
  STRIKES_REQUIRED,
} from './report-link-rot.ts';
import type { State } from './report-link-rot.ts';

// ---------------------------------------------------------------------------
// parseLycheeReport
// ---------------------------------------------------------------------------

describe('parseLycheeReport', () => {
  it('extracts url, reason and source from error_map', () => {
    const result = parseLycheeReport({
      error_map: {
        '_site/about/index.html': [
          { url: 'https://example.com/gone', status: { text: 'Rejected status code: 404 Not Found', code: 404 } },
        ],
      },
    });
    assert.deepEqual(result, [{
      url: 'https://example.com/gone',
      reason: 'Rejected status code: 404 Not Found',
      sources: ['_site/about/index.html'],
    }]);
  });

  it('includes timeout_map — a host that hangs is as broken as one that 404s', () => {
    const result = parseLycheeReport({
      timeout_map: { '_site/index.html': [{ url: 'https://slow.example', status: { text: 'Timeout' } }] },
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.url, 'https://slow.example');
  });

  it('merges one URL appearing across many pages into a single entry', () => {
    const entry = { url: 'https://example.com/x', status: { text: 'Timeout' } };
    const result = parseLycheeReport({
      error_map: { '_site/a/index.html': [entry], '_site/b/index.html': [entry] },
    });
    assert.equal(result.length, 1);
    assert.deepEqual(result[0]?.sources, ['_site/a/index.html', '_site/b/index.html']);
  });

  it('does not duplicate a source that reports the same URL twice', () => {
    const result = parseLycheeReport({
      error_map: {
        '_site/a/index.html': [
          { url: 'https://example.com/x', status: { text: 'Timeout' } },
          { url: 'https://example.com/x', status: { text: 'Timeout' } },
        ],
      },
    });
    assert.deepEqual(result[0]?.sources, ['_site/a/index.html']);
  });

  it('falls back to a reason when status text is missing', () => {
    const errors = parseLycheeReport({ error_map: { a: [{ url: 'https://e.example' }] } });
    const timeouts = parseLycheeReport({ timeout_map: { a: [{ url: 'https://t.example' }] } });
    assert.equal(errors[0]?.reason, 'Error');
    assert.equal(timeouts[0]?.reason, 'Timeout');
  });

  it('returns empty for a clean report', () => {
    assert.deepEqual(parseLycheeReport({ error_map: {}, timeout_map: {} }), []);
  });

  it('tolerates a malformed report rather than throwing', () => {
    assert.deepEqual(parseLycheeReport({}), []);
    assert.deepEqual(parseLycheeReport({ error_map: null }), []);
    assert.deepEqual(parseLycheeReport({ error_map: { a: 'not-an-array' } }), []);
    assert.deepEqual(parseLycheeReport({ error_map: { a: [{ no_url: 1 }] } }), []);
  });
});

// ---------------------------------------------------------------------------
// mergeState — the two-strike rule
// ---------------------------------------------------------------------------

describe('mergeState', () => {
  const link = { url: 'https://example.com/x', reason: 'Timeout', sources: ['_site/a/index.html'] };

  it('records a first failure with one strike', () => {
    const state = mergeState({}, [link], '2026-08-10');
    assert.equal(state['https://example.com/x']?.strikes, 1);
    assert.equal(state['https://example.com/x']?.firstSeen, '2026-08-10');
  });

  it('increments strikes and keeps the original firstSeen', () => {
    const first = mergeState({}, [link], '2026-08-10');
    const second = mergeState(first, [link], '2026-08-17');
    assert.equal(second['https://example.com/x']?.strikes, 2);
    assert.equal(second['https://example.com/x']?.firstSeen, '2026-08-10');
    assert.equal(second['https://example.com/x']?.lastSeen, '2026-08-17');
  });

  it('drops a URL that passed this run', () => {
    const first = mergeState({}, [link], '2026-08-10');
    assert.deepEqual(mergeState(first, [], '2026-08-17'), {});
  });

  it('resets the count after a recovery — strikes must be CONSECUTIVE', () => {
    // A link failing every other week must never accumulate to the threshold.
    let state: State = mergeState({}, [link], '2026-08-10');
    state = mergeState(state, [], '2026-08-17');
    state = mergeState(state, [link], '2026-08-24');
    assert.equal(state['https://example.com/x']?.strikes, 1);
    assert.equal(state['https://example.com/x']?.firstSeen, '2026-08-24');
    assert.deepEqual(classify(state).confirmed, []);
  });

  it('refreshes reason and sources from the latest run', () => {
    const first = mergeState({}, [link], '2026-08-10');
    const changed = { ...link, reason: 'Rejected status code: 404 Not Found', sources: ['_site/b/index.html'] };
    const second = mergeState(first, [changed], '2026-08-17');
    assert.equal(second['https://example.com/x']?.reason, 'Rejected status code: 404 Not Found');
    assert.deepEqual(second['https://example.com/x']?.sources, ['_site/b/index.html']);
  });
});

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

describe('classify', () => {
  it('holds a single failure back as pending', () => {
    const state = mergeState({}, [{ url: 'https://e.example', reason: 'Timeout', sources: [] }], '2026-08-10');
    const { confirmed, pending } = classify(state);
    assert.deepEqual(confirmed, []);
    assert.equal(pending.length, 1);
  });

  it('promotes to confirmed at the threshold', () => {
    const link = { url: 'https://e.example', reason: 'Timeout', sources: [] };
    let state: State = {};
    for (let i = 0; i < STRIKES_REQUIRED; i++) state = mergeState(state, [link], `2026-08-1${i}`);
    assert.equal(classify(state).confirmed.length, 1);
    assert.deepEqual(classify(state).pending, []);
  });

  it('sorts by URL so the issue body is stable between runs', () => {
    const state = mergeState({}, [
      { url: 'https://b.example', reason: 'Timeout', sources: [] },
      { url: 'https://a.example', reason: 'Timeout', sources: [] },
    ], '2026-08-10');
    assert.deepEqual(classify(state).pending.map((e) => e.url), ['https://a.example', 'https://b.example']);
  });
});

// ---------------------------------------------------------------------------
// Issue body round-trip — the state store
// ---------------------------------------------------------------------------

describe('issue body state', () => {
  const link = { url: 'https://example.com/x', reason: 'Timeout', sources: ['_site/a/index.html'] };

  it('round-trips state through render and parse', () => {
    const state = mergeState({}, [link], '2026-08-10');
    assert.deepEqual(parseIssueBody(renderIssueBody(state, '2026-08-10')), state);
  });

  it('round-trips a confirmed entry, which renders a different body', () => {
    let state: State = mergeState({}, [link], '2026-08-10');
    state = mergeState(state, [link], '2026-08-17');
    const body = renderIssueBody(state, '2026-08-17');
    assert.match(body, /## Broken \(failed/);
    assert.deepEqual(parseIssueBody(body), state);
  });

  it('returns empty state for a body with no marker', () => {
    assert.deepEqual(parseIssueBody('someone rewrote this issue by hand'), {});
  });

  it('returns empty state rather than throwing on corrupt JSON', () => {
    assert.deepEqual(parseIssueBody('<!-- link-rot-state: {not json} -->'), {});
  });

  it('returns empty state for a truncated marker', () => {
    assert.deepEqual(parseIssueBody('<!-- link-rot-state: {"a":1}'), {});
  });

  it('ignores a JSON array, which is not a state map', () => {
    assert.deepEqual(parseIssueBody('<!-- link-rot-state: [1,2] -->'), {});
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('renderIssueBody', () => {
  const link = { url: 'https://example.com/x', reason: 'Timeout', sources: ['_site/a/index.html'] };

  it('puts pending entries behind a collapsed section, not the actionable list', () => {
    const body = renderIssueBody(mergeState({}, [link], '2026-08-10'), '2026-08-10');
    assert.match(body, /<details>/);
    assert.match(body, /Nothing confirmed this week/);
  });

  it('tells the reader to check in a browser before editing links', () => {
    let state: State = mergeState({}, [link], '2026-08-10');
    state = mergeState(state, [link], '2026-08-17');
    const body = renderIssueBody(state, '2026-08-17');
    assert.match(body, /Open each one in a browser/);
    assert.match(body, /0027/);
  });

  it('truncates a long source list', () => {
    const many = { ...link, sources: ['a', 'b', 'c', 'd', 'e'] };
    let state: State = mergeState({}, [many], '2026-08-10');
    state = mergeState(state, [many], '2026-08-17');
    assert.match(renderIssueBody(state, '2026-08-17'), /…and 2 more/);
  });

  it('says it closes itself, so nobody closes it by hand', () => {
    assert.match(renderIssueBody({}, '2026-08-10'), /closes itself/);
  });
});

describe('renderIssueTitle', () => {
  const link = { url: 'https://example.com/x', reason: 'Timeout', sources: [] };

  it('carries the confirmed count so the issue list alone says whether to look', () => {
    let state: State = mergeState({}, [link], '2026-08-10');
    assert.equal(renderIssueTitle(state), 'Broken external links');
    state = mergeState(state, [link], '2026-08-17');
    assert.equal(renderIssueTitle(state), 'Broken external links (1)');
  });
});

describe('shouldTrack', () => {
  it('is false when nothing is failing, so the issue closes', () => {
    assert.equal(shouldTrack({}), false);
  });

  it('is true while anything is pending, so one strike is not forgotten', () => {
    const state = mergeState({}, [{ url: 'https://e.example', reason: 'Timeout', sources: [] }], '2026-08-10');
    assert.equal(shouldTrack(state), true);
  });
});
