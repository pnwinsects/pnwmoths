# Project Research Summary

**Project:** PNW Moths v4.0 — Key Characters: Visual Identification (Issue #19)
**Domain:** Lucid-style character-filter identification page in a static Eleventy/Vite/Lit site
**Researched:** 2026-06-24
**Confidence:** HIGH

## Executive Summary

The v4.0 milestone adds a dedicated `/identify/` page where users select from 237 character-states across 8 categories (Forewing color, Hindwing color, Size, Abdomen/Thorax, Wing shape, Distribution, Seasonality, Eyes) to narrow a 1,228-species matrix to a live thumbnail grid of matching moths. The source data — a `237 × 1,228` binary CSV exported from the legacy Lucid key — is fully available and inspected. The recommended implementation is a build-time pipeline that emits a compact bitset JSON artifact (~29 KB gzip) consumed by three new Lit components on the Identify page. This integrates cleanly into the existing Eleventy/Vite/Lit toolchain at four seams without modifying any existing component.

The recommended approach: parse `key.csv` into a per-character-state base64 bitset artifact at build time; inline only the character and species metadata (~30 KB) directly in the HTML; fetch the full matrix asynchronously after first paint; implement OR-within-question / AND-across-question filtering via `Uint8Array` bitwise AND operations (microseconds at 1,228 species). Character illustration images are uploaded to bunny.net under `key-media/` and shown on demand beside each character via the native Popover API. Species-to-key matching is best-effort (95.7% direct match; 53 reclassified species need `species-synonyms.csv` entries). The Identify page ships before character images are wired in — the data pipeline, filter UI, and results grid are independent of image curation.

The dominant risks are: (1) the "0 = unscored, not absent" filter-semantics trap — treating all non-1 matrix cells as hard exclusions will wrongly eliminate species, and this must be established with TDD before any component is written; (2) the character illustration image count is uncertain (researchers counted 13 exact-match, 44, ~196, and ~243 depending on methodology) and the filename-to-character-state mapping was not exported from Lucid, so a human-curated `data/key-character-images.csv` is required; and (3) artifact-size discipline — the matrix must never be inlined into HTML, and a separate post-build artifact-size check is needed because the existing page-weight validator only checks HTML files. Distribution and Seasonality characters are confirmed in scope per product decision; a clear UI label distinguishing key-derived distribution data (2015) from occurrence-record filters is the recommended mitigation for the data-freshness overlap.

## Key Findings

### Recommended Stack

No new dependencies are required. The full v4.0 feature set is achievable with existing tools: `csv-parse` for the build-time matrix ingest, `sharp` (verify it is a direct project dependency, not just available via PATH) for resizing character/specimen images before CDN upload, `zod/mini` for browser-side schema validation at load time (existing constraint), and `curl` for bunny.net PUT uploads (existing convention). The key matrix artifact is emitted as a JSON file containing per-character-state base64-encoded `Uint8Array` bitsets; this format weighs 96 KB uncompressed / 29 KB gzip and parses to typed arrays without any additional library.

**Core technologies (new v4.0 additions only — existing stack unchanged):**
- `csv-parse` (already in repo): build-time ingest of `key.csv` (237 × 1,228 binary matrix)
- `sharp` (already in scripts): resize character illustrations to 800px max-width before CDN upload
- `curl` CLI: bunny.net PUT upload following `upload-tiles.ts` pattern verbatim
- `Uint8Array` bitfields: 154 bytes per character-state for O(states × 154) filter operations

**What not to add:** Parquet for the key matrix, DuckDB for CSV ingestion, SQLite/sql.js, fuzzy search libraries, any new framework or state management library.

### Expected Features

**Must have (table stakes — ship with the page):**
- Character data pipeline: `key.csv` → `data/key-matrix.json` (bitset artifact) + `data/key-coverage-report.json`
- Collapsible filter panel: 8 categories → questions → 237 checkbox states; OR within question, AND across questions
- Live "N of M species match" count updating on every selection
- Flat thumbnail grid of matching species (CDN photo + name + link); lazy-loaded; gray placeholder for missing photos
- "Clear all" reset button; deselect individual states
- Character help images on demand: inline expandable beside each question (native Popover API or `<details>/<summary>`)
- Character illustration images uploaded to bunny.net `key-media/` path
- No-JS static degradation: character hierarchy as readable text + full species list as links (`<noscript>` message + browse page link; filter interaction is inherently JS-only)
- "0 species match" dead-end warning with clear-last-selection CTA

**Should have (add after v4.0 launch):**
- "Characters used" chip strip: removable chips above results showing active selections
- URL state persistence: encode/decode selections in query params for shareable links
- Ecoregion-to-state dependency hint: inline note when per-state ecoregion selected without parent state

**Defer to v5+:**
- Best next character guided reordering (EXPLICITLY LOCKED OUT per product decision)
- Character state count annotation ("Brown (483 species)")
- Inapplicable/conditional character visibility (requires manual annotation of ~8 dependent question pairs)
- Error tolerance / fuzzy matching (requires tri-valued scoring model, not binary)
- Approximate + precise size coupling (auto-activate precise sub-question from approximate bin)

### Architecture Approach

The feature integrates at four seams in the existing architecture: a new build script (`scripts/build-key.ts`) inserts between `build:data` and `build:eleventy`; a new Eleventy data file (`src/_data/keyMatrix.ts`) follows the `speciesPhotos.ts` pattern; a new route (`src/identify/index.njk`) uses `base.njk` layout; and three new Lit components in `src/components/` bundle alongside existing components. The key-matrix artifact is served from `_site/key-matrix.json` (copied post-Eleventy by `scripts/copy-key-matrix.ts`, for the same reason `copy-parquet.ts` exists). Filter state lives inside `pnwm-identify` as reactive Lit properties — it does NOT use the `pnwm-filter-change` event bus, which is scoped to occurrence-record filters on species pages.

Note on artifact format: STACK.md recommends pure per-character-state base64 bitsets (96 KB / 29 KB gzip); ARCHITECTURE.md recommends nested-array `matrix: number[][]` (170 KB gzip) for debuggability. This summary resolves in favor of the bitset format: 29 KB vs. 170 KB matters on mobile, and debuggability is served by the coverage report and build-time validation.

**Major components:**
1. `scripts/build-key.ts` — CSV ingest, slug resolution (1175/1228 direct; 53 via `species-synonyms.csv`), DuckDB nav-thumbnail query, bitset emit, coverage report
2. `src/_data/keyMatrix.ts` + `src/identify/index.njk` — Eleventy: inline characters+species metadata (~30 KB) in HTML; matrix served as a separate async fetch
3. `pnwm-identify` (Lit, light DOM) — root component; owns `_selectedChars` reactive state; async-fetches and validates matrix; runs bitset filter; "Clear all" button
4. `character-filter-panel` (Lit, light DOM) — 8 collapsible categories; 237 checkboxes; disabled while matrix loads; character image popovers; dispatches `pnwm-key-filter-change`
5. `key-results-grid` (Lit, light DOM) — species thumbnail grid; "N of M" count; gray placeholder for missing photos; "0 results" empty state
6. `scripts/upload-key-images.ts` — one-shot idempotent CDN upload of resized character/specimen images to `key-media/`

### Critical Pitfalls

1. **"0 = unscored, not absent" filter semantics** — A species with `0` for both states of a yes/no question was not scored for that character and must NOT be eliminated. Correct logic: a species is eliminated only if it has `1` for an explicitly opposing state. **Prevention:** TDD test cases with concrete matrix fixtures before writing any component code. This is the most consequential correctness bug — if wrong, the page produces misleading identifications silently.

2. **Character illustration image count and mapping are uncertain** — Researchers counted 13 exact-match, 44, ~196, and ~243 non-specimen images depending on methodology. What is certain: the character-state→image-filename mapping was embedded in Lucid and was not exported. Automated fuzzy-matching produces plausible-but-wrong results ("Blue Mountains" ecoregion matches "Blue.jpg" forewing color). **Prevention:** ship with all `image_filename: null`; curator populates `data/key-character-images.csv` manually over time. Image count to be determined during curator session.

3. **Artifact size and page-weight discipline** — The post-build `check-page-weight.ts` checks HTML files only; it will not catch a bloated `key-matrix.json`. Inlining the matrix in the HTML template would make `identify/index.html` ~500+ KB, failing the existing HTML weight gate. **Prevention:** always emit as a side-loaded artifact; add a separate post-build check asserting `_site/key-matrix.json` ≤ 100 KB.

4. **AND/OR logic inversion** — Selecting "Brown" and "Tan" within one question must widen results (OR); selecting a second question must narrow (AND). The inverse is easy to write. **Prevention:** named TDD tests for all three correctness cases before any component is written.

5. **Distribution/Seasonality UI overlap** — 64 of 237 character-states represent 2015 key-derived distribution and seasonality data that differs from the site's occurrence-record-based filters. All 8 categories are in scope per locked product decision. **Prevention:** label these sections clearly as "Key data (2015)"; do not extend `FilterChangeDetail`; consider an ecoregion→state dependency hint in the UI.

## Implications for Roadmap

Based on research, suggested phase structure (5 phases):

### Phase 1: Data Pipeline — Key Matrix Artifact

**Rationale:** Everything else depends on a stable data contract. No UI can be built until `key-matrix.json` schema is locked. Slug resolution, bitset encoding, and coverage report output must be established first.

**Delivers:**
- `scripts/build-key.ts` with Zod-validated bitset artifact emission
- `data/key-matrix.json` (96 KB / 29 KB gzip) — source-controlled
- `data/key-coverage-report.json` — 53 unmatched binomials logged; initial Grammia→Apantesis synonyms added to `data/species-synonyms.csv`
- `scripts/copy-key-matrix.ts` copying `_site/key-matrix.json` post-Eleventy
- Post-build artifact-size assertion (≤ 100 KB) added to CI
- Unit tests: CSV parse, whitespace normalization (double-space binomials), slug resolution, bitset shape

**Avoids:** Artifact-size trap; slug drift (53 mismatches); whitespace anomalies in 3 binomials.

**Research flag:** Standard patterns (mirrors `emit-species-states.ts`). No additional research needed.

---

### Phase 2: Filter Logic — TDD Contract

**Rationale:** Filter semantics ("0 = unscored not absent"; OR-within / AND-across) must be established as tested, standalone TypeScript functions before any Lit rendering code is written.

**Delivers:**
- `src/_lib/key-filter.ts`: `buildQuestionGroups()`, `computeMatching()` as pure bitset functions
- `src/_lib/key-filter.test.ts`: TDD tests covering all correctness cases including "0,0 pair passes through"
- `src/types/schemas.ts` additions: `CharacterSchema`, `KeySpeciesSchema`, `KeyMatrixSchema` (bitset variant)
- `src/types/events.ts` addition: `pnwm-key-filter-change` event detail type

**Avoids:** AND/OR inversion; "0 = unscored" correctness bug — both verified by tests before any UI exists.

**Research flag:** Standard. Algorithm fully specified in STACK.md (bitset pseudocode).

---

### Phase 3: Identify Page Scaffold and Filter Panel

**Rationale:** With data and logic locked, the UI shell can be built. This phase wires the Eleventy route, inline JSON strategy, and `character-filter-panel` component. The results grid is a stub (match count only) until Phase 4.

**Delivers:**
- `src/identify/index.njk`: route `/identify/`; inline `{ characters, species }` metadata; `<noscript>` degradation
- `src/_data/keyMatrix.ts`: Eleventy data file (metadata only; soft-fail if absent)
- `pnwm-identify` Lit component: parses inline JSON; async-fetches matrix; owns `_selectedChars`; "Clear all" button
- `character-filter-panel` Lit component: 8 collapsible categories; 237 checkbox states; disabled while matrix loads
- Stub results area: match count only
- Navigation link to `/identify/` in site header

**Avoids:** Event bus contamination (`FilterChangeDetail` unchanged); 237-checkbox UX problem (collapsible accordions, default-collapsed); no-JS degradation failure.

**Research flag:** Standard. Collapsible accordion, light DOM, and Pico CSS patterns established in `pnwm-taxon-browser`.

---

### Phase 4: Results Grid and Species Thumbnails

**Rationale:** With filter state working, the output display layer can be added. Includes gray placeholder for missing photos, "0 results" dead-end state, and `loading="lazy"` on thumbnails.

**Delivers:**
- `key-results-grid` Lit component: species thumbnail grid; "N of M species match" count; `loading="lazy"`; gray placeholder for `nav_image: null`; "No species match" empty state with "Clear all" CTA
- CDN thumbnail URL construction: `CDN_BASE_URL/{slug}/{nav_image}?height=186`
- Coverage-gated links: only matched species rendered as links

**Avoids:** Broken thumbnail grid (gray placeholder); full re-render per keystroke (Lit keyed repeat).

**Research flag:** Standard. Reuses `pnwm-taxon-browser` card pattern.

---

### Phase 5: Character Illustration Images

**Rationale:** Image upload and display are fully decoupled from filter functionality and can ship incrementally after the filtering page is live.

**Delivers:**
- `scripts/upload-key-images.ts`: sharp resize to 800px max-width; upload to `key-media/` on bunny.net; DRY_RUN guard; idempotent rerun
- `data/key-character-images.csv`: curator-maintained character→image mapping (initial state: empty or first curator pass); build soft-skips if absent
- Character help image display in `character-filter-panel`: native Popover API (`popover="auto"`) beside character states with `image_filename` set
- Build warnings for unmapped characters and unused image files

**Avoids:** Automated heuristic image mapping (rejected); ecoregion name mismatches (handled in curator CSV, not code).

**Research flag:** Image count and mapping effort are uncertain. Phase 5 planning should include a curator session to assess realistic mapping scope before estimating tasks.

---

### Phase Ordering Rationale

- **Pipeline before UI:** All three Lit components require `key-matrix.json` schema to be locked. A schema change after UI is built is expensive.
- **Logic before rendering:** The "0 = unscored" and AND/OR bugs are invisible in a running UI until a user notices wrong results. TDD in Phase 2 catches them before rendering code exists.
- **Scaffold before grid:** The Eleventy route, inline JSON strategy, and Popover API pattern must work before the results grid is layered in.
- **Images last:** Image display is purely additive and does not affect filtering correctness or grid structure. Deferring to Phase 5 keeps earlier phases focused and shippable.

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 1:** Mirrors `emit-species-states.ts` + `upload-tiles.ts` exactly
- **Phase 2:** Algorithm fully specified in STACK.md
- **Phase 3:** Mirrors `pnwm-taxon-browser` collapsible accordion + light DOM
- **Phase 4:** Reuses species card pattern from browse page grid

Phases that may benefit from a brief scoping session before planning:
- **Phase 5:** Curator-side — assess realistic effort to populate `data/key-character-images.csv` before estimating tasks. This is a curation-scope question, not a code research question.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All decisions grounded in direct file inspection. No speculative dependencies. `sharp` project-dependency status needs verification in Phase 1. |
| Features | HIGH | Key CSV fully parsed; Lucid UX patterns documented; feature scope confirmed against locked product decisions. Character image count uncertain but does not affect feature decisions. |
| Architecture | HIGH | All four researchers converged on the same component decomposition. One resolved divergence: bitset format (29 KB gzip) recommended over nested-array JSON (170 KB gzip). |
| Pitfalls | HIGH | Grounded in direct matrix inspection. 3 fully-unscored species confirmed; 53 slug mismatches confirmed; whitespace anomalies confirmed. |

**Overall confidence:** HIGH

### Gaps to Address

- **Character illustration image count:** Researchers counted 13, 44, ~196, and ~243 depending on methodology. Precise count to be determined during Phase 5 curator session. Does not affect Phases 1–4.
- **`sharp` as direct project dependency:** Used in scripts but may not be in `package.json` as an explicit dependency. Verify in Phase 1; add if absent.
- **Artifact format resolved:** STACK.md (bitsets, 29 KB gzip) vs. ARCHITECTURE.md (nested array, 170 KB gzip). This summary resolves in favor of bitsets. Phase 1 should use the STACK.md format.
- **`species-synonyms.csv` curation for 53 unmatched species:** The Grammia→Apantesis reclassification (14 species) should be the first curator pass. Ongoing gap, not a blocker.
- **Distribution/Seasonality UI label text:** Product decision to include all 8 categories is locked. Specific UI label text distinguishing 2015 key data from occurrence-record filters is a design detail for Phase 3 planning.

## Sources

### Primary (HIGH confidence — direct file inspection)
- `may 6 2015 key.csv` (local download) — 237 × 1,228 matrix; density 30.2%; all values binary; 3 all-zero species; 2 double-space binomials
- `scripts/upload-tiles.ts` — bunny.net upload pattern (DRY_RUN, withRetry, redact, curl PUT)
- `scripts/emit-species-states.ts` — emit script template for JSON artifacts
- `src/types/schemas.ts` — Zod mini constraint; build-only full Zod pattern
- `src/components/pnwm-taxon-browser.ts` — collapsible accordion, light DOM, CDN thumbnail construction
- `.planning/PROJECT.md` — confirmed product decisions and key data decisions log

### Secondary (MEDIUM confidence — documented UX patterns)
- Lucid key four-panel architecture documentation (idtools.org/grasshoppers)
- DELTA interactive key principles PDF (delta-intkey.com) — AND/OR semantics, remaining-taxa count
- Xper3 documentation — unknown-state handling
- Wäldchen et al. 2022, People and Nature — ~20% character misidentification rate from experts

---
*Research completed: 2026-06-24*
*Ready for roadmap: yes*
