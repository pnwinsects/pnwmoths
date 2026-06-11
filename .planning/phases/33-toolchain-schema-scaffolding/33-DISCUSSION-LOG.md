# Phase 33: Toolchain & Schema Scaffolding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 33-toolchain-schema-scaffolding
**Areas discussed:** Validation architecture (TS vs runtime), Validation library, Drift/strictness policy

---

## "Is it possible with straight TS?" (raised by user)

The user asked whether the goals could be met with plain TypeScript and no runtime validation library.

Outcome of the discussion:
- TS types are **erased at runtime** → cannot inspect CSV/Parquet/JSON contents. Static `tsc` alone cannot "verify the Parquet."
- Data verification is inherently **runtime** (a build script running is runtime; the browser fetching is runtime).
- That runtime check does **not** require a library — plain-TS assertion functions work — so the real fork is *hand-rolled validators vs schema library*, not *TS vs not-TS*.

User's resolution (free-text): "use TS for anything used at build time or locked to a hash — no chance of being wrong — and Zod or something hand-rolled for anything loaded dynamically from S3. I like Zod as long as it doesn't add too much to the [browser] bundle, and its runtime doesn't scale with the size of the dataset, which can be large." → captured as the trust-by-immutability principle (D-01..D-03).

---

## Validation library

| Option | Description | Selected |
|--------|-------------|----------|
| Zod 4 | Build-side only by default; z.infer derived types; rich errors | ✓ (with conditions) |
| Evaluate alternatives | Compare valibot/arktype/typebox | |
| You decide | Delegate with Zod default | |

**User's choice:** Zod 4, conditional on (a) small browser-bundle impact and (b) runtime cost that does not scale with dataset size.
**Notes:** Resolved via D-05 (`zod/mini` in browser, full `zod` build-side) and D-03 (validate schema/metadata, not rows → O(columns)).

---

## Drift / strictness policy

| Option | Description | Selected |
|--------|-------------|----------|
| Reject — fail the build | `.strict()`; unknown column blocks build | partial |
| Tolerate — ignore extras | strip/passthrough unknown columns | partial |
| You decide | per-boundary | ✓ (direction set) |

**User's choice:** Direction captured in D-07 — CSV-input drift caught by DuckDB typed read + integrity SQL at build; runtime checks validate only the columns the code uses (extra columns shouldn't break a running page). Exact per-boundary `.strict()`/strip left to planner.
**Notes:** The two "lock down" areas the user selected were Validation library + Drift policy; module layout and profile-deliverable were delegated.

---

## Parquet-URL hashing (investigated during discussion)

Inspected `parquet-cache.js`, `copy-parquet.js`, `build-data.js`: per-species Parquet is served at **stable, un-hashed** URLs (`/species/{slug}/records.parquet`) from GitHub Pages (Fastly), co-deployed with HTML/JS. Skew risk is bounded to CDN cache staleness → runtime check is belt-and-suspenders. Content-hashing the URLs was considered and **deferred** (caching/deploy change, not TS-migration scope).

---

## Claude's Discretion

- Schema module layout (single file vs per-entity)
- Exact per-boundary strictness
- tsconfig specifics (3-config layout, extension-flag verification)
- Whether the data-profile produces a committed report

## Deferred Ideas

- Content-hash the per-species Parquet URLs (out of scope for v3.0)
- Reviewed-not-folded todos: lightbox close button, Pagefind→component UI (both UI work, irrelevant to scaffolding)
