---
phase: 26-dropbox-ingest-filename-parser-and-manifest
plan: 01
subsystem: ingest
tags:
  - parser
  - filename-parsing
  - pure-function
  - tdd

# Dependency graph
requires:
  - phase: spike-001-dropbox-photo-audit
    provides: parse-classify.mjs extractBinomial reference; REPORT.md edge-case enumeration
provides:
  - "scripts/lib/parse-photo-filename.js — pure-function library exporting extractBinomial, parseSpecimenAndView, toSpeciesSlug"
  - "scripts/lib/parse-photo-filename.test.js — 22 it() unit tests pinning every D-14 edge case"
  - "package.json test glob extended to scripts/lib/*.test.js"
affects:
  - 26-02 (manifest schema + Dropbox listing — will import these helpers if planner chose this composition)
  - 26-03 (scripts/ingest-photos.js classification cascade — direct consumer of all three exports)
  - 27 (synonym curation — reads parser output buckets)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function library under scripts/lib/ — no I/O, ESM, no default export"
    - "Tail-stripping then token-aware parsing — preserves intra-epithet hyphens (FIX #2) without sacrificing the Genus-species hyphen-joined case"
    - "Pre-pass scan over full token stream for provisional triggers (FIX #3) — runs before clean-binomial walk so 'n sp' doesn't shadow Genus + 2-char epithet"

key-files:
  created:
    - scripts/lib/parse-photo-filename.js
    - scripts/lib/parse-photo-filename.test.js
  modified:
    - package.json

key-decisions:
  - "Deviated from a literal spike port: stripping the trailing -<specimen>-<view> tail before tokenization preserves intra-epithet hyphens (v-alba, c-nigrum) that the spike's blanket separator-collapse step destroyed"
  - "Provisional pre-pass tokenizes on whitespace + hyphen + underscore + dot; safe because 'sp', 'nr', and the ['n','sp'] pair never appear inside a legitimate hyphenated epithet"
  - "Specimen regex pinned to D|V only (not any [A-Z]) per D-05 schema — the manifest column is the raw letter, not 'dorsal'/'ventral'"
  - "toSpeciesSlug is defensive on null/undefined/empty (returns '') rather than throwing — the classification cascade in Plan 03 will call it on parser output that may be null"

patterns-established:
  - "scripts/lib/ pure-function module conventions — ESM exports, no I/O imports, tested via sibling .test.js"
  - "Filename parser deviation guidance — tail-strip then dual-path (space-form first, hyphen-form fallback) is the right shape; pure collapse-then-walk loses hyphen-bearing epithets"

requirements-completed:
  - INGEST-02
  - INGEST-03

# Metrics
duration: ~10min
completed: 2026-05-22
---

# Phase 26 Plan 01: Filename Parser Library Summary

**Pure-function filename parser at `scripts/lib/parse-photo-filename.js` with the three D-14 fixes applied (≥2-char epithet, hyphenated epithet, provisional bucket) plus 22 unit tests pinning every audit edge case from REPORT.md.**

## Performance

- **Duration:** ~10 min wall-clock execution (actual coding time; setup/read time excluded)
- **Started:** 2026-05-21T20:48:00Z (approximate; tool invocation start)
- **Completed:** 2026-05-22T03:55:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 3 (2 created + 1 modified)

## Accomplishments

- Ported the spike's `extractBinomial` into a reusable ESM library under `scripts/lib/` and applied the three D-14 fixes — every audit edge case now parses correctly into the structured `{ binomial, bucketHint }` shape Plan 03 expects.
- Added `parseSpecimenAndView` with a loosened regex (`/-([A-Z0-9_]+)-([DV])\.[^.]+$/`) so institutional specimen IDs (`OSAC_0001081322`, `WWUC000000083`) are admitted alongside single-letter specimens.
- Added `toSpeciesSlug` matching `data/species.csv`'s lower-case hyphen-joined slug convention (`lower(genus || '-' || species)`), with defensive handling of null/undefined/empty input.
- Created a 22-test `node:test` suite covering every D-14-named edge case plus every filename in REPORT.md §"Unparseable cases", organized into three `describe` blocks (one per exported helper).
- Extended the `package.json` `test` script glob to include `scripts/lib/*.test.js` so `npm test` automatically discovers parser tests (and any future `scripts/lib/` helper tests) without per-file enumeration.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): failing tests for parse-photo-filename** — `a15adc5` (test)
2. **Task 1 (TDD GREEN): implement parse-photo-filename library** — `ae9fe4e` (feat)
3. **Task 2: extend npm test glob** — `d6d79c3` (chore)

