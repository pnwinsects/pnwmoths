---
phase: 35-build-pipeline-scripts-migration
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - scripts/verify-parquet.ts
  - scripts/build-data.ts
  - scripts/build-data.test.ts
  - scripts/copy-parquet.ts
  - scripts/copy-images.ts
  - scripts/emit-species-states.ts
  - scripts/check-page-weight.ts
  - scripts/check-page-weight.test.ts
  - scripts/ingest-photos.ts
  - scripts/ingest-photos.test.ts
  - scripts/tile-photos.ts
  - scripts/tile-photos.test.ts
  - scripts/upload-tiles.ts
  - scripts/upload-tiles.test.ts
  - scripts/generate-species-photos.ts
  - scripts/generate-species-photos.test.ts
  - scripts/lib/parse-photo-filename.ts
  - src/_data/taxon.d.ts
  - package.json
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-06-09
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

This is a JS→TypeScript migration of the build-side producer scripts. The
type-only conversion is generally clean: no `as unknown as` double-casts, no
`@ts-ignore`, boundary guards (`isSpeciesCsvRow`, `isManifestRow`,
`isDropboxListPage`) genuinely validate the fields they claim, and the
`MatchBucket` / `View` unions are used as intended. The SQL interpolation in
`build-data.ts` is adequately guarded against path traversal and injection by
`validateSlugComponent` (the slug charset `[a-zA-Z0-9 -]` excludes the single
quote, so the `COPY TO` / `read_parquet` interpolations cannot break out of the
string literal). The `SCHEMA-04` column-comparison check and the
`verify-parquet.ts` ArrayBuffer-pool slice fix are correct.

The one serious problem is in the **secret-redaction helper shared by four
scripts**: it builds a `RegExp` directly from the raw secret without escaping
regex metacharacters. This both can fail to redact (security) and can throw
inside the very catch handler meant to sanitize errors (correctness). Several
lower-severity robustness and dead-code issues follow.

## Critical Issues

### CR-01: `redact()` builds a RegExp from an unescaped secret — fails to redact and can crash the error handler

**Files:**
- `scripts/ingest-photos.ts:135-139`
- `scripts/tile-photos.ts:91-95`
- `scripts/upload-tiles.ts:73-77`
- `scripts/generate-species-photos.ts:69-73`

**Issue:** Every `redact()` implementation does
`msg.replace(new RegExp(SECRET, 'g'), '[REDACTED]')` where `SECRET` is the raw
value of `DROPBOX_TOKEN` / `BUNNY_API_KEY`. The token is treated as a regex
*pattern*, not a literal string. Two distinct failures result:

1. **Silent redaction failure (security).** If the secret contains regex
   metacharacters (`.`, `(`, `)`, `[`, `]`, `*`, `+`, `?`, `|`, `\`, `^`, `$`),
   the pattern no longer matches the literal token. Dropbox short-lived tokens
   begin with `sl.` and contain `.`; a `.` matches any character, so the *exact*
   token text may not be matched the way the dot-containing portions appear,
   and any token containing `[`/`(`/`*` etc. simply will not be redacted. The
   secret then leaks verbatim into logs / thrown errors — defeating the entire
   purpose of the helper (T-26.03-01).

2. **Crash inside the catch handler (correctness).** If the secret contains an
   unbalanced `[`, `(`, or a trailing `\`, `new RegExp(SECRET, 'g')` throws a
   `SyntaxError`. Because `redact()` is called from inside `catch` blocks and
   from the top-level `main().catch(...)`, the throw replaces the original
   (already-failed) error with a confusing regex SyntaxError and, in the
   `withRetry` path, can abort the retry loop. The original error message — which
   may itself contain the secret — is then surfaced un-redacted by the outer
   handler.

The empty-token guard added in each file only handles `SECRET === ''`; it does
nothing for metacharacter-bearing tokens.

**Fix:** Escape the secret before constructing the RegExp (or use a literal
`split`/`join` replace which needs no regex):

```ts
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redact(msg: string): string {
  let out = msg;
  if (DROPBOX_TOKEN) out = out.split(DROPBOX_TOKEN).join('[REDACTED]');
  if (BUNNY_API_KEY) out = out.split(BUNNY_API_KEY).join('[REDACTED]');
  return out;
}
```

`split`/`join` is preferable here: it is literal by construction, needs no
escaping, and cannot throw. Apply the same fix to all four files (extract a
shared helper if the redaction idiom is meant to be project-wide).

## Warnings

### WR-01: `verify-parquet.ts` crashes the whole scan on a missing dir or a non-directory entry

**File:** `scripts/verify-parquet.ts:15-21`

**Issue:** `readdirSync(PARQUET_DIR)` throws (uncaught, no top-level handler) if
`data/parquet` does not exist — e.g. when `verify:parquet` is run before
`build:data`. Worse, the loop blindly builds `${slug}/records.parquet` for
*every* entry returned, including any stray non-directory file. The first
`readFileSync` on a path that isn't `…/records.parquet` throws `ENOENT`/`EISDIR`
and aborts the entire validation run — contradicting the script's D-04 design
goal of "scan-all-then-summarize, never fail-fast mid-scan."

**Fix:** Guard the directory and skip entries lacking a `records.parquet`:

```ts
if (!existsSync(PARQUET_DIR)) {
  process.stderr.write(`FAIL: ${PARQUET_DIR} does not exist — run build:data first\n`);
  process.exit(1);
}
const species = readdirSync(PARQUET_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();
// inside the loop:
if (!existsSync(filePath)) { /* record as a failure, continue */ }
```

### WR-02: Per-file read errors in `verify-parquet.ts` abort the scan instead of being recorded

**File:** `scripts/verify-parquet.ts:19-42`

**Issue:** A corrupt/unreadable Parquet file (or a hyparquet parse error)
throws out of the `for` loop and terminates the process with an unredacted stack
trace, again violating the scan-all-then-summarize contract (D-04/D-05). Only
Zod validation failures are collected into `failures`; I/O and decode failures
are not.

**Fix:** Wrap the read + `parquetReadObjects` per slug in try/catch and push a
`FailureSummary` (e.g. `row: -1`, `issues: 'read/parse error: …'`) so one bad
file does not hide the status of the remaining species.

### WR-03: `tile-photos.ts` can advance a row to `tiled` with no thumbnail, producing a silently incomplete upload

**File:** `scripts/tile-photos.ts:181-183, 381-388`

**Issue:** `isAlreadyTiled()` checks only for `{prefix}.dzi`. In the main tiling
loop, `runVipsDzsave` (writes `.dzi`) runs before `runVipsThumbnail`. If a prior
run crashed between those two calls, the `.dzi` exists but the
`_thumbnail.webp` does not. On rerun, `isAlreadyTiled` returns true, the row is
advanced to `status=tiled` without ever generating the thumbnail, and
`upload-tiles.ts` then skips the thumbnail upload via its `existsSync`
guard (`upload-tiles.ts:338`). The thumbnail is silently absent on the CDN.
THUMBNAIL_ONLY mode exists to backfill this, but nothing flags that a backfill
is needed.

**Fix:** Make the disk-level idempotency guard require both artifacts, e.g.
`existsSync(\`${prefix}.dzi\`) && existsSync(\`${prefix}_thumbnail.webp\`)`, or
have the already-on-disk branch verify/regenerate the thumbnail before
advancing to `tiled`.

### WR-04: `tile-photos.ts` main loop generates a thumbnail it never uploads or cleans up

**File:** `scripts/tile-photos.ts:419-421`

**Issue:** The main (non-THUMBNAIL_ONLY) loop calls `runVipsThumbnail` to write
`{prefix}_thumbnail.webp`, then `unlink(cachePath)` removes only the source
TIFF. The thumbnail is left on disk for `upload-tiles.ts` to pick up. That is
the intended hand-off, but if `runVipsDzsave` succeeds and `runVipsThumbnail`
throws, the catch block marks the row `failed` while the `.dzi` and `_files/`
already exist on disk — so a subsequent run hits `isAlreadyTiled` (WR-03) and
advances the *failed* row to `tiled`, masking the failure. The interaction of
the two-artifact write with the single-artifact idempotency check is fragile.

**Fix:** Generate the thumbnail before invoking `dzsave`, or treat thumbnail
failure as non-fatal-but-tracked, so a row is never both "failed" and
"has a `.dzi` on disk."

### WR-05: `BUNNY_API_KEY` is hardcoded to `''` in `generate-species-photos.ts`, making `redact()` permanently inert

**File:** `scripts/generate-species-photos.ts:32, 69-73`

**Issue:** `const BUNNY_API_KEY: string = '';` is a literal empty string, so
`redact()` always returns its input unchanged. The function, its doc-comment
claiming it "mirrors the project-wide secret-redaction idiom," and the
`BUNNY_API_KEY` constant are effectively dead code. This script does not touch
any secret (it only reads the manifest and writes JSON), so redaction is not
needed — but shipping a redact() that *looks* protective yet never redacts is
misleading and will be copied forward. (Note: even if a key were wired in, it
would still carry the CR-01 metacharacter bug.)

**Fix:** Remove `BUNNY_API_KEY` and `redact()` from this file and replace the
`main().catch` redact call with a plain `(err as Error).message`; or, if a
secret is expected to exist, read it from `process.env` and apply the CR-01 fix.

## Info

### IN-01: `isMaterializable` carries a no-op type annotation purely as documentation

**File:** `scripts/generate-species-photos.ts:85-90`

**Issue:** `const _mb: MatchBucket | string = row.match_bucket; void _mb;`
exists only to "document the union expectation." Since the type is widened to
`MatchBucket | string` it provides no compile-time guarantee (any string
satisfies it) and adds noise. The actual filter is `row.status === 'uploaded'`.

**Fix:** Delete the `_mb` lines; rely on a comment if the intent must be noted.

### IN-02: `copy-parquet.ts` / `copy-images.ts` have no top-level error handling

**Files:** `scripts/copy-parquet.ts:14`, `scripts/copy-images.ts:20-42`

**Issue:** These top-level-await scripts let any `cp`/`copyFile` rejection
surface as an unhandled promise rejection with a raw stack trace. They are
build steps invoked from the `build` npm chain, so a missing source dir aborts
the build with a less actionable message than the sibling scripts
(which emit `[prefix] ERROR: …`). Not a correctness defect, but inconsistent
with the project's operator-friendly error convention.

**Fix:** Optionally wrap each in a try/catch that prints a prefixed message and
`process.exit(1)`, matching `check-page-weight.ts`'s pattern.

### IN-03: `withRetry` "unreachable" final throw is genuinely dead but relies on a non-empty `delays` array

**Files:** `scripts/ingest-photos.ts:166-167`, `scripts/tile-photos.ts:127-128`,
`scripts/upload-tiles.ts:103-104`

**Issue:** The trailing `throw new Error(\`${label}: unreachable\`)` is dead code
given the hardcoded 5-element `delays` array, which is fine. It is only reachable
if `delays` were ever emptied — worth a one-line comment or a
`if (delays.length === 0) throw` precondition so a future edit to the schedule
cannot silently turn the loop into a no-op that returns `undefined`.

**Fix:** Leave as-is, or assert `delays.length > 0` at function entry.

---

_Reviewed: 2026-06-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
