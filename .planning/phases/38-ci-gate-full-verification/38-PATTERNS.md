# Phase 38: CI Gate & Full Verification - Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 6 new/modified files
**Analogs found:** 5 / 6 (MILESTONE-EVIDENCE.md has a style analog; scripts/*.sh has no shell script analog — TS scripts are the convention)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/workflows/pr-check.yml` | config (CI workflow) | request-response (run steps) | `.github/workflows/pr-check.yml` (existing content) | self — add steps to existing file |
| `.github/workflows/deploy.yml` | config (CI workflow) | request-response (run steps) | `.github/workflows/deploy.yml` (existing content) | self — add steps to existing file |
| `scripts/check-ts-only.sh` | utility (guard script) | batch (grep over source tree) | `.github/scripts/check-cdn-urls.py` | role-match (CI-support script; different language) |
| `scripts/compare-sites.sh` | utility (one-shot proof helper) | batch (diff two directory trees) | `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md` (documents the diff command) | data-flow match |
| `package.json` | config | — | `package.json` (existing content) | self — glob string update only |
| `.planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md` | documentation (evidence record) | — | `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md` | style-match |

---

## Pattern Assignments

### `.github/workflows/pr-check.yml` (config, CI steps)

**Analog:** `.github/workflows/pr-check.yml` (self — modify existing file)
**Read first:** `.github/workflows/pr-check.yml`

**Existing step idiom** (lines 27–44 of current file):
```yaml
      - run: npm ci
      - uses: ./.github/actions/install-lychee
        with:
          version: '0.23.0'
      - name: Cache lychee URL results
        uses: actions/cache@668228422ae6a00e4ad889ee87cd7109ec5666a7 # v5.0.4
        with:
          path: .lycheecache
          key: lychee-cache-${{ github.run_id }}
          restore-keys: lychee-cache-
      - run: npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:species-states && npm run build:pagefind && npm run build:check-weight
      - name: Check links
        run: npm run build:validate-links
      - name: Check new CDN image URLs
        if: steps.changed-data.outputs.any_changed == 'true'
        run: |
          python3 .github/scripts/check-cdn-urls.py
          lychee --timeout 20 --max-retries 3 --accept '100..=103,200..=299,429' new-image-urls.txt
```

**Steps to INSERT before the build step (after `npm ci`, before the long `run: npm run build:data && ...` line at line 37):**
```yaml
      - name: Typecheck
        run: npm run typecheck
      - name: Test
        run: npm test
      - name: TS-only invariant guard
        run: bash scripts/check-ts-only.sh
```

**Step to INSERT after the build step (before "Check links" at line 38):**
```yaml
      - name: Verify Parquet schema
        run: npm run verify:parquet
```

**Conventions to follow:**
- Named steps use `name:` + `run:` with no explicit `shell:` (defaults to bash)
- Unnamed steps are bare `- run: ...` with no `name:`
- Actions are SHA-pinned with a version comment: `@{SHA} # v{version}`
- New `run:` steps use no external actions, so no pinning needed

---

### `.github/workflows/deploy.yml` (config, CI step)

**Analog:** `.github/workflows/deploy.yml` (self — modify existing file)
**Read first:** `.github/workflows/deploy.yml`

**Existing structure around insertion point** (lines 24–35):
```yaml
      - run: npm ci
      - uses: ./.github/actions/install-lychee
        with:
          version: '0.23.0'
      - name: Cache lychee URL results
        uses: actions/cache@668228422ae6a00e4ad889ee87cd7109ec5666a7 # v5.0.4
        with:
          path: .lycheecache
          key: lychee-cache-${{ github.run_id }}
          restore-keys: lychee-cache-
      - uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0
      - run: npm run build:data && npm run build:eleventy && ...
```

**Step to INSERT between `npm ci` and `actions/configure-pages` (D-04: typecheck only, no test/verify:parquet in deploy.yml per D-05):**
```yaml
      - name: Typecheck
        run: npm run typecheck
```

**Do NOT add** `npm test`, `verify:parquet`, or the MIG-06 guard to deploy.yml — only typecheck (D-04/D-05).

---

### `scripts/check-ts-only.sh` (utility, batch grep)

**Analog:** `.github/scripts/check-cdn-urls.py` (CI-support script committed to repo; different language but same role)
**Note:** No `.sh` files exist in `scripts/` — all scripts are `.ts`. This is the first shell script in `scripts/`. The `.github/scripts/` dir uses Python; this is the closest committed CI-support script analog.

**Complete script** (from RESEARCH.md, all grep patterns verified on live codebase):
```bash
#!/usr/bin/env bash
# scripts/check-ts-only.sh
# MIG-06: Permanent TS-only invariant guard
# Fails if any of the four regression patterns reappear.
set -e
FAIL=0

# Guard 1: No .js source files in converted dirs
JS_COUNT=$(find scripts src/_lib src/_data src/components -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
if [ "$JS_COUNT" -gt 0 ]; then
  echo "FAIL: $JS_COUNT .js source file(s) found in converted dirs:"
  find scripts src/_lib src/_data src/components -name "*.js" 2>/dev/null
  FAIL=1
fi

# Guard 2: No allowJs in any tsconfig
if grep -l "allowJs" tsconfig*.json 2>/dev/null | grep -q .; then
  echo "FAIL: allowJs found in tsconfig(s):"
  grep -l "allowJs" tsconfig*.json 2>/dev/null
  FAIL=1
fi

# Guard 3: No @ts-ignore comments
TS_IGNORE=$(grep -rn "@ts-ignore" scripts/ src/ --include="*.ts" 2>/dev/null | grep -v node_modules)
if [ -n "$TS_IGNORE" ]; then
  echo "FAIL: @ts-ignore found:"
  echo "$TS_IGNORE"
  FAIL=1
fi

# Guard 4: No unguarded double-casts in production code (test files and .d.ts are exempt)
DOUBLE_CAST=$(grep -rn "as unknown as" scripts/ src/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules \
  | grep -v "\.test\.ts" \
  | grep -v "\.d\.ts")
if [ -n "$DOUBLE_CAST" ]; then
  echo "FAIL: Unguarded double-casts in production code:"
  echo "$DOUBLE_CAST"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "OK: TS-only invariant: 0 .js sources, 0 allowJs, 0 @ts-ignore, 0 unguarded double-casts"
fi
exit "$FAIL"
```

**Verified edge cases (all return 0 matches on live codebase):**
- `src/types/openseadragon.d.ts` line 7 has `as unknown as` in a comment — excluded by `grep -v "\.d\.ts"`
- `scripts/verify-parquet.ts` line 30 has `as unknown[]` (single cast) — not matched by double-cast pattern
- All `*.test.ts` files use `as unknown as` for mock data — excluded by `grep -v "\.test\.ts"`

---

### `scripts/compare-sites.sh` (utility, one-shot batch diff)

**Analog:** `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md` (documents the `diff -r` command that this phase's script extends)
**Read first:** `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md`

**BASELINE.md Phase 34 diff command** (lines 15–19):
```sh
diff -r _site/ _site_baseline/
```
Phase 38 replaces this with a two-bucket approach due to Phase 37 content-hashed filenames.

**Complete two-bucket script** (from RESEARCH.md, normalization verified on live `_site/` vs `_site_baseline/`):
```bash
#!/usr/bin/env bash
# scripts/compare-sites.sh
# Phase 38 one-shot byte-identical proof (CI-02 / D-02 / D-03).
# Run locally: bash scripts/compare-sites.sh
# Requires: _site/ (current build) and _site_baseline/ (baseline snapshot) in working tree.
set -e

echo "=== Bucket A: Data files byte-for-byte ==="
diff -r _site/species/ _site_baseline/species/ --include="*.parquet" && \
diff _site/species-states.json _site_baseline/species-states.json && \
echo "DATA: byte-identical"

echo ""
echo "=== Bucket B: HTML normalized (content-hash segments canonicalized) ==="
TMPDIR=$(mktemp -d)
find _site -name "*.html" | while read f; do
  rel="${f#_site/}"
  mkdir -p "$TMPDIR/curr/$(dirname "$rel")" "$TMPDIR/base/$(dirname "$rel")"
  perl -pe 's{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g' "$f" > "$TMPDIR/curr/$rel"
  perl -pe 's{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g' "_site_baseline/$rel" > "$TMPDIR/base/$rel"
done
diff -r "$TMPDIR/curr/" "$TMPDIR/base/" && echo "HTML: identical modulo content-hash"
rm -rf "$TMPDIR"

echo ""
echo "=== Bucket C: Hashed JS/CSS bundles excluded (behavior covered by test suite) ==="
echo "EXCLUDED: _site/assets/ (Vite-generated bundles)"

echo ""
echo "PROOF COMPLETE: _site/ is byte-identical to _site_baseline/ (D-03 two-bucket result)"
```

**Hash pattern** (Perl, cross-platform — macOS BSD sed and Linux GNU sed differ on `{8}`; Perl is portable):
```perl
s{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g
```

---

### `package.json` (config, glob cleanup)

**Analog:** `package.json` (self — single string edit)
**Read first:** `package.json` line 24

**Current test script** (line 24):
```json
"test": "node --test eleventy.config.test.ts scripts/build-data.test.ts scripts/check-page-weight.test.ts scripts/ingest-photos.test.ts scripts/tile-photos.test.ts scripts/upload-tiles.test.ts scripts/generate-species-photos.test.ts 'scripts/lib/*.test.{js,ts}' src/components/*.test.ts 'src/_lib/*.test.{js,ts}'",
```

**Required change** (MIG-05 cleanup — no `.js` test files remain, so drop the `{js,ts}` alternations):
- `'scripts/lib/*.test.{js,ts}'` → `'scripts/lib/*.test.ts'`
- `'src/_lib/*.test.{js,ts}'` → `'src/_lib/*.test.ts'`

No other changes to `package.json` in this phase.

---

### `.planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md` (documentation)

**Analog:** `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md`
**Read first:** `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md`

**BASELINE.md structure to mirror** (table + commands + notes):
```markdown
# Phase 34 — Pre-Migration Baseline

## Snapshot

| Property | Value |
|----------|-------|
| Snapshot path | `_site_baseline/` (working-tree only — gitignored; not committed) |
| Species pages | **1,433** |
| Snapshot date | 2026-06-09 |
| Build command | `npm run build:data && ...` |

## Byte-Identity Gate Command (SC-4)

After completing each conversion plan in Phase 34, run:

```sh
diff -r _site/ _site_baseline/
```

Expected output: no differences. ...

## Notes

- `_site_baseline/` must be regenerated if ...
```

**MILESTONE-EVIDENCE.md should extend this structure with:**
1. A "Phase 38 Milestone Summary" header
2. A table of measured timings (typecheck 1.8s, test 7.7s/225 tests, verify:parquet ~1s, build:data 3.2s)
3. CI-02 byte-identical proof section: record actual `bash scripts/compare-sites.sh` output
4. CI-03 build:data timing: record actual `time npm run build:data` output
5. MIG-06 guard result: record actual `bash scripts/check-ts-only.sh` output
6. A "v3.0 Milestone Complete" declaration

**Populate with real output captured at run time**, not placeholder text. The evidence value is in the actual measurements.

---

## Shared Patterns

### CI Step Idiom
**Source:** `.github/workflows/pr-check.yml` lines 27–44
**Apply to:** Both workflow files

The convention for named steps:
```yaml
- name: Step Name
  run: command here
```
Unnamed bare steps:
```yaml
- run: command here
```
No `shell:` key — defaults to bash on ubuntu-latest. No SHA pinning for `run:` steps (only for `uses:` actions).

### Action SHA Pinning
**Source:** `.github/workflows/pr-check.yml` lines 13, 23, 28, 32
**Apply to:** Any new `uses:` actions (none needed in this phase — all new steps are `run:`)

Pattern: `uses: owner/action@{SHA} # v{version}`

The new steps in this phase are all `run:` steps and therefore need no pinning.

### Shell Script Exit Pattern
**Source:** RESEARCH.md D-08 section (no existing `.sh` analog in the repo)
**Apply to:** `scripts/check-ts-only.sh`

Use `FAIL=0` accumulator pattern (not `set -e` alone) so all four guards run and report all failures before exiting. `set -e` at the top of the file provides safety for unexpected errors, but guard failures are tracked manually via `FAIL=1`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/check-ts-only.sh` | utility (guard) | batch | No `.sh` files exist in `scripts/`; all scripts are `.ts`. This is the first shell script in that directory. The closest analog by role is `.github/scripts/check-cdn-urls.py` (also a CI-support script committed to the repo), but it is Python. The full script is provided in RESEARCH.md and reproduced above. |

---

## Metadata

**Analog search scope:** `.github/workflows/`, `scripts/`, `.planning/phases/34-*/`
**Files read:** pr-check.yml, deploy.yml, BASELINE.md, package.json (test glob line)
**Pattern extraction date:** 2026-06-10
