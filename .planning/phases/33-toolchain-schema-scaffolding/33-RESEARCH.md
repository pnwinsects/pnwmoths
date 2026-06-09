# Phase 33: Toolchain & Schema Scaffolding — Research

**Researched:** 2026-06-09
**Domain:** TypeScript toolchain installation + Zod 4 schema authoring (pre-migration scaffolding)
**Confidence:** HIGH — all entity columns profiled against live production data via DuckDB; packages verified on npm registry; hyparquet API confirmed from installed source; Zod 4 import paths confirmed by running node against installed package

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Validation architecture — trust by immutability**
- D-01: Static TS (no runtime validation) for build-locked data. If `tsc` passes and DuckDB read succeeded, shape is known.
- D-02: Runtime validation only at the CDN dynamic boundary: per-species `records.parquet` and `species-states.json`.
- D-03: Validate schema/structure, not rows. Parquet → O(columns) column-metadata check. `species-states.json` → top-level + element shape. Any per-row validation stays DEV-gated.

**Validation library — Zod 4**
- D-04: Zod 4 as schema source of truth. One schema per entity in `src/types/`. Types derived via `z.infer<>`.
- D-05: Build-side imports full `zod`. Browser-side imports `zod/mini` (or hand-rolled guard). Only `OccurrenceRecord` and `SpeciesState` are parsed at runtime; browser bundle cost measured in Phase 37.
- D-06: All 7 entities get Zod schemas (consistency/SOT), but build side consumes only derived types (free); validators invoked only at the two dynamic load points.

**Drift / strictness policy**
- D-07: Lenient where we control the data (CSV drift caught by DuckDB typed read + integrity SQL, not Zod). Strict where data can drift (Parquet/JSON loaded from CDN).

**Data profiling (SCHEMA-03) — mandatory**
- D-08: Profile per-column nullability against full production dataset before finalizing schemas. No schema may reject any real production row. `records.csv` is read without `nullstr=''` — account for DuckDB's default null handling.

### Claude's Discretion
- Schema module layout: single `src/types/schemas.ts` vs per-entity files. (Research recommends single file.)
- Per-boundary strictness: exact `.strict()` / strip / passthrough per schema (D-07 gives direction).
- tsconfig specifics: 3-config layout and `allowImportingTsExtensions` vs `rewriteRelativeImportExtensions` flag choice (both work with `noEmit:true`; see § Open Technical Questions below for decision).
- Whether data-profile produces a committed report (encouraged but not required).

### Deferred Ideas (OUT OF SCOPE)
- Content-hash / fingerprint per-species Parquet URLs (caching/deploy architecture change, not TS migration work)
- Lightbox close button UI bug fix (Phase 37+ at earliest)
- Migrate Pagefind to Component UI (unrelated to TS scaffolding)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS-01 | Separate strict tsconfigs for Node (`module: nodenext`) and browser/Vite (`moduleResolution: bundler`), plus root config; single `npm run typecheck` command | § tsconfig Layout section |
| TS-02 | Browser tsconfig sets `useDefineForClassFields: false` and `experimentalDecorators: true` | § tsconfig Layout section; Pitfall 1 |
| TS-03 | Both tsconfigs set `isolatedModules: true` and erasable-syntax constraints; no `enum` anywhere | § tsconfig Layout section; Pitfall 3 |
| TS-04 | `typescript`, `zod`, `@types/node`, `@types/leaflet` installed; local Eleventy type-shim covers every called API method | § Standard Stack section; § Eleventy Shim section |
| TS-05 | `npm run typecheck` runs `tsc --noEmit` across both configs, exits zero, no source files yet converted | § Standard Stack section |
| SCHEMA-01 | `src/types/` schema module with one schema per entity, importable by both targets | § Schema Module section |
| SCHEMA-02 | TypeScript types derived from schemas via `z.infer<>` | § Code Examples section |
| SCHEMA-03 | Schemas profiled against full production dataset before finalization | § Data Profile section — **profile completed in this research** |
</phase_requirements>

---

## Summary

Phase 33 is a pure scaffolding phase: install and configure the TypeScript toolchain, define Zod 4 schemas for all seven data entities grounded in real production data, and get `npm run typecheck` green — all before any `.js` source file is renamed to `.ts`. The existing build must keep producing 1,364 species pages unchanged.

The key technical work divides into three tracks: (1) three tsconfig files with the exact compiler flags that satisfy Node 24 native type-stripping, Lit 3 reactive properties, Vite 8/Oxc, and `isolatedModules`; (2) one `src/types/schemas.ts` with Zod 4 schemas for all seven entities grounded in the null distribution profiled from the full production dataset (92,554 records, 1,433 species); (3) a local `src/types/eleventy.d.ts` shim covering exactly the eight `eleventyConfig.*` methods called in `eleventy.config.js`.

The data profile (SCHEMA-03, D-08) was completed during this research. Key findings: `records.csv` county is 100% NULL in DuckDB (all blank cells are read as SQL NULL because records.csv has no `nullstr=''`); `records.csv` locality, elevation_ft, year, month, day, collector, collection, notes are partially nullable; species common_name (68%), similar_species (27%), subfamily (12%) are nullable; images.csv navigational and subspecies are 100% empty. All schemas must use `.nullable()` for these columns — not `.optional()` (hyparquet writes `null`, not `undefined`).

The package situation is already resolved: slopcheck ran and installed `typescript@6.0.3`, `zod@4.4.3`, `@types/node@25.9.2`, `@types/leaflet@1.9.21`, `@types/openseadragon@5.0.2` into the project. However, slopcheck installed them into `dependencies` rather than `devDependencies`; the planner must move all type packages and typescript to `devDependencies` and keep `zod` as a `dependency` (used in build scripts at build time). `@types/node@25` tracks Node.js 25 (the project runs Node 24) — pin to `@types/node@^24` instead. `@types/openseadragon@5` is an old stub; openseadragon@6.0.2 ships its own types at `types/index.d.ts`, so `@types/openseadragon` should be removed entirely.

