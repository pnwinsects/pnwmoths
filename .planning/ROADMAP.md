# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-04-12) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Visual Identity** — Phase 6 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Tech Debt** — Phase 7 (shipped 2026-04-18) — [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Visual Browse** — Phases 8–12 (shipped 2026-04-20) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Image CDN** — Phases 13–17 (shipped 2026-04-22) — [archive](milestones/v1.4-ROADMAP.md)
- ✅ **v2.0 Glossary Tooltips** — Phases 19–21 (shipped 2026-04-23) — [archive](milestones/v2.0-ROADMAP.md)
- 🔄 **v2.1 Species Fact Sheet Gaps** — Phases 22–25 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–5) — SHIPPED 2026-04-12</summary>

- [x] Phase 1: Data Pipeline Foundation (2/2 plans) — completed 2026-04-12
- [x] Phase 2: Species Factsheet (Static) (2/2 plans) — completed 2026-04-12
- [x] Phase 3: Client-side Interactivity (2/2 plans) — completed 2026-04-12
- [x] Phase 4: Search, Glossary, and Validation (3/3 plans) — completed 2026-04-12
- [x] Phase 5: Maintainability (3/3 plans) — completed 2026-04-12

</details>

<details>
<summary>✅ v1.1 Visual Identity (Phase 6) — SHIPPED 2026-04-18</summary>

- [x] Phase 6: Make Pages Look Like Existing pnwmoths Site (2/2 plans) — completed 2026-04-15

</details>

<details>
<summary>✅ v1.2 Tech Debt (Phase 7) — SHIPPED 2026-04-18</summary>

- [x] Phase 7: Code Quality Fixes (1/1 plans) — completed 2026-04-18

</details>

<details>
<summary>✅ v1.3 Visual Browse (Phases 8–12) — SHIPPED 2026-04-20</summary>

**Milestone Goal:** Replace static browse pages with an interactive accordion browse page (Family → Subfamily → Genus → Species) with navigation images and client-side state filtering.

- [x] **Phase 8: Schema Extension** - Add `subfamily` and `navigational` columns to CSV data model with validation
- [x] **Phase 9: Build Pipeline Extension** - Emit `taxon.js` data tree and `species-states.json` for accordion and state filter
- [x] **Phase 10: Browse Shell Page** - Rewrite `/browse/` as single dynamic page; retire per-genus static pages
- [x] **Phase 11: Accordion Component** - Implement `<pnwm-taxon-browser>` Lit component with accordion, nav images, and state filter
- [x] **Phase 12: Validation** - Full build verification; confirm all outputs correct and tests passing

</details>

<details>
<summary>✅ v1.4 Image CDN (Phases 13–17) — SHIPPED 2026-04-22</summary>

**Milestone Goal:** Migrate image storage from Git LFS to bunny.net object storage with CDN-native on-the-fly resizing; remove build-time resize scripts and LFS from the repo; migrate full production dataset.

- [x] **Phase 13: CDN Provisioning** - Create bunny.net Storage + Pull Zone; upload 3,880 images; configure Optimizer; document upload workflow — completed 2026-04-22
- [x] **Phase 14: Template Migration** - Wire `CDN_BASE_URL` into Eleventy; update all templates and `pnwm-taxon-browser.js` to construct CDN URLs — completed 2026-04-22
- [x] **Phase 15: LFS Removal** - Rewrite git history to purge `images/` (16,191 files, 356 commits); clean `.gitattributes`; replace LFS checkout in CI — completed 2026-04-22
- [x] **Phase 16: Build Pipeline Cleanup** - Remove species photo copy block from `copy-images.js`; confirm no image resize scripts exist — completed 2026-04-22
- [x] **Phase 17: Migrate Full Species Data from Legacy Database** - Stream-parse 634 MB MySQL dump; write 1,348 species + 85,933 PNW occurrence records; 72/72 tests, 1,364 species pages — completed 2026-04-22

</details>

