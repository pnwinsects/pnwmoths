# Project Research Summary

**Project:** pnwmoths v3.0 — JS→strict-TypeScript migration + build-time data-contract validation
**Domain:** Big-bang-per-area JS→TS migration of a shipped Eleventy+Vite+Lit+DuckDB static site
**Researched:** 2026-06-09
**Confidence:** HIGH

## Executive Summary

The v3.0 milestone converts the pnwmoths codebase from plain JavaScript to strict TypeScript across six distinct areas — shared schema layer, scripts/lib + src/_lib, build pipeline scripts, Eleventy data files and config, and Lit browser components — in that order, driven by the producer→consumer dependency between the data pipeline and browser components. The central architectural decision is a shared `src/types/` module containing Zod 4 schemas from which TypeScript types are derived via `z.infer<>`. This module is imported by both Node 24–executed build scripts (`module: NodeNext`) and Vite-bundled browser components (`module: bundler`), enforcing a single source of truth for every data contract that crosses the build→browser boundary (Parquet, JSON).

The recommended toolchain requires no transpiler beyond what already exists: Node 24 native type-stripping runs tests and build scripts directly from `.ts`; Vite 8 handles browser bundling via its Oxc transformer; `tsc --noEmit` runs as a dedicated CI gate over separate flat tsconfigs (not project references). Critical constraints: `useDefineForClassFields: false` in the browser tsconfig (required for Lit reactivity), `isolatedModules: true` in both, explicit `.ts` extensions in Node imports, and no `enum` anywhere. Zod is build-side only in the default path; client-side validation is DEV-gated and tree-shaken from production.

Primary risks: over-strict schemas rejecting real production data (85,933 records have intentional NULLs), logic changes smuggled into type-only commits, and `useDefineForClassFields` silently breaking Lit reactivity. All three mitigated mechanically: profile null distributions before writing any schema; enforce byte-identical `_site/` output after each area via `diff -r`; set the tsconfig flag before touching any component.

## Key Findings

### Recommended Stack

Already running: Node 24, Eleventy 3.1, Vite 8, Lit 3.3. v3.0 additions are minimal: `typescript@^5.8`, `zod@^4`, `@types/node@^24`, `@types/leaflet`, a local Eleventy type shim, tsconfig files. No tsx, ts-node, or Vitest.

- **TypeScript 5.8+** — `tsc --noEmit` gate + `z.infer` inference; stable floor, TS 6.0-compatible
- **Zod 4** (`zod@^4`, import from `'zod'` not `'zod/v4'`) — schema source of truth; build-side only by default
- **Node 24 native type-stripping** — runs `.ts` tests/scripts with no loader
- **Separate flat tsconfigs** (node `nodenext` + browser `bundler`) — not project references; a root config lets one `typecheck` command run both
- **`npm run typecheck`** = `tsc --noEmit` over both configs — CI gate, NOT in `npm run build`
- **Local Eleventy shim** (~30 lines) + `@types/leaflet` — the only typing gaps; all other libs ship their own types

**What NOT to add:** tsconfig path aliases, `enum`, tsx/ts-node, project references, Vitest, TC39 decorators (this milestone), Zod in production client paths.

### Expected Features

**Table stakes:** all six areas converted (no `allowJs`); `strict: true`; `tsc --noEmit` clean; all ~191 tests pass via `node --test`; `_site/` byte-identical per area; Zod schemas for all entities with derived types; build-time Parquet round-trip check (hard fail); CI typecheck gate; `GITHUB_PAGES` conditional preserved; `useDefineForClassFields: false` before any Lit file; no `@ts-ignore` / double casts.

**Differentiators:** CSV-input Zod gate in `build-data.ts`; JSON-emit gate; `getRowObjectsJS()` parse in `src/_data/*`; DEV-gated client Parquet validation; `npm run verify:parquet` (full-dataset round-trip, periodic not per-build); `FilterChangeDetail` + `HTMLElementEventMap` merge.

**Defer:** Lit decorator adoption; `filterRecords` null-coercion fixes; TS 6.0 upgrade; Vitest.

**Anti-features:** logic changes in type commits; `allowJs`; `enum`; converting Nunjucks/CSV/JSON data files.

### Architecture Approach

Two compilation environments + a shared pure-schema bridge (`src/types/`, no Node/DOM APIs). Cross-boundary imports use relative `.ts` paths. Six validation gates from CSV ingestion → browser render; Gates 1–4 hard-fail the build, Gates 5–6 DEV-only warnings tree-shaken from production.

- `src/types/schemas.ts` (new) — Zod schemas for `OccurrenceRecord`, `Species`, `GlossaryWord`, `SpeciesImage`, `SpeciesPhoto`, `SpeciesState`, taxon node
- `tsconfig.node.json` — `nodenext`, `isolatedModules`, `erasableSyntaxOnly`
- `tsconfig.browser.json` — `bundler`, `isolatedModules`, `useDefineForClassFields: false`, `experimentalDecorators: true`
- `src/types/` is in BOTH `include` arrays → schema code type-checked under both models

**Type asymmetry:** CSV schemas are build-side only (all `string` from csv-parse). Parquet schemas are shared and use `z.nullable()` (not `z.optional()`) for optional columns — hyparquet emits `null`, not `undefined`. No BIGINT columns in this data.

