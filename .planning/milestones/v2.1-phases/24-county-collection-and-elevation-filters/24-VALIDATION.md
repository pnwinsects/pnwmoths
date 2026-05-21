---
phase: 24
slug: county-collection-and-elevation-filters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-20
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` |
| **Config file** | none — existing infrastructure |
| **Quick run command** | `node --test src/components/filters.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test src/components/filters.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | FILT-01 | — | N/A | unit | `node --test src/components/filters.test.js` | ✅ | ⬜ pending |
| 24-01-02 | 01 | 1 | FILT-02 | — | N/A | unit | `node --test src/components/filters.test.js` | ✅ | ⬜ pending |
| 24-01-03 | 01 | 1 | FILT-03 | — | N/A | unit | `node --test src/components/filters.test.js` | ✅ | ⬜ pending |
| 24-01-04 | 01 | 1 | FILT-04 | — | N/A | unit | `node --test src/components/filters.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `src/components/filters.test.js` exists and passes 7 tests. New test cases for county, collection, and elevationMin/elevationMax filter dimensions will be appended to the existing file — no new framework setup needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| County dropdown populates from Parquet data in browser | FILT-01 | Requires live Parquet fetch | Load a species page, open filter bar, verify county dropdown has species-specific options |
| Collection dropdown populates from Parquet data in browser | FILT-02 | Requires live Parquet fetch | Load a species page, open filter bar, verify collection dropdown has species-specific options |
| Elevation slider filters map pins in real time | FILT-03 | Requires Leaflet map rendering | Drag elevation handles, verify map pins update |
| All filters work together with existing state/year filters | FILT-04 | Integration across components | Apply multiple filter types simultaneously, verify map and chart both update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
