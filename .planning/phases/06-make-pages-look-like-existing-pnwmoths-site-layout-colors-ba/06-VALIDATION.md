---
phase: 6
slug: make-pages-look-like-existing-pnwmoths-site-layout-colors-ba
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-15
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — visual/CSS phase, manual browser verification |
| **Config file** | none |
| **Quick run command** | `npx @11ty/eleventy --serve` (visual inspection) |
| **Full suite command** | `npx @11ty/eleventy` (build check) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx @11ty/eleventy` to confirm build succeeds
- **After every plan wave:** Visual inspection in browser
- **Before `/gsd-verify-work`:** Full build green + visual match to existing site
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | passthrough | — | N/A | build | `npx @11ty/eleventy` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | CSS theme | — | N/A | manual | visual inspection | ✅ | ⬜ pending |
| 06-01-03 | 01 | 1 | banner image | — | N/A | manual | visual inspection | ✅ | ⬜ pending |
| 06-01-04 | 01 | 1 | layout match | — | N/A | manual | visual inspection | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `eleventy.config.js` passthrough entries for `src/styles/` and `src/images/` — must be in place before CSS/image tasks

*Wave 0 covers passthrough setup so all subsequent visual tasks can be verified in the browser.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Header matches existing pnwmoths.org | UI-SPEC layout contract | Visual/pixel comparison | Open built site, compare side-by-side with pnwmoths.biol.wwu.edu |
| Color scheme matches | UI-SPEC colors | No automated color diffing | Inspect `--pico-primary`, nav background, link colors in DevTools |
| Banner image displays correctly | UI-SPEC banner | Asset serving verification | Confirm `header.png` loads, correct dimensions, no broken img |
| Welcome text CTA renders | D-03 requirement | DOM structure check | Verify single `<a>` CTA replaces `<ul>` links |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