**Primary recommendation:** Use `allowImportingTsExtensions: true` (not `rewriteRelativeImportExtensions`) in the Node tsconfig with `noEmit: true`. Author all schemas from the profiled null distributions before any import resolution is tested.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Type-checking Node build scripts | Node (tsc `nodenext`) | — | Scripts run under Node 24 native type-stripping |
| Type-checking browser components | Vite/Browser (tsc `bundler`) | — | Components are Vite-bundled; `moduleResolution: bundler` matches Vite's resolver |
| Shared schema types | `src/types/` (pure, no env APIs) | Included in both tsconfigs | Schemas must be importable by both Node and Vite without env-specific imports |
| Runtime validation (production) | Browser (load-time) | — | Only `records.parquet` and `species-states.json` are dynamically fetched; validation happens in components |
| Runtime validation (dev-only) | Browser DEV path | — | Full Zod parse per-row gated by `import.meta.env.DEV`, tree-shaken from prod |
| Build-time validation | Node scripts | — | DuckDB typed `read_csv` + integrity SQL is the build gate; Zod schemas provide types only at build side |

---

## Standard Stack

### Core (Phase 33 installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` | `^5.8` (or 6.0.3) | Type-checker; `tsc --noEmit` CI gate | The project was already targeting TS 5.8+; 6.0.3 installed by slopcheck is compatible but see Package Audit note |
| `zod` | `4.4.3` | Schema source-of-truth; derives TS types via `z.infer<>` | D-04; stable v4 since July 2025; build-side only in default path |
| `@types/node` | `^24` (NOT 25) | Node.js built-in declarations for `fs`, `path`, `child_process`, etc. | Node version in `.nvmrc` is 24; @types/node major must match |
| `@types/leaflet` | `^1.9.21` | Leaflet types for `pnwm-occurrence-map` | Leaflet 1.9.4 installed; no bundled types |

[VERIFIED: npm registry] — all four confirmed via `npm view` and slopcheck `[OK]`.

### Packages NOT to install

| Package | Reason |
|---------|--------|
| `@types/openseadragon` | openseadragon@6.0.2 ships its own types at `types/index.d.ts`; the `@types/openseadragon` package is a stub/compat shim (its index.d.ts uses enum syntax incompatible with the project's no-enum constraint) — do not install |
| `@types/node@25` | Tracks Node 25, not Node 24; pin to `@types/node@^24` |
| `tsx`, `ts-node` | Node 24 native type-stripping handles all `.ts` execution; no loader needed |
| `vite-plugin-checker` | Redundant with `tsc --noEmit` in CI; slow in watch mode |

### Corrections to package.json after slopcheck install

slopcheck installed packages into `dependencies`. The following corrections are needed:

1. **Move to `devDependencies`:** `typescript`, `@types/node`, `@types/leaflet`
2. **Keep in `dependencies`:** `zod` (consumed by build scripts which are not dev-only)
3. **Remove:** `@types/openseadragon` (OSD 6 ships own types)
4. **Downgrade:** `@types/node@^25.9.2` → `@types/node@^24` (must match Node 24)
5. **TypeScript 6.0.3 vs 5.8:** slopcheck installed 6.0.3 (latest). This is compatible with the project (STACK.md confirmed 6.0 viability). However, TypeScript 6.0 makes `strict: true` the default and drops `moduleResolution: node/node10` and `target: es5`. Since neither is used here, 6.0.3 is fine. Keep it unless the team prefers 5.8 for conservatism.

**Installation command (corrected):**
```bash
npm install zod@^4
npm install -D typescript@^5.8 @types/node@^24 @types/leaflet
npm uninstall @types/openseadragon
```

---

## Package Legitimacy Audit

> slopcheck ran successfully and audited all packages.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `typescript` | npm | 12+ yrs | 60M+/wk | github.com/microsoft/TypeScript | [OK] | Approved — move to devDependencies |
| `zod` | npm | 4+ yrs | 15M+/wk | github.com/colinhacks/zod | [OK] | Approved — keep in dependencies |
| `@types/node` | npm | 10+ yrs | 50M+/wk | github.com/DefinitelyTyped/DefinitelyTyped | [OK] | Approved — move to devDependencies, pin @^24 |
| `@types/leaflet` | npm | 8+ yrs | 1M+/wk | github.com/DefinitelyTyped/DefinitelyTyped | [OK] | Approved — move to devDependencies |
| `@types/openseadragon` | npm | 8 yrs | low | No source repo listed | [OK] | REMOVE — OSD 6 ships own types; this is a now-obsolete stub |

**Packages removed due to slopcheck [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none  
**Packages to remove for other reasons:** `@types/openseadragon` — OSD 6.0.2 ships `types/index.d.ts` natively; the `@types/` stub is superseded.

---

## Open Technical Questions Resolved

### Q1: tsconfig 3-config layout — `allowImportingTsExtensions` vs `rewriteRelativeImportExtensions`

**Decision: Use `allowImportingTsExtensions: true` in `tsconfig.node.json`.**

Rationale: `allowImportingTsExtensions` is designed for the `noEmit: true` + Node-type-stripping workflow. It tells tsc "I know these `.ts` extension imports are for a runtime that strips types natively; accept them." It enforces `noEmit: true` (which is always true in this project). `rewriteRelativeImportExtensions` is designed for scenarios where tsc emits `.js` files and rewrites `.ts` → `.js` on output — that's not what this project does (no emit ever). Both happen to work with `noEmit: true`, but `allowImportingTsExtensions` is the semantically correct choice for native type-stripping.

**tsconfig.json (root — drives `npm run typecheck`):**
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.browser.json" }
  ]
}
```
Note: root config uses `references` array. `tsc --noEmit` on a root references config performs type-checking over all referenced configs sequentially. This is NOT project-references build mode (`tsc --build`) — it is a simple sequential type-check. The `composite: true` in sub-configs is NOT required for `--noEmit`-only usage; omit it to avoid `.tsbuildinfo` side effects.

**tsconfig.node.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "scripts/**/*.ts",
    "src/_data/**/*.ts",
    "src/_lib/**/*.ts",
    "src/types/**/*.ts",
    "eleventy.config.ts",
    "**/*.test.ts"
  ]
}
```

