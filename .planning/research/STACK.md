# Stack Research

**Domain:** JS→TS migration — static site with Node build pipeline + Vite-bundled browser components
**Researched:** 2026-06-09
**Confidence:** HIGH (verified via Node.js v24 API docs, Lit docs, Vite 8 announcement, Eleventy 3 TypeScript docs, Zod versioning page, TypeScript 5.8/6.0 release notes)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | `^5.8` | Type checker + declaration generator | 5.8 is stable floor; 5.9 (Aug 2025) and 6.0 (Apr 2025) also viable — see version note |
| Zod | `^4` | Schema-as-source-of-truth for all data contracts | Stable as `zod@4` since July 2025; build-only use makes bundle size irrelevant; deepest ecosystem for deriving TS types |

**TypeScript version note:** TypeScript 5.9 (released August 2025) and 6.0 (released April 2025) are both stable. TypeScript 6.0 deprecates `target: es5`, `--baseUrl`, `moduleResolution: node/node10`, and makes `strict: true` the default. Starting at 5.8 avoids any 6.0 migration surprises during an already-large JS→TS conversion; upgrading to 6.0 afterward is a one-step bump. The tsconfig baselines below are written to be compatible with both 5.8 and 6.0.

---

## tsconfig Strategy: Two Flat Configs, No Project References

**Use two flat tsconfig files, NOT TypeScript project references.**

The project has two distinct compilation contexts:

- **Node context:** `scripts/`, `src/_data/`, `src/_lib/`, `*.test.ts`, `eleventy.config.ts` — Node 24 ESM, no DOM, module = `NodeNext`
- **Browser context:** `src/components/` — bundled by Vite 8 (Rolldown/Oxc), needs DOM lib, module = `bundler`

Project references are the right tool for monorepos with many interdependent packages and incremental `tsc --build` caching across them. For a ~54-file single-package repo, project references add complexity (composite flags, per-sub-project `.tsbuildinfo`, `tsc --build` vs `tsc --noEmit` semantic differences) that is not justified. `tsc --build --noEmit` also has subtly different semantics from two sequential `tsc --noEmit` calls, complicating the CI gate.

**Layout:**

```
tsconfig.json          ← browser: src/components + eleventy.config.ts
tsconfig.node.json     ← Node: scripts/, src/_data/, src/_lib/, *.test.ts
```

**CI gate runs both:**

```bash
tsc --noEmit && tsc -p tsconfig.node.json --noEmit
```

---

## Exact tsconfig Baselines

### `tsconfig.json` — browser (Vite 8 + Lit 3 components)

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
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/components/**/*.ts",
    "eleventy.config.ts"
  ]
}
```

**`isolatedModules: true`** — Required. Vite 8 uses Oxc transformer, which processes files independently without type information. `isolatedModules` makes tsc warn against constructs Oxc cannot handle (const enum, implicit type-only re-exports).

**`experimentalDecorators: true` + `useDefineForClassFields: false`** — Required for Lit 3. See Lit + Decorators section below.

**`moduleResolution: bundler`** — Vite/Rolldown resolves imports, not Node's resolver. Allows extensionless imports (the current convention in components) and aligns with how Vite actually resolves modules.

**`verbatimModuleSyntax: true`** — Ensures `import type` is used where needed, preventing Oxc from accidentally treating a type import as a value import at runtime.

**`noEmit: true`** — Vite handles its own emit. tsc is type-check only for browser files.

---

### `tsconfig.node.json` — Node 24 (scripts, data files, lib, tests)

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
    "eleventy.config.test.ts"
  ]
}
```

**`module: NodeNext` + `moduleResolution: NodeNext`** — Node 24 ESM requires explicit extensions in import specifiers. `NodeNext` mode enforces that tsc agrees with actual Node resolution behavior.

**`allowImportingTsExtensions: true`** — Node 24 native type stripping requires explicit `.ts` extensions in relative imports (e.g., `import './lib/manifest.ts'`). This option allows tsc to accept those specifiers without error. It requires `noEmit: true` (tsc cannot rewrite extensions when this flag is set).

**No `paths` aliases** — Do not add. Node 24 runtime ignores `tsconfig.json` entirely. `paths` remapping works for tsc type-checking but the aliases are NOT rewritten at runtime — Node throws module-not-found. Use relative imports throughout (already the project convention). Node's `#` subpath imports in `package.json` are the Node-native alternative but not needed at this scale.

---

## Running Tests: Node 24 Native Type Stripping

**Verdict: Native type stripping is sufficient. No tsx, no ts-node, no build step needed.**

Node 24 makes type stripping the default for `.ts` files — no flag required. The existing `node --test` command works once test files are renamed `.ts`.

