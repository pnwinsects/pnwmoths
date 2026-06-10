# Phase 36: Eleventy Data Files & Config Migration - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the **middle layer** of the pipeline — the Eleventy global data files in `src/_data/` and the root `eleventy.config.js` — to TypeScript with full strict types, replicating the locked Phase 34/35 boundary-guard template. Preserve the `process.env.GITHUB_PAGES`-conditional `pathPrefix` (and test-assert it), repoint the config's now-stale child-process script calls, and produce a byte-identical `_site/`.

**In scope — convert `.js` → `.ts` with full strict types (+ existing tests):**
- `src/_data/glossary.js`
- `src/_data/images.js`
- `src/_data/plates.js`
- `src/_data/species.js`
- `src/_data/speciesPhotos.js`
- `src/_data/taxon.js`
- `eleventy.config.js`
- `eleventy.config.test.js` (the one existing test for this area)

**In scope — fixes/cleanup that fall out of the conversion:**
- Repoint `eleventy.config`'s `execFile("node", ["scripts/copy-images.js"])` and `["scripts/emit-species-states.js"])` calls (lines 91, 92, 103, 104) to the `.ts` files — Phase 35 renamed both and the `.js` files **no longer exist**, so these references are currently broken (D-02).
- Delete `src/_data/taxon.d.ts` — a Phase-35 stopgap declaration that becomes redundant once `taxon.js` → `taxon.ts` provides its own types (D-04).
- Extend the (now `.ts`) config test to assert the `GITHUB_PAGES` pathPrefix conditional is present (SC-2; D-01).
- Update `package.json` `test` glob so the converted `eleventy.config.test.ts` runs under `node --test` (carried D-14).

**Not converted (stay as-is):**
- `src/_data/speciesSlugs.json` — committed JSON data, not source.

**Hard constraints (locked by REQUIREMENTS MIG-03 + ROADMAP SC-1..4):** no `.js` source remains in `src/_data/` or at the config root; all converted tests run via `node --test` under Node 24 native type-stripping; zero `tsc --noEmit` errors; no `@ts-ignore`, no `allowJs`, no unguarded `as unknown as T`; `eleventy.config.ts` still contains the `process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"` conditional and the config test asserts it; `npm run build` (GitHub Pages, `/pnwmoths/`) and `npm run dev` (local, `/`) both work with no double-prefix on Vite-processed asset paths; `_site/` **byte-identical** to the pre-migration baseline.

</domain>

<decisions>
## Implementation Decisions

The user expressed **no preference** on the three gray areas surfaced (config-test robustness, child-process vs inline-import, data-file return typing) — all delegated to Claude's discretion. The choices below favor the lowest byte-identical risk and the smallest, most consistent diff over the locked Phase 34/35 template.

### Config pathPrefix verification (SC-2 / SC-3)

- **D-01:** **Source-presence assertion for the conditional.** Extend the existing source-string-matching test (now `eleventy.config.test.ts`) to read `eleventy.config.ts` and assert the literal `process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"` conditional is present (substring or regex). This satisfies SC-2's wording ("asserts this conditional is present and the test passes") cheaply and in the existing test style, with no module-load side effects. **Runtime pathPrefix correctness (SC-3) is verified by the byte-identical build gate**, which already exercises `GITHUB_PAGES=1` (→ `/pnwmoths/`) vs unset (→ `/`) — not by a heavyweight config-import test. Planner MAY add a lightweight behavioral assertion (import config, check resolved `pathPrefix` under both env states) **only if** the config import proves side-effect-light enough (note: module load runs `readFileSync("data/glossary.csv")` + `buildTermMap`).

### Stale child-process script references (SC-3 build correctness)

- **D-02:** **Repoint the `execFile` paths `.js` → `.ts`; keep the child-`node` spawn pattern.** `eleventy.config` shells out to `scripts/copy-images.js` and `scripts/emit-species-states.js` in both the Vite `writeBundle` hook and the `eleventy.after` serve hook; Phase 35 renamed both to `.ts`, so the current references point at missing files. The minimal, lowest-risk fix is to update the four paths to `.ts` and keep spawning child `node` processes (Node 24 strips types on `node scripts/X.ts`). Do **not** refactor to in-process imports — that would enlarge the diff and touch those scripts' export surfaces, raising byte-identical risk for no required benefit.

