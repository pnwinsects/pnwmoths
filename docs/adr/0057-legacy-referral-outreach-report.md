# 0057. Legacy-link outreach is measured at the first request to the retired hostname

**Status:** Accepted - Refs [#442](https://github.com/pnwinsects/pnwmoths/issues/442)
Extends [ADR 0019](0019-legacy-link-telemetry-from-logs.md) and
[ADR 0050](0050-legacy-wwu-hostnames.md)

## Context

WWU expects to keep the retired DNS names alive for roughly a year. We want to
identify sites still linking to those names, then review about a month of new
evidence alongside backlink research before contacting their maintainers.

The existing Top Referrers table counts all requests to the pull zone, including
assets and requests directly to the new site. It cannot identify legacy-link
consumers. The redirect landing page is also too late: it mixes direct requests
with redirected traffic and can obscure the original referral.

## Decision

- The nightly collector writes `legacy_referrals` in schema version 5, counting
  initial **301** responses on the two legacy moth hostnames declared by the
  hostname guard (`preservesPath: true`). Both HTTP and HTTPS count. Retired
  sibling sites do not: their destinations and outreach needs are different.
- Before ranking domains, exclude assets/downloads, browser defaults, scanner
  probes, and recognized crawler/script user agents. Disclose the excluded count.
  Keep missing/invalid referrers and internal referrals in separate counters.
  Referrals from our canonical/CDN/umbrella and retired sibling hosts are internal.
- Normalize hostname case, trailing dots, ports, and the leading `www.` alias.
  Store external referring **domains only** and counts by requested old path,
  without query strings or fragments. Store no referring-page paths, IPs, user
  agents, cookies, or new visitor identifiers.
- Preserve all admitted domain/path counts in daily files. Rank only after the
  build merges them, so a modest source recurring daily cannot disappear behind
  daily top-N caps. Publish the top 25 domains and top five paths per domain.
- Render a static HTML section on `/analytics/`, equally available with or
  without JavaScript. It uses the 30 calendar days ending on the latest analytics
  date, independent of the dashboard's year filter. Show the reporting window,
  actual collection dates and number of collected days. Missing old fields mean
  **not collected**, not evidence of zero referrals. Register its section in the
  `/curation/` report manifest so maintainers can find it there too.
- Collection is prospective. No backfill, outreach, or reminder automation is
  part of this change.

## Consequences

The existing nightly fetch/upload/deploy pipeline carries the report without
new services, client tracking, credentials, or CDN rule changes. Older daily
files still load.

These are requests, not verified people or unique visits. Bot recognition is
heuristic and referrer headers can be forged. Bookmarks, privacy settings, apps,
and HTTPS-to-HTTP links may send no referrer; redirects cannot recover one that
was never sent. The report supplies outreach leads, not proof of a relationship
or a complete backlink inventory.

301s cached in browsers can bypass the first request on later visits, so counts
are observations, not the full volume of legacy-link use. The hostname guard
still detects broken DNS/rules: an empty referral report cannot prove that the
legacy entry points work.
