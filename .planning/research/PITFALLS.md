# Domain Pitfalls: Strict-TS Migration of Eleventy+Vite+Lit+DuckDB+hyparquet

**Domain:** Big-bang-per-area JS→strict-TypeScript migration of a shipped static site
**Researched:** 2026-06-09
**Confidence:** HIGH — grounded in actual source files read; no speculation

---

## Critical Pitfalls

### Pitfall 1: `useDefineForClassFields` silently breaks Lit reactive properties

**What goes wrong:** With `strict` tsconfig and `target: ES2022+`, TypeScript emits class fields with `Object.defineProperty` semantics (`useDefineForClassFields: true` default). The subclass field initializer runs after `super()` and overwrites the reactive accessor Lit installed, so the property becomes non-reactive — changes never trigger `render()`. Component renders once but never updates.

**Why it happens:** `pnwm-filter-bar.js` uses `static get properties()`; `pnwm-image-slideshow.js` uses `static properties = {}` class-field syntax. Both vulnerable unless tsconfig is set correctly. The bug is silent — `tsc --noEmit` passes.

**How to avoid:** Set `"useDefineForClassFields": false` in the browser tsconfig when `target` is ES2022+. Lit's official TS guide requires this.

**Warning signs:** Filter dropdowns load with correct initial state but changes have no effect; `updated()` never called. Only observable at runtime.

**Phase to address:** tsconfig/tooling phase — must be set before any Lit component is touched.

---

### Pitfall 2: Over-strict Zod schema rejects real production data and hard-blocks the build

**What goes wrong:** The pipeline imports 85,933 records from `records.csv`. A schema marking `elevation_ft`, `year`, `month`, `day`, `collector`, `collection`, or `notes` as required non-null will reject the large fraction of legacy rows with blank/null values. DuckDB reads blank CSV cells as `NULL`. Since CSV validation + Parquet export is the first build step, a hard rejection makes `npm run build` fail at line 1 — all 1,348 species pages un-buildable.

**Why it happens:** Schema designed from the TS type ideal rather than profiled actual data. Production `records.csv` has intentional NULLs for optional collection metadata; `build-data.js`'s DuckDB schema already accommodates this (VARCHAR nullable, `elevation_ft` INTEGER allows NULL).

**How to avoid:** Profile null/blank distribution per column BEFORE writing any schema (`COUNT(*) FILTER (WHERE col IS NULL)`). Default optional columns to `.nullable()`. Validate required fields (`species_slug`, `latitude`, `longitude`) are truly non-null first. Run schema parse against the full 85,933-row dataset in a spike before wiring into the build.

**Warning signs:** `ZodError: Expected number, received null` during `build:data`; build terminates before any Parquet written. In CI the entire pipeline is blocked.

**Phase to address:** Data schema phase — data profile spike MUST precede schema definition.

---

### Pitfall 3: Node 24 native type-stripping does not handle enums, namespaces, or parameter properties

**What goes wrong:** Node 24 type-stripping only strips type annotations — it does not transform TS-only syntax requiring codegen: `enum`/`const enum`, `namespace`, ambient `module`, and constructor parameter properties (`constructor(private foo: string)`). These throw a runtime syntax error in Node-executed `.ts` (scripts, Eleventy data files, tests), not a build error.

**Why it happens:** No enums exist today, but they're a natural migration habit (e.g. `enum RecordType {...}`).

**How to avoid:** Use string-literal unions (`type RecordType = 'specimen' | 'photograph' | ...`) or `as const` objects. Set `isolatedModules: true` (errors on const enums). CI grep: `grep -r '\benum\b' scripts/ src/`.

**Warning signs:** `SyntaxError: Unexpected token 'enum'` running tests/build scripts.

**Phase to address:** tsconfig/tooling phase.

---

### Pitfall 4: Import-extension rules break Node 24 type-stripping / mixed JS-TS interop

**What goes wrong:** Node ESM convention requires importing TS files with the `.js` extension (`import {foo} from './foo.js'` even when the file is `foo.ts`). Writing `./foo.ts` fails in Node 24. During the big-bang-per-area transition, mixed `.js`/`.ts` files make extension mistakes easy.

