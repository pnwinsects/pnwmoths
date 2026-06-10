# Phase 37: Lit Web Components Migration - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the **browser/consumer side** of the pipeline — every `.js` in `src/components/` and its `.test.js` files — to strict TypeScript, replicating the locked Phase 34–36 boundary-guard template. This is the **first phase that ships to the client bundle**, so two things are genuinely new vs the pure rename+annotate of 34–36:

1. **Two load-time runtime validators (SCHEMA-08)** at the only dynamic CDN boundaries — `loadParquet()` (validate `records.parquet`'s column schema from hyparquet metadata) and the `species-states.json` fetch (validate top-level + element shape). Both must be **O(columns/elements-shape), independent of dataset size**.
2. **Client bundle weight is real** — SC-4 forbids full Zod in the production bundle and requires recording the measured gzip delta.

Plus the typed-event work: a shared `FilterChangeDetail` interface for the `pnwm-filter-change` `CustomEvent`, with an `HTMLElementEventMap` declaration merge so listeners type without casting.

**In scope — convert `.js` → `.ts` with full strict types (+ their tests):**
- `src/components/glossary-tooltip.js`, `main.js`, `parquet-cache.js`, `pnwm-filter-bar.js`, `pnwm-image-slideshow.js`, `pnwm-occurrence-map.js`, `pnwm-occurrence-popup.js`, `pnwm-phenology-chart.js`, `pnwm-plate-viewer.js`, `pnwm-taxon-browser.js`
- Tests: `filters.test.js`, `parquet-cache.test.js`, `phenology.test.js`, `pnwm-image-slideshow.test.js`, `pnwm-taxon-browser.test.js`
- `package.json` `test` glob: `src/components/*.test.js` → `*.test.ts`

**New code (not a rename):** the two SCHEMA-08 validators; the `FilterChangeDetail` interface + `HTMLElementEventMap` merge.

**Hard constraints (REQUIREMENTS MIG-04 + SCHEMA-08; ROADMAP SC-1..5):** no `.js` source remains in `src/components/`; all tests run via `node --test` under Node 24 native type-stripping (**no additional loader**); zero `tsc --noEmit` errors; no `@ts-ignore`, no `allowJs`, no unguarded `as unknown as T`; `FilterChangeDetail` in `src/types/` used at dispatch + listener with the `HTMLElementEventMap` merge; the two load-time validators run in production at dataset-size-independent cost; **no full-Zod runtime in the prod bundle** (only `zod/mini`); build-generated data byte-identical and rendered HTML identical except content-hashed asset filenames; interactive features functionally unchanged (verified by the full test suite).

</domain>

<decisions>
## Implementation Decisions

### Runtime validator library — `zod/mini` (SCHEMA-08, SC-4)

- **D-01:** Use **`zod/mini`** (not a hand-rolled guard) for both load-time validators. Rationale: the user prioritizes a single source of truth over the last few bytes ("I like Zod as long as it doesn't add too much to the bundle"). The two dynamic entities (`OccurrenceRecord`, `SpeciesState`) already have schemas in `src/types/schemas.ts`.
- **D-02 (CRITICAL — research/planner must resolve):** The existing `src/types/schemas.ts` is authored with the **classic full-`zod` API** (`import { z } from 'zod'`, chained `.nullable()`). **A browser component importing that module pulls full Zod into the bundle and violates SC-4.** zod/mini is a different entrypoint (`import * as z from 'zod/mini'`) with a functional API (`z.nullable(z.string())`). Therefore the two runtime-validated entities (`OccurrenceRecord`, `SpeciesState`) must be authored/refactored so the **browser import is `zod/mini` only** — e.g. define those two schemas with the mini API (the build side can import mini fine; bundle weight is irrelevant there) and keep them as the single source of truth. Researcher determines the cleanest module layout (refactor those two entities to mini vs. split the browser-imported schemas into their own mini module). **Mandatory verification:** grep the production bundle for `ZodError`/`ZodType` (must be absent) and confirm tree-shaking.
- **D-03 (validation must NOT scale with dataset size — D-03 from Phase 33):** Do **not** `z.array(SpeciesStateSchema).parse(data)` — that is O(rows). Validate `species-states.json` by checking the **top-level is an array** + parsing a **single representative element's** shape. Validate `records.parquet` from hyparquet's **column-schema metadata** (declared column names/types), not by parsing the records array. The existing `loadParquet()` already reads all row objects for use; the *validation* must read the file's schema metadata (O(columns)), independent of row count.
- **D-04 (SC-4 measurement):** Measure and **record the gzipped bundle delta** over the pre-migration baseline. A committed note is encouraged (non-technical-maintainer friendly, per Phase 33 D-05); not strictly required.

### Validation failure behavior — throw, reuse the existing error path

- **D-05:** On a load-time validation failure (CDN cache staleness / deploy version skew), **throw** — reusing `loadParquet()`'s existing `try/catch`-and-throw pattern. Callers already handle a thrown `loadParquet()`, so the interactive feature falls back to its empty/error state while the **static HTML** (taxonomy, prose, photos) still renders (the project's no-JS degradation). Rationale: on a scientific reference site, showing **no** occurrence data beats rendering **silently-wrong** data from mismatched columns. This is also the smallest, most consistent diff. Apply the same throw discipline to the `species-states.json` validator.

