---
phase: 36-eleventy-data-files-config-migration
verified: 2026-06-10T00:00:00Z
status: passed
score: 4/4 must-haves verified (automated + human); SC-3 local-dev branch confirmed via /gsd-verify-work 2026-06-10
overrides_applied: 0
human_verification:
  - test: "Run npm run dev, open http://localhost:8080/species/abagrotis-apposita/ in a browser. View source or open DevTools Network tab."
    expected: "CSS/JS/component asset URLs resolve under / (e.g. /assets/...) — NOT under /pnwmoths/ and NOT double-prefixed (no // or /pnwmoths/pnwmoths/). Page renders with no first-party 404s."
    why_human: "The eleventy --serve long-lived process and pathPrefix=/ branch cannot be asserted by node --test. The GITHUB_PAGES=/pnwmoths/ branch is proven by the byte-identical build gate; only the local dev / branch requires a live browser session to confirm no double-prefix."
---

# Phase 36: Eleventy Data Files & Config Migration — Verification Report

**Phase Goal:** The Eleventy data files (`src/_data/`) and `eleventy.config` are converted to TypeScript, the `process.env.GITHUB_PAGES`-conditional `pathPrefix` is preserved and test-asserted, and the full Eleventy build produces byte-identical output.
**Verified:** 2026-06-09T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All `.js` in `src/_data/` and `eleventy.config.js` converted to `.ts`; zero `tsc --noEmit` errors; no `@ts-ignore`/`allowJs`/unguarded `as unknown as` | VERIFIED | `find src/_data -name '*.js'` returns 0 files; `eleventy.config.js` absent; `eleventy.config.test.js` absent; `taxon.d.ts` absent; no forbidden patterns in any converted file; `npm run typecheck` exits 0 |
| 2 | `eleventy.config.ts` contains `process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"` verbatim; `.ts` config test asserts it and passes | VERIFIED | `grep -q 'process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"' eleventy.config.ts` succeeds; `node --test eleventy.config.test.ts` passes 6/6 including "GITHUB_PAGES pathPrefix conditional is present" |
| 3 | `build:eleventy` and `dev` npm scripts use `--config=eleventy.config.ts`; GITHUB_PAGES build path correct | VERIFIED | Both scripts confirmed via `package.json`; byte-identical build gate passed (1,433 pages); local `/` branch needs human verification (see below) |
| 4 | `_site/` byte-identical to `_site_baseline/` after `npm run build` (only Vite content-hash and pre-existing pagefind diffs expected) | VERIFIED | 1,433 species pages generated; `diff -r` shows only: (a) Vite content-hash JS filenames on species pages (single line 11 change per page, e.g. `index-gcIWht1Y.js` vs `index-Lvs9JDyp.js`), (b) pre-existing pagefind/search diff (baseline predates `build:pagefind`); zero HTML-prose differences; zero Parquet differences |

