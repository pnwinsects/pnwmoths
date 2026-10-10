# 0050. Legacy WWU hostnames are claimed by our pull zone and 301 into the new site

**Status:** Accepted · Refs [#181](https://github.com/pnwinsects/pnwmoths/issues/181) ·
Extends [ADR 0009](0009-bunny-cache-policy.md) · Amends [ADR 0019](0019-legacy-link-telemetry-from-logs.md)

## Context

For eleven years the catalogue lived at `pnwmoths.biol.wwu.edu`, on a server run by a WWU
sysadmin under a CSE-funded post. That post ended. His supervisor asked that WWU stop
maintaining redirect rules on our behalf and instead point the DNS names straight at us for
about a year, after which the records go away:

> Having your developers adapt your site to recognize alternate DNS names directly, so that
> instead of redirecting HTTP requests, we can *temporarily* point DNS names directly to your
> new site.

By the time we read the mail it had already happened. All five names were `CNAME`s terminating
at our pull zone:

```
pnwmoths.biol.wwu.edu      ─┐
pnwmoths-new.biol.wwu.edu  ─┼─> moths.pnwinsects.org ─> pnwmoths.b-cdn.net
pnwantlions.biol.wwu.edu   ─┤   (siblings chain via pnwmoths.biol.wwu.edu)
pnwbutterflies.biol.wwu.edu─┤
pnwsawflies.biol.wwu.edu   ─┘
```

The pull zone did not claim any of them. Bunny answers a request whose `Host` it does not
recognise with `403 Domain suspended or not configured`, behind a `b-cdn.net` certificate that
does not match the name — so every visitor got a browser security interstitial and, past it, a
refusal. Every legacy citation, BugGuide link, bookmark and search result pointed into a wall.

**Nothing in the repo noticed, and nothing could have.** The `/analytics/` "Unmapped Legacy
Links" queue is derived from `/redirect.html?from=` rows in the Bunny access log
([ADR 0019](0019-legacy-link-telemetry-from-logs.md)). With the hostnames refusing every
request, no row was written, so the queue read *empty* — indistinguishable from "every legacy
link resolves". A measurement of misses among arriving requests cannot report that nothing
arrives. `docs/concerns.md` had separately logged this gap as SEO-01, describing it as deferred
work rather than a live outage.

## Decision

**The pull zone claims the legacy hostnames, and edge rules 301 them into the new site.** We
redirect rather than serve content under the old names.

### Hostnames

All five are added to the `pnwmoths` pull zone with Bunny-managed Let's Encrypt certificates
(`HTTP-01`). `Force SSL` stays off, because the edge rules below match `http://` explicitly and
target an `https://` URL.

### Edge rules

Three `Redirect To URL` rules, **301**, alongside the pre-existing `csv handling` rule from
[ADR 0009](0009-bunny-cache-policy.md):

| Description | Trigger patterns (`Request URL`, `Match Any`) | Target |
|---|---|---|
| `legacy wwu hostnames -> /redirect.html` | `http(s)://pnwmoths.biol.wwu.edu/*`, `http(s)://pnwmoths-new.biol.wwu.edu/*` | `https://moths.pnwinsects.org/redirect.html?from={{path}}` |
| `retired wwu sibling sites -> pnwinsects landing (1/2)` | `http(s)://pnwantlions.biol.wwu.edu/*`, `http(s)://pnwbutterflies.biol.wwu.edu/*` | `https://www.pnwinsects.org/` |
| `retired wwu sibling sites -> pnwinsects landing (2/2)` | `http(s)://pnwsawflies.biol.wwu.edu/*` | `https://www.pnwinsects.org/` |

`{{path}}` carries the query string with it, so `/gsearch/?q=apamea` arrives as
`from=/gsearch/?q=apamea`. That is correct: `normalizeLegacyPath` in
[`src/_lib/legacy-redirects.ts`](../../src/_lib/legacy-redirects.ts) strips the query before
matching, which is what makes one legacy page report as one row rather than one row per
tracking parameter.

### Guard

`npm run verify:legacy-hostnames` (`scripts/check-legacy-hostnames.ts`) probes a **deep path**
on every hostname over **both schemes** and requires a 301 to the expected target. It is the
only assertion in the repo that fails when the front door is bricked up. It is not part of
`npm run build`, which stays offline and hermetic; it sits with `deploy:smoke` and
`verify:cdn-cutover`.

It runs daily from [`.github/workflows/legacy-hostnames.yml`](../../.github/workflows/legacy-hostnames.yml),
which opens (or comments on) a tracking issue when it fails and closes it when service
returns. A scheduled job is the only form that works here: what it guards is not in the repo,
so a check that ran only on our commits could not have caught this outage — it was caused by a
third party retiring a DNS record. It is deliberately kept out of `pr-check.yml` for the same
reason as the link-rot check: a CDN misconfiguration is not something a contributor caused or
can fix, so it must never turn a PR red. The job needs no `npm ci` and no build, because the
script imports only Node builtins — so it still reports when the install or the build is
broken, which is when a regression is easiest to miss. Three attempts with a pause between
them keep a single transient network failure on the runner from filing an issue.

## Consequences

- **Legacy deep links work again**, through the existing resolver, with no change to
  `legacy-redirects.ts`. The analytics queue resumes receiving real misses.
- **SEO-01 in `docs/concerns.md` is closed.** It described the edge rules as deferred work;
  they now exist.
- **`docs/reference/data-provenance.md` was wrong for the duration of the outage.** It recorded
  that the legacy host 301s — true in 2026-08, false from the decommission until this change,
  and true again now by a different mechanism. Corrected.
- **Three CDN behaviours now have no representation in the repo** beyond this record and the
  guard. Anyone with Bunny dashboard access can change them with no commit to review; the guard
  is what converts that into a detectable failure.
- **Bunny caps a condition at five trigger patterns.** Each hostname costs two (one per scheme),
  so a rule holds at most two hostnames — which is why the siblings need two rules. Exceeding
  the cap makes the dashboard refuse the save with `Maximum 5 triggers are allowed per
  condition`, which reads like a typo rather than a limit. A sixth legacy hostname means a
  fourth rule.
- **Certificate issuance has an ordering trap.** Let's Encrypt validates by fetching
  `http://<hostname>/.well-known/acme-challenge/<token>`. A redirect rule matching
  `http://<hostname>/*` will capture that request and send it somewhere that has no token.
  Disable the rules while adding hostnames and requesting certificates, then re-enable.
- **Bunny validates the `CNAME` one hop only.** Because WWU pointed the names at
  `moths.pnwinsects.org` rather than at `pnwmoths.b-cdn.net`, the dashboard reports the hostname
  as misconfigured even though the chain terminates correctly. `Force Activate SSL` is the right
  answer — issuance succeeds, since traffic does reach the zone. `Skip Verification` is not: it
  adds the hostname without a certificate, leaving the TLS warning in place.
- **There is roughly a year.** WWU intends to drop the DNS records after that. The 301s are what
  move bookmarks and search indexes across in the meantime; a 302 would ask crawlers to keep the
  old name indefinitely, which is the opposite of the point.
- **The sibling hostnames serve a landing page, not their old content.** `pnwbutterflies` and
  `pnwsawflies` had real content; it is archived but has no home on the new site yet. Sending
  them to `https://www.pnwinsects.org/` is honest about that rather than 404ing. If those sites
  gain a destination, they get their own rules.

## Alternatives considered

- **Serve the site under the legacy hostnames** (no redirect). Rejected. The curator's own
  instruction to users is "Ctrl-D to bookmark", which bookmarks whatever is in the address bar —
  so mirroring would bank a year of fresh bookmarks on a hostname that is about to be deleted.
  It also splits the cache and duplicates every page under two origins.
- **Ask WWU to keep redirecting.** Rejected: this is precisely what they asked to stop doing,
  and the person who maintained it has been reassigned. The arrangement had already lapsed.
- **302 instead of 301.** Rejected; see above.
- **A leading-wildcard pattern** (`*pnwsawflies.biol.wwu.edu/*`) to fit all siblings in one rule
  under the five-trigger cap. Rejected: it also matches the string appearing anywhere in a URL,
  so `moths.pnwinsects.org/?ref=pnwsawflies.biol.wwu.edu/` would redirect. The explicit form has
  no such edge and reads unambiguously.
- **Script the Bunny API instead of using the dashboard.** Written, then dropped: the core API
  key is held by another maintainer and the change is a handful of one-time clicks. The durable
  artefact that matters is the guard, not the application. If this config grows, revisit.
- **Point the guard at `/`.** Rejected: a claimed hostname with a broken rule pattern answers
  `/` with 200 by mirroring the site, which a home-page check would call healthy. The deep path
  is where mirroring and redirecting diverge.