### What node 24 handles natively (erasable syntax):

- Type annotations, interfaces, type aliases
- `import type` statements
- Generic type parameters
- Non-instantiated namespaces (type-only content)

### What requires `--experimental-transform-types` or is unsupported:

| Feature | Status | Implication for this project |
|---------|--------|------------------------------|
| `enum` | Requires `--experimental-transform-types` | **Do not use enums.** Use `const` objects + `as const` instead. This is the better choice anyway — `as const` is tree-shakeable and enums are not. |
| `namespace` with runtime code | Same — requires transform-types | Not needed; avoid |
| Legacy `experimentalDecorators` | **Not supported by native stripper at all** | Test files must not use Lit decorators directly. The existing test pattern already tests components as DOM elements via `document.createElement`, not as class instances, so this constraint is already met. |
| tsconfig `paths` aliases | Not supported — runtime ignores tsconfig | Use relative imports |
| Importing `.ts` with explicit extension | Supported and **required** | All relative imports in `.ts` files must use `.ts` extension: `import './lib/manifest.ts'` |

**The test command after migration:**

```json
"test": "node --test eleventy.config.test.ts scripts/build-data.test.ts scripts/check-page-weight.test.ts ..."
```

The `--experimental-transform-types` flag is available but should not be needed if enums are avoided. Do not enable it globally — it signals that the codebase relies on non-erasable TypeScript constructs, which creates a harder dependency on a non-standard Node flag.

---

## Eleventy 3 + TypeScript

**`eleventy.config.ts`** — Supported natively in Eleventy 3.1+. Rename `eleventy.config.js` → `eleventy.config.ts`. On Node 24, `npx @11ty/eleventy` invokes it via native type stripping automatically. No `--experimental-strip-types` flag needed (it is the default on Node 24).

**`src/_data/*.ts` files** — Supported. Eleventy 3 uses Node type stripping for data files with `.ts` extensions on Node 22.6+/24. The project's `"type": "module"` in `package.json` is already present. No `eleventyConfig.addExtension()` call is needed for data files — Eleventy recognizes `.ts` for data files natively.

**`src/_lib/*.ts` files** — Plain Node modules imported by `eleventy.config.ts`. Work via native type stripping. `glossary-transform.ts` is imported at module load time — no changes to the import pattern needed beyond the `.ts` extension.

**Template files (`.11ty.ts`)** — Not applicable. This project uses Nunjucks templates, not `.11ty.js` templates. No action needed.

**`eleventy-plugin-vite`** — The plugin only reads the object passed to `addPlugin()`. It does not care whether `eleventy.config` is JS or TS. No changes needed.

**Child process scripts in `eleventy.config.ts`** — The `execFile("node", ["scripts/copy-images.js"])` calls in `eleventy.config.ts` will need updating to `.ts` extensions once scripts are migrated. On Node 24, child processes launched via `execFile("node", [...])` handle `.ts` files natively because default type stripping applies per-process, not inherited from parent `NODE_OPTIONS`. Verify this assumption during migration Phase 1.

---

## Vite 8 + Lit 3 + TypeScript: Decorators

**The exact tsconfig combination Lit 3 requires for this project:**

```json
{
  "experimentalDecorators": true,
  "useDefineForClassFields": false
}
```

Lit 3's own documentation (verified 2025) states: "We recommend that TypeScript developers use experimental decorators for now for optimal compiler output."

**Why not standard TC39 decorators for this migration:** Standard decorators require the `accessor` keyword on every `@property()`, `@state()`, `@query()`, `@queryAll()`, and `@queryAssignedElements()` field. With 15 Lit components, that is dozens of field declarations that must each be touched. The compiler output for standard decorators is "unfortunately large" per Lit docs due to accessor generation and private storage objects. The v3.0 milestone is a maintainability refactor — introducing standard decorators simultaneously would add scope and risk. Migrate to standard decorators in a separate future phase after the JS→TS conversion is complete and green.

**Critical interaction — `useDefineForClassFields: false` is mandatory:**

When `target` is ES2022+, TypeScript defaults `useDefineForClassFields` to `true` (matching the ES2022 class fields spec). For Lit, this MUST be overridden to `false`. Without it, class field declarations overwrite the reactive property descriptors that Lit's `@property()` decorator installs. Components compile and type-check without errors but silently stop being reactive at runtime. This is the most common Lit + TypeScript footgun. It must be set explicitly in `tsconfig.json`.

**Vite 8 specific:** Vite 8 added built-in `emitDecoratorMetadata` support and tsconfig paths support (`resolve.tsconfigPaths: true`). The `experimentalDecorators: true` setting is correctly picked up by Vite 8's Oxc transformer. No additional Vite plugin is needed for decorator transpilation.