### Data-file return typing (D-10 boundary template)

- **D-03:** **Uniform local-interface-plus-guard at the DuckDB boundary.** The `_data` files read `@duckdb/node-api` and return `result.getRowObjectsJS()` (typed `unknown`), then **reshape** rows (e.g. `species.js` stringifies `id`, derives `slug`, splits `similar_slugs`; `glossary.js` groups by first letter into `{ A: [...], F: [...] }`). Because the emitted shape diverges from the raw schema entity, apply the carried **D-10 template uniformly**: a minimal hand-written interface describing the **consumed/emitted** fields + a small runtime guard narrowing the DuckDB output — **not** Zod, **not** an unguarded cast. Planner MAY instead derive a type from the `z.infer<>` entity (`species` → `Species`, `glossary` → `GlossaryWord`) via `Omit`/extension **where the fit is genuinely clean**, but local interfaces are the default and there is no obligation to couple data files to the entity schemas (D-11 reserves Zod runtime use; build-side consumes derived **types** only).

### Claude's Discretion
- Exact local interface names/shapes for each `_data` file's reshaped output (driven by the fields each template actually consumes).
- Whether to add a behavioral pathPrefix assertion on top of the D-01 source check (gated on config-import side-effect weight).
- Test-glob mechanics for adding `eleventy.config.test.ts` (broaden to `*.test.ts` listing or equivalent) — same mechanical pattern as Phases 34/35 (D-14).
- Whether `plates.js`, `images.js`, `speciesPhotos.js` (committed-JSON loaders) warrant a guard or are simple enough for a typed import + minimal annotation — per-file call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning
- `.planning/REQUIREMENTS.md` — **MIG-03** is this phase's requirement (convert `src/_data/` + `eleventy.config`); MIG-04..06 / SCHEMA-08 / CI-* are later phases (37–38)
- `.planning/ROADMAP.md` §"Phase 36" — goal + 4 success criteria (SC-1 all `.js`→`.ts` + tests via `node --test`; SC-2 `GITHUB_PAGES` conditional preserved + test-asserted; SC-3 `build`/`dev` both correct, no double-prefix on Vite assets; SC-4 byte-identical `_site/`)
- `.planning/phases/35-build-pipeline-scripts-migration/35-CONTEXT.md` — D-10 boundary guard, D-11/D-12 Zod-reservation, D-14 test-glob update; the producer-side scripts this phase's config now calls
- `.planning/phases/34-scripts-lib-src-lib-migration/34-CONTEXT.md` — **the template this phase replicates**: minimal-interface-+-guard at external boundaries (D-01..03), `node --test` under Node 24 type-stripping
- `.planning/phases/33-toolchain-schema-scaffolding/33-CONTEXT.md` — trust-by-immutability validation architecture, Zod-4-in-`src/types/`, drift/strictness direction

### Toolchain & schemas (already on disk from Phases 33–35)
- `tsconfig.node.json` — type-checks `eleventy.config.ts` and `src/_data/**/*.ts` + `*.test.ts`; `allowImportingTsExtensions`, `isolatedModules`, `types: ["node"]`. **Confirm both `eleventy.config.ts` and `src/_data/` are within its `include` globs** (a possible planner adjustment).
- `src/types/schemas.ts` / `src/types/index.ts` — Zod schemas + `z.infer<>` types; `Species` and `GlossaryWord` are the entities the `species`/`glossary` data files could derive from (D-03 optional path)
- `src/_lib/glossary-transform.ts` — already converted in Phase 34; `eleventy.config` imports `applyGlossaryTerms` / `buildTermMap` from it (already updated to `.ts` specifier, line 7)

