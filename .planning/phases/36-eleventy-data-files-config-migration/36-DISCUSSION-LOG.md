# Phase 36: Eleventy Data Files & Config Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 36-eleventy-data-files-config-migration
**Areas discussed:** Config test robustness, Child-process script references, Data-file return typing

---

## Config test robustness (SC-2 / SC-3)

| Option | Description | Selected |
|--------|-------------|----------|
| Behavioral test | Import the config and assert pathPrefix resolves to /pnwmoths/ when GITHUB_PAGES is set and / when not. Tests real behavior; heavier (config reads glossary.csv + wires plugins at module load). | |
| Extend source-match | Keep the source-string style, add an assertion that the literal conditional substring/regex is present in eleventy.config.ts. Minimal, isolated; no runtime verification. | ✓ (Claude's call) |
| Both | Behavioral pathPrefix assertion AND source-presence check. Max coverage, more test code. | |

**User's choice:** No preference — delegated to Claude.
**Notes:** Claude locked **Extend source-match** (D-01): satisfies SC-2's "asserts this conditional is present" literally and cheaply, avoids config module-load side effects; SC-3 runtime correctness is already covered by the byte-identical build gate (which runs GITHUB_PAGES=1 vs unset). Planner may add a behavioral check only if config import proves side-effect-light.

---

## Child-process script references

| Option | Description | Selected |
|--------|-------------|----------|
| Repoint to .ts | Update execFile paths .js → .ts, keep spawning child node processes. Smallest diff, lowest byte-identical risk. | ✓ (Claude's call) |
| Inline-import | Import copy-images / emit-species-states functions and call in-process. Cleaner, larger refactor, touches export surfaces. | |
| You decide | Let research/planning pick. | |

**User's choice:** No preference — delegated to Claude.
**Notes:** Claude locked **Repoint to .ts** (D-02). The config's execFile calls to scripts/copy-images.js and emit-species-states.js are currently broken (Phase 35 renamed both to .ts; the .js files no longer exist). Minimal repoint is the lowest-risk fix and preserves process isolation.

---

## Data-file return typing

| Option | Description | Selected |
|--------|-------------|----------|
| Local interface + guard | Apply the carried D-10 template: minimal local interface for the reshaped output + runtime guard on the DuckDB boundary. Consistent with Phases 34/35. | ✓ (Claude's call) |
| Derive from entity types | Build return types from z.infer<> entity types (species→Species, glossary→GlossaryWord). Tighter to schema, couples data files to it. | |
| You decide | Planner picks per-file. | |

**User's choice:** No preference — delegated to Claude.
**Notes:** Claude locked **Local interface + guard** (D-03) as the uniform default — the data files reshape rows (stringify id, derive slug/similar_slugs, group glossary by letter) so the emitted shape diverges from the raw entity. Planner may derive from entity types where the fit is genuinely clean (optional path).

## Claude's Discretion

All three surfaced gray areas were delegated to Claude (user answered "no preference" on each). Resolved per the lowest-byte-identical-risk / most-consistent-with-template principle. See CONTEXT.md `<decisions>` for the locked choices and the additional discretion items (interface shapes, test-glob mechanics, per-file guard granularity).

## Deferred Ideas

- New dedicated unit-test coverage for the previously-untested `_data` files — not required by MIG-03 (converts existing tests only); planner discretion.
