---
phase: 05-maintainability
plan: "01"
subsystem: ci-cd
tags: [github-actions, docker, lychee, git-lfs, github-pages]
dependency_graph:
  requires: []
  provides: [ci-deploy, ci-pr-check, docker-dev-env, external-link-checking]
  affects: [package.json, .gitignore]
tech_stack:
  added:
    - GitHub Actions (deploy.yml, pr-check.yml)
    - nschloe/action-cached-lfs-checkout@v1 (LFS bandwidth management)
    - actions/deploy-pages@v4 (official GitHub Pages deploy)
    - lychee 0.23.0 (external link checker)
    - Docker multi-stage build (Node 22 + lychee + git-lfs)
  patterns:
    - Two-job GitHub Actions workflow (build artifact, then deploy)
    - Lychee binary cached in CI between runs (avoids repeated download)
    - Named Docker volume for node_modules (avoids host/container arch conflicts)
key_files:
  created:
    - .github/workflows/deploy.yml
    - .github/workflows/pr-check.yml
    - lychee.toml
    - Dockerfile
    - docker-compose.yml
  modified:
    - package.json (build:validate-links: removed --offline, added --config lychee.toml)
    - .gitignore (added .lycheecache)
decisions:
  - Used nschloe/action-cached-lfs-checkout instead of actions/checkout lfs:true to avoid LFS bandwidth quota exhaustion on GitHub free tier
  - lychee installed via GitHub Releases binary in both Dockerfile (builder stage) and CI (conditional download with cache)
  - Named node_modules Docker volume prevents native binary (DuckDB) architecture conflicts between host and container
  - External link checking enabled (removed --offline) per D-12; lychee.toml sets timeout=20, max_retries=3, accepts 429
metrics:
  duration: "~2 minutes"
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 05 Plan 01: CI/CD Pipeline and Docker Environment Summary

**One-liner:** GitHub Actions deploy+PR workflows with LFS caching, lychee external-link checking via lychee.toml, and a multi-stage Dockerfile providing Node 22 + lychee + git-lfs for reproducible local builds.

## What Was Built

### Task 1: GitHub Actions Workflows and Lychee Config

- `.github/workflows/deploy.yml` — two-job workflow (build + deploy) triggered on push to main. Caches npm dependencies (via setup-node), LFS objects (via nschloe/action-cached-lfs-checkout), lychee binary (actions/cache keyed to version), and lychee URL results (actions/cache with restore-keys pattern).
- `.github/workflows/pr-check.yml` — single-job build workflow triggered on pull_request to main. Same caching as deploy but no artifact upload or Pages deploy steps.
- `lychee.toml` — configures lychee with timeout=20, max_retries=3, cache=true, accepts 429 (rate-limit as success).
- `package.json` — `build:validate-links` updated from `--offline` to `--config lychee.toml` enabling external URL checking per D-12.
- `.gitignore` — added `.lycheecache` to prevent disk cache from entering version control.

### Task 2: Dockerfile and docker-compose.yml

- `Dockerfile` — multi-stage build. Stage 1 (debian:bookworm-slim) downloads lychee 0.23.0 binary from GitHub Releases. Stage 2 (node:22-bookworm-slim) installs git, git-lfs, ca-certificates via apt, copies lychee binary from stage 1, sets WORKDIR /workspace. No COPY of project files — volume-mount dev pattern.
- `docker-compose.yml` — convenience wrapper with `.:/workspace` volume mount and a named `node_modules` volume (isolates native binaries from host). Usage: `docker compose run --rm dev npm run build`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 7356522 | feat(05-01): add GitHub Actions workflows and lychee config |
| Task 2 | 3e580d2 | feat(05-01): add Dockerfile and docker-compose.yml for dev environment |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-05-02 | lychee version pinned to 0.23.0 in both Dockerfile ARG and CI cache key |
| T-05-04 | lychee.toml: timeout=20, max_retries=3, accept 429, cache=true |
| T-05-01 | Accepted (PoC scope): version-tag pinning used, not commit SHA |
| T-05-03 | Accepted: GitHub OIDC token handled by actions/deploy-pages |

## User Setup Required

Before first deploy, set GitHub Pages source to GitHub Actions:
**Repository Settings > Pages > Build and deployment > Source > GitHub Actions**

This is a one-time manual step — no workflow can automate it.

## Known Stubs

None — all files are complete and wired to the build pipeline.

## Self-Check: PASSED

- `.github/workflows/deploy.yml` — exists, contains actions/deploy-pages@v4 (verified)
- `.github/workflows/pr-check.yml` — exists, contains pull_request trigger (verified)
- `lychee.toml` — exists, contains timeout=20 (verified)
- `Dockerfile` — exists, contains node:22-bookworm-slim and COPY --from=lychee-builder (verified)
- `docker-compose.yml` — exists, contains volumes: (verified)
- `package.json` — build:validate-links uses --config lychee.toml without --offline (verified)
- `.gitignore` — contains .lycheecache (verified)
- Commits 7356522 and 3e580d2 exist in git log (verified)
