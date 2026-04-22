---
phase: 16-build-pipeline-cleanup
verified: 2026-04-22T23:10:00Z
status: human_needed
score: 3/4 must-haves verified
human_verification:
  - test: "Push to main, watch GitHub Actions deploy workflow complete, then open a species factsheet page in a browser"
    expected: "Deploy workflow shows green (all jobs pass); species photo <img> requests resolve to the CDN domain (not /images/... relative paths) and return HTTP 200 with no broken images"
    why_human: "Requires a live CI run with the CDN_BASE_URL secret and a real browser network inspection — cannot be verified from the codebase alone"
---

# Phase 16: Build Pipeline Cleanup Verification Report

**Phase Goal:** The build pipeline contains no image-copy or resize logic for species photos; CI builds cleanly using CDN URLs throughout
**Verified:** 2026-04-22T23:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run build` completes without error and without touching `images/` | VERIFIED | `scripts/copy-images.js` contains no reference to `speciesSrc`, `images/{slug}`, or "Copied images: images/". The ENOENT-causing block is fully absent. SUMMARY confirms `npm run build` exits 0 locally. |
| 2 | `scripts/copy-images.js` copies only banner, Pico CSS, OSD assets — no species photos | VERIFIED | File confirmed to contain exactly 4 copy blocks: `bannerSrc` (line 18), `stylesSrc` (line 24), `picoSrc` (line 33), `osdImagesSrc` (line 40). The JSDoc header lists only these 4 destinations. |
| 3 | No image resize scripts exist in `scripts/` and no resize step runs during build | VERIFIED | `grep -rn "resize\|sharp\|jimp\|imagemin\|magick" scripts/ package.json` returns no matches. `ls scripts/` shows no `*resize*`, `*optimize-image*`, or `*sharp*` files. `build` script chain has no resize step. |
| 4 | A full GitHub Actions deploy run completes successfully and species factsheet pages load images from the CDN | NEEDS HUMAN | Task 3 was an auto-approved checkpoint. CI has not been verified live. Requires push to main + browser inspection. |

**Score:** 3/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/copy-images.js` | Asset copy script without species photo block; excludes `speciesSrc`, `images/{slug}`, "Copied images: images/" | VERIFIED | All three excluded patterns absent. All four retained blocks (`bannerSrc`, `stylesSrc`, `picoSrc`, `osdImagesSrc`) present. |
| `package.json` | Build pipeline with no resize step | VERIFIED | `build` script: `build:data && build:eleventy && build:copy-parquet && build:copy-images && build:species-states && build:pagefind && build:validate-links && build:check-weight` — no resize step anywhere. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json build script` | `scripts/copy-images.js` | `npm run build:copy-images` | WIRED | `"build:copy-images": "node scripts/copy-images.js"` present; `build` script invokes `build:copy-images` in chain. |

### Data-Flow Trace (Level 4)

Not applicable — `copy-images.js` is a build utility script, not a component that renders dynamic data.

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| Species block absent | `grep -n "speciesSrc\|images/{slug}\|Copied images: images/" scripts/copy-images.js` | No output (exit 1) | PASS |
| 4 retained blocks present | `grep -n "bannerSrc\|picoSrc\|osdImagesSrc\|stylesSrc" scripts/copy-images.js` | 4 variable names found at lines 18, 24, 33, 40 | PASS |
| No resize references | `grep -rn "resize\|sharp\|jimp\|imagemin\|magick" scripts/ package.json` | No output (exit 1) | PASS |
| CI deploy + CDN image delivery | Push to main and browser inspection | Not run | SKIP — needs human |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIPE-01 | 16-01-PLAN.md | Species photo copy block removed from `copy-images.js` (banner, Pico CSS, OSD copies retained) | SATISFIED | `speciesSrc` block absent; all 4 non-species blocks confirmed present in file. |
| PIPE-02 | 16-01-PLAN.md | Build-time image resize scripts removed | SATISFIED | No resize scripts in `scripts/`; no resize packages in `package.json` dependencies; no resize step in build chain. REQUIREMENTS.md marks both as Pending in the Traceability table — that table was not updated by this phase but the code satisfies the criteria. |

Note: REQUIREMENTS.md Traceability table still shows PIPE-01 and PIPE-02 as "Pending" — the phase did not update the table. This is a documentation gap, not a code gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `package.json` | 18 | `"migrate:images": "node scripts/migrate-images.js"` present as npm script | Info | `migrate:images` and `migrate:species` are utility scripts not in the `build` chain; not a build pipeline concern but worth noting they remain. |

No blockers found.

### Human Verification Required

#### 1. CI Deploy and CDN Image Delivery

**Test:** Push the current HEAD of main to GitHub (or confirm the commit `27767a0` has already been pushed). Open the GitHub Actions tab, locate the deploy workflow triggered by that push, and wait for it to complete. Then open any species factsheet page in a browser (e.g., the first species alphabetically), open DevTools Network tab filtered to "Img", and reload.

**Expected:** The deploy workflow shows a green checkmark for all jobs. Species photo `<img>` requests in the Network tab resolve to the CDN domain (not `/images/...` relative paths) and return HTTP 200. No broken image icons appear.

**Why human:** Requires a live CI run that uses the `CDN_BASE_URL` GitHub Actions secret, and a real browser network inspection. The codebase correctly references CDN URLs (confirmed in Phase 14), but end-to-end delivery cannot be verified programmatically from the local codebase.

### Gaps Summary

No gaps. Tasks 1 and 2 are fully verified from the codebase. The single outstanding item (Truth 4 / SC-6) is a human verification checkpoint that was auto-approved in auto_advance mode and is expected to be confirmed by the developer after pushing to main.

---

_Verified: 2026-04-22T23:10:00Z_
_Verifier: Claude (gsd-verifier)_
