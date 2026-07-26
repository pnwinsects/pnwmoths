# 0019. Legacy-link telemetry is derived from CDN access logs, not a client beacon

**Status:** Accepted

## Context

`/redirect.html?from=/old/wwu/path` is the landing pad for inbound links to the retired
pnwmoths.biol.wwu.edu site. When its table has no mapping for a path, the visitor is dropped on
Browse or the home page with an apology. Nobody found out that this had happened
([#181](https://github.com/pnwinsects/pnwmoths/issues/181)): the page's only record of a miss was a
`console.warn` in the visitor's own browser, plus a `navigator.sendBeacon` to
`window.__PNWMOTHS_REDIRECT_LOG_URL` — a global nothing ever set, pointing at an endpoint that does
not exist and, under [0001](0001-static-no-server.md), never will.

So the mappings that most needed writing were exactly the ones no maintainer could see.

The obvious fixes all want a server: a logging endpoint, a third-party analytics account, an edge
function. But the site already collects the answer. Bunny's access log records the full request
path *including the query string* — `stripQueryString()` in
[`scripts/fetch-analytics.ts`](../../scripts/fetch-analytics.ts) exists precisely because it does —
and the nightly `analytics:fetch` job already paginates every request for the day. Every miss has
been sitting in a log line the whole time; the aggregation simply discarded the `?from=` before
counting.

## Decision

**Missed legacy redirects are recovered by replaying the resolver over the CDN access log, and no
client-side beacon is used.**

Three parts:

1. The resolution table and algorithm move out of the inline script in `src/redirect.njk` into
   [`src/_lib/legacy-redirects.ts`](../../src/_lib/legacy-redirects.ts). The page imports it (Vite
   bundles it, as with `_lib/key-filter.ts` for `pnwm-identify`), and `scripts/fetch-analytics.ts`
   imports the same module.
2. `aggregate()` classifies every `/redirect.html?from=…` log row through `resolveLegacyPath()` and
   emits `redirect_hits`, `redirect_misses` (normalized path, hit count, most frequent referrer) and
   `not_found` (top 404 paths) in the daily JSON, at `schema_version: 3`.
3. `/analytics/` renders both lists — in the Lit dashboard and in the `<noscript>` fallback — as a
   maintainer work queue. Each row is one mapping to add to `STATIC_MAP`, `SYNONYMS`, or
   [`data/species-redirects.csv`](../../data/species-redirects.csv).

The shared module is the load-bearing part. Two copies of the resolver would drift, and the report
would then describe a resolver nobody is running.

404s are tracked alongside redirect misses because they answer a question the redirect page cannot:
a legacy URL only reaches `/redirect.html` if something routes it there, so anything that 404s is a
link the redirect handler never saw at all.

## Consequences

- No new infrastructure, no runtime dependency, nothing to keep alive. The reporting path is the
  deploy path that already exists.
- Telemetry is aggregate-only — counts by path plus a referrer domain. No new personal data is
  collected beyond what the CDN log already holds.
- Bunny retains logs for 72 hours, so this only sees misses while the nightly job keeps running,
  and past misses cannot be backfilled. A run of failed jobs is a permanent hole in the record.
- The redirect page is now a Vite entry (`<script type="module">`) rather than a classic inline
  script, adding one small module request before it can redirect. Acceptable: the page is already
  useless without JavaScript, and it is a waypoint rather than a destination.
- Query strings are now stripped before matching, so `/gsearch/?q=moth` resolves where it used to
  fall through to the home page, and one legacy page reports as one row rather than one row per
  tracking-parameter variant.
- `schema_version` 3 files gain fields; `src/_data/analytics.ts` defaults them to empty, so the
  archive of v2 days already on Bunny keeps rendering.

## Alternatives rejected

- **`navigator.sendBeacon` to a logging endpoint.** What the code pretended to do. Requires a
  server to receive it, which [0001](0001-static-no-server.md) forbids.
- **Beacon to a sentinel static asset** (e.g. `GET /_/redirect-miss.gif?from=…`) so the request
  lands in the CDN log. Works, but it invents a second, weaker channel for information the
  `/redirect.html` request already carries, and the extra request can be cancelled by the
  navigation that follows it.
- **Google Analytics events.** The `gtag` hook is retained where it exists, but it cannot be the
  mechanism: gtag is not loaded on this site, the data would live in someone's account rather than
  in the repo, and it is blocked for a large share of visitors.
- **Leave the client-side `console.warn` and ask people to report broken links.** This is the status
  quo that produced the issue.