Total: 3 commits across both tasks. The test file lives at `scripts/lib/parse-photo-filename.test.js` (Task 2 deliverable) but was authored in the Task 1 RED gate to honor `tdd="true"` semantics — see "Deviations" below.

## Files Created/Modified

- `scripts/lib/parse-photo-filename.js` (165 lines) — pure-function ESM library with three exports
- `scripts/lib/parse-photo-filename.test.js` (152 lines) — 22 `it()` unit tests across 3 `describe` blocks
- `package.json` (1 line modified) — `test` script glob extended with `scripts/lib/*.test.js`

## D-14 Edge Cases Covered by Tests

Every filename named in 26-PATTERNS.md's D-14 unit-test table plus the REPORT.md §"Unparseable cases" enumeration:

- `Abagrotis apposita-A-D.tif` → clean: `abagrotis apposita`, specimen `A`, view `D`
- `Paraseptis-adnixa-B-D.tif` → clean: `paraseptis adnixa`, specimen `B` (Genus-species hyphen joined)
- `Trichoplusia ni-A-D.tif` → clean: `trichoplusia ni` (FIX #1, 2-char epithet)
- `Rachiplusia ou-A-D.tif` → clean: `rachiplusia ou` (FIX #1, 2-char epithet)
- `Autographa v-alba-A-D.tif` → clean: `autographa v-alba` (FIX #2, hyphenated epithet)
- `Xestia c-nigrum-A-D.tif` → clean: `xestia c-nigrum` (FIX #2, hyphenated epithet)
- `Monostoecha n sp-A-D.tif` → provisional bucket (FIX #3, `n sp` pair)
- `Plataea sp-A-D.tif` → provisional bucket (FIX #3, `sp` token)
- `Eupithecia nr harrisonata-OSAC_0001081322-D.tif` → provisional bucket (FIX #3, `nr` token); specimen `OSAC_0001081322`
- `Hyalophora euryalus-WWUC000000083-D.tif` → specimen `WWUC000000083` (institutional accession)
- `Lasionycta Carolynae-A-D.tif` → null binomial, null bucketHint (capitalized second token; no coercion per REPORT.md)
- `Sympistis perscripta-A-V.tif` → specimen `A`, view `V` (ventral view)
- `novalid.tif` → empty specimen / empty view (no view tail)
- `12345.tif` → null binomial / null bucketHint (no Capitalized+lowercase pair)

`toSpeciesSlug` defensive coverage: `''`, `null`, `undefined`, `'AUTOGRAPHA V-ALBA'` (uppercase round-trip).

## Decisions Made

- **Deviation from a literal port of `parse-classify.mjs:110-127`.** The spike's parser uses `cleaned.replace(/[_\-.]+/g, ' ')` to collapse all separators uniformly before walking adjacent token pairs. That step is what makes the `Paraseptis-adnixa` Genus-species hyphen case work "for free", but it also destroys the hyphen inside species epithets like `v-alba` / `c-nigrum`, which then can never satisfy FIX #2's `/^[a-z]+(-[a-z]+)?$/` regex. The new implementation strips the trailing `-<specimen>-<view>` tail first (using the same regex as `parseSpecimenAndView`, in reverse) to isolate the binomial portion, then walks the residual token-aware: space-form first (most common, preserves intra-epithet hyphens), hyphen-joined fallback (covers Genus-species). Both the test for `Xestia c-nigrum-A-D.tif` and the test for `Paraseptis-adnixa-B-D.tif` pass under this approach.
- **Provisional pre-pass tokenizes on whitespace + hyphen + underscore + dot** (`/[\s\-_.]+/`), even though the clean-binomial walk only tokenizes on whitespace. This is safe because the trigger tokens (`sp`, `nr`, and the `['n','sp']` pair) are never substrings of legitimate epithets, so over-tokenizing for detection costs nothing while letting `Eupithecia nr harrisonata-OSAC_0001081322-D.tif` route correctly — its `nr` is detected even though the residual contains underscores and hyphens.
- **`toSpeciesSlug` is defensive on null/undefined/empty inputs** (returns `''` rather than throwing). The classification cascade in Plan 03 will call it on `binomial` values returned by `extractBinomial`, which is `null` for provisional and unparseable cases. Throwing there would force every caller into a guard; returning `''` keeps the cascade flat.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spike's "collapse all separators" trick was incompatible with FIX #2**
- **Found during:** Task 1 (initial GREEN attempt — first `npm test` after implementing the literal port-with-fixes).
- **Issue:** The plan's `<action>` block (and 26-PATTERNS.md's excerpt) shows the spike port verbatim with FIX #2's regex change layered on top. Verbatim that's `cleaned.replace(/[_\-\.]+/g, ' ')` followed by walking tokens with the new `/^[a-z]+(-[a-z]+)?$/` epithet regex. But the pre-collapse step destroys the hyphen inside `v-alba` / `c-nigrum`, so by the time the new regex runs, the token `b` is already `alba` / `nigrum` (no hyphen). The `Xestia c-nigrum` test failed in exactly this way.
- **Fix:** Strip the trailing `-<specimen>-<view>` tail first to isolate the binomial portion (hyphens preserved); then walk the residual token-aware (space-form first for `Genus species` with possibly-hyphenated epithets; hyphen-joined fallback for `Genus-species`). All 22 tests pass after the rewrite.
- **Files modified:** `scripts/lib/parse-photo-filename.js`
- **Verification:** `node --test scripts/lib/parse-photo-filename.test.js` → 22 pass, 0 fail.
- **Committed in:** `ae9fe4e` (Task 1 GREEN commit — the deviation was caught and fixed before the GREEN commit landed; the test file in `a15adc5` already pinned the desired behavior, so the rewrite was driven by the failing test, not retro-fitted).

**2. [Rule 3 - Blocking] Worktree lacked `node_modules/`; `npm test` could not run the broader suite**
- **Found during:** Task 2 verification (`npm test` exited non-zero because 8 sibling test files failed to import `@duckdb/node-api`, `node-html-parser`, etc.).
- **Issue:** The parallel-executor worktree was created without running `npm ci`, so the broader test files (everything outside `scripts/lib/`) failed at module resolution. The new parser test file itself ran cleanly via `node --test scripts/lib/parse-photo-filename.test.js`, but the plan's Task 2 acceptance criterion requires `npm test` to exit 0.
- **Fix:** Ran `npm ci` to materialize the existing locked dependencies. No new packages added; no `package-lock.json` mutation. The Rule 3 exclusion (package-manager *installs* of new packages) does not apply here because `npm ci` reproduces the locked tree exactly.
- **Files modified:** None tracked by git (`node_modules/` is gitignored).
- **Verification:** `npm test` exits 0 with 134 tests passing, 0 failing.
- **Committed in:** N/A (no tracked files changed).

### Acceptance-Criterion Wording Mismatches (not deviations from intent — just from the grep patterns)

Two of the plan's Task 2 acceptance-criterion greps were written for a TAP renderer different from `node --test`'s default reporter, so the literal greps return 0 even though the underlying behavior is satisfied:

- `grep -c parse-photo-filename` against `npm test` output returned 0 because `node --test` prints describe-block names (`extractBinomial`, `parseSpecimenAndView`, `toSpeciesSlug`), not file paths. All three describe blocks are visible in the output and all 22 nested `it()` blocks pass.
- `grep -c '# fail 0'` returned 0 because `node --test`'s default reporter writes `ℹ fail 0` (with an informational unicode marker), not the TAP-13 `# fail 0`. The substantive equivalent — zero failing tests — is satisfied: the output contains `ℹ fail 0` and the process exits 0.
- `grep -E "import.*\{[^}]*(extractBinomial|...)" wc -l` returned 0 because the test file uses a multi-line import (`import { extractBinomial,\n parseSpecimenAndView,\n toSpeciesSlug } from './parse-photo-filename.js'`). A multi-line-aware check confirms all three names are imported from the sibling library.

These are not behavioral deviations — every Task 2 success criterion's *intent* is satisfied. I'm calling them out for full transparency.

### Structural Deviation: TDD Gate Placement

The plan's Task 1 and Task 2 are both marked `tdd="true"`, with Task 1 creating the library and Task 2 creating the comprehensive test file. Per TDD's RED→GREEN→REFACTOR discipline, the failing test must precede the implementation. To honor that:

- The Task 2 test file (`scripts/lib/parse-photo-filename.test.js`) was authored during the Task 1 RED gate — it failed (no library yet, `ERR_MODULE_NOT_FOUND`) and was committed as `a15adc5` (`test(26-01): add failing tests for parse-photo-filename library`).
- The Task 1 GREEN gate (`ae9fe4e`, `feat(26-01): implement parse-photo-filename pure-function library`) implements the library and makes those tests pass.
- The Task 2 commit (`d6d79c3`, `chore(26-01): extend test glob to include scripts/lib/*.test.js`) extends the npm test glob — the test file's content was already committed in the RED phase.

Result: same files, same content, same coverage; commit titles reflect the actual TDD order of operations rather than the plan's Task 1 ↔ Task 2 boundary. All Task 1 and Task 2 acceptance criteria are met.

---

**Total deviations:** 1 auto-fixed bug (Rule 1) + 1 blocking environment fix (Rule 3) + 1 structural TDD reordering (no rule — execution-order normalization)
**Impact on plan:** All deviations necessary for correctness or for honoring the `tdd="true"` discipline. No scope creep — every artifact named in the plan exists; every acceptance criterion's intent is satisfied.

## Issues Encountered

- Pre-existing test failures in 8 sibling test files (`@duckdb/node-api`, `node-html-parser`, etc. not installed in worktree). Resolved by running `npm ci` to materialize the locked dependency tree.
- One initial-implementation bug in the parser caught by the pre-committed test suite — the literal spike-port-plus-fixes approach destroys intra-epithet hyphens. Rewrote the parsing strategy to tail-strip first, then walk token-aware. All tests then passed.

## User Setup Required

None — no external service configuration required. The parser is pure logic with no environment dependencies. (Downstream phases will require `DROPBOX_TOKEN`; not in scope here.)

## Next Phase Readiness

**Ready for Plan 03 (`scripts/ingest-photos.js` classification cascade):**
- Three helpers exported with the exact signatures from the plan's `<interfaces>` block.
- All audit edge cases unit-locked — Plan 03 can rely on the parser without re-deriving behavior.
- `toSpeciesSlug` matches `data/species.csv`'s slug convention (`lower(genus || '-' || species)`), so the cascade's `bySlug` lookup uses the same key shape as the data source.

**Ready for Plan 02 (manifest + Dropbox listing — Wave 2):**
- No direct dependency; the parser is consumed only at classification time (Wave 3). Plan 02 can proceed in parallel.

**No blockers.**

## Self-Check: PASSED

- File `scripts/lib/parse-photo-filename.js` exists: FOUND
- File `scripts/lib/parse-photo-filename.test.js` exists: FOUND
- Commit `a15adc5` (RED test): FOUND
- Commit `ae9fe4e` (GREEN library): FOUND
- Commit `d6d79c3` (test glob extension): FOUND
- `npm test` exits 0 with 134 tests passing, 0 failing: VERIFIED
- Three exports present and named exactly: VERIFIED
- All five Task 1 acceptance-criterion greps pass: VERIFIED
- All four behavioral Task 2 acceptance criteria met: VERIFIED (three grep-format mismatches documented as Acceptance-Criterion Wording Mismatches above)

---
*Phase: 26-dropbox-ingest-filename-parser-and-manifest*
*Plan: 01*
*Completed: 2026-05-22*
