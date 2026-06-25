---
phase: 40
slug: filter-logic-tdd-contract
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 40-RESEARCH.md § "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 24 built-in `--test`, `--strip-types`) — same as all existing `*.test.ts` |
| **Config file** | none — no jest/vitest config; `tsconfig.node.json` covers `src/_lib/**/*.test.ts` |
| **Quick run command** | `node --test src/_lib/key-filter.test.ts` |
| **Full suite command** | `npm test` (auto-discovers via the `src/_lib/*.test.ts` glob) |
| **Typecheck command** | `npm run typecheck` (browser + node tsconfigs, `--noEmit`) |
| **Estimated runtime** | < 2 seconds (unit fixtures) + artifact load for TC-6 |

---

## Sampling Rate

- **After every task commit:** `node --test src/_lib/key-filter.test.ts`
- **After every plan wave:** `npm test` (full suite)
- **Before `/gsd-verify-work`:** `npm test && npm run typecheck` both green
- **Max feedback latency:** < 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-01-xx | 01 | 1 | IDENT-04 | — | N/A (pure fn) | unit | `node --test src/_lib/key-filter.test.ts` | ❌ W0 | ⬜ pending |
| 40-0x-xx | — | 1 | IDENT-04 | — | input via validated KeyMatrix | unit | `node --test src/_lib/key-filter.test.ts` | ❌ W0 | ⬜ pending |
| 40-0x-xx | — | 2 | IDENT-04 | T-40 (V5 trivial) | `KeyMatrixMetaSchema.parse()` validates meta | typecheck | `npm run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · Plan/Wave/Task IDs finalized by the planner.*

---

## TDD Cases (the named correctness invariants — MUST all be green)

| TDD Case | Behavior Verified | Rule | Test Type |
|----------|-------------------|------|-----------|
| TC-1 single state narrows | Select one state → result ⊆ full set; species absent-but-scored-elsewhere eliminated | D-03 | unit (fixture) |
| TC-2 two states same question widen (OR) | Select S1+S2 under Q → result ≥ max(result(S1), result(S2)) | D-01 | unit (fixture) |
| TC-3 two questions AND narrows | Select across Q1+Q2 → result ≤ min of each alone | D-01 | unit (fixture) |
| TC-4 `0,0` pair NOT eliminated | Species scored 0 on all states of Q passes when any state of Q is selected | D-03/D-04 | unit (fixture) |
| TC-5 polymorphism keeps | `habrosyne-scripta` (WA+OR+ID…) stays when filtering for Washington | D-02 | unit (fixture + artifact) |
| TC-6 unscored always kept | `hypenodes-fractilinea`, `xestia-normanianus` appear in any filtered result | D-04 | integration (real artifact) |
| TC-7 empty selection → full | No constrained questions → all 1,192 species returned | D-03 base | unit |
| TC-8 buildQuestionGroups | 237 chars → 55 groups; per-group state counts match | — | unit |

**Real-artifact regression counts (documented as test comments):** WA=862; WA OR OR=1,011;
WA AND eyespot-Yes=8; eyespot-Yes only=10; forewing-yellow only=75; yellow OR orange=173; empty=1,192.

---

## Wave 0 Requirements

- [ ] `src/_lib/key-filter.ts` — does not exist; create with `buildQuestionGroups()` + `computeMatching()` + `Selection` / `MatchResult` / `QuestionGroups` types
- [ ] `src/_lib/key-filter.test.ts` — does not exist; create with all 8 TDD cases
- [ ] `KeyMatrixMetaSchema` in `src/types/schemas.ts` — define + add `meta` to `KeyMatrixSchema`
- [ ] `KeyFilterChangeDetail` in `src/types/events.ts` — define + augment `HTMLElementEventMap` with `pnwm-key-filter-change`
- [ ] `build-key.ts` `meta` emission + `data/key-matrix.json` regenerate

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | IDENT-04 | All phase behaviors are pure functions with automated unit/integration coverage | — |

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
