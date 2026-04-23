---
phase: 19-build-time-glossary-transform
plan: 03
subsystem: build
tags: [eleventy, addTransform, glossary, csv-parse, integration]

# Dependency graph
requires:
  - phase: 19-01
    provides: "src/_lib/glossary-transform.js — applyGlossaryTerms, buildTermMap exports"
  - phase: 19-02
    provides: "unit test coverage as regression guard"
provides:
  - "eleventy.config.js modified — glossary-terms addTransform registered; CSV loaded at startup"
  - "Species pages annotated at build time with <abbr class='glossary-term'> elements"
affects:
  - Phase 20 (popover UI reads abbr elements produced by this transform)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scope CSV load via readFileSync + parseCsv before export default function — shared via closure across all addTransform invocations"
    - "addTransform with regular function callback (not arrow) to preserve this.page.outputPath binding"
    - "outputPath null-guard then endsWith('.html') then includes('/species/') — three-layer scope guard"

key-files:
  created: []
  modified:
    - "eleventy.config.js — four targeted additions: readFileSync in node:fs import, csv-parse/sync and glossary-transform imports, module-scope CSV load, addTransform registration"

key-decisions:
  - "Symlinked worktree node_modules to main repo — worktree lacked node_modules/, causing copy-images.js to fail on openseadragon path resolution (pre-existing worktree infrastructure issue, not related to plan changes)"

# Metrics
duration: 11min
completed: 2026-04-23
---

# Phase 19 Plan 03: Eleventy Integration Summary

**Wire glossary transform into eleventy.config.js — four targeted changes connect the pure utility (plan 01) to the Eleventy build pipeline so species pages get <abbr class="glossary-term"> annotations at build time**

## Performance

- **Duration:** ~11 min (including full Eleventy build ~16s + debugging worktree node_modules issue)
- **Started:** 2026-04-23T21:23:18Z
- **Completed:** 2026-04-23T21:33:46Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Modified eleventy.config.js with exactly four targeted changes: added `readFileSync` to existing `node:fs` import, added `csv-parse/sync` and `./src/_lib/glossary-transform.js` imports, added module-scope glossary CSV loading and `buildTermMap` call, registered `addTransform("glossary-terms")` with regular function callback and three-layer outputPath guard
- Build produces 10 species pages (of 11 with prose) with correct `<abbr class="glossary-term" title="..." data-definition="..." data-image-url="...">` structure
- Glossary page and browse pages verified clean — no `abbr` injection outside species scope
- All 96 unit tests pass (no regression)
- No hardcoded `/pnwmoths/` path added

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire glossary transform into eleventy.config.js** — `eb79b67` (feat)
2. **Task 2: Integration verification** — no commit (verification-only task, no file changes)

## Files Created/Modified

- `eleventy.config.js` — four targeted additions; no existing code modified

## Decisions Made

- Symlinked `node_modules/` in worktree to main repo's `node_modules/` — pre-existing worktree infrastructure issue caused `copy-images.js` to fail with ENOENT on OpenSeadragon images path; symlink resolves the path resolution mismatch without touching any plan files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked node_modules into worktree for copy-images.js path resolution**
- **Found during:** Task 1 (build verification after eleventy.config.js changes)
- **Issue:** The worktree at `/Users/rainhead/dev/pnwmoths/.claude/worktrees/agent-a0acced7/` had no `node_modules/` directory. `scripts/copy-images.js` uses `resolve('node_modules/openseadragon/...')` which resolves relative to CWD (the worktree root), not via Node module resolution. This caused ENOENT, which triggered the Vite plugin's error-recovery path (rename `.11ty-vite/` → `_site/`), which then failed with ENOTEMPTY because `_site/` had files from the Eleventy passthrough copy. The chain: missing `openseadragon` → `copy-images.js` exit 1 → Vite PLUGIN_ERROR → catch-block rename fails → ENOTEMPTY fatal error.
- **Fix:** `ln -s /Users/rainhead/dev/pnwmoths/node_modules /Users/rainhead/dev/pnwmoths/.claude/worktrees/agent-a0acced7/node_modules` — symlinks the main repo's installed modules into the worktree. Already in `.gitignore` so no tracking needed.
- **Root cause:** Pre-existing worktree infrastructure gap, not caused by plan 03 changes. Plans 01 and 02 only ran unit tests and did not trigger the full Eleventy+Vite build pipeline.
- **Files modified:** None (symlink creation, gitignored)
- **Verification:** `npm run build:eleventy` exits 0 after fix; `node scripts/copy-images.js` succeeds.

## Integration Verification Results

| Condition | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Species pages with abbr | ≥ 1 | 10 files | PASS |
| Glossary page clean | 0 abbr | 0 abbr | PASS |
| Browse pages clean | 0 abbr | 0 abbr | PASS |
| npm test | 96/96 | 96/96 | PASS |
| Build exit code | 0 | 0 | PASS |

## Known Stubs

None — all glossary term data is wired from `data/glossary.csv` at build time. CDN image URLs are generated from the actual `image_filename` column values. No placeholder values in the output.

## Threat Flags

No new security-relevant surface introduced beyond what was planned.

Threat mitigations applied per plan threat model:
- T-19-05: outputPath null guard — `if (!outputPath || !outputPath.endsWith(".html"))` present
- T-19-06: Arrow function avoided — regular `function` callback preserves `this.page.outputPath`

## Self-Check: PASSED

All expected files found:
- `eleventy.config.js` (modified) — FOUND
- `_site/species/habrosyne-scripta/index.html` (sample species page) — FOUND with abbr elements
- `_site/glossary/index.html` — FOUND, clean (no abbr)
- `19-03-SUMMARY.md` — FOUND (this file)

All task commits found:
- `eb79b67` (feat(19-03): wire glossary transform into eleventy.config.js) — FOUND

---
*Phase: 19-build-time-glossary-transform*
*Completed: 2026-04-23*