---

## Data Contract Validation: Zod 4

**Recommendation: Zod 4 (`zod@^4`)**

### Comparison

| Criterion | Zod 4 | Valibot 1.x | ArkType 2.x |
|-----------|-------|-------------|-------------|
| Bundle size (tree-shaken) | ~12KB full / 1.88KB Zod Mini gzip | ~1.4KB | ~40KB |
| Bundle concern for THIS project | **None — all validation is build-only** | None | None |
| DX / API | Method chaining: `z.object({}).pick()` | Functional pipes: `v.pipe()` | String syntax: `'string'` |
| Type inference | `z.infer<typeof Schema>` | `v.InferOutput<typeof Schema>` | `typeof schema.infer` |
| Ecosystem integrations | 50+ (tRPC, Drizzle, React Hook Form) | ~15 | ~5 |
| Object parse performance vs Zod 3 | 6.5x faster | — | 3-4x faster than Zod 4 |
| TS compiler instantiations vs Zod 3 | ~100x fewer | Excellent | Excellent |
| Stability | Stable `zod@4` since July 2025 | Stable | Stable |

**Why bundle size is irrelevant here:** Every schema in this project is build-time only. Zod is used in `scripts/*.ts`, `src/_data/*.ts`, and `src/_lib/*.ts` — none of which ship to the browser. Vite bundles only `src/components/`. As long as no Zod import is added to a component file, zero Zod code reaches the browser bundle. The `verbatimModuleSyntax` tsconfig flag makes accidental Zod imports in component files obvious at type-check time.

**Why Zod 4 over Valibot:** Valibot offers no meaningful advantage when bundle size is off the table. Zod's method chaining API is simpler for the object schemas with nullable fields this project needs. `z.infer<typeof Schema>` is the idiomatic "schema as source of truth" pattern — more familiar to any future maintainer than `v.InferOutput`. Zod 4's 6.5x faster object parsing matters for build loops over 85k+ occurrence records. Zod has 50+ ecosystem integrations vs Valibot's ~15; if the project ever adds tRPC or Drizzle ORM, schemas reuse automatically.

**Why Zod 4 over ArkType:** ArkType's 40KB bundle matters for browser-shipped code; it has no advantage for build-only use. Its string-based type syntax has a steeper learning curve and a nascent ecosystem.

**Install:**

```bash
npm install zod@^4
```

**Pattern — schema as source of truth:**

```typescript
// src/_lib/schemas.ts
import { z } from "zod";

export const SpeciesRecordSchema = z.object({
  species_slug: z.string(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  state: z.string().nullable(),
  county: z.string().nullable(),
  elevation_ft: z.number().nullable(),
  date: z.string().nullable(),
  collector: z.string().nullable(),
  collection: z.string().nullable(),
  record_type: z.string().nullable(),
});

export type SpeciesRecord = z.infer<typeof SpeciesRecordSchema>;

// In build-data.ts — validate DuckDB row output:
const rows = conn.getRowObjectsJS() as unknown[];
const parsed = rows.map(row => SpeciesRecordSchema.parse(row));
// parsed is SpeciesRecord[] — fully typed, validated at build time
```

Note: `@duckdb/node-api`'s `.getRowObjectsJS()` likely returns `any[]`. Feeding those rows through `SpeciesRecordSchema.parse()` is where Zod adds the most value — it catches schema drift between the DuckDB query and the TypeScript type at build time.

---

## CI Gate: `tsc --noEmit`

**Add to `package.json`:**

```json
"typecheck": "tsc --noEmit && tsc -p tsconfig.node.json --noEmit"
```

**Add to `.github/workflows/pr-check.yml`** — after `npm ci`, before the build steps:

```yaml
- name: Type check
  run: npm run typecheck
```

A type error should block the CI run immediately, not waste 4+ minutes on data generation.

**Performance on ~54 files:** Negligible. TypeScript 5.8 on 54 files with no inter-package boundaries runs in under 5 seconds cold. The existing CI build already takes several minutes. The typecheck step adds 3–8 seconds. No incremental compilation, project references, or `.tsbuildinfo` caching is needed at this scale.

**Do NOT add `tsc --noEmit` to the `build` script.** Type errors should fail fast as a dedicated CI step, not be buried in a long build pipeline. Developers run `npm run typecheck` locally when needed.

---

## Supporting Libraries (Type Declarations)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@types/node` | `^24` | Node built-in declarations | `fs`, `path`, `child_process`, `readline` etc. in scripts + config |
| `@types/leaflet` | latest | Leaflet 1.9 types | Used in `pnwm-occurrence-map.ts` |
| `@types/openseadragon` | latest | OSD 6 types | Verify availability on npm; if absent, write a local `src/types/openseadragon.d.ts` stub |
| `@types/chart.js` — skip | — | Chart.js 4 ships its own declarations | No `@types/` package needed |
| `@types/pagefind` — verify | — | Pagefind 1.5 may ship its own | Check before adding |

