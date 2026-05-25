---
phase: 26-dropbox-ingest-filename-parser-and-manifest
plan: 02
subsystem: ingest
tags:
  - dropbox-api
  - manifest-io
  - csv
  - async-generator
  - tdd

# Dependency graph
requires:
  - phase: 26-dropbox-ingest-filename-parser-and-manifest
    provides: Plan 01 added the scripts/lib/*.test.js glob to the npm test script
provides:
  - scripts/lib/dropbox-list.js — async-generator wrapper over /2/files/list_folder + /list_folder/continue
  - scripts/lib/manifest.js — CSV read/write + D-12 sortForInvestigation helper; D-05 COLUMNS schema locked
  - scripts/lib/manifest.test.js — 14 unit tests pinning COLUMNS shape, CSV round-trip, quoting behavior, and sort ordering
affects:
  - 26-03 (scripts/ingest-photos.js CLI — composes both libraries)
  - 28 (DZI Tile Generation Pipeline — reuses listSharedFolder + readManifest)
  - 29 (bunny.net Upload of Tile Pyramids — reuses readManifest / writeManifest)

# Tech tracking
tech-stack:
  added: []  # No new dependencies; csv-parse@^6.2.1 + csv-stringify@^6.7.0 already in package.json since Phase 13
  patterns:
    - async-generator-pagination — wraps a paged HTTP API into a `for await` consumer surface; yields entries incrementally so callers can write recovery state without holding the full result set in memory
    - library-pure-no-retry — Dropbox call wrapper throws structured errors; retry policy stays in the calling CLI (Plan 03's withRetry per D-15), keeping the library single-responsibility
    - columns-array-as-schema — exported COLUMNS const doubles as csv-stringify column-order pin AND the D-05 schema definition; same convention as scripts/migrate-species.js:32-39
    - stable-secondary-sort-by-index — sortForInvestigation captures original index alongside row in the partition step so the stable-sort contract doesn't rely on V8 internals

key-files:
  created:
    - scripts/lib/dropbox-list.js (96 lines; exports dbxCall, listSharedFolder)
    - scripts/lib/manifest.js (146 lines; exports COLUMNS, readManifest, writeManifest, sortForInvestigation)
    - scripts/lib/manifest.test.js (248 lines; 14 it() blocks across 4 describe blocks)
  modified: []

key-decisions:
  - sortForInvestigation captures (row, index) tuples in the partition step rather than trusting V8's stable-sort guarantee directly — the contract is preserved even if a future JS engine drops stable sort
  - INVESTIGATION_BUCKETS is a module-level Set inside manifest.js (not exported); a test asserts the four buckets (genus-only, likely-synonym, provisional, unparseable) are all recognized (T-26.02-04 mitigation)
  - Per-page progress in dropbox-list.js goes to process.stderr so callers piping stdout to a file (e.g., a future ndjson capture in Plan 03) do not get progress noise mixed in

patterns-established:
  - "async-generator library for paginated HTTP APIs: wrap fetch + pagination in `async function*`, yield per-entry, write progress to stderr; consumer uses `for await` and decides retry/persistence policy"
  - "first-run-safe manifest reader: existsSync guard returns [] for the missing-file case so the first call from the ingest CLI doesn't have to special-case file creation"
  - "csv-stringify columns option as schema enforcement: passing the same COLUMNS array to writeManifest gives header + per-row field order + omitted-field tolerance in one configuration"

requirements-completed:
  - INGEST-01
  - INGEST-04
  - INGEST-05

# Metrics
duration: ~30min
completed: 2026-05-22
---

# Phase 26 Plan 02: Dropbox & Manifest Libraries Summary

**Two ESM libraries for Plan 03's CLI to compose: an async-generator Dropbox shared-link lister and a CSV-driven manifest I/O helper with the D-05 column schema locked and a D-12 frequency-ordered investigation re-sort, all backed by 14 round-trip + ordering tests.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-22T03:38Z (estimated from worktree spawn)
- **Completed:** 2026-05-22T04:07Z
- **Tasks:** 2 (one auto + one TDD)
- **Files created:** 3 (scripts/lib/dropbox-list.js, scripts/lib/manifest.js, scripts/lib/manifest.test.js)
- **Files modified:** 0

## Accomplishments

- **scripts/lib/dropbox-list.js** — direct port of the spike's working `list_folder` / `list_folder/continue` loop with two structural changes: `shareUrl` + `token` parameterized (no module constants), and the entry-accumulator array replaced with an `async function*` so consumers can write manifest rows incrementally. No Dropbox SDK; native `fetch` only. Per-page progress to stderr.
- **scripts/lib/manifest.js** — `COLUMNS` constant is the D-05 schema (13 columns, content_hash first, last_error last); `readManifest` is first-run safe (returns `[]` on missing file); `writeManifest` uses `csv-stringify { header: true, columns: COLUMNS }` so column order is enforced even when row objects omit fields and CSV-special chars (T-26.02-02) are auto-quoted; `sortForInvestigation` returns a new array placing the four INVESTIGATION_BUCKETS at the top, grouped by binomial_raw frequency descending with stable secondary ordering.
- **scripts/lib/manifest.test.js** — 14 tests across 4 describe blocks: COLUMNS shape and D-05 string equality, readManifest first-run, full round-trip (including a deliberately weird `/weird, "path"/with\nnewline.tif` value to exercise CSV quoting), header on line 1, omitted-field tolerance, sortForInvestigation empty/single/general/no-mutation/all-buckets/empty-string-group cases.

## Task Commits

Each task was committed atomically; Task 2 followed the TDD RED → GREEN cycle:

1. **Task 1: Port spike list-dropbox.mjs into scripts/lib/dropbox-list.js as an async-generator library** — `b322de7` (feat)
2. **Task 2 RED: Failing tests for scripts/lib/manifest.js** — `85ca485` (test)
3. **Task 2 GREEN: Implement scripts/lib/manifest.js (CSV I/O + sort)** — `e702870` (feat)

REFACTOR was skipped — both modules are concise and self-documenting; no behavior-preserving rewrite warranted.

**Plan metadata commit:** issued by this commit (this SUMMARY).

## Files Created/Modified

- `scripts/lib/dropbox-list.js` (96 lines, 2 exports) — async-generator wrapper around the Dropbox list_folder + list_folder/continue endpoints
- `scripts/lib/manifest.js` (146 lines, 4 exports) — CSV I/O + investigation re-sort over the D-05 schema
- `scripts/lib/manifest.test.js` (248 lines, 14 it() blocks) — unit tests pinning the manifest contract

`package.json` was NOT modified — Plan 01 already added `scripts/lib/*.test.js` to the test glob, and this plan added no new dependencies (csv-parse + csv-stringify already in deps from Phase 13).

## Decisions Made

- **COLUMNS array matches D-05 by literal string equality** — verified mechanically by a test that calls `assert.deepEqual` against the 13-element D-05 array. Future drift on either side fails immediately at `npm test`.
- **sortForInvestigation captures (row, index) tuples in the partition step** — V8's sort is stable since Node 12+, but the test contract should not depend on engine internals. The explicit `a.index - b.index` tiebreaker in the comparator makes the stability guarantee portable.
- **INVESTIGATION_BUCKETS is a module-local Set (not exported)** — keeps the bucket list pinned to a single source of truth, asserted by the "treats likely-synonym, provisional, and unparseable as investigation buckets" test (T-26.02-04 mitigation).
- **dropbox-list.js writes per-page progress to process.stderr** — Plan 03's CLI may want to redirect stdout to a structured log file later; keeping progress on stderr leaves stdout clean for that future capture.
- **Plan deviations from the spike** — two intentional changes vs. `.planning/spikes/001-dropbox-photo-audit/list-dropbox.mjs`: (1) `SHARE_URL` and `TOKEN` are function parameters rather than module-level constants, and (2) the function is an `async function*` that yields entries one at a time rather than accumulating them into an array and returning a summary object. Both changes are explicitly called out in the plan's `<action>` block.

## Deviations from Plan

None — plan executed exactly as written.

Note: the worktree spawned without a `node_modules/` tree (sibling worktrees in this repo are isolated). Running `npm install` was a one-time environment bootstrap, not a Rule-3 fix on the code itself; the resulting `package-lock.json` drift (removal of two optional `@emnapi/*` platform packages on this Linux box) was reverted before the GREEN commit so the lock file remains pristine. No code or test change in this plan caused the drift.

## Issues Encountered

- **Initial Task 1 acceptance check failed** on the literal-string negative grep for `recursive: true`. Root cause: the docstring contained the phrase "explicitly forbids `recursive: true`" as documentation of the forbidden pattern, and the negative-grep gate didn't distinguish code from comments. Resolution: rephrased the docstring to "explicitly forbids recursive listing" — no behavior change, just documentation phrasing. Caught and fixed before the Task 1 commit.
- **Plan `<verify>` literal `# fail 0`** does not match Node v24's `node --test` reporter output format (which emits `ℹ fail 0`). The semantic intent — zero failures — is satisfied (148/148 tests pass, 14 of them new from this plan); only the literal substring differs. Documented here so a future verifier or reviewer can recognize this as a reporter-format detail, not a test failure.

## Verification Summary

All acceptance criteria from the plan pass:

| Criterion | Status |
|---|---|
| dropbox-list.js exports `dbxCall, listSharedFolder` | ✓ |
| dropbox-list.js contains `async function*` | ✓ (1 occurrence) |
| dropbox-list.js contains `recursive: false` | ✓ (1 occurrence) |
| dropbox-list.js contains `/2/files/list_folder` | ✓ (7 occurrences — endpoint + endpoint/continue + docstrings) |
| dropbox-list.js contains `recursive: true` | ✓ 0 occurrences |
| dropbox-list.js imports no Dropbox SDK | ✓ 0 occurrences |
| dropbox-list.js writes progress to stderr | ✓ 1 occurrence |
| dropbox-list.js uses Authorization Bearer ${token} | ✓ 1 occurrence |
| manifest.js exports `COLUMNS, readManifest, sortForInvestigation, writeManifest` | ✓ |
| `COLUMNS.length === 13` | ✓ |
| COLUMNS matches D-05 order exactly (string equality) | ✓ |
| manifest.test.js has ≥ 5 it() blocks | ✓ (14 it() blocks) |
| manifest.js imports both csv-parse/sync and csv-stringify/sync | ✓ (2 imports) |
| `npm test` exits 0 with manifest test running | ✓ (148 tests pass, 0 fail; manifest.test.js contributes 14 new passing tests) |
| `recursive: true` does not appear in dropbox-list.js | ✓ |

## Next Phase Readiness

Plan 03 (`scripts/ingest-photos.js`) is now unblocked. It can:

```js
import { dbxCall, listSharedFolder } from './lib/dropbox-list.js';
import { COLUMNS, readManifest, writeManifest, sortForInvestigation } from './lib/manifest.js';
```

…with no further wiring. The `parse-photo-filename.js` library from Plan 01 is also already in place. The remaining work for Plan 03 is composition: load species.csv, iterate `listSharedFolder`, parse each filename via `extractBinomial` + `parseSpecimenAndView`, classify against species data, write rows via `writeManifest`, and re-sort with `sortForInvestigation`. Retry-with-backoff and DROPBOX_TOKEN redaction wrap `dbxCall` at the CLI level per D-15.

Phase 28 and Phase 29 inherit these libraries verbatim — `listSharedFolder` is reusable for re-listing during incremental runs, and `readManifest` / `writeManifest` are the only manifest-mutation API anyone in v2.2 should call.

## Self-Check: PASSED

Verified post-write:

- `scripts/lib/dropbox-list.js` exists (96 lines) ✓
- `scripts/lib/manifest.js` exists (146 lines) ✓
- `scripts/lib/manifest.test.js` exists (248 lines, 14 it() blocks) ✓
- Commit `b322de7` exists (`feat(26-02): add scripts/lib/dropbox-list.js async generator`) ✓
- Commit `85ca485` exists (`test(26-02): add failing tests for scripts/lib/manifest.js`) ✓
- Commit `e702870` exists (`feat(26-02): implement scripts/lib/manifest.js (CSV I/O + sort)`) ✓
- npm test passes: 148/148 ✓

---
*Phase: 26-dropbox-ingest-filename-parser-and-manifest*
*Plan: 02*
*Completed: 2026-05-22*
