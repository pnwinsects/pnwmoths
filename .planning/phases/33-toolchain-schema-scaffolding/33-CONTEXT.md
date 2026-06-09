# Phase 33: Toolchain & Schema Scaffolding - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Install and configure the TypeScript toolchain, define schemas + derived types for all 7 data entities (`OccurrenceRecord`, `Species`, `GlossaryWord`, `SpeciesImage`, `SpeciesPhoto`, `SpeciesState`, taxon-tree node), and get `npm run typecheck` green — **before any source file is converted** (conversion begins Phase 34). The existing `.js` build must keep producing 1,364 species pages unchanged.

</domain>

<decisions>
## Implementation Decisions

### Validation architecture — trust by immutability (the governing principle)

Trust derives from immutability. Data generated inside the build (or pinned to a content hash) cannot disagree with the code that uses it → **static TypeScript types only, zero runtime cost**. Data fetched dynamically from a mutable CDN URL crosses a real trust boundary (cache staleness / version skew) → **runtime validation**.

- **D-01:** **Static TS (no runtime validation)** for everything build-locked: CSV→DuckDB→Eleventy→HTML, plus build-baked data (taxon tree as inline `<script>`, `species-photos.json` as an Eleventy `_data` file). If `tsc` passes and the DuckDB read succeeded, the shape is known.
- **D-02:** **Runtime validation** only at the genuine dynamic boundary — the browser fetching from the CDN. The dynamic surface is **just two artifacts**: per-species `records.parquet` and `species-states.json`. Everything else is build-locked.
- **D-03:** **Validate schema/structure, not rows.** Runtime cost must NOT scale with dataset size. Parquet carries its column schema in file metadata (hyparquet exposes it) — validate declared column names + types → **O(columns), not O(rows)**. Because every value in a Parquet column shares one type, the metadata check effectively guarantees all rows. For `species-states.json`, validate top-level structure + element shape, not every entry. Any genuine per-row validation, if ever wanted, stays DEV-gated and tree-shaken from production.

### Validation library — Zod 4

