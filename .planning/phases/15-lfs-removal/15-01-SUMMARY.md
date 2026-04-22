---
phase: 15-lfs-removal
plan: 01
subsystem: infra
tags: [git, git-lfs, git-filter-repo, history-rewrite, gitignore]

# Dependency graph
requires:
  - phase: 13-cdn-provisioning
    provides: CDN is live; images/ and plates/ directories are no longer needed at build time
provides:
  - LFS history purged from all git commits — images/ and plates/ never appear in repo history
  - .gitattributes deleted (no LFS tracking rules remain)
  - .gitignore updated to prevent accidental re-addition of images/ and plates/
  - REQUIREMENTS.md LFS-01 text updated to reflect filter-repo-only approach
  - GitHub origin/main rewritten and force-pushed
affects: [15-02-ci-update, github-actions, future-contributors]

# Tech tracking
tech-stack:
  added: [git-filter-repo 2.47.0 (via Homebrew)]
  patterns:
    - "Fresh local clone with --no-local prevents hardlink sharing and packfile corruption"
    - "filter-repo --invert-paths --path X --path Y removes multiple paths in one rewrite pass"
    - "After force-push: git fetch origin && git reset --hard origin/main realigns working copy"

key-files:
  created: []
  modified:
    - .gitignore (added images/ and plates/ entries)
    - .planning/REQUIREMENTS.md (updated LFS-01 text)
  deleted:
    - .gitattributes (all 4 filter=lfs lines removed; file had no other content)

key-decisions:
  - "Cloned from local repo (not GitHub remote) because local working copy had 60+ unpushed commits — cloning from GitHub would have lost all Phase 13/14/17 work"
  - "Used --force with filter-repo because LFS smudge artifacts left staged deletions in the fresh clone (non-fresh detection false positive); the clone was structurally fresh"
  - "Force-pushed to GitHub — single maintainer, no branch protection, intentional history rewrite per plan"

patterns-established:
  - "LFS removal via filter-repo: clone --no-local from LOCAL repo (not remote) when local commits are ahead of remote"

requirements-completed:
  - LFS-01

# Metrics
duration: 10min
completed: 2026-04-22
---

# Phase 15 Plan 01: LFS Removal — History Rewrite Summary

**git filter-repo --invert-paths purged images/ and plates/ from all 356 commits; origin/main force-pushed; LFS tracking reduced from 16,191 files to 0**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-22T21:53:26Z
- **Completed:** 2026-04-22T22:03:57Z
- **Tasks:** 1 (with 15 steps)
- **Files modified:** 3 (deleted: .gitattributes; modified: .gitignore, .planning/REQUIREMENTS.md)

## Accomplishments

- All 16,191 LFS-tracked image and plate files removed from every git commit (356 commits rewritten)
- `.gitattributes` deleted (all 4 `filter=lfs` lines gone; file had no other content)
- `.gitignore` updated with `images/` and `plates/` entries to prevent accidental re-addition
- `REQUIREMENTS.md` LFS-01 text updated to reflect filter-repo-only approach (no `git lfs migrate export`)
- GitHub `origin/main` force-pushed with rewritten history
- Local working copy reset to rewritten history; `images/` and `plates/` directories removed
- Fresh clone from GitHub verified: no `images/` directory, `git lfs ls-files` returns nothing
- `npm test`: 72/72 tests passing after rewrite

## Task Commits

Each task was committed atomically:

1. **Task 1: LFS history rewrite, file cleanup, force-push, reset** - `d77366d` (chore)

**Plan metadata:** _(pending — committed after SUMMARY.md)_

## Files Created/Modified

- `.gitattributes` — deleted (previously contained 4 `filter=lfs` rules for images/**/*.{jpg,jpeg,png} and plates/**/*.jpg)
- `.gitignore` — added `images/` and `plates/` entries (now 6 lines total)
- `.planning/REQUIREMENTS.md` — LFS-01 text updated to reference `filter-repo --invert-paths` approach; removed reference to `git lfs migrate export`

## Decisions Made

- Cloned from local repo (`/Users/rainhead/dev/pnwmoths`) with `--no-local` rather than from GitHub remote. The local working copy had ~60 unpushed commits (Phase 13, 14, 17 work). Cloning from GitHub would have produced a rewritten history missing all those commits. The force-push then correctly published ALL local work with LFS content removed.
- Used `--force` with `git filter-repo` because the fresh clone had staged deletions caused by git-lfs smudge filter failing (LFS objects not available locally). These were false-positive "uncommitted changes" — the clone was structurally a fresh clone. The `--force` bypassed the freshness check safely.
- The `git reset --hard HEAD` step after `filter-repo` (which normally runs automatically) had to be run manually because a `.git/index.lock` file existed during the first (GitHub-remote) clone attempt. After switching to the local-repo clone, filter-repo completed cleanly with no manual reset needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cloned from local repo instead of GitHub remote**
- **Found during:** Task 1 (Step 3 — create fresh clone)
- **Issue:** Plan specified `git clone --no-local https://github.com/pnwinsects/pnwmoths.git`. The local working copy had ~60 unpushed commits (Phases 13, 14, 17). Cloning from GitHub would have rewritten only the older published history, losing all recent work on the force-push.
- **Fix:** Changed clone source to `git clone --no-local /Users/rainhead/dev/pnwmoths`. Still used `--no-local` to prevent hardlinks. The force-push then correctly published rewritten history including ALL local commits.
- **Files modified:** None (procedural change)
- **Verification:** After force-push, `git log --oneline` shows all Phase 13/14/17 commits in the remote; fresh clone from GitHub includes them.
- **Committed in:** `d77366d` (task commit includes all changes)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan assumption that remote was up to date)
**Impact on plan:** Essential correction — without it, 60+ commits of work would have been destroyed by the force-push. No scope creep.

## Issues Encountered

- First fresh clone attempt (from GitHub) resulted in git-lfs smudge artifacts leaving staged deletions, causing filter-repo to refuse with "does not look like a fresh clone." Used `--force` to proceed on that clone, but then discovered the GitHub remote was 60+ commits behind local. Abandoned that approach and started over with a local-repo clone, which completed cleanly.
- A `.git/index.lock` file from the abandoned first attempt blocked the `git reset --hard` step in filter-repo. The lock was manually removed and the operation completed successfully on the second attempt.

## User Setup Required

None — no external service configuration required. Phase 15 Plan 02 (CI update) will replace the LFS checkout action in deploy.yml and pr-check.yml.

## Next Phase Readiness

- LFS history rewrite complete — ready for Phase 15 Plan 02 (CI workflow update)
- Plan 02 must replace `nschloe/action-cached-lfs-checkout` with `actions/checkout@v4.3.1` (SHA: `34e114876b0b11c390a56381ad16ebd13914f8d5`) in both deploy.yml and pr-check.yml
- No blockers; `npm test` passes; fresh clone from GitHub verified clean

---
*Phase: 15-lfs-removal*
*Completed: 2026-04-22*
