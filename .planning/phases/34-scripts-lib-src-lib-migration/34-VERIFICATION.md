---
phase: 34-scripts-lib-src-lib-migration
verified: 2026-06-10T00:14:49Z
status: passed
score: 4/4
overrides_applied: 0
---

# Phase 34: scripts/lib & src/_lib Migration — Verification Report

**Phase Goal:** The shared utility libraries (scripts/lib/ and src/_lib/) are fully converted to TypeScript with strict types, proving Node 24 native type-stripping works end-to-end with `node --test`, unblocking downstream migration phases. No `.js` source remains in either dir; all converted tests pass via `node --test`; zero `tsc --noEmit` errors; no `@ts-ignore`/`allowJs`/unguarded `as unknown as T` in any converted file; `npm run build` produces output equivalent to the pre-migration baseline (modulo Vite content-hashed asset filenames).
**Verified:** 2026-06-10T00:14:49Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All `.js` files in `scripts/lib/` and `src/_lib/` renamed to `.ts`; no `.js` source remains in either directory | VERIFIED | `ls scripts/lib/*.js` and `ls src/_lib/*.js` both return empty (exit 1). Both dirs contain only `.ts` files. |
| 2 | All test files converted to `.ts` and pass via `node --test` under Node 24 native type-stripping; zero `tsc --noEmit` errors | VERIFIED | `node --test 'scripts/lib/*.test.ts' 'src/_lib/*.test.ts'` → 67/67 pass; `npm test` → 224/224 pass; `npm run typecheck` exits 0. |
| 3 | No `@ts-ignore`, no `allowJs`, and no unguarded `as unknown as T` double-casts in any converted file | VERIFIED | `grep -rnE 'as unknown as|@ts-ignore|allowJs' scripts/lib/*.ts src/_lib/*.ts` returns empty. One occurrence of `as unknown[]` in `manifest.ts` line 100 is a guarded single-step widening cast (not a double-cast), followed immediately by `.filter(isManifestRow)` — pattern is correct per D-01/D-02. |
| 4 | `npm run build` still produces 1,433 species pages; `_site/` byte-identical to pre-migration baseline | VERIFIED | `_site/species/` contains 1,433 pages. Diff of all 1,433 species pages against `_site_baseline/species/` → 0 pages differ. Vite content-hash filename non-determinism noted in SUMMARY.md is expected and orthogonal to species page byte-identity. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/lib/manifest.ts` | ManifestRow type, ManifestStatus union, COLUMNS, readManifest/writeManifest/advanceStatus/sortForInvestigation | VERIFIED | File exists; contains `export type ManifestRow = Record<typeof COLUMNS[number], string>`, `export type ManifestStatus = 'discovered' \| 'downloaded' \| 'tiled' \| 'uploaded' \| 'failed'`, all four exported functions present |
| `scripts/lib/parse-photo-filename.ts` | extractBinomial/parseSpecimenAndView/toSpeciesSlug + interfaces | VERIFIED | File exists; exports all three functions with `ExtractBinomialResult` and `ParseSpecimenAndViewResult` interfaces |
| `scripts/lib/dropbox-list.ts` | dbxCall + listSharedFolder async generator + DropboxEntry interface + isDropboxListPage guard | VERIFIED | File exists; `node --input-type=module -e "import('…/scripts/lib/dropbox-list.ts')"` resolves without ERR_MODULE_NOT_FOUND |
| `scripts/lib/dropbox-download.ts` | downloadSharedFile + DownloadParams/DropboxError interfaces | VERIFIED | File exists; all three lib tests pass including token-redaction invariant |
| `scripts/lib/manifest.test.ts` | Converted test, imports `'./manifest.ts'` | VERIFIED | File exists; 224-test full suite passes |
| `scripts/lib/parse-photo-filename.test.ts` | Converted test, imports `'./parse-photo-filename.ts'` | VERIFIED | File exists; all 11 extractBinomial + 6 parseSpecimenAndView + 5 toSpeciesSlug tests pass |
| `scripts/lib/dropbox-download.test.ts` | Converted test, imports `'./dropbox-download.ts'` | VERIFIED | File exists; 3 tests pass including retriable flag and token-redaction check |
| `src/_lib/glossary-transform.ts` | escapeRegex/escapeHtml/buildTermMap/applyGlossaryTerms + TermMapEntry/GlossaryRow types | VERIFIED | File exists; contains `export interface TermMapEntry`, `export type GlossaryRow`, `import type { TextNode }`, null guard at line 141 |
| `src/_lib/glossary-transform.test.ts` | Converted test, imports `'./glossary-transform.ts'` | VERIFIED | File exists; 25/25 tests pass |
| `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md` | Pre-migration snapshot path, species count, diff command | VERIFIED | File exists; records 1,433 species pages, `_site_baseline/` path, and `diff -r _site/ _site_baseline/` gate command |
| `package.json` test script | Globs include `'scripts/lib/*.test.{js,ts}'` and `'src/_lib/*.test.{js,ts}'` | VERIFIED | Confirmed by grep: both brace-expansion globs present; no `--experimental-strip-types` flag |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/ingest-photos.js` | `scripts/lib/manifest.ts`, `parse-photo-filename.ts`, `dropbox-list.ts` | `.ts` import specifiers | VERIFIED | Lines 28-30 confirmed; runtime resolution verified — no ERR_MODULE_NOT_FOUND |
| `scripts/tile-photos.js` | `scripts/lib/manifest.ts`, `dropbox-download.ts` | `.ts` import specifiers | VERIFIED | Lines 40-41 confirmed; runtime resolution verified |
| `scripts/upload-tiles.js` | `scripts/lib/manifest.ts` | `.ts` import specifier | VERIFIED | Line 39 confirmed; runtime resolution verified |
| `scripts/generate-species-photos.js` | `scripts/lib/manifest.ts` | `.ts` import specifier | VERIFIED | Line 20 confirmed; runtime resolution verified |
| `eleventy.config.js` | `src/_lib/glossary-transform.ts` | `.ts` import specifier at build time | VERIFIED | Line 7: `import { applyGlossaryTerms, buildTermMap } from "./src/_lib/glossary-transform.ts"` confirmed |
| `src/_lib/glossary-transform.ts` | `node-html-parser TextNode` | `import type { TextNode }` | VERIFIED | Line 2: `import type { TextNode } from 'node-html-parser'`; null guard at line 141 |
| `scripts/lib/manifest.ts` | `ManifestStatus` union | `advanceStatus nextStatus param type` | VERIFIED | `advanceStatus(row: ManifestRow, nextStatus: ManifestStatus, extra?: Partial<ManifestRow>)` confirmed |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase converts utility libraries and pipeline scripts; none render dynamic data to a UI. Wiring is import-resolution and test-pass verification, not UI data flow.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| node --test on converted lib test files | `node --test 'scripts/lib/*.test.ts' 'src/_lib/*.test.ts'` | 67/67 pass, exit 0 | PASS |
| Full test suite with broadened globs | `npm test` | 224/224 pass, exit 0 | PASS |
| tsc --noEmit across both tsconfigs | `npm run typecheck` | exit 0, zero errors | PASS |
| ingest-photos.js resolves .ts lib imports | `node --input-type=module -e "import('/…/scripts/ingest-photos.js')…"` | No ERR_MODULE_NOT_FOUND | PASS |
| tile-photos.js resolves .ts lib imports | `node --input-type=module -e "import('/…/scripts/tile-photos.js')…"` | No ERR_MODULE_NOT_FOUND | PASS |
| upload-tiles.js resolves .ts lib imports | `node --input-type=module -e "import('/…/scripts/upload-tiles.js')…"` | No ERR_MODULE_NOT_FOUND | PASS |
| generate-species-photos.js resolves .ts lib imports | `node --input-type=module -e "import('/…/scripts/generate-species-photos.js')…"` | No ERR_MODULE_NOT_FOUND | PASS |
| Build no-regression: 1,433 species pages | `ls -d _site/species/*/index.html \| wc -l` | 1,433 | PASS |
| Build no-regression: species pages byte-identical | Diff all 1,433 pages vs `_site_baseline/` | 0 pages differ | PASS |

