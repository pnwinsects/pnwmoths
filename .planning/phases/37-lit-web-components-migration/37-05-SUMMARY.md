---
phase: 37-lit-web-components-migration
plan: "05"
subsystem: src/components, eleventy.config.ts
tags: [main-ts, test-glob, SC-1, SC-4, SC-5, bundle-verification, zod-mini, vite-staging]
dependency_graph:
  requires:
    - src/components/*.ts (Plans 02-04 — all 8 components converted)
    - _site_baseline/ (Plan 01 — pre-Phase-37 snapshot)
    - src/types/schemas.ts (zod/mini — Plan 01)
  provides:
    - src/components/main.ts (renamed from .js; all 8 .ts specifiers)
    - package.json (test glob updated to *.test.ts)
    - SC-1 closed: zero .js source in src/components/; full typecheck + 225/225 tests green
    - SC-4 measured: gzipped bundle +3,346 bytes; only zod/mini in bundle (ZodMiniType confirmed)
    - SC-5 verified: data byte-identical; HTML differs only in content-hashed asset filenames (APPROVED 2026-06-10)
  affects:
    - Phase 38 CI Gate (can now verify full phase success criteria)
tech_stack:
  added: []
  patterns:
    - src/types passthrough copy in eleventy.config.ts (Vite staging fix for value imports)
    - SC-4 zod v4 grep methodology note: use ZodMiniType presence + absence of non-$-prefixed ZodError/ZodType
key_files:
  created:
    - src/components/main.ts (renamed from main.js)
  modified:
    - package.json (test glob src/components/*.test.js → src/components/*.test.ts)
    - eleventy.config.ts (added src/types passthrough copy for Vite staging)
decisions:
  - "Rule 3 auto-fix: added eleventyConfig.addPassthroughCopy({ 'src/types': 'types' }) — Vite stages components in .11ty-vite/components/ but src/types/ was absent; pnwm-taxon-browser.ts's value import (SpeciesStateSchema) caused UNRESOLVED_IMPORT at bundle time"
  - "SC-4 grep methodology note: zod v4 uses $ZodError/$ZodType as internal symbols (not public API); grep pattern 'ZodError|ZodType' matches $-prefixed variants; correct verification is ZodMiniType present + no non-$-prefixed ZodError/ZodType"
  - "SC-5 approved 2026-06-10: data files byte-identical; all 1537 HTML diffs are content-hashed asset filename references only; SC-4 gzip delta +3,346 B / +2.7% (121,833 → 125,179 bytes gzipped)"
metrics:
  duration: 1096s
  completed: "2026-06-10"
  tasks: 3 (all complete; SC-5 approved 2026-06-10)
  files: 3
---

# Phase 37 Plan 05: Finalization + Success Criteria Verification Summary

One-liner: main.js renamed to main.ts with all 8 .ts specifiers, test glob updated, SC-1 closed (225/225 tests, both tsconfigs clean); SC-4 measured (+3,346 bytes gzipped, zod/mini confirmed); SC-5 diff automated (data byte-identical, HTML asset-hash-only changes).

## What Was Built

### Task 1: Convert main.js → main.ts, update test glob, close SC-1

Renamed `src/components/main.js` → `src/components/main.ts` via `git mv` and updated all 8 side-effect import specifiers from `.js` to `.ts`:

```
import './pnwm-occurrence-map.ts';
import './pnwm-occurrence-popup.ts';
import './pnwm-phenology-chart.ts';
import './pnwm-filter-bar.ts';
import './pnwm-image-slideshow.ts';
import './pnwm-taxon-browser.ts';
import './pnwm-plate-viewer.ts';
import './glossary-tooltip.ts';
```

Updated `package.json` test glob from `src/components/*.test.js` → `src/components/*.test.ts`.

**SC-1 closure verified:**
- `src/components/main.ts` exists; `main.js` removed
- `grep -c "\.js'" src/components/main.ts` = 0 (all 8 specifiers are .ts)
- `ls src/components/*.js 2>/dev/null | wc -l` = 0 (zero .js source remains)
- `grep -c "src/components/*.test.ts" package.json` = 1; .test.js = 0
- `grep -rc "@ts-ignore" src/components/*.ts | grep -v ':0'` = empty (no @ts-ignore)
- `npm run typecheck` exits 0 (both tsconfigs)
- `npm test` passes **225/225** tests (up from 218 at Phase 37 start; 7 new tests from Plans 02-04)

### Task 2: Build production bundle and verify SC-4

**Rule 3 auto-fix — `src/types` Vite staging:** `npm run build` failed with `UNRESOLVED_IMPORT` on `pnwm-taxon-browser.ts`'s value import `SpeciesStateSchema` from `../types/index.ts`. Eleventy-plugin-vite stages `src/components/` → `.11ty-vite/components/` but did not stage `src/types/`. All prior components' `../types/` imports were `import type` (erased at transpile time), so this was hidden until the first value import appeared. Fix: `eleventyConfig.addPassthroughCopy({ "src/types": "types" })` in `eleventy.config.ts`.

**SC-4 Verification Results:**

| Metric | Value |
|--------|-------|
| Post-migration main bundle raw size | 401,095 bytes |
| Post-migration main bundle gzipped | **125,179 bytes** |
| Pre-migration baseline (Plan 01) | 121,833 bytes |
| **Gzip delta** | **+3,346 bytes (+2.7%)** |
| ZodMiniType present in bundle | YES (1 occurrence — confirms zod/mini shipped) |
| Non-`$`-prefixed ZodError/ZodType in bundle | 0 (full classic Zod absent) |
| `$ZodError` / `$ZodType` in bundle | 3/2 (internal zod v4 symbols, not public API exports) |

**Note on zod v4 grep methodology:** The RESEARCH.md's SC-4 grep command (`grep -c "ZodError\|ZodType"`) was designed for zod v3 where `ZodError` and `ZodType` were the public export names. In zod v4, these are `$ZodError` and `$ZodType` — internal implementation symbols used by both `zod/mini` and classic zod. The correct check is: `ZodMiniType` present = zod/mini shipped; `grep -oP '(?<!\$)ZodError|(?<!\$)ZodType'` = 0 means no full classic Zod. Both conditions satisfied.

### Task 3: SC-5 byte-identical verification (APPROVED)

Automated diff against `_site_baseline/` (pre-Phase-37 snapshot from Plan 01):

**Data files (parquet/json) — byte-identical:**
```
diff -rq _site_baseline/ _site/ | grep -E '\.(parquet|json)$'
```
Result: **no output** (empty — all .parquet and .json files are byte-identical to baseline).

**Full diff summary:**
- "Only in" entries: 5,736 (all in `assets/` — the re-hashed JS/map bundles for each species page)
- "Files differ" entries: **1,537** (all are `.html` files)

**HTML diff analysis:** Every HTML file that differs changes ONLY content-hashed asset filename references. Sample diffs:

browse/index.html:
```
< <script type="module" crossorigin src="/assets/main-mhZWKs7f.js"></script>
> <script type="module" crossorigin src="/assets/main-B_8Fezh_.js"></script>
```

species/abagrotis-apposita/index.html:
```
< <script src="/assets/species/abagrotis-apposita/index-Lvs9JDyp.js">
> <script src="/assets/species/abagrotis-apposita/index-CIxVzbcM.js">
< <link rel="modulepreload" href="/assets/main-mhZWKs7f.js">
> <link rel="modulepreload" href="/assets/main-B_8Fezh_.js">
```

Per the Phase 34 Plan 03 decision (in STATE.md): "Vite content-hash filename changes between builds are non-deterministic (sourceMappingURL self-reference); byte-identity gate assesses HTML prose content, not asset filenames." The non-deterministic hashes are expected.

**No prose, markup, or data content changed.** The `diff -rq | grep -v '/assets/'` output contains only the HTML files whose asset-filename `<script>` and `<link>` tags changed.

**Human approval received 2026-06-10:** Confirmed SC-5 diff is clean — data files byte-identical, all HTML differences confined to content-hashed asset filenames, zero prose/markup regressions. SC-4 gzip delta +3,346 B / +2.7% accepted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing src/types passthrough copy in Vite staging**
- **Found during:** Task 2 `npm run build`
- **Issue:** `[UNRESOLVED_IMPORT] Could not resolve '../types/index.ts' in .11ty-vite/components/pnwm-taxon-browser.ts`. Eleventy-plugin-vite copies `src/components/` to `.11ty-vite/components/` but the relative `../types/` path was absent from the Vite staging directory. All prior `../types/` imports were `import type` (erased at transpile time); the first value import (`SpeciesStateSchema`) exposed the missing staging.
- **Fix:** Added `eleventyConfig.addPassthroughCopy({ "src/types": "types" })` to `eleventy.config.ts`
- **Files modified:** `eleventy.config.ts`
- **Commit:** 02046de6

**2. [Rule 1 - Documentation] SC-4 grep methodology for zod v4**
- **Found during:** Task 2 SC-4 verification
- **Issue:** RESEARCH.md grep pattern `ZodError\|ZodType` returns count=1 (from `$ZodError` internal symbols in zod/mini itself). This is a false positive — zod v4 renamed the public exports to `$`-prefixed internal symbols.
- **Documentation:** Added methodology note in SUMMARY.md and commit message. The correct positive indicator is `ZodMiniType` present (confirms mini shipped). No code change needed.

## Known Stubs

None — this plan closes the migration and verifies the build. No new UI data flows.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced. The Vite staging fix (`src/types` passthrough) affects build-time staging only, not runtime.

| Threat | Status |
|--------|--------|
| T-37-08 (full-Zod in bundle) | MITIGATED: ZodMiniType present; no non-$-prefixed ZodError/ZodType |
| T-37-09 (unintended build-output drift) | MITIGATED: SC-5 approved 2026-06-10 — data byte-identical, HTML asset-hash-only changes |

## Self-Check

### Files Exist
- [x] `src/components/main.ts` — exists
- [x] `src/components/main.js` — removed (zero .js files in src/components/)
- [x] `_site/assets/main-B_8Fezh_.js` — exists (production bundle)

### Commits Exist
- [x] 86ec9d12 — feat(37-05): rename main.js → main.ts; update test glob and all 8 import specifiers
- [x] 02046de6 — feat(37-05): add src/types passthrough copy to Vite staging (SC-4 build fix)

### SC-1 Closure
- [x] Zero .js source files in `src/components/`
- [x] `npm run typecheck` exits 0
- [x] `npm test` passes 225/225
- [x] No `@ts-ignore` in any converted file

### SC-4 Verification
- [x] `ZodMiniType` count = 1 (zod/mini confirmed)
- [x] Non-`$`-prefixed `ZodError`/`ZodType` count = 0 (full Zod absent)
- [x] Gzip delta recorded: +3,346 bytes (121,833 → 125,179 bytes)

### SC-5 Automated Evidence
- [x] `diff -rq _site_baseline/ _site/ | grep -E '\.(parquet|json)$'` — no output (data byte-identical)
- [x] All 1,537 HTML diffs are content-hashed asset filename changes only
- [x] Human approval received 2026-06-10 — data byte-identical; HTML asset-hash-only changes confirmed clean

## Self-Check: PASSED
