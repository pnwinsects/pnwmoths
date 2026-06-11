---
phase: 33
slug: toolchain-schema-scaffolding
status: draft
nyquist_compliant: true
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

> Each task maps to an automated command. The toolchain itself (3 tsconfigs +
> `typecheck` script) is the Wave 0 dependency for every downstream `tsc --noEmit`
> assertion — it is bootstrapped in 33-01 Task 2.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | TS-04 | T-33-02, T-33-03, T-33-SC | Type pkgs in devDependencies; @types/openseadragon removed; @types/node pinned ^24 | cli/source | `node -e` package.json classification assertion (33-01 Task 1 verify) | ❌ W0 | ⬜ pending |
| 33-01-02 | 01 | 1 | TS-01, TS-02, TS-03, TS-05 | — | Locked tsconfig flags (useDefineForClassFields:false, isolatedModules, allowImportingTsExtensions); no enum in shim | cli/source | `npm run typecheck` + tsconfig/shim flag assertion (33-01 Task 2 verify) | ❌ W0 | ⬜ pending |
| 33-02-01 | 02 | 2 | SCHEMA-01, SCHEMA-02 | T-33-04 | 7 schemas + z.infer<> types; OccurrenceRecord accepts all-null nullable row | cli/source | `npm run typecheck` + schema export + null-row acceptance assertion (33-02 Task 1 verify) | ❌ W0 (33-01) | ⬜ pending |
| 33-02-02 | 02 | 2 | SCHEMA-03 | T-33-04, T-33-05, T-33-06 | Every production row parses against its schema (0 rejected) | cli | `node scripts/profile-data.ts` (33-02 Task 2 verify) | ❌ W0 (33-02-01) | ⬜ pending |
| 33-02-03 | 02 | 2 | TS-03, TS-05 | — | No enum in source; build still emits 1,364 species pages | cli | enum grep + `npm run typecheck` + `npm run build` page count == 1364 (33-02 Task 3 verify) | ❌ W0 (33-02-01/02) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm run typecheck` script + 3 tsconfig files — the toolchain itself is the Wave 0 dependency for every downstream typecheck assertion (created in 33-01 Task 2)
- [ ] Data-profile acceptance harness `scripts/profile-data.ts` — required for the SCHEMA-03 gate (created in 33-02 Task 2; the null distribution itself is already profiled in RESEARCH.md Q5)

*This phase bootstraps its own verification infrastructure (the typecheck gate). Until the tsconfigs and the `typecheck` script exist (33-01 Task 2), no `tsc --noEmit` assertion can run.*

---

## Manual-Only Verifications

None. Every gate in this phase is automatable:
- Toolchain config → `npm run typecheck` + JSON assertions on tsconfig flags
- Schema acceptance (SCHEMA-03) → `node scripts/profile-data.ts` parses the full production dataset
- No-regression page count → `ls -d _site/species/*/index.html | wc -l` after `npm run build`

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (typecheck toolchain + profile harness)
- [x] No watch-mode flags
- [x] Feedback latency < 60s (typecheck ~3-5s; profile harness scans CSVs once)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
