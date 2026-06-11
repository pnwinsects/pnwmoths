# Phase 37: Lit Web Components Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 37-lit-web-components-migration
**Areas discussed:** Runtime validator library, Validation failure behavior, Lit conversion style, Event typing mechanics

---

## Runtime validator library (SCHEMA-08 / SC-4)

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled guard | Zero-dependency guard fn per boundary; ~zero gzip delta; duplicates shape by hand | |
| zod/mini | Reuse `src/types/` schemas via `zod/mini`; single source of truth; measurable gzip weight on ~700 pages | ✓ |
| Build both, pick smaller | Implement both, measure, ship the smaller | |

**User's choice:** zod/mini
**Notes:** Chosen for single-source-of-truth over byte-savings, consistent with the Phase 33 framing. Surfaced after selection (D-02): the existing `schemas.ts` is classic full-`zod`, so a naive browser import would drag full Zod and violate SC-4 — the two runtime entities must be made `zod/mini`-importable. Also flagged: validation must stay O(columns/element-shape), not `z.array().parse()` over all rows (D-03).

---

## Validation failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Throw — reuse existing error path | Schema mismatch throws like the existing fetch-fail; feature shows empty/error state, static HTML still renders | ✓ |
| Warn-and-degrade | console.error then proceed with unvalidated data; feature renders, risks showing wrong data | |
| Throw in dev, warn in prod | Strict in dev, lenient in prod | |

**User's choice:** Throw — reuse existing error path
**Notes:** Correctness over availability — showing no occurrence data beats silently-wrong data on a scientific reference site. Smallest, most consistent diff with the existing `loadParquet()` throw.

---

## Lit conversion style

| Option | Description | Selected |
|--------|-------------|----------|
| Adopt @customElement/@property/@state decorators | Idiomatic modern Lit; **initially selected** | |
| Keep static get properties() | Preserve existing pattern + manual customElements.define; just annotate | ✓ |

**User's choice:** Keep static get properties() (revised after a verified feasibility conflict)
**Notes:** Decorators were initially selected, then **empirically tested and rejected**: Node 24.15.0 native type-stripping throws `SyntaxError: Invalid or unexpected token` on `@customElement` (decorators are runtime syntax, not lowered by type-stripping). Component tests import the component classes directly under bare `node --test`, so decorators would force a test loader — contradicting Phase 38 SC-2 ("no additional loader") and MIG-05. The user was presented the conflict with three resolutions (keep static / extract tested logic / renegotiate the no-loader rule) and chose to keep the static pattern.

---

## Event typing mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| src/types/ + global HTMLElementEventMap merge | `FilterChangeDetail` in `src/types/`, global declaration merge so listeners type without casting | ✓ |
| Co-locate in pnwm-filter-bar.ts | Export the interface from the dispatching component | |
| You decide | Claude's discretion within SC-2 | |

**User's choice:** src/types/ + global HTMLElementEventMap merge
**Notes:** Keeps shared types in one place alongside `schemas.ts`; matches SC-2's wording exactly.

---

## Claude's Discretion

- Module layout for making `OccurrenceRecord`/`SpeciesState` browser-safe under `zod/mini` (D-02).
- Per-component annotation specifics; whether simple components need a guard.
- Exact file for `FilterChangeDetail` and the declaration-merge mechanics.
- Whether the SC-4 gzip-delta note is committed or transient.

## Deferred Ideas

- **"Fix close button on the lightbox"** (todo, score 0.9) — UI behavior fix; violates SC-5 byte-identical/behavior-unchanged. Deferred (also deferred in Phase 33).
- **"Migrate Pagefind to Component UI"** (todo, score 0.5) — new UI feature, not TS migration. Out of scope for v3.0.
