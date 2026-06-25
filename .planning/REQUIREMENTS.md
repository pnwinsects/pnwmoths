# Requirements: PNW Moths — v4.0 Key Characters (Visual Identification)

**Defined:** 2026-06-24
**Core Value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Milestone Goal:** A dedicated "Identify" page where users narrow the key-scored PNW moth species by selecting morphological and distributional characters from the legacy Lucid key, with character illustrations and a live thumbnail grid of matching species. (Issue #19.)

## v1 Requirements

Requirements for this milestone (v4.0). Each maps to exactly one roadmap phase.

### Key Data Pipeline (`KEY`)

- [x] **KEY-01**: Build step ingests `key.csv` (237 character-states × 1,228 species binary matrix) into a compact client-loadable artifact (per-character-state base64 bitset JSON, target ~30 KB gzip)
- [x] **KEY-02**: Character metadata — the `Category : [Subcategory :] Question : State` hierarchy (8 categories / ~55 questions / 237 states), with both 2- and 3-level depths — is emitted as structured data driving panel grouping and the OR-within/AND-across question boundaries
- [x] **KEY-03**: A Zod schema validates the artifact shape at build time (O(states + species), not per-cell) and a load-time structural check guards the client boundary, consistent with the v3.0 `assertParquetColumns`/`validateSpeciesStates` pattern
- [x] **KEY-04**: A post-build check asserts the key matrix artifact stays within a defined byte budget (the existing page-weight validator only inspects HTML, so artifact bloat is otherwise invisible)
- [x] **KEY-05**: The `build:key` step runs within the build-time budget (target <5 s, consistent with `build:data`) and is wired into `npm run build` and the GitHub Actions gates

### Species ↔ Key Matching (`MATCH`)

- [x] **MATCH-01**: Build step resolves the 1,228 key binomials to site species slugs (direct lowercase-hyphen transform + `data/species-synonyms.csv`), tolerating whitespace artifacts in source binomials (e.g. double-spaced `Tolype  laricis`)
- [x] **MATCH-02**: Build emits a coverage report listing every unmatched key binomial (the ~53 reclassified/absent taxa, e.g. `Grammia`→`Apantesis`) for later manual synonym curation
- [x] **MATCH-03**: Matched species join to their CDN photo thumbnail for the results grid; key species that resolve to no site slug are excluded from results and counted in the coverage report

### Identify Page & Filter Panel (`IDENT`)

- [x] **IDENT-01**: New dedicated `/identify/` page (Eleventy route), linked from the site navigation
- [x] **IDENT-02**: Character filter panel renders all 8 categories as collapsible groups (default-collapsed), nesting subcategory → question → state, reusing the `aria-expanded` toggle pattern from `pnwm-taxon-browser`
- [x] **IDENT-03**: User can select and deselect individual character states (checkbox toggle), in any order
- [x] **IDENT-04**: Filter semantics are OR within a question and AND across questions, with the "0 = unscored, not absent" trap handled correctly — a species is eliminated only when it scores `1` for an *opposing* state in the same question; a raw `0`/blank never excludes a species (verified by TDD before the component is built)
- [x] **IDENT-05**: "Clear all" reset clears every selection and restores the full result set
- [x] **IDENT-06**: No-JS static degradation — the full character list and the full species list are visible as static HTML without JavaScript, consistent with the browse page

### Results Grid (`GRID`)

- [x] **GRID-01**: A live "N species match" count updates on every selection change
- [x] **GRID-02**: A flat thumbnail grid of matching species (CDN thumbnail + binomial + common name, each linking to the species page) renders with `loading="lazy"`, reusing the browse-page species-card pattern
- [x] **GRID-03**: Matching species without a photo show a gray placeholder, consistent with the v2.1 similar-species row
- [x] **GRID-04**: A "0 species match" dead-end state shows a clear empty-state message with a "Clear all" call-to-action

### Character Illustration Images (`CIMG`)

- [x] **CIMG-01**: The character illustration images are uploaded to the bunny.net CDN via an idempotent script (reusing the `upload-tiles.ts` curl-PUT / DRY_RUN / retry pattern), resized appropriately for the help panel
- [x] **CIMG-02**: A curated mapping (`data/key-character-images.csv`) links characters/questions to their illustration filename(s); coverage is best-effort, since the Lucid export did not include this mapping
- [x] **CIMG-03**: Character help images are shown on demand beside each question/state via inline `<details>/<summary>` expansion; characters with no mapped image simply render no expander (the page is fully functional before image coverage is complete)

## Future Requirements

Deferred to a later milestone (v4.x). Tracked but not in this roadmap.

### Identify polish (`IDENT`)

- **IDENT-07**: "Characters used" removable chip strip above the results
- **IDENT-08**: URL query-param state persistence for shareable identification sessions
- **IDENT-09**: Ecoregion-to-state dependency hint (note when a per-state ecoregion is selected without its parent state)

### Size coupling (`SIZE`)

- **SIZE-01**: Couple the Approximate (4-bin) and Precise (per-mm) size questions so selecting an approximate bin activates/expands its precise sub-question

## Out of Scope

Explicitly excluded for v4.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| "Best next character" guided reordering | Explicitly deferred (product decision); needs per-remaining-set discriminating-power computation and breaks spatial memory of the panel |
| Character state count annotation ("Brown (483)") | O(states × remaining-species) per update; deferred to v4.x+ once bitset perf is proven |
| Inapplicable / conditional character hiding | Requires manual annotation of conditional question pairs not present in the raw key data |
| Error tolerance / "near-match" fuzzy filtering | Requires a scored/ranked model rather than binary AND filtering |
| Sort results by best-match score | Requires a scoring model; hard AND filter is simpler to trust |
| Scored vs. unscored species distinction | Raw matrix is binary (1/blank); cannot distinguish "absent" from "not scored" without re-auditing the key |
| In-panel text search across characters | 8-category collapsible structure is sufficient to navigate 55 questions |
| Paginated results grid | `loading="lazy"` on a single grid handles up to 1,228 thumbnails without pagination complexity |
| Saving sessions / accounts | No server; URL state (IDENT-08) covers the shareable-session need |
| Embedding the external Lucid applet | This milestone reimplements the key's *data* as a static feature, not the Lucid tool itself |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KEY-01 | Phase 39 | Complete |
| KEY-02 | Phase 39 | Complete |
| KEY-03 | Phase 39 | Complete |
| KEY-04 | Phase 39 | Complete |
| KEY-05 | Phase 39 | Complete |
| MATCH-01 | Phase 40 | Complete |
| MATCH-02 | Phase 40 | Complete |
| MATCH-03 | Phase 40 | Complete |
| IDENT-01 | Phase 41 | Complete |
| IDENT-02 | Phase 41 | Complete |
| IDENT-03 | Phase 41 | Complete |
| IDENT-04 | Phase 40 | Complete |
| IDENT-05 | Phase 41 | Complete |
| IDENT-06 | Phase 41 | Complete |
| GRID-01 | Phase 42 | Complete |
| GRID-02 | Phase 42 | Complete |
| GRID-03 | Phase 42 | Complete |
| GRID-04 | Phase 42 | Complete |
| CIMG-01 | Phase 43 | Complete |
| CIMG-02 | Phase 43 | Complete |
| CIMG-03 | Phase 43 | Complete |

**Coverage:**

- v1 requirements: 21 total
- Mapped to phases: 21 (100%)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-24*
*Last updated: 2026-06-24 — traceability table populated after roadmap creation*
