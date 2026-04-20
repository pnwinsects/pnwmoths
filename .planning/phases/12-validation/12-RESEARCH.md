# Phase 12: Validation - Research

**Researched:** 2026-04-20
**Domain:** Build pipeline verification, link checking, test suite, git hygiene
**Confidence:** HIGH

## Summary

Phase 12 is a validation-and-close phase for the v1.3 Visual Browse milestone. All four success criteria are already satisfied by the current state of the codebase — the build passes, the link checker reports zero errors, all 58 tests pass, and `data-pagefind-ignore` is correctly applied to the taxonomy JSON block.

The only substantive work remaining is:
1. Commit the four unstaged files left over from the Phase 11 UAT toolbar-polish fix.
2. Run the full verification checklist (build, test, link check, pagefind-ignore audit) and document it.
3. Update the planning documents (REQUIREMENTS.md, ROADMAP.md, STATE.md) to mark all v1.3 requirements complete and close out the milestone.

**Primary recommendation:** One plan, one wave. Commit the unstaged changes, run the verification checklist, update planning docs, done.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Build verification (npm run build) | Build pipeline | — | Orchestrates all downstream steps in sequence |
| Link checking | Build pipeline | — | lychee runs post-build against `_site/` HTML |
| Test suite | Build pipeline | — | Node.js built-in test runner, no browser required |
| Pagefind index audit | Build pipeline | — | Pagefind runs post-build; data-pagefind-ignore is a template attribute |
| Planning doc updates | Documentation | — | Traceability table, roadmap status, state file |

## Current State Audit

All four success criteria were verified against the current `_site/` output:

### SC-1: Clean build + species-states.json present
- `npm run build` exits 0. [VERIFIED: ran locally]
- `_site/species-states.json` present and contains 29 species-state pairs. [VERIFIED: `ls _site/species-states.json`]
- One pre-existing Vite advisory: `<script src="/pagefind/pagefind-ui.js"> can't be bundled without type="module"` — this is Pagefind's intentional IIFE format, not an error. Build exits 0. [VERIFIED: ran locally]

### SC-2: Link checker reports zero broken links
- `lychee --config lychee.toml --root-dir _site '_site/**/*.html'` output: `149 Total | 128 OK | 0 Errors | 19 Excluded | 2 Unsupported` [VERIFIED: ran locally]
- The 2 "Unsupported" are `data:image/jpeg;base64,...` inline image URIs — lychee correctly ignores them as missing-host URLs. Zero errors.
- lychee version: 0.23.0, available at `/opt/homebrew/bin/lychee`. [VERIFIED: `command -v lychee && lychee --version`]

### SC-3: npm test passes
- `node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js` → 58 pass, 0 fail, 8 suites. [VERIFIED: ran locally]

### SC-4: Pagefind does not index taxonomy JSON
- `<script type="application/json" id="taxon-data" data-pagefind-ignore>` — attribute confirmed in built `_site/browse/index.html`. [VERIFIED: `grep pagefind _site/browse/index.html`]
- The `<noscript>` block also carries `data-pagefind-ignore`, so the static fallback listing is not indexed either. [VERIFIED: same grep]
- Pagefind indexed 15 pages (11 `content/species/` pages excluded for lacking `<html>` element — pre-existing condition unrelated to Phase 12).

### Unstaged changes requiring a commit
Four files have unstaged changes from the Phase 11 UAT toolbar-polish fix (committed by UAT as "6 passed, 1 issue fixed inline" but not staged/committed):
- `src/components/pnwm-taxon-browser.js` — toolbar `align-items:center` → `align-items:baseline` (cosmetic toolbar alignment)
- `src/styles/theme.css` — taxon browser disclosure button styles added (`.pnwm-tb-family-row`, etc.)
- `src/species/species.njk` — image URL changed from `| url` filter to raw `/images/...` path (Vite double-prefix fix)
- `.planning/config.json` — `_auto_chain_active: false` → `true` (workflow config)

These changes are already correct and tested. They just need to be committed.

## Standard Stack

### Core Tools (all pre-existing, no installation needed)

