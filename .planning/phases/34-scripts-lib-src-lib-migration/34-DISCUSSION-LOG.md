# Phase 34: scripts/lib & src/_lib Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 34-scripts-lib-src-lib-migration
**Areas discussed:** External-boundary typing, Manifest row type

(Two other gray areas — Test runner + glob, and the dropbox-list test gap — were offered but not selected for deep discussion; they are recorded as Claude's Discretion / Deferred in CONTEXT.md.)

---

## External-boundary typing

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal interfaces + one guard | Hand-write an interface for only the fields consumed from each external response; narrow `fetch().json()`/csv result through a tiny runtime guard. Self-documenting, type-safe, no unguarded cast. | ✓ |
| `unknown` + narrow at access | Type external returns as `unknown`; narrow inline at each field read. Honest but verbose; no central shape doc. | |
| Pragmatic loose record types | `Record<string, unknown>`/`Record<string,string>` with direct access. Least ceremony; weakest guarantees; risks `any`. | |

**User's choice:** Minimal interfaces + one guard.
**Notes:** Guards are hand-rolled / lightweight, NOT Zod — Zod stays reserved for the 7 data entities and the 2 runtime CDN boundaries (Phase 33 D-05/D-06). This pattern is the template Phase 35 will copy across all of `scripts/`.

---

## Manifest row type

| Option | Description | Selected |
|--------|-------------|----------|
| Derive from COLUMNS, status as union | `type ManifestRow = Record<typeof COLUMNS[number], string>` with `status` as a string-literal union; COLUMNS stays canonical; no enum; readManifest narrows via the area-1 guard. | ✓ |
| Hand-written interface | Explicit `interface ManifestRow { … }` listing every field. Readable but duplicates COLUMNS — drift risk. | |
| `Record<string,string>` | Plain string maps matching csv-parse output. Zero narrowing, max flexibility, no field/status safety. | |

**User's choice:** Derive from COLUMNS, status as a string-literal union.
**Notes:** Observed status values: `downloaded | tiled | uploaded | failed`. The planner must confirm the complete set (incl. initial post-ingest status) from `scripts/ingest-photos.js` before finalizing the union — do not invent values.

---

## Claude's Discretion

- Test-runner mechanics — updating the `npm test` glob from `*.test.js` to also match `.ts`, and confirming whether Node 24.x `node --test` needs an explicit strip-types flag (research/planning detail).
- Whether to lift `view` (`D|V`) and `match_bucket` to string-literal unions as well.
- Exact local interface names/shapes for Dropbox API responses (driven by fields each function reads).

## Deferred Ideas

- Adding test coverage for `dropbox-list.js` (no existing test) — out of scope for MIG-01's "convert existing tests."
- Lifting `view` / `match_bucket` to string-literal unions project-wide — revisit in Phase 35.
