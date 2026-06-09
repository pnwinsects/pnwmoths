# Feature Landscape: JS → Strict TypeScript Migration (v3.0)

**Domain:** Maintainability refactor — full JS→TS conversion of an existing static-site build pipeline and Lit web-component codebase
**Researched:** 2026-06-09
**Confidence:** HIGH (codebase directly inspected; library types verified from node_modules; Eleventy TS support confirmed from official docs)

---

## Migration Scope

Five distinct conversion areas, each converted big-bang (all files in the area at once, no lingering `.allowJs`):

| Area | Files | Notes |
|------|-------|-------|
| **A: Shared schema layer** | new `src/types/` | Created first; everything else depends on it |
| **B: scripts/lib/*** | 4 files (`dropbox-download.js`, `dropbox-list.js`, `manifest.js`, `parse-photo-filename.js`) | Pure Node; no third-party type gaps |
| **C: src/_lib/*** | 2 files (`glossary-transform.js` + test) | Shared build/client lib; uses `node-html-parser` |
| **D: scripts/*** | ~27 files (build-data, tile, upload, migrate, copy, check, emit, generate, ingest) + 8 test files | Heaviest DuckDB + csv-parse usage |
| **E: src/_data/* + eleventy.config.js** | 6 data files + root config + 1 test file | Eleventy-typed callbacks; DuckDB; csv-parse |
| **F: src/components/*** | 10 component files + 5 test files | Lit; Leaflet; Chart.js; OpenSeadragon; hyparquet |

---

## 1. Area Ordering (Justified by Producer→Consumer Dependency)

**Recommended order: A → B → C → D → E → F**

**Why this order:**

Area A (shared schema) defines the canonical row types (`SpeciesRecord`, `Species`, `GlossaryWord`, `SpeciesImage`) that both the build pipeline (D, E) and the browser components (F) use. Without A, the other areas would each independently invent `Record<string, JS>` casts or `any`-typed locals. Converting A first means every subsequent area can import real types and have tsc verify them at conversion time rather than patching casts later.

Area B (scripts/lib) has no dependency on the schema types — these are pure utility modules (Dropbox API wrapping, manifest CSV management, filename parsing). They're also the smallest, cleanest area. Converting them first gives a working proof-of-concept that `node --import tsx --test` (or Node 22+ native type stripping) works before touching the complicated areas.

Area C (src/_lib) uses `node-html-parser` and is consumed by `eleventy.config.js`. It must be converted before E so the Eleventy config can import typed helpers. It doesn't depend on the schema types (it processes HTML, not occurrence data).

Area D (scripts/) depends on A for the data-contract types it validates and emits. It's converted before E because the Eleventy data files in E do the same DuckDB patterns — converting D first means the patterns are established and E can reuse them.

Area E (src/_data + eleventy.config.js) depends on A (data types), C (glossary transform import), and the patterns from D. It is converted before F because Eleventy is the build host — a working typed config is needed before validating that the client types from A are correct.

Area F (src/components) is last because it is the consumer of everything: it reads Parquet files whose shape is defined in A and emitted by D/E, uses hyparquet with types established in A, and is the most complex area (Lit property typing, Leaflet light DOM patterns). Converting it last means the schema types are stable and verified by the time F uses them.

**Dependency graph summary:**
```
A (schema)
  └──required-by──> B, C, D, E, F

B (scripts/lib)
  └──required-by──> D

C (src/_lib)
  └──required-by──> E

D (scripts/)
  └──required-by──> (none — D produces files; F consumes them at runtime, not import time)

E (src/_data + eleventy.config)
  └──required-by──> (none at TS level; Eleventy templates are Nunjucks, untouched)

F (src/components)
  └──required-by──> (nothing; leaf consumer)
```

---

## 2. Shared Data-Contract Layer (Technical Crux)

### The Problem

`build-data.js` emits Parquet via `COPY (SELECT * FROM records WHERE species_slug = '${slug}') TO ... (FORMAT parquet, COMPRESSION snappy)`. The column set is defined by the DuckDB schema on `records.csv`. `parquet-cache.js` reads those files with `parquetReadObjects()` which returns `Promise<Record<string, any>[]>` — completely untyped on the consumer side.

Without a shared schema, the producer and consumer can drift (e.g., `elevation_ft` renamed to `elevation` in the CSV, build-data updated, parquet-cache not updated) and tsc will not catch it.

### The Solution: Zod Schema in `src/types/`

Define one Zod schema per data entity. Zod v4 ships its own types (`types: ./index.d.cts`). Place these files in `src/types/` so they are importable from both Node scripts (build side) and Vite-bundled components (browser side). The `"type": "module"` package already supports ESM in both environments.

```typescript
// src/types/occurrence-record.ts
import { z } from 'zod';

export const OccurrenceRecordSchema = z.object({
  species_slug:  z.string(),
  record_type:   z.string(),
  latitude:      z.number(),
  longitude:     z.number(),
  state:         z.string().nullable(),
  county:        z.string().nullable(),
  locality:      z.string().nullable(),
  elevation_ft:  z.number().int().nullable(),
  year:          z.number().int().nullable(),
  month:         z.number().int().nullable(),
  day:           z.number().int().nullable(),
  collector:     z.string().nullable(),
  collection:    z.string().nullable(),
  notes:         z.string().nullable(),
});

export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;
```

Equivalent schemas for `Species`, `GlossaryWord`, `SpeciesImage`, `SpeciesPhoto` (from species-photos.json), `SpeciesState` (from species-states.json), and the taxon tree nodes.

### Build-Time Parquet Verification: What It Concretely Looks Like

After `build-data.js` emits a Parquet file, the verification step re-reads it and runs each row through the schema. Two practical approaches:

**Option 1: DuckDB re-read at build time (recommended)**

```typescript
// In build-data.ts, after the COPY loop:
import { OccurrenceRecordSchema } from '../src/types/occurrence-record.js';

// Sample verification: read back one Parquet file per species and validate rows
const sampleSlug = speciesRows[0].slug; // or a fixed canary species
const verifyConn = await db.connect();
const verifyResult = await verifyConn.runAndReadAll(
  `SELECT * FROM read_parquet('data/parquet/${sampleSlug}/records.parquet')`
);
const rows = verifyResult.getRowObjectsJS();
for (const row of rows) {
  const result = OccurrenceRecordSchema.safeParse(row);
  if (!result.success) {
    console.error(`Schema violation in ${sampleSlug}: ${result.error.format()}`);
    process.exit(1);
  }
}
```

**Option 2: hyparquet re-read at build time (validates exactly what the browser sees)**

Since the browser uses hyparquet, build-time verification with hyparquet catches format issues DuckDB read-back would not (e.g., a Snappy decompression edge case that hyparquet handles differently). This is heavier (imports hyparquet into Node build scripts) but is a true end-to-end check.

**Sample-vs-all-rows tradeoff:**

- Sampling (one species, all rows for that species) catches schema shape errors (wrong column names, type mismatches) at negligible build-time cost. Recommended as the baseline.
- Full verification (all ~1,348 species × their rows) catches per-species data outliers but adds 30–90 seconds to the build. Worth it as an optional `npm run verify:parquet` step, not as part of the default `npm run build`.
- The existing post-import DuckDB validation queries in `build-data.js` already catch orphaned records, invalid enum values, and null required fields. These run against the in-memory DB before Parquet export and are the primary correctness gate. The Zod-based Parquet re-read is a secondary type-shape check, not a replacement.

### JSON Data Contracts

The same pattern applies to `species-photos.json`, `species-states.json`, and the taxon tree JSON (embedded as a `<script type="application/json">` in templates). Define Zod schemas for these in `src/types/` and call `Schema.parse(JSON.parse(text))` in both the emitting scripts (post-emit verification) and the consuming components (at fetch time, before using the data).

---

## 3. Third-Party Library Typing Status

### Ships its own types (no action needed)

| Library | Version | Type Source | Notes |
|---------|---------|-------------|-------|
| `hyparquet` | 1.25.6 | `types/index.d.ts` | `parquetReadObjects` returns `Promise<Record<string, any>[]>` — the return type is intentionally wide; narrow it via Zod post-parse |
| `@duckdb/node-api` | 1.5.1-r.2 | `lib/index.d.ts` | `getRowObjectsJS()` returns `Promise<Record<string, JS>[]>` where `JS = null \| boolean \| number \| bigint \| string \| Uint8Array \| Date \| JS[] \| {[key: string]: JS}` — wide but typed; narrow with Zod |
| `chart.js` | 4.5.1 | `dist/types.d.ts` | Full types; `ChartConfiguration`, `Chart`, axis config all typed |
| `node-html-parser` | 7.1.0 | `dist/index.d.ts` | Full types; `HTMLElement`, `TextNode`, `parse()` all typed |
| `csv-parse` | 6.2.1 | `dist/esm/index.d.ts` | Full types including sync variant |
| `csv-stringify` | 6.7.0 | `dist/esm/index.d.ts` | Full types |
| `lit` | 3.3.2 | `*.d.ts` in package root | Full types including `LitElement`, `PropertyValues`, `html`, `css`; decorators require `experimentalDecorators: true` and `useDefineForClassFields: false` in tsconfig |
| `openseadragon` | 6.0.2 | `types/index.d.ts` | Ships own types as of v6; no `@types/openseadragon` needed (separate `@types` package also exists at 6.0.0 but the bundled types are current) |
| `zod` | 4.4.3 | `index.d.cts` | Ships own types |

### Needs `@types/` package

| Library | `@types/` Package | Current Version | Notes |
|---------|------------------|-----------------|-------|
| `leaflet` | `@types/leaflet` | 1.9.21 | `leaflet` itself says `types: none`; `@types/leaflet` is the DefinitelyTyped package; install as devDependency |

### Needs local declaration file

| Library / Module | Gap | Local Declaration Approach |
|-----------------|-----|---------------------------|
| `@11ty/eleventy` | `types: none`; no `@types/eleventy` on DefinitelylyTyped | Write `src/types/eleventy.d.ts` declaring the `EleventyConfig` callback parameter type and the `UserConfig` API surface used in `eleventy.config.ts`. Only the methods actually called need types: `addPlugin`, `addFilter`, `addTransform`, `addGlobalData`, `addPassthroughCopy`. The community package `11ty.ts` provides a more complete definition but adds a dependency; a local minimal shim is sufficient for this project. |
| `import.meta.env.BASE_URL` (Vite) | This is a Vite-injected global, not a Node global; it only exists in browser-bundled code. In component `.ts` files, tsc will not know about it. | Add `/// <reference types="vite/client" />` at the top of component files (or in a `src/vite-env.d.ts` file) to pull in Vite's ambient type declarations. |

### No gaps

`csv-parse`, `csv-stringify`, `node-html-parser`, `chart.js`, `lit`, `openseadragon`, `hyparquet`, `@duckdb/node-api`, `zod`, `@types/node` (already installable at v25.9.2) all resolve cleanly. The `@picocss/pico` package is CSS-only; no types needed.

---

## 4. Test Migration: `node --test` with TypeScript

### What changes

The project uses Node 24 (`.nvmrc: 24`). Node 22.6+ supports `--experimental-strip-types` (strips type annotations without transformation); Node 22.10+ promotes this to `--experimental-transform-types` (also handles `enum`, `namespace`, decorators). Node 24 ships both flags without the `--experimental-` prefix as `--strip-types` and has native TypeScript support built in.

The test command today:
```
node --test eleventy.config.test.js scripts/build-data.test.js ...
```

After migration:
```
node --strip-types --test eleventy.config.test.ts scripts/build-data.test.ts ...
```

No `tsx` or `ts-node` needed given Node 24. Native type stripping means: type annotations are removed before execution; tsc still runs separately as `tsc --noEmit` for type checking. The test runner does not type-check — it only strips annotations. This is the right split: fast test execution, separate type gate in CI.

**Caveat:** Node 24's native type stripping does not process `tsconfig.json` path aliases. This project has no path aliases (`import` statements use relative paths), so this is not a constraint.

### What does not change

- `import { describe, it } from 'node:test'` — unchanged
- `import assert from 'node:assert/strict'` — unchanged
- Named imports from tested modules: change file extension in the import path from `.js` to `.ts` (or drop extension if `moduleResolution: bundler` is used in tsconfig)
- No mocking library changes; `node:test` `mock.fn()` and `mock.module()` work identically in `.ts` files

### What improves

- Test helper objects (e.g., the `records` array literal in `filters.test.js`) can be typed as `OccurrenceRecord[]` instead of plain object literals, so tsc catches if a test helper omits a required field that the real data schema requires
- Import of tested functions will be type-checked: if `validateCsv` changes signature, test files that call it with wrong args will fail `tsc --noEmit` before the test even runs

### Keep `node --test`?

Yes. `node --test` with `--strip-types` is the minimal-dependency path. No Vitest, no Jest, no test framework migration. The test files are straightforward unit tests with no DOM requirements. This preserves the project's zero-extra-test-framework stance.

---

## Table Stakes

Features the migration must deliver to be considered complete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All `.js` files in scope converted to `.ts`; no `.js` remaining in converted areas | "Big-bang per area" is the committed approach | MEDIUM per area | One area at a time; no allowJs bridge period |
| `strict: true` in tsconfig (all strict sub-flags enabled) | Stated goal; without strict the migration adds type annotations but not safety | LOW (tsconfig setting) | `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes` all implied |
| `tsc --noEmit` passes with zero errors | CI gate; no errors means the types are consistent end-to-end | HIGH (the work itself) | Must pass before any area's PR merges |
| `tsc --noEmit` wired into `npm run build` and GitHub Actions PR check | Type errors must block merge; otherwise the gate has no teeth | LOW (config) | Add to existing `.github/workflows/` |
| All 191 tests pass after each area's conversion | Correctness gate; behavior must be byte-for-byte identical | MEDIUM | Run `node --strip-types --test ...` after each area |
| Build output identical before and after each area's conversion (diff `_site/`) | The milestone explicitly prohibits behavior changes | MEDIUM | `git diff _site/` or content hash comparison on a representative set of pages |
| Zod schema defined for every data contract crossing build→browser boundary | Schema-as-source-of-truth; types derived from schemas, not vice versa | MEDIUM | `OccurrenceRecord`, `Species`, `GlossaryWord`, `SpeciesImage`, `SpeciesPhoto`, `SpeciesState`, taxon tree node |
| Build-time validation of emitted Parquet shape (sample at minimum) | Catches producer/consumer drift at build time, not runtime | MEDIUM | Re-read one Parquet file post-export; run through `OccurrenceRecordSchema.parse()` |
| `@types/leaflet` and `@types/node` installed as devDependencies | Without these, Leaflet and Node built-ins (`fs`, `path`, `child_process`) are untyped | LOW | `npm install -D @types/leaflet @types/node` |
| Local declaration shim for `@11ty/eleventy` | No published types; `eleventy.config.ts` will not compile without at least a minimal shim | LOW-MEDIUM | ~30 lines covering the methods actually called |
| `/// <reference types="vite/client" />` in component type root | `import.meta.env.BASE_URL` used in `parquet-cache.ts` needs Vite's ambient types | LOW | One-line in `src/vite-env.d.ts` |
| Lit tsconfig settings: `experimentalDecorators: true`, `useDefineForClassFields: false` | Required for Lit reactive properties to work correctly with TS decorators | LOW | If decorators are adopted; components currently use `static properties` object syntax which works without decorators |

---

## Differentiators

Features that add value beyond the bare conversion, without adding new user-facing behavior.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Schema-derived types catching real data bugs | If a column is added to `records.csv` but not to `OccurrenceRecordSchema`, the build fails — not a runtime `undefined` in the browser | MEDIUM | The concrete payoff of Zod + strict TS; makes the migration more than a cosmetic rename |
| Full Parquet round-trip validation in a separate `npm run verify:parquet` script | Reads all species Parquet with hyparquet (the exact browser path) and validates every row; run in CI on the full dataset occasionally | MEDIUM | Not part of `npm run build` (too slow); opt-in CI job |
| Type-narrowed `filterRecords` — `records: OccurrenceRecord[]` instead of `Array<any>` | The `null < N` and `undefined < N` edge cases in `parquet-cache.ts` become visible to tsc; some can be fixed properly | LOW | Some current test coverage documents intentionally quirky JS coercion; with strict types, the right fix is a null guard |
| Explicit return types on all exported functions in `scripts/lib/` | Forces the author to think about the contract; prevents gradual return type widening | LOW | Enforce via `noImplicitReturns` and explicit annotation policy |
| `satisfies` operator for DuckDB column-definition objects | The `columns = { 'id': 'INTEGER', ... }` objects in DuckDB `read_csv()` calls can be typed with `satisfies` against a known column-spec type | LOW | Minor but makes column definitions refactor-safe |

---

## Anti-Features

Features to explicitly avoid during this migration.

| Anti-Feature | Why Problematic | Alternative |
|--------------|-----------------|-------------|
| Rewriting logic while converting | Logic changes mixed with type changes make it impossible to attribute bugs or diffs to their cause; also violates the "byte-for-byte identical output" requirement | Convert first, refactor in a separate PR after the milestone is closed |
| Fixing the `null year` coercion edge case in `filterRecords` during this milestone | The `null < 2000 → true` behavior is tested and documented; changing it during a type migration risks silent test breakage | Flag with a `// TODO(v3.1):` comment; address in a dedicated fix PR |
| Adopting Lit decorators (`@property`, `@state`) during conversion | The existing `static properties` object syntax is fully typed in strict TS without decorators; switching to decorators during a type migration introduces the `useDefineForClassFields` footgun and is a behavior-adjacent change | Keep `static properties` syntax; adopt decorators in a future refactor milestone if desired |
| Introducing path aliases (`@components/`, `@types/`) in tsconfig | Path aliases require `moduleResolution: bundler` or custom resolver config in both tsc and Vite; they add complexity with no safety benefit for this project size | Use relative imports throughout; the project is small enough |
| Making `@duckdb/node-api` result rows fully typed without Zod | Attempting to cast `Record<string, JS>` to domain types via `as` is unsafe; tsc will allow it but it is a lie | Always parse through `Schema.parse()` rather than asserting the type |
| Replacing `node --test` with Vitest or Jest | A test framework migration is orthogonal to the type migration and would balloon the scope | Keep `node --test`; upgrade to `--strip-types` flag only |
| Converting Nunjucks templates | Templates are not TypeScript; they do not benefit from tsc and are outside the milestone scope | Leave `.njk` files unchanged |
| Converting `tile-config.json` or CSV source files | Data files are not code | Leave data files unchanged |
| Adding React, Vue, or any new UI framework | This is a maintainability refactor; the Lit component approach is not under review | Leave all Lit components as Lit components |
| Enabling `allowJs: true` in tsconfig | `allowJs` creates a mixed-mode environment that lets unconverted files hide; the big-bang-per-area approach relies on tsc rejecting any remaining `.js` in scope | Compile each area with a targeted tsconfig that excludes unconverted areas |

---

## Feature Dependencies

```
A: Shared schema types (src/types/)
  └──required-by──> D: scripts/ (import OccurrenceRecord to type DuckDB result casts)
  └──required-by──> E: src/_data/ (import Species, GlossaryWord to type DuckDB returns)
  └──required-by──> F: src/components/ (import OccurrenceRecord to type parquet-cache return)

B: scripts/lib/ (pure utilities)
  └──required-by──> D: scripts/ (imports manifest.ts, dropbox-download.ts, etc.)
  └──no dependency on A (schema types)

C: src/_lib/ (glossary-transform.ts)
  └──required-by──> E: eleventy.config.ts (imports applyGlossaryTerms, buildTermMap)
  └──no dependency on A (operates on HTML strings, not domain data)

D: scripts/ (build pipeline)
  ├──requires──> A (schema types for Zod validation of emitted data)
  └──requires──> B (lib utilities)

E: src/_data/ + eleventy.config.ts
  ├──requires──> A (schema types)
  └──requires──> C (glossary transform)

F: src/components/
  ├──requires──> A (OccurrenceRecord type for parquet-cache.ts)
  └──no build-time import dependency on D/E (consumes files at runtime, not import time)
```

### Dependency Notes

- **A before D and F:** The schema types are the entire point of the migration's data-contract work. Converting D or F without A means they can only use `Record<string, any>` for DuckDB/hyparquet results, which is no better than the JS status quo.
- **B before D:** `build-data.ts` imports nothing from `scripts/lib/`, but `ingest-photos.ts`, `tile-photos.ts`, and `upload-tiles.ts` import from `scripts/lib/`. If `scripts/lib/` is still `.js` when `scripts/` is converted, tsc will either error (if `allowJs: false`) or silently use untyped imports (if `allowJs: true`). Convert B first to avoid either problem.
- **C before E:** `eleventy.config.ts` imports `applyGlossaryTerms` and `buildTermMap` from `src/_lib/glossary-transform`. If `glossary-transform` is still `.js`, the import is untyped.
- **Self-contained script helpers:** The KEY Decisions section records that `redact`, `withRetry`, `logStage`, and `walk` helpers are copied verbatim into each script rather than shared. These helpers need to be typed in each script individually — there is no shared helper module to convert. This is intentional and should be preserved.

---

## Per-Area Definition of Done

An area is done when ALL of the following are true:

1. **No `.js` files remain in the area** (find returns empty for `*.js` excluding test output in `_site/`)
2. **`tsc --noEmit` passes with zero errors** for a tsconfig that includes the area and all its dependencies
3. **All tests for the area pass** via `node --strip-types --test <area test files>`
4. **Build output is identical** — `npm run build` produces `_site/` with byte-for-byte identical HTML/JSON/Parquet for a representative set of pages (diff against a pre-migration `_site/` snapshot)
5. **No `// @ts-ignore` or `// @ts-expect-error` comments** used to suppress errors (narrow exceptions require a comment explaining why, approved in PR review)
6. **No untyped `as unknown as T` double casts** except where Zod `.parse()` cannot be used (and those must be wrapped in a comment)

---

## MVP Definition

### Phase 1 (deliver together, in order)

- [ ] **A: Schema layer** — Zod schemas for all five data entities; `z.infer<>` types exported; installed `zod` as production dependency (browser bundle needs it for `parquet-cache.ts`)
- [ ] **tsconfig infrastructure** — root `tsconfig.json` with `strict: true`; per-area tsconfig extends; `tsc --noEmit` in `npm run build` and CI

### Phase 2

- [ ] **B: scripts/lib/** — lowest risk; validates the test runner approach (`node --strip-types --test`)
- [ ] **C: src/_lib/** — small area; uses `node-html-parser` which has clean types

### Phase 3

- [ ] **D: scripts/** — largest area; most DuckDB typing; add `@types/node` here
- [ ] **E: src/_data/ + eleventy.config.ts** — Eleventy shim required; DuckDB patterns reuse from D

### Phase 4

- [ ] **F: src/components/** — Lit, Leaflet (`@types/leaflet`), Chart.js, OSD; most complex third-party typing

### After Validation

- [ ] Full Parquet verification script (`npm run verify:parquet`) — runs all species through hyparquet + Zod
- [ ] CI job for periodic full-verification run (not on every PR — too slow)

---

## Feature Prioritization Matrix

| Feature | Maintenance Value | Implementation Cost | Priority |
|---------|-------------------|---------------------|----------|
| Schema types (A) — shared Zod definitions | HIGH — single source of truth | MEDIUM | P1 |
| strict tsconfig + CI gate | HIGH — enforces migration durability | LOW | P1 |
| B + C conversion (lib areas) | MEDIUM — unblocks D/E | LOW | P1 |
| D conversion (scripts/) | HIGH — pipeline is most change-prone | HIGH | P1 |
| E conversion (data files + eleventy.config) | MEDIUM — rarely changed | MEDIUM | P2 |
| F conversion (components) | HIGH — components get new features regularly | HIGH | P1 |
| Build-time Parquet sample verification | HIGH — catches producer/consumer drift | MEDIUM | P1 |
| Full verify:parquet script | MEDIUM — belt-and-suspenders | LOW | P2 |
| Lit decorator adoption | LOW — cosmetic; existing syntax works | MEDIUM | P3 |

---

## Sources

- **Codebase inspection** (HIGH confidence) — `scripts/build-data.js`, `src/components/parquet-cache.js`, `src/components/pnwm-occurrence-map.js`, `src/components/pnwm-occurrence-popup.js`, `src/_lib/glossary-transform.js`, `src/_data/glossary.js`, `src/_data/taxon.js`, `eleventy.config.js`, `eleventy.config.test.js`, test files
- **node_modules type inspection** (HIGH confidence) — `@duckdb/node-api/lib/DuckDBResult.d.ts` (`getRowObjectsJS` returns `Promise<Record<string, JS>[]>`), `@duckdb/node-api/lib/JS.d.ts`, `hyparquet/types/read.d.ts` (`parquetReadObjects` returns `Promise<Record<string, any>[]>`), `lit/*.d.ts`, `openseadragon/types/index.d.ts`, `chart.js/dist/types.d.ts`, `node-html-parser/dist/index.d.ts`, `csv-parse/dist/esm/index.d.ts`, `csv-stringify/dist/esm/index.d.ts`
- **npm info** (HIGH confidence) — `@types/leaflet@1.9.21` exists; `@types/openseadragon@6.0.0` exists but `openseadragon` now bundles its own types; `@types/node@25.9.2` exists; `@types/node-html-parser` does not exist (library bundles types)
- **[Eleventy TypeScript docs](https://www.11ty.dev/docs/languages/typescript/)** (HIGH confidence) — `eleventy.config.ts` is supported via Node 22.6+ type stripping; Node 24 used in this project makes this a first-class approach
- **[Lit decorators docs](https://lit.dev/docs/components/decorators/)** (HIGH confidence) — `experimentalDecorators: true` + `useDefineForClassFields: false` required for Lit with experimental decorators in TS strict mode
- **[Node.js TypeScript running docs](https://nodejs.org/learn/typescript/run)** (HIGH confidence) — `--strip-types` available in Node 22.6+; stable in Node 24; no tsx/ts-node needed
- **[Zod v4 docs](https://zod.dev/)** (HIGH confidence) — stable; `z.infer<typeof Schema>` pattern; ships own types
- **`.planning/PROJECT.md`** (HIGH confidence) — confirmed self-contained per-script helper pattern; key decisions on DuckDB usage; Node 24 from `.nvmrc`

*Feature research for: PNW Moths v3.0 JS→TypeScript migration*
*Researched: 2026-06-09*
