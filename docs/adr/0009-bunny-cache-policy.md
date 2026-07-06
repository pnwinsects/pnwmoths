# 0009. Bunny pull-zone cache policy — fresh HTML, long-lived hashed assets

**Status:** Accepted

## Context

Deploys are additive uploads to the Bunny zone with no purge ([0008](0008-deploy-bunny-additive.md)).
Without deletes or purges, cache correctness has to come from cache headers alone: HTML, JSON, and
Parquet change in place on every deploy and must never be served stale, while content-hashed
assets (Vite output) and images never change under a given URL and should cache aggressively.

## Decision

Configure the Bunny Pull Zone with **Smart Cache ON + "Respect Origin Cache-Control."** The
origin sets `Cache-Control` per type: **HTML / JSON / Parquet are `no-cache` (always
revalidated/fresh)**, while **content-hashed assets and images keep a long TTL**. Routine deploys
therefore need **no manual purge**. Uploads use `scripts/upload-site.ts`, which does a concurrent
`fetch` with a content-hash manifest rather than `s3 sync`.

## Consequences

- After a deploy, mutable files (pages and data) are immediately fresh without a purge step;
  hashed assets stay cached and get new URLs when their content changes, so they're safe to cache
  forever.
- The manifest-based uploader detects changes by content hash, which beats `s3 sync`'s mtime
  comparison and only re-uploads what actually changed.
- Bunny's S3 API *is* enabled on the account, but the pipeline deliberately does not use `s3 sync`
  — and if it ever did, **never with `--delete`** (would violate the additive invariant in
  [0008](0008-deploy-bunny-additive.md) and could wipe images).

## Alternatives considered

- **Cache everything + manual purge on deploy** — rejected: adds a fragile, easy-to-forget step
  and risks serving stale pages if the purge is missed.
- **`s3 sync` for upload** — rejected: mtime-based change detection is less reliable than a
  content-hash manifest, and `--delete` is dangerous on a zone shared with image assets.