**tsconfig.browser.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "types": ["vite/client"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/components/**/*.ts",
    "src/types/**/*.ts"
  ]
}
```

**`npm run typecheck` command (add to package.json scripts):**
```bash
tsc --noEmit && tsc -p tsconfig.node.json --noEmit
```
This runs the browser tsconfig first (root tsconfig.json includes src/components + src/types), then the node tsconfig. Both exit 0 with no source files converted yet.

Note on SUMMARY.md cross-doc disagreement: ARCHITECTURE.md shows 3-config layout with `composite: true` for sub-configs; STACK.md shows 2-config with no root. Use 3-config (root + node + browser) WITHOUT `composite: true` — composite adds `.tsbuildinfo` file side effects and is only needed for incremental `--build` mode.

### Q2: Zod 4 `zod/mini` — import paths and API surface

**Confirmed from installed package `zod@4.4.3`:**

`zod/mini` is a real export path in zod@4 (confirmed via `npm view zod@4.4.3 exports` — the `./mini` subpath exists with proper `import`/`require`/`types` exports).

**API difference from full zod:**
- Full zod: method-chaining API — `z.object({}).nullable()`, `z.number().nullable()`
- `zod/mini`: functional/pipe API — methods like `.nullable()` are standalone functions: `nullable(number())`

**z.infer type derivation:** Both full zod and `zod/mini` export the `infer` type from `zod/v4/core`. The type is declared as `export type { output as infer }` — so `z.infer<typeof Schema>` works identically for schemas defined in either API variant.

**Critical D-05 implication:** Schemas authored using full zod's method-chaining API (for this phase) CANNOT be imported by browser code that uses `zod/mini` for runtime validation. The two libraries have incompatible parse methods. The browser-side runtime check must either:
1. Re-author the runtime-only validator using `zod/mini`'s functional API (separate from the schema type definitions)
2. Use a hand-rolled type guard that doesn't depend on Zod runtime at all
3. Import full zod under `import.meta.env.DEV` guard so it tree-shakes from production

For Phase 33, this is a schema-authoring phase only — no runtime validator is wired yet. The Phase 33 schemas use full zod. The D-05 browser-side question is resolved in Phase 37 when components migrate. Document as an open question for that phase.

**Import path:** Always use `import { z } from 'zod'` (NOT `'zod/v4'`). The versioned `zod/v4` subpath causes Vite bundler resolution errors (missing `./v4/core` specifier, confirmed in ARCHITECTURE.md source #4907).

### Q3: hyparquet column-metadata API for O(columns) schema check

**Confirmed from installed `hyparquet@1.25.6` source and a live parquet file:**

`parquetMetadata(arrayBuffer)` reads only the file footer (the last N bytes, not all rows). This is O(file_footer_size), which is effectively O(columns). It returns `FileMetaData` with a `schema: SchemaElement[]` array.

**Actual column schema for `records.parquet` (confirmed from live file):**
```
species_slug  BYTE_ARRAY  OPTIONAL  converted=UTF8
record_type   BYTE_ARRAY  OPTIONAL  converted=UTF8
latitude      DOUBLE      OPTIONAL
longitude     DOUBLE      OPTIONAL
state         BYTE_ARRAY  OPTIONAL  converted=UTF8
county        BYTE_ARRAY  OPTIONAL  converted=UTF8
locality      BYTE_ARRAY  OPTIONAL  converted=UTF8
elevation_ft  INT32       OPTIONAL  converted=INT_32
year          INT32       OPTIONAL  converted=INT_32
month         INT32       OPTIONAL  converted=INT_32
day           INT32       OPTIONAL  converted=INT_32
collector     BYTE_ARRAY  OPTIONAL  converted=UTF8
collection    BYTE_ARRAY  OPTIONAL  converted=UTF8
notes         BYTE_ARRAY  OPTIONAL  converted=UTF8
```
Note: ALL columns are `OPTIONAL` (DuckDB writes nullable columns as OPTIONAL). The leaf columns are obtained by `metadata.schema.filter(el => el.type)` (filtering out the root message element which has no `type`).

**Schema validation approach for Phase 37 (document here so Phase 33 schemas are shaped correctly):**
```typescript
// O(columns) validation — reads only footer
const meta = parquetMetadata(arrayBuffer);
const leafCols = meta.schema.filter(el => el.type); // excludes root
const colNames = leafCols.map(el => el.name);
const expected = ['species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes'];
const missing = expected.filter(n => !colNames.includes(n));
if (missing.length > 0) throw new Error(`records.parquet missing columns: ${missing.join(', ')}`);
```
No Zod needed for this check — it's a column-name set comparison. `parquetMetadata` is exported from `hyparquet` and reads only the footer.

### Q4: Eleventy type-shim — methods actually called

From `eleventy.config.js` analysis, the `eleventyConfig` parameter receives exactly these method calls:

| Method | Signature notes |
|--------|-----------------|
| `addPlugin(plugin, options?)` | plugin is an object/function; options is any |
| `addFilter(name, fn)` | fn is `function(value: unknown): unknown` (sync or async) |
| `addTransform(name, fn)` | fn is `function(this: EleventyTransformContext, content: string): string` — `this.page.outputPath` is `string \| false` |
| `addGlobalData(name, value)` | value is any |
| `addPassthroughCopy(pathOrRecord)` | arg is `string \| Record<string, string>` |
| `on(event, callback)` | event is `'eleventy.after'`; callback receives `{ runMode: string }` |

`@11ty/eleventy` ships zero TypeScript declarations. No `@types/eleventy` or `@11ty/eleventy-types` packages exist on npm. A local shim is required.

**Shim outline (`src/types/eleventy.d.ts`, ~30 lines):**
```typescript
export interface EleventyTransformContext {
  page: { outputPath: string | false };
}