**Score:** 4/4 truths verified (automated checks)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `eleventy.config.ts` | TypeScript config with addDataExtension("ts") + repointed execFile paths + preserved pathPrefix conditional | VERIFIED | Exists; contains `addDataExtension("ts"`, `process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"`, and 4 execFile paths pointing at `.ts` scripts; no `.js` script refs |
| `eleventy.config.test.ts` | Source-string config test with GITHUB_PAGES pathPrefix assertion | VERIFIED | Exists; reads `eleventy.config.ts` (not `.js`) on line 11; 6 tests pass including GITHUB_PAGES assertion |
| `src/_data/species.ts` | Species data loader with `isSpeciesDbRow` guard | VERIFIED | Exists; contains `getRowObjectsJS` and `isSpeciesDbRow`; no `@ts-ignore`/`as unknown as`/`allowJs` |
| `src/_data/glossary.ts` | Glossary loader with `isGlossaryEntry` guard, retains both close calls | VERIFIED | Exists; contains `isGlossaryEntry` and `db.closeSync`; no forbidden patterns |
| `src/_data/taxon.ts` | Taxon tree loader with two DuckDB queries; TaxonFamily[] return | VERIFIED | Exists; contains `getRowObjectsJS` and guard idiom; `as TaxonFamily[]` is a single-level cast (WR-01 advisory warning, not a phase blocker) |
| `src/_data/images.ts` | CSV-based images loader with local ImageRow interface | VERIFIED | Exists; contains `parseCSV` and `interface ImageRow` |
| `src/_data/plates.ts` | Plates loader with PlateEntry interface, both code paths | VERIFIED | Exists; contains `interface PlateEntry` and `Record<string, string>` annotation |
| `src/_data/speciesPhotos.ts` | JSON manifest loader with SpeciesPhoto derived type, {} soft-fail | VERIFIED | Exists; contains `SpeciesPhoto` and `existsSync` soft-fail |
| `tsconfig.node.json` | includes `eleventy.config.test.ts` | VERIFIED | `grep -q 'eleventy.config.test.ts' tsconfig.node.json` succeeds |
| `package.json` | `build:eleventy` and `dev` scripts contain `--config=eleventy.config.ts`; test glob includes `eleventy.config.test.ts` | VERIFIED | `build:eleventy: "eleventy --config=eleventy.config.ts"`, `dev: "npm run build:data && eleventy --serve --config=eleventy.config.ts"`, test script lists `eleventy.config.test.ts` first |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json build:eleventy` | `eleventy.config.ts` | `--config=eleventy.config.ts` flag | WIRED | Confirmed in package.json scripts |
| `package.json dev` | `eleventy.config.ts` | `--config=eleventy.config.ts` flag | WIRED | Confirmed in package.json scripts |
| `eleventy.config.ts addDataExtension parser` | `src/_data/*.ts` | `dynamic import()` of default export | WIRED | `addDataExtension("ts", { read: false, parser })` present; GITHUB_PAGES=1 build produces 1,433 pages confirming all 6 data files load |
| `eleventy.config.ts writeBundle/eleventy.after hooks` | `scripts/copy-images.ts`, `scripts/emit-species-states.ts` | `execFile` child node process | WIRED | 4 references to `scripts/copy-images.ts` and `scripts/emit-species-states.ts`; no `.js` refs remain |
| `eleventy.config.test.ts` | `eleventy.config.ts` | `readFileSync` source-string test | WIRED | Line 11: `readFileSync(resolve(ROOT, 'eleventy.config.ts'), 'utf8')` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Config test passes including GITHUB_PAGES assertion | `node --test eleventy.config.test.ts` | 6/6 pass | PASS |
| Full test suite passes | `npm test` | 218/218 pass | PASS |
| TypeScript typecheck clean | `npm run typecheck` | exits 0, zero errors | PASS |
| Species page count matches baseline | `find _site -path '*species*index.html' \| wc -l` | 1,433 | PASS |
| Byte-identical build (HTML prose) | `diff -r _site/ _site_baseline/` (non-asset, non-pagefind diffs) | Only Vite content-hash JS filenames on species pages (line 11 of each page only); zero HTML-prose diffs; zero Parquet diffs | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MIG-03 | Plans 01–04 | Eleventy data files (`src/_data/`) and `eleventy.config` converted to TypeScript, preserving `GITHUB_PAGES`-conditional `pathPrefix` | SATISFIED | All 6 `src/_data/*.ts` files exist; `eleventy.config.ts` exists; no `.js` sources remain; typecheck clean; build byte-identical |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/_data/plates.ts` | 126-135 | `XXX` in string values (`Noctuinae XXX:`, `XXXI:`, etc.) | Info | False positive — Roman numerals in `DESCRIPTIONS` data table faithfully migrated from `plates.js`. Not a debt marker. |
| `src/_data/taxon.ts` | 257 | `as TaxonFamily[]` single-level cast over `TaxonFamilyBuild[]` | Info (WR-01) | Advisory warning from REVIEW.md. Single cast (not double `as unknown as T`). Documented and intentional — accommodates the 2.8% of species with `family = null`. Not a phase blocker per task prompt. |

No `TBD`, `FIXME`, or `XXX` debt markers found. No `@ts-ignore`, `as unknown as`, or `allowJs` in any converted file.

### Human Verification Required

#### 1. SC-3 Local Dev pathPrefix — Confirm `/` branch with no double-prefix

**Test:** Run `npm run dev`. Wait for the server to report its local URL (`http://localhost:8080/`). Open `http://localhost:8080/species/abagrotis-apposita/` in a browser. View source or open DevTools Network tab.

**Expected:** CSS/JS/component asset URLs resolve under `/` (e.g. `/assets/species/abagrotis-apposita/index-*.js`) — NOT under `/pnwmoths/...` and NOT double-prefixed (`//` or `/pnwmoths/pnwmoths/`). Page renders with styles applied and no first-party 404s in the Network tab.

**Why human:** The `eleventy --serve` long-lived process and the `pathPrefix = "/"` branch (when `GITHUB_PAGES` is unset) cannot be asserted by `node --test`. The `GITHUB_PAGES=/pnwmoths/` branch is fully proven by the byte-identical build gate. The local `/` branch is confirmed at config level (Vite `base:` is wired to `pathPrefix`, `dev` uses `--config=eleventy.config.ts`, `GITHUB_PAGES` is unset locally), but a one-time live browser session is needed to confirm no double-prefix or 404 in practice.

### Gaps Summary

No gaps. All automated success criteria are verified. The only outstanding item is the one-time human verification of the local dev pathPrefix (`/` branch), which was documented in Plan 04 SUMMARY as a manual follow-up. This does not block the automated criteria but must be confirmed before the phase is fully signed off.

---

_Verified: 2026-06-09T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