### Code touchpoints (read to ground the conversion)
- `eleventy.config.js` — full config; key spots: line 12 pathPrefix conditional; lines 21–25 `csv-parse/sync` glossary load at module init; lines 78–96 Vite plugin (`base: pathPrefix`) + `writeBundle` execFile calls; lines 101–108 `eleventy.after` serve-mode execFile calls; lines 110–117 returned `dir`/`pathPrefix` config object
- `eleventy.config.test.js` — current source-string-matching test (asserts `CDN_BASE_URL`, ordering); D-01 extends it for the pathPrefix conditional and it becomes `.ts`
- `src/_data/species.js`, `src/_data/glossary.js` — DuckDB `read_csv` → `getRowObjectsJS()` → reshape (the D-03 boundary)
- `src/_data/taxon.js`, `src/_data/plates.js`, `src/_data/images.js`, `src/_data/speciesPhotos.js` — remaining data loaders to convert
- `src/_data/taxon.d.ts` — **delete** on conversion (D-04 stopgap from Plan 35-03)
- `scripts/copy-images.ts`, `scripts/emit-species-states.ts` — the `.ts` targets the config's execFile calls must repoint to (D-02)
- `package.json` — `build`/`build:eleventy`/`dev` (config-driven), `test` glob (add `eleventy.config.test.ts`), `typecheck`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 34/35 boundary-guard + union idiom** (`scripts/lib/manifest.ts`, the D-10 minimal-interface-plus-guard) — the direct template for typing every `_data` file's DuckDB output.
- **`Species` / `GlossaryWord` derived types** (`src/types/`) — available if `species`/`glossary` data files derive their return type (D-03 optional path); not required.
- **`src/_lib/glossary-transform.ts`** — already `.ts`; the config's existing `.ts`-specifier import (line 7) proves `.js`→`.ts` import resolution works at config module-load time.

### Established Patterns
- All `_data` files and `eleventy.config.js` already use ESM (`import`/`export`) — conversion is rename + annotate, no module-system change.
- Build-side/config-side only; nothing here ships to the browser bundle, so full Node types are free (bundle weight irrelevant). Zod runtime is **not** introduced here (D-11).
- Data files are async default-exported functions returning row arrays/maps; Eleventy invokes them at build to populate global data.

### Integration Points
- **⚠️ Eleventy must load `.ts` config + `.ts` `_data` files.** `build:eleventy` is bare `eleventy` (auto-discovery of `eleventy.config.{js,cjs}`). Whether Eleventy v3 discovers/loads `eleventy.config.ts` and `src/_data/*.ts` under Node 24 native type-stripping — or needs `--config`, `NODE_OPTIONS`, or an `addExtension`/`addDataExtension` registration — is **the central technical risk and the researcher's primary question.** The milestone thesis is loader-free native type-stripping (Phase 38 SC-2: "no additional loader"); any mechanism chosen must honor that.
- The config's `writeBundle` (Vite production) and `eleventy.after` (serve) hooks spawn `scripts/copy-images` + `emit-species-states` — both already `.ts` (D-02 repoint).
- `eleventy.config` imports from `src/_lib/glossary-transform.ts` and reads `data/glossary.csv` at module init — these run on every config load (relevant to the D-01 decision about whether to import the config in a test).
- `tsconfig.node.json` `include` globs must cover `eleventy.config.ts` and `src/_data/**/*.ts` for typecheck to see them.

</code_context>

<specifics>
## Specific Ideas

- This phase is **heavily templated** — the user confirmed no preference on all surfaced gray areas, trusting the Phase 34/35 pattern. The decisions above lock the consistent, byte-identical-safe defaults rather than introducing new approaches.
- The pathPrefix conditional is a known sharp edge (project memory: never hardcode `/pnwmoths/`; switch on `process.env.GITHUB_PAGES`) — D-01 ensures the migration preserves and test-locks it; SC-3's no-double-prefix concern is on Vite's `base: pathPrefix`.
- The two pre-existing defects this phase resolves (broken execFile `.js` refs; redundant `taxon.d.ts`) are byproducts of Phase 35's conversion that landed outside Phase 35's boundary — fixing them here is in-scope cleanup, not scope creep.

</specifics>

<deferred>
## Deferred Ideas

- **New test coverage for previously-untested `_data` files** (`plates`, `images`, `speciesPhotos`, `taxon`, `glossary`, `species` have no dedicated unit tests — only `eleventy.config.test.js` exists for this area) — MIG-03 converts existing tests; adding new coverage is not required by this phase. Cheap additions at planner discretion, not mandatory. (Mirrors Phase 34/35 deferral.)

None of the discussion strayed outside the phase domain.

</deferred>

---

*Phase: 36-eleventy-data-files-config-migration*
*Context gathered: 2026-06-09*
