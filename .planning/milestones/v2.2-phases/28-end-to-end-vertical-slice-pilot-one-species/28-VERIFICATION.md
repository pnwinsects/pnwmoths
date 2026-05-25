---
phase: 28-end-to-end-vertical-slice-pilot-one-species
verified: 2026-05-24T00:00:00Z
status: human_needed
score: 5/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Visually confirm OSD viewer launches, pan/zoom/home-reset work in a real browser against the production CDN"
    expected: "Lightbox on abagrotis-apposita opens with OSD canvas; tiles load from https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/; pan, zoom, and home-reset work; no console errors; open/close cycle clean"
    why_human: "Browser-rendered OSD behavior cannot be verified by grep or file inspection; requires real browser execution against live CDN"
  - test: "Confirm two non-pilot species pages open the Phase 23 static-img lightbox unchanged (no OSD, no console errors)"
    expected: "Species page without a species-photos.json entry opens the static <img> lightbox; no OSD canvas, no OSD-related console output, close button works"
    why_human: "Requires visual inspection in a real browser; the code-path branch (useOsd === false) is verified by the build smoke check but the actual browser rendering is not checkable by static analysis"
---

# Phase 28: End-to-End Vertical-Slice Pilot — One Species Verification Report

**Phase Goal:** Prove the entire downstream pipeline (tile → upload → species-photos.json → OpenSeadragon in production lightbox) works on a single hand-picked species, surfacing cross-phase integration risks (URL conventions, manifest shape, viewer wiring, CDN config, build determinism, OSD aesthetics) before committing ~1 TB of tiles and ~5,000 specimen uploads to bunny.net
**Verified:** 2026-05-24
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One hand-picked species (abagrotis-apposita) is rendered on its production page via OSD loading DZI tiles from bunny.net CDN; pan/zoom/home-reset work | ? UNCERTAIN | CDN URLs return HTTP 200 (curl verified), CORS header present (`access-control-allow-origin: *`), component wiring present in built page — but browser execution requires human confirmation |
| 2 | Tile pyramid lives at production URL convention `{{ cdnBaseUrl }}/species-tiles/{species-slug}/{specimen_id}-{view}/` | ✓ VERIFIED | `curl -s -o /dev/null -w "%{http_code}" https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi` returns 200; tile file `A-D_files/0/0_0.webp` returns 200 |
| 3 | `data/species-photos.json` carries a real, hand-edited entry for abagrotis-apposita | ✓ VERIFIED | File contains `"abagrotis-apposita": { "high_res_available": true, "specimens": [{specimen_id, view, tiles_path} x2] }`; parses via `node -e JSON.parse` without error |
| 4 | A documented vips tile recipe exists sufficient for operator to reproduce locally | ✓ VERIFIED | `TILE-RECIPE.md` is 156 lines; contains all 4 required flags (`--tile-size 256`, `--overlap 1`, `--suffix .webp[Q=80]`, `--layout dz`); has all required H2 sections; mentions all 4 candidate species; no bunny.net upload step |
| 5 | Pilot lessons recorded (tile params, URL conventions, OSD config surprises) — input for Phase 29 | ✓ VERIFIED | `PILOT-LESSONS.md` is 144 lines; all 10 required H2 sections present; answers RESEARCH.md Open Questions 1 (CORS), 2 (vips params), 3 (OSD config surprises); pilot slug present; no debt markers |
| 6 | No regressions to existing species pages — species without high-res still render Phase 23 static lightbox | ✓ VERIFIED | Build produces exactly 1,380 species pages; `grep -l 'high-res-available' _site/species/*/index.html` returns exactly 1 (abagrotis-apposita only); 217/217 tests pass; browser regression is deferred to human check |

