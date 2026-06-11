---
phase: 34-scripts-lib-src-lib-migration
plan: "01"
subsystem: build-pipeline
tags: [migration, typescript, baseline, testing]
dependency_graph:
  requires: []
  provides: [_site_baseline/, package.json test globs for .ts]
  affects: [package.json, .gitignore]
tech_stack:
  added: []
  patterns: [node --test brace-glob {js,ts}]
key_files:
  created:
    - .planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md
  modified:
    - package.json
    - .gitignore
decisions:
  - Baseline built with partial build chain (omit lychee/pagefind) — produced all 1,433 species pages
  - _site_baseline/ gitignored (not committed) — working-tree artifact for Phase 34 duration
  - Test globs use single-quoted brace syntax in package.json to work across shells
metrics:
  duration: ~10 minutes
  completed: "2026-06-09"
---

# Phase 34 Plan 01: Wave-0 Setup — Baseline & Test Glob Broadening Summary

**One-liner:** Pre-migration _site_baseline/ snapshot (1,433 species pages) captured for SC-4 byte-identity gate, and package.json test globs broadened to accept .test.ts via Node 24 native brace expansion.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Capture pre-migration _site/ baseline | 64eaa9c2 | BASELINE.md, .gitignore |
| 2 | Broaden test globs to cover .test.ts | 336424a5 | package.json |

## What Was Built

**Task 1:** Ran the build chain (`build:data`, `build:eleventy`, `build:copy-parquet`, `build:copy-images`, `build:species-states`) to produce a fresh `_site/` with 1,433 species pages. Copied `_site/` to `_site_baseline/`. Added `_site_baseline/` to `.gitignore` (working-tree artifact; not committed). Authored `BASELINE.md` recording the snapshot path, species-page count, snapshot date, build command, and the exact `diff -r _site/ _site_baseline/` gate command for downstream plans.

**Task 2:** Edited the `test` script in `package.json` — changed `scripts/lib/*.test.js` → `'scripts/lib/*.test.{js,ts}'` and `src/_lib/*.test.js` → `'src/_lib/*.test.{js,ts}'`. Single-quoted to ensure brace expansion is handled by the shell (Node 24 native type-stripping accepts `.ts` files with no flags). All other globs unchanged. Ran `npm test`: 224/224 tests pass, confirming the glob change is a no-op on the still-all-.js suite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added _site_baseline/ to .gitignore**
- **Found during:** Task 1
- **Issue:** The plan says "do NOT commit" `_site_baseline/` but `.gitignore` only covered `_site/`. Without adding `_site_baseline/` to `.gitignore`, it would appear as an untracked directory and could be accidentally staged.
- **Fix:** Added `_site_baseline/` to `.gitignore` alongside `_site/`.
- **Files modified:** `.gitignore`
- **Commit:** 64eaa9c2

**2. Partial build command used (informational)**
- **Found during:** Task 1
- **Issue:** Full `npm run build` includes `build:validate-links` (lychee) which requires network access and `build:pagefind`. The plan's key reminders document this fallback.
- **Fix:** Used `build:data && build:eleventy && build:copy-parquet && build:copy-images && build:species-states` — produces all species pages. Documented in BASELINE.md.
- **Impact:** None — pagefind and link checking do not affect species page HTML content or the byte-identity gate.

**3. Test count is 224, not ~191 (informational)**
- **Found during:** Task 2 verification
- **Issue:** The plan references "same ~191 tests as before." Phase 33 added tests, bringing the current count to 224.
- **Resolution:** 224/224 pass. The glob change is confirmed as a no-op. This is the correct current baseline.

## Verification Results

- `_site_baseline/` contains 1,433 species pages — matches fresh `_site/` build.
- `BASELINE.md` committed: records snapshot path, page count, snapshot date, build command, and `diff -r` gate command.
- `_site_baseline/` does NOT appear in `git status` (gitignored).
- `package.json` `test` script contains `'scripts/lib/*.test.{js,ts}'` and `'src/_lib/*.test.{js,ts}'`.
- No `--experimental-strip-types` flag added.
- `npm test`: 224/224 pass, 0 fail.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- [x] BASELINE.md exists at .planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md
- [x] Commit 64eaa9c2 exists (Task 1)
- [x] Commit 336424a5 exists (Task 2)
- [x] _site_baseline/ contains 1,433 species pages
- [x] package.json contains broadened globs
