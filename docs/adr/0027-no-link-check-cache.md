# 0027. The link check keeps no result cache

**Status:** Accepted

## Context

PR #260's `build` check failed on a link nobody had touched:

```text
[_site/about/related-sites/index.html]:
[ERROR] https://www.lepsoc.org/ | Error (cached)
```

`https://www.lepsoc.org/` was up and serving 200 throughout. The failure came out of the restored
lychee cache, and deleting that one cache entry made the check pass with no code change.

Three settings combined into a trap (issue #261):

1. **`production.yml` ran the link check as non-blocking** (`continue-on-error: true`) — correctly,
   since someone else's downtime should not block a deploy.
2. **It cached the result anyway.** `pr-check.yml`, `production.yml` and `staging.yml` all saved to
   `lychee-cache-${{ github.run_id }}` and restored with `restore-keys: lychee-cache-`, one shared
   namespace. GitHub Actions cache scoping made this strictly one-directional: `pr-check.yml` runs
   only on `pull_request`, so its caches were visible only to that PR, while every PR could restore
   `main`'s — which only the two non-blocking workflows ever wrote.
3. **`max_cache_age = "7d"`** meant a cached *error* was treated as fresh for a week and never
   re-probed.

So a transient error during a deploy was recorded without failing anything, then restored into the
blocking PR check. It could not self-heal, and the error named an external site the contributor had
never touched.

The fix turns on how much the cache was actually worth, and the honest answer is: almost nothing.
Against the current build, `lychee --dump` with the real config resolves to **2,993 unique links**:

| kind | unique links | cached? |
| --- | --- | --- |
| `file://` internal links | 2,958 | **never** — `ignore_cache()` returns true for any file URI |
| external HTTP | **35** | yes |

The `max_cache_age` comment claimed the long window "cuts re-checks of stable internal links". It
never did: `--root-dir _site` resolves internal links to `file://` URIs, and lychee refuses to cache
those because the filesystem is fast enough that caching has no benefit.

The other half of the comment — flakiness against rate-limited hosts — is handled by the `exclude`
list, not the cache. The ~2,400 third-party species links (BugGuide, MPG, BAMONA) are excluded
outright, as are the WAF-protected institution hosts.

The CDN images were the one genuinely large class, and they left lychee's workload for an unrelated
reason: [ADR 0022](0022-pregenerated-image-derivatives.md) retired the Bunny Optimizer, so
derivatives are emitted as plain `.webp`/`.jpg` paths instead of `…?width=530`, and the extension
exclude now covers all 17,000 of them. Their existence is proven offline against the committed
`data/image-derivatives.csv` manifest by `scripts/check-derivatives.ts`, per
[ADR 0017](0017-reproducible-committed-artifacts.md) — the manifest answers the question exactly,
where 23,172 HEAD requests would fail the build on any network blip. A stale `.lycheecache` from the
Optimizer era still holds 11,806 entries, 11,772 of them CDN images, which is why the cache *looks*
valuable until it is measured against a current build.

## Decision

**The link check keeps no result cache.** `cache` and `max_cache_age` are gone from `lychee.toml`,
and the `actions/cache` step is gone from all three workflows.

Every run re-probes the 35 external URLs. They run concurrently, so in the normal case the added
wall-clock is roughly one request against a multi-minute build — measured at 3s for the whole check,
2,993 unique links included. The worst case is bounded by the slowest single URL, and that bound is
`timeout = 20` × the `max_retries = 3` attempts, not `timeout` alone: one unreachable host can hold
the check open for about a minute before failing it.

This removes the bug class rather than managing it. With no cached state there is nothing for a
non-blocking run to write, nothing for a blocking run to trust, and no shared namespace to reason
about.

## What removing it immediately revealed

The first cache-free run went red on two Government of Canada hosts — `agriculture.canada.ca`
(linked from every species page, so 1,238 of the 1,238 errors) and `geonames.nrcan.gc.ca` — with
129 timeouts and an 8m40s link check. Both serve 200 in ~0.3s from a workstation. They are excluded
now, alongside `cbif.gc.ca`, which was already in that list for what was evidently the same reason.

This corrects the framing above, and issue #261's. The cache was **not** turning a transient failure
sticky; it was turning a *persistent* one invisible. Two facts establish it:

- The production run named in #261 as writing the poisoned entry, `30808703476`, shows
  `[TIMEOUT] https://www.lepsoc.org` in its own log. The cached error was a faithful recording of a
  real condition — the host does not answer GitHub's runners — not a fluke. #261's "was up and
  returning 200 the whole time" was measured from a browser.
- Of the previous 20 production runs, 18 were clean. That is not evidence those hosts were
  reachable: with a 7-day window those runs **never probed them**. Failures appear exactly in the
  runs where the entry had aged out and the URL was re-checked, which is the opposite of a low
  failure rate.

A cache that suppresses probing does not make a check pass; it makes the check stop asking, and the
green tick then means nothing about the hosts it covered.

## Consequences

- 33 external requests per CI run, spread over 25 hosts. At CI volumes this is unremarkable traffic
  for any of them.
- **A blocking PR check is exposed to third-party hosts that refuse GitHub's runners**, where before
  it could ride a cached success. Where that is a real outage, the failure is honest and clears on
  re-run. Where it is cloud-IP blocking, as with the two hosts above, a re-run cannot clear it and
  the host belongs in `exclude` with evidence — verified by hand, not assumed.
- **This is the trade to watch.** 33 hosts, any of which can block a contributor for a reason no
  contributor can fix, and the honest expectation is that the exclude list grows. If that becomes
  routine, the structural answer is to make the PR check internal-only (`lychee --offline`, 0.5s,
  2,958 `file://` links — the only links a PR can actually break) and leave external coverage to the
  non-blocking production run or a scheduled job. Tracked in
  [#263](https://github.com/pnwinsects/pnwmoths/issues/263); not done here because it changes what
  the PR gate means, which is a larger decision than removing a cache.
- `.lycheecache` is no longer written. It stays in `.gitignore`; a stale local copy is inert.
- The `lychee-cache-*` entries in the Actions cache are now unread and expire on their own.
- **If the external link count grows by an order of magnitude, revisit** — but re-read this ADR
  first, because the answer is likely another `exclude` entry or an offline manifest, which is what
  actually removed the last large class.

## Alternatives considered

- **Keep the cache but stop caching failures.** Rejected: lychee cannot express it. `ignore_cache()`
  consults `cache_exclude_status` only via `Status::code()`, which is `None` for connection failures,
  DNS errors and TLS timeouts — those are stored as `CacheStatus::Error(None)` and re-loaded as fresh
  for the full window. Covering them means a script that prunes `.lycheecache` to 2xx rows before
  every run: a new script and its tests, to protect 35 requests.
- **Separate the cache namespaces** (`lychee-cache-pr-` / `-prod-` / `-staging-`), which issue #261
  proposed doing regardless. Rejected once measured: because `pr-check.yml` never runs on `main`, a
  `-pr-` key would never exist there, so every PR would run cold anyway — the isolation and dropping
  the cache produce the same requests, and dropping it is three fewer workflow steps.
- **Stop caching only in the non-blocking runs.** Rejected for the same reason: those are the only
  runs that ever populated a cache a PR could restore, so this is dropping the cache with extra
  configuration left behind to imply otherwise.
- **Make the production link check blocking, so it cannot record what it will not fail on.**
  Rejected: a third party's downtime must not block a deploy of unrelated content. The non-blocking
  posture is correct; writing shared state from it was the defect.
