---
phase: 35-build-pipeline-scripts-migration
plan: "04"
subsystem: photo-pipeline-scripts
tags: [typescript, migration, photo-pipeline, boundary-guards, schema-05]
dependency_graph:
  requires: ["35-01", "35-02"]
  provides: ["scripts/ingest-photos.ts", "scripts/tile-photos.ts", "scripts/upload-tiles.ts", "scripts/generate-species-photos.ts"]
  affects: ["package.json photos:* scripts", "npm test photo-pipeline tokens"]
tech_stack:
  added: []
  patterns:
    - "D-10 minimal interface + runtime guard for csv-parse / Dropbox API boundaries"
    - "D-09 View/MatchBucket string-literal unions imported from parse-photo-filename.ts"
    - "Set<MatchBucket> typed TILEABLE_BUCKETS in tile-photos.ts"
    - "SpeciesPhotoEntry type (Specimen-derived) for SCHEMA-05 output annotation in generate-species-photos.ts"
    - "withRetry<T>(fn: () => T | Promise<T>) to support both sync (execFileSync) and async callers"
key_files:
  created:
    - scripts/ingest-photos.ts
    - scripts/ingest-photos.test.ts
    - scripts/tile-photos.ts
    - scripts/tile-photos.test.ts
    - scripts/upload-tiles.ts
    - scripts/upload-tiles.test.ts
    - scripts/generate-species-photos.ts
    - scripts/generate-species-photos.test.ts
  modified:
    - package.json
  deleted:
    - scripts/ingest-photos.js
    - scripts/ingest-photos.test.js
    - scripts/tile-photos.js
    - scripts/tile-photos.test.js
    - scripts/upload-tiles.js
    - scripts/upload-tiles.test.js
    - scripts/generate-species-photos.js
    - scripts/generate-species-photos.test.js
decisions:
  - "D-09 (View/MatchBucket unions): imported from parse-photo-filename.ts and used in all four scripts — classify() returns MatchBucket, TILEABLE_BUCKETS: Set<MatchBucket>, row.view typed as View in tileUploadPath/toTilesPath"
  - "D-10 (external boundary guards): isSpeciesCsvRow, isSynonymsCsvRow, isDropboxListPage guards in ingest-photos.ts; Bunny CDN response handled via !res.ok pattern in upload-tiles.ts (using execFileSync curl)"
  - "D-13 / SCHEMA-05: generate-species-photos.ts output typed as Record<string, SpeciesPhotoEntry> where SpeciesPhotoEntry = { high_res_available: boolean; specimens: Specimen[] } — Specimen imported from src/types; see deviation note below"
metrics:
  duration_seconds: 797
  completed_date: "2026-06-10"
  tasks_completed: 3
  tasks_total: 3
  files_created: 8
  files_modified: 1
  files_deleted: 8
---

# Phase 35 Plan 04: Photo Pipeline Scripts Migration Summary

**One-liner:** Four photo-pipeline scripts (ingest/tile/upload/generate) converted from JS to strict TypeScript with D-10 boundary guards, D-09 View/MatchBucket unions, and SCHEMA-05 compile-time output typing.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Convert ingest-photos.js + test to strict .ts | f5a25f79 | scripts/ingest-photos.ts, scripts/ingest-photos.test.ts |
| 2 | Convert tile-photos + upload-tiles (and tests) to strict .ts | c462e4d8 | scripts/tile-photos.ts, scripts/tile-photos.test.ts, scripts/upload-tiles.ts, scripts/upload-tiles.test.ts |
| 3 | Convert generate-species-photos.js + test to .ts with SCHEMA-05 | 31112141 | scripts/generate-species-photos.ts, scripts/generate-species-photos.test.ts |

## Verification Results

