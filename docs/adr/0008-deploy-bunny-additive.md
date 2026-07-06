# 0008. Deploy by additive upload to Bunny; GitHub Pages demoted to staging

**Status:** Accepted

## Context

The static output needs a production home. The images already live on the Bunny CDN
([0007](0007-bunny-cdn-images.md)), so serving the whole site from the same zone keeps everything
on one origin at one domain. Production is [moths.pnwinsects.org](https://moths.pnwinsects.org/).
GitHub Pages had been the live target but sits under a `/pnwmoths/` path prefix and isn't the
production domain. Deploys must be safe to run repeatedly and must never risk wiping the
image assets that share the zone.

## Decision

A push to `main` triggers the production workflow
([`.github/workflows/production.yml`](../../.github/workflows/production.yml)): run CI, build at
root `/`, then upload `_site` **additively** to the Bunny Storage Zone — **no purge, no deletes.**
GitHub Pages is demoted to a **manual `workflow_dispatch` staging** target
([`staging.yml`](../../.github/workflows/staging.yml)) publishing under `/pnwmoths/`. The upload
runs via `scripts/upload-site.ts` and requires the **`BUNNY_STORAGE_PASSWORD`** repo secret. All
pipeline operations run locally — there is no data/build server.

## Consequences

- Production and images share one origin/zone; one CDN, one domain.
- **Additive-only upload is a safety invariant**: because site files and image assets live in the
  same zone, a delete/sync could destroy images. New and changed files are written; nothing is
  deleted. Never use `s3 sync --delete` against the zone.
- `pathPrefix` **stays conditional on `process.env.GITHUB_PAGES`**: `/` for production, `/pnwmoths/`
  for staging. Hard-coding the prefix would break local builds and production — this is a standing
  invariant, not a detail.
- Staging is opt-in (`workflow_dispatch`), so routine work doesn't publish two copies.

## Alternatives considered

- **GitHub Pages as production** — rejected: wrong domain and a forced path prefix; Bunny gives
  the real domain and co-locates with images.
- **Purge-and-replace or `s3 sync --delete` deploys** — rejected: shared zone means deletes could
  wipe image assets. Additive upload plus the cache policy in
  [0009](0009-bunny-cache-policy.md) keeps content fresh without deletes.
