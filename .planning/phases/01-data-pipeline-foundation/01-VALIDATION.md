---
phase: 1
slug: data-pipeline-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) or vitest — Wave 0 decides |
| **Config file** | `package.json` scripts or `vitest.config.js` — Wave 0 installs |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run build && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run build && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | DATA-01 | — | N/A | integration | `npm run build && ls _site/species/ \| wc -l` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | DATA-02 | — | N/A | integration | `npm run build && ls _site/species/**/*.parquet \| head -1` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 2 | DATA-05 | — | malformed row → build fail with message | unit | `node scripts/validate-csv.js data/records-bad.csv 2>&1 \| grep -q "error"` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 2 | DATA-03 | — | N/A | unit | `npm test -- --grep "slug"` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 3 | DATA-04 | — | N/A | integration | `npm run build 2>&1 \| grep -v error; echo $?` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/pipeline.test.js` — stubs for DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
- [ ] `data/records-bad.csv` — malformed test fixture for DATA-05 testing
- [ ] `data/species.csv` and `data/records.csv` — stub CSV files (if not present)
- [ ] Test framework install (vitest or node:test config) — if no framework detected

*Wave 0 must establish test infrastructure before implementation tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clean checkout build completes without manual intervention | DATA-06 | Requires fresh `git clone` + `npm install` | Clone repo to temp dir, run `npm install && npm run build`, verify 0 errors |
| Per-species Parquet contains correct occurrence records | DATA-02 | Requires data accuracy check, not just file existence | Build, pick 2-3 species, cross-reference Parquet row count vs CSV source |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