- `npm run typecheck`: PASS (tsc -p tsconfig.browser.json + tsconfig.node.json, zero errors)
- `node --test scripts/ingest-photos.test.ts scripts/tile-photos.test.ts scripts/upload-tiles.test.ts scripts/generate-species-photos.test.ts`: 58 tests, 0 failures
- No `.js` source remains for any of the four photo scripts or their tests
- `View`/`MatchBucket` imported and used in all four scripts
- `TILEABLE_BUCKETS: Set<MatchBucket>` in tile-photos.ts
- `redact()` preserved in ingest/tile/upload/generate
- `package.json` `photos:*` invocations + four test tokens all reference `.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] withRetry<T> generic needed to accept sync callers**

- **Found during:** Task 2 (typecheck after writing tile-photos.ts and upload-tiles.ts)
- **Issue:** `withRetry<T>(fn: () => Promise<T>)` failed with `execFileSync` callers (which return `Buffer`, not `Promise<T>`) — `uploadThumbnailToCdn` and curl invocations in `withRetry` calls produced TS2739 errors
- **Fix:** Changed signature to `withRetry<T>(fn: () => T | Promise<T>)` to accept both sync and async callers; `Promise<T>` return still works because `await` on a non-Promise value is a no-op
- **Files modified:** scripts/tile-photos.ts, scripts/upload-tiles.ts

**2. [Rule 1 - Bug] logStage included in generate-species-photos.ts but unused**

- **Found during:** Task 3 typecheck (TS6133: 'logStage' is declared but its value is never read)
- **Fix:** Removed the unused `logStage` helper — the original JS script also did not call `logStage` within exported functions; the function was only in `main()` which exists but calls `console.log` directly
- **Files modified:** scripts/generate-species-photos.ts

### Design Adjustments (not bugs, documented for clarity)

**3. [Design] SCHEMA-05 typing uses SpeciesPhotoEntry instead of SpeciesPhoto**

- **Context:** The plan specified `const result: Record<string, SpeciesPhoto>` but `SpeciesPhoto` (from schemas.ts) includes `photographer` and `license` fields. These are not produced by `buildSpeciesPhotos` — they are added manually to the committed `data/species-photos.json` after each generation run. Using `Record<string, SpeciesPhoto>` would require either adding `photographer`/`license` (changes output, violates byte-identity requirement) or using a double-cast `as unknown as` (prohibited by D-10)
- **Decision:** Defined local `type SpeciesPhotoEntry = { high_res_available: boolean; specimens: Specimen[] }` where `Specimen` is the Zod-derived type from `src/types`. This provides the same compile-time enforcement for the generated fields (if `Specimen.tiles_path` is renamed, typecheck fails here), satisfying the SCHEMA-05 intent without changing output
- **SCHEMA-05 compliance:** Satisfied — the generated shape is compile-time enforced via `Specimen` type; the `photographer`/`license` fields are out-of-scope for this generator
- **Files modified:** scripts/generate-species-photos.ts

## Known Stubs

None — all scripts produce the same output as their JS predecessors; `data/species-photos.json` shape is unchanged (byte-identical for the fields this generator produces).

## Threat Flags

No new security surfaces introduced. The existing Dropbox API and Bunny CDN boundaries are covered by:
- `isDropboxListPage` guard in ingest-photos.ts (D-10)
- `isSpeciesCsvRow` / `isSynonymsCsvRow` guards in ingest-photos.ts (D-10)
- `!res.ok` / `redact()` pattern preserved in all scripts where tokens flow (T-35P4-01, T-35P4-02)
- `TILEABLE_BUCKETS: Set<MatchBucket>` constrains match_bucket values at compile time (T-35P4-03)

## Self-Check: PASSED

Files exist:
- scripts/ingest-photos.ts: FOUND
- scripts/ingest-photos.test.ts: FOUND
- scripts/tile-photos.ts: FOUND
- scripts/tile-photos.test.ts: FOUND
- scripts/upload-tiles.ts: FOUND
- scripts/upload-tiles.test.ts: FOUND
- scripts/generate-species-photos.ts: FOUND
- scripts/generate-species-photos.test.ts: FOUND

Commits exist:
- f5a25f79: feat(35-04): convert ingest-photos.js + test to strict .ts (D-09, D-10)
- c462e4d8: feat(35-04): convert tile-photos + upload-tiles (and tests) to strict .ts (D-09, D-10)
- 31112141: feat(35-04): convert generate-species-photos.js + test to strict .ts (SCHEMA-05)
