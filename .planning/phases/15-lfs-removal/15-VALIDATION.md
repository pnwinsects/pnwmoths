---
phase: 15
slug: lfs-removal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner |
| **Config file** | none — tests passed explicitly |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | LFS-01 | — | N/A | manual/shell | `git lfs ls-files \| wc -l` (expect 0) | n/a | ⬜ pending |
| 15-01-02 | 01 | 1 | LFS-01 | — | N/A | manual/shell | `grep "filter=lfs" .gitattributes 2>/dev/null \|\| echo PASS` | n/a | ⬜ pending |
| 15-01-03 | 01 | 1 | LFS-01 | — | N/A | manual | fresh clone produces no images/ directory | n/a | ⬜ pending |
| 15-01-04 | 01 | 1 | LFS-02 | — | N/A | manual/shell | `grep "actions/checkout" .github/workflows/*.yml` | ✅ | ⬜ pending |
| 15-01-05 | 01 | 1 | LFS-01 | — | N/A | automated | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed.

*This phase's verification is entirely shell-level git/filesystem checks. The existing `npm test` suite must remain green post-rewrite to confirm the build pipeline was not affected.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fresh clone produces no `images/` directory | LFS-01 (criterion 2) | Requires cloning from GitHub remote | `git clone https://github.com/pnwinsects/pnwmoths.git /tmp/pnwmoths-verify && ls /tmp/pnwmoths-verify/images/ 2>/dev/null \|\| echo PASS` |
| GitHub Actions CI completes without LFS errors | LFS-02 | Requires live CI run on GitHub | Push to main and observe deploy.yml + pr-check.yml output in GitHub Actions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