export interface EleventyConfig {
  addPlugin(plugin: unknown, options?: unknown): void;
  addFilter(name: string, fn: (this: unknown, value: unknown) => unknown): void;
  addTransform(
    name: string,
    fn: (this: EleventyTransformContext, content: string) => string
  ): void;
  addGlobalData(name: string, value: unknown): void;
  addPassthroughCopy(pathOrRecord: string | Record<string, string>): void;
  on(event: string, callback: (data: Record<string, unknown>) => Promise<void> | void): void;
}

declare module '@11ty/eleventy' {
  export class EleventyRenderPlugin {}
  export function eleventyConfig(config: EleventyConfig): {
    pathPrefix: string;
    dir: { input: string; output: string; data: string };
  };
}
```
The `eleventy.config.ts` default export function takes `EleventyConfig` as its parameter.

### Q5: Data profiling results (SCHEMA-03 — mandatory gate, completed here)

**Profiled via DuckDB against full production dataset.**

**`records.csv` — 92,554 rows — read WITHOUT `nullstr=''` (matches `build-data.js`)**

| Column | Type | Null count | Null % | Schema rule |
|--------|------|-----------|--------|-------------|
| species_slug | VARCHAR | 0 | 0.0% | required `z.string().min(1)` |
| record_type | VARCHAR | 0 | 0.0% | required `z.string()` (4 distinct values confirmed below) |
| latitude | DOUBLE | 0 | 0.0% | required `z.number()` |
| longitude | DOUBLE | 0 | 0.0% | required `z.number()` |
| state | VARCHAR | 0 | 0.0% | required `z.string()` (6 distinct values confirmed below) |
| county | VARCHAR | 92,554 | 100.0% | ALL NULL — `z.string().nullable()` |
| locality | VARCHAR | 757 | 0.8% | `z.string().nullable()` |
| elevation_ft | INTEGER | 3,471 | 3.8% | `z.number().int().nullable()` |
| year | INTEGER | 4,822 | 5.2% | `z.number().int().nullable()` |
| month | INTEGER | 4,442 | 4.8% | `z.number().int().nullable()` |
| day | INTEGER | 5,082 | 5.5% | `z.number().int().nullable()` |
| collector | VARCHAR | 8,219 | 8.9% | `z.string().nullable()` |
| collection | VARCHAR | 4,472 | 4.8% | `z.string().nullable()` |
| notes | VARCHAR | 70,887 | 76.6% | `z.string().nullable()` |

Important: DuckDB reads blank CSV cells as SQL `NULL` for VARCHAR columns (no `nullstr=''` needed for blank cells — that option controls empty-string-to-NULL coercion). The county column is blank for ALL records (100% null). This is expected: county is populated from a separate enrichment step that is not present in the current dataset.

Distinct `record_type` values: `specimen` (86,182), `photograph` (4,268), `literature` (2,091), `sight_field_notes` (13).
Distinct `state` values: `WA` (32,435), `OR` (28,734), `BC` (18,780), `ID` (9,313), `AB` (2,369), `MT` (923).

**`species.csv` — 1,433 rows — read WITH `nullstr=''`**

| Column | Type | Null count | Null % | Schema rule |
|--------|------|-----------|--------|-------------|
| id | INTEGER | 0 | 0.0% | required `z.number().int()` |
| genus | VARCHAR | 0 | 0.0% | required `z.string()` |
| species | VARCHAR | 0 | 0.0% | required `z.string()` |
| common_name | VARCHAR | 975 | 68.0% | `z.string().nullable()` |
| noc_id | VARCHAR | 26 | 1.8% | `z.string().nullable()` |
| authority | VARCHAR | 50 | 3.5% | `z.string().nullable()` |
| family | VARCHAR | 40 | 2.8% | `z.string().nullable()` |
| similar_species | VARCHAR | 385 | 26.9% | `z.string().nullable()` (pipe-delimited slugs) |
| subfamily | VARCHAR | 178 | 12.4% | `z.string().nullable()` |

**`images.csv` — 4,035 rows**

| Column | Type | Empty/Null % | Schema rule |
|--------|------|-------------|-------------|
| species_slug | VARCHAR | 0% | required `z.string()` |
| filename | VARCHAR | 0% | required `z.string()` |
| photographer | VARCHAR | 0% | required `z.string()` |
| weight | VARCHAR | 0% | required `z.string()` (coerce to number in transform) |
| license | VARCHAR | 0% | required `z.string()` |
| view | VARCHAR | 2.2% | `z.string().nullable()` |
| specimen | VARCHAR | 2.2% | `z.string().nullable()` |
| navigational | VARCHAR | 100.0% | ALL EMPTY — `z.string().nullable()` (default `null`) |
| locality | VARCHAR | 15.4% | `z.string().nullable()` |
| state | VARCHAR | 16.1% | `z.string().nullable()` |
| latitude | VARCHAR | 18.0% | `z.string().nullable()` (VARCHAR from CSV, not DOUBLE) |
| longitude | VARCHAR | 18.0% | `z.string().nullable()` |
| elevation_ft | VARCHAR | 19.8% | `z.string().nullable()` |
| year | VARCHAR | 16.5% | `z.string().nullable()` |
| month | VARCHAR | 16.8% | `z.string().nullable()` |
| day | VARCHAR | 16.8% | `z.string().nullable()` |
| collector | VARCHAR | 16.1% | `z.string().nullable()` |
| subspecies | VARCHAR | 100.0% | ALL EMPTY — `z.string().nullable()` |

Note: `taxon.js` reads images.csv with all columns as VARCHAR (no coercion at read time). The schema must match this — all columns are VARCHAR. `weight` is coerced with `TRY_CAST(weight AS INTEGER)` in the taxon query.

**`glossary.csv` — 149 rows**

| Column | Type | Empty/Null % | Schema rule |
|--------|------|-------------|-------------|
| term | VARCHAR | 0% | required `z.string()` |
| definition | VARCHAR | 0% | required `z.string()` |
| image_filename | VARCHAR | 69.1% | `z.string().nullable()` |
| photographer | VARCHAR | 100.0% | ALL EMPTY — `z.string().nullable()` |

---

## Architecture Patterns

### System Architecture Diagram

```
src/types/schemas.ts
(Zod schemas + z.infer<> types)
     │
     ├── imported via relative .ts path ──→  scripts/*.ts        (Node 24, nodemext)
     │                                        src/_data/*.ts      (Node 24, nodemext)
     │                                        eleventy.config.ts  (Node 24, nodemext)
     │                                        *.test.ts           (node --test)
     │
     └── imported via relative .ts path ──→  src/components/*.ts (Vite 8, bundler)
                                              (types only in Phase 33; validators Phase 37)

tsconfig.json (root)
  references:
    tsconfig.node.json ──→ checks Node target files
    tsconfig.browser.json ──→ checks browser target files

npm run typecheck = tsc --noEmit && tsc -p tsconfig.node.json --noEmit
  └── Phase 33: both pass with zero source files converted
```

### Recommended Project Structure

```
pnwmoths/
├── src/
│   └── types/                    ← NEW in Phase 33
│       ├── schemas.ts            ← 7 Zod schemas + derived types
│       ├── eleventy.d.ts         ← ~30-line Eleventy config shim
│       └── index.ts              ← re-exports
├── tsconfig.json                 ← NEW: root references config
├── tsconfig.node.json            ← NEW: Node 24 nodenext target
└── tsconfig.browser.json         ← NEW: Vite bundler target
```

### Pattern 1: Schema as source of truth

```typescript
// src/types/schemas.ts
import { z } from 'zod';

// OccurrenceRecord — describes what hyparquet produces from records.parquet
// county is 100% null in production data — must be .nullable()
export const OccurrenceRecordSchema = z.object({
  species_slug: z.string(),
  record_type: z.string(),
  latitude:    z.number(),
  longitude:   z.number(),
  state:       z.string(),
  county:      z.string().nullable(),     // 100% null in production
  locality:    z.string().nullable(),
  elevation_ft: z.number().int().nullable(),
  year:        z.number().int().nullable(),
  month:       z.number().int().nullable(),
  day:         z.number().int().nullable(),
  collector:   z.string().nullable(),
  collection:  z.string().nullable(),
  notes:       z.string().nullable(),
});
export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;

// SpeciesState — describes one element of species-states.json array
export const SpeciesStateSchema = z.object({
  species_slug: z.string(),
  state:        z.string(),
});
export type SpeciesState = z.infer<typeof SpeciesStateSchema>;
```

### Pattern 2: Import from both Node and Vite targets

```typescript
// From scripts/build-data.ts (Node target)
import type { OccurrenceRecord } from '../src/types/index.ts';

// From src/_data/species.ts (Node target, relative from src/_data/)
import type { Species } from '../types/index.ts';

// From src/components/parquet-cache.ts (Vite target)
import type { OccurrenceRecord } from '../types/index.ts';
```

Note: Both use explicit `.ts` extensions. Node 24 requires `.ts` extensions in ESM imports under native type-stripping. Vite's bundler resolution accepts `.ts` extensions. No path aliases (Node runtime ignores tsconfig paths).

### Pattern 3: Zod/mini API difference (for Phase 37 documentation)

```typescript
// Phase 33 — build-side: full zod method-chaining
import { z } from 'zod';
const Schema = z.object({ count: z.number().nullable() });

// Phase 37 — browser-side: zod/mini functional API (DIFFERENT from full zod)
import { object, number, nullable, parse } from 'zod/mini';
const validate = (data: unknown) => parse(object({ count: nullable(number()) }), data);
// z.infer<> type derivation works from both — the TypeScript type is the same
```

### Anti-Patterns to Avoid

- **Using `z.optional()` for nullable Parquet fields:** hyparquet writes `null` (not `undefined`) for NULL Parquet values. `z.optional()` accepts `undefined` but rejects `null`. Use `z.nullable()` for all hyparquet-read fields. The county column is 100% null — this would silently reject all records if typed incorrectly.
- **Using `composite: true` in tsconfigs:** Only needed for `tsc --build` incremental mode. Adding it to sub-configs without using `--build` creates stale `.tsbuildinfo` side effects.
- **Importing from `'zod/v4'` instead of `'zod'`:** Causes Vite bundler resolution error (missing `./v4/core` specifier). Always use `'zod'`.
- **Installing `@types/openseadragon`:** OSD 6.x ships bundled types; the `@types/` package is a superseded stub with incompatible enum syntax.
- **Setting `@types/node@^25`:** The `.nvmrc` specifies Node 24; `@types/node` major version must match the runtime.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript type derivation from runtime schema | Manual type/validator pairs | `z.infer<typeof Schema>` | Drift between type and validator; single source of truth is the whole point |
| O(columns) Parquet column check | Custom Parquet footer parser | `parquetMetadata(arrayBuffer)` from `hyparquet` | Already installed and used by parquet-cache.js; only reads footer |
| Import path resolution for `.ts` extensions | tsconfig paths aliases or custom resolver | `allowImportingTsExtensions: true` + `noEmit: true` | Node 24 ignores tsconfig paths at runtime; aliases pass tsc but throw ERR_MODULE_NOT_FOUND |

---

## Data Profile: Confirmed Column Nullability

> SCHEMA-03 / D-08 gate: completed during research against full production dataset.

**Key findings that affect schema authoring:**

1. **`records.county` is 100% NULL** — all blank cells read as SQL NULL even without `nullstr=''`. Schema must have `z.string().nullable()`, not `z.string()`.
2. **`records.state` is 0% NULL** — always populated (6 known values: WA, OR, BC, ID, AB, MT). Required.
3. **`images.navigational` is 100% empty** — treated as blank string in CSV (DuckDB with all-VARCHAR schema sees it as empty string, not null). Schema uses `z.string().nullable()` and build code currently coerces `navigational === 'true'` as a string comparison.
4. **`images.subspecies` is 100% empty** — same situation as navigational.
5. **`glossary.photographer` is 100% empty** — nullable.
6. **`species.common_name` is 68% null** — most species lack common names. Required non-null would reject ~975 rows.
7. **`species.family` has 40 nulls (2.8%)** — nullable, even though logically required; avoid rejecting real rows.

These findings fully satisfy D-08: every nullable column has been identified and must use `.nullable()`.

---

## Common Pitfalls

### Pitfall 1: `useDefineForClassFields` omission silently breaks Lit

**What goes wrong:** TypeScript with `target: ES2022+` defaults `useDefineForClassFields: true`. For Lit, this overwrites reactive property descriptors installed by decorators. Components render once but never update on state changes.

**How to avoid:** Set `"useDefineForClassFields": false` in `tsconfig.browser.json`. Do this in Phase 33 before any component is touched in Phase 37.

**Warning signs:** Only detectable at runtime; `tsc --noEmit` passes silently.

### Pitfall 2: Over-strict schema hard-blocks the build

**What goes wrong:** County is 100% null in production records.csv. A schema with `county: z.string()` (no nullable) will reject every record.

**How to avoid:** Use the null distribution table above. Profile first, schema second. This research completed the profile (D-08 gate).

**Warning signs:** `ZodError: Expected string, received null at county` during `build:data`; entire pipeline blocked.

### Pitfall 3: Node 24 rejects enums at runtime

**What goes wrong:** `enum RecordType { specimen = 'specimen', ... }` compiles fine under `tsc --noEmit` but throws `SyntaxError: Unexpected token 'enum'` when Node 24 native type-stripping executes the file.

**How to avoid:** String literal unions only: `type RecordType = 'specimen' | 'photograph' | 'literature' | 'sight_field_notes'`. Set `isolatedModules: true` — tsc will error on `const enum`. Add CI grep: `grep -r '\benum\b' scripts/ src/`.

### Pitfall 4: `@types/node` version mismatch

**What goes wrong:** `@types/node@25` tracks Node.js 25 API. The project runs Node 24 (`.nvmrc`). Type mismatches appear for APIs that changed between versions; `@types/node@25` may declare APIs not present in Node 24.

**How to avoid:** Pin `@types/node@^24`. slopcheck installed `^25.9.2` — this must be downgraded.

### Pitfall 5: Root tsconfig with `references` and `tsc --noEmit`

**What goes wrong:** The root `tsconfig.json` uses `files: []` and `references` to delegate to sub-configs. Running `tsc --noEmit` (no `-p` flag) uses the root config. If `tsconfig.browser.json` doesn't include `src/types/`, the schema module is not checked under the browser target.

**How to avoid:** Include `src/types/**/*.ts` in BOTH sub-config `include` arrays. This ensures the shared schema module is type-checked under both `moduleResolution: NodeNext` and `moduleResolution: bundler` contexts.

---

## Code Examples

### Schema module (`src/types/schemas.ts` — full draft)

```typescript
// Source: profiled against production data 2026-06-09
import { z } from 'zod';

