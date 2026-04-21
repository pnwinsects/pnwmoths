---
phase: 13-cdn-provisioning
plan: "01"
subsystem: build-pipeline
tags: [cdn, build-data, eleventy, validation, tdd]
dependency_graph:
  requires: []
  provides:
    - CDN_BASE_URL constant in eleventy.config.js
    - Widened filename validation regex in build-data.js
  affects:
    - Phase 14 template migration (reads CDN_BASE_URL)
    - Phase 13 Plan 02 migration script (filenames with spaces pass validation)
tech_stack:
  added: []
  patterns:
    - Hard-coded public constant pattern (no env var, no dotenv)
    - TDD RED/GREEN cycle for both changes
key_files:
  created:
    - eleventy.config.test.js
  modified:
    - eleventy.config.js
    - scripts/build-data.js
    - scripts/build-data.test.js
    - package.json
decisions:
  - CDN_BASE_URL is a hard-coded public constant (not a secret, no process.env, no dotenv) per D-01
  - Space added between 9 and . in character class to avoid ambiguity: [a-zA-Z0-9 ._-]
metrics:
  duration: 162s
  completed: "2026-04-21"
  tasks_completed: 2
  files_changed: 5
---

# Phase 13 Plan 01: CDN Codebase Preparation Summary

**One-liner:** Hard-coded CDN_BASE_URL constant added to eleventy.config.js and Django original filename spaces accepted by widening two validation regexes in build-data.js.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | CDN_BASE_URL test | 8626691 | eleventy.config.test.js, package.json |
| 1 (GREEN) | CDN_BASE_URL constant | ee6b1cd | eleventy.config.js |
| 2 (RED) | Filename regex test | 897e581 | scripts/build-data.test.js |
| 2 (GREEN) | Filename regex widened | d4632d9 | scripts/build-data.js |

## What Was Built

### Task 1: CDN_BASE_URL constant (eleventy.config.js)

Added immediately after the `pathPrefix` declaration:

```js
// bunny.net Pull Zone — public CDN base URL. Not a secret; hard-coded here.
// To update: log in to bunny.net dashboard, find the Pull Zone hostname, paste here.
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
```

No `process.env`, no `dotenv`, no conditional — a plain public constant per decision D-01.

### Task 2: Widened filename validation (scripts/build-data.js)

Both validation loops updated:
- images.csv: `/^[a-zA-Z0-9._-]+$/` → `/^[a-zA-Z0-9 ._-]+$/`
- glossary.csv: same fix
- Error messages updated to include "spaces" in the allowed-chars list

This enables Django original filenames like `Acronicta americana-A-D.jpg` to pass validation.

### Test additions

- `eleventy.config.test.js` (new file): 5 tests covering CDN_BASE_URL value, placement, and absence of env-var machinery
- `scripts/build-data.test.js` (extended): 2 new tests — unit test for the widened regex and integration test running build-data.js with a space-containing filename
- `package.json` updated: `eleventy.config.test.js` added to `npm test` command

**Total tests:** 65 (up from 58); all pass.

## Verification

```
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net"   ← line 14 of eleventy.config.js
PASS: no env var machinery
Both regexes: /^[a-zA-Z0-9 ._-]+$/  (2 occurrences)
regex smoke tests: PASS
npm test: 65/65 pass
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Integration test used await import() inside sync function**
- **Found during:** Task 2 RED phase
- **Issue:** The integration test draft used `await import(...)` inside a non-async test callback, causing a SyntaxError at module load time
- **Fix:** Removed the dynamic imports — the required modules (`resolve`, `mkdirSync`, `writeFileSync`, `copyFileSync`, `rmSync`, `execSync`) were already imported at the top of build-data.test.js
- **Files modified:** scripts/build-data.test.js
- **Commit:** 897e581 (corrected in same RED commit before push)

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED | 8626691 | PASS — 3 tests failed as expected |
| Task 1 GREEN | ee6b1cd | PASS — all 5 tests pass |
| Task 2 RED | 897e581 | PASS — 1 test failed as expected |
| Task 2 GREEN | d4632d9 | PASS — all 65 tests pass |

## Known Stubs

None — this plan establishes a constant and fixes a validation regex. No data is rendered via CDN_BASE_URL yet (that is Phase 14).

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model. CDN_BASE_URL is intentionally public (T-13-01-01 accepted). Regex widening adds only space character; path traversal chars remain rejected (T-13-01-02 mitigated).

## Self-Check: PASSED

- [x] eleventy.config.js contains `const CDN_BASE_URL = "https://pnwmoths.b-cdn.net"` at line 14
- [x] scripts/build-data.js contains `/^[a-zA-Z0-9 ._-]+$/` at 2 locations
- [x] eleventy.config.test.js exists
- [x] npm test: 65/65 pass
- [x] Commits 8626691, ee6b1cd, 897e581, d4632d9 present in git log