### Lit component conversion style — preserve `static get properties()`

- **D-06:** **Keep the existing `static get properties()` / `static get styles()` pattern and manual `customElements.define(...)`.** Do **NOT** adopt `@customElement`/`@property`/`@state` decorators. Conversion = rename + add field/method type annotations only.
- **D-07 (the reason — verified):** Lit decorators are **incompatible with `node --test` native type-stripping**. Empirically confirmed on Node 24.15.0: a `@customElement` decorator throws `SyntaxError: Invalid or unexpected token` (type-stripping does not *lower* decorators — they are runtime syntax, not types). The component tests import the component **classes directly** (e.g. `pnwm-image-slideshow.test.ts` imports `PnwmImageSlideshow` to test `_prevSpecimen`/`useOsd`/view-to-label), so a decorated class imported under bare `node --test` would fail. Decorators would force an additional test loader, contradicting Phase 38 SC-2 ("no additional loader") and MIG-05. The user evaluated extracting tested logic and renegotiating the no-loader rule, and chose to keep the static pattern.
- **D-08:** Keep `useDefineForClassFields: false` (already set in `tsconfig.browser.json`) — still required for the static-properties reactive-field pattern (Phase 33 Pitfall 1), independent of decorators. Typed class fields (`slug: string = ''`) compile to constructor assignments under this setting, compatible with Lit reactivity.

### Event typing — `FilterChangeDetail` in `src/types/` + global `HTMLElementEventMap` merge

- **D-09:** Define `FilterChangeDetail` in `src/types/` (alongside `schemas.ts`) and add a **global `declare module`/`HTMLElementEventMap` declaration merge** so every `addEventListener('pnwm-filter-change', ...)` callback is typed without casting. Use it as the generic arg at both the dispatch site (`pnwm-filter-bar.ts` `_dispatchFilterChange`, `new CustomEvent<FilterChangeDetail>('pnwm-filter-change', ...)`) and listener sites. The detail shape is the 8 fields already dispatched: `state, recordType, yearMin, yearMax, county, collection, elevationMin, elevationMax`.

### Claude's Discretion
- Exact module layout for making `OccurrenceRecord`/`SpeciesState` browser-safe under D-02 (refactor-in-place to mini vs. dedicated mini module) — research-informed.
- Per-component field/method annotation specifics; whether `glossary-tooltip`, `plate-viewer`, `occurrence-popup` need any guard or are simple typed conversions.
- Exact file for `FilterChangeDetail` (`src/types/events.ts` vs. appending to an existing types file) and the precise declaration-merge mechanics.
- Whether the SC-4 gzip-delta note is committed or transient.