---

### Probe Execution

No probe scripts defined for this phase (`scripts/*/tests/probe-*.sh` not present). Step 7c: SKIPPED (no conventional probes).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MIG-01 | 34-01, 34-02, 34-03 | `scripts/lib/` and `src/_lib/` fully converted to TypeScript | SATISFIED | No `.js` source in either dir; all tests pass; `npm run typecheck` exits 0 |

---

### Anti-Patterns Found

Scanned all files in `scripts/lib/*.ts` and `src/_lib/*.ts` (both source and test files):

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/lib/manifest.ts` | 100 | `as unknown[]` | INFO | Single-step widening cast of `csv-parse` return, immediately guarded by `.filter(isManifestRow)`. This is the intended D-01/D-02 pattern — NOT a forbidden unguarded double-cast `as unknown as T`. |

No `TBD`, `FIXME`, `XXX`, `@ts-ignore`, `allowJs`, or unguarded `as unknown as T` found in any converted file.

---

### Human Verification Required

None. All success criteria are programmatically verifiable and have been verified.

---

### Gaps Summary

No gaps found. All 4 roadmap success criteria verified against the live codebase:

1. No `.js` source in `scripts/lib/` or `src/_lib/` — confirmed by directory listing.
2. All lib tests pass via `node --test` under Node 24 native type-stripping; `npm run typecheck` exits 0 — confirmed by execution.
3. Zero `@ts-ignore`/`allowJs`/unguarded double-casts — confirmed by grep across all converted files (source + test).
4. Build produces 1,433 species pages byte-identical to pre-migration baseline — confirmed by per-page diff of all 1,433 pages.

The six commits in git history (64eaa9c2, 336424a5, 81f364c5, 593ba427, b73b9595, 2726c534, plus the follow-up refactor d396cf49) implement the migration cleanly. Phase 34 goal achieved.

---

_Verified: 2026-06-10T00:14:49Z_
_Verifier: Claude (gsd-verifier)_