**How to avoid:** Set `moduleResolution: nodenext` for the Node side (enforces the `.js`-extension rule in tsc itself; `rewriteRelativeImportExtensions` lets source use `.ts` and rewrite on emit) and `bundler` for the Vite side. This requires separate tsconfigs (necessary anyway).

**Warning signs:** `ERR_MODULE_NOT_FOUND` / `Cannot find module './foo.ts'` at runtime, or tsc "relative import paths need explicit file extensions".

**Phase to address:** tsconfig/tooling phase.

---

### Pitfall 5: Light-DOM `createRenderRoot()` type errors in strict TypeScript

**What goes wrong:** `createRenderRoot()` returns `this` (light DOM) in `pnwm-occurrence-map.js` and `pnwm-taxon-browser.js`. Copying the shadow-DOM `this.shadowRoot.querySelector(...)` pattern (correct in `pnwm-image-slideshow.js`) into a light-DOM component yields a runtime null with no TS error (shadowRoot is `ShadowRoot | null`, null propagates via optional chaining).

**How to avoid:** In light-DOM components use `this.querySelector(...)` (or the `renderRoot` getter), never `this.shadowRoot`. For shadow-DOM components `this.shadowRoot!` is acceptable. Code-review rule: any `.shadowRoot.querySelector` in a light-DOM component is a bug.

**Phase to address:** Lit component migration phase.

---

### Pitfall 6: `pnwm-filter-change` CustomEvent typed as `Event` loses the `detail` shape

**What goes wrong:** `pnwm-filter-bar` dispatches a `CustomEvent` with an 8-field `detail`; consumers read `e.detail.state`, etc. TS types `addEventListener` callbacks as `Event`, so `detail` isn't accessible without a typed cast. `e as CustomEvent` (no generic) makes `detail` `any`, defeating strict TS; sender/receiver can drift.

**How to avoid:** Define one `FilterChangeDetail` interface in a shared types file; dispatch as `new CustomEvent<FilterChangeDetail>(...)`; add an `HTMLElementEventMap` declaration-merge entry for `'pnwm-filter-change'` so listeners auto-type `e`.

**Phase to address:** Lit component migration phase (first component touching the event bus).

---

### Pitfall 7: DuckDB `getRowObjectsJS()` returns untyped rows — casting instead of parsing lets wrong types through

**What goes wrong:** `getRowObjectsJS()` has no generics (returns `Record<string, unknown>[]`). `species.js` already does `row.id = String(row.id)` because DuckDB returns INTEGER as `number` but BIGINT as `BigInt`. A schema used as a cast (`row as SpeciesRow`) rather than a parse doesn't enforce coercion — wrong types fail only at render.

**How to avoid:** Use Zod `.transform()` at the parse boundary (`id: z.union([z.number(), z.bigint()]).transform(String)`) and call `.parse(row)`, not `as`. Acceptable for 1,348 species rows; NOT for the 85,933-record hot path (Pitfall 10).

**Phase to address:** Data pipeline / data-file migration phase.

---

### Pitfall 8: Eleventy config TS migration hardcodes pathPrefix or loses the GITHUB_PAGES conditional

**What goes wrong:** `const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"` must survive migration to `eleventy.config.ts`. Hardcoding `/pnwmoths/` breaks `npm run dev` (404 assets). plugin-vite feeds `pathPrefix` to Vite `base`; a wrong value double-prefixes the raw `/images/...` passthrough (per PROJECT.md key decision).

**How to avoid:** Keep the env conditional. `eleventy.config.test.js` asserts config source text — add an assertion that the source contains `process.env.GITHUB_PAGES`. Migrate the test alongside the config; keep it runnable via `node --test`.

**Phase to address:** Eleventy config migration phase. (See memory: pathPrefix must be conditional on GITHUB_PAGES.)

---

### Pitfall 9: Vite + eleventy-plugin-vite don't auto-discover renamed `.ts` entry points

