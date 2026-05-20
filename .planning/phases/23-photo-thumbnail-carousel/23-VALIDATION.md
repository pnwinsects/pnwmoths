---
phase: 23
slug: photo-thumbnail-carousel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-20
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node.js test runner) |
| **Config file** | none — tests run via `node --test src/components/*.test.js` |
| **Quick run command** | `node --test src/components/pnwm-image-slideshow.test.js` |
| **Full suite command** | `node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/migrate-species.test.js src/components/*.test.js src/_lib/*.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test src/components/pnwm-image-slideshow.test.js` (if file exists; otherwise manual browser check)
- **After every plan wave:** Run full suite (`npm test`)
- **Before `/gsd:verify-work`:** Full suite green + manual lightbox verification
- **Max feedback latency:** ~5 seconds (automated); manual checks as needed

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | PHOTO-01 | — | N/A | manual | — | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | PHOTO-02 | — | N/A | manual | — | ❌ W0 | ⬜ pending |
| 23-01-03 | 01 | 1 | PHOTO-03 | — | N/A | unit | `node --test src/components/pnwm-image-slideshow.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/pnwm-image-slideshow.test.js` — create test file with pure-logic stubs for `_formatCaption`; confirms import path and node:test harness work for this component

*Note: Browser-dependent behaviors (PHOTO-01/02/03 interactive) require manual verification. No automated test gap exists for the interactive behaviors because the project has no browser test harness (Playwright, Web Test Runner, etc.).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thumbnail strip visible below main image | PHOTO-01 | Requires shadow DOM rendering in browser | Open a species page with multiple photos; confirm thumbnail strip appears below main image at 93px height |
| Click thumbnail selects as main image | PHOTO-01 | DOM event interaction | Click any thumbnail; confirm main image updates to that photo |
| Dot navigation absent | PHOTO-02 | Shadow DOM inspection | Open DevTools > Elements > expand shadow root; confirm no `.dots` or `.dot` elements |
| Index label absent | PHOTO-02 | Shadow DOM inspection | Confirm no `.index-label` span in shadow DOM |
| Prev/next scroll strip (not navigate) | PHOTO-01 | Requires scroll interaction | Click ‹/›; confirm strip scrolls left/right; main image unchanged |
| Buttons hidden when no overflow | PHOTO-01 | ResizeObserver behavior | On species with 1–2 photos (strip fits); confirm ‹/› buttons absent |
| Buttons visible when overflow | PHOTO-01 | ResizeObserver behavior | On species with many photos (strip overflows); confirm ‹/› buttons appear |
| Lightbox close button works | PHOTO-03 | Requires click interaction | Open lightbox; click ✕; confirm lightbox dismisses without page reload |
| Escape closes lightbox | PHOTO-03 | Keyboard interaction | Open lightbox; press Escape; confirm dismisses |
| Active thumbnail scrolls into view | PHOTO-01 | scrollIntoView behavior | Navigate to a photo beyond visible strip area; confirm active thumbnail scrolls into view |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
