---
phase: 05-maintainability
plan: "03"
subsystem: docker-ci
tags: [docker, github-actions, node, npm, devex]
one_liner: "npm ci baked into Dockerfile layer with anonymous volume guard; GitHub Actions upgraded to setup-node@v6 reading .nvmrc"
dependency_graph:
  requires: []
  provides: [docker-cold-start-works, ci-node-version-from-nvmrc]
  affects: [Dockerfile, docker-compose.yml, .github/workflows/deploy.yml, .github/workflows/pr-check.yml]
tech_stack:
  added: []
  patterns: [anonymous-docker-volume-guard, node-version-file-nvmrc]
key_files:
  created: []
  modified:
    - Dockerfile
    - docker-compose.yml
    - .github/workflows/deploy.yml
    - .github/workflows/pr-check.yml
decisions:
  - "Anonymous /workspace/node_modules volume used instead of named volume — prevents .:/workspace bind mount from hiding image-baked node_modules without the cold-start-empty problem of named volumes"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-13"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
requirements: [MAINT-02, MAINT-04]
---

# Phase 05 Plan 03: Docker npm ci + setup-node v6 Summary

## What Was Built

Two UAT gaps closed:

1. **Docker cold start fix** — `npm ci` is now baked into the Dockerfile runtime stage. An anonymous volume at `/workspace/node_modules` prevents the `.:/workspace` bind mount from shadowing the image layer's node_modules. Cold-start `docker compose run --rm dev npm run build` now exits 0 with no `ERR_MODULE_NOT_FOUND`.

2. **GitHub Actions Node.js version** — Both `deploy.yml` and `pr-check.yml` upgraded from `actions/setup-node@v4` with hardcoded `node-version: '22'` to `actions/setup-node@v6` with `node-version-file: '.nvmrc'`. Node.js version is now sourced from `.nvmrc` and stays in sync automatically.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Bake npm ci into Dockerfile and remove shadowing node_modules volume | 4e819d7 | Dockerfile, docker-compose.yml |
| 2 | Upgrade setup-node to v6 and read Node.js version from .nvmrc | 06c9553 | .github/workflows/deploy.yml, .github/workflows/pr-check.yml |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Anonymous volume added to protect image-baked node_modules from workspace bind mount**
- **Found during:** Task 1 verification
- **Issue:** After removing the named `node_modules` volume and baking `npm ci` into the image, the `.:/workspace` bind mount (which maps the host project directory) was still shadowing `/workspace/node_modules` inside the container. The host directory has no `node_modules`, so the image layer's packages remained invisible. `require('@duckdb/node-api')` failed with `ERR_MODULE_NOT_FOUND`.
- **Fix:** Added anonymous volume `- /workspace/node_modules` to docker-compose.yml. Docker anonymous volumes take precedence over bind mounts at the same path, so the image layer's node_modules is preserved and visible to the running container. No top-level `volumes:` declaration — it is anonymous, not named.
- **Files modified:** docker-compose.yml
- **Commit:** 4e819d7

## Verification Results

1. `docker compose run --rm dev node -e "require('@duckdb/node-api')"` — exit 0
2. `docker compose run --rm dev npm run build` — exit 0, site built to _site/
3. Both workflow files: `grep -n "setup-node\|node-version"` shows `@v6` and `node-version-file: '.nvmrc'` in both, no `@v4` or hardcoded `'22'`
4. `grep node_modules docker-compose.yml` — only anonymous volume line, no named volume declaration

## Known Stubs

None.

## Threat Flags

None — changes are within the trust boundaries documented in the plan's threat model.

## Self-Check: PASSED

- Dockerfile exists with `RUN npm ci`: confirmed (line 21)
- docker-compose.yml has no named node_modules volume: confirmed (no `volumes:` block, no `node_modules:/workspace/node_modules`)
- deploy.yml uses setup-node@v6 with node-version-file: confirmed
- pr-check.yml uses setup-node@v6 with node-version-file: confirmed
- Task 1 commit 4e819d7: confirmed
- Task 2 commit 06c9553: confirmed
