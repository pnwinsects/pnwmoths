---
phase: 38-ci-gate-full-verification
reviewed: 2026-06-10T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - scripts/check-ts-only.sh
  - scripts/compare-sites.sh
  - .github/workflows/pr-check.yml
  - .github/workflows/deploy.yml
  - package.json
findings:
  critical: 1
  warning: 5
  info: 2
  total: 8
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-06-10
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 38 CI verification gates: two Bash scripts (`check-ts-only.sh`, `compare-sites.sh`), two GitHub Actions workflows (`pr-check.yml`, `deploy.yml`), and `package.json` script wiring.

Positives: actions are pinned to full commit SHAs, workflow `permissions` are scoped minimally (PR check is `contents: read`), the CDN-URL check passes data via a file argument rather than shell interpolation (no injection), and `check-ts-only.sh` correctly accumulates failures into a single `FAIL` flag and exits with it.

The headline defect is a **fail-open verification script**: `compare-sites.sh` uses the `diff … && echo` idiom, which is exempt from `set -e`, so a failing diff is silently swallowed and the script exits 0 — defeating the entire purpose of the byte-identical proof. There are also several gate-coverage gaps: `deploy.yml` runs only `typecheck` and omits the `test`, TS-only-invariant, and parquet-schema gates that `pr-check.yml` enforces; and the TS-only guard does not scan all TypeScript source locations.

## Critical Issues

### CR-01: `compare-sites.sh` is fail-open — failing `diff` does not fail the script

**File:** `scripts/compare-sites.sh:18-19` and `scripts/compare-sites.sh:30`
**Issue:** Both equality checks use the form `diff A B && echo "…identical"`. Because the left side of `&&` is exempt from `set -e`, a failing `diff` (files differ → exit 1) short-circuits the `&&`, the success echo is skipped, and execution continues to the next line. The script then reaches its final `echo "PROOF COMPLETE…"` and exits 0. A verification script that announces "byte-identical" while actually having found differences is worse than no check at all.

Verified empirically:
```
set -e
diff <(echo a) <(echo b) >/dev/null 2>&1 && echo X   # diff fails, no abort
echo "AFTER"                                          # this line runs; script exits 0
```

Only Bucket A's parquet loop (lines 9-17) actually fails closed (explicit `exit 1`). Bucket A's `species-states.json` check (18-19) and Bucket B's HTML tree check (30) both fail open.

**Fix:** Capture the diff result and branch explicitly, e.g.:
```bash
if diff _site/species-states.json _site_baseline/species-states.json; then
  echo "DATA: byte-identical"
else
  echo "FAIL: species-states.json differs"
  exit 1
fi
```
```bash
if diff -r "$TMPDIR/curr/" "$TMPDIR/base/"; then
  echo "HTML: identical modulo content-hash"
else
  echo "FAIL: HTML differs"
  rm -rf "$TMPDIR"
  exit 1
fi
```

## Warnings

### WR-01: `deploy.yml` skips the test, TS-only, and parquet-schema gates that PR check enforces

**File:** `.github/workflows/deploy.yml:24-37`
**Issue:** `pr-check.yml` runs `npm ci → typecheck → test → check-ts-only.sh → build → verify:parquet → validate-links`. `deploy.yml` (triggered on `push: branches: [main]`) runs only `typecheck` before building and deploying — it omits `npm test`, `bash scripts/check-ts-only.sh`, and `npm run verify:parquet`. The phase goal was to wire full verification into CI; deploy is the path that actually ships to production. Any push to `main` that bypasses a PR (admin push, merge-queue edge, force-push, or branch-protection misconfiguration) deploys unverified. The schema gate (`verify:parquet`) is especially important here because a malformed parquet would deploy to GitHub Pages unblocked.

**Fix:** Mirror the gates in the deploy build job before the upload step:
```yaml
      - name: Test
        run: npm test
      - name: TS-only invariant guard
        run: bash scripts/check-ts-only.sh
      - name: Verify Parquet schema
        run: npm run verify:parquet
```
Even if branch protection requires PR checks, deploy should fail closed on its own rather than trusting upstream enforcement.

### WR-02: TS-only guard does not scan all TypeScript source locations

**File:** `scripts/check-ts-only.sh:9,12`
**Issue:** Guard 1 searches only `scripts src/_lib src/_data src/components`. The repo also has TypeScript sources in `src/types/` and root-level configs (`eleventy.config.ts`, `eleventy.config.test.ts`). A stray `.js` in `src/types/` or a regressed root-level `eleventy.config.js` would evade the invariant guard, which is meant to be permanent and exhaustive. (`scripts/lib` is fine — `find scripts` recurses into it.)

