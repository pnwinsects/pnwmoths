# 0009. Bunny pull-zone cache policy — fresh HTML, long-lived hashed assets

**Status:** Accepted

## Context

Deploys are additive uploads to the Bunny zone with no purge ([0008](0008-deploy-bunny-additive.md)).
Without deletes or purges, cache correctness has to come from cache headers alone: HTML, JSON, and
Parquet change in place on every deploy and must never be served stale, while content-hashed
assets (Vite output) and images never change under a given URL and should cache aggressively.

The policy alone turned out not to be reproducible. Standing up a second site
(`pnwinsects/pnwinsects-landing`, on its own `pnwinsects` pull zone) by cloning this repo's build
and deploy infrastructure ported cleanly at the repo level but shipped broken at the CDN: the new
zone served HTML with `Cache-Control: public, max-age=2592000` and the deploy's CDN smoke check
failed until the zone settings were rediscovered by trial and error. This ADR therefore records the
**concrete pull-zone settings**, not just the intent.

## Decision

Configure the Bunny Pull Zone with **Smart Cache ON + "Respect origin Cache-Control."**
**Smart Cache is what sets the headers** — the origin does not. The origin is Bunny Storage, and
[`scripts/upload-site.ts`](../../scripts/upload-site.ts) sends only `AccessKey` and `Content-Type`
on upload; it sets **no `Cache-Control` header at all**. Smart Cache classifies each response by
file extension and MIME type: HTML is classified non-cacheable and served `no-cache`, while JS,
CSS, and images are classified cacheable and receive Bunny's `max-age=25600000`. "Respect origin
Cache-Control" is what stops Bunny from overriding that classification with a fixed TTL of its own.
The net effect is the intended policy — **fresh HTML, long-lived content-hashed assets, and no
manual purge on routine deploys** — but it is produced at the edge, not at the origin.

Uploads use `scripts/upload-site.ts`, which does a concurrent `fetch` with a content-hash manifest
rather than `s3 sync`.

### Zone configuration (verified against the live `pnwmoths` zone)

Caching → General:

| Setting | Value |
|---|---|
| Smart Cache | **ON** |
| Cache expiration time | **Respect origin Cache-Control** |
| Browser cache expiration time | **Match server cache expiration** |
| Query string sort | ON |
| Cache error response | OFF |

Edge rules: **exactly one**, named `csv handling` — three stacked actions and one condition.

- Action — Browser Cache Header (Cache-Control) Override → `no-cache`
- Action — Set Response Header → `Content-Type` = `text/csv; charset=utf-8`
- Action — Override Cache Time → `0 seconds`
- Condition — IF ANY / Request URL ANY matches `*.csv`

The rule exists because Smart Cache would otherwise classify `.csv` as a cacheable asset and give
it a long TTL. The site publishes exactly two CSVs, both at the root — `/species-audit.csv` and
`/records-district-audit.csv`, the build-time audit reports emitted during `build:site`. They are
regenerated on every build and change in place, and with no purge on deploy a cached copy would be
stale indefinitely, so the classification has to be overridden explicitly. (Nothing under `data/`
is published; those CSVs are only read at build time.) The action the rule genuinely depends on is
therefore the **cache override**, since that is the one Smart Cache would decide differently; the
`Content-Type` action is belt-and-braces, because `upload-site.ts`'s `contentTypeFor()` map already
sends that exact value on PUT — it is kept because it pins the value at the edge.

Measured on the two published CSVs, confirming the rule is live:

- `/species-audit.csv` and `/records-district-audit.csv` → `Cache-Control: no-cache`,
  `Content-Type: text/csv; charset=utf-8`

Resulting response headers on <https://moths.pnwinsects.org> (measured by `HEAD`):

- `/` and `/index.html` (`text/html`) → `Cache-Control: no-cache`
- `/assets/*.js`, `/assets/*.css`, `/images/*.png`, `/images/*.svg` → `Cache-Control: max-age=25600000`

### Known gap: Parquet has no explicit rule

There is **no edge rule for `*.parquet`**, so per-species occurrence data is subject to whatever
Smart Cache decides. Measured today, `/species/{slug}/records.parquet` is served
`Cache-Control: no-cache` with `Content-Type: application/octet-stream` — the behaviour we want,
but incidentally rather than by configuration: CSV gets `no-cache` because an edge rule *pins* it,
whereas Parquet gets it only because `application/octet-stream` happens to fall on the
non-cacheable side of Smart Cache's classification. Parquet is mutable and rewritten in place on
every deploy, so this is load-bearing and currently unpinned.
[#320](https://github.com/pnwinsects/pnwmoths/issues/320) tracks adding an explicit `*.parquet`
rule mirroring `csv handling`.

### Worked example: the `pnwinsects` zone

The `pnwinsects` pull zone was created with Bunny's defaults — Smart Cache **OFF** and Cache
expiration time **"Override: 1 month"** — which is exactly where the `max-age=2592000` on HTML came
from. Turning Smart Cache **ON**, setting Cache expiration to **"Respect origin Cache-Control"**,
and purging brought its headers into exact agreement with moths. No origin or repo change was
needed, which is the proof that these zone settings are the whole story. That zone deliberately
does **not** get the `*.csv` rule: the landing site serves no CSVs.

## Consequences

- After a deploy, mutable files (pages and data) are immediately fresh without a purge step;
  hashed assets stay cached and get new URLs when their content changes, so they're safe to cache
  forever.
- **Freshness is an edge-configuration property, not a property of the artifacts.** Nothing in the
  repo encodes it, so cloning the repo does not clone the cache behaviour — a new zone must be
  configured to match the table above or it will serve stale HTML.
- Any new **mutable** file type whose extension Smart Cache treats as a cacheable asset needs its
  own edge rule, the way `.csv` does. Adding one is a dashboard change, so it must be recorded here
  to survive.
- The manifest-based uploader detects changes by content hash, which beats `s3 sync`'s mtime
  comparison and only re-uploads what actually changed.
- Bunny's S3 API *is* enabled on the account, but the pipeline deliberately does not use `s3 sync`
  — and if it ever did, **never with `--delete`** (would violate the additive invariant in
  [0008](0008-deploy-bunny-additive.md) and could wipe images).

## Alternatives considered

- **Cache everything + manual purge on deploy** — rejected: adds a fragile, easy-to-forget step
  and risks serving stale pages if the purge is missed. This is effectively what a default-configured
  zone does, as the `pnwinsects` zone demonstrated.
- **Setting `Cache-Control` at the origin on upload** — not adopted: `upload-site.ts` could send a
  per-type `Cache-Control` with each PUT, which would make the policy live in the repo rather than
  in the dashboard. Smart Cache already produces the right headers, and origin headers would have to
  be kept in agreement with the edge rules, so the added moving part isn't earning its keep. If the
  edge classification ever proves unreliable, this is the fallback.
- **`s3 sync` for upload** — rejected: mtime-based change detection is less reliable than a
  content-hash manifest, and `--delete` is dangerous on a zone shared with image assets.
