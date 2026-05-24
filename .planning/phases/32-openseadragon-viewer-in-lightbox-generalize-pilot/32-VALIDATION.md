---
phase: 32
slug: openseadragon-viewer-in-lightbox-generalize-pilot
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-23
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Eleventy build (static site) + `node --test` for component unit tests + browser manual verification |
| **Config file** | `eleventy.config.js` |
| **Quick run command** | `npm run build` |
| **Component test command** | `node --test src/components/pnwm-image-slideshow.test.js` |
| **Full suite command** | `npm test && npm run build` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` (or `node --test` for component tasks)
- **After every plan wave:** Run `npm test && npm run build` and verify OSD/static paths in browser
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | VIEWER-01 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 32-01-02 | 01 | 1 | VIEWER-02 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 32-01-03 | 01 | 1 | VIEWER-03 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 32-01-04 | 01 | 1 | VIEWER-04 | — | N/A | manual | open browser on high-res and non-high-res species pages | ✅ | ⬜ pending |
| 32-02-01 | 02 | 1 | VIEWER-01, VIEWER-02, VIEWER-04 | T-32-02-02, T-32-02-03, T-32-02-05 | optional-chain guard on null OSD viewer; modulo wrap prevents OOB index; Lit `${...}` interpolation auto-escapes specimen_id/view in caption | unit | `node --test src/components/pnwm-image-slideshow.test.js` | ✅ | ⬜ pending |
| 32-02-02 | 02 | 1 | VIEWER-01, VIEWER-02, VIEWER-03 | T-32-02-01, T-32-02-06 | `useOsd &&` guard preserves low-res `<img>` path (VIEWER-02); `_buildDziUrl` only consumes operator-controlled manifest entries (no user input to `viewer.open`); ResizeObserver guard unchanged | unit + build | `node --test src/components/pnwm-image-slideshow.test.js && npm run build` | ✅ | ⬜ pending |
| 32-03-01 | 03 | 2 | VIEWER-01, VIEWER-02, VIEWER-03, VIEWER-04 | T-32-03-02 | fresh build before HTML assertions prevents stale `_site/` masking current code state | build + HTML assertions | `npm test && npm run build && test -f _site/species/abagrotis-apposita/index.html && grep -c '_files/0/0_0.webp' _site/species/abagrotis-apposita/index.html` | ✅ | ⬜ pending |
| 32-03-02 | 03 | 2 | VIEWER-01, VIEWER-02, VIEWER-03, VIEWER-04 | T-32-03-01 | resume-signal requires explicit `approved` / `approved with follow-ups` / `blocked` recorded in summary (non-repudiation) | manual (human-verify checkpoint) | open dev server in browser; exercise pilot + control + single-specimen flows | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework installation needed:

- `npm run build` validates Eleventy template output and detects template regressions (Plan 01, Plan 03).
- `node --test src/components/pnwm-image-slideshow.test.js` validates the Lit component logic (Plan 02). Plan 02 Task 1 extends the existing test file with 7 new tests covering wrap-around navigation, null-viewer safety, `useOsd` derivation (low-res regression), and view→label mapping (VIEWER-04). These tests fill the Wave 0 gaps identified in RESEARCH.md before any implementation lands.
- Browser-based human-verify in Plan 03 covers the OSD pan/zoom and lightbox-flow behaviors that cannot be automated.

No new test runner, framework, or harness is required. Wave 0 is complete by virtue of the existing `node --test` + `npm run build` toolchain plus the human-verify checkpoint in Plan 03 Task 2.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OSD pan/zoom works on high-res species page | VIEWER-01 | Requires browser interaction with OpenSeadragon canvas | Open a high-res species page, click thumbnail, verify OSD loads and pan/zoom/home-reset work |
| Static lightbox renders on non-high-res species page | VIEWER-02 | Requires browser comparison between code paths | Open a non-high-res species page, click thumbnail, verify static `<img>` appears (not OSD) |
| Carousel unchanged across both paths | VIEWER-03 | Requires browser testing of hover/click/keyboard/touch | Test carousel interactions on both high-res and non-high-res pages |
| specimen_id and view label visible in OSD viewer | VIEWER-04 | Requires visual inspection of rendered label | Open multi-photo high-res species, verify label shows correct specimen_id and D/V view |
| In-lightbox prev/next swaps OSD tile source without close/reopen flicker | VIEWER-01 | Requires visual confirmation of `viewer.open(newDziUrl)` swap behavior in the browser | Open multi-specimen lightbox, click prev/next, confirm tiles swap in place and caption updates |
| Close button (×) dismisses lightbox while OSD is active | VIEWER-01 | Requires confirming z-index fix resolves Phase 23 todo with OSD canvas present | Open OSD lightbox, click the × button, confirm lightbox closes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Plan 03 Task 2 is the sole human-verify checkpoint by design — covered under Manual-Only Verifications)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (longest run = 1; Plan 03 Task 2 is bracketed by Plan 03 Task 1's automated checks and the prior wave's automated tasks)
- [x] Wave 0 covers all MISSING references (Plan 02 Task 1 adds the 7 tests called out as Wave 0 gaps in RESEARCH.md before Plan 02 Task 2 lands implementation)
- [x] No watch-mode flags (`node --test` and `npm run build` are one-shot)
- [x] Feedback latency < 20s (estimated runtime ~20s for the combined suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for sign-off
