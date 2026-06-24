# Phase 39: Key Matrix Data Pipeline - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 39 delivers the **complete build-time data pipeline** that turns the legacy Lucid
`key.csv` (237 character-states × 1,228 species binary matrix) into a stable, validated,
client-loadable artifact (`data/key-matrix.json`) plus a coverage report
(`data/key-coverage-report.json`) — wired into `npm run build`, gated by a build-time Zod
schema and a post-build byte-budget check. This artifact is the data contract every
later v4.0 phase (40–43) depends on.

**In scope (this phase):**
- Ingest `data/key-characters.csv` (committed copy of the Lucid export).
- Emit `characters` (237 entries, full `Category[:Subcategory]:Question:State` hierarchy).
- **Slug resolution** of all 1,228 key binomials → site slugs (direct lowercase-hyphen +
  `data/species-synonyms.csv` fallback), tolerant of whitespace artifacts (double-spaced
  binomials like `Tolype  laricis`); commit the initial Grammia→Apantesis synonym entries.
- DuckDB nav-thumbnail join so each matched species carries `slug` + nav image.
- Emit `matrix` as per-character-state base64 `Uint8Array` bitsets over the matched species.
- Emit `data/key-coverage-report.json` listing every unmatched binomial; unmatched species
  excluded from the matrix.
- Build-time Zod schema (O(states+species) shape) + `zod/mini` load-time structural guard.
- Post-build byte-budget check (gzip ≤ 50 KB) on `_site/key-matrix.json`.
- `build:key` wired into `npm run build` (after `build:data`, before `build:eleventy`) +
  post-Eleventy copy into `_site/`; GitHub Actions gates updated.
- Tests: CSV parse, whitespace normalization, slug resolution, bitset shape.

**Out of scope (later phases):**
- `src/_lib/key-filter.ts` filter functions, filter-specific schemas, and the
  `pnwm-key-filter-change` event type → **Phase 40** (pure filter-logic TDD contract only).
- Identify page, Lit components, results grid → Phases 41–42.
- Character illustration images / `key-character-images.csv` / `sharp` upload → Phase 43.

</domain>

<decisions>
## Implementation Decisions

### Source CSV
- **D-01:** Copy the Lucid export (`~/Downloads/may 6 2015 key files/may 6 2015 key.csv`)
  into the repo as **`data/key-characters.csv`** and commit it. The build must be
  reproducible with no external file dependency (no-server constraint). `build-key.ts`
  reads `data/key-characters.csv`. Confirmed structure: 1,229 columns (1 label + 1,228
  species), 238 rows (1 header + 237 character-states).

### Phase 39 ↔ 40 boundary
- **D-02:** Phase 39 owns the **entire data pipeline** including species↔key slug
  matching, synonym fallback, the DuckDB nav-thumbnail join, and the coverage report.
  Rationale: Phase 39's goal is a *stable data contract*; the artifact's `species` entries
  must carry real slugs + nav images, which is impossible without full slug resolution.
  Splitting matching out would force two phases to both rewrite `key-matrix.json`.
- **D-03:** Phase 40 shrinks to the **pure filter-logic TDD contract only**
  (`key-filter.ts` functions, filter schemas, event type) — no data-pipeline work.
- **⚠ ROADMAP edit flag:** ROADMAP Phase 40 SC1/SC2 (slug resolution + coverage report)
  duplicate Phase 39 and should be moved into Phase 39's success criteria. The roadmap and
  research SUMMARY already place this work in Phase 39 / research-Phase-1.

### Artifact shape
- **D-04:** `data/key-matrix.json` = `{ characters, species, matrix }`:
  - `characters`: 237 entries with the full `Category[:Subcategory]:Question:State`
    hierarchy (both 2- and 3-level depths), driving panel grouping and the
    OR-within / AND-across question boundaries.
  - `species`: **matched species only**, each with `slug` + nav image; unmatched excluded.
  - `matrix`: **per-character-state base64-encoded `Uint8Array` bitsets** over the matched
    species (~1 bit/species). ~29 KB gzip. Filtering = OR selected states' bitsets within a
    question, AND across questions, via `Uint8Array` bitwise ops.
- **⚠ ROADMAP edit flag:** this overrides ROADMAP Phase 39 SC1's "matrix (237 × N binary
  rows)" wording. Bitset chosen for size (29 KB gzip vs ~170 KB for nested arrays);
  consistent with KEY-01 and STACK.md / SUMMARY.md.

### Validation & budget
- **D-05:** Build-time Zod schema validates **O(states + species) shape, not per-cell**
  (character/species array shapes; each of the 237 matrix entries is a valid base64 string
  of the expected byte length). A `zod/mini` load-time structural guard protects the client
  boundary, mirroring the v3.0 `assertParquetColumns` / `validateSpeciesStates` pattern.
- **D-06:** Post-build byte-budget check asserts **gzip ≤ 50 KB** on `_site/key-matrix.json`
  (transfer size — what mobile actually downloads). The existing `check-page-weight.ts`
  inspects HTML only, so a separate artifact-size gate is required.
