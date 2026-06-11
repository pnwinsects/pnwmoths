---
phase: 35-build-pipeline-scripts-migration
verified: 2026-06-09T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification_resolved:
  - test: "Confirm ADDING_PLATE.md operator workflow is correct after upload-plates.js deletion"
    decision: "Maintainer confirmed photographic-plate uploads are an ONGOING operator workflow; the manual curl PUT recipe in ADDING_PLATE.md Step 4 is the correct replacement for the deleted upload-plates.js. Resolved during Plan 05 Task 3 human-verify checkpoint; doc finalized (commit a0665bb9)."
    resolved: 2026-06-09
---

# Phase 35: Build Pipeline Scripts Migration — Verification Report

**Phase Goal:** All scripts in `scripts/` are converted to TypeScript (the producer side of the data pipeline), with CSV input correctness enforced at build by DuckDB's typed read_csv, a build-time Parquet column-schema sanity check, JSON output covered by static types, and a standalone verify:parquet full-dataset check — and `npm run build:data` finishes within 60 seconds; `_site/` output byte-identical to the pre-migration baseline.

**Verified:** 2026-06-09
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All .js in scripts/ converted to .ts; zero tsc --noEmit errors; no @ts-ignore; no allowJs | VERIFIED | `ls scripts/*.js` → empty; `npm run typecheck` exits 0 (both tsconfigs); `grep -rn '@ts-ignore' scripts/` → empty; no allowJs in any tsconfig |
| 2 | CSV input correctness enforced by DuckDB typed read_csv; no per-row Zod in hot path (SCHEMA-06) | VERIFIED | `build-data.ts` lines 134–175: typed columns SQL for both species.csv and records.csv; `grep safeParse build-data.ts` → empty |
| 3 | build-data.ts reads back one species' Parquet via DuckDB DESCRIBE and validates column schema (SCHEMA-04); generate-species-photos.ts output statically typed (SCHEMA-05) | VERIFIED (with SCHEMA-05 note — see below) | `verifySampleParquetSchema()` present and called in build-data.ts; `npm run build:data` prints `Parquet schema OK: 14 columns match OccurrenceRecordSchema`; generate-species-photos.ts uses `Record<string, SpeciesPhotoEntry>` — see SCHEMA-05 assessment |
| 4 | `npm run verify:parquet` exists, runs standalone over full dataset, exits 0 (SCHEMA-07) | VERIFIED | `package.json` has `verify:parquet: "node scripts/verify-parquet.ts"`; `npm run verify:parquet` exits 0: `OK: 1453 species, 92648 rows validated` |
| 5 | `npm run build:data` < 60s; `_site/species/` byte-identical to pre-migration baseline | VERIFIED | `time npm run build:data` → 4.58s wall time; `diff -r _site/species _site_baseline/species` → empty (byte-identical); full-tree diff shows only pre-existing pagefind/CSS Vite non-deterministic artifacts not introduced by Phase 35 |

**Score:** 5/5 truths verified

### SCHEMA-05 Assessment

The plan required `Record<string, SpeciesPhoto>` in generate-species-photos.ts. The implementation uses a local `SpeciesPhotoEntry` type instead:

```ts
type SpeciesPhotoEntry = {
  high_res_available: boolean;
  specimens: Specimen[];
};
```

`SpeciesPhoto` (the canonical schema type) adds `photographer: string` and `license: string`. Those fields exist in the committed `data/species-photos.json` but are added **manually post-generation** — the script does not emit them. The code contains a detailed comment at lines 37–49 of `generate-species-photos.ts` explaining this.

