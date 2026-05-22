---
phase: 26-dropbox-ingest-filename-parser-and-manifest
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - scripts/lib/parse-photo-filename.js
  - scripts/lib/parse-photo-filename.test.js
  - scripts/lib/dropbox-list.js
  - scripts/lib/manifest.js
  - scripts/lib/manifest.test.js
  - scripts/ingest-photos.js
  - package.json
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-05-22
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 26 implements a metadata-only Dropbox ingest CLI with a pure-function filename parser and a 13-column manifest writer. The four critical security/correctness surfaces called out in the review brief are each addressed:

- **DROPBOX_TOKEN redaction** — `redact()` is applied to every retry log, every per-file error row's `last_error`, every fatal-page error, and the top-level catch. Empty-token guard correctly prevents `new RegExp('', 'g')` corruption.
- **CSV injection** — `csv-stringify` is the auto-quoting library; the round-trip test in `manifest.test.js:99-116` deliberately embeds comma, double-quote, and newline in three fields to lock the contract.
- **Retry-with-backoff cap** — 5 attempts at 2/4/8/16/32s, then re-thrown as a redacted `Error`. The fatal-page catch in `main()` (lines 430-435) records partial work to the manifest before exiting; per-file errors mark `status=failed` without crashing.
- **Resumability via content_hash** — existing manifest rows are loaded and their content_hashes pre-populate `seen`, skipping already-discovered files.

All 36 existing tests pass. The findings below cluster on (a) non-atomic manifest write breaking the OPS-03 invariant that the manifest IS the recovery state, (b) `redact()` not escaping regex metacharacters (a known cross-repo pattern that over-redacts when the token contains `.`), (c) `withRetry` retrying permanent 4xx errors, and (d) a small handful of resumability edge-cases when `entry.content_hash` is absent.

## Structural Findings (fallow)

No structural pre-pass was provided for this review; this section is intentionally empty.

## Warnings

### WR-01: Non-atomic manifest write violates OPS-03 recovery-state invariant

**File:** `scripts/lib/manifest.js:94-95`
**Issue:** `writeManifest` calls `writeFile(path, csv)` directly, which truncates the existing file and then writes the new content. If the process is killed mid-write (SIGKILL, OOM, host reboot — exactly the scenarios D-15 retry/backoff is designed to survive), the manifest is left truncated. Because OPS-03 designates the manifest as the recovery state (re-runs read it back to populate the `seen` Set), a partial write loses prior curatorial state from in-flight Phase 27 edits, or worse, parses as an empty/short CSV and re-discovers everything from Dropbox on next run. The phase brief explicitly calls out "must never crash, mark status=failed with redacted last_error" — silent manifest truncation defeats that guarantee on the recovery side.
**Fix:** Write to a sibling temp file then rename atomically (POSIX rename is atomic within a filesystem):
```js
import { rename } from 'node:fs/promises';
export async function writeManifest(path, rows) {
  const csv = stringify(rows, { header: true, columns: COLUMNS });
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, csv);
  await rename(tmpPath, path);
}
```

### WR-02: `redact()` does not escape regex metacharacters — token-shaped substrings over-redact

**File:** `scripts/ingest-photos.js:69-73`
**Issue:** `new RegExp(DROPBOX_TOKEN, 'g')` interprets every `.` in the token as the "any character" wildcard. Dropbox short-lived OAuth tokens use the shape `sl.u.AAAA…` — the dots become wildcards, so the regex also matches `sl_u_AAAA…`, `sl0u1AAAA…`, etc. That has two consequences: (1) other text in an error message that happens to resemble the token pattern is incorrectly stripped to `[REDACTED]`, hindering debugging; (2) the same pattern in `scripts/upload-plates.js:112` (the documented in-repo precedent) has the same defect, so propagating it locks the bug in. Strictly a quality issue (the actual token is still redacted), but the brief explicitly required correct redaction on every error path. Worth fixing in both files.
**Fix:** Use `String.prototype.replaceAll` with a literal string (no regex compilation), or escape metacharacters explicitly:
```js
function redact(msg) {
  return DROPBOX_TOKEN ? String(msg).replaceAll(DROPBOX_TOKEN, '[REDACTED]') : String(msg);
}
```
This also coerces non-string inputs (Errors with non-string `.message`, etc.) safely.

### WR-03: `withRetry` retries permanent (non-transient) errors, wasting 62 s on auth failures