**What goes wrong:** Vite (MPA mode) discovers entries from HTML `<script src>` tags. Renaming `main.js`→`main.ts` without updating the `<script>` reference breaks entry discovery — empty/missing bundle, `build:eleventy` still exits 0, page silently loses interactivity.

**How to avoid:** Update the HTML template `<script>` reference in the same commit as the file rename. Vite handles `.ts` natively (no plugin). Verify the built `_site/assets/` bundle is non-empty.

**Phase to address:** Client component migration phase (add a non-empty-bundle integration check).

---

## Moderate Pitfalls

### Pitfall 10: Zod validation in the per-record hot path risks the 5-minute CI target (MAINT-03)

**What goes wrong:** `z.parse()` on 85,933 records in `build-data.js` adds overhead (~86ms–860ms depending on schema complexity) on top of the already-slow DuckDB step and 1,348 per-species exports — could push build over 5 min.

**How to avoid:** Validate at the INPUT boundary (CSV/DuckDB import), not the per-record output loop. Zod-parse the small row sets (1,348 species rows from `getRowObjectsJS()`); export the 85,933 records directly Parquet→Parquet without materializing each into a JS object for parsing. Add a `time npm run build:data` benchmark to tests (<60s target).

**Phase to address:** Data schema phase.

---

### Pitfall 11: `navigational`/`weight` stored as VARCHAR — strict typing exposes the inconsistency

**What goes wrong:** `taxon.js` reads `images.csv` with all-VARCHAR columns and compares `navigational === 'true'` (string). Typing `navigational: boolean` / `weight: number | null` fails because DuckDB returns strings.

**How to avoid:** Type to actual DuckDB types (`navigational: string`, `weight: string | null`) and coerce with Zod transforms (`z.string().transform(v => v === 'true')`). Don't change the DuckDB schema (out of scope — no behavior change).

**Phase to address:** Data-file migration phase (taxon.js).

---

### Pitfall 12: Mixed JS/TS interop — TS files importing still-JS files get `any`-typed returns

**What goes wrong:** A migrated `build-data.ts` importing still-JS `scripts/lib/manifest.js` gets `any` exports — strict guarantees silently lost; `tsc` passes even on misuse.

**How to avoid:** Migrate dependencies before dependents (topological order — exactly what "big-bang per area" means). Areas: `scripts/lib/` → `scripts/*` → `src/_lib/`+`src/_data/` → `src/components/`. Fully migrate an area before the next. Interim `.d.ts` only with an explicit TODO.

**Phase to address:** First migration area phase — establish topological order.

---

### Pitfall 13: hyparquet `parquetReadObjects()` is untyped — client records are `unknown[]` without validation

**What goes wrong:** `parquetReadObjects()` returns `object[]`; an `as OccurrenceRecord[]` cast is unsafe, but pulling all of Zod into the client adds ~50KB bundle.

**How to avoid:** Two candidate approaches — decide during planning: (a) a minimal `assertOccurrenceRecord(r): asserts r is OccurrenceRecord` type guard checking only fields the components use; or (b) `import.meta.env.DEV`-gated Zod validation that tree-shakes out of production (ARCHITECTURE.md). Either way, no unconditional Zod in the shipped client bundle. The Parquet schema is controlled by `build-data.ts`, so the runtime client check can be minimal.

**Phase to address:** Client component migration phase (parquet-cache.ts).

---

### Pitfall 14: Logic changes smuggled in with type changes (the core regression risk)

**What goes wrong:** Adding types to `filterRecords()` and simultaneously "fixing" the intentional null-elevation passthrough (documented in PROJECT.md) alters tested behavior. If the test is "improved" in the same commit, the regression is invisible.

**How to avoid:** Separate type changes from behavior changes per commit. CI rule: a type-only migration commit's `_site/` output must be byte-for-byte identical to pre-migration (`diff -r` ignoring timestamps). Makes regressions mechanically detectable.