- **D-04:** Use **Zod 4** as the schema source of truth. Define one schema per entity in `src/types/`; derive TS types via `z.infer<>` (single source of truth, no type/validator drift — the explicit ask in Issue #36).
- **D-05:** **Build-side imports full `zod`** (bundle irrelevant there). **Browser-side imports `zod/mini`** (or a hand-rolled guard for the trivial flat-columnar case) to keep the client bundle small. Only schemas actually `.parse()`d inside browser components cost bundle weight — and only the two dynamic entities (`OccurrenceRecord`, `SpeciesState`) are parsed at runtime. **Measure the gzipped delta when components migrate (Phase 37)** and confirm tree-shaking (grep prod bundle for `ZodError`/`ZodType`).
- **D-06:** All 7 entities are defined as Zod schemas for consistency/single-source-of-truth, but the build side consumes only the *derived types* (free); the *validators* are invoked only at the two dynamic load points.

### Drift / strictness policy

- **D-07:** Direction: lenient where we control the data, strict where it can drift. CSV-input drift (a maintainer adding a column) is caught at build by DuckDB's typed `read_csv` (already fails on bad coercion) + integrity SQL — not Zod's job. The runtime schema checks validate the columns the code actually uses; extra columns in a Parquet/JSON file should not break a running page. (Final per-boundary strictness is planner discretion — see Discretion.)

### Data profiling (SCHEMA-03) — unchanged, still mandatory

- **D-08:** Before finalizing schemas, profile per-column nullability against the **full production dataset** (85,933 records, 1,348 species). Every nullable column uses `.nullable()`; no schema may reject any real production row. This gates schema authoring (prevents the over-strict-schema build hard-block, Pitfall 2). `records.csv` is read **without** `nullstr=''` today (only `species.csv` has it) — account for DuckDB's default null handling on records.

### Claude's Discretion
- **Schema module layout** — single `src/types/schemas.ts` vs per-entity files. (Research leans single file; planner decides.)
- **Per-boundary strictness** — exact `.strict()` / strip / passthrough per schema (D-07 gives the direction).
- **tsconfig specifics** — the 3-config layout (node `nodenext` / browser `bundler` / root) and the `allowImportingTsExtensions` vs `rewriteRelativeImportExtensions` choice (verify in this phase; `noEmit:true` ⇒ `allowImportingTsExtensions`). `useDefineForClassFields:false` + `experimentalDecorators:true` (browser) and `isolatedModules:true` (both) are locked.
- **Whether the data-profile produces a committed report** vs transient (a committed null-distribution note is encouraged for non-technical maintainers, but not required).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning
- `.planning/REQUIREMENTS.md` — TS-01..05, SCHEMA-01/02/03 are this phase's requirements; SCHEMA-04/05/06 (Phase 35) are re-scoped by this discussion (see Deferred / consequences)
- `.planning/ROADMAP.md` §"Phase 33" — goal + 5 success criteria
- `.planning/research/SUMMARY.md` — toolchain decisions, area ordering, cross-doc disagreements
- `.planning/research/STACK.md` — TS 5.8+, two/three tsconfigs, Node 24 type-stripping, Zod 4
- `.planning/research/ARCHITECTURE.md` — shared `src/types/` module, import resolution across targets, hyparquet nullable→null asymmetry
- `.planning/research/PITFALLS.md` — Pitfall 1 (`useDefineForClassFields`), Pitfall 2 (over-strict schema), Pitfall 3 (no enums)

### Project constraints
- `.planning/PROJECT.md` §"Key Decisions" — light-DOM Lit, Snappy Parquet, GITHUB_PAGES-conditional pathPrefix, `String(row.id)` coercion
- Memory: pathPrefix must stay conditional on `process.env.GITHUB_PAGES` (never hardcode `/pnwmoths/`)

### Code touchpoints (read to ground schemas)
- `scripts/build-data.js` §99–134 — DuckDB `read_csv` column types (the source of truth for entity shapes); `records.csv` lacks `nullstr=''`
- `src/components/parquet-cache.js:16` — the dynamic Parquet fetch URL (`${BASE_URL}species/{slug}/records.parquet`); whole-file fetch (no range requests)
- `scripts/copy-parquet.js` — Parquet served at stable `_site/species/{slug}/` paths, un-hashed
- `data/{species,records,images,glossary}.csv` headers — concrete columns per entity

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DuckDB typed `read_csv`** (`build-data.js`): already enforces column types at build → the de-facto CSV input gate; TS types describe the post-read shape. Reuse rather than re-validate with Zod.
- **Existing integrity-check SQL** in the build pipeline (orphans, null-required, enum-ish values): the build-time "data is sane" gate; keep/extend in SQL, not JS.
- **`parquet-cache.js` `loadParquet()`**: the single chokepoint where `records.parquet` enters the browser — the natural home for the O(columns) runtime schema check.

### Established Patterns
- Per-species Parquet at **stable un-hashed URLs**, co-deployed with HTML/JS via GitHub Pages (Fastly). Version skew is bounded to CDN cache staleness → runtime check is belt-and-suspenders, keep it cheap.
- Dynamic browser-fetched surface is exactly two files (`records.parquet`, `species-states.json`); everything else is build-baked.
- `import.meta.env.BASE_URL` used for URL construction (needs `vite/client` types in browser tsconfig).

### Integration Points
- New `src/types/` schema module must be importable by both Node (build) and Vite (browser) targets via relative `.ts` imports.
- Browser validators invoked at: `loadParquet()` (Parquet metadata) and the `species-states.json` fetch site (taxon browser).

</code_context>

<specifics>
## Specific Ideas

- User's framing verbatim: "use TS for anything used at build time or locked to a hash — no chance of being wrong — and Zod or something hand-rolled for anything loaded dynamically from S3. I like Zod as long as it doesn't add too much to the [browser] bundle, and its runtime doesn't scale with the size of the dataset, which can be large."
- This deliberately **moves the primary Parquet guard from build-time to load-time** (vs Issue #36's literal "verify the parquet at build time"). Confirmed intentional. A cheap one-sample metadata check may remain at build to catch write-path bugs before deploy.

</specifics>

<deferred>
## Deferred Ideas

- **Content-hash / fingerprint the per-species Parquet URLs** — would make the dynamic data immutable-by-URL, collapsing version-skew risk and downgrading the runtime check to pure belt-and-suspenders. This is a caching/deploy-architecture change, **not TS-migration work** — out of scope for v3.0. Revisit as its own concern if cache staleness ever bites.
- **Reviewed Todos (not folded):**
  - "Fix close button on the lightbox" — UI/component bug, not toolchain; would land around Phase 37 at earliest. Weak keyword match only.
  - "Migrate Pagefind to Component UI" — UI feature work, unrelated to TS scaffolding. Weak keyword match only.

</deferred>

---

*Phase: 33-toolchain-schema-scaffolding*
*Context gathered: 2026-06-09*
