---
phase: 34-scripts-lib-src-lib-migration
plan: 02
subsystem: scripts/lib
tags: [typescript, migration, manifest, dropbox, strict-types]
dependency_graph:
  requires: [34-01]
  provides: [scripts/lib/*.ts]
  affects: [scripts/ingest-photos.js, scripts/tile-photos.js, scripts/upload-tiles.js, scripts/generate-species-photos.js]
tech_stack:
  added:
    - "ManifestRow = Record<typeof COLUMNS[number], string> mapped type (D-04)"
    - "ManifestStatus = 'discovered' | 'downloaded' | 'tiled' | 'uploaded' | 'failed' union (D-05)"
    - "isManifestRow hand-rolled guard (D-01/D-02/D-03)"
    - "ExtractBinomialResult/ParseSpecimenAndViewResult interfaces (parse-photo-filename.ts)"
    - "DropboxEntry/DropboxListPage interfaces + isDropboxListPage guard (dropbox-list.ts)"
    - "DownloadParams/DropboxError interfaces (dropbox-download.ts)"
  patterns:
    - "External-boundary typing: minimal consumed-field interface + hand-rolled guard (D-01/D-03)"
    - "noUncheckedIndexedAccess: guard array[i] before use; destructure regex captures with ?? ''"
    - "verbatimModuleSyntax: import type for type-only imports in test files"
    - "as const + [...spread] to satisfy csv-stringify string[] columns option (not cast)"
key_files:
  created: []
  modified:
    - scripts/lib/manifest.ts
    - scripts/lib/manifest.test.ts
    - scripts/lib/parse-photo-filename.ts
    - scripts/lib/parse-photo-filename.test.ts
    - scripts/lib/dropbox-list.ts
    - scripts/lib/dropbox-download.ts
    - scripts/lib/dropbox-download.test.ts
    - scripts/ingest-photos.js
    - scripts/tile-photos.js
    - scripts/upload-tiles.js
    - scripts/generate-species-photos.js
decisions:
  - "Used [...COLUMNS] spread in writeManifest to satisfy csv-stringify string[] type — avoids any cast while keeping as const (RESEARCH Pitfall 2)"
  - "Kept toSpeciesSlug(binomial: string) parameter typed as string; test file uses (null as unknown as string) cast to preserve defensive runtime behavior testing under verbatimModuleSyntax"
  - "Mock fetch responses in dropbox-download.test.ts cast as unknown as Response — standard test mock pattern; not a source-file double-cast"
  - "DropboxError cast pattern: new Error(...) as DropboxError then set .retriable — single widening cast of a value this function constructs (RESEARCH Assumption A3)"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-09"
  tasks: 3
  files: 11
---

# Phase 34 Plan 02: scripts/lib TypeScript Conversion Summary

**One-liner:** Four `scripts/lib/*.js` shared libraries converted to strict TypeScript with `ManifestRow`/`ManifestStatus` types, consumed-field interfaces, and hand-rolled guards; all `.ts` specifiers wired atomically in four consumer scripts.

## What Was Built

### Task 1: manifest.js → manifest.ts + 4 consumer specifier updates (commit 81f364c5)

- Renamed `scripts/lib/manifest.js` → `manifest.ts` and `manifest.test.js` → `manifest.test.ts`
- Added `as const` to COLUMNS; derived `ManifestRow = Record<typeof COLUMNS[number], string>` (D-04) and `ManifestStatus = 'discovered' | 'downloaded' | 'tiled' | 'uploaded' | 'failed'` (D-05)
- Added `isManifestRow(obj: unknown): obj is ManifestRow` guard — checks all 13 COLUMNS keys, ignores extra fields (D-01/D-02/D-03)
- `readManifest` uses `parse(...) as unknown[]` then `.filter(isManifestRow)` — no unguarded double-cast
- `writeManifest` spreads `[...COLUMNS]` to satisfy csv-stringify's `string[]` type (Pitfall 2)
- `advanceStatus` typed with `ManifestStatus` and `Partial<ManifestRow>` params (D-06)
- `sortForInvestigation` guards `rows[i]` for `noUncheckedIndexedAccess`
- Test file updated to use `makeTestRow` helper and `as unknown as ManifestRow` for partial test objects; `advanceStatus({} as ManifestRow, '' as ManifestStatus)` for TypeError test
- Four consumers (`ingest-photos.js`, `tile-photos.js`, `upload-tiles.js`, `generate-species-photos.js`) updated from `'./lib/manifest.js'` to `'./lib/manifest.ts'` in the same commit

### Task 2: parse-photo-filename.js+dropbox-list.js → .ts + ingest-photos.js wiring (commit 593ba427)

- Renamed `parse-photo-filename.js` → `.ts` and `parse-photo-filename.test.js` → `.ts`
- Added `ExtractBinomialResult` and `ParseSpecimenAndViewResult` interfaces
- Guarded `provisionalTokens[i]` and `tokens[i/i+1]` for `noUncheckedIndexedAccess`; destructured regex captures with `?? ''` fallback
- Renamed `dropbox-list.js` → `.ts` (no test file — none in scope)
- Added `DropboxEntry` (exported), `DropboxListPage` (internal), `isDropboxListPage` guard (D-01/D-03)
- `dbxCall` typed `Promise<unknown>` (Open Question 2 resolution); `listSharedFolder` typed `AsyncGenerator<DropboxEntry, void, undefined>`; every `dbxCall` result narrowed via guard before field access
- `ingest-photos.js` updated: `parse-photo-filename.js` → `.ts`, `dropbox-list.js` → `.ts`

### Task 3: dropbox-download.js → .ts + tile-photos.js wiring + full suite (commit b73b9595)

- Renamed `dropbox-download.js` → `.ts` and `dropbox-download.test.js` → `.ts`
- Added `DownloadParams` and `DropboxError extends Error` interfaces
- `downloadSharedFile(params: DownloadParams): Promise<void>` — destructures params; validation loop typed as `[string, string][]`
- `err = new Error(...) as DropboxError; err.retriable = res.status === 429` — single widening cast (T-34-02 mitigation)
- Added `res.body` null guard before `pipeline` (strict null check requirement)
- Test file: cast `null/undefined` calls, mock fetch returns, and error callback args for typecheck compliance
- `tile-photos.js` updated: `dropbox-download.js` → `.ts`

## Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc clean) | PASS — zero errors |
| `node --test 'scripts/lib/*.test.ts'` | PASS — 42/42 tests |
| No `.js` source in `scripts/lib/` | PASS |
| 4 consumers import `.ts` specifiers | PASS |
| Runtime resolution (no ERR_MODULE_NOT_FOUND) | PASS — all 4 consumers |
| `grep -rE '@ts-ignore\|allowJs\|as unknown as' scripts/lib/*.ts` | PASS — source files clean |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Test file typed helpers**
- **Found during:** All three tasks
- **Issue:** Test objects like `{ binomial_raw: 'x', match_bucket: 'clean-match' }` are incompatible with `ManifestRow = Record<typeof COLUMNS[number], string>` under strict TypeScript
- **Fix:** Added `makeTestRow` helper in manifest.test.ts to fill defaults; used `as unknown as ManifestRow` casts for `advanceStatus({})` TypeError test; used type-widened `RowWithId` pattern for `_id` test fields
- **Files modified:** `scripts/lib/manifest.test.ts`
- **Not a deviation from semantics** — runtime behavior identical; typecheck compliance required

**2. [Rule 2 - Missing functionality] Mock fetch typing in dropbox-download.test.ts**
- **Found during:** Task 3
- **Issue:** `globalThis.fetch = async () => ({ ok: false, status: 401, ... })` doesn't satisfy `Promise<Response>` type
- **Fix:** Added `as unknown as Response` cast on mock returns — standard test mock pattern
- **Files modified:** `scripts/lib/dropbox-download.test.ts`

## Known Stubs

None — all four library files are fully typed with no placeholder implementations.

## Threat Flags

No new threat surface introduced. All identified threats addressed:
- T-34-02: Token-in-error-message invariant preserved in typed `DropboxError` shape
- T-34-03: Hand-rolled guards `isDropboxListPage` and `isManifestRow` enforce consumed-field validation
- T-34-04: `writeManifest` csv-stringify auto-quoting preserved (T-26.02-02 mitigation unchanged)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `/Users/rainhead/dev/pnwmoths/.planning/phases/34-scripts-lib-src-lib-migration/34-02-SUMMARY.md` | FOUND |
| Commit 81f364c5 (manifest) | FOUND |
| Commit 593ba427 (parse-photo-filename + dropbox-list) | FOUND |
| Commit b73b9595 (dropbox-download + full suite) | FOUND |