**Phase to address:** Every migration phase — build-diff check in CI from phase 1.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Cast `getRowObjectsJS()` result without Zod parse | Faster to write | Runtime type errors if DuckDB column type changes | Never — transform at parse boundary |
| Single tsconfig for Node + Vite | Simpler setup | nodenext vs bundler resolution conflict | Never — two tsconfigs |
| Leave `any` from still-JS dependency | Unblocks dependent | Defeats strict mode for whole file | Only as explicit interim w/ TODO + ticket |
| Schema from TS ideal not data profile | Clean-looking schema | Rejects production data, hard-blocks build | Never — profile first |
| `// @ts-ignore` to suppress errors | Unblocks migration | Accumulates, masks real errors | Never during migration |

---

## Performance Traps

| Trap | Symptoms | Prevention |
|------|----------|------------|
| Zod `.parse()` on 85,933 records in build:data | `build:data` >60s; MAINT-03 fails | Validate at CSV input boundary; export records Parquet→Parquet without per-row JS materialization |
| Zod in client bundle | +~50KB to `main.js` | Minimal type guards client-side, or DEV-gated tree-shaken Zod |

---

## "Looks Done But Isn't" Checklist

- [ ] tsconfig has `"useDefineForClassFields": false` — verify a Lit state update re-renders in browser
- [ ] Separate Node (`nodenext`) and browser (`bundler`) tsconfigs both exist
- [ ] Null counts per column profiled against full 85,933 records before any schema written
- [ ] `_site/` output byte-identical before/after each migration phase (CI diff)
- [ ] `eleventy.config.ts` still contains `process.env.GITHUB_PAGES`; test updated to import from `.ts`
- [ ] `grep '\benum\b'` in migrated files returns empty
- [ ] All 22 test files migrated / runnable; `node --test` still runs all ~191 tests
- [ ] Zod absent from client bundle (no `ZodError`/`ZodType` strings in `_site/assets/main-*.js`)

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| useDefineForClassFields breaks reactivity | tsconfig setup (before migration) | tsc + browser state-change test |
| Over-strict schema rejects production data | Data schema phase (before schema written) | Schema run against full 85,933-row dataset |
| Node 24 rejects enums | tsconfig setup | isolatedModules; CI grep |
| Import-extension / mixed interop | tsconfig setup (two configs) | tsc nodenext errors |
| Light-DOM createRenderRoot errors | Lit component phase | tsc + map filter smoke test |
| filter-change event loses detail types | First event-bus component | FilterChangeDetail in shared types |
| getRowObjectsJS typed as any | Data pipeline phase | noImplicitAny on field usage |
| Eleventy pathPrefix regression | Eleventy config phase | GITHUB_PAGES assertion test |
| Vite entry broken on rename | Client component phase | full build + non-empty bundle check |
| Zod hot-path >5 min build | Data schema phase (spike) | `time npm run build:data` benchmark |
| Mixed JS/TS `any` leak | First migration area | noImplicitAny, no suppressions |
| Logic smuggled in type change | Every phase | `diff -r _site_before/ _site_after/` in CI |

---

## Sources

- Source code read: `src/components/{pnwm-filter-bar,pnwm-occurrence-map,pnwm-image-slideshow,pnwm-phenology-chart,pnwm-taxon-browser}.js`, `parquet-cache.js`, `filters.test.js`; `scripts/build-data.js`; `src/_data/{species,taxon}.js`; `src/_lib/glossary-transform.js`; `eleventy.config.js`, `eleventy.config.test.js`
- `.planning/PROJECT.md` Key Decisions (useDefineForClassFields, light DOM, null elevation passthrough, String() coercion, GITHUB_PAGES conditional)
- `package.json` (Node 24, Lit 3.3, Vite 8, DuckDB 1.5, hyparquet 1.25)
- Lit 3.x TypeScript docs (useDefineForClassFields); Node 24 `--experimental-strip-types` limitations (enums/namespaces/param-properties require full transform)

---
*Pitfalls research for: JS→strict-TypeScript migration, Eleventy+Vite+Lit+DuckDB+hyparquet static site — 2026-06-09*
