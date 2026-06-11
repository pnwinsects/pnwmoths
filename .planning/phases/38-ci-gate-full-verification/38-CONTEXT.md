# Phase 38: CI Gate & Full Verification - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The **final gate phase** of the v3.0 TypeScript milestone. All JS→TS conversion is complete (Phases 33–37). This phase does **no further conversion** — it wires the already-existing verification scripts into GitHub Actions, runs the milestone-completion proofs, and declares v3.0 done.

**In scope:**
- Add `tsc --noEmit` (via existing `npm run typecheck`, which runs both tsconfigs) as a **blocking gate in both `pr-check.yml` and `deploy.yml`** (CI-01, ROADMAP SC-1 — locked, not negotiable).
- Add the full `node --test` suite (`npm test`, ~191 tests) as a **blocking gate in `pr-check.yml` only** (MIG-05).
- Add `npm run verify:parquet` as a **blocking gate in `pr-check.yml`** (SCHEMA-07).
- Add a **permanent grep-based cleanliness guard script** to `pr-check.yml` enforcing the TS-only invariant: zero `.js` source in converted dirs, zero `allowJs`, zero `@ts-ignore`, zero unguarded `as unknown as T` double-casts (MIG-06).
- Run the **one-shot byte-identical `_site/` proof locally** and record the result as committed milestone evidence (CI-02 — see D-01 for the deviation from SC-3's "CI step" wording).
- **Observe and record** `build:data` timing once (CI-03 / MAINT-03); no recurring timer gate.
- Declare the v3.0 milestone complete.

**Out of scope:** Any further `.js`→`.ts` conversion, any runtime/behavior change, any new permanent byte-identical or build-time CI gate.

**Current CI state (the gap this phase closes):** `pr-check.yml` and `deploy.yml` currently run **only the build** — neither runs `typecheck`, `npm test`, nor `verify:parquet`. All three scripts already exist in `package.json`.

</domain>

<decisions>
## Implementation Decisions

### Byte-identical `_site/` guard (CI-02)

- **D-01 (DEVIATION from ROADMAP SC-3):** The byte-identical check is a **one-shot milestone proof, NOT a recurring CI step.** Rationale: a "pre-migration baseline" is a fixed point in git history; comparing against it is meaningful exactly once (to prove the v3.0 rewrite changed no output). After v3.0 ships, the next legitimate content change (new species, prose edit) would fail a permanent vs-pre-migration diff forever. ROADMAP SC-3 says "A CI step compares…"; the user explicitly chose the one-shot framing instead. **Planner must treat SC-3 as satisfied by a recorded local proof, not a workflow step.**
- **D-02 (where/how):** Run the comparison **locally**, reusing the proven Phase 34–37 workflow (the gitignored 149M `_site_baseline/` snapshot + `diff`). Capture the result in a **committed milestone-evidence doc** in the phase directory (mirror the existing `.planning/phases/34-.../BASELINE.md` style). No CI job, no committed `_site` artifact (the baseline is 149M and stays in the working tree).
- **D-03 (content-hash normalization — REQUIRED, new since Phase 37):** A raw `diff -r _site/ _site_baseline/` now fails because Phase 37 shipped content-hashed asset filenames. Compare in two buckets:
  - **Build-generated data files (Parquet/JSON):** strict byte-for-byte diff — must be identical.
  - **Rendered HTML:** compare after **normalizing/canonicalizing the content-hash segment** of asset filenames (and the HTML references to them) in both trees.
  - **Hashed JS/CSS bundles themselves:** excluded from the diff — their behavior equivalence is covered by the full test suite (per CI-02's explicit wording).

### CI script placement (CI-01, MIG-05, SCHEMA-07)

- **D-04:** `npm run typecheck` (= `tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit`) is a **blocking gate in BOTH `pr-check.yml` and `deploy.yml`** (SC-1, CI-01 — locked).
- **D-05:** `npm test` (full ~191-test `node --test` suite) is a **blocking gate in `pr-check.yml` only**. Rationale: `main` is protected by PR review, so gating the PR before merge is sufficient; re-running the full suite on the deploy push adds minutes for no added safety.
- **D-06:** `npm run verify:parquet` is a **blocking gate in `pr-check.yml`**. ⚠️ **Planner watch-item:** this validates every species' Parquet across the **full ~1,433-species dataset** and **scales with dataset size** (SCHEMA-07 calls it the "on-demand thorough check"). It must fit inside the under-5-min total CI budget alongside the build — verify the combined `pr-check` runtime stays within budget, and if it threatens the budget, flag back for re-scoping (the fallback was a separate scheduled workflow, which the user did not choose).

### Budget enforcement (CI-03 / MAINT-03)

- **D-07:** **Observe `build:data` timing once and record the measured number** as milestone evidence (MAINT-03 was always "requires live CI observation"). **No hard-failing timer assertion** — CI runner variance makes a 60s assertion flaky, and there is no recurring perf gate under the one-shot framing. Confirms the under-5-min total build target holds.

### Milestone cleanliness guard (MIG-06)

- **D-08:** Write a **small permanent grep-based guard script wired into `pr-check.yml`** that fails if any of these reappear: `.js` source files in the converted dirs (`scripts/`, `scripts/lib/`, `src/_lib/`, `src/_data/`, `src/components/`), `allowJs` in any tsconfig, `@ts-ignore` comments, unguarded `as unknown as T` double-casts. Rationale: unlike the byte-identical check, this invariant **stays meaningful forever** — cheap and fast, it permanently protects the TS-only milestone outcome against future regression. (Note: this is the *one* permanent guard added; the byte-identical check is deliberately not permanent — see D-01.)

### Claude's Discretion
- Exact normalization mechanism for D-03 (regex on the hash segment, which globs count as "data" vs "asset" vs "bundle", how to canonicalize HTML references) — researcher/planner inspects the actual `_site/` asset-naming scheme (Vite/Eleventy output) and picks the cleanest approach.
- Exact form of the D-08 guard script (inline shell in the workflow vs a committed `scripts/` checker) and its grep patterns, as long as it covers all four invariants and runs in `pr-check.yml`.
- Step ordering within the workflows (e.g. typecheck before/after build) and whether the new gates share the existing build step or run as discrete steps.
- Format/location of the milestone-evidence doc(s) for D-02 and D-07.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning
- `.planning/REQUIREMENTS.md` — this phase's requirements: **MIG-05** (~191 tests via `node --test`, no extra loader), **MIG-06** (zero `.js`/`allowJs`/`@ts-ignore`/unguarded casts), **CI-01** (`tsc --noEmit` gate in pr-check + deploy), **CI-02** (byte-identical `_site/` — note D-01 deviation), **CI-03** (`build:data` <60s, under-5-min total). Also **TS-05** (`npm run typecheck` definition) and **SCHEMA-07** (`verify:parquet` is the on-demand full-dataset check).
- `.planning/ROADMAP.md` §"Phase 38" — goal + 5 success criteria. **SC-3 ("a CI step compares…") is overridden by D-01** — satisfied by a recorded local one-shot proof, not a workflow step.

### Byte-identical baseline mechanism (read before implementing CI-02)
- `.planning/phases/34-scripts-lib-src-lib-migration/BASELINE.md` — the established baseline protocol: `_site_baseline/` is a **gitignored, working-tree-only 149M snapshot** compared via `diff -r`; regenerated when underlying data changes. The Phase 38 evidence doc should mirror this style, plus add the D-03 content-hash normalization step (new since Phase 37).
- `.planning/phases/37-lit-web-components-migration/37-CONTEXT.md` — Phase 37 introduced the **content-hashed asset filenames** that force D-03; its SC-5 already redefined "byte-identical" as "data byte-identical + HTML identical modulo content-hash + behavior via test suite."

### CI workflows (the files to edit)
- `.github/workflows/pr-check.yml` — currently build-only; add typecheck + `npm test` + `verify:parquet` + the MIG-06 guard. Uses `actions/setup-node` with `.nvmrc`, `npm ci`, lychee link-check.
- `.github/workflows/deploy.yml` — currently build-only; add typecheck (only). Deploys to GitHub Pages; link-check is `continue-on-error: true` here.

### Scripts & config (already exist — just wire them)
- `package.json` — `typecheck`, `test` (the ~191-test glob), `verify:parquet`, `build:data`, `build` are all already defined.
- `scripts/verify-parquet.ts` — the full-dataset Parquet schema check (SCHEMA-07 / D-06 budget watch-item).
- `tsconfig.browser.json`, `tsconfig.node.json` — the two configs `typecheck` runs against (TS-01).

### Project constraints
- `.planning/PROJECT.md` — v3.0 milestone goal: "no user-facing behavior change"; under-5-min CI build target.
- Memory: `pathPrefix` stays conditional on `process.env.GITHUB_PAGES`; all pipeline operations run locally (no datacenter server) — consistent with D-02's local one-shot proof.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`npm run typecheck`, `npm test`, `npm run verify:parquet`** — all three verification commands already exist and pass locally; this phase only adds them as CI steps. No new test/verification logic to write (except the D-08 guard script and the D-03 normalization helper).
- **`_site_baseline/` + `diff -r` protocol** (BASELINE.md) — the proven local byte-identical mechanism; reuse it, extended with D-03 normalization.
- **Phases 34–37 byte-identical evidence pattern** — each prior migration phase recorded its byte-identical result; Phase 38 does the final cumulative proof.

### Established Patterns
- CI workflows pin actions by SHA, use `actions/setup-node@v6` with `node-version-file: '.nvmrc'`, `npm ci`, and a local `install-lychee` composite action. New gate steps should follow the same step idiom (named `run:` steps).
- `pr-check.yml` runs the build minus the network-dependent pagefind/lychee specifics; `deploy.yml` runs the full build + Pages upload with link-check non-blocking.
- The build is a chained `npm run build:data && build:eleventy && …` sequence; new gates run as **discrete steps**, not folded into the build chain (so failures are attributable).

### Integration Points
- New gates hook into the two workflow YAMLs after `npm ci` (and after build where output is needed — `verify:parquet` needs Parquet built; `typecheck`/`npm test`/the MIG-06 grep do not).
- The MIG-06 guard script (D-08) is a new committed artifact (or inline step) that greps the converted source dirs.
- The byte-identical proof (D-02) is **local + a committed evidence doc**, with no workflow integration.

</code_context>

<specifics>
## Specific Ideas

- The user drew a deliberate, principled line between **one-shot** and **permanent** gates: the byte-identical check is one-shot (a pre-migration baseline stops being meaningful after the milestone ships), while the MIG-06 cleanliness grep is permanent (the TS-only invariant is meaningful forever). Planner should preserve this distinction — do not "helpfully" promote the byte-identical check to a recurring CI step.
- `verify:parquet` as a blocking PR gate is the user's explicit choice **despite** its full-dataset cost; the budget-fit check (D-06) is the safety valve, not a reason to silently move it off the critical path.
- Budget verification is observational by design (MAINT-03's original framing); resist adding a flaky timed assertion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Pre-existing milestone deferrals — WebP Optimizer toggle, MAINT-03 live observation, the v3.0-future items TSF-01/02/03 — are tracked in `.planning/STATE.md` Deferred Items and are not part of this phase.)

</deferred>

---

*Phase: 38-ci-gate-full-verification*
*Context gathered: 2026-06-10*
