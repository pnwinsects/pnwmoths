# Requirements: PNW Moths — v3.0 TypeScript Frontend & Build-Time Data Validation

**Defined:** 2026-06-09
**Core Value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Milestone Goal:** Convert the entire codebase from JavaScript to strict TypeScript and enforce build-time validation of every data contract crossing the build→client boundary, so the project is safer to maintain and refactor. (Issue #36 — no user-facing behavior change.)

## v1 Requirements

Committed scope for milestone v3.0. Each maps to a roadmap phase.

### TS — TypeScript Toolchain & Configuration

- [ ] **TS-01**: Separate strict tsconfigs exist for the Node target (`module: nodenext`) and the browser/Vite target (`moduleResolution: bundler`), plus a root config that type-checks both via a single command
- [ ] **TS-02**: Browser tsconfig sets `useDefineForClassFields: false` and `experimentalDecorators: true` so Lit reactive properties keep working
- [ ] **TS-03**: Both tsconfigs set `isolatedModules: true` and erasable-syntax constraints so every `.ts` file runs under Node 24 native type-stripping (no `enum`, `namespace`, or parameter properties anywhere)
- [ ] **TS-04**: `typescript` and `zod` are installed, along with required type packages (`@types/node`, `@types/leaflet`) and a local Eleventy type-shim declaration
- [ ] **TS-05**: `npm run typecheck` runs `tsc --noEmit` across both tsconfigs and reports zero errors

### SCHEMA — Data Contracts & Build-Time Validation

- [ ] **SCHEMA-01**: A shared `src/types/` schema module defines one schema per data entity (occurrence record, species, glossary word, species image, species photo, species-state, taxon node), importable by both Node build scripts and browser components
- [ ] **SCHEMA-02**: TypeScript row/record types are derived from the schemas (single source of truth) rather than maintained separately
- [ ] **SCHEMA-03**: Schemas are profiled against the full production dataset (per-column nullability) before finalization so they accept all real data without false rejections
- [ ] **SCHEMA-04**: The build fails with a clear error when generated per-species Parquet does not conform to its schema (build-time round-trip verification)
- [ ] **SCHEMA-05**: The build fails when emitted JSON data files (`species-photos.json`, taxon tree, `species-states.json`) do not conform to their schemas
- [ ] **SCHEMA-06**: Source CSV inputs are validated against schemas at build time, failing fast on malformed input data
- [ ] **SCHEMA-07**: `npm run verify:parquet` validates every species' Parquet against the schema across the full dataset, runnable on demand without slowing the default build

### MIG — JavaScript → TypeScript Migration

- [ ] **MIG-01**: `scripts/lib/` and `src/_lib/` are fully converted to TypeScript
- [ ] **MIG-02**: All build/data pipeline scripts in `scripts/` are fully converted to TypeScript
- [ ] **MIG-03**: Eleventy data files (`src/_data/`) and `eleventy.config` are converted to TypeScript, preserving the `process.env.GITHUB_PAGES`-conditional `pathPrefix`
- [ ] **MIG-04**: All Lit web components in `src/components/` are converted to TypeScript, with the `pnwm-filter-change` event typed via a shared detail interface
- [ ] **MIG-05**: All test files are converted to TypeScript and still run via `node --test`, with the full suite (~191 tests) passing
- [ ] **MIG-06**: No `allowJs`, no `@ts-ignore`, and no unguarded double-casts remain; no `.js` source files remain in any converted area

### CI — Enforcement & Regression Safety

- [ ] **CI-01**: `tsc --noEmit` runs as a gate in the GitHub Actions PR-check and deploy workflows; type errors fail CI
- [ ] **CI-02**: Each migration area is verified to produce byte-identical `_site/` output versus the pre-migration baseline (mechanical proof of no behavior change)
- [ ] **CI-03**: `npm run build:data` stays within budget after validation is added (<60s locally), keeping the under-5-minute CI build target intact (addresses MAINT-03)

## Future Requirements

Deferred to a future milestone. Acknowledged, not in this roadmap.

### TS-FUTURE — Post-migration TypeScript improvements

- **TSF-01**: Adopt Lit `@property`/`@state` standard TC39 decorators (requires `accessor` keyword across components)
- **TSF-02**: Upgrade to TypeScript 6.0 once the migration has settled
- **TSF-03**: Evaluate replacing `node --test` with Vitest if the test ergonomics warrant it

## Out of Scope

Explicitly excluded to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Any change to runtime logic or behavior during conversion | Type changes and behavior changes must stay separate; output must remain byte-identical |
| Converting Nunjucks templates, CSV, or JSON data formats | Migration targets JS source only; data formats and templates are unchanged |
| Changing the DuckDB column schema (e.g. `images.csv` VARCHAR columns) | Would alter data format/behavior; coerce in schema transforms instead |
| tsconfig path aliases | Node ignores them at runtime under type-stripping; relative `.ts` imports only |
| New user-facing features | This is a maintainability milestone (Issue #36); no UI/feature change |
| Photographic plates, advanced filtering, Django redirects | Pre-existing feature deferrals (PLAT/FILT/SEO) — belong to a future feature milestone, not the v3.0 TS rewrite |

## Traceability

Populated during roadmap creation. Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TS-01 | TBD | Pending |
| TS-02 | TBD | Pending |
| TS-03 | TBD | Pending |
| TS-04 | TBD | Pending |
| TS-05 | TBD | Pending |
| SCHEMA-01 | TBD | Pending |
| SCHEMA-02 | TBD | Pending |
| SCHEMA-03 | TBD | Pending |
| SCHEMA-04 | TBD | Pending |
| SCHEMA-05 | TBD | Pending |
| SCHEMA-06 | TBD | Pending |
| SCHEMA-07 | TBD | Pending |
| MIG-01 | TBD | Pending |
| MIG-02 | TBD | Pending |
| MIG-03 | TBD | Pending |
| MIG-04 | TBD | Pending |
| MIG-05 | TBD | Pending |
| MIG-06 | TBD | Pending |
| CI-01 | TBD | Pending |
| CI-02 | TBD | Pending |
| CI-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 21 ⚠️ (resolved by roadmapper)

---
*Requirements defined: 2026-06-09*
*Last updated: 2026-06-09 after initial v3.0 definition*