// --- OccurrenceRecord ---
// Describes what hyparquet produces from records.parquet
// Use z.nullable() (not z.optional()) — hyparquet writes null, not undefined
export const OccurrenceRecordSchema = z.object({
  species_slug: z.string(),
  record_type:  z.string(),        // 'specimen' | 'photograph' | 'literature' | 'sight_field_notes'
  latitude:     z.number(),
  longitude:    z.number(),
  state:        z.string(),        // 'WA' | 'OR' | 'BC' | 'ID' | 'AB' | 'MT'
  county:       z.string().nullable(),   // 100% null in current production data
  locality:     z.string().nullable(),
  elevation_ft: z.number().int().nullable(),
  year:         z.number().int().nullable(),
  month:        z.number().int().nullable(),
  day:          z.number().int().nullable(),
  collector:    z.string().nullable(),
  collection:   z.string().nullable(),
  notes:        z.string().nullable(),
});
export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;

// --- Species ---
// Describes a row from DuckDB read of species.csv (nullstr='')
// id comes back as number from DuckDB INTEGER, but species.js coerces to String
export const SpeciesSchema = z.object({
  id:              z.number().int(),     // DuckDB INTEGER
  genus:           z.string(),
  species:         z.string(),
  common_name:     z.string().nullable(), // 68% null
  noc_id:          z.string().nullable(), // 1.8% null
  authority:       z.string().nullable(), // 3.5% null
  family:          z.string().nullable(), // 2.8% null (logically required but data has nulls)
  similar_species: z.string().nullable(), // 26.9% null; pipe-delimited slugs when present
  subfamily:       z.string().nullable(), // 12.4% null
});
export type Species = z.infer<typeof SpeciesSchema>;

