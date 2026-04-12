---
phase: 3
slug: client-side-interactivity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.js (Wave 0 installs) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | INTV-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | INTV-01 | — | N/A | e2e | `npm run build` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | INTV-02 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | INTV-03 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 2 | INTV-04 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 2 | INTV-05 | — | N/A | manual | — | — | ⬜ pending |
| 03-01-07 | 01 | 2 | INTV-06 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/components/occurrence-map.test.js` — stubs for INTV-01
- [ ] `tests/components/phenology-chart.test.js` — stubs for INTV-02
- [ ] `tests/components/filter-controls.test.js` — stubs for INTV-03
- [ ] `tests/components/image-slideshow.test.js` — stubs for INTV-04, INTV-06
- [ ] `vitest.config.js` — configure jsdom environment for Lit components

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Occurrence data visible without JS | INTV-05 | Requires browser with JS disabled | Load species page in browser with JS disabled; verify `<noscript>` notice and static photo/taxonomy content visible |
| Map markers appear without full page reload | INTV-01 | Requires browser network inspection | Load species page; verify Leaflet map renders with markers; confirm no full page reload on initial render |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
