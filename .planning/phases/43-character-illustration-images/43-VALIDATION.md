---
phase: 43
slug: character-illustration-images
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test`) + tsx |
| **Config file** | none — test files listed explicitly in package.json `test` script |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | CIMG-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/upload-images.test.ts` — stubs for CIMG-01 (must be added to package.json `test` list — `node --test` lists files explicitly, no glob)
- [ ] matcher unit test — stubs for CIMG-02 normalized state↔filename matching

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full `key:upload-images` run uploads to bunny.net idempotently | CIMG-01 | Requires live BUNNY_API_KEY + network; cannot run in CI | `DRY_RUN=1 npm run key:upload-images` (preflight), then a real run + rerun shows zero new PUTs |
| `<details>` expander shows CDN image in panel | CIMG-03 | Requires browser render of live CDN image | Open `/identify/`, expand a mapped character state, confirm image loads |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
