---
phase: 11
slug: accordion-component
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` (no external runner) |
| **Config file** | None — test files listed explicitly in `package.json` scripts.test |
| **Quick run command** | `node --test src/components/pnwm-taxon-browser.test.js` |
| **Full suite command** | `node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test src/components/pnwm-taxon-browser.test.js`
- **After every plan wave:** Run `node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-??-01 | ?? | 0 | BROWSE-02 | — | N/A | unit | `node --test src/components/pnwm-taxon-browser.test.js` | ❌ W0 | ⬜ pending |
| 11-??-02 | ?? | 0 | BROWSE-03/04/05 | — | N/A | unit | `node --test src/components/pnwm-taxon-browser.test.js` | ❌ W0 | ⬜ pending |
| 11-??-03 | ?? | 0 | SFILT-02 | — | N/A | unit | `node --test src/components/pnwm-taxon-browser.test.js` | ❌ W0 | ⬜ pending |
| 11-??-04 | ?? | 1 | BROWSE-06 | — | N/A | existing | `node --test scripts/build-data.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/pnwm-taxon-browser.test.js` — unit tests for `buildStateMap`, `taxonHasState`, `collectSlugs` pure functions (covers BROWSE-02 through BROWSE-05, SFILT-02)

*No framework install needed — `node:test` is built-in to Node 22.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Accordion expand/collapse renders correctly at all 4 levels | BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05 | Requires DOM + browser JS | Open `/browse/` in browser; expand family → subfamily → genus; verify species links appear |
| Navigation image strip displays with 93px height | BROWSE-02 | Requires visual inspection | DevTools inspect `.navImages` height; confirm 93px; horizontal scroll on mobile viewport |
| Images hide when parent expanded | BROWSE-03, BROWSE-04 | Requires DOM rendering | Expand a family; confirm family-level images are hidden; expand subfamily, confirm subfamily images hidden |
| State filter mutes (not hides) taxa with no records | SFILT-02 | Requires DOM + fetch | Select a state; confirm taxa with no records are dimmed but still in DOM |
| Show/hide images toggle works globally | BROWSE-07 | Requires DOM rendering | Click toggle; confirm all image strips hide/show |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
