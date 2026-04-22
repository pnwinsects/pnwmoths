---
phase: 15-lfs-removal
fixed_at: 2026-04-22T00:00:00Z
review_path: .planning/phases/15-lfs-removal/15-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-04-22
**Source review:** .planning/phases/15-lfs-removal/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `.gitignore` ignores `images/` and `plates/` — post-LFS these directories may need to be tracked

**Files modified:** `.gitignore`
**Commit:** 6d3503a
**Applied fix:** Added a comment above the `images/` and `plates/` entries explaining they are CDN assets downloaded at build time and intentionally not committed to git.

### WR-02: `deploy.yml` runs lychee link-check during the deploy build — broken external links block production deploys

**Files modified:** `.github/workflows/deploy.yml`
**Commit:** 534099b
**Applied fix:** Replaced `npm run build` (which embeds `build:validate-links`) with an explicit chain of the individual build sub-scripts excluding lychee, then added a separate "Check links (non-blocking)" step that runs `npm run build:validate-links` with `continue-on-error: true`. This ensures broken external links surface as warnings without blocking production deploys.

### WR-03: `pr-check.yml` installs lychee but never runs it

**Files modified:** `.github/workflows/pr-check.yml`
**Commit:** 04c07af
**Applied fix:** Replaced `npm run build` with the same explicit sub-script chain used in deploy.yml (excluding lychee), then added an explicit "Check links" step that runs `npm run build:validate-links`. The previously orphaned `install-lychee` and cache steps are now properly used, and broken links in PRs are caught before merge.

---

_Fixed: 2026-04-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