<details>
<summary>✅ Phase 18 (between milestones) — Plates CDN Migration — SHIPPED 2026-04-23</summary>

- [x] **Phase 18: Plates CDN Migration** - Restore photographic plates: migrate Zoomify tile data to bunny.net CDN — completed 2026-04-23

</details>

<details>
<summary>✅ v2.0 Glossary Tooltips (Phases 19–21) — SHIPPED 2026-04-23</summary>

**Milestone Goal:** Species prose automatically highlights the first occurrence of each glossary term at build time with a tooltip/popover showing the definition and image.

- [x] **Phase 19: Build-time Glossary Transform** - Annotate species prose HTML at build time with `<abbr>` elements for first occurrences of glossary terms — completed 2026-04-23
- [x] **Phase 20: Popover UI — HTML and CSS** - Add popover HTML structure and CSS so annotated terms show definition text on hover/focus/click without JS — completed 2026-04-23
- [x] **Phase 21: JS Hover Enhancement and Glossary Images** - Add vanilla JS event wiring and CDN glossary images to the popover — folded into Phase 20; completed 2026-04-23

</details>

### v2.1 Species Fact Sheet Gaps (Phases 22–25)

**Milestone Goal:** Close the remaining UX and feature gaps between pnwmoths and the reference pnwinsects-app on species fact sheet pages.

- [x] **Phase 22: Phenology Chart Improvements** - Axis labels and corrected Y-scale on the phenology chart (completed 2026-05-20)
- [x] **Phase 23: Photo Thumbnail Carousel** - Thumbnail strip navigation and lightbox close button fix (completed 2026-05-20)
- [ ] **Phase 24: County, Collection, and Elevation Filters** - Three new occurrence filters wired to the filter event bus
- [ ] **Phase 25: Similar Species Thumbnails** - CDN thumbnails and clickable links in the similar species section

## Phase Details

### Phase 19: Build-time Glossary Transform
**Goal**: Species prose pages have first occurrences of glossary terms wrapped in `<abbr class="glossary-term">` elements carrying definition and image URL as data attributes, correct no-JS degradation, and a passing unit test suite
**Depends on**: Phase 18 (build pipeline stable)
**Requirements**: GLOS-01, GLOS-02, GLOS-03, GLOS-04, GLOS-05, GLOS-06, QA-01
**Success Criteria** (what must be TRUE):
  1. A species page rendered by `npm run build` contains `<abbr class="glossary-term" title="..." data-definition="..." data-image-url="...">` wrapping the first occurrence of a matched glossary term, and the same term appearing later on the page is plain text
  2. Matching is case-insensitive and whole-word: "costal" matches in "the costal margin" but not inside "subcostal"
  3. Terms containing regex metacharacters (`1A+2A`, `W-mark`, `CuA1`) are matched correctly and do not corrupt surrounding HTML
  4. The `/glossary/` page and browse pages contain no `<abbr class="glossary-term">` elements (transform is scoped to species prose only)
  5. Unit tests cover regex escaping, first-occurrence deduplication, and prose-scope guard; all tests pass
