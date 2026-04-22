---
phase: 15-lfs-removal
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .gitignore
  - .github/workflows/deploy.yml
  - .github/workflows/pr-check.yml
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed as part of the LFS removal phase: `.gitignore`, the deploy workflow, and the PR check workflow. No critical security vulnerabilities were found. The GitHub Actions workflows are well-structured with pinned action SHAs and minimal permissions. Three warnings were identified: a `.gitignore` entry that ignores `images/` and `plates/` directories which may be significant post-LFS (these were likely LFS-tracked), an unpinned `actions/cache@v4` reference inside the local `install-lychee` composite action (noted for completeness since that file is not in scope but referenced by both reviewed workflows), and a lychee link-check step that runs during deploy without a dedicated lint/check job in the PR workflow. Two informational items round out the findings.

## Warnings

### WR-01: `.gitignore` ignores `images/` and `plates/` — post-LFS these directories may need to be tracked

**File:** `.gitignore:5-6`
**Issue:** Both `images/` and `plates/` are listed in `.gitignore`. If these directories previously held LFS-tracked binary assets that are now being migrated (e.g., stored in a CDN or committed directly), leaving them in `.gitignore` means they will silently remain untracked after LFS removal. Any new image files added to these paths will not be committed, and developers will not receive a warning. This is the most likely source of a silent data-loss bug after the migration.
**Fix:** After the LFS migration is complete, audit whether `images/` and `plates/` should still be ignored. If assets are moving to a CDN and these directories are purely build-time download targets, document that clearly (e.g., in a comment). If any files in these directories must now be committed, remove the corresponding lines from `.gitignore`.

---

### WR-02: `deploy.yml` runs lychee link-check during the deploy build — broken external links block production deploys

**File:** `.github/workflows/deploy.yml:25-33`
**Issue:** The `install-lychee` and lychee cache steps run inside the `build` job, which gates the `deploy` job. If an external URL that lychee checks becomes unreachable (e.g., a third-party site goes down), the production deploy is blocked even though the site content itself is valid. This is a reliability risk: a transient external failure prevents shipping code.
**Fix:** Either (a) move lychee execution to a separate, non-blocking job that runs in parallel with `build` and does not gate `deploy`, or (b) add `continue-on-error: true` to the lychee run step so link failures are surfaced as warnings without blocking the deploy. Option (a) is cleaner.

---

### WR-03: `pr-check.yml` installs lychee but never runs it

**File:** `.github/workflows/pr-check.yml:19-28`
**Issue:** The PR check workflow installs lychee (lines 19–27) but there is no step that actually invokes lychee or runs a link-check command. The install and cache steps consume CI time for no effect. This means broken links introduced in a PR are not caught before merge — they are only caught (and they block) the post-merge deploy.
**Fix:** Either add an explicit lychee run step after the `npm run build` step, or remove the `install-lychee` and cache steps from `pr-check.yml` entirely if link-checking in PRs is not desired.

## Info

### IN-01: `actions/cache` inside `install-lychee` composite action uses a floating tag

**File:** `.github/actions/install-lychee/action.yml:14` (referenced by both reviewed workflows)
**Issue:** The composite action uses `actions/cache@v4` (a floating major-version tag) rather than a pinned SHA. This is inconsistent with the calling workflows, which pin all their action references to exact SHAs. A supply-chain compromise of the `actions/cache` action at the `v4` tag would silently affect CI despite the calling workflows appearing fully pinned.
**Fix:** Pin `actions/cache` in `action.yml` to the same SHA used by the calling workflows (`actions/cache@668228422ae6a00e4ad889ee87cd7109ec5666a7`).

---

### IN-02: `deploy.yml` lychee cache key uses `run_id` — no cross-run cache reuse

**File:** `.github/workflows/deploy.yml:32`
**Issue:** The cache key is `lychee-cache-${{ github.run_id }}`. Because `run_id` is unique per workflow run, the primary key never matches an existing cache entry. The `restore-keys: lychee-cache-` fallback does restore the previous run's cache, but the intent of caching lychee URL results (to avoid re-checking stable URLs on every run) is only partially achieved. Every run writes a new cache entry and the cache grows unboundedly until GitHub's cache eviction kicks in. The same pattern exists in `pr-check.yml` line 27.
**Fix:** Use a content-based or time-based key that produces cache hits across runs when the checked URLs have not changed, for example: `lychee-cache-${{ hashFiles('**/*.md', '**/*.html') }}` with `restore-keys: lychee-cache-`.

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
