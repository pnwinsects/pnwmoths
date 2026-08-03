# 0027. The link check keeps no result cache

**Status:** Accepted

## Context

PR #260's `build` check failed on a link nobody had touched:

```
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

Every run re-probes the 35 external URLs. They run concurrently, so the added wall-clock is roughly
one request — bounded by `timeout = 20` — against a multi-minute build.

This removes the bug class rather than managing it. With no cached state there is nothing for a
non-blocking run to write, nothing for a blocking run to trust, and no shared namespace to reason
about. A transient outage now fails one run, and a re-run clears it.

## Consequences

- 35 external requests per CI run, spread over 27 hosts. At CI volumes this is unremarkable traffic
  for any of them.
- **A blocking PR check is now exposed to live third-party downtime**, where before it could ride a
  cached success. This is the deliberate trade: a live failure is honest, names a real condition, and
  clears on re-run. The stuck-for-a-week alternative was neither. `max_retries = 3` and the `exclude`
  list absorb the ordinary noise.
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
