---
phase: 4
slug: search-glossary-and-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `node --test scripts/build-data.test.js` |
| **Full suite command** | `node --test scripts/build-data.test.js src/components/*.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test scripts/build-data.test.js`
- **After every plan wave:** Run `node --test scripts/build-data.test.js src/components/*.test.js`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| SRCH-01 | search | 1 | SRCH-01 | — | N/A | smoke | `ls _site/pagefind/pagefind-ui.js` | ❌ W0 | ⬜ pending |
| SRCH-02 | search | 1 | SRCH-02 | — | N/A | manual | Browser: search "Acronicta" + "dagger moth" | ❌ manual | ⬜ pending |
| SRCH-03 | search | 1 | SRCH-03 | — | N/A | manual | Browser: verify no collector names in results | ❌ manual | ⬜ pending |
| SRCH-04 | search | 1 | SRCH-04 | — | N/A | smoke | `ls _site/search/index.html` | ❌ W0 | ⬜ pending |
| GLOS-01 | glossary | 1 | GLOS-01 | — | N/A | unit | `node --test scripts/build-data.test.js` (glossary sort) | ❌ W0 | ⬜ pending |
| VALD-01 | validation | 2 | VALD-01 | — | N/A | smoke | `npm run build:validate-links` exits 0 | ❌ W0 | ⬜ pending |
| VALD-02 | validation | 2 | VALD-02 | — | N/A | unit | `node --test scripts/check-page-weight.test.js` | ❌ W0 | ⬜ pending |
| VALD-03a | validation | 2 | VALD-03 | — | N/A | unit | `node --test scripts/build-data.test.js` (orphan IDs) | ✅ partial | ⬜ pending |
| VALD-03b | validation | 2 | VALD-03 | — | N/A | unit | `node --test scripts/build-data.test.js` (bad state) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `scripts/build-data.test.js` — VALD-03 state validation test (add `records-bad.csv` fixture with invalid state value)
- [ ] `scripts/check-page-weight.test.js` — covers VALD-02 warning behavior (create fake >500KB HTML, assert warn output)
- [ ] `data/glossary.csv` — required data file; must exist with at least one row for build to succeed
- [ ] Add `npm run build:validate-links` script in `package.json` — calls lychee CLI

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Species names appear in search results | SRCH-02 | Pagefind index only queryable in browser | Build → open `_site/search/` → search "Acronicta", confirm species page results |
| No occurrence data in search results | SRCH-03 | No automated DOM query without headless browser | Build → search collector name (e.g., "Smith") → verify no results |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