- **⚠ ROADMAP edit flag:** gzip ≤ 50 KB diverges from ROADMAP Phase 39 SC3's "100 KB byte
  budget" (raw). The check needs a gzip step.

### Committed artifacts
- **D-07:** Commit **both** `data/key-matrix.json` and `data/key-coverage-report.json` to
  git, consistent with the existing `data/species-photos.json` and `data/plates.json`
  precedent. Diffs are reviewable; coverage drift is visible in PRs.

### Claude's Discretion
- Exact bitset byte layout/orientation details, coverage-report JSON shape, and the precise
  `build:key` / `copy-key-matrix` script wiring are left to research/planning, constrained
  by the decisions above and the cited template scripts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 39: Key Matrix Data Pipeline" — goal + success criteria
  (note the D-03/D-04/D-06 roadmap-edit flags above).
- `.planning/REQUIREMENTS.md` — KEY-01..KEY-05 (artifact, metadata hierarchy, Zod schema,
  byte budget, build wiring) and MATCH-01..MATCH-03 (slug resolution, coverage, nav join).

### v4.0 research (HIGH confidence, direct file inspection)
- `.planning/research/SUMMARY.md` — resolved artifact format (bitset over nested-array);
  phase decomposition; pitfalls. **Most important single ref.**
- `.planning/research/STACK.md` — bitset format spec + filter pseudocode; `csv-parse` ingest.
- `.planning/research/ARCHITECTURE.md` — four integration seams; `keyMatrix.ts` data file;
  `copy-key-matrix.ts` post-Eleventy copy rationale.
- `.planning/research/PITFALLS.md` — "0 = unscored, not absent" trap; artifact-size trap;
  slug-drift (53 mismatches); whitespace anomalies.

### Template scripts to mirror (existing code)
- `scripts/emit-species-states.ts` — emit-script template for JSON artifacts.
- `scripts/copy-parquet.ts` — post-Eleventy copy-into-`_site/` pattern (→ `copy-key-matrix.ts`).
- `scripts/build-data.ts` — `build:data` step that produces the DuckDB/Parquet species data.
- `scripts/check-page-weight.ts` — existing weight gate (HTML-only; why a new check is needed).
- `src/types/schemas.ts` — `zod/mini` constraint + build-only full-Zod pattern.

### Data inputs
- `data/key-characters.csv` — **to be committed this phase** (copy of the Lucid export).
- `data/species-synonyms.csv` — slug-resolution fallback; add Grammia→Apantesis entries.
- `data/species.csv` — site species slugs (matching target).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/emit-species-states.ts`: closest analog for the new `scripts/build-key.ts`
  (read source data → validate → emit JSON artifact).
- `scripts/copy-parquet.ts`: directly mirrors the needed `copy-key-matrix.ts`
  (copies a build artifact into `_site/` after Eleventy).
- `src/types/schemas.ts`: `zod/mini` (browser) + build-only full Zod; add the new key schemas.
- `data/species-synonyms.csv`: established synonym-curation file from v2.2 Phase 27.

### Established Patterns
- v3.0 load-time validators (`assertParquetColumns`, `validateSpeciesStates`) define the
  O(shape) client-boundary guard style to replicate for the matrix.
- Build-generated JSON artifacts are committed to git (`species-photos.json`, `plates.json`).
- `npm run build` is a linear chain of `build:*` npm scripts; CI gates on `tsc --noEmit`,
  the `node --test` suite, and Parquet verification.

### Integration Points
- `package.json` `build` script: insert `build:key` after `build:data`, before
  `build:eleventy`; add a `build:copy-key-matrix` step post-Eleventy.
- DuckDB query (as in `build-data.ts`) to fetch nav-image filenames per matched slug.
- GitHub Actions PR-check + deploy workflows: ensure the new build steps + byte-budget gate
  run in CI.

</code_context>

<specifics>
## Specific Ideas

- Source file confirmed on disk at `~/Downloads/may 6 2015 key files/may 6 2015 key.csv`
  (629 KB; 1,229 × 238). The sibling `may 6 2015 key media/` folder and `key taxa.txt/.dat`
  are inputs for **later** phases (43 / matching aids), not this one.
- Whitespace anomalies confirmed by research: double-space binomials (`Tolype  laricis`)
  must be normalized during slug resolution; ~53 binomials need synonym/curation handling;
  3 species are fully unscored (all-zero) — relevant to the "0 = unscored" semantics that
  Phase 40 will TDD, but Phase 39 must not silently drop them on shape grounds.

</specifics>

<deferred>
## Deferred Ideas

- **Filter semantics / `key-filter.ts` / event type** → Phase 40 (already planned).
- **`sharp` as a direct dependency** → verify/add in Phase 43 (character images), not here.
- **Curating the remaining ~53 unmatched binomials** beyond the Grammia→Apantesis first
  pass → ongoing curator work driven by `key-coverage-report.json`; not a Phase 39 blocker.
- **ROADMAP success-criteria corrections** (D-03, D-04, D-06 flags) → apply via `/gsd-phase`
  edit to Phases 39/40 when convenient; does not block planning.

</deferred>

---

*Phase: 39-key-matrix-data-pipeline*
*Context gathered: 2026-06-24*