| Tool | Version | Purpose | Invocation |
|------|---------|---------|------------|
| Node.js built-in test runner | Node v22.20.0 | Unit tests | `node --test scripts/*.test.js src/components/*.test.js` |
| lychee | 0.23.0 | HTML link checker | `npm run build:validate-links` |
| pagefind | 1.5.2 | Search indexer | `npm run build:pagefind` |
| npm build script | n/a | Full pipeline orchestration | `npm run build` |

All tools are installed and operational. No new dependencies are needed for Phase 12. [VERIFIED: all checked locally]

## Architecture Patterns

### Build Pipeline Sequence (from package.json)
```
npm run build
  └─ build:data          (DuckDB: parquet export + validation)
  └─ build:eleventy      (Eleventy + Vite: HTML + JS bundle)
       └─ writeBundle hook: copy-images.js + emit-species-states.js
  └─ build:copy-parquet  (copy .parquet files to _site/species/)
  └─ build:copy-images   (redundant copy, safe — also runs in serve mode)
  └─ build:species-states (redundant emit, safe — also runs in serve mode)
  └─ build:pagefind      (pagefind --site _site)
  └─ build:validate-links (lychee link check)
  └─ build:check-weight  (node scripts/check-page-weight.js)
```

Note: `copy-images` and `emit-species-states` run twice in a production build (once in Vite's `writeBundle` hook, once as standalone npm scripts). This is intentional — the standalone scripts cover `--serve` mode where Vite runs as middleware. Idempotent and safe. [VERIFIED: eleventy.config.js]

### Lychee Configuration (lychee.toml)
```toml
timeout = 20
max_retries = 3
cache = true
accept = ["100..=103", "200..=299", "429"]
exclude = ["\\.(?:jpg|jpeg|png|gif|webp|svg|ico)$"]
remap = ["(file://.+/_site)/pnwmoths(.*) $1$2"]
```

The `remap` rule strips the `/pnwmoths` path prefix from `file://` URLs so links like `href="/pnwmoths/species/acronicta-americana/"` resolve correctly against the local `_site/` root. This is already configured and working. [VERIFIED: lychee.toml + lychee output]

### Test Command Pattern
```bash
node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js
```
No jest.config, no vitest.config — uses Node.js built-in `node:test` with `node:assert/strict`. [VERIFIED: package.json + test files]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Link validation | Custom crawl script | lychee (already in build) | Handles redirects, retries, remap rules, caching |
| Search index validation | Custom DOM parser | Trust pagefind output + verify data-pagefind-ignore in source | Pagefind's own indexing logic is authoritative |

## Common Pitfalls

### Pitfall 1: Stale `.11ty-vite` temp directory
**What goes wrong:** Eleventy Vite plugin leaves a `.11ty-vite` temp directory behind if a prior build crashed. Running `npm run build` again gives: `Error: ENOTEMPTY: directory not empty, rename './_site/' -> '/path/.11ty-vite'`
**Why it happens:** The plugin renames `_site/` to `.11ty-vite/` before the Vite step; a prior crash can leave this in place.
**How to avoid:** Delete `.11ty-vite/` before running a fresh build if the prior run crashed.
**Warning signs:** `Error: ENOTEMPTY` in Eleventy output; `ls` shows `.11ty-vite/` directory.
[VERIFIED: observed during research session]

### Pitfall 2: Treating "Unsupported" as errors in lychee output
**What goes wrong:** Interpreting the `2 Unsupported` in lychee output as broken links.
**Why it happens:** Lychee reports `data:image/...` URIs as "unsupported" (missing host), not "errors". These are base64-encoded inline images — not broken.
**How to avoid:** Only `Errors` count against SC-2. Unsupported and Excluded are safe.

### Pitfall 3: Missing pagefind advisory vs. error
**What goes wrong:** Treating Vite's `can't be bundled without type="module"` advisory as a build failure.
**Why it happens:** Pagefind's `pagefind-ui.js` is an IIFE intentionally loaded without `type="module"`. Vite flags it, but the build succeeds. This is a pre-existing condition.
**How to avoid:** Check build exit code, not stderr content. `npm run build` exits 0.

### Pitfall 4: Committing `.planning/config.json` with wrong `_auto_chain_active` value
**What goes wrong:** The config.json diff shows `_auto_chain_active` changed from `false` to `true` — this is a GSD workflow control toggle that should be committed as-is.
**How to avoid:** Include `.planning/config.json` in the Phase 12 commit.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (v22.20.0) |
| Config file | none |
| Quick run command | `node --test scripts/build-data.test.js` |
| Full suite command | `node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js` |

### Phase Requirements → Test Map

Phase 12 has no new requirements (it is a validation phase). All checks are build-level or smoke-level.

| Check | Behavior | Type | Command |
|-------|----------|------|---------|
| SC-1a | Build exits 0 | smoke | `npm run build` (check exit code) |
| SC-1b | species-states.json present | smoke | `ls _site/species-states.json` |
| SC-2 | Link checker: 0 Errors | smoke | `npm run build:validate-links` (check "0 Errors") |
| SC-3 | Test suite: 58/58 pass | unit | `node --test ...` (check `fail 0`) |
| SC-4 | data-pagefind-ignore on #taxon-data | smoke | `grep "data-pagefind-ignore" _site/browse/index.html` |

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. No new test files needed.

## Phase Plan Shape

Phase 12 needs **one plan** with **one wave** (two tasks):

**Task 1: Commit UAT polish changes**
- Stage and commit the four unstaged files: `src/components/pnwm-taxon-browser.js`, `src/styles/theme.css`, `src/species/species.njk`, `.planning/config.json`
- Commit message: `fix(11): commit UAT toolbar polish — baseline alignment and button styles`

**Task 2: Run verification checklist + update planning docs**
- Run `npm run build` — verify exit 0
- Verify `_site/species-states.json` exists
- Run `npm run build:validate-links` — verify `0 Errors`
- Run `npm test` — verify `fail 0`
- Verify `data-pagefind-ignore` on `#taxon-data` in `_site/browse/index.html`
- Update `REQUIREMENTS.md` traceability table: mark all v1.3 requirements Complete
- Update `ROADMAP.md`: mark Phase 12 complete, check off v1.3 milestone
- Update `STATE.md`: progress = 100%, status = complete

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| lychee | SC-2 link check | yes | 0.23.0 | — |
| Node.js | SC-3 test suite | yes | v22.20.0 | — |
| pagefind | SC-4 index audit | yes | 1.5.2 | — |
| npm run build | SC-1 | yes | npm 10.9.3 | — |

No missing dependencies.

## Open Questions

1. **Are the content/species pages (lacking `<html>`) a concern for Phase 12?**
   - What we know: 11 `content/species/` pages lack `<html>` elements; pagefind skips them with a warning. This is pre-existing.
   - What's unclear: Whether the project owner considers this a bug to fix.
   - Recommendation: Out of scope for Phase 12 (validation phase). Document as a known advisory in the verification output, do not fix.

2. **Should BROWSE-07 be marked Complete or Partial in REQUIREMENTS.md?**
   - What we know: BROWSE-07 ("show/hide images toggle on by default; noscript static listing visible without JS") — the noscript clause was completed in Phase 10, the toggle was completed in Phase 11.
   - Recommendation: Mark Complete in the traceability update task.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The four unstaged files are the complete set of UAT polish changes; no other Phase 11 work is uncommitted | Current State Audit | If additional uncommitted work exists, the commit task would be incomplete |
| A2 | The `_auto_chain_active: true` change in config.json is the correct intended state and should be committed | Current State Audit | If `false` was intended, committing `true` changes GSD workflow behavior |

## Sources

### Primary (HIGH confidence)
- Local build execution: `npm run build` — all output verified in this session
- `lychee --verbose` output — link check results verified
- `node --test` output — 58/58 pass verified
- `grep "data-pagefind-ignore" _site/browse/index.html` — SC-4 verified
- `git diff HEAD` — unstaged changes enumerated

### Secondary (MEDIUM confidence)
- `package.json` build scripts — pipeline sequence and tool invocations
- `lychee.toml` — remap rule behavior
- `eleventy.config.js` — Vite writeBundle hook / serve mode hook design

## Metadata

**Confidence breakdown:**
- Current state: HIGH — all four success criteria verified by running the tools
- Plan shape: HIGH — one commit + one verification run; no ambiguity
- Pitfalls: HIGH — lychee advisory and Vite advisory both observed this session

**Research date:** 2026-04-20
**Valid until:** Stable — this is a close-out phase; findings don't expire