### Critical Pitfalls (top 5)

1. **`useDefineForClassFields` breaks Lit reactivity** — set `false` in browser tsconfig before Phase 5; verify a state change re-renders in browser.
2. **Over-strict schema hard-blocks the build** — profile null distribution per column (`COUNT(*) FILTER (WHERE col IS NULL)`) before writing any schema; default optional columns to `.nullable()`.
3. **Logic smuggled into type-only commits** — enforce `diff -r _site_before/ _site_after/` in CI after every area.
4. **Node 24 rejects enums/namespaces/param-properties** — string-literal unions + `as const`; `isolatedModules`; CI grep for `\benum\b`.
5. **Zod in 85,933-record hot path risks 5-min build** — validate at CSV input boundary; export records Parquet→Parquet without per-row JS materialization; round-trip check reads one species, not all.

## Implications for Roadmap

Suggested **6 phases** (continuing numbering from Phase 32 → Phases 33–38):

1. **Toolchain & Schema Scaffolding** — tsconfigs (node + browser + root), `src/types/schemas.ts` for all entities, `zod`/`typescript`/`@types` installed, `npm run typecheck` script, `useDefineForClassFields: false`, `isolatedModules: true`. **Mandatory null-distribution profile spike before writing schemas.** CI gate deferred to last phase. Zero runtime impact.
2. **scripts/lib & src/_lib** — smallest areas; proves `node --test` native type-stripping; unblocks the pipeline. Topological order (no interim `.d.ts` stubs).
3. **Build Pipeline Scripts (scripts/)** — producer side, must precede components; establishes DuckDB/Zod patterns; Gates 1–3 wired; benchmark `time npm run build:data` (<60s).
4. **Eleventy Data Files & Config** — middle layer; `eleventy.config.ts` preserves `GITHUB_PAGES` conditional; Gate 4 (`getRowObjectsJS` parse); VARCHAR→typed coercion in `taxon.ts`; local Eleventy shim.
5. **Browser Components (src/components/)** — leaf consumer; `parquet-cache.ts` typed with DEV-gated Gate 5; `FilterChangeDetail` + event-map merge; `vite-env.d.ts`; Vite bundle verified non-empty and Zod-free in prod; `_site/` byte-identical.
6. **CI Gate & Full Verification** — `tsc --noEmit` into `pr-check.yml`/`deploy.yml` after all areas pass; `npm run verify:parquet` (full-dataset, periodic).

**Ordering rationale:** schema first (everything needs the types); low-risk libs before pipeline (dependency before dependent); producer before consumer; Eleventy config validates the full build chain; CI gate last so it doesn't block the migration PRs themselves.

### Cross-Doc Disagreements to Resolve in Planning

1. **tsconfig file count** — STACK.md: 2 files; ARCHITECTURE.md: 3 (root + node + browser). Use **3** (root enables one `typecheck` command).
2. **`tsc --noEmit` in `npm run build`** — keep **out** of the build hot path; CI gate suffices.
3. **Client-side validation** — minimal type guard vs DEV-gated Zod. Prefer **DEV-gated Zod** (no duplicate schema logic), but verify production tree-shaking before committing.
4. **`allowImportingTsExtensions` vs `rewriteRelativeImportExtensions`** — with `noEmit: true`, **`allowImportingTsExtensions`** is correct. Verify in Phase 1 spike.

### Research Flags

- **Phase 1:** null-distribution profile (mandatory); tsconfig extension-flag disambiguation; `execFile("node", ["...ts"])` child-process type-stripping behavior.
- **Phase 3:** `time npm run build:data` benchmark after Gate 1.
- **Phase 5:** grep production bundle for `ZodError`/`ZodType` to confirm tree-shaking.
- Standard patterns (no extra research): Phases 2, 4, 6.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified vs official docs; Node 24 / Vite 8 / Lit 3.3 / Zod 4 current & stable |
| Features | HIGH | Codebase directly inspected; node_modules type defs read |
| Architecture | HIGH | Integration points verified vs source; hyparquet nullable behavior confirmed from source |
| Pitfalls | HIGH | Grounded in source code read; pathPrefix pitfall confirmed by project memory |

**Overall: HIGH.** Gaps to close in Phase 1: null-distribution profile; tsconfig extension-flag choice; Zod production tree-shaking; child-process `.ts` handling.

## Sources

- [Node.js v24 TypeScript docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html); [Lit decorators](https://lit.dev/docs/components/decorators/); [Vite 8](https://vite.dev/blog/announcing-vite8); [Eleventy TypeScript](https://www.11ty.dev/docs/languages/typescript/); [Zod v4](https://zod.dev/) + [versioning](https://zod.dev/v4/versioning); [Zod+Vite import issue #4907](https://github.com/colinhacks/zod/issues/4907)
- Codebase + node_modules inspection (`@duckdb/node-api`, `hyparquet`, `lit`, `chart.js`, `csv-parse`, `node-html-parser`); `.planning/PROJECT.md` key decisions

---
*Research completed: 2026-06-09 · Ready for roadmap: yes*
