---
phase: 07-code-quality-fixes
plan: "01"
subsystem: testing
tags: [testing, regression, code-quality, WR-01, WR-04]
dependency_graph:
  requires: []
  provides: [WR-01-test-coverage, WR-04-test-coverage, check-page-weight-in-npm-test]
  affects: [scripts/build-data.test.js, scripts/check-page-weight.test.js, package.json]
tech_stack:
  added: []
  patterns: [node:test integration test with wrapper .mjs, spawnSync for CLI regression tests]
key_files:
  created: []
  modified:
    - scripts/build-data.test.js
    - scripts/check-page-weight.test.js
    - package.json
    - .planning/REQUIREMENTS.md
decisions:
  - "Use wrapper .mjs pattern (same as existing bad-CSV test) for WR-01 glossary integration test — allows process.chdir to isolate the tmpDir"
  - "Do not assert exit code 0 for WR-04 test — script correctly exits 1 for missing SITE_DIR"
metrics:
  duration: "84s"
  completed_date: "2026-04-18"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 7 Plan 01: Code Quality Fixes — Regression Tests and Requirements Sign-Off Summary

Regression test coverage for WR-01 (glossary image_filename validation) and WR-04 (missing SITE_DIR guard), with check-page-weight.test.js wired into npm test, and all four WR requirements marked complete.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add regression tests for WR-01 and WR-04, wire check-page-weight.test.js into npm test | a894a26 | scripts/build-data.test.js, scripts/check-page-weight.test.js, package.json |
| 2 | Mark WR-01 through WR-04 complete in REQUIREMENTS.md | 891f052 | .planning/REQUIREMENTS.md |

## What Was Built

**WR-01 regression test** (`scripts/build-data.test.js`): Integration test that creates a tmpDir with copies of all valid CSVs plus a custom `glossary.csv` containing `bad file!.jpg` as `image_filename`. Runs `build-data.js` via a wrapper `.mjs` (same pattern as the existing bad-records integration test), asserts non-zero exit and stderr containing `"Invalid image_filename"`.

**WR-04 regression test** (`scripts/check-page-weight.test.js`): Uses `spawnSync` with a nonexistent `SITE_DIR` path, asserts the process exits cleanly (not signal-killed), and that output contains the `[page-weight]` prefix. Exit code 1 is expected and correct.

**package.json**: Added `scripts/check-page-weight.test.js` to the `test` script glob list between `build-data.test.js` and `src/components/*.test.js`.

**REQUIREMENTS.md**: All four WR items (`WR-01` through `WR-04`) changed from `- [ ]` to `- [x]`, traceability table updated to show plan `07-01`.

## Verification Results

- `npm test` exits 0 with 37 tests, 37 passing, 0 failing
- `integration: build-data.js rejects invalid image_filename in glossary.csv` — PASS
- `check-page-weight.js: handles missing SITE_DIR without unhandled exception` — PASS
- Both existing check-page-weight tests also pass (ok 12, ok 13)
- WR-02 confirmed: `src/_includes/base.njk` line 12 contains pagefind-ui.css `<link>` in `<head>`
- WR-03 confirmed: `src/_data/glossary.js` lines 33-34 have `conn.closeSync()` and `db.closeSync()`
- `grep -c "\- \[x\]" REQUIREMENTS.md` returns 4

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- scripts/build-data.test.js — modified with WR-01 test appended
- scripts/check-page-weight.test.js — modified with WR-04 test appended
- package.json — test script updated to include check-page-weight.test.js
- .planning/REQUIREMENTS.md — all four WR items checked, traceability updated
- Commit a894a26 — exists (test(07-01) commit)
- Commit 891f052 — exists (chore(07-01) commit)
