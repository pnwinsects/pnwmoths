---
phase: 39
slug: key-matrix-data-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (Node 24 native runner + native TS type-stripping) |
| **Config file** | none — explicit file list in `package.json` `test` script; new test files must be appended there |
| **Quick run command** | `node --test scripts/build-key.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–20 seconds (full suite); <2s for a single new test file |

---

## Sampling Rate

- **After every task commit:** Run `node --test scripts/build-key.test.ts` (plus `npm run typecheck` after any `.ts` signature change)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite green + `npm run build` produces a valid `data/key-matrix.json` within the gzip ≤ 50 KB budget
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

> Scaffold — the planner aligns concrete task IDs to these requirement rows. Every Phase 39 requirement (KEY-01..05) plus the matching requirements pulled into this phase (MATCH-01..03 per 39-CONTEXT.md D-02) must map to an automated check.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | KEY-01 | — | N/A | unit | `node --test scripts/build-key.test.ts` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | KEY-02 | — | N/A | unit | `node --test scripts/build-key.test.ts` | ❌ W0 | ⬜ pending |
| 39-01-03 | 01 | 1 | MATCH-01 / MATCH-02 | — | N/A | unit | `node --test scripts/build-key.test.ts` | ❌ W0 | ⬜ pending |
| 39-01-04 | 01 | 1 | KEY-03 | — | Zod schema rejects malformed artifact at build time | unit | `node --test scripts/build-key.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 2 | KEY-04 | T-39-01 | post-build gzip ≤ 50 KB gate fails build on bloat | integration | `npm run build:check-key-weight` | ❌ W0 | ⬜ pending |
| 39-02-02 | 02 | 2 | KEY-05 / MATCH-03 | — | N/A | integration | `npm run build` (produces valid artifact <5s) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/build-key.test.ts` — new test file covering: CSV parse with `columns: false`, whitespace normalization (double-space binomials e.g. `Tolype  laricis`, `Grammia  blakei`), slug resolution + synonym fallback, per-state bitset shape/length, Zod schema acceptance/rejection
- [ ] Append `scripts/build-key.test.ts` to the `test` script file list in `package.json`
- [ ] No framework install needed — `node --test` already in use

*Existing `node --test` infrastructure covers all phase requirements once the new test file is added.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coverage report content is curation-useful | MATCH-02 | Correctness of the unmatched-binomial list is a human judgement (which taxa genuinely need synonyms) | After `npm run build`, open `data/key-coverage-report.json`; confirm the ~37 remaining unmatched binomials look like real reclassified/absent taxa, not parse artifacts |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (new `build-key.test.ts` + package.json test-glob entry)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
