# 0053. Production builds run in parallel; only the upload waits its turn

**Status:** Accepted · Refines [0008](0008-deploy-bunny-additive.md)

## Context

[`production.yml`](../../.github/workflows/production.yml) was one job under a concurrency group
that allowed a single run at a time. A push to `main` therefore waited for the previous push's
whole run, including its typecheck, tests and build, before starting its own. Two merges in a row
(#415 and #416, 2026-10-16) took the time of two full runs, one after the other, when only the
upload to the Bunny zone needs to be one at a time.

## Decision

The workflow has two jobs.

- **`build`** has no concurrency group. Every push builds in parallel: typecheck, tests, build,
  browser smoke test. It keeps `_site` as a workflow artifact for one day.
- **`deploy`** needs `build`, and owns the `production-deploy` concurrency group (one running,
  one waiting, nothing cancelled). It downloads the artifact, uploads it, and runs the CDN smoke
  check.

Builds can finish in any order, and the upload overwrites files that changed, so an older commit
whose build finishes late could put older files over a newer deploy. `deploy` therefore first
checks that `GITHUB_SHA` is still the head of `main`, and skips the upload if not. Skipping loses
nothing: every build contains all earlier commits, and the newer commit's own run deploys it.

## Consequences

- A push waits for an earlier upload only, not for its own build.
- If the newest commit's build fails, an older passing commit is not deployed in its place, because
  it is no longer the head. `main` is broken in that case and the next fix deploys everything.
- Both jobs name the `production` environment, because the Bunny password is stored on it. An
  environment does not queue runs, so `build` is not serialised by it. GitHub shows two
  deployments per push.
- Same stuck-run exposure as before ([#308](https://github.com/pnwinsects/pnwmoths/issues/308)):
  a `deploy` run stuck on the environment gate holds the group, but a build is no longer stuck
  behind it.

## Alternatives considered

- **Cancel the waiting run in favour of the newest** (`cancel-in-progress: true`). Rejected: it
  would cancel an upload part-way through, and ADR 0008 relies on uploads completing.
- **Leave it as one job.** Rejected for the wait above.
- **Build on the runner that uploads, but start the build before taking the lock.** Not possible
  with a job-level concurrency group, which gates the whole job.