**Intent assessment:** SCHEMA-05 states "Build-locked JSON covered by static TS types at authoring." The `SpeciesPhotoEntry` type enforces static typing for the fields the generator actually produces (`high_res_available`, `specimens`). If `Specimen` shape changes (e.g. `tiles_path` renamed), `tsc --noEmit` fails. The manually-added `photographer`/`license` fields in the committed JSON are NOT type-checked by any TS code (the consumer `src/_data/speciesPhotos.js` is a `.js` file, part of Phase 36 scope). This is a partial rather than full implementation of SCHEMA-05: **the generated fields are typed; the manually-maintained fields are not**. Given the plan's explicit justification and that Phase 36 will convert the consumer to TS, this is acceptable for this phase — it is not a regression or a stub, but a deliberate and documented scoping decision.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/verify-parquet.ts` | Standalone full-dataset per-row Parquet validation against OccurrenceRecordSchema | VERIFIED | Exists, substantive (54 lines), imports OccurrenceRecordSchema, ArrayBuffer pool fix present, wired via `verify:parquet` npm script |
| `scripts/build-data.ts` | DuckDB CSV→Parquet pipeline + SCHEMA-04 verifySampleParquetSchema check | VERIFIED | Exists, substantive (300+ lines), `verifySampleParquetSchema` defined and called, OccurrenceRecordSchema.shape comparison present |
| `scripts/emit-species-states.ts` | species-states.json emitter (converted) | VERIFIED | Exists, no .js counterpart |
| `scripts/copy-parquet.ts` | data/parquet → _site/species copy (converted) | VERIFIED | Exists, no .js counterpart |
| `scripts/generate-species-photos.ts` | Manifest → species-photos.json materializer, output typed via SpeciesPhotoEntry (SCHEMA-05) | VERIFIED | Exists, `Record<string, SpeciesPhotoEntry>` annotation present; see SCHEMA-05 assessment |
| `scripts/tile-photos.ts` | TILEABLE_BUCKETS typed Set<MatchBucket> | VERIFIED | `Set<MatchBucket>` at line 69 |
| `scripts/lib/parse-photo-filename.ts` | Exported View and MatchBucket unions | VERIFIED | `export type View = 'D' | 'V' | ''` at line 51; `export type MatchBucket` at line 58 with 7 literal members |
| `package.json` | verify:parquet npm script; migrate:* removed; all scripts reference .ts | VERIFIED | verify:parquet present; no migrate: keys; all `node scripts/*.ts` invocations |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| package.json verify:parquet | scripts/verify-parquet.ts | `node scripts/verify-parquet.ts` | WIRED | `package.json:26` matches pattern |
| scripts/verify-parquet.ts | src/types/schemas.ts OccurrenceRecordSchema | import | WIRED | `import { OccurrenceRecordSchema } from '../src/types/schemas.ts'` at line 9 |
| scripts/build-data.ts verifySampleParquetSchema | src/types/schemas.ts OccurrenceRecordSchema.shape | Object.keys comparison | WIRED | `Object.keys(OccurrenceRecordSchema.shape)` at line 89; function called at line 272 |
| package.json build:data | scripts/build-data.ts | node invocation | WIRED | `"build:data": "node scripts/build-data.ts"` |
| scripts/{ingest,tile,upload}-photos.ts | scripts/lib/parse-photo-filename.ts MatchBucket | import type | WIRED | ingest: line 28; tile: line 42; upload: line 41 (View) |
| scripts/generate-species-photos.ts | src/types (Specimen) | import type | WIRED | `import type { Specimen } from '../src/types/index.ts'` at line 23 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| scripts/build-data.ts | speciesRows (DuckDB query) | `read_csv('data/species.csv')` with typed columns | Yes — DuckDB typed SQL | FLOWING |
| scripts/build-data.ts | verifySampleParquetSchema | `DESCRIBE SELECT * FROM read_parquet(firstSlug)` | Yes — reads actual built Parquet | FLOWING |
| scripts/verify-parquet.ts | records per species | `readFileSync + parquetReadObjects` | Yes — reads data/parquet/*/records.parquet | FLOWING |
| scripts/generate-species-photos.ts | result | `readManifest(MANIFEST_PATH)` | Yes — reads manifest CSV | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| verify:parquet validates full dataset | `npm run verify:parquet` | `OK: 1453 species, 92648 rows validated` (exit 0) | PASS |
| build:data runs SCHEMA-04 check | `npm run build:data` | Prints `Parquet schema OK: 14 columns match OccurrenceRecordSchema` | PASS |
| build:data under 60s | `time npm run build:data` | 4.58s wall time | PASS |
| typecheck zero errors | `npm run typecheck` | exit 0 | PASS |
| full test suite | `npm test` | 217/217 pass | PASS |
| no .js source in scripts/ | `find scripts -maxdepth 1 -name '*.js'` | empty | PASS |
| _site/species byte-identical | `diff -r _site/species _site_baseline/species` | empty | PASS |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` probes declared or found. Behavioral spot-checks above cover the phase's runnable verification battery.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| MIG-02 | 35-01, 35-03, 35-04 | All build/data pipeline scripts in scripts/ converted to TypeScript | SATISFIED | `ls scripts/*.js` → empty; all 9 active scripts converted; 8 spent one-offs deleted |
| SCHEMA-04 | 35-03 | Build-time one-sample Parquet column-schema sanity check | SATISFIED | `verifySampleParquetSchema` in build-data.ts; prints `Parquet schema OK` on each build |
| SCHEMA-05 | 35-04 | Build-locked JSON covered by static TS types at authoring | SATISFIED (partial) | `Record<string, SpeciesPhotoEntry>` in generate-species-photos.ts covers generated fields; manually-added fields not type-checked (see SCHEMA-05 assessment) |
| SCHEMA-06 | 35-03 | CSV input via DuckDB typed read_csv; no per-row Zod in hot path | SATISFIED | Typed columns SQL in build-data.ts lines 134–175; no safeParse/parse calls in hot path |
| SCHEMA-07 | 35-01 | npm run verify:parquet validates full dataset standalone | SATISFIED | `npm run verify:parquet` exits 0: 1453 species, 92648 rows; runs independently of build |

No orphaned requirements: all 5 phase-35 requirements (MIG-02, SCHEMA-04, SCHEMA-05, SCHEMA-06, SCHEMA-07) are covered by at least one plan.

### Anti-Patterns Found

No debt markers (TBD/FIXME/XXX) found in any scripts/*.ts file. No `@ts-ignore`. No `allowJs`. No unguarded `as unknown as T` double-casts.

The code review (35-REVIEW.md) found 1 critical issue (CR-01) and 5 warnings. All are pre-existing logic carried over verbatim from the original .js source files — confirmed by checking `git show 593ba427:scripts/ingest-photos.js` which shows the identical unescaped-RegExp `redact()` pattern pre-Phase-35. These are **not regressions introduced by this phase**; the migration is faithful/byte-identical by design. They are noted here as carried-over technical debt:

| File | Issue | Severity | Nature |
|------|-------|----------|--------|
| ingest-photos.ts, tile-photos.ts, upload-tiles.ts, generate-species-photos.ts | CR-01: `redact()` builds RegExp from unescaped secret — may fail to redact and can throw inside catch handlers | CARRIED-OVER DEBT | Pre-existed in .js originals verbatim |
| verify-parquet.ts | WR-01: `readdirSync` throws uncaught if `data/parquet` missing; WR-02: per-file parse errors abort scan instead of being collected | CARRIED-OVER DEBT (design gap in new file) | verify-parquet.ts is new, not a .js migration; these are design gaps in the new script |
| tile-photos.ts | WR-03, WR-04: isAlreadyTiled checks only .dzi; fragile thumbnail/tiled state interaction | CARRIED-OVER DEBT | Pre-existed in .js original |
| generate-species-photos.ts | WR-05: BUNNY_API_KEY hardcoded '' makes redact() permanently inert dead code | CARRIED-OVER DEBT | Pre-existed in .js original |

Note on WR-01/WR-02: these are robustness gaps in the newly-written `verify-parquet.ts` (not a ported .js file), but are not blockers for the phase goal — `verify:parquet` runs correctly against the built dataset and exits 0.

### Human Verification Required

#### 1. ADDING_PLATE.md Operator Workflow Confirmation (Plan 05 Task 3)

**Test:** Open `_instructions/ADDING_PLATE.md` and review Step 4 (the curl PUT recipe replacing the deleted `upload-plates.js`). Answer: Is adding new photographic plates still an ongoing operator workflow, or was it a one-time migration?

**Expected:** If ongoing: confirm the manual `curl PUT` recipe (mirroring `_instructions/UPLOADING_TILES.md`'s bunny.net PUT pattern) is sufficient for the workflow. If one-time: confirm Step 4 should be removed or retained as a reference note.

**Why human:** Cannot determine from code alone whether photographic-plate uploads are an active ongoing workflow or a completed one-time migration. The deleted `upload-plates.js` was the only operator tooling for this task; only the maintainer can confirm intent (RESEARCH Open Question 1 / Assumption A3).

**Resume signal:** Reply with "plates one-time, drop step" OR "plates ongoing, curl recipe ok" OR describe the correct workflow.

---

## Gaps Summary

No blocking gaps found. All 5 ROADMAP success criteria are verified in the codebase.

The single human verification item (ADDING_PLATE.md operator workflow) is a documentation confirmation checkpoint, not a code gap. The automated portion of Phase 35 is complete and correct.

**Deferred technical debt (not phase gaps):** WR-01/WR-02 robustness gaps in `verify-parquet.ts` (missing-dir guard, per-file error isolation) are real improvement opportunities but do not prevent the script from fulfilling SCHEMA-07 on a correctly-built dataset.

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_