**File:** `scripts/ingest-photos.js:84-101`
**Issue:** The retry loop catches *every* thrown error from `fn()` and retries 4 more times before giving up. A 401 Unauthorized (expired/invalid `DROPBOX_TOKEN`), 400 (malformed body), or 403 (insufficient scope) is permanent — the next attempt will produce the identical error. The current behavior burns 2+4+8+16 = 30 s on the first retry sequence, then ~32 s on the final, for ~62 s of wasted clock time before the human-visible failure. It also obscures the root cause: the user sees five identical `transient error on list_folder page 1` log lines before the final throw. Per D-15 the backoff schedule is intended for *transient* errors only.
**Fix:** Inspect the error before retrying. `dbxCall` throws with the shape `${endpoint} → ${status}: ${text}` (line 49 of `dropbox-list.js`), so parse the status:
```js
} catch (err) {
  const safeMsg = redact(err.message ?? String(err));
  const statusMatch = /→ (\d{3}):/.exec(safeMsg);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : null;
  // 4xx are permanent — fail fast. 429 (rate limit) and 5xx are transient.
  if (status && status >= 400 && status < 500 && status !== 429) {
    throw new Error(`${label} permanent error: ${safeMsg}`);
  }
  if (attempt === delays.length - 1) { /* … existing final-throw branch … */ }
  // … existing retry log + sleep …
}
```

### WR-04: `seen.add(entry.content_hash)` runs unguarded for non-image branch when content_hash is absent

**File:** `scripts/ingest-photos.js:366` (vs. guarded version at 425)
**Issue:** The per-file catch handler at line 425 wisely guards `if (entry.content_hash) seen.add(entry.content_hash)` — but the non-image branch at line 366 unconditionally calls `seen.add(entry.content_hash)`. If Dropbox ever returns a file entry without `content_hash` (the API spec marks it optional in some edge cases; spike audit observed 100% present but the parser brief stresses "must never crash"), the Set picks up `undefined`. The subsequent `seen.has(entry.content_hash)` check on the next undefined-hash entry would then return true, causing the second file to be skipped without a manifest row at all — silent data loss. The clean-classify branch at line 402 has the same unguarded `seen.add`.
**Fix:** Mirror the catch-handler pattern in both unguarded branches:
```js
if (entry.content_hash) seen.add(entry.content_hash);
```
Or, more robustly, treat missing `content_hash` as a per-file error (push a row with `status: 'failed', last_error: 'missing content_hash'`) and continue.

### WR-05: `loadSpecies` silently tolerates missing `genus`/`species` CSV columns

**File:** `scripts/ingest-photos.js:127-144`
**Issue:** If `data/species.csv` is regenerated with renamed columns (column rename is a documented v2.x churn area), `r.genus` and `r.species` are both `undefined` for every row, the `(... || '').trim()` defaults to empty string, the `if (!genus || !species) continue` filter discards every record, and `loadSpecies` returns three empty Maps/Sets with **zero log output**. Downstream every filename would be classified as `likely-synonym`, the entire manifest would be polluted, and the only clue would be the post-summary "per-bucket distribution" line. The startup log at line 309 reports the count (`loaded N species records`) so a zero would be detectable — but a curator running the script may not notice that "loaded 0 species records" implies a column-schema break.
**Fix:** Assert column presence at parse time:
```js
const records = parse(raw, { columns: true, skip_empty_lines: true });
if (records.length === 0 || !('genus' in records[0]) || !('species' in records[0])) {
  throw new Error(`loadSpecies: ${csvPath} is missing required columns 'genus' and 'species'`);
}
```

## Info

### IN-01: Hardcoded shared-link URL with rlkey baked into source

**File:** `scripts/ingest-photos.js:40-41`
**Issue:** The fallback `DROPBOX_SHARE_URL` literal contains the `rlkey` and `st` parameters of the v2.2 shared link. The `rlkey` is part of the shared-link access control (anyone with the URL + a Dropbox account that has accepted the share can list the folder); it is documented in `26-PATTERNS.md:63` as an intentional fallback so operators don't have to remember it. Acceptable per the design decision in `26-03-PLAN.md:27`, but worth flagging because (a) any future rotation of the share requires a code change + commit, not a config flip, and (b) if the share is ever re-issued with a password the literal becomes a stale credential left in git history.
**Fix:** Either accept as-is (current design) or move to a non-committed config file (`scripts/.env` or `.env.local`) and require explicit override. No code change required unless the policy changes.

### IN-02: `listSharedFolder` async generator in `dropbox-list.js` is unused; `ingest-photos.js` inlines its own paginator

**File:** `scripts/lib/dropbox-list.js:68-96` (export); `scripts/ingest-photos.js:237-261` (inline duplicate)
**Issue:** The library's `listSharedFolder` generator is exported but never imported anywhere in the repo. `ingest-photos.js` re-implements the same pagination loop inline (`listSharedFolderWithRetry`) because the retry wrapping happens at the call site (per `26-PATTERNS.md`). The duplication is intentional per the comment at `ingest-photos.js:216-223`, and the docstring on `listSharedFolder` says it's for Phase 28/29 reuse, so this is reserved-for-future-use, not dead code today. Still, the two paginators must stay in lock-step (e.g., the `limit: 2000` and `include_*` flags appear in both `dropbox-list.js:80-86` and `ingest-photos.js:225-235`). If Dropbox API parameters need to change, both must be updated.
**Fix:** Either (a) extract the body shape into an exported constant in `dropbox-list.js` and import it into `ingest-photos.js`, so the listing parameters live in one place; or (b) refactor `listSharedFolder` to accept a `dbxCall` injection (or a wrapped variant) so the retry policy can be supplied by the caller without duplicating pagination. Defer until Phase 28 actually consumes the library.