**Fix:** Add the missing locations:
```bash
JS_COUNT=$(find scripts src/_lib src/_data src/components src/types -maxdepth 99 -name "*.js" 2>/dev/null \
  | wc -l | tr -d ' ')
# and separately guard root-level configs:
ROOT_JS=$(find . -maxdepth 1 -name "*.config.js" 2>/dev/null)
```
Or scan all of `src/` and `scripts/` with appropriate excludes, rather than an allowlist that drifts as new dirs are added.

### WR-03: Guard does not catch `@ts-expect-error` / `@ts-nocheck`

**File:** `scripts/check-ts-only.sh:24`
**Issue:** Guard 3 blocks `@ts-ignore` but not the equivalent type-safety escape hatches `@ts-expect-error` and `@ts-nocheck`. Since the invariant is "0 type suppressions," a contributor can suppress errors with `@ts-expect-error` and pass the gate. (None exist today, so this is a future-regression gap, not a current bug.)

**Fix:** Broaden the pattern:
```bash
TS_IGNORE=$(grep -rnE "@ts-(ignore|expect-error|nocheck)" scripts/ src/ --include="*.ts" 2>/dev/null || true)
```

### WR-04: `compare-sites.sh` Bucket A is asymmetric and swallows pipe errors

**File:** `scripts/compare-sites.sh:9-12`
**Issue:** The parquet comparison iterates only files found under `_site/species/`. A parquet file present in `_site_baseline/` but absent from `_site/` (a deletion/regression) is never compared and never flagged — the "byte-identical proof" misses removed files. Additionally, the script does not `set -o pipefail`, so a failure inside the `find … | while read` pipeline (e.g., `find` error) is masked by the exit status of the final `wc`/loop stage.

**Fix:** Add `set -euo pipefail` at the top and compare in both directions, or diff the sorted file lists first:
```bash
diff <(cd _site/species && find . -name '*.parquet' | sort) \
     <(cd _site_baseline/species && find . -name '*.parquet' | sort) \
  || { echo "FAIL: parquet file set differs"; exit 1; }
```

### WR-05: Unquoted/unguarded baseline reads produce silent empty diffs

**File:** `scripts/compare-sites.sh:27-28`
**Issue:** In Bucket B, when an HTML file exists in `_site/` but not in `_site_baseline/`, the `perl … "_site_baseline/$rel"` invocation prints an error to stderr and writes an empty file to `$TMPDIR/base/$rel`. The subsequent `diff -r` does catch the mismatch, but only because of the empty file — combined with CR-01's fail-open `&& echo`, the difference is then discarded anyway. The missing-baseline case should be an explicit, loud failure rather than relying on emergent diff behavior. The loop also runs inside a `find | while` pipe without `pipefail`, so a `perl` or `mkdir` failure mid-loop does not abort.

**Fix:** After enabling `pipefail` (WR-04), guard the baseline existence explicitly before transforming, and fail closed if the baseline file is missing:
```bash
[ -f "_site_baseline/$rel" ] || { echo "FAIL: baseline missing $rel"; exit 1; }
```

## Info

### IN-01: `verify:parquet` step does not depend on the preceding build

**File:** `.github/workflows/pr-check.yml:43-45`; `scripts/verify-parquet.ts:14-15`
**Issue:** `verify-parquet.ts` reads `data/parquet/<slug>/records.parquet` (the source dataset), not anything produced by the build into `_site/`. Placing "Verify Parquet schema" after the long build step implies a dependency that does not exist; it could run immediately after `npm ci` for faster fail-fast feedback. Not a correctness defect — just step ordering that costs CI time on a schema failure.
**Fix:** Move the `verify:parquet` step to run before the build (e.g., right after the TS-only guard).

### IN-02: PR-check `build` line duplicates the `build:*` chain instead of reusing `npm run build`
**File:** `.github/workflows/pr-check.yml:43`; `package.json:15`
**Issue:** The CI build step hand-lists `build:data && build:eleventy && … && build:check-weight`, deliberately omitting `build:validate-links` (run separately as the "Check links" step). `package.json`'s `build` aggregate includes `build:validate-links`. The two definitions can drift independently — if a new `build:*` sub-step is added to `package.json` but not to the workflow line, CI silently stops running it.
**Fix:** Consider a `build:ci` script in `package.json` that lists exactly the CI sequence (sans link validation), and have both workflows call `npm run build:ci`, keeping the canonical sequence in one place.

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