**Plans**: 3 plans
Plans:
- [x] 19-01-PLAN.md — Install node-html-parser + implement glossary-transform.js (escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms)
- [x] 19-02-PLAN.md — Create unit test suite (QA-01) + add src/_lib/*.test.js to npm test glob
- [x] 19-03-PLAN.md — Wire addTransform into eleventy.config.js + integration verification
- [x] 19-04-PLAN.md — Fix substituteTerms() to wrap all unseen terms in a text node (gap closure)

### Phase 20: Popover UI — HTML and CSS
**Goal**: Users can see a styled popover panel with the full definition when they hover, focus, or click a highlighted glossary term; the feature works without JavaScript and does not pollute the Pagefind search index
**Depends on**: Phase 19
**Requirements**: TIP-01, TIP-02, TIP-03, QA-02
**Success Criteria** (what must be TRUE):
  1. Hovering or focusing an `<abbr class="glossary-term">` element opens a popover showing the full definition text, styled consistently with the site's design tokens
  2. The popover dismisses when the pointer leaves, focus moves away, or the user presses Escape
  3. With JavaScript disabled, the `<abbr title="...">` native browser tooltip remains available and no layout is broken
  4. After a production build and `pagefind --site _site`, species page excerpts in search results do not include glossary definition text
**Plans**: 1 plan
Plans:
- [x] 20-01-PLAN.md — Rewrite glossary tooltip to Popover API + migrate CSS selectors (TIP-01, TIP-02, TIP-03, QA-02)
**UI hint**: yes

### Phase 21: JS Hover Enhancement and Glossary Images
**Goal**: Popovers for terms that have a glossary image display that image from the CDN, and hover/focus show/hide behavior is driven by a small (~20-line) vanilla JS handler
**Depends on**: Phase 20
**Requirements**: TIP-02
**Success Criteria** (what must be TRUE):
  1. For a glossary term with an `image_filename` in `glossary.csv`, the popover panel shows the corresponding CDN image alongside the definition text
  2. For a glossary term without an image, the popover shows definition text only and no broken image placeholder appears
  3. The JS implementation is ~20 lines of vanilla JS with no external library dependency; hover and keyboard focus both trigger show/hide correctly
**Plans**: TBD
**UI hint**: yes

### Phase 22: Phenology Chart Improvements
**Goal**: Users see correctly labeled and scaled phenology charts on every species fact sheet
**Depends on**: Phase 21 (v2.0 complete)
**Requirements**: CHART-01, CHART-02
**Success Criteria** (what must be TRUE):
  1. The X-axis of the phenology chart displays the label "Month" and the Y-axis displays the label "# Records"
  2. The Y-axis begins at 0 and its maximum value equals the highest monthly record count for that species (no fixed cap, no negative baseline)
  3. A species with all records in one month shows a chart with one tall bar and all other bars at zero (Y-axis scales to that bar's height)
**Plans**: 1 plan
Plans:
- [x] 22-01-PLAN.md — Add scales config (axis titles + beginAtZero) to pnwm-phenology-chart.js, full build verification, human visual checkpoint (CHART-01, CHART-02)
**UI hint**: yes

### Phase 23: Photo Thumbnail Carousel
**Goal**: Users can navigate species photos via a thumbnail strip and close the lightbox via its close button
**Depends on**: Phase 22
**Requirements**: PHOTO-01, PHOTO-02, PHOTO-03
**Success Criteria** (what must be TRUE):
  1. For a species with multiple photos, a horizontal thumbnail strip is visible below the main image; clicking any thumbnail swaps it into the main image position
  2. The dot navigation control is absent; only the thumbnail strip provides photo navigation
  3. Opening the lightbox and clicking the close button (or pressing Escape) dismisses the lightbox without a page reload
**Plans**: 1 plan
Plans:
- [x] 23-01-PLAN.md — Replace dot navigation with thumbnail strip (ResizeObserver overflow detection, scrollIntoView on index change) + fix lightbox close button binding (PHOTO-01, PHOTO-02, PHOTO-03)
**UI hint**: yes

### Phase 24: County, Collection, and Elevation Filters
**Goal**: Users can narrow occurrence records on a species page by county, collection, and elevation range, with the map and phenology chart updating in real time
**Depends on**: Phase 23
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04
**Success Criteria** (what must be TRUE):
  1. A county dropdown appears in the filter bar; its options are populated from the distinct counties present in the species' Parquet data; selecting a county filters map pins and phenology bars to matching records
  2. A collection dropdown appears in the filter bar; its options are populated from the distinct collections present in the data; selecting a collection updates the map and chart
  3. An elevation range slider (feet) appears in the filter bar; dragging the min or max handle filters records to those within the selected elevation range
  4. All three new filters integrate with the existing `pnwm-filter-change` event bus; the map and phenology chart respond to the same event they already handle
**Plans**: 2 plans
Plans:
- [ ] 24-01-PLAN.md — Extend filterRecords() with county/collection/elevation conditions + add tests (FILT-01, FILT-02, FILT-03)
- [ ] 24-02-PLAN.md — Extend pnwm-filter-bar.js with county dropdown, collection dropdown, elevation range slider; extend pnwm-filter-change detail; human-verify (FILT-01, FILT-02, FILT-03, FILT-04)
**UI hint**: yes

### Phase 25: Similar Species Thumbnails
**Goal**: Users can see a thumbnail image and follow a link for each similar species listed on a species fact sheet
**Depends on**: Phase 24
**Requirements**: SIM-01, SIM-02
**Success Criteria** (what must be TRUE):
  1. Each entry in the similar species section displays a thumbnail image loaded from the CDN; species with no available image show a placeholder or are omitted gracefully
  2. Each similar species entry is a clickable link that navigates to that species' fact sheet page
  3. The similar species section renders correctly in the static HTML (no-JS degradation preserved)
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Pipeline Foundation | v1.0 | 2/2 | Complete | 2026-04-12 |
| 2. Species Factsheet (Static) | v1.0 | 2/2 | Complete | 2026-04-12 |
| 3. Client-side Interactivity | v1.0 | 2/2 | Complete | 2026-04-12 |
| 4. Search, Glossary, and Validation | v1.0 | 3/3 | Complete | 2026-04-12 |
| 5. Maintainability | v1.0 | 3/3 | Complete | 2026-04-12 |
| 6. Make Pages Look Like Existing pnwmoths Site | v1.1 | 2/2 | Complete | 2026-04-15 |
| 7. Code Quality Fixes | v1.2 | 1/1 | Complete | 2026-04-18 |
| 8. Schema Extension | v1.3 | 3/3 | Complete | 2026-04-20 |
| 9. Build Pipeline Extension | v1.3 | 2/2 | Complete | 2026-04-20 |
| 10. Browse Shell Page | v1.3 | 1/1 | Complete | 2026-04-20 |
| 11. Accordion Component | v1.3 | 3/3 | Complete | 2026-04-20 |
| 12. Validation | v1.3 | 1/1 | Complete | 2026-04-20 |
| 13. CDN Provisioning | v1.4 | 5/5 | Complete | 2026-04-22 |
| 14. Template Migration | v1.4 | 2/2 | Complete | 2026-04-22 |
| 15. LFS Removal | v1.4 | 2/2 | Complete | 2026-04-22 |
| 16. Build Pipeline Cleanup | v1.4 | 1/1 | Complete | 2026-04-22 |
| 17. Migrate Full Species Data from Legacy Database | v1.4 | 3/3 | Complete | 2026-04-22 |
| 18. Plates CDN Migration | — | 2/2 | Complete | 2026-04-23 |
| 19. Build-time Glossary Transform | v2.0 | 4/4 | Complete | 2026-04-23 |
| 20. Popover UI — HTML and CSS | v2.0 | 1/1 | Complete | 2026-04-23 |
| 21. JS Hover Enhancement and Glossary Images | v2.0 | 0/0 | Complete (folded into Phase 20) | 2026-04-23 |
| 22. Phenology Chart Improvements | v2.1 | 1/1 | Complete   | 2026-05-20 |
| 23. Photo Thumbnail Carousel | v2.1 | 1/1 | Complete | 2026-05-20 |
| 24. County, Collection, and Elevation Filters | v2.1 | 0/2 | Planned | - |
| 25. Similar Species Thumbnails | v2.1 | 0/? | Not started | - |

---
*Roadmap created: 2026-04-11 | v1.0 archived: 2026-04-12 | v1.1 archived: 2026-04-18 | v1.2 archived: 2026-04-18 | v1.3 archived: 2026-04-20 | v1.4 archived: 2026-04-23 | v2.0 archived: 2026-05-19*

## Backlog

No backlog items.
