---
phase: 37
slug: lit-web-components-migration
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-10
updated: 2026-06-10
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (Node 24 native type-stripping; no additional loader — Phase 38 SC-2 / MIG-05) |
| **Config file** | `package.json` (`test` script glob → `src/components/*.test.ts` after Plan 05) |
| **Quick run command** | `npm run typecheck` (`tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | typecheck ~10–20s; full suite ~5–15s (218 existing tests + new validator cases) |

---

## Sampling Rate

- **After every task commit:** `npm run typecheck` (and the task's targeted `node --test <file>` where a test file is touched)
- **After every plan wave:** `npm test` (full suite)
- **Before `/gsd-verify-work`:** full suite green + SC-4 bundle grep clean + SC-5 baseline diff approved
- **Max feedback latency:** < 30 seconds (typecheck dominates)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | MIG-04, SCHEMA-08 | T-37-01 | schema migration preserves accepted/rejected shapes | static + unit | `npm run typecheck && npm test` | ✅ | ⬜ pending |
| 37-01-02 | 01 | 1 | MIG-04 | — | typed event contract (no runtime) | static | `npm run typecheck` | ❌ W0 (events.ts new) | ⬜ pending |
| 37-01-03 | 01 | 1 | — (SC-5 baseline) | T-37-09 | fresh pre-migration snapshot for byte-identity gate | build snapshot | `test -d _site_baseline && ls _site_baseline/assets/main-*.js` | ✅ | ⬜ pending |
| 37-02-01 | 02 | 2 | SCHEMA-08 | T-37-02 | O(columns) Parquet validator throws on missing column | static + unit | `npm run typecheck` | ❌ W0 (validator cases new) | ⬜ pending |
| 37-02-02 | 02 | 2 | MIG-04 | — | CustomEvent<FilterChangeDetail> dispatch, no decorators | static | `npm run typecheck` | ✅ | ⬜ pending |
| 37-02-03 | 02 | 2 | SCHEMA-08 | T-37-02 | validator unit tests (missing-column throws; complete-set passes) | unit | `node --test src/components/parquet-cache.test.ts src/components/filters.test.ts src/components/phenology.test.ts` | ❌ W0 (new cases) | ⬜ pending |
| 37-03-01 | 03 | 2 | MIG-04 | — | slideshow typed; class imported directly under node --test | unit | `node --test src/components/pnwm-image-slideshow.test.ts` | ✅ | ⬜ pending |
| 37-03-02 | 03 | 2 | MIG-04 | T-37-04 | popup Lit html escaping preserved | static | `npm run typecheck` | ✅ | ⬜ pending |
| 37-03-03 | 03 | 2 | MIG-04 | — | glossary-tooltip typed DOM script | static | `npm run typecheck` | ✅ | ⬜ pending |
| 37-04-01 | 04 | 3 | MIG-04 | — | map/phenology typed; filter-change listener typed via merge | static | `npm run typecheck` | ✅ | ⬜ pending |
| 37-04-02 | 04 | 3 | SCHEMA-08 | T-37-05, T-37-06, T-37-07 | O(1) species-states validator; D-05 hard-fail on schema mismatch | static + unit | `npm run typecheck` | ✅ | ⬜ pending |
| 37-04-03 | 04 | 3 | SCHEMA-08 | T-37-05 | validator unit tests (non-array throws; bad-shape throws; valid/empty pass) | unit | `node --test src/components/pnwm-taxon-browser.test.ts` | ❌ W0 (new cases) | ⬜ pending |
| 37-05-01 | 05 | 4 | MIG-04 | — | all .js→.ts; full suite green; zero .js source | static + unit | `npm run typecheck && npm test` | ✅ | ⬜ pending |
| 37-05-02 | 05 | 4 | SCHEMA-08, SC-4 | T-37-08 | no full-Zod in bundle; gzip delta recorded | bundle grep | `npm run build && grep -c 'ZodError\|ZodType' _site/assets/main-*.js` (= 0) | ✅ | ⬜ pending |
| 37-05-03 | 05 | 4 | SC-5 | T-37-09 | data byte-identical; HTML identical modulo asset hashes | diff + human-check | `diff -rq _site_baseline/ _site/` (human-verified) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The following test artifacts do not yet exist and are created as part of the plan tasks (each is the "GREEN-target" of its TDD task, not a separate scaffolding plan):

- [ ] `src/types/events.ts` — `FilterChangeDetail` + `HTMLElementEventMap` merge (Plan 01 Task 2; typecheck is the gate)
- [ ] Rename `src/components/*.test.js` → `*.test.ts` (Plans 02 Task 3, 03 Task 1, 04 Task 3) with `.ts` import specifiers
- [ ] Fresh `_site_baseline/` snapshot (Plan 01 Task 3) — pre-Phase-37 baseline for SC-5
- [ ] 2 new test cases in `parquet-cache.test.ts`: `assertParquetColumns` throws on missing column; passes on complete set (Plan 02 Task 3)
- [ ] 2+ new test cases in `pnwm-taxon-browser.test.ts`: species-states validator throws on non-array; throws on bad element shape; accepts valid/empty array (Plan 04 Task 3)

The two new SCHEMA-08 validators are designed as EXPORTED pure functions (`assertParquetColumns`, `validateSpeciesStates`) specifically so the Wave 0 test cases can exercise them without mocking `fetch`/`import.meta.env`/DOM.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HTML identical modulo content-hashed asset filenames | SC-5 | Vite content-hash filenames are non-deterministic between builds (Phase 34 finding); distinguishing an expected asset-hash diff from a real prose/markup regression needs human judgment | Plan 05 Task 3: run `diff -rq _site_baseline/ _site/`; confirm data files byte-identical and HTML differences confined to hashed asset references; type "approved" |

All other phase behaviors (type correctness, validator throws, event dispatch contract, full test suite, bundle Zod-absence) have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency (SC-5 checkpoint uses `<human-check>` + documented rationale)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task runs typecheck or node --test; only the final SC-5 task is human-gated)
- [x] Wave 0 covers all MISSING references (events.ts, test renames, baseline, new validator cases)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-10
