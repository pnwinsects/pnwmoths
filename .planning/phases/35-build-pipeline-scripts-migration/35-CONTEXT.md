# Phase 35: Build Pipeline Scripts Migration - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the **producer side** of the data pipeline — the active build/data scripts in `scripts/` — to TypeScript with full strict types, while **deleting the spent one-off/migration scripts** rather than converting them. Wire CSV input correctness to DuckDB's typed `read_csv` (no per-row Zod in the hot path), add a cheap build-time Parquet column-schema sanity check, and ship a standalone `verify:parquet` thorough offline check.

**In scope — convert `.js` → `.ts` with full strict types (+ existing tests):**
- `scripts/build-data.js` (+ `build-data.test.js`)
- `scripts/copy-parquet.js`
- `scripts/copy-images.js`
- `scripts/emit-species-states.js`
- `scripts/check-page-weight.js` (+ `check-page-weight.test.js`)
- `scripts/ingest-photos.js` (+ `ingest-photos.test.js`)
- `scripts/tile-photos.js` (+ `tile-photos.test.js`)
- `scripts/upload-tiles.js` (+ `upload-tiles.test.js`)
- `scripts/generate-species-photos.js` (+ `generate-species-photos.test.js`)

**In scope — delete (spent one-offs; see D-01):**
- `scripts/migrate-species.js` (+ `migrate-species.test.js`), `scripts/migrate-images.js`, `scripts/migrate-species-accounts.js`, `scripts/cdn-copy-reclassified.js`, `scripts/cdn-fix-bad-slugs.js`, `scripts/upload-plates.js`, `scripts/add-image-metadata.js`, `scripts/test-redirect.js`
- Remove the `migrate:images` and `migrate:species` entries from `package.json` scripts.

**Already done (not this phase):** `scripts/lib/*.ts` and `scripts/profile-data.ts` (Phases 33/34).

**Hard constraints (locked by REQUIREMENTS + ROADMAP success criteria):** no `.js` source remains in `scripts/`; all converted tests run via `node --test` under Node 24 type-stripping; zero `tsc --noEmit` errors; no `@ts-ignore`, no `allowJs`, no unguarded `as unknown as T`; `time npm run build:data` completes in **under 60s** locally; `_site/` output **byte-identical** to the pre-migration baseline (build-side only — no client-bundle change).

</domain>

<decisions>
## Implementation Decisions

### One-off / migration script disposition

- **D-01:** **Delete the spent one-off scripts, convert only the active pipeline.** All eight one-offs listed in the domain have already done their job (output CSVs / `src/content/species/*.md` / CDN state / Zoomify tiles are committed or already mutated; the legacy MySQL/Django dumps that fed the `migrate-*` scripts are not part of the working pipeline). Git history preserves them. Deleting a dead `.js` satisfies the milestone end-state ("no `.js` source remains") just as conversion would, with far less churn than typing code that will never run again. Also remove the now-dangling `migrate:images` / `migrate:species` npm scripts and `migrate-species.test.js`.
- **D-02:** **Planner must check docs/README for references to the deleted scripts** and update them. Per the project's "keep docs current before pushing" rule. Pipeline/operator docs may mention `migrate:*`, `upload-plates`, `add-image-metadata`, etc.; those references must go when the scripts go.

### `verify:parquet` standalone script (SCHEMA-07 — brand new)

