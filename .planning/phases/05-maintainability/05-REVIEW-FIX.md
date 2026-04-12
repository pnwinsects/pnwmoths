---
phase: 05-maintainability
fixed_at: 2026-04-12T22:00:00Z
review_path: .planning/phases/05-maintainability/05-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 6
skipped: 1
status: partial
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-04-12
**Source review:** .planning/phases/05-maintainability/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04, WR-05)
- Fixed: 6
- Skipped: 1

## Fixed Issues

### CR-01, WR-01, WR-02, WR-03: Lychee binary unverified + duplicated install blocks + hardcoded version + missing permissions

**Files modified:** `.github/actions/install-lychee/action.yml`, `.github/workflows/deploy.yml`, `.github/workflows/pr-check.yml`
**Commit:** e5cae4f
**Applied fix:** Created a reusable composite action at `.github/actions/install-lychee/action.yml` that accepts a `version` input, caches the binary, downloads it, and verifies the SHA-256 (`1fcb6ccf10d04c22b8c5873c5b9cb7be32ee7423e12169d6f1a79a6f1962ef81`) before extracting. Both workflows now use `- uses: ./.github/actions/install-lychee` with `version: '0.23.0'`, eliminating the 12-line duplicated block and making the version a single declaration. Added `permissions: contents: read` to `pr-check.yml` to restrict token scope.

### CR-02: Lychee binary downloaded without checksum verification (Dockerfile)

**Files modified:** `Dockerfile`
**Commit:** 81e336c
**Applied fix:** Added `sha256sum -c -` verification step in the `RUN` layer immediately after the `wget` download, using the same SHA-256 hash (`1fcb6ccf10d04c22b8c5873c5b9cb7be32ee7423e12169d6f1a79a6f1962ef81`) computed from the official release artifact.

### WR-04: `build:eleventy` uses `npx` instead of the local binary

**Files modified:** `package.json`
**Commit:** e76ba11
**Applied fix:** Changed `"build:eleventy": "npx @11ty/eleventy"` to `"build:eleventy": "eleventy"`. npm scripts automatically add `node_modules/.bin` to PATH, so the locally installed binary resolves correctly after `npm ci`.

## Skipped Issues

### WR-05: `@duckdb/node-api` pinned to a pre-release version

**File:** `package.json:22`
**Reason:** No stable release of `@duckdb/node-api` exists yet. All published versions (`1.4.x-r.N`, `1.5.x-r.N`) carry pre-release suffixes. Upgrading to `^1.5.1` (without suffix) would reference a version that does not exist in the registry and would break `npm ci`. Track [duckdb/node-neo releases](https://github.com/duckdb/node-neo/releases) and apply this fix when a stable release ships.
**Original issue:** `^1.5.1-r.2` semver range will not auto-upgrade to a stable `1.5.1` or later if one ships.

---

_Fixed: 2026-04-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