### Reviewed Todos
The two phase-keyword-matched todos were reviewed and **not folded** — see Deferred.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning
- `.planning/REQUIREMENTS.md` — **MIG-04** (convert `src/components/` + type `pnwm-filter-change`) and **SCHEMA-08** (load-time structure validation at the two dynamic CDN boundaries) are this phase's requirements
- `.planning/ROADMAP.md` §"Phase 37" — goal + 5 success criteria (SC-1 all `.js`→`.ts` + tests via `node --test`; SC-2 `FilterChangeDetail` + `HTMLElementEventMap` merge; SC-3 two O(columns) load-time validators; SC-4 no full-Zod in bundle + recorded gzip delta; SC-5 byte-identical data / HTML identical modulo content-hash / features functionally unchanged)
- `.planning/ROADMAP.md` §"Phase 38" — **SC-2 "no additional loader" is the constraint that rules out decorators** (D-07); this phase must not introduce a test loader

### Prior-phase templates & architecture (on disk)
- `.planning/phases/33-toolchain-schema-scaffolding/33-CONTEXT.md` — trust-by-immutability; D-04/D-05 reserved `zod/mini`-in-browser + "measure the gzipped delta when components migrate (Phase 37)" — **now activated**; Pitfall 1 (`useDefineForClassFields:false`)
- `.planning/phases/34-scripts-lib-src-lib-migration/34-CONTEXT.md` — the minimal-interface-+-guard boundary template
- `.planning/phases/36-eleventy-data-files-config-migration/36-CONTEXT.md` — most recent application of the template; `node --test` native type-stripping discipline

### Toolchain & schemas (on disk)
- `src/types/schemas.ts` — `OccurrenceRecordSchema`/`OccurrenceRecord` and `SpeciesStateSchema`/`SpeciesState` are the two entities validated at runtime. **Authored in classic full-`zod`** — see D-02: must be made `zod/mini`-importable for the browser without pulling full Zod
- `src/types/index.ts` — re-exports `./schemas.ts` (so importing `index.ts` from a component also drags full Zod today — D-02)
- `tsconfig.browser.json` — `experimentalDecorators:true` + `useDefineForClassFields:false` (decorators NOT used per D-06; `useDefineForClassFields:false` still needed per D-08); `verbatimModuleSyntax:true`, `isolatedModules`, `noUncheckedIndexedAccess`; `include` covers `src/components/**/*.ts` + `src/types/**/*.ts`

### Code touchpoints (read to ground the conversion)
- `src/components/parquet-cache.js` — `loadParquet()` (the Parquet validation chokepoint + the existing fetch-fail `throw` path to reuse, D-05); `import.meta.env.BASE_URL` URL construction; whole-file fetch (no range requests). Also `filterRecords`/`aggregateByMonth` (pure, already test-imported)
- `src/components/pnwm-filter-bar.js` — `_dispatchFilterChange()` lines ~103-117 (the `CustomEvent('pnwm-filter-change', { detail: {...8 fields...} })` dispatch site — D-09)
- `src/components/pnwm-taxon-browser.js` — line ~86 `fetch(\`${this._prefix}species-states.json\`)` (the `species-states.json` validation site — D-03); `buildStateMap`/`taxonHasState`/`collectSlugs` (pure, test-imported)
- `src/components/main.js` — the component registry (`import './pnwm-*.js'`); manual `customElements.define(...)` at each component's tail (kept per D-06)
- `src/components/*.test.js` — import component **classes directly** (e.g. `pnwm-image-slideshow.test.js` → `PnwmImageSlideshow`); this direct-import is why decorators break (D-07)
- `package.json` — `test` glob (`src/components/*.test.js` → `*.test.ts`); `typecheck` (`tsc -p tsconfig.browser.json --noEmit`); `build`/`dev`; Vite bundles the components (where `zod/mini` tree-shaking + the SC-4 grep apply)