- **D-03:** New `verify:parquet` npm script + a `scripts/verify-parquet.ts` (exact filename planner's call). Reads **every** species' Parquet with **hyparquet** and validates **all rows** against `OccurrenceRecordSchema` (full per-row Zod — runtime cost scaling with dataset size is acceptable and intended here; this is the explicit thorough offline check). Runs independently of `npm run build`.
- **D-04:** **Failure mode = scan-all-then-summarize.** Do NOT fail fast. Validate the entire dataset, collect every failure, then print a summary (which species, which rows/fields failed, totals) and exit non-zero. The maintainer sees every problem in one run.
- **D-05:** **Output = quiet, single final summary line.** No per-file/per-species progress noise on a clean run — just a final summary (counts + OK/FAIL), e.g. `OK: N species, M rows validated`. Clean for CI-style capture.

### Build-time Parquet sanity check (SCHEMA-04)

- **D-06:** After Parquet generation, `build-data.ts` reads back **one** species' Parquet and validates its **column schema** (a cheap O(columns) write-path sanity check, NOT a per-row pass). A schema mismatch **fails the build**.
- **D-07:** **Sample the first species in a deterministic ordering** (e.g. alphabetical slug, or first written). Reproducible, no hard-coded slug to rot, always exists. Any sample suffices since all species share one column schema.
- **D-08:** **Use DuckDB** (build-data's already-open connection) to read the Parquet schema for this check — zero new dependency in the hot path. Production's hyparquet read path is covered separately by `verify:parquet` (D-03, hyparquet) and Phase 37's load-time hyparquet column guard (SCHEMA-08), so validating via DuckDB here is fine.

### `view` / `match_bucket` string-literal unions (deferred from Phase 34)

- **D-09:** **Lift both to string-literal unions** and use them everywhere they flow (`manifest.ts`, `ingest-photos.ts`, `tile-photos.ts`, `generate-species-photos.ts`). `view = 'D' | 'V'`. `match_bucket` = the literal union whose **complete value set the planner MUST derive from `scripts/lib/parse-photo-filename.ts`** (the source of truth) — do not invent values (same rule Phase 34 applied to `status`; **no `enum`** per TS-03). Consistent with the milestone's type-safe direction.

### Inherited & locked (do NOT re-decide — from Phases 33/34)

- **D-10:** External untyped boundaries (Dropbox HTTP API JSON, `csv-parse` output) → **minimal hand-written interface covering only consumed fields + a small runtime guard**, NOT Zod, NOT an unguarded cast (34 D-01/02/03). This is the template to replicate across all converted scripts.
- **D-11:** **Zod is reserved** for the 7 data entities and the 2 runtime CDN boundaries only. The build side consumes the **derived `z.infer<>` types** (free), never invokes the validators — except `verify:parquet` (D-03), which is the explicit offline thorough check, and the per-row schema there is intentional.
- **D-12:** **CSV correctness is enforced by DuckDB's typed `read_csv` + the existing integrity SQL** (SCHEMA-06) — no separate per-row Zod parsing of CSVs in the hot path. TS types describe the post-read shape (consume the Phase 33 derived types where a script handles one of the 7 entities). Note `records.csv` is read **without** `nullstr=''`; `species.csv` has it (33 D-08).
- **D-13:** **Build-locked JSON** (taxon tree inline `<script>`, `species-photos.json`) is covered by static TS types at authoring (SCHEMA-05); `species-states.json` is validated at **load time in Phase 37**, not here.
- **D-14:** **Test runner / glob** follows the Phase 34 pattern — the `npm test` script currently hard-lists `scripts/*.test.js` files; after conversion these become `.ts` and the invocation must be updated (broaden to `*.test.{js,ts}` or list the `.ts` files), confirming `node --test` runs them under Node 24 type-stripping. Mechanical — planner/research detail.

### Claude's Discretion
- Exact filename/location of the `verify:parquet` script and **where it reads the built Parquet from** (`_site/species/{slug}/records.parquet` after build, or wherever `build-data`/`copy-parquet` writes them) — research/planning detail.
- The precise summary-line format and failure-report layout for `verify:parquet` (within D-04/D-05's scan-all / quiet constraints).
- Exact local interface shapes for any remaining external responses each converted script reads (driven by consumed fields, per D-10).
- How the build-time column-schema comparison is expressed against `OccurrenceRecordSchema` (DuckDB `DESCRIBE` vs schema introspection) — D-08 fixes the reader, not the comparison mechanics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning
- `.planning/REQUIREMENTS.md` — MIG-02 (convert build/data scripts), SCHEMA-04 (build-time one-sample check), SCHEMA-05 (build-locked JSON via static types), SCHEMA-06 (DuckDB CSV gate, no hot-path Zod), SCHEMA-07 (`verify:parquet`) are this phase's requirements
- `.planning/ROADMAP.md` §"Phase 35" — goal + 5 success criteria (note criterion 1's "all .js converted" is satisfied for one-offs by deletion per D-01; criterion 5's 60s `build:data` budget + byte-identical `_site/`)
- `.planning/phases/34-scripts-lib-src-lib-migration/34-CONTEXT.md` — the boundary-guard + `ManifestRow` + `status`-union template this phase replicates (D-01..06 there); deferred `view`/`match_bucket` lift (now D-09 here)
- `.planning/phases/33-toolchain-schema-scaffolding/33-CONTEXT.md` — trust-by-immutability validation architecture (D-01..03), Zod-4-in-`src/types/` (D-04..06), drift/strictness + data-profile (D-07/08)

### Toolchain & schemas (already on disk from Phases 33/34)
- `tsconfig.node.json` — type-checks `scripts/**/*.ts` and `*.test.ts`; `allowImportingTsExtensions`, `isolatedModules`, `types: ["node"]`
- `src/types/schemas.ts` / `src/types/index.ts` — Zod schemas + `z.infer<>` types; `OccurrenceRecordSchema` (the schema `verify:parquet` validates against and the build-time check compares columns to) is at `src/types/schemas.ts:11`
- `scripts/lib/manifest.ts` §`COLUMNS` — locked 13-column manifest field order; `ManifestRow`, `advanceStatus`, `readManifest`, `writeManifest`
- `scripts/lib/parse-photo-filename.ts` — **source of truth for the complete `match_bucket` value set** (D-09) and `view`

### Code touchpoints (read to ground the conversion)
- `scripts/build-data.js` §99–134 — DuckDB `read_csv` column types (CSV input gate); add the SCHEMA-04 sample readback here
- `scripts/copy-parquet.js` — where per-species Parquet lands at stable un-hashed `_site/species/{slug}/` paths (relevant to where `verify:parquet` reads)
- `src/components/parquet-cache.js:1,29` — the production hyparquet read path (`parquetReadObjects`); model `verify:parquet`'s read on it
- `scripts/ingest-photos.js`, `scripts/tile-photos.js`, `scripts/generate-species-photos.js` — consume manifest rows incl. `view`/`match_bucket` (D-09 targets); confirm the COMPLETE `status` set here too if not already locked
- `package.json` scripts — `build:data`/`build`/`photos:*` (active, keep); `migrate:images`/`migrate:species` (remove per D-01); `test`/`typecheck`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`OccurrenceRecordSchema`** (`src/types/schemas.ts:11`) — already defines the 14-column records shape with correct nullability (county 100% null, etc.); both `verify:parquet` (per-row) and the build-time check (column-schema) validate against it. No new schema needed.
- **DuckDB connection in `build-data.js`** — already open; the SCHEMA-04 readback (D-08) reuses it, no new dependency.
- **`parquet-cache.js` hyparquet read path** — the pattern `verify:parquet` mirrors for reading per-species Parquet.
- **Phase 34 boundary-guard + union patterns** — `manifest.ts` `status` union and the minimal-interface-plus-guard idiom are the direct template for every script converted here.

### Established Patterns
- All target scripts already use ESM (`import`/`export`) — conversion is rename + add annotations, no module-system change.
- Build-side only; nothing here ships to the browser bundle, so full `zod`/Node types are free to use (bundle weight irrelevant). The only per-row Zod (`verify:parquet`) is an offline script, never bundled.
- Per-species Parquet served at stable un-hashed URLs (`_site/species/{slug}/records.parquet`).

### Integration Points
- The converted `.ts` scripts import the already-converted `scripts/lib/*.ts` (done in Phase 34) — import resolution under Node 24 already proven.
- `verify:parquet` depends on built Parquet existing (post-`build:data` / `copy-parquet`); it is a separate npm script, not part of `npm run build` (SCHEMA-07).
- `build-data.ts` is the first script in the `build` chain; its 60s budget (success criterion 5) must absorb the new SCHEMA-04 readback — keep it O(columns), one sample.

</code_context>

<specifics>
## Specific Ideas

- The split that drives D-01: `scripts/` cleanly divides into the **active pipeline** (wired into `build`/`photos:*` npm scripts) and **spent one-offs** (migration/CDN-fix/upload tools that have run once and whose output is committed). Convert the former, delete the latter.
- `verify:parquet` is deliberately the **only** place full per-row Zod runs on the dataset — the trust-by-immutability architecture (Phase 33) keeps it out of every hot path; this is the sanctioned exhaustive offline check.
- The build-time SCHEMA-04 check and the load-time SCHEMA-08 check (Phase 37) are intentionally different readers/runtimes (DuckDB at build, hyparquet in browser) but both O(columns) — together with `verify:parquet` they cover write-path, read-path, and exhaustive checks respectively.

</specifics>

<deferred>
## Deferred Ideas

- **Content-hash / fingerprint per-species Parquet URLs** — would make dynamic data immutable-by-URL; a caching/deploy change, out of scope for v3.0 (carried from Phase 33).
- **New test coverage for previously-untested scripts** (e.g. `copy-parquet`, `copy-images`, `emit-species-states` have no existing tests) — MIG-02 converts existing tests; adding new coverage is not required by this phase. Cheap additions are at planner discretion but not mandatory.

None of the discussion strayed outside the phase domain.

</deferred>

---

*Phase: 35-build-pipeline-scripts-migration*
*Context gathered: 2026-06-09*
