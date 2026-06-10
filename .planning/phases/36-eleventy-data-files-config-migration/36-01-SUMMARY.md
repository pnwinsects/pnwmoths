---
phase: 36-eleventy-data-files-config-migration
plan: 01
subsystem: eleventy-config
tags: [migration, typescript, eleventy, config, addDataExtension, pathPrefix]
dependency_graph:
  requires: []
  provides:
    - eleventy.config.ts (TypeScript Eleventy config with addDataExtension + repointed execFile paths)
    - addDataExtension("ts") registration enabling Plans 02/03 _data/*.ts discovery
    - --config=eleventy.config.ts wiring in build:eleventy and dev scripts
  affects:
    - src/_data/*.ts (now discoverable via addDataExtension glob)
    - plans 02/03 (depend on this loading mechanism being present)
tech_stack:
  added: []
  patterns:
    - addDataExtension("ts", { read: false, parser: import() }) for Eleventy .ts data file discovery
    - Ambient .d.ts shim for @11ty/eleventy and @11ty/eleventy-plugin-vite module declarations
key_files:
  created:
    - eleventy.config.ts
    - eleventy.config.test.ts
  modified:
    - package.json (build:eleventy + dev + test scripts)
    - tsconfig.node.json (include: eleventy.config.test.ts added)
    - src/types/eleventy.d.ts (ambient module declarations; addDataExtension; vite plugin shim)
  deleted:
    - eleventy.config.js
    - eleventy.config.test.js
    - src/_data/taxon.d.ts (Rule 1 auto-fix: Phase-35 stopgap .d.ts blocked addDataExtension)
decisions:
  - D-01: Source-string presence assertion for GITHUB_PAGES conditional — no config module import in test (side effects)
  - D-02: Four execFile paths repointed .js→.ts; child-node spawn pattern kept
  - D-03: EleventyConfig declared as ambient global interface in eleventy.d.ts (no top-level exports to keep declare module blocks as ambient)
  - addDataExtension parser uses isAbsolute() check + resolve(process.cwd(), filePath) defensive resolution (RESEARCH Open Question A1)
metrics:
  duration: 585s
  completed: "2026-06-10"
  tasks_completed: 3
  files_changed: 7
  commits: 3
---

# Phase 36 Plan 01: Eleventy Config TypeScript Keystone Summary

**One-liner:** TypeScript Eleventy config with addDataExtension("ts") parser and --config flag, plus repointed execFile paths, establishing the .ts data file loading mechanism for Plans 02/03.

## What Was Built

Three tasks:

1. **Task 1:** Converted `eleventy.config.js` → `eleventy.config.ts`. Added type annotations using ambient `EleventyConfig` interface from the local shim. Registered `addDataExtension("ts", { read: false, parser })` as the first statement in the config body so Eleventy's glob discovers `src/_data/*.ts` files (RESEARCH FINDING 2). Repointed four `execFile` path strings from `.js` → `.ts` (D-02; repairs the Phase 35 breakage). Preserved the `GITHUB_PAGES`-conditional `pathPrefix` verbatim (project memory D-01). Added `--config=eleventy.config.ts` to `build:eleventy` and `dev` npm scripts (RESEARCH FINDING 1; Pitfall 1). Updated `src/types/eleventy.d.ts` to be a purely ambient declaration file (no top-level exports) so `declare module '@11ty/eleventy'` and `declare module '@11ty/eleventy-plugin-vite'` work as ambient module stubs.

2. **Task 2:** Renamed `eleventy.config.test.js` → `eleventy.config.test.ts`. Updated `readFileSync` target from `.js` to `.ts` (Pitfall 3). Added the D-01 GITHUB_PAGES pathPrefix source-string assertion. Added `"eleventy.config.test.ts"` to `tsconfig.node.json` include array (RESEARCH tsconfig gap). Updated `package.json` test script glob. All 6 tests pass under `node --test`.

3. **Task 3 (verification):** Ran `npm run build:eleventy` (now using `--config=eleventy.config.ts`). The build succeeded with 1,433 species pages — matching baseline. The byte-identical diff shows only Vite CSS bundle non-determinism in `search/index.html` (documented Phase 34/35 behavior). The full `npm test` suite passes 218/218 tests.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | da4543c3 | feat(36-01): convert eleventy.config.js → .ts with addDataExtension and execFile repoint |
| 2 | 94231845 | feat(36-01): rename eleventy.config.test.js → .ts with D-01 GITHUB_PAGES assertion |
| 3 (auto-fix) | 339acf49 | fix(36-01): delete taxon.d.ts to prevent addDataExtension parser from loading .d.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Deleted src/_data/taxon.d.ts early (Phase-35 stopgap broke addDataExtension)**
- **Found during:** Task 3 (first build:eleventy run)
- **Issue:** `src/_data/taxon.d.ts` contained `declare function taxon(): Promise<unknown[]>` — a Phase-35 stopgap for typed imports. When `addDataExtension("ts")` registered the `.ts` glob, Eleventy discovered and tried to `import()` `taxon.d.ts` via the parser. At runtime the `declare function taxon()` is not defined, causing `ReferenceError: taxon is not defined`.
- **Fix:** Deleted `src/_data/taxon.d.ts`. The Plan's PATTERNS.md and Pitfall 4 documented this deletion should happen in the same commit as creating `taxon.ts` (Plan 02). However, the addDataExtension registration in Plan 01 picks up `.d.ts` files matching the `*.ts` glob immediately, making deletion blocking. Applied Rule 1: deleted early. Plans 02 will create `taxon.ts` as planned.
- **Files modified:** `src/_data/taxon.d.ts` (deleted)
- **Commit:** 339acf49

**2. [Rule 2 - Missing critical functionality] Made src/types/eleventy.d.ts purely ambient**
- **Found during:** Task 1 typecheck
- **Issue:** Original shim had top-level `export interface` statements making it a TypeScript module. `declare module '@11ty/eleventy'` inside a module file is module augmentation (requires the module to already exist with type declarations). Since `@11ty/eleventy` has no `.d.ts`, augmentation failed with TS7016.
- **Fix:** Removed all `export` keywords from interface declarations, making the file a purely ambient `.d.ts`. Global `EleventyConfig` interface is now accessible without import. Added `declare module '@11ty/eleventy-plugin-vite'` ambient stub.
- **Files modified:** `src/types/eleventy.d.ts`
- **Commit:** da4543c3

**3. [Rule 2 - Missing critical functionality] Added GlossaryRow cast for parseCsv return**
- **Found during:** Task 1 typecheck
- **Issue:** `csv-parse/sync`'s `parseCsv()` returns `unknown[]`. `buildTermMap()` requires `GlossaryRow[]`. TypeScript TS2345 error.
- **Fix:** Added `as GlossaryRow[]` cast (single narrowing cast — safe since the CSV is `data/glossary.csv` which has the exact columns matching `GlossaryRow`). Imported `type GlossaryRow` from `glossary-transform.ts`.
- **Files modified:** `eleventy.config.ts`
- **Commit:** da4543c3

**4. [Rule 1 - Bug] Added Promise<void> generic type to all execFile Promise wrappers**
- **Found during:** Task 1 typecheck
- **Issue:** TypeScript TS2794 — `new Promise((res, rej) => ...)` with `res()` called without argument. Strict TS requires `Promise<void>` to allow calling the resolve callback with no argument.
- **Fix:** Added `<void>` generic to all 5 Promise wrappers around `execFile` calls.
- **Files modified:** `eleventy.config.ts`
- **Commit:** da4543c3

## Build Gate Results

- `npm run build:eleventy` (with `--config=eleventy.config.ts`): succeeded, 1,433 species pages
- `npm test`: 218/218 pass
- `npm run typecheck`: zero errors
- `diff -r _site/ _site_baseline/`: only difference is Vite CSS bundle non-determinism in `search/index.html` (documented Phase 34/35 behavior; not HTML-prose or Parquet content)

## Success Criteria Verification

- [x] `eleventy.config.js` deleted; `eleventy.config.ts` loaded via `--config=eleventy.config.ts` in `build:eleventy` and `dev`
- [x] GITHUB_PAGES-conditional `pathPrefix` preserved verbatim and asserted by config test (SC-2)
- [x] `addDataExtension("ts", { read: false, parser })` registered (enables SC-1 for Plans 02/03)
- [x] Four execFile paths point at `scripts/*.ts` (SC-3 build correctness; repairs Phase 35 breakage)
- [x] `_site/` is byte-identical to baseline with `.js` data files still loaded (SC-4, with documented Vite CSS non-determinism exception)
- [x] `npm run typecheck` zero errors; no `@ts-ignore`/`allowJs`/double-casts (SC-1)

## Known Stubs

None. All data files still `.js` (not yet converted); this plan only establishes the loading mechanism.

## Threat Flags

No new threat surface introduced. The `addDataExtension` parser only processes Eleventy-glob-discovered repository files (T-36-02 accepted per threat model).

## Self-Check: PASSED

- [x] `eleventy.config.ts` exists
- [x] `eleventy.config.test.ts` exists
- [x] `src/_data/taxon.d.ts` deleted
- [x] Commits da4543c3, 94231845, 339acf49 exist in git log
