# Phase 38: CI Gate & Full Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 38-ci-gate-full-verification
**Areas discussed:** Byte-identical baseline in CI, One-shot vs permanent gate, Tests & verify:parquet placement, Budget & milestone-guard enforcement

---

## Byte-identical guard — role (one-shot vs permanent)

| Option | Description | Selected |
|--------|-------------|----------|
| One-shot milestone proof | Run once against the pre-migration baseline, record as milestone evidence, no recurring gate | ✓ |
| Convert to permanent determinism gate | One-shot now + a recurring build-twice determinism check in CI | |
| Permanent vs-committed-baseline | Commit a normalized baseline, diff every PR forever, re-commit on legitimate content change | |

**User's choice:** One-shot milestone proof
**Notes:** A pre-migration baseline stops being meaningful after the milestone ships — future legitimate content changes would fail it forever. Overrides ROADMAP SC-3's "a CI step compares…" wording (recorded as deviation D-01).

---

## Byte-identical guard — where it runs / hash normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Local, recorded in a doc | Reuse the Phase 34–37 `_site_baseline/` + diff workflow; capture result in a committed evidence doc | ✓ |
| Throwaway CI job | Temporary CI job that rebuilds pre-migration + current refs and diffs, deleted after | |

| Option | Description | Selected |
|--------|-------------|----------|
| Split data vs HTML, normalize hashes | Parquet/JSON strict byte-diff; HTML compared after normalizing content-hash segments; hashed bundles excluded (tests cover behavior) | ✓ |
| You decide the normalization | Delegate exact mechanism to researcher/planner | |

**User's choice:** Local + recorded doc; split data/HTML with content-hash normalization
**Notes:** Phase 37's content-hashed asset filenames mean a raw `diff -r` now fails on hashed names — hence the normalization requirement (D-03). The exact normalization mechanism is delegated to Claude's discretion.

---

## Tests & verify:parquet placement

| Option | Description | Selected |
|--------|-------------|----------|
| Tests: PR-check only | `npm test` gates the PR; not re-run on deploy | ✓ |
| Tests: both pr-check and deploy | Belt-and-suspenders for direct pushes to main | |

| Option | Description | Selected |
|--------|-------------|----------|
| verify:parquet: PR-check gate | Blocking step in pr-check.yml | ✓ |
| verify:parquet: separate/scheduled workflow | Off the PR critical path | |
| verify:parquet: keep local/manual | Not wired into CI | |

**User's choice:** Tests in pr-check only; verify:parquet as a blocking PR-check gate
**Notes:** `main` is PR-protected, so tests gating the PR is sufficient. verify:parquet chosen as a gate despite full-dataset cost — planner must confirm it fits the under-5-min budget (D-06 watch-item). typecheck in both workflows is locked by SC-1 (not a discussion item).

---

## Budget & milestone-guard enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Budget: observe once, record | Time build:data once, record as evidence; no timer gate | ✓ |
| Budget: hard-fail timed assertion | Fail CI if build:data exceeds 60s | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cleanliness: permanent CI guard script | grep guard in pr-check.yml, fails on any .js/allowJs/@ts-ignore/unguarded cast | ✓ |
| Cleanliness: one-time manual check | Run greps once, record zero-findings as evidence | |

**User's choice:** Budget observed-once (no timer); cleanliness as a permanent grep guard
**Notes:** Deliberate one-shot vs permanent split — the byte-identical check is one-shot (baseline stops being meaningful), but the TS-only invariant is meaningful forever, so its guard is permanent. A 60s timed assertion was rejected as flaky under CI runner variance.

## Claude's Discretion

- Exact content-hash normalization mechanism (regex, file globs, HTML reference canonicalization).
- Exact form of the MIG-06 guard script (inline vs committed `scripts/` checker) and its grep patterns.
- Step ordering within the workflows; whether new gates share or follow the build step.
- Format/location of the milestone-evidence doc(s).

## Deferred Ideas

None — discussion stayed within phase scope.