**`@duckdb/node-api`** ships its own TypeScript declarations. No `@types/` package needed. The return type of `.getRowObjectsJS()` is likely `any[]` or `Record<string, unknown>[]` — this is where Zod schema parsing adds the most value.

**Install:**

```bash
# Schema validation (build-only — not a devDependency; used in production build scripts)
npm install zod@^4

# Type checker + declarations
npm install -D typescript@^5.8 @types/node@^24 @types/leaflet @types/openseadragon
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `tsx` or `ts-node` | Node 24 native type stripping handles all .ts execution without a loader | Native Node 24 (default) |
| TypeScript project references | Complexity not justified for 54 files in a single package | Two flat tsconfig files |
| `vite-plugin-checker` | Adds type-checking to Vite's dev server loop; redundant with `tsc --noEmit` in CI and slow in watch mode | `npm run typecheck` in CI |
| `enum` declarations anywhere | Not supported by Node 24 native type stripping; requires `--experimental-transform-types` flag | `const` objects with `as const` |
| tsconfig `paths` aliases | Node 24 runtime ignores tsconfig; aliases pass tsc but throw at runtime | Relative imports (already the project convention) |
| Standard TC39 decorators (this milestone) | Requires adding `accessor` keyword to every reactive Lit property in 15 components; large compiler output | `experimentalDecorators: true` — migrate to standard decorators in a separate future phase |
| ArkType | 40KB bundle; performance advantage irrelevant for build-only; nascent ecosystem | Zod 4 |
| Valibot | No advantage when bundle size is irrelevant; less familiar API | Zod 4 |
| `@types/lit` — does not exist | Lit ships its own declarations | No action needed |
| Zod in `src/components/` | Would ship Zod to the browser bundle (12KB+); components don't need runtime validation | Keep Zod in `scripts/` and `src/_data/` only |

---

## Version Compatibility Matrix

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| TypeScript 5.8.x | Vite 8.0.x | Requires `isolatedModules: true` in tsconfig.json for Oxc compatibility |
| TypeScript 5.8.x | Lit 3.3.x | Requires `experimentalDecorators: true` + `useDefineForClassFields: false` |
| TypeScript 5.8.x | Node 24 native type stripping | No decorators in Node-executed .ts files; no enums without transform-types flag |
| Zod 4.x | TypeScript 5.8.x | ~100x fewer TS compiler instantiations vs Zod 3; stable as `zod@4` |
| `@duckdb/node-api` 1.5 | TypeScript 5.8.x | Ships own declarations; `skipLibCheck: true` recommended |
| Eleventy 3.1.5 | Node 24 type stripping | `eleventy.config.ts` and `src/_data/*.ts` work natively; no extra flags |
| Vite 8.0.x | TypeScript 5.8.x + Lit 3.3.x | `experimentalDecorators: true` in tsconfig picked up by Oxc transformer |

---

## Sources

- [Node.js v24 TypeScript API docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html) — type stripping limitations, explicit extension requirement, decorator incompatibility (HIGH confidence)
- [Lit decorators documentation](https://lit.dev/docs/components/decorators/) — exact tsconfig combo for Lit 3, standard vs experimental decorator tradeoffs (HIGH confidence)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) — Rolldown/Oxc, `isolatedModules` requirement, built-in `emitDecoratorMetadata` support (HIGH confidence)
- [Eleventy TypeScript docs](https://www.11ty.dev/docs/languages/typescript/) — Node 22.6+ native stripping, data file support, `eleventy.config.ts` (HIGH confidence)
- [Zod versioning page](https://zod.dev/v4/versioning) — `zod@4` stable since July 8, 2025; current version 4.4.3 (HIGH confidence)
- [TypeScript 6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) — deprecations, `strict: true` default, ES2015 minimum target (HIGH confidence)
- [TypeScript 5.9 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/) — released August 2025 (HIGH confidence)
- WebSearch: Zod 4 vs Valibot vs ArkType bundle size comparison 2026 — multiple sources agree on size figures (MEDIUM confidence for exact numbers; HIGH for recommendation direction)
- WebSearch: Node 24 type stripping enums/decorators limitations — consistent with official docs (HIGH confidence)
- WebSearch: Vite 8 Oxc transformer `isolatedModules` requirement — confirmed by Vite features page (HIGH confidence)

---

*Stack research for: pnwmoths v3.0 TypeScript migration toolchain*
*Researched: 2026-06-09*