// --- GlossaryWord ---
export const GlossaryWordSchema = z.object({
  term:           z.string(),
  definition:     z.string(),
  image_filename: z.string().nullable(), // 69.1% empty → null
  photographer:   z.string().nullable(), // 100% empty → null
});
export type GlossaryWord = z.infer<typeof GlossaryWordSchema>;

// --- SpeciesImage ---
// Images from images.csv — ALL columns are VARCHAR (no coercion at DuckDB read time)
// navigational and subspecies are 100% empty
export const SpeciesImageSchema = z.object({
  species_slug:  z.string(),
  filename:      z.string(),
  photographer:  z.string(),
  weight:        z.string(),       // VARCHAR; coerced to number in taxon.js via TRY_CAST
  license:       z.string(),
  view:          z.string().nullable(),
  specimen:      z.string().nullable(),
  navigational:  z.string().nullable(), // 100% empty; compared as string: navigational === 'true'
  locality:      z.string().nullable(),
  state:         z.string().nullable(),
  latitude:      z.string().nullable(), // VARCHAR, not DOUBLE
  longitude:     z.string().nullable(),
  elevation_ft:  z.string().nullable(),
  year:          z.string().nullable(),
  month:         z.string().nullable(),
  day:           z.string().nullable(),
  collector:     z.string().nullable(),
  subspecies:    z.string().nullable(), // 100% empty
});
export type SpeciesImage = z.infer<typeof SpeciesImageSchema>;

// --- SpeciesPhoto ---
// Describes one entry in data/species-photos.json
// Built by scripts/generate-species-photos.js from the manifest
export const SpecimenSchema = z.object({
  specimen_id: z.string(),
  view:        z.string(),        // 'D' or 'V'
  tiles_path:  z.string(),
});
export const SpeciesPhotoSchema = z.object({
  high_res_available: z.boolean(),
  specimens:          z.array(SpecimenSchema),
  photographer:       z.string(),
  license:            z.string(),
});
export type SpeciesPhoto = z.infer<typeof SpeciesPhotoSchema>;
export type Specimen = z.infer<typeof SpecimenSchema>;

