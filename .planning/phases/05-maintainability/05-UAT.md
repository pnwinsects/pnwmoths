---
status: complete
phase: 05-maintainability
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md]
started: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:01:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Docker Build
expected: Kill any running dev container. From a clean state, run `docker compose run --rm dev npm run build`. Container starts, Eleventy build completes, exits 0. No native binary architecture errors.
result: issue
reported: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@duckdb/node-api' imported from /workspace/scripts/build-data.js"
severity: blocker

### 2. Deploy Workflow — push triggers build + deploy
expected: `.github/workflows/deploy.yml` exists. On push to main it runs two jobs: (1) build — installs npm deps, builds site, checks links, uploads artifact; (2) deploy — deploys to GitHub Pages. Verify by inspecting the file or checking a recent Actions run.
result: issue
reported: "actions are out of date, and there are hardcoded nodejs versions rather than reading from .nvmrc"
severity: major

### 3. PR Check Workflow — pull request triggers build
expected: `.github/workflows/pr-check.yml` exists. Triggered on pull_request to main. Runs the same build + link-check job (no deploy step). Verify by inspecting the file or checking a recent Actions run on a PR.
result: pass

### 4. External Link Checking enabled
expected: Running `npm run build:validate-links` invokes lychee with `--config lychee.toml` (NOT `--offline`). The command actually makes outbound HTTP requests to check external URLs. `lychee.toml` sets timeout=20, max_retries=3, accepts 429 as success.
result: pass

### 5. Lychee cache is gitignored
expected: `.lycheecache` appears in `.gitignore`. Running `git status` after a lychee run should not show `.lycheecache` as an untracked file.
result: pass

### 6. ADDING_SPECIES.md — correct schema and steps
expected: `_instructions/ADDING_SPECIES.md` exists. Opening it shows: (1) a schema table with 8 fields for species.csv, (2) slug naming convention, (3) numbered steps with exact commands, (4) optional description file step, (5) verification via `npm run build`.
result: pass

### 7. ADDING_RECORDS.md — complete schema with record types
expected: `_instructions/ADDING_RECORDS.md` exists. Contains all 14 fields for records.csv, valid state values (WA/OR/ID/MT/BC), and all four record types: specimen, photograph, literature, field notes.
result: pass

### 8. EDITING_DESCRIPTION.md — YAML frontmatter requirements
expected: `_instructions/EDITING_DESCRIPTION.md` exists. Shows required YAML frontmatter fields and their formats, plus slug-to-filename matching rules (e.g. species slug maps to `content/species/{slug}.md`).
result: pass

### 9. ADDING_PHOTO.md — Git LFS workflow steps
expected: `_instructions/ADDING_PHOTO.md` exists. Contains explicit Git LFS steps: `git lfs install`, `git lfs status`, adding image as pointer. Also includes images.csv schema and reference to `.gitattributes` tracking patterns.
result: pass

## Summary

total: 9
passed: 7
issues: 2
skipped: 0
pending: 0

## Gaps

- truth: "docker compose run --rm dev npm run build completes successfully with no missing package errors"
  status: failed
  reason: "User reported: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@duckdb/node-api' imported from /workspace/scripts/build-data.js"
  severity: blocker
  test: 1
  artifacts: []
  missing: []

- truth: "GitHub Actions workflows use current action versions and read Node.js version from .nvmrc"
  status: failed
  reason: "User reported: actions are out of date, and there are hardcoded nodejs versions rather than reading from .nvmrc"
  severity: major
  test: 2
  artifacts: []
  missing: []