### Project constraints
- `.planning/PROJECT.md` — light-DOM Lit, no-JS static degradation as core value (informs D-05), Snappy Parquet, `String(row.id)` coercion
- Memory: `pathPrefix` stays conditional on `process.env.GITHUB_PAGES` (not edited here, but `BASE_URL` in `parquet-cache` derives from it)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`parquet-cache.loadParquet()`** — the single chokepoint where `records.parquet` enters the browser; natural home for the O(columns) Parquet validator, and its existing `try { ... } catch (err) { console.error(...); throw err; }` is the exact failure pattern D-05 reuses.
- **`src/types/` schemas** (`OccurrenceRecord`, `SpeciesState`) — the source of truth for the two validators; must be browser/`zod/mini`-safe per D-02.
- **Phase 34–36 minimal-interface-+-guard template** — the boundary-typing idiom to replicate; here the genuine boundaries are the two dynamic fetches.
- **Pure helpers already extracted** (`filterRecords`, `aggregateByMonth`, `buildStateMap`, `taxonHasState`, `collectSlugs`) — already imported by tests without instantiating components; converting them is straightforward typed-function work.

### Established Patterns
- Components are ESM, use `static get properties()`/`static get styles()` and end with `customElements.define('pnwm-x', PnwmX)`; `main.js` side-effect-imports all of them. Conversion is rename + annotate — no module-system or registration change (D-06).
- The dynamic browser-fetched surface is exactly two files (`records.parquet`, `species-states.json`); everything else is build-baked and statically typed.
- `import.meta.env.BASE_URL` for URL construction (needs `vite/client` types — already in `tsconfig.browser.json`).
- Component tests run under `node --test` and import component classes directly — sets the hard "no decorators / no loader" constraint (D-07).

### Integration Points
- **Vite bundles `src/components/`** → this is where `zod/mini` tree-shaking and the SC-4 `ZodError`/`ZodType` grep + gzip-delta measurement apply.
- Validators hook in at: `loadParquet()` (Parquet column metadata) and the `pnwm-taxon-browser` `species-states.json` fetch.
- `FilterChangeDetail` connects `pnwm-filter-bar` (dispatch) to its listeners (the map/phenology consumers) via a global `HTMLElementEventMap` merge.

</code_context>

<specifics>
## Specific Ideas

- The decorators question was the one live deviation from the otherwise heavily-templated migration. It was **empirically tested and rejected**: Node 24.15.0 type-stripping throws `SyntaxError` on `@customElement`. Keeping `static get properties()` is therefore not just the low-risk default but a hard requirement of the loader-free milestone thesis.
- `zod/mini` was chosen over a zero-dependency hand-rolled guard for single-source-of-truth, **accepting** a measured bundle delta — but with the non-obvious catch (D-02) that the existing classic-`zod` schemas can't be imported into the browser as-is without dragging full Zod and breaking SC-4. Resolving the mini-import path is the planner/researcher's key task here.
- Failure behavior favors **correctness over availability** at the interactive layer (throw → static HTML degradation), consistent with the existing `loadParquet()` throw and the site's no-JS-degradation value.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **"Fix close button on the lightbox"** (`2026-04-23-fix-close-button-on-lightbox.md`, score 0.9) — a UI **behavior** fix in `pnwm-image-slideshow`. Phase 37 is a byte-identical / behavior-unchanged TS conversion (SC-5); fixing a bug would violate that constraint. Same reasoning that deferred it in Phase 33. Belongs in a dedicated UI-fix phase.
- **"Migrate Pagefind to Component UI"** (`2026-05-23-migrate-pagefind-to-component-ui.md`, score 0.5) — new UI feature work, not TS migration. Out of scope for v3.0.

Both keyword-matched because Phase 37 touches `src/components/`, but neither is conversion work.

</deferred>

---

*Phase: 37-lit-web-components-migration*
*Context gathered: 2026-06-10*
