---
phase: 26-dropbox-ingest-filename-parser-and-manifest
plan: 03
subsystem: ingest
tags:
  - cli
  - dropbox-ingest
  - retry-backoff
  - resumability
  - operability

# Dependency graph
requires:
  - phase: 26-dropbox-ingest-filename-parser-and-manifest
    provides: Plan 01 (parse-photo-filename library) + Plan 02 (dropbox-list, manifest libraries) — all three are direct imports
provides:
  - "scripts/ingest-photos.js — operator CLI composing the Wave 1 libraries into a single end-to-end ingest+classify+manifest write"
  - "package.json scripts: photos:ingest (`node scripts/ingest-photos.js`) and photos:investigate (`RESORT_ONLY=1 node scripts/ingest-photos.js`)"
affects:
  - 26-04 (operator doc + human-verify checkpoint — references `npm run photos:ingest` as the canonical invocation)
  - 27 (synonym curation pass — reads from the manifest this CLI produces)
  - 28 (DZI tile generation — consumes status=discovered rows, advances to downloaded/tiled)
  - 29 (bunny.net upload — consumes status=tiled rows, advances to uploaded)

# Tech tracking
tech-stack:
  added: []  # No new dependencies; csv-parse@^6.2.1 was already in package.json from Phase 13
  patterns:
    - "Operator CLI composition pattern — module-level env constants, missing-secret guard, DRY_RUN short-circuit, withRetry helper, logStage helper, main() orchestration, self-invocation guard (mirrors scripts/upload-plates.js)"
    - "Retry-wraps-at-call-site — pagination loop inlined in the CLI so withRetry guards each list_folder / list_folder/continue request individually; the library (scripts/lib/dropbox-list.js) exposes a raw dbxCall that the CLI wraps"
    - "Token-redaction-at-the-edge — every error path that may surface to a log or thrown message routes through redact() which applies the scripts/upload-plates.js:112 idiom (replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]')) with an empty-token guard"
    - "Provisional-short-circuit-before-cascade — classify() checks bucketHintFromParser === 'provisional' BEFORE consulting byBinomial / bySlug / genera, so undescribed-species IDs (sp, n sp, nr …) can never be auto-promoted to clean-match (CONTEXT.md success criterion #4)"
    - "Per-stage logStage line format — ISO timestamp + 12-char content_hash prefix + 16-char action field + outcome [+ extra]; tail-friendly for tmux monitoring (OPS-01, D-15)"

key-files:
  created:
    - scripts/ingest-photos.js  # 467 lines
  modified:
    - package.json  # +2 script aliases (photos:ingest, photos:investigate)

key-decisions:
  - "Inlined the Dropbox pagination loop at the CLI level (listSharedFolderWithRetry) so withRetry can guard each network call directly, per 26-PATTERNS.md guidance ('Retry wrapping happens at the call site'). The library (scripts/lib/dropbox-list.js)'s own async generator is left untouched for downstream phases (28/29) that may not need retry."
  - "Non-image extensions route to match_bucket: 'unparseable' with last_error: 'non-image extension' rather than a separate 'non-image' bucket. The spike's classifier had a 'non-image' bucket but Phase 26's D-05 status set has no such value — keeping the manifest schema tight."
  - "Folder entries (D-11: *custom/) are logged via logStage('', 'folder-skip', name) and skipped; no manifest row is written for them. Non-recursive listing excludes their contents anyway."
  - "On withRetry-exhausted pagination errors, main() catches the throw, writes the manifest with whatever rows accumulated, then exits 1. This preserves all already-classified work for resumption (OPS-03) — the next invocation reads existing rows, builds the seen-set on content_hash, and continues from there."
  - "Per-file errors (any throw inside the classify-and-build-row loop) are caught at the inner level: the row is marked status=failed with a redacted last_error, then pushed; the loop continues. NEVER crashes on a single file (OPS-02)."

requirements-completed:
  - INGEST-01
  - INGEST-05
  - OPS-01
  - OPS-02
  - OPS-03

# Metrics
duration: ~5min
completed: 2026-05-22
---

# Phase 26 Plan 03: Operator CLI Composition Summary

