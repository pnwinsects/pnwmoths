---
phase: 38
slug: ci-gate-full-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Note: this is the v3.0 milestone **gate** phase — most verification reuses existing
> green commands (`npm test`, `npm run typecheck`, `npm run verify:parquet`). The only
> NEW automated artifact is the permanent MIG-06 guard (`scripts/check-ts-only.sh`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `--test` (no loader; Node 24 native type-stripping) |
| **Config file** | none — test filenames listed explicitly in `package.json` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` (same — 225 tests across 17 files) |
| **Estimated runtime** | ~7.5 seconds (225 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck` (1.8s) — every task in this phase touches CI config or guard scripts that must keep types/scripts green
- **After every plan wave:** Run `npm test` (full 225-test suite) + `bash scripts/check-ts-only.sh`
- **Before `/gsd-verify-work`:** Full suite green AND `scripts/check-ts-only.sh` exits 0 AND both workflow YAMLs lint/parse
- **Max feedback latency:** ~10 seconds (combined typecheck + guard)

---

## Per-Task Verification Map

> Plan/Task IDs are assigned by the planner; the requirement→command mapping below is
> locked by RESEARCH.md §Validation Architecture. Every requirement has an automated
> verify except the two one-shot milestone proofs (CI-02, CI-03), which are recorded
> as committed evidence per D-02/D-07 (locked deviations).

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| MIG-05 | All 225 tests pass via `node --test`, no loader; test globs are `.ts`-only | existing suite | `npm test` | ✅ (17 test files) | ⬜ pending |
| MIG-06 | Zero `.js` source in converted dirs, zero `allowJs`, zero `@ts-ignore`, zero unguarded `as unknown as T` | CI guard (new) | `bash scripts/check-ts-only.sh` | ❌ W0 | ⬜ pending |
| CI-01 | `tsc --noEmit` passes across both tsconfigs; gate present in `pr-check.yml` AND `deploy.yml` | type check | `npm run typecheck` | ✅ | ⬜ pending |
| CI-02 | `_site/` byte-identical to pre-migration baseline (two-bucket: Parquet/JSON strict, HTML modulo content-hash) | local one-shot proof → evidence doc | two-bucket diff helper (`scripts/compare-sites.sh`) | ❌ W0 | ⬜ pending |
| CI-03 | `npm run build:data` < 60s (under-5-min total budget holds) | observation → evidence doc | `time npm run build:data` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/check-ts-only.sh` — the permanent MIG-06 guard (new artifact; grep patterns verified clean in RESEARCH.md §D-08)
- [ ] `scripts/compare-sites.sh` (or equivalent) — the D-03 two-bucket normalization helper (used once for the CI-02 milestone proof; Perl hash-normalization verified working in RESEARCH.md §D-03)
- [ ] `.planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md` — committed evidence doc recording the CI-02 byte-identical result (D-02) and the CI-03 `build:data` timing (D-07)

*Existing infrastructure (`npm test`, `npm run typecheck`, `npm run verify:parquet`) covers MIG-05, CI-01, and SCHEMA-07 — no new test logic required for those.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Byte-identical `_site/` proof | CI-02 | Compares against the gitignored 149M `_site_baseline/` working-tree snapshot (D-02 — local one-shot, deliberately NOT a recurring CI step per D-01) | Run the two-bucket helper: strict `diff -r` on Parquet/JSON buckets, hash-normalized `diff` on HTML; record PASS + counts in MILESTONE-EVIDENCE.md |
| `build:data` timing observation | CI-03 / MAINT-03 | MAINT-03 was always "requires live observation"; no hard-failing timer assertion (CI variance makes 60s flaky — D-07) | `time npm run build:data`; record measured seconds in MILESTONE-EVIDENCE.md |
| PR-introduces-type-error fails CI | CI-01 | Requires an actual GitHub Actions run to observe the gate blocking a bad PR | After wiring, optionally observe a deliberately-broken-type PR fail `pr-check.yml` (or trust the local `npm run typecheck` red/green) |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency (the two one-shot proofs map to committed evidence, not a recurring command)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`check-ts-only.sh`, `compare-sites.sh`, `MILESTONE-EVIDENCE.md`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
