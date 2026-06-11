# Phase 38: CI Gate & Full Verification — Research

**Researched:** 2026-06-10
**Domain:** GitHub Actions CI wiring, content-hash normalization, grep-based TS invariant guard
**Confidence:** HIGH (all key claims verified against live codebase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Byte-identical check is a one-shot milestone proof, NOT a recurring CI step. SC-3 is satisfied by a recorded local proof, not a workflow step.
- **D-02:** Run comparison locally using the gitignored `_site_baseline/` snapshot + `diff`. Capture result in a committed milestone-evidence doc mirroring BASELINE.md style.
- **D-03:** Two-bucket comparison: build-generated data files (Parquet/JSON) byte-for-byte; rendered HTML compared after normalizing content-hash segments in both trees. Hashed JS/CSS bundles themselves excluded.
- **D-04:** `npm run typecheck` is a blocking gate in BOTH `pr-check.yml` and `deploy.yml`.
- **D-05:** `npm test` (full suite) is a blocking gate in `pr-check.yml` only.
- **D-06:** `npm run verify:parquet` is a blocking gate in `pr-check.yml`. Budget-fit must be confirmed.
- **D-07:** Observe `build:data` timing once and record the measured number. No hard-failing timer assertion.
- **D-08:** Write a permanent grep-based guard script wired into `pr-check.yml` enforcing four invariants: zero `.js` source in converted dirs, zero `allowJs`, zero `@ts-ignore`, zero unguarded `as unknown as T` double-casts.

### Claude's Discretion

- Exact normalization mechanism for D-03 (this research resolves it — see D-03 findings below)
- Exact form of the D-08 guard script (inline shell vs committed `scripts/`) and its grep patterns (this research resolves it)
- Step ordering within workflows and whether gates share the build step or run as discrete steps
- Format/location of milestone-evidence docs for D-02 and D-07

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-05 | All test files converted to `.ts`; full suite runs via `node --test` with no additional loader | Confirmed: 225 tests pass in 7.7s under Node 24.15.0 bare `node --test`; test glob still has `{js,ts}` patterns to clean up |
| MIG-06 | Zero `allowJs`, zero `@ts-ignore`, zero unguarded double-casts, zero `.js` sources in converted areas | All four invariants verified clean against live tree; D-08 grep patterns tested and confirmed |
| CI-01 | `tsc --noEmit` as gate in `pr-check.yml` and `deploy.yml` | Workflow insertion points identified; typecheck runs in 1.8s |
| CI-02 | Byte-identical `_site/` proof (one-shot, local per D-01) | Full diff taxonomy mapped; normalization mechanism confirmed working |
| CI-03 | `build:data` under 60s; total CI under 5 min | `build:data` measured at 3.2s locally; all new gates combined add ~11s |

</phase_requirements>

---

## Summary

Phase 38 is a pure wiring phase: all verification logic already exists (`npm run typecheck`, `npm test`, `npm run verify:parquet`), `_site_baseline/` is present in the working tree, and the live codebase passes every invariant. The work is: (1) add three CI steps to the two workflow YAMLs; (2) write and commit the D-08 guard script; (3) write a normalization helper and run the one-shot byte-identical proof locally; (4) commit milestone-evidence docs.

The hardest technical question — D-03 content-hash normalization — is resolved: all 1,537 differing HTML files differ by exactly one pattern (`-[A-Za-z0-9_-]{8}\.(js|css|png)` in asset path references), and a Perl one-liner normalizes both sides to identical output. Zero Parquet/JSON files differ between `_site/` and `_site_baseline/`. Zero non-HTML non-asset static files differ. The diff is structurally clean.

The D-06 budget concern is not a concern: `verify:parquet` runs in under 1 second against 1,453 species (92,648 rows). All new gates together add approximately 11 seconds to a workflow whose build phase dominates. The under-5-minute budget is safe.

**Primary recommendation:** Wire the three CI steps into the existing workflow YAML idiom (named `run:` steps after `npm ci`, ordering typecheck/test/guard before build, verify:parquet after build); commit the D-08 guard as `scripts/check-ts-only.sh`; run the normalized two-bucket local diff, record results in a committed evidence doc.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TypeScript type checking (CI-01) | Build toolchain | — | `tsc --noEmit` runs in Node; no build output needed |
| Test suite (MIG-05) | Build toolchain | — | `node --test` runs source directly via type-stripping; no build output needed |
| TS invariant guard (MIG-06) | Build toolchain | — | Pure `grep`/`find` on source tree; no build output needed |
| Parquet validation (SCHEMA-07/D-06) | Build toolchain | Data pipeline | Reads `data/parquet/` produced by `build:data`; must run after build |
| Byte-identical proof (CI-02/D-01) | Local working tree | — | Deliberately not a CI step; compares `_site/` vs `_site_baseline/` locally |

---

## Standard Stack

No new packages are installed in this phase. All verification commands already exist in `package.json`. The only new artifacts are YAML step additions and a committed shell script.

| Command | Where used | Runtime (measured) |
|---------|-----------|---------------------|
| `npm run typecheck` | pr-check.yml, deploy.yml | 1.8s [VERIFIED: live measurement] |
| `npm test` | pr-check.yml | 7.7s, 225 tests [VERIFIED: live measurement] |
| `npm run verify:parquet` | pr-check.yml | ~1.0s, 1453 species [VERIFIED: live measurement] |
| `npm run build:data` | pr-check.yml (already present) | 3.2s [VERIFIED: live measurement] |

## Package Legitimacy Audit

No packages installed in this phase — section N/A.

---

## Architecture Patterns

### Workflow Step Ordering

The correct insertion order for `pr-check.yml` (verified against existing step structure):

```
npm ci
[EXISTING] build step chain (build:data && build:eleventy && ...)
[NEW-1] typecheck   ← no build output needed; could run before or after build
[NEW-2] npm test    ← no build output needed
[NEW-3] check-ts-only  ← no build output needed
[NEW-4] verify:parquet ← MUST run after build:data (reads data/parquet/)
[EXISTING] Check links
[EXISTING] Check new CDN image URLs (conditional)
```

Recommendation: place typecheck, npm test, and check-ts-only **before** the build step. Fast checks (11s combined) that fail loudly before the 3+ minute build runs. verify:parquet must stay after the build. This ordering makes CI fail faster on type errors.

For `deploy.yml`, typecheck is the only addition (D-04/D-05). Insert it after `npm ci` and before the build step, consistent with pr-check.yml.

### Existing Step Idiom (from pr-check.yml and deploy.yml)

```yaml
# Pattern: named run: steps, no explicit shell: (defaults to bash)
- run: npm ci
- run: npm run build:data && npm run build:eleventy && ...
- name: Check links
  run: npm run build:validate-links
- name: Check new CDN image URLs
  if: steps.changed-data.outputs.any_changed == 'true'
  run: |
    python3 .github/scripts/check-cdn-urls.py
    lychee ...
```

New steps follow the same idiom:

```yaml
- name: Typecheck
  run: npm run typecheck

- name: Test
  run: npm test

- name: TS-only invariant guard
  run: bash scripts/check-ts-only.sh

- name: Verify Parquet schema
  run: npm run verify:parquet
```

**Action SHA pinning:** Existing actions are pinned (e.g. `actions/checkout@de0fac2e4500...`). New `run:` steps use no external actions, so no pinning is needed.

**Node version:** Both workflows use `actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f` (v6) with `node-version-file: '.nvmrc'`. `.nvmrc` contains `24`. Node 24 type-stripping is default-on (no `--experimental-strip-types` flag needed in CI). [VERIFIED: live measurement]

---

## D-03 Content-Hash Normalization (Resolved)

### Hash scheme (verified against live `_site/`)

Vite generates 8-character base64url hashes `[A-Za-z0-9_-]{8}`. Asset filenames follow `{basename}-{HASH}.{ext}`.

**Affected assets (confirmed from live tree):**
- `_site/assets/main-{HASH}.js` — shared bundle (1 file)
- `_site/assets/main-{HASH}.js.map` — source map (1 file)
- `_site/assets/chunk-{HASH}.js` — shared chunk (1 file, hash is stable between baseline and current)
- `_site/assets/index-{HASH}.css` — main CSS (1 file, hash is stable)
- `_site/assets/main-{HASH}.css` — additional CSS (1 file, hash is stable)
- `_site/assets/header-{HASH}.png` — header image (1 file, hash is stable)
- `_site/assets/openseadragon-{HASH}.js` — OSD bundle (hash is stable)
- `_site/assets/species/{slug}/index-{HASH}.js` — per-species bundle (1 per species, ~1,433 files; all hashes changed between baseline and current)

**What actually differed between `_site/` and `_site_baseline/`:**

| Category | Diff result | Count |
|----------|-------------|-------|
| Parquet files (`_site/species/*/records.parquet`) | BYTE-IDENTICAL | 1,453 files [VERIFIED] |
| `species-states.json` | BYTE-IDENTICAL [VERIFIED] | 1 file |
| All other static files (CSS, images, osd-images, pagefind, redirect.html) | BYTE-IDENTICAL [VERIFIED] | ~60+ files |
| HTML files | Differ — ONLY by content-hash refs | 1,537 files |
| Asset JS/CSS bundles (`_site/assets/`) | Different hashes for main.js and all per-species index.js | ~2,880 files |

**Concrete diff for a species page:**
```
11c11
< <script type="module" crossorigin src="/assets/species/abagrotis-apposita/index-CttZCqBr.js">
---
> <script type="module" crossorigin src="/assets/species/abagrotis-apposita/index-Lvs9JDyp.js">
13c13
< <link rel="modulepreload" crossorigin href="/assets/main-BoRMrv-o.js">
---
> <link rel="modulepreload" crossorigin href="/assets/main-mhZWKs7f.js">
```

Non-species pages (browse, faqs, glossary, plates) differ by exactly 1 line — only the `main-{HASH}.js` ref.

### Three-bucket classification (verified)

**Bucket A — strict byte-for-byte diff (zero differences expected):**
- `_site/species/*/records.parquet`
- `_site/species-states.json`
- `_site/css/`, `_site/styles/`, `_site/images/`, `_site/osd-images/`
- `_site/pagefind/` (entire directory)
- `_site/redirect.html`

**Bucket B — normalize then diff (zero differences expected after normalization):**
- All `_site/**/*.html` (1,537 files)

**Bucket C — excluded entirely:**
- `_site/assets/` (all Vite-generated JS/CSS bundles and source maps)

### Normalization mechanism (verified working)

```bash
perl -pe 's{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g'
```

**Why Perl not sed:** macOS BSD `sed` requires `\{8\}` in extended regex, but the hash can itself contain `-` which interacts badly with bracket expressions. Perl's `{8}` quantifier is unambiguous and the pattern was tested and confirmed on macOS 15.4.

**Confirmed working:** Applied to abagrotis-apposita/index.html, browse/index.html, faqs/index.html, glossary/index.html — all produce IDENTICAL output after normalization. [VERIFIED: live measurement]

### Recommended diff command sequence

```bash
# Bucket A: strict byte diff — exclude assets/ and HTML
diff -r _site/ _site_baseline/ \
  --exclude="*.html" \
  --exclude="*.js" \
  --exclude="*.css" \
  --exclude="*.map" \
  --exclude="*.png"

# Bucket B: normalized HTML diff
# Build normalized copies in a temp dir, then diff them
find _site -name "*.html" | while read f; do
  rel="${f#_site/}"
  mkdir -p "/tmp/site_norm/$(dirname "$rel")"
  mkdir -p "/tmp/base_norm/$(dirname "$rel")"
  perl -pe 's{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g' "$f" > "/tmp/site_norm/$rel"
  perl -pe 's{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g' "_site_baseline/$rel" > "/tmp/base_norm/$rel"
done
diff -r /tmp/site_norm/ /tmp/base_norm/
```

Alternatively: commit a small `scripts/compare-sites.sh` that encapsulates both buckets.

**Caveat on pagefind exclusion:** The `--exclude="*.png"` glob is broad. The `_site/images/header.png` and `_site/osd-images/*.png` are static images that should be byte-identical and thus should pass the Bucket A check. The exclude is only needed because the Vite-generated `assets/header-{HASH}.png` is a Bucket C file. A cleaner Bucket A approach: `diff -r _site/ _site_baseline/ --exclude-from=<(echo "_site/assets")` — or simply check separately: `diff -r _site/species _site_baseline/species --include="*.parquet"` for Parquet, and `diff _site/species-states.json _site_baseline/species-states.json` for JSON.

**Simpler recommended approach for the evidence doc:**
```bash
# 1. Data byte-identical check (Parquet + JSON)
diff -r _site/species/ _site_baseline/species/ --include="*.parquet" && \
diff _site/species-states.json _site_baseline/species-states.json && \
echo "DATA: byte-identical"

# 2. HTML normalized check
TMPDIR=$(mktemp -d)
find _site -name "*.html" | while read f; do
  rel="${f#_site/}"; mkdir -p "$TMPDIR/curr/$(dirname "$rel")" "$TMPDIR/base/$(dirname "$rel")"
  perl -pe 's{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g' "$f" > "$TMPDIR/curr/$rel"
  perl -pe 's{(-[A-Za-z0-9_-]{8})(\.(js|css|png))}{-HASH$2}g' "_site_baseline/$rel" > "$TMPDIR/base/$rel"
done
diff -r "$TMPDIR/curr/" "$TMPDIR/base/" && echo "HTML: identical modulo content-hash"
rm -rf "$TMPDIR"
```

---

## D-08 Cleanliness Guard Script (Resolved)

### Recommendation: committed `scripts/check-ts-only.sh`

**Rationale for committed script over inline YAML:**
- The guard runs in `pr-check.yml` and should also be runnable locally by the developer; a committed script enables `bash scripts/check-ts-only.sh` pre-push.
- The four-guard logic with correct exclusions (`.d.ts`, `.test.ts`) is ~25 lines — too long for a readable inline `run:` block.
- Consistent with `.github/actions/install-lychee/action.yml` (also a committed multi-line script approach).
- The `.github/scripts/check-cdn-urls.py` precedent shows the repo commits CI-support scripts.

### Verified grep patterns (all tested on live codebase — all return 0 matches)

```bash
# Guard 1: .js source files in converted dirs
# Excludes: node_modules (not in these dirs anyway), _site (not in these paths)
find scripts src/_lib src/_data src/components -name "*.js" 2>/dev/null

# Guard 2: allowJs in tsconfigs
# tsconfig*.json covers tsconfig.json, tsconfig.browser.json, tsconfig.node.json
grep -l "allowJs" tsconfig*.json 2>/dev/null

# Guard 3: @ts-ignore in any TypeScript source
grep -rn "@ts-ignore" scripts/ src/ --include="*.ts" | grep -v node_modules

# Guard 4: unguarded as unknown as T double-casts in production code
# Excludes: .test.ts (intentional mock pattern), .d.ts (comment references only)
grep -rn "as unknown as" scripts/ src/ --include="*.ts" \
  | grep -v node_modules \
  | grep -v "\.test\.ts" \
  | grep -v "\.d\.ts"
```

**Known edge cases confirmed clean:**
- `src/types/openseadragon.d.ts` line 7 contains `as unknown as TileSourceSpecifier` in a comment — excluded by `grep -v "\.d\.ts"`. [VERIFIED]
- `scripts/verify-parquet.ts` line 30 has `as unknown[]` (single cast to typed array, NOT `as unknown as T`) — not matched by the double-cast pattern. [VERIFIED]
- All test files (`*.test.ts`) use `as unknown as OccurrenceRecord[]` for mock data — excluded by `grep -v "\.test\.ts"`. [VERIFIED]

**Current state:** All four guards return 0 matches against the live codebase. [VERIFIED: live execution]

### Complete script

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

---

## D-06 Budget Fit (Resolved — No Threat)

**Measured timings (local, Node 24.15.0, Apple Silicon M-series):**

| Step | Time | Notes |
|------|------|-------|
| `npm run typecheck` | 1.8s | Both tsconfigs |
| `npm test` | 7.7s | 225 tests, 43 suites |
| `npm run verify:parquet` | ~1.0s | 1,453 species, 92,648 rows |
| `npm run build:data` | 3.2s | Full DuckDB pipeline |
| All new gates combined | ~11s | typecheck + test + guard + verify:parquet |

[VERIFIED: live measurement on macOS 15.4]

**GitHub Actions will be slower** (Linux ubuntu-latest, no Apple Silicon). A 3–5× CI-vs-local multiplier is typical for Node.js work. Extrapolated: 30–55s for all new gates. Combined with a cached `npm ci` (~15s), `build:data` (~10-16s), `build:eleventy` + asset pipeline (dominant cost, likely 60–120s), and `pagefind` (~30s), the total `pr-check` run should land well under 5 minutes.

**`verify:parquet` specifically:** 1.0s locally means even a 5× slowdown gives 5s on CI. The 1,453 species / 92,648 row scan uses `readFileSync` (synchronous), so GH Actions I/O latency could increase this, but it will not approach the budget limit. The concern in D-06 was warranted based on the description ("scales with dataset size") but the actual runtime is negligible — hyparquet's in-process scan is fast. [VERIFIED]

**CI-03 (`build:data` < 60s):** Locally 3.2s. Even a 20× slowdown would be 64s, but typical Node.js 3–5× multipliers suggest 10–16s in CI. **Flag:** CI-03 requires live CI observation to confirm; CONTEXT.md D-07 acknowledges this. The local measurement is evidence it's directionally safe.

**Verdict:** `verify:parquet` does NOT threaten the budget. No fallback to a scheduled workflow is needed.

---

## MIG-05 Details: Test Suite State

**Current state (verified):**
- Test count: **225** (not ~191 as in CONTEXT.md — Phase 37 added ~34 additional tests) [VERIFIED: live run]
- All test files: `.ts` (zero `.js` test files remain) [VERIFIED]
- Runner: bare `node --test`, no loader, no `--experimental-strip-types` flag needed [VERIFIED]
- All tests pass (0 fail, 0 skip) [VERIFIED]
- Duration: 7.5s [VERIFIED]

**MIG-05 remaining work:**
- Update `package.json` test glob: `'scripts/lib/*.test.{js,ts}'` → `'scripts/lib/*.test.ts'` and `'src/_lib/*.test.{js,ts}'` → `'src/_lib/*.test.ts'` (cleanup only — no `.js` test files exist to miss)

**Node 24 type-stripping:** Default-on in Node 24.x. No `--experimental-strip-types` flag needed in the `node --test` command or in CI environment. `.nvmrc` pins `24`, which maps to Node 24.15.0 (current LTS). GitHub Actions `setup-node@v6` with `node-version-file: '.nvmrc'` will pick this up correctly. [VERIFIED: live]

---

## GitHub Actions Insertion Points (Concrete YAML)

### pr-check.yml additions

The existing build step is line 37:
```yaml
- run: npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:species-states && npm run build:pagefind && npm run build:check-weight
```

**Insert before the build step:**
```yaml
      - name: Typecheck
        run: npm run typecheck
      - name: Test
        run: npm test
      - name: TS-only invariant guard
        run: bash scripts/check-ts-only.sh
```

**Insert after the build step (before "Check links"):**
```yaml
      - name: Verify Parquet schema
        run: npm run verify:parquet
```

### deploy.yml additions

Existing build step is line 35 (same chain). Insert before it:
```yaml
      - name: Typecheck
        run: npm run typecheck
```

Only typecheck goes in deploy.yml per D-04/D-05. No `npm test`, no verify:parquet, no guard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript type checking | Custom type validator | `npm run typecheck` (already exists) | Runs `tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit` |
| Parquet schema validation | Custom file reader | `npm run verify:parquet` (already exists) | Proven, handles the ArrayBuffer isolation pitfall |
| Content-hash normalization | Static list of known hashes | Perl regex on 8-char base64url pattern | Hashes change with every build; pattern is stable |
| Test runner | Custom test executor | `node --test` (Node 24 built-in) | No loader needed; already wired in package.json |

---

## Common Pitfalls

### Pitfall 1: Forgetting verify:parquet reads `data/parquet/` not `_site/`
**What goes wrong:** verify:parquet reads from `data/parquet/{slug}/records.parquet` (the build output directory), not `_site/`. It will pass even if the CI step runs before `build:copy-parquet` copies files to `_site/`. But it MUST run after `build:data` (which generates `data/parquet/`).
**Prevention:** Place verify:parquet after the build step; the build step already begins with `npm run build:data`.

### Pitfall 2: BSD `sed` on macOS vs Linux GNU `sed`
**What goes wrong:** The normalization script is developed on macOS with BSD `sed`, which requires `\{8\}` not `{8}`. GitHub Actions runs Linux GNU `sed`, which accepts `{8}` in extended mode (`-E`). The `perl` approach is portable and avoids the ambiguity entirely.
**Prevention:** Use `perl -pe` for the hash normalization; it behaves identically on macOS and Linux. [VERIFIED on macOS]

### Pitfall 3: `_site_baseline/` may be stale
**What goes wrong:** If any unrelated data change (new species, updated CSV) occurred after the baseline snapshot was taken (2026-06-09), the Parquet files will differ — not because of a TS migration regression, but because the baseline predates new data.
**Prevention:** BASELINE.md already documents this: "must be regenerated if it predates an unrelated data change." Before running the proof, confirm `_site_baseline/` was built from the same `data/` state as the current build. The current `_site_baseline/` was built 2026-06-09; confirm no data changes occurred since.

### Pitfall 4: Test count drift
**What goes wrong:** CONTEXT.md and ROADMAP say "~191 tests" but the actual count is 225. Any documentation that asserts "191" will be stale. The milestone-evidence doc should record the actual count from the run.
**Prevention:** Use `npm test 2>&1 | grep "ℹ tests"` in the evidence doc — captures the real number at run time.

### Pitfall 5: Per-species asset `index-{HASH}.js` filenames
**What goes wrong:** Each of the 1,433 species pages has a unique `assets/species/{slug}/index-{HASH}.js` with its own hash. A naive HTML normalizer that only handles the global `main-{HASH}.js` would miss these per-species refs and report HTML diffs.
**Prevention:** The Perl pattern `(-[A-Za-z0-9_-]{8})(\.(js|css|png))` handles all hashed filenames uniformly, including per-species index files. [VERIFIED: tested on `abagrotis-apposita` which has both a per-species and a shared ref.]

---

## Validation Architecture (MIG-06 guard is the permanent gate)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `--test` |
| Config file | none — filenames listed explicitly in `package.json` |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same) |
| Duration | 7.5s (225 tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIG-05 | All tests pass via `node --test`, no loader | Existing suite | `npm test` | All 17 test files exist |
| MIG-06 | Zero TS-only violations | CI guard | `bash scripts/check-ts-only.sh` | New — Wave 0 |
| CI-01 | typecheck passes | Type check | `npm run typecheck` | Passes now |
| CI-02 | byte-identical proof | Local one-shot | Two-bucket diff script | New — Wave 0 |
| CI-03 | build:data < 60s | Observation | `time npm run build:data` | Passes now |

### Wave 0 Gaps
- [ ] `scripts/check-ts-only.sh` — the MIG-06 guard (new artifact)
- [ ] `scripts/compare-sites.sh` or equivalent — the D-03 normalization helper (new artifact, used once for the milestone proof, then archived)
- [ ] `.planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md` — committed evidence doc recording proof results for D-02 and D-07

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 24 | All verification commands | ✓ | 24.15.0 (via .nvmrc) | — |
| `perl` | D-03 HTML normalization | ✓ | Built into macOS and Ubuntu | — |
| `diff` | Byte-identical checks | ✓ | Built-in | — |
| `_site_baseline/` snapshot | D-02/CI-02 proof | ✓ | Present (built 2026-06-09) | Rebuild with baseline build command |
| `data/parquet/` directory | verify:parquet | ✓ | 1,453 species | Run `npm run build:data` |

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Raw `diff -r _site/ _site_baseline/` | Two-bucket normalized diff | Phase 37 content-hash filenames make raw diff always fail; normalized diff correctly separates "data changed" from "hash changed" |
| `~191 tests` | 225 tests | Phase 37 added the SCHEMA-08 validators with their own test suite; CONTEXT.md figure is stale |
| `--experimental-strip-types` flag | Default type-stripping | Node 24 GA shipped type-stripping as default-on; no flag needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub Actions ubuntu-latest will run Node 24 type-stripping without extra flags | Environment | Could require `--experimental-strip-types` if GH Actions uses an older Node image; mitigated by `.nvmrc` pinning and `setup-node` |
| A2 | `verify:parquet` runtime on GH Actions ubuntu-latest will be under 30s (3–5× local) | Budget | If I/O is slower than expected, could take 30–60s; still within 5-min budget |
| A3 | No data changes occurred between `_site_baseline/` creation (2026-06-09) and current build | Byte-identical proof | If `data/species.csv` changed, Parquet files may differ — rebuild baseline before proof |

**If this table covers all assumptions:** Three assumptions, all with low risk given the constraints. No user confirmation needed before execution.

---

## Open Questions

1. **Exact placement of typecheck in deploy.yml relative to `actions/configure-pages`**
   - What we know: deploy.yml has `actions/configure-pages` between `npm ci` and the build step; typecheck doesn't need it
   - What's unclear: whether there's any convention reason to order typecheck after `configure-pages`
   - Recommendation: place typecheck between `npm ci` and `configure-pages` — it has no dependency on either

2. **Whether the `{js,ts}` test glob in package.json should be cleaned up as part of MIG-05**
   - What we know: no `.js` test files remain; `'scripts/lib/*.test.{js,ts}'` is purely permissive
   - What's unclear: whether ROADMAP SC-2 requires the glob to be updated or just confirms tests pass
   - Recommendation: clean up to `'scripts/lib/*.test.ts'` as part of the MIG-05 task; it removes the ambiguity and documents the completed migration

---

## Sources

### Primary (HIGH confidence — live codebase verification)
- Live execution: `npm test`, `npm run typecheck`, `npm run verify:parquet`, `npm run build:data` — timing measurements
- Live file inspection: `_site/` and `_site_baseline/` comparison — diff taxonomy and normalization verification
- Live grep: All four D-08 guard patterns run against current codebase
- Live Perl normalization: Tested on `abagrotis-apposita`, `browse`, `faqs`, `glossary` HTML pages

### Secondary (MEDIUM confidence)
- `.github/workflows/pr-check.yml` and `deploy.yml` — existing step idiom extracted verbatim
- `package.json` — existing script commands and test glob
- `scripts/verify-parquet.ts` — algorithm and data path confirmed

### Tertiary (LOW confidence / Assumed)
- GitHub Actions ubuntu-latest runtime multiplier (3–5×) — [ASSUMED] based on typical CI vs local performance ratios

---

## Metadata

**Confidence breakdown:**
- D-03 normalization: HIGH — mechanism tested on live `_site/` vs `_site_baseline/`
- D-08 guard patterns: HIGH — all four run against live codebase, all return 0 matches
- D-06 budget fit: HIGH locally; MEDIUM for CI (extrapolated)
- CI step idioms: HIGH — extracted directly from existing workflow files
- MIG-05 test suite: HIGH — measured live run

**Research date:** 2026-06-10
**Valid until:** Stable for this phase; re-verify if `data/species.csv` changes (affects `_site_baseline/` validity)