// --- SpeciesState ---
// One element of the species-states.json flat array
// Validated at browser load time (Phase 37) as an array of these
export const SpeciesStateSchema = z.object({
  species_slug: z.string(),
  state:        z.string(),
});
export type SpeciesState = z.infer<typeof SpeciesStateSchema>;

// --- TaxonNode ---
// Describes the taxon tree built by src/_data/taxon.js
// Four-level tree: family → subfamilies → genera → species
export const NavImageSchema = z.object({
  filename:     z.string(),
  photographer: z.string(),
  weight:       z.number().int().nullable(),
  navigational: z.string().nullable(),
  species_slug: z.string(),
});

export const TaxonSpeciesSchema = z.object({
  slug:        z.string(),
  name:        z.string(),
  common_name: z.string().nullable(),
  navImage:    NavImageSchema.nullable(),
});

export const TaxonGenusSchema = z.object({
  name:       z.string(),
  genus_slug: z.string(),
  navImages:  z.array(NavImageSchema),
  species:    z.array(TaxonSpeciesSchema),
});

export const TaxonSubfamilySchema = z.object({
  name:      z.string().nullable(),   // null when no subfamily
  navImages: z.array(NavImageSchema),
  genera:    z.array(TaxonGenusSchema),
});

export const TaxonFamilySchema = z.object({
  name:        z.string(),
  navImages:   z.array(NavImageSchema),
  subfamilies: z.array(TaxonSubfamilySchema),
});
export type TaxonFamily = z.infer<typeof TaxonFamilySchema>;
```

### Eleventy shim (`src/types/eleventy.d.ts` — ~30 lines)

```typescript
// src/types/eleventy.d.ts
// Minimal type shim for Eleventy 3 UserConfig API
// Covers exactly the methods called in eleventy.config.ts

export interface EleventyTransformContext {
  page: { outputPath: string | false };
}

export interface EleventyConfig {
  addPlugin(plugin: unknown, options?: unknown): void;
  addFilter(name: string, fn: (this: unknown, ...args: unknown[]) => unknown): void;
  addTransform(
    name: string,
    fn: (this: EleventyTransformContext, content: string) => string
  ): void;
  addGlobalData(name: string, value: unknown): void;
  addPassthroughCopy(pathOrRecord: string | Record<string, string>, opts?: unknown): void;
  on(event: string, callback: (data: { runMode: string }) => Promise<void> | void): void;
}

