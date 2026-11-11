# 0058. A failed analytics download does not block a deploy; it opens an issue

**Status:** Accepted - Refs [#450](https://github.com/pnwinsects/pnwmoths/issues/450)
Applies the reporting rule of [ADR 0028](0028-link-rot-reporting.md) to the
analytics download in [ADR 0053](0053-build-in-parallel-deploy-in-turn.md)'s build job

## Context

Every production build downloads the daily analytics files from the Bunny storage
zone (`_analytics/`) so that `/analytics/` can be built without the data living in
git. Until #450 it downloaded every file, about 130 of them, on every build, and
any single failure failed the build.

On 2026-11-10 Bunny answered HTTP 502 for one file, `2026-07-04.json`, for at least
two and a half hours. The script retries for about 30 seconds, so three deploys of
unrelated changes failed on that one file. The problem cleared overnight without
any change on our side.

The analytics dashboard is an internal page reached from `/curation/`. A missing or
outdated day on it costs much less than a blocked deploy. `src/_data/analytics.ts`
already skips a day that is missing or malformed rather than failing.

## Decision

- **Keep the files between builds.** The production build restores
  `data/analytics/` from the GitHub Actions cache, and saves it again only when the
  download changed something. A day's file does not change after the nightly job
  uploads it, so a build normally downloads one file.
- **Download only what is new or changed.** A cached file is current when its
  SHA256 matches the `Checksum` in Bunny's listing, or its size matches when the
  listing has no checksum.
- **A download that fails does not fail the build.** The script keeps the older
  cached copy, or leaves the day out if there is none, and exits **2**. A failed
  listing is treated the same way: the page is built from the cached files. Exit
  **1** is kept for misconfiguration and bugs, and still fails the build.
- **An incomplete download opens a tracking issue, and a complete one closes it.**
  The `analytics-issue` job in `production.yml` comments on the open issue titled
  *Production build could not download all analytics files*, or opens one, with
  the list of failed files. It closes that issue when a later build downloads
  every file. It runs only when the download step reported 0 or 2, so a
  malfunction can never close the issue as good news (ADR 0028).
- The issue is raised by a separate job, not the build job, so that the job that
  runs every npm dependency holds no token able to write issues, and so that one
  concurrency group keeps two builds from opening two issues.

## Consequences

- The deploy is no longer coupled to Bunny Storage being readable at build time,
  only to it being writable at upload time, which the deploy needs anyway.
- `/analytics/` can be out of date without the deploy failing. The open issue is
  the signal, and it names each affected day.
- Builds may finish out of order (ADR 0053), so an older build's result can reopen
  an issue that a newer one closed. The next nightly deploy corrects it.
- A cache entry not used for 7 days is evicted by GitHub; the next build then
  downloads every file once, as before.

## Rejected alternatives

- **Longer retries.** Retries long enough to outlast a multi-hour Bunny fault
  would hold a deploy for hours, and still fail it in the end.
- **Mark the step `continue-on-error`.** The failure would be visible only in a
  log nobody reads, which is the pattern ADR 0028 was written to end.
- **Commit the analytics files to git.** That was the original design. It was
  replaced by Bunny Storage (commit `b982f8c`) because the nightly job had to open
  and merge a pull request past branch protection every day, and that kept failing.
