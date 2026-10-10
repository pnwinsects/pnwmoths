# 0051. Automated traffic is filtered out of the legacy-link queue, and the site serves robots.txt

**Status:** Accepted · Refs [#181](https://github.com/pnwinsects/pnwmoths/issues/181) ·
Extends [ADR 0019](0019-legacy-link-telemetry-from-logs.md) · Follows [ADR 0050](0050-legacy-wwu-hostnames.md)

## Context

ADR 0019 built `/analytics/` out of the CDN access logs, and ADR 0050 pointed the five legacy
WWU hostnames at our pull zone so that old links 301 into the new site. Together they were
supposed to produce a working queue: any legacy URL the redirect table cannot map gets
counted, surfaced under **Unmapped Legacy Links**, and turned into a mapping.

The first look at that queue after the hostname cutover found it does not work. Over the
30 days to 2026-10-09:

- `redirect_hits` was 93,661 total, 45,750 matched, **47,911 missed**.
- **All 25 rows** the page rendered were automated traffic: `/robots.txt/`, `/favicon.ico/`,
  `/.env`, `/.env.local`, `/.env.production`, `/wp-admin/admin-ajax.php/`, `/wp-json/batch/v1/`,
  `/apple-touch-icon.png/`, `/blog/`, `/wordpress/`, build assets. Not one was a legacy URL.
- Those 25 rows were only **18%** of the misses. The other 39,283 were a tail the page never
  renders.

A real legacy URL therefore had no path to the visible list: it would have to out-rank a
vulnerability scanner running in a loop. The queue existed, was green, and could not do the
one thing it was for.

The largest single entry explained itself. `/robots.txt` was the most-requested URL the site
did not serve — 6,222 direct 404s, plus 5,174 more arriving at the legacy hostname and being
swept into the redirect handler. We had no `robots.txt` and no `sitemap.xml` at all.

## Decision

**1. Classify automated requests in one shared module.** `src/_lib/request-noise.ts` holds the
predicates, dependency-free and browser-safe so it can be used on both sides of the pipeline.
Two categories are kept deliberately separate:

- `isScannerProbe` — exploit scanning: `.php`, `.env*`, `.git`, `wp-*`, `/wordpress/`, `/blog/`,
  phpmyadmin, cgi-bin.
- `isBrowserDefault` — files a browser or crawler fetches without a link: `robots.txt`,
  `sitemap*.xml`, favicons, apple-touch-icons, `/.well-known/*`, web manifests.

`isLegacyMappingCandidate` is *neither* of those and not a build asset — the admission test for
the #181 queue, because no favicon request will ever want a redirect to a species page.

`isNoise404` is **scanner probes only**. A 404 on `/robots.txt` stays visible, because it is a
real gap in what the site serves. Folding browser defaults into the 404 filter would have
deleted this change's own evidence.

**2. Filter before the per-day cap, not only at display time.** `fetch-analytics.ts` truncates
each day's misses to the top 50 *before writing the daily file*. Filtering only in the rolling
aggregation would be too late: the noise has already evicted real URLs at write time,
unrecoverably. So the filter runs in both places — in `fetch-analytics.ts` to protect future
days, and in `src/_data/analytics.ts` to clean the display of days already stored under the old
behaviour. Daily files move to `schema_version: 4`.

**3. Disclose what was removed rather than quietly shrinking the number.** `redirect_hits.missed`
stays the honest count of requests; the filtered volume is carried alongside it as
`redirect_hits.automated` (and `not_found_probes` for 404s) and stated in the card copy. A table
that is shorter than its own headline figure, with no explanation, is its own kind of bug.

**4. Serve `robots.txt` and `sitemap.xml`,** as templates rather than files in `public/`: the
`Sitemap:` line and every `<loc>` must be absolute, and the origin differs between production
and the GitHub Pages staging build. Nothing is disallowed — `/analytics/` and `/curation/` are
kept out of search by `robots: noindex` in their front matter, and a crawler can only obey a
meta tag on a page it is allowed to fetch.

`sitemap.njk` lists `collections.all` with no filtering of its own. That is correct only because
every page that must not be indexed already sets `eleventyExcludeFromCollections: true`, so
`src/sitemap.test.ts` enforces exactly that invariant at the source level.

**5. Add the missing `apple-touch-icon.png`** (180×180, declared in `base.njk`) and set
`robots: noindex, nofollow` on `/analytics/`, which was publicly indexable while inlining
~600 KB of traffic data.

## Consequences

- The #181 queue can finally surface a real legacy URL, because a scanner can no longer
  outrank one.
- **The days already stored are not recoverable.** They were truncated to 50 rows with the
  noise included, so the real URLs they discarded were never written down. The `_data` side
  filtering cleans the display immediately, but the queue only becomes genuinely complete as
  the 30-day window rolls over onto `schema_version: 4` files.
- The scanner patterns were checked against `STATIC_MAP` in `src/_lib/legacy-redirects.ts`,
  which records the entire legacy URL vocabulary. The legacy site was Django and never served
  PHP or WordPress, so no collision is possible; `request-noise.test.ts` pins this by asserting
  every `STATIC_MAP` key survives the filter.
- A new pattern added to `request-noise.ts` silently shrinks the queue. The tests pin the 25
  observed rows and the full legacy vocabulary precisely so that a careless widening fails.
- The site is now crawlable on purpose rather than by default, which will change the traffic
  mix the analytics report. The baseline above is the before-picture.

## Alternatives rejected

**Filter only at display time.** Simplest, and wrong: the per-day cap has already thrown the
data away by then. This is the whole reason the filter is duplicated.

**Drop the noise silently, with no counter.** Leaves the dashboard showing `47,911 missed` above
a table of three rows and no way to tell a working filter from a broken feed.

**One `isNoise` predicate.** Merging scanner probes with browser defaults would have hidden the
`/robots.txt` 404s — the single finding that prompted all of this.

**Disallow `/analytics/` and `/curation/` in robots.txt.** The familiar mistake: a disallowed
page can still be indexed from external links, and the `noindex` that would have prevented it
is in a response the crawler was told not to fetch.

**`robots.txt` as a static file in `public/`.** No way to vary the `Sitemap:` origin between
production and GitHub Pages staging, so staging would advertise the production sitemap.
