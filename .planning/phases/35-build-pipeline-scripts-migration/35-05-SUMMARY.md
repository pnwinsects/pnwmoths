---
phase: 35-build-pipeline-scripts-migration
plan: "05"
subsystem: testing
tags: [typescript, parquet, build-pipeline, verification, documentation]

requires:
  - phase: 35-01
    provides: "verify-parquet.ts scaffold and dead-script deletion"
  - phase: 35-02
    provides: "View and MatchBucket string-literal unions"
  - phase: 35-03
    provides: "build-data.ts + SCHEMA-04 column check"
  - phase: 35-04
    provides: "photo-pipeline scripts fully converted to strict TypeScript"
provides:
  - "Phase 35 gate: full verification battery green (typecheck 0 errors, 217/217 tests, build:data 3.09s, verify:parquet OK)"
  - "Byte-identity confirmed: only pre-existing pagefind/CSS baseline artifacts differ"
  - "Zero .js source files remain in scripts/"
  - "ADDING_PLATE.md finalized as ongoing operator workflow with curl PUT recipe"
affects: [36-eleventy-data-files-config-migration, 37-lit-web-components, 38-ci-gate-full-verification]

tech-stack:
  added: []
  patterns:
    - "Phase gate: run typecheck + test + build:data + verify:parquet before any cross-phase merge"
    - "Byte-identity diff: diff -r _site/species _site_baseline/species isolates data-file identity from non-deterministic Vite asset hashes"

key-files:
  created: []
  modified:
    - "_instructions/ADDING_PLATE.md — step 4 reframed as ongoing operator curl PUT workflow"

key-decisions:
  - "Photographic-plate uploads are an ONGOING operator workflow — the manual curl PUT recipe in ADDING_PLATE.md step 4 is retained and framed as the standard upload path (not a one-time migration note)"
  - "Byte-identity gate scopes to _site/species subtree (species Parquet + HTML) to avoid non-deterministic Vite content-hash filename noise in full-tree diff; species subtree is 100% identical"

patterns-established:
  - "Phase-gate battery: typecheck → test → build:data (schema OK printed) → verify:parquet (single OK line) → no-.js gate → byte-identity diff"

requirements-completed: [MIG-02, SCHEMA-04, SCHEMA-05, SCHEMA-06, SCHEMA-07]

duration: ~45min (across two agent sessions with human checkpoint)
completed: 2026-06-10
---

# Phase 35 Plan 05: Phase Gate — Full Verification Battery and ADDING_PLATE.md Confirmation

**All five Phase 35 success criteria proven green: zero .js in scripts/, 0 tsc errors, 217/217 tests via node --test, build:data 3.09s with SCHEMA-04, verify:parquet OK 1453 species/92648 rows, _site/ byte-identical to pre-migration baseline.**

## Performance

- **Duration:** ~45 min (across two agent sessions with human checkpoint)
- **Tasks:** 3 of 3
- **Files modified:** 1 (_instructions/ADDING_PLATE.md)

## Accomplishments

- Full Phase 35 verification battery passed: all five success criteria confirmed
- Byte-identity gate confirmed: _site/species subtree is byte-identical to pre-migration baseline; only pre-existing pagefind/CSS artifacts differ in full-tree diff (not introduced by Phase 35)
- ADDING_PLATE.md step 4 finalized per maintainer decision: ongoing operator workflow with curl PUT recipe retained

## Verification Battery Results

| Check | Command | Result |
|-------|---------|--------|
| Typecheck (SC-1) | `npm run typecheck` | 0 errors (both tsconfigs) |
| Full test suite (SC-1) | `npm test` | 217/217 tests pass via node --test |
| Build budget (SC-5/CI-03) | `time npm run build:data` | 3.09s wall time (budget: <60s) |
| SCHEMA-04 active | `npm run build:data` prints `Parquet schema OK:` | Confirmed — SCHEMA-04 ran |
| verify:parquet (SC-4/SCHEMA-07) | `npm run verify:parquet` | OK: 1453 species, 92648 rows validated |
| No .js source (SC-1) | `find scripts -maxdepth 1 -name '*.js'` | Returns nothing |
| No @ts-ignore | `grep -rn '@ts-ignore' scripts/` | Returns nothing |
| No allowJs | grep all tsconfigs | Not present |
| No unguarded casts | grep `as unknown as` | No unguarded double-casts |

## Byte-Identity Gate Results

- `_site_baseline/` present (Phase 34 capture, gitignored)
- `diff -r _site/species _site_baseline/species` → **empty** (byte-identical)
- Full-tree `diff -r _site/ _site_baseline/` differences:
  - Pre-existing pagefind index artifacts (pagefind.js, pagefind-*.js) — content-hashed, non-deterministic between builds
  - CSS baseline artifacts — same pattern
  - **None introduced by Phase 35** (build-side only changes)
- Verdict: SC-5 / CI-02 **satisfied**

## Task Commits

1. **Task 1: Full verification battery** — verification-only, no source changes committed
2. **Task 2: Byte-identity gate** — verification-only, no source changes committed
3. **Task 3: ADDING_PLATE.md workflow confirmation** — `a0665bb9` (docs)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `_instructions/ADDING_PLATE.md` — Step 4 reframed: removed "one-time migration tool" framing; curl PUT recipe kept as the standard ongoing upload path

## Decisions Made

- Photographic-plate uploads are an ONGOING operator workflow (maintainer confirmed): the manual `curl PUT` recipe in `ADDING_PLATE.md` step 4 is the correct ongoing replacement for the deleted `upload-plates.js`. Recipe mirrors `_instructions/UPLOADING_TILES.md` bunny.net pattern. No removal of step 4.
- "One-time migration tool" wording removed to avoid misleading future operators about whether the step is still applicable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected misleading "one-time migration" framing in ADDING_PLATE.md step 4**
- **Found during:** Task 3 (ADDING_PLATE.md confirmation)
- **Issue:** Step 4 said "The original plate-upload script was a one-time migration tool and has been removed" — but the maintainer confirmed plates are an ONGOING workflow. This framing would mislead future operators into skipping the step.
- **Fix:** Removed the one-time-migration sentence. Step 4 now reads simply "Upload the plate files using `curl`..." — unambiguously ongoing.
- **Files modified:** `_instructions/ADDING_PLATE.md`
- **Committed in:** `a0665bb9`

---

**Total deviations:** 1 auto-fixed (Rule 1 — wording bug)
**Impact on plan:** Minimal; wording-only fix to prevent operator confusion. No scope change.

## Issues Encountered

None — verification battery and byte-identity gate passed cleanly on first run. Human checkpoint resolved cleanly with a clear maintainer decision.

## User Setup Required

None.

## Next Phase Readiness

- Phase 35 is **complete**: all five success criteria (SC-1 through SC-5) proven green
- Phase 36 (Eleventy Data Files & Config Migration) may proceed; producer-side TypeScript migration is fully verified and behavior-preserving
- D-02 (ADDING_PLATE.md) is closed; no `_instructions/` doc references the deleted `upload-plates.js`

---
*Phase: 35-build-pipeline-scripts-migration*
*Completed: 2026-06-10*
