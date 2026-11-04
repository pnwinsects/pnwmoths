# 0053. Production builds run in parallel; only the upload waits its turn

**Status:** Accepted · Refines [0008](0008-deploy-bunny-additive.md) · Amended 2026-11-01: a deploy that falls behind stops grey or red, not green · Amended 2026-11-04: it waits for the newer commit's run before failing

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
whose build finishes late could put older files over a newer deploy. A re-run does the same: it
checks out its original commit, not the current head. `deploy` therefore checks that `GITHUB_SHA`
is still the head of its branch before setup and again just before the upload, with
[`require-current-tip`](../../.github/actions/require-current-tip/action.yml), and stops if not.
Stopping loses nothing: every build contains all earlier commits, and the newer commit's own run
deploys it.

How the run ends says which case it was (amended 2026-11-01; until then the run skipped the upload
and ended green):

- **Cancelled (grey)** for a first attempt that a newer push overtook, when a run of the newer
  commit exists and wasn't cancelled. The job writes the newer commit to the run's summary and
  cancels its own run, which needs `actions: write`. GitHub can take minutes to create a push's
  run, so each of the job's two checks waits up to five minutes for one, reading the head again
  each time (amended 2026-11-04: until then it looked once, and on 2026-11-04 SalishSea.io's copy
  failed red a run whose newer commit got its run two and a half minutes after the push). A
  lookup that fails during the wait counts as no run yet, so a passing GitHub API error doesn't
  end the step before it writes its summary. A push that starts no run, such as one marked
  `[skip ci]`, now costs a deploy it overtakes five minutes before failing red.
- **Failed (red)** for a re-run, and for a moved head that gets no run of its own within those
  five minutes, since then nothing is set to deploy it.
- **Never green.** A green run that uploaded nothing looks like a deploy. SalishSea.io learned this
  when a re-run rolled its production back unnoticed
  ([its decision 024](https://github.com/salish-sea/salishsea-io/blob/main/docs/decisions/024-deploy-gating-and-alerting.md)),
  and this check is a copy of its action.

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
