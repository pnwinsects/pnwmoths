---
phase: 5
slug: maintainability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | npm scripts (no unit test framework — shell/CI validation) |
| **Config file** | package.json scripts |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && npm run validate` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build && npm run validate`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | MAINT-01 | — | N/A | manual | (see Manual Verifications) | ✅ | ⬜ pending |
| 5-01-02 | 01 | 1 | MAINT-02 | — | N/A | automated | `npm run build` exits 0 after push | ✅ | ⬜ pending |
| 5-01-03 | 01 | 2 | MAINT-03 | — | N/A | manual | CI timing check in GitHub Actions UI | ❌ W0 | ⬜ pending |
| 5-01-04 | 01 | 2 | MAINT-04 | — | N/A | manual | Docker build + run produces identical output | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (build scripts already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Maintainer can add species using only ADDING_SPECIES.md | MAINT-01 | Requires human judgment on instruction clarity | Follow instructions as written, add a test species, verify site builds and deploys |
| CI build completes in under 5 minutes | MAINT-03 | Requires actual GitHub Actions runner timing | Observe Actions run duration in GitHub UI after first push |
| Docker build produces identical output to CI | MAINT-04 | Requires running Docker locally and diffing output | Run `docker build` then build command; compare with CI artifact |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