**Score:** 5/6 truths verified (1 requires human confirmation for the browser-execution layer)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/TILE-RECIPE.md` | Operator-runnable vips dzsave recipe; min 40 lines | ✓ VERIFIED | 156 lines; all 4 vips flags; 7 H2 sections; 4 species candidates; no bunny.net curl upload step |
| `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/UPLOAD-RECIPE.md` | bunny.net PUT runbook; min 50 lines | ✓ VERIFIED | 161 lines; BUNNY_API_KEY, la.storage.bunnycdn.com, species-tiles/, access-control-allow-origin, security warning all present; 7 H2 sections |
| `data/species-photos.json` | Real pilot entry for abagrotis-apposita; `high_res_available: true` | ✓ VERIFIED | Contains real entry; 2 specimens; valid JSON; tiles_path values match CDN path convention |
| `src/_data/speciesPhotos.js` | Eleventy data loader; ESM; soft-fail; min 15 lines | ✓ VERIFIED (with deviation) | File renamed from `species-photos.js` to `speciesPhotos.js` (Plan 28-05 fix — Eleventy 3.1.5 uses filename stem verbatim); 21 lines; ESM; existsSync + readFile pattern; default async export; correctly returns parsed JSON |
| `src/components/pnwm-image-slideshow.js` | OSD branch; dynamic OSD import; destroy-on-close | ✓ VERIFIED | `import('openseadragon')` present; `this._osdViewer` field; `_buildDziUrl` helper; `await this.updateComplete` guard; `destroy()` + null on close; `useOsd` dual-condition gate; CSS `.osd-viewer` with `90vw/70vh/400px/#111`; `.caption-line` at `0.875rem` |
| `src/components/pnwm-image-slideshow.test.js` | `_buildDziUrl` unit tests | ✓ VERIFIED | `describe('_buildDziUrl'` block present; `PnwmImageSlideshow.prototype._buildDziUrl.call` pattern used; multiple test cases |
| `src/species/species.njk` | Conditional high-res attribute block | ✓ VERIFIED | `{% set highResEntry = speciesPhotos[sp.slug] %}`; conditional `{% if highResEntry and highResEntry.high_res_available %}`; `high-res-available`, `high-res-specimens`, `cdn-base-url` (no `| url`), `prefix-url` (with `| url`) |
| `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/PILOT-LESSONS.md` | Pilot lessons; min 50 lines; all 10 H2 sections | ✓ VERIFIED | 144 lines; all 10 required H2 sections present; abagrotis-apposita slug present; no unfilled `[unknown]` markers; CORS, vips params, OSD config all answered concretely |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/_data/speciesPhotos.js` | `data/species-photos.json` | `new URL('../../data/species-photos.json', import.meta.url).pathname` | ✓ WIRED | Pattern verified in speciesPhotos.js line 13 |
| `src/species/species.njk` | `pnwm-image-slideshow` attributes | `speciesPhotos[sp.slug]` → conditional attribute block | ✓ WIRED | `highResEntry` lookup and conditional block verified in species.njk lines 37–44; built page confirms attributes flow through |
| `pnwm-image-slideshow._openLightbox` | OpenSeadragon viewer | `dynamic import('openseadragon')` after `await this.updateComplete` | ✓ WIRED | Both `await import('openseadragon')` (line 227) and `await this.updateComplete` (line 220) present in async `_openLightbox` |
| `pnwm-image-slideshow._buildDziUrl` | OSD tileSources string | template literal `${cdnBaseUrl}/${tiles_path}/${specimen_id}-${view}.dzi` | ✓ WIRED | Line 276–277 confirmed; `tileSources: this._buildDziUrl(current)` at line 232 |
| `data/species-photos.json` pilot entry | `_site/species/abagrotis-apposita/index.html` `<pnwm-image-slideshow high-res-available ...>` | `speciesPhotos.js` loader → Nunjucks → species.njk | ✓ WIRED | Built page at `_site/species/abagrotis-apposita/index.html` contains `high-res-available` attribute with correct specimens JSON |
| bunny.net CDN | Browser XHR for `.dzi` | `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi` | ✓ WIRED | CDN URL returns HTTP 200; `access-control-allow-origin: *` confirmed via `curl -I` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `_site/species/abagrotis-apposita/index.html` | `highResEntry` → `high-res-specimens` attribute | `speciesPhotos.js` reads `data/species-photos.json` → Eleventy data tree → species.njk | Yes — real specimen records with specimen_id, view, tiles_path | ✓ FLOWING |
| `pnwm-image-slideshow.js` `_buildDziUrl` | `cdnBaseUrl + specimen.tiles_path + id-view.dzi` | Component reads attributes from HTML; `cdnBaseUrl` from Eleventy global `addGlobalData` | Yes — produces real CDN URL verified live (HTTP 200) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CDN DZI descriptor is reachable | `curl -s -o /dev/null -w "%{http_code}" https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi` | 200 | ✓ PASS |
| CDN base tile is reachable | `curl -s -o /dev/null -w "%{http_code}" https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D_files/0/0_0.webp` | 200 | ✓ PASS |
| CORS header present on DZI URL | `curl -sI -H "Origin: http://localhost:8080" https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi` | `access-control-allow-origin: *` | ✓ PASS |
| Exactly 1 species page has high-res-available | `grep -l 'high-res-available' _site/species/*/index.html \| wc -l` | 1 (abagrotis-apposita) | ✓ PASS |
| Species page count unchanged | `find _site/species -name 'index.html' \| wc -l` | 1380 | ✓ PASS |
| All tests pass | `npm test` | 217/217 pass, 0 fail | ✓ PASS |
| OSD viewer launches in browser | Cannot check without running browser | — | ? SKIP — human verification required |

---

### Probe Execution

Step 7c: SKIPPED — no conventional `scripts/*/tests/probe-*.sh` files defined for Phase 28; this is a pilot phase with human-action checkpoints rather than scripted probes.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PILOT-01 | 28-01, 28-02, 28-03, 28-04, 28-05 | One hand-picked species rendered via OSD on production page; tile pyramid at production URL; hand-edited JSON entry; vips recipe documented; pilot lessons recorded | ? PARTIALLY VERIFIED | All static/build/CDN checks pass; OSD browser execution requires human confirmation (SC-1 partially human-gated) |

No orphaned requirements — PILOT-01 is the only requirement mapped to Phase 28 and it is covered by all five plans.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `PILOT-LESSONS.md` line 53 | `{slug}` | Token in URL pattern documentation | ℹ INFO | Not a placeholder — it is documenting the URL template convention, not an unfilled value. The same line also shows `{specimen_id}-{view}` which is intentional template notation. Not a stub. |

No `TBD`, `FIXME`, or `XXX` markers found in any Phase 28 modified files. No unreferenced debt markers.

**Notable deviation (not a blocker):** Plan 28-01 specified `--suffix .jpg[Q=85]` for tile format. The operator chose WebP (`--suffix .webp[Q=80]`) after confirming ~30% size reduction. TILE-RECIPE.md was updated to reflect the confirmed parameters. This deviation is fully documented in the TILE-RECIPE.md, both SUMMARY files, and PILOT-LESSONS.md.

**Notable deviation (not a blocker):** Plan 28-02 specified artifact path `src/_data/species-photos.js`. The file was created under that name in commit `f4aa7d0d` then renamed to `src/_data/speciesPhotos.js` in commit `5d71b7cd` after discovering that Eleventy 3.1.5 uses the filename stem verbatim (not camelCased). The renamed file fully satisfies the artifact's purpose and the Nunjucks template variable `speciesPhotos` works correctly in the built output.

---

### Human Verification Required

#### 1. OSD Viewer End-to-End in Real Browser

**Test:** Start `npm run dev`, navigate to `http://localhost:8080/species/abagrotis-apposita/`, open DevTools Console + Network, click the species photo to open the lightbox.
**Expected:**
- Lightbox opens with dark background (#111)
- OSD canvas appears; tiles load progressively from `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/...`
- Network tab shows `.dzi` XHR returns 200 with no CORS errors in Console
- Pan (drag), zoom (scroll-wheel), and home-reset (home button) all work
- Specimen metadata below canvas reads "Specimen A · Dorsal" or "Specimen A · Ventral"
- Close via × button: overlay closes, no console error
- Re-open: OSD initializes again cleanly (verifies destroy() lifecycle)
**Why human:** Browser-rendered OSD behavior, WebGL canvas interaction, and Network-tab inspection cannot be verified by static file analysis.

#### 2. No Regression — Two Non-Pilot Species Pages

**Test:** Navigate to two arbitrary species pages (not abagrotis-apposita) and click the lightbox photo.
**Expected:**
- Phase 23 static `<img>` lightbox opens (no OSD canvas, no OSD nav controls)
- No OSD-related errors in DevTools Console
- Close button works; carousel behavior unchanged
**Why human:** Requires actual browser rendering to confirm the `useOsd === false` branch behaves identically to Phase 23's static lightbox.

---

### Gaps Summary

No blocking gaps found. All static/build/CDN evidence supports goal achievement. Two items requiring human verification remain:

1. The OSD viewer user experience in a real browser (pan/zoom/home, tile loading, open/close lifecycle) — this is the "integration moment of truth" SC-1 from the ROADMAP.
2. Non-pilot species page regression check (visual confirmation that the dual-condition gate holds in actual browser rendering).

These are expected human-verification items for a browser-rendered feature; no code changes should be needed before human verification.

---

_Verified: 2026-05-24_
_Verifier: Claude (gsd-verifier)_
