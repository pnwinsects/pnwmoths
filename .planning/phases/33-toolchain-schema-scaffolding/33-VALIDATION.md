---
phase: 33
slug: toolchain-schema-scaffolding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (Node 24 native test runner) |
| **Config file** | none — tests are `*.test.js`/`*.test.ts` discovered by npm test glob |
| **Quick run command** | `npm run typecheck` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Filled by the planner from the per-plan task breakdown. Each task that produces
> a checkable artifact (tsconfig, schema module, profile output, typecheck gate)
> must map to an automated command below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | TS-01 | — | N/A | cli | `npm run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm run typecheck` script + 3 tsconfig files — the toolchain itself is the Wave 0 dependency for every downstream typecheck assertion
- [ ] Data-profile harness (DuckDB) — required before schema finalization (SCHEMA-03)

*This phase bootstraps its own verification infrastructure (the typecheck gate). Until the tsconfigs and the `typecheck` script exist, no `tsc --noEmit` assertion can run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing `.js` build still emits 1,364 species pages unchanged | (all) | Full build + page count is a slow end-of-phase smoke check | `npm run build` then count `_site/species/*/index.html` |

*Schema-acceptance against full production data (SCHEMA-03) is automatable via the DuckDB profile + a schema-parse pass and should be wired as an automated command, not manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