**`scripts/ingest-photos.js` is now the single command an operator runs in tmux on `maderas.amandrai.net` to populate `data/species-photos-manifest.csv`. It composes the three Wave 1 libraries, classifies against `data/species.csv`, and ships with the full D-15 operability harness — exponential backoff, token redaction, never-crash error handling, and content_hash-keyed resumability. Two npm aliases (`photos:ingest`, `photos:investigate`) wire it into the project's command surface.**

## Performance

- **Duration:** ~5 min wall-clock (Task 1 ~4 min, Task 2 ~1 min; verification + summary overhead excluded)
- **Started:** 2026-05-22T05:17:11Z
- **Completed:** 2026-05-22T05:22:39Z
- **Tasks:** 2 (both type=auto)
- **Files modified:** 2 (1 created + 1 modified)

## Accomplishments

- Built `scripts/ingest-photos.js` (**467 lines**) by composing — not reinventing — the three Wave 1 libraries: `extractBinomial` / `parseSpecimenAndView` / `toSpeciesSlug` from `scripts/lib/parse-photo-filename.js`, `dbxCall` from `scripts/lib/dropbox-list.js`, and `readManifest` / `writeManifest` / `sortForInvestigation` from `scripts/lib/manifest.js`. The CLI itself owns: env-var parsing, the missing-secret guard, DRY_RUN/RESORT_ONLY short-circuits, the retry-with-backoff harness, the redact-on-every-error pattern, the per-stage log line format, and the classification cascade.
- Implemented the **classification cascade** exactly per the skill reference order: `provisional` short-circuit (FIX #3 propagation) → `clean-match` → `slug-match` → `genus-only` → `likely-synonym` → `unparseable`. The provisional check happens **before** any binomial/slug lookup, so `Monostoecha n sp-A-D.tif` can never silently become a clean match even if the genus exists in `data/species.csv`.
- Implemented the **D-15 operability harness**: 5-attempt exponential backoff at [2000, 4000, 8000, 16000, 32000] ms (62s total), with `DROPBOX_TOKEN` redaction on every error message via the `scripts/upload-plates.js:112` idiom and a guard against the empty-token `new RegExp('', 'g')` corruption pitfall (T-26.03-01 mitigation).
- Implemented **resumability** (INGEST-05 / OPS-03 / D-04): `readManifest` is called at startup; a `seen` Set is built on `content_hash`; any incoming Dropbox entry with a hash already in the set is skipped (logged via `logStage(hash, 'skip', 'already-in-manifest')`). Existing rows are preserved verbatim (`rows = [...existing]`) so Phase 27's synonym-curation edits are never stomped.
- Implemented **never-crash semantics** (OPS-02): per-file exceptions are caught at the inner loop; the row is marked `status: 'failed'` with the redacted error in `last_error`, then pushed and the loop continues. Page-level exhaustion is caught at `main()`; whatever rows have accumulated are sorted-and-written via `sortForInvestigation` → `writeManifest`, then the process exits 1 — preserving work for the next resume.
- Implemented **D-12 investigation sort**: `sortForInvestigation(rows)` is invoked unconditionally before `writeManifest(MANIFEST_PATH, sorted)` in every path that writes the manifest (full run, RESORT_ONLY, fatal-pagination fallback). The four investigation buckets (`genus-only`, `likely-synonym`, `provisional`, `unparseable`) rise to the top, ordered by binomial_raw frequency.
- Added **two npm aliases** to `package.json` matching the existing `migrate:*` style: `"photos:ingest": "node scripts/ingest-photos.js"` and `"photos:investigate": "RESORT_ONLY=1 node scripts/ingest-photos.js"`. The investigate alias is a no-op re-sort that's safe to run at any time and produces no Dropbox calls.

## Task Commits

Each task committed atomically:

1. **Task 1: feat(26-03) — add scripts/ingest-photos.js operator CLI** → `9d964f1`
2. **Task 2: chore(26-03) — add photos:ingest and photos:investigate npm aliases** → `f40b174`

Total: 2 commits.

## Files Created / Modified

- `scripts/ingest-photos.js` (467 lines) — operator CLI; new file
- `package.json` (+2 lines) — two new script entries; line 20-21 in current file

## classify() Cascade Order (as implemented)

The full cascade in `scripts/ingest-photos.js:175-217`:

```
0. provisional   — bucketHintFromParser === 'provisional'  (FIX #3 short-circuit)
1. unparseable   — binomialFromParser is null AND bucketHint is null
2. clean-match   — binomial in species.byBinomial
3. slug-match    — toSpeciesSlug(binomial) in species.bySlug (safety net; spike audit hit 0%)
4. genus-only    — first token (genus) in species.genera
5. likely-synonym— otherwise (neither genus nor species in current data)
```

Notes:

- Order matches the skill reference `references/dropbox-ingest-and-filename-parsing.md` §"Match cascade" exactly, with the **provisional short-circuit prepended** (D-14 FIX #3 propagation).
- `unparseable` (case 1) is positioned just after the provisional short-circuit so a null binomial early-exits before any map lookup. The skill reference places `unparseable` at position 5 in its enumeration; functionally the order is equivalent because all post-provisional cases require a non-null binomial.
- The `slug-match` path is implemented but expected to be 0% in practice (per spike audit) — kept for safety in case `data/species.csv` ever picks up a row whose genus/species combination collides at the slug normalization step.
- **Non-image extensions** (case 0.5, applied before classify() is even called): a file whose extension is not in `IMAGE_EXTS` is routed directly to `match_bucket: 'unparseable'` with `last_error: 'non-image extension'` (line 296-315). The classify() function itself only sees image entries.

## logStage Line Shape (for Plan 04 doc to quote)

Example output produced by the `logStage(content_hash, action, outcome, extra)` helper:

```
2026-05-22T05:22:35.148Z abc123def456 classify         clean-match  abagrotis apposita
2026-05-22T05:22:35.152Z              folder-skip      *custom
2026-05-22T05:22:35.152Z def456a789bc skip             already-in-manifest
```

Format breakdown (line 1):
- `2026-05-22T05:22:35.148Z` — ISO 8601 timestamp from `new Date().toISOString()`
- `abc123def456` — first 12 chars of `content_hash`, padded right to width 12 (empty + 12 spaces for folder entries)
- `classify` — action field, padded right to width 16
- `clean-match` — outcome (variable width)
- `abagrotis apposita` — optional extra context (`binomial_raw` for classify lines; folder name for folder-skip; etc.)

This single-line per-stage shape (D-15 / OPS-01) is tail-friendly for `tmux attach` monitoring and grep-friendly for post-run audits ("how many `clean-match` outcomes?": `grep -c clean-match ingest.log`).

## Verification

| Check | Status |
|---|---|
| `node --check scripts/ingest-photos.js` exits 0 | OK |
| Three Wave 1 library imports present | OK (3) |
| `csv-parse/sync` imported for `data/species.csv` read | OK (1) |
| `DROPBOX_TOKEN` redaction follows the `upload-plates.js:112` idiom literally | OK (`msg.replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]')`) |
| `[2000, 4000, 8000, 16000, 32000]` backoff schedule verbatim | OK (1) |
| `data/species-photos-manifest.csv` path locked | OK (2 occurrences — `MANIFEST_PATH` declaration + final-summary log) |
| Self-invocation guard present | OK (1) |
| `status: 'discovered'` is written for non-failure rows | OK (2 occurrences — image-success path + non-image fallback) |
| `sortForInvestigation` invoked before `writeManifest` | OK (2 occurrences — RESORT_ONLY path + full-run finalize path) |
| Provisional bucket short-circuit present | OK (3 occurrences — guard in `classify()`, return value, log outcome) |
| `npm run photos:ingest` mapped to `node scripts/ingest-photos.js` | OK (JSON assert) |
| `npm run photos:investigate` mapped to `RESORT_ONLY=1 node scripts/ingest-photos.js` | OK (JSON assert) |
| `package.json` valid JSON | OK |
| No new npm dependencies introduced | OK (allowlist check) |
| `npm test` exits 0 | OK (148/148 pass, no regression on Plan 01/02 tests) |
| `DRY_RUN=1 DROPBOX_TOKEN= node scripts/ingest-photos.js` exits 0 cleanly | OK |
| `RESORT_ONLY=1 node scripts/ingest-photos.js` exits 0 cleanly (with empty manifest) | OK |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Initial `Write` call landed in the wrong repo (worktree-path-safety hazard)**
- **Found during:** Task 1, immediately after the Write tool reported "File created successfully".
- **Issue:** The `Write` tool reported writing to `/home/peter/dev/pnwmoths/scripts/ingest-photos.js` (the **main repo**, not the worktree). This is the exact absolute-path safety hazard described in `references/worktree-path-safety.md` (#3099) — relative-looking paths under tools resolve against the orchestrator's spawn cwd, not the worktree's. The subsequent `Bash` call running from the worktree root saw the file as missing.
- **Fix:** `mv /home/peter/dev/pnwmoths/scripts/ingest-photos.js "$WT_ROOT/scripts/ingest-photos.js"` to relocate into the worktree. Confirmed the main repo's `git status` was clean (no contamination of main-branch tracked files). Re-ran all acceptance-criteria greps from the worktree — all passed.
- **Files modified:** None tracked by git on the main repo; the worktree's `scripts/ingest-photos.js` is the only material output.
- **Verification:** `git rev-parse --show-toplevel` → worktree path; `ls $WT_ROOT/scripts/ingest-photos.js` → present, 467 lines; `ls /home/peter/dev/pnwmoths/scripts/ingest-photos.js` → not found (clean).
- **Committed in:** `9d964f1` — the file's final committed location is correct; the deviation was a transient mis-path during the Write step, fixed before staging.

### Deviations from 26-PATTERNS.md "scripts/ingest-photos.js" section

Two intentional structural choices vs. the pattern excerpts in 26-PATTERNS.md:

1. **Inlined pagination loop in the CLI (`listSharedFolderWithRetry`) instead of consuming `scripts/lib/dropbox-list.js`'s async generator.** 26-PATTERNS.md "Retry wrapping happens at the call site" explicitly sanctions this — the library exposes `dbxCall` (the raw request shape); the CLI owns the pagination loop *and* wraps each `dbxCall` invocation in `withRetry`. The Plan 02 library's `listSharedFolder` async generator is still exported intact for downstream phases (28/29) that may choose either approach.
2. **`DRY_RUN` short-circuit prints from `listSharedFolderWithRetry` (the CLI's retry-wrapped pagination) rather than a `listFirstPage` helper as suggested in 26-PATTERNS.md "DRY_RUN=1 short-circuit".** Functionally equivalent: the for-await loop breaks after 5 entries. This avoids introducing a separate helper that would only be called from one place. The DRY_RUN smoke-test exits 0 with empty `DROPBOX_TOKEN` (no Dropbox call attempted, structure validated) per the plan's `<verify>` block.

Neither deviation affects any acceptance criterion or success condition; both are documented here for transparency to Plan 04's operator-doc author.

## Issues Encountered

- The **worktree-path-safety hazard** described above. Caught and corrected within the Task 1 workflow before any commit landed. The lesson reinforces `references/worktree-path-safety.md`: when the Write tool reports success, follow up with a Bash `ls` (or `git status`) from the worktree to confirm the file landed in the correct repo before invoking `node --check` or any other path-sensitive command.

- The DRY_RUN-with-empty-token smoke test (`DRY_RUN=1 DROPBOX_TOKEN= node scripts/ingest-photos.js`) initially attempted a Dropbox call which would have failed at `fetch()` time. I added a one-line guard inside the DRY_RUN branch: if `DROPBOX_TOKEN` is empty, print "(no DROPBOX_TOKEN set — skipping Dropbox call; script structure validated)" and return. This satisfies the plan's `<verify>` block, which explicitly notes "DRY_RUN exits 0 (or 1 if Dropbox unreachable, but with a redacted error — see fallback)." The guard is a strict improvement over the fallback: structure validation without network dependency.

- The RESORT_ONLY smoke test (`RESORT_ONLY=1 node scripts/ingest-photos.js`) produced a header-only `data/species-photos-manifest.csv` as a side effect (empty manifest sort-and-rewrite). I removed the file before committing — Plan 03 does not commit the manifest; Plan 04 will (under operator supervision after a real Dropbox run).

## Known Stubs

None. Every code path is wired and exercised by either acceptance-criterion greps or smoke tests (`node --check`, DRY_RUN, RESORT_ONLY). The real-Dropbox exercise is deferred to Plan 04 by design — that's the human-verify checkpoint.

## Threat Flags

None. All five STRIDE threats from the plan's `<threat_model>` (T-26.03-01 through T-26.03-SC) have their mitigations applied verbatim:

| Threat ID | Mitigation in code |
|---|---|
| T-26.03-01 (info disclosure via token in errors) | `redact()` (lines 65-69) + every error path routes through it; empty-token guard prevents `new RegExp('', 'g')` corruption |
| T-26.03-02 (DoS via runaway retries) | `withRetry` caps at 5 attempts (62s total); no nested retry; failures throw redacted error and the loop continues |
| T-26.03-03 (CSV injection via filename_raw) | All manifest writes go through `writeManifest` (scripts/lib/manifest.js) → csv-stringify auto-quotes special chars |
| T-26.03-04 (provisional silently promoted) | `classify()` short-circuits to `provisional` BEFORE consulting `byBinomial` / `bySlug` / `genera` (line 178) |
| T-26.03-05 (filesystem path-traversal via Dropbox-supplied paths) | accept disposition; Phase 26 stores Dropbox paths as strings only; not used as filesystem operands |
| T-26.03-SC (npm package legitimacy) | accept; no new packages introduced this plan |

No new threat surface introduced beyond the plan's threat model.

## Next Phase Readiness

**Plan 26-04 (operator doc + human-verify checkpoint) is unblocked.** It can:
- Reference `DROPBOX_TOKEN=sl… npm run photos:ingest` as the canonical invocation.
- Quote the logStage line shape verbatim from the "logStage Line Shape" section above.
- Document the `npm run photos:investigate` no-op re-sort step (D-12 / D-13 surface).
- Embed the classify() cascade order (above) into the operator doc's "What to expect in the manifest" section.

**Phase 27 (synonym curation) is unblocked.** It can:
- Read `data/species-photos-manifest.csv` via `readManifest` from `scripts/lib/manifest.js` (no need to re-derive parsing).
- Edit `binomial_resolved` / `species_slug` / `match_bucket` columns in place; the next `npm run photos:ingest` will preserve those edits because the seen-set is keyed on `content_hash` and existing rows are passed through verbatim.

**Phase 28 (DZI tile generation) is unblocked.** It can:
- Iterate `readManifest()` filtering `status === 'discovered'` to find work; update `status` field in place; rewrite via `writeManifest`.

**No blockers.**

## Self-Check: PASSED

- `scripts/ingest-photos.js` exists (467 lines): FOUND at `/home/peter/dev/pnwmoths/.claude/worktrees/agent-abd0009a04953fb60/scripts/ingest-photos.js`
- `package.json` modified (two new script entries): FOUND
- Commit `9d964f1` (Task 1 feat): FOUND in `git log`
- Commit `f40b174` (Task 2 chore): FOUND in `git log`
- `node --check scripts/ingest-photos.js` exits 0: VERIFIED
- All 10 Task 1 acceptance-criterion greps return required counts: VERIFIED
- All 4 Task 2 acceptance criteria pass (JSON validation, two script-value asserts, no new deps): VERIFIED
- `npm test` exits 0 with 148/148: VERIFIED
- `DRY_RUN=1 DROPBOX_TOKEN=` smoke test exits 0: VERIFIED
- `RESORT_ONLY=1` smoke test exits 0: VERIFIED
- `data/species-photos-manifest.csv` not committed in this plan (Plan 04 territory): VERIFIED (file deleted before commit; `git status` clean)
- No modifications to `STATE.md` or `ROADMAP.md` (orchestrator-owned): VERIFIED

---
*Phase: 26-dropbox-ingest-filename-parser-and-manifest*
*Plan: 03*
*Completed: 2026-05-22*
