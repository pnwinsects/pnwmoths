---
phase: 9
slug: build-pipeline-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` (no external runner) |
| **Config file** | none — tests listed explicitly in `npm test` script |
| **Quick run command** | `node --test scripts/build-data.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test scripts/build-data.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | SFILT-01 | — | SELECT DISTINCT bounds output size | unit | `node --test scripts/build-data.test.js` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | SFILT-01 | — | `_site/species-states.json` written with correct shape | integration | `node --test scripts/build-data.test.js` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | SC-2 | — | taxon.js returns correct family→subfamily→genus→species tree | unit | `node --test scripts/build-data.test.js` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | SC-2 | — | null subfamily uses sentinel; navImages up to 4 per level | unit | `node --test scripts/build-data.test.js` | ❌ W0 | ⬜ pending |
| 9-regression | all | all | SC-4 | — | existing 39 tests remain green | regression | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/build-data.test.js` — add tests for `emit-species-states.js` (DISTINCT pair count, file written to `_site/`)
- [ ] `scripts/build-data.test.js` — add tests for `taxon.js` default export (tree structure, null-subfamily sentinel, navImages capped at 4)

*Both follow the synthetic-fixture pattern already established in `build-data.test.js`.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