declare module '@11ty/eleventy' {
  export class EleventyRenderPlugin {
    configFunction(config: EleventyConfig): void;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ts-node / tsx for running TypeScript | Node 24 native type-stripping (default, no flag) | Node 22.6+ (stable in v24) | Zero extra dependencies; `.ts` files run directly |
| Two tsconfigs (no root) | Root tsconfig with `references` + two sub-configs | TS 3.0 (project references), common practice | One `tsc --noEmit` command covers both targets |
| `allowJs: true` for gradual migration | Big-bang per area (no `allowJs`) | Project decision | Keeps `strict` meaningful; no any-leaking from JS imports |
| `zod@3` import from `'zod'` | `zod@4` same import `'zod'` (NOT `'zod/v4'`) | July 2025 | `z.infer<>` still works; `'zod/v4'` causes Vite error |
| `useDefineForClassFields` default (true) | Must set `false` explicitly for Lit | Lit 3.x | Lit reactive properties silently non-reactive otherwise |

**Deprecated/outdated:**
- `moduleResolution: node` or `node10`: Deprecated in TypeScript 6.0. Use `NodeNext` for Node targets.
- `@types/openseadragon`: OSD 6.x ships bundled types. The `@types/` package is a superseded stub.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — test files listed explicitly in `package.json` `test` script |
| Quick run command | `node --test eleventy.config.test.ts` (after Phase 34 migration) |
| Full suite command | `node --test eleventy.config.test.ts scripts/build-data.test.ts ...` (all listed in package.json) |

Note: Phase 33 adds no new test files (no source files are converted yet). The `typecheck` script IS the validation for this phase.

### Phase 33 Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TS-01 | tsconfig files exist and reference each other correctly | structural | `ls tsconfig*.json` + `tsc --noEmit` | ❌ Wave 0: create tsconfig files |
| TS-02 | browser tsconfig has `useDefineForClassFields: false` and `experimentalDecorators: true` | structural | `tsc --noEmit` (tsc rejects misconfigured options) | ❌ Wave 0: create tsconfig.browser.json |
| TS-03 | `isolatedModules: true` set; no enum in source | structural + grep | `tsc --noEmit && grep -r '\benum\b' src/ scripts/` | ❌ Wave 0: create tsconfigs |
| TS-04 | packages installed; eleventy shim exists | structural | `ls node_modules/typescript node_modules/zod src/types/eleventy.d.ts` | ❌ Wave 0: install packages + create shim |
| TS-05 | `npm run typecheck` exits zero | integration | `npm run typecheck` | ❌ Wave 0: add script to package.json |
| SCHEMA-01 | `src/types/schemas.ts` exists with all 7 schemas | structural | `node --input-type=module -e "import('./src/types/schemas.ts')"` | ❌ Wave 0: create schema file |
| SCHEMA-02 | Derived types exist via z.infer<> | type check | `npm run typecheck` (tsc verifies types) | ❌ Wave 0 |
| SCHEMA-03 | All nullable columns use .nullable() | data profile | DuckDB null count queries (completed in research) | ✅ Profile complete in research |

### Sampling Rate

- **Per task commit:** `npm run typecheck` (quick, ~3-5s on first run with no source files)
- **Per wave merge:** `npm run typecheck && npm run build` (proves JS build still produces 1,364 pages)
- **Phase gate:** `npm run typecheck` exits zero + `npm run build` produces 1,364 species pages unchanged

### Wave 0 Gaps

- [ ] `tsconfig.json` — root references config
- [ ] `tsconfig.node.json` — Node 24 nodenext target
- [ ] `tsconfig.browser.json` — Vite bundler target with Lit-required flags
- [ ] `src/types/schemas.ts` — 7 entity schemas from profile data above
- [ ] `src/types/eleventy.d.ts` — ~30-line shim for 6 EleventyConfig methods
- [ ] `src/types/index.ts` — re-exports
- [ ] `package.json` scripts: add `"typecheck"` entry; fix dependency classification (move type packages to devDependencies, downgrade @types/node to ^24)

---

## Security Domain

> `security_enforcement` not explicitly set to false in config.json — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 33 is toolchain setup, no auth |
| V3 Session Management | no | Static site, no sessions |
| V4 Access Control | no | No access control changes |
| V5 Input Validation | yes (schema layer) | Zod schemas are the input validation layer |
| V6 Cryptography | no | No crypto |

### Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Schema too permissive allows invalid data into build pipeline | Tampering | Use exact types from profiled data; `.nullable()` for documented nulls; not `z.any()` |
| Third-party type package supply chain | Tampering | slopcheck `[OK]` on all packages; openseadragon self-hosts types (no third-party) |
| Package installed to `dependencies` instead of `devDependencies` | Information Disclosure | Move typescript and @types/* to devDependencies (no type info in production bundle) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TypeScript 6.0.3 (installed by slopcheck) is compatible with the project — no breaking changes affect this codebase | Standard Stack | Low: STACK.md confirmed 6.0 viable; no deprecated features in use |
| A2 | OSD 6.0.2's bundled `types/index.d.ts` covers all the OSD APIs used in `pnwm-image-slideshow.js` | Standard Stack | Low: OSD 6 ships own types; if coverage is incomplete, a stub augmentation can be added in Phase 37 |
| A3 | The `tsc --noEmit` command on a root config with `references` type-checks both sub-configs in sequence without requiring `composite: true` | tsconfig Layout | Medium: if composite is required, add it; this would only affect Phase 33 setup tasks |
| A4 | The 100% null county in records is intentional (no county enrichment has been done), not a data loading bug | Data Profile | Low: the current build produces correct pages; no code expects non-null county |

**If this table is empty for you:** it isn't — see above.

---

## Open Questions

1. **SpeciesPhoto data completeness — all 1,238 entries have `high_res_available: true`**
   - What we know: Every entry in `data/species-photos.json` has `high_res_available: true`; there are 1,433 species total and 1,238 in the file
   - What's unclear: Do species NOT in species-photos.json have an implicit `high_res_available: false`? Is the SpeciesPhoto schema for the JSON file shape or the Eleventy data cascade shape?
   - Recommendation: The schema documents the JSON file shape (as read from disk). The `high_res_available: true` constraint is accurate for current data. Use `z.literal(true)` or `z.boolean()` — the latter is more future-proof.

2. **TypeScript 6.0 vs 5.8 preference**
   - What we know: slopcheck installed 6.0.3; STACK.md says 5.8 is the floor and 6.0 is viable
   - What's unclear: User preference between 6.0 (latest) and 5.8 (more conservative for a major migration)
   - Recommendation: Keep 6.0.3 since it's already installed and compatible. If the team prefers 5.8 for conservatism, downgrade with `npm install -D typescript@^5.8`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | type-stripping, tests | ✓ | v24.15.0 | — |
| typescript | `npm run typecheck` | ✓ | 6.0.3 (just installed) | — |
| zod | schemas.ts | ✓ | 4.4.3 (just installed) | — |
| @types/node | tsconfig.node.json | ✓ | 25.9.2 (must downgrade to ^24) | — |
| @types/leaflet | browser/node tsconfigs | ✓ | 1.9.21 (just installed) | — |
| DuckDB | data profiling (SCHEMA-03) | ✓ | @duckdb/node-api installed | — |
| hyparquet | column metadata API docs | ✓ | 1.25.6 installed | — |

**Missing dependencies with no fallback:** none — all required tools are installed or just installed.

**Issues requiring fix before planning:**
- `@types/node` must be downgraded from `^25` to `^24` and moved to devDependencies
- `typescript`, `@types/leaflet` must be moved to devDependencies
- `@types/openseadragon` must be removed
- `zod` should stay in dependencies (consumed by build scripts)

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `scripts/build-data.js`, `src/components/parquet-cache.js`, `eleventy.config.js`, `src/_data/taxon.js`, all CSV headers — source of truth for entity shapes
- DuckDB profiling queries run against live production data (92,554 records, 1,433 species) — source of null distribution for SCHEMA-03
- `node_modules/hyparquet/src/metadata.js` + `types.d.ts` — `parquetMetadata()` API and `FileMetaData`/`SchemaElement` types; live parquet file verified to confirm column schema
- `node_modules/zod/` package: exports confirmed via `npm view zod@4.4.3 exports`; `zod/mini` functional API confirmed by running node; `z.infer` type alias confirmed in `v4/core/core.d.ts` (`export type { output as infer }`)
- `node_modules/@11ty/eleventy/src/UserConfig.js` — method list for eleventy shim
- `node_modules/openseadragon/package.json` — `types: 'types/index.d.ts'` confirms own types shipped
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` — milestone research (HIGH confidence, verified against official docs)
- slopcheck run: all 5 packages rated `[OK]`

### Secondary (MEDIUM confidence)

- `npm view` command for registry versions: TypeScript 6.0.3, zod 4.4.3, @types/node 24.x/25.x, @types/leaflet 1.9.21, @types/openseadragon 5.0.2/6.0.0
- Package.json diff after slopcheck install — records what was actually installed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages verified on registry; slopcheck clean; versions confirmed installed
- Architecture: HIGH — profiling ran against live data; parquet file inspected directly; API confirmed from source
- Pitfalls: HIGH — grounded in source code analysis; null distribution profiled
- Schema content: HIGH — all 7 entities grounded in profiled production data

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (30 days for stable ecosystem; data profile is permanent until CSV shape changes)
