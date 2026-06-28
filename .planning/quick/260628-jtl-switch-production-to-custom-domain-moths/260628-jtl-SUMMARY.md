---
phase: quick-260628-jtl
plan: 01
subsystem: deployment
tags: [cdn, bunny, github-actions, custom-domain, deploy]
requires: []
provides:
  - "Production deploy to custom domain https://moths.pnwinsects.org via additive Bunny upload"
  - "scripts/upload-site.ts (additive _site uploader) + site:upload npm script"
  - "production.yml (push→main→Bunny) and staging.yml (manual Pages) workflows"
affects:
  - eleventy.config.ts
  - .github/workflows/
tech-stack:
  added: []
  patterns:
    - "Additive-only Bunny Storage uploader (per-file PUT, no list/delete/sync/purge)"
key-files:
  created:
    - scripts/upload-site.ts
    - scripts/upload-site.test.ts
    - .github/workflows/staging.yml
  modified:
    - eleventy.config.ts
    - eleventy.config.test.ts
    - .github/workflows/production.yml
    - package.json
    - README.md
    - CONTRIBUTING.md
    - "14 source/test/script/doc files carrying the CDN host literal"
decisions:
  - "D-01: main → production (Bunny); GitHub Pages → manual staging (workflow_dispatch)"
  - "D-02: additive per-file PUT to zone root, no mirror/delete/purge; locked by source-introspection test"
  - "D-03: read CDN host switched to moths.pnwinsects.org everywhere + enforcing tests updated"
  - "C-01: pathPrefix GITHUB_PAGES conditional kept intact; C-02: no CNAME file"
metrics:
  duration: ~20 minutes
  completed: 2026-06-28
  tasks: 4
  files: 25
---

# Quick Task 260628-jtl: Switch Production to Custom Domain (moths.pnwinsects.org) Summary

Switched production from GitHub Pages to the custom domain
<https://moths.pnwinsects.org/> served by the existing Bunny CDN/storage zone, with a
new additive `_site` uploader and GitHub Pages demoted to a manual staging target.

## What changed

- **Task 1 (D-03):** Replaced the read CDN host literal `https://pnwmoths.b-cdn.net`
  with `https://moths.pnwinsects.org` across all 18 source/test/script/doc files that
  hardcoded it, and updated the tests/checks that enforce the literal
  (`eleventy.config.test.ts`, component + script tests, `check-cdn-urls.py`). The
  write/storage side (`la.storage.bunnycdn.com`, `BUNNY_ZONE=pnwmoths`,
  `BUNNY_API_KEY`, `api.bunny.net`) was left untouched.
- **Task 2 (D-02):** Added `scripts/upload-site.ts`, an additive Bunny Storage uploader
  for the built `_site`, modeled on `scripts/upload-images.ts` (same auth/retry/redact
  pattern). It PUTs each file to the zone ROOT (`siteObjectStorageUrl`, no `key-images/`
  prefix), sets a per-extension Content-Type (`contentTypeFor`), and walks the tree with
  `listSiteFiles`. It performs exactly one PUT per file — no remote listing, no removal,
  no destructive sync, no purge — an invariant locked by a source-introspection test.
  Added `npm run site:upload` and registered the new test.
- **Task 3 (D-01):** Renamed `deploy.yml` → `production.yml` (push→main builds at root
  `/` and uploads `_site` additively to Bunny via `npm run site:upload` using the
  `BUNNY_STORAGE_PASSWORD` secret; all Pages steps and `GITHUB_PAGES` removed, no purge).
  Created `staging.yml` (manual `workflow_dispatch` Pages deploy with `GITHUB_PAGES=true`
  building under `/pnwmoths/`). No CNAME file created.
- **Task 4:** Updated README Deployment section and CONTRIBUTING CI section to describe
  the production/staging model and document the required `BUNNY_STORAGE_PASSWORD` secret;
  dropped the stale `deploy.yml` reference and the inaccurate Docker-CI claim.

## Verification

- `git grep "pnwmoths.b-cdn.net"` (outside `.planning/`) returns nothing.
- `npm run typecheck` passes; `npm test` passes (432 tests, including 13 new
  `upload-site` tests and the unchanged `GITHUB_PAGES` pathPrefix assertion).
- `DRY_RUN=1 SITE_DIR=<fixture> node scripts/upload-site.ts` prints zone-root PUT
  targets and makes zero network calls.
- `production.yml` (push→main, Bunny upload, no Pages, no purge) and `staging.yml`
  (workflow_dispatch, Pages, `GITHUB_PAGES=true`) present; `deploy.yml` absent; no CNAME.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Additive-only invariant required removing token words from comments/code**
- **Found during:** Task 2 (verify block `! grep -nE "DELETE|mirror|--delete"`).
- **Issue:** The descriptive doc comment used the words "DELETE" and "mirror"/"mirrors",
  which the additive-only source-introspection check (and the verify grep) forbid.
- **Fix:** Reworded the comments to avoid the forbidden tokens (e.g. "removal request",
  "destructive sync", "same pattern as upload-images.ts") while preserving meaning.
- **Files modified:** scripts/upload-site.ts
- **Commit:** 8e784a7d

### Out-of-scope, reverted (not committed)

- `npm test`/`npm run typecheck` runs regenerated `data/key-coverage-report.json` and
  `data/key-matrix.json` with only an updated `generated` timestamp (a `build:key` side
  effect, unrelated to this task). Reverted to keep the working tree clean; not committed.

## Manual follow-up (cannot be automated)

The maintainer must add the GitHub Actions repository secret **`BUNNY_STORAGE_PASSWORD`**
(value = the Bunny `pnwmoths` Storage Zone password, same as the local `BUNNY_API_KEY`) at
GitHub → Settings → Secrets and variables → Actions. Until it exists, the production
workflow's upload step fails with a missing-password error (the rest of CI still runs).

## Known Stubs

None.

## Self-Check: PASSED

- scripts/upload-site.ts — FOUND
- scripts/upload-site.test.ts — FOUND
- .github/workflows/staging.yml — FOUND
- .github/workflows/production.yml — FOUND (deploy.yml absent)
- Commits 368f06eb, 8e784a7d, af2ea8df, 22582dff — FOUND