### IN-03: `// Unreachable` comment after the `withRetry` loop is dead code documentation

**File:** `scripts/ingest-photos.js:100`
**Issue:** The line `// Unreachable — the loop either returns from fn() or throws on the final attempt.` is helpful in conveying intent, but it has no statement after it. Falling off the end of an `async function` returns `undefined`, which would propagate as a successful "no value" resolution to the caller — and `for await (const entry of listSharedFolderWithRetry(...))` would treat that as the call having succeeded with `undefined`, causing a `TypeError: Cannot destructure property 'entries' of 'undefined'` two frames later. If a future refactor changes the loop bounds (e.g., `attempt <= delays.length - 1` becomes `attempt < delays.length`), this could become reachable.
**Fix:** Add a defensive throw to lock the invariant:
```js
throw new Error(`${label} failed: withRetry exhausted without throwing (unreachable)`);
```

### IN-04: `binomial_raw` column name is semantically inconsistent with its content

**File:** `scripts/ingest-photos.js:392`; `scripts/lib/manifest.js:43`
**Issue:** The D-05 column `binomial_raw` is populated with `parsed.binomial ?? ''` (line 392) — but `parsed.binomial` is the parser's **already-normalized lowercased** binomial (e.g., `abagrotis apposita`, not `Abagrotis apposita` as it appeared in the filename). The name `_raw` suggests "untouched substring as it appears in the filename"; the field is actually `binomial_parsed` (post-lowercasing). The skill reference at `.claude/skills/spike-findings-pnwmoths/references/dropbox-ingest-and-filename-parsing.md:117` defines it as "what the parser extracted", which matches the implementation. Worth a docstring clarification in `manifest.js` `COLUMNS` so Phase 27 curators don't assume it's a literal filename slice.
**Fix:** Add a comment to the `COLUMNS` array entry, or rename to `binomial_parsed`. Renaming would invalidate the existing test contract and isn't urgent.

### IN-05: Stage-failure log goes to stdout instead of stderr

**File:** `scripts/ingest-photos.js:427` (`logStage` for failed classify)
**Issue:** `logStage` writes to stdout via `console.log` (line 112-114), so the per-file `failed` outcome and its `safeMsg` last_error end up interleaved with normal `discovered` events on stdout. The fatal-page error at line 434 correctly uses `console.error`. For tmux tail-following this is intentional (per the comment at 26-PATTERNS.md "OPS-01 tail-friendly"). But operators piping stdout to a log file and stderr to the terminal will lose the visibility of per-file errors on the terminal. Stream choice is a documented project pattern; flagging for awareness only.
**Fix:** If the project wants stderr-on-failure semantics, branch in `logStage`:
```js
const stream = String(outcome).includes('failed') ? console.error : console.log;
stream(`${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`);
```

### IN-06: Pre-existing rows passed through `sortForInvestigation` without status-preservation guarantee

**File:** `scripts/ingest-photos.js:315, 438`
**Issue:** Resumability copies `[...existing]` into `rows`, appends new entries, then sorts. Phase 27 will edit existing rows (e.g., promote a `provisional` to `clean-match` after curator review). After re-running ingest, those curator-edited rows are passed through `sortForInvestigation` unchanged — but their `match_bucket` value now controls their position in the sorted output, possibly moving them away from the top of the file even though the curator may want stable line numbers for spreadsheet reference. Not a bug today (Phase 27 isn't shipped), but Phase 27's contract needs to be explicit about whether resorting is acceptable on every re-run, or whether the manifest sort order should freeze after the first curator pass. Worth a TODO comment.
**Fix:** Add a TODO at `main()` line 438 noting that Phase 27 must confirm whether `sortForInvestigation` is safe to run on a partially-curated manifest, or whether re-runs after curation should preserve current row order.

## Narrative Findings (AI reviewer)

The five warnings and six info items above were surfaced by direct line-by-line read of the seven source files plus exercise of `extractBinomial` against the published edge cases in `26-PATTERNS.md`. No structural pre-pass was supplied with the review prompt, so all findings are narrative. The parser correctly implements the three D-14 fixes (verified by both the unit-test table and by manual exercise of inputs `Sympistis perscripta-A-D.tif`, `Plataea sp.-A-D.tif`, `Genus species-SP_001-D.tif`, `Genus SP-A-D.tif` — the last of which correctly routes to provisional because the binomial-portion tokenizes to `Genus sp`). The CSV-injection mitigation is correctly delegated to `csv-stringify` and locked in by the round-trip test.

---

_Reviewed: 2026-05-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
