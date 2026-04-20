# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-04-12) — [archive](.planning/milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Visual Identity** — Phase 6 (shipped 2026-04-18) — [archive](.planning/milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Tech Debt** — Phase 7 (shipped 2026-04-18) — [archive](.planning/milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Visual Browse** — Phases 8–12 (in progress)

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

### 🚧 v1.3 Visual Browse (In Progress)

**Milestone Goal:** Replace static browse pages with an interactive accordion browse page (Family → Subfamily → Genus → Species) with navigation images and client-side state filtering.

- [x] **Phase 8: Schema Extension** - Add `subfamily` and `navigational` columns to CSV data model with validation
- [x] **Phase 9: Build Pipeline Extension** - Emit `taxon.js` data tree and `species-states.json` for accordion and state filter
- [ ] **Phase 10: Browse Shell Page** - Rewrite `/browse/` as single dynamic page; retire per-genus static pages
- [ ] **Phase 11: Accordion Component** - Implement `<pnwm-taxon-browser>` Lit component with accordion, nav images, and state filter
- [ ] **Phase 12: Validation** - Full build verification; confirm all outputs correct and tests passing

## Phase Details

### Phase 8: Schema Extension
**Goal**: The data model supports subfamily taxonomy and curated navigation images
**Depends on**: Phase 7
**Requirements**: TAXON-01, TAXON-02, TAXON-03
**Success Criteria** (what must be TRUE):
  1. `species.csv` has a `subfamily` column; genera without subfamily have a blank value treated as null (not empty string) by the build pipeline
  2. `images.csv` has a `navigational` boolean column; absent values default to false during build
  3. `npm test` passes; new tests cover the blank-subfamily null-coercion and missing-navigational-flag behavior
  4. `build-data.js` and `taxon.js`/`families.js` column maps reference the new fields without error
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md — Add subfamily and navigational columns to CSV data files
- [x] 08-02-PLAN.md — Update build-data.js, families.js, and images.js to recognise new columns
- [x] 08-03-PLAN.md — Update tests: happy-path assertions and null-coercion tests

### Phase 9: Build Pipeline Extension
**Goal**: The build emits a taxonomy tree data file and a species-×-state JSON file that downstream code can consume
**Depends on**: Phase 8
**Requirements**: SFILT-01
**Success Criteria** (what must be TRUE):
  1. `npm run build` writes `_site/species-states.json` containing one entry per distinct (species_slug, state) pair from records.csv
  2. `src/_data/taxon.js` exists and returns a family → subfamily → genus → species tree with up to 4 navigation images per taxon level; `families.js` is retired or superseded
  3. The species-states query uses SELECT DISTINCT so file size stays bounded at full data scale
  4. `npm test` passes; existing pipeline tests remain green
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Emit species-states.json (TDD: DISTINCT query + post-Vite file write)
- [x] 09-02-PLAN.md — Create taxon.js Eleventy data file (TDD: family→subfamily→genus→species tree with navImages)

### Phase 10: Browse Shell Page
**Goal**: `/browse/` is a single Eleventy-generated page with a JS-off static listing; per-genus pages are retired
**Depends on**: Phase 9
**Requirements**: BROWSE-01, BROWSE-07
**Success Criteria** (what must be TRUE):
  1. `/browse/` loads and contains a `<pnwm-taxon-browser>` element with the taxonomy tree in a `data-taxonomy` attribute
  2. With JavaScript disabled, all families, genera, and species are visible as plain HTML in a `<noscript>` block
  3. Per-genus static pages (`/browse/{genus}/`) no longer exist in `_site/`; the link checker reports no broken internal links pointing to them
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] TBD

### Phase 11: Accordion Component
**Goal**: The browser-side accordion is fully interactive — expand/collapse, navigation images, show/hide toggle, and state filter all work
**Depends on**: Phase 10
**Requirements**: BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05, BROWSE-06, SFILT-02
**Success Criteria** (what must be TRUE):
  1. All families appear collapsed by default; each shows up to 4 navigation images when images are on
  2. Expanding a family reveals its subfamilies (or genera for families with no subfamily); parent images hide while expanded
  3. Expanding a subfamily reveals its genera; expanding a genus reveals species as links to factsheet pages
  4. Navigation images fall back to `navigational`-flagged images, then to lowest-weight photos; no taxon shows a broken image placeholder
  5. The show/hide images toggle controls image visibility globally; state filter hides taxa with no occurrence records in the selected state
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] TBD

### Phase 12: Validation
**Goal**: A clean production build with all outputs present and tests passing
**Depends on**: Phase 11
**Requirements**: (none — validation phase)
**Success Criteria** (what must be TRUE):
  1. `npm run build` completes without errors; `_site/species-states.json` is present in the output
  2. The link checker reports zero broken links across the built site
  3. `npm test` passes with all existing and new tests green
  4. Pagefind does not index the taxonomy JSON data attribute (no `data-pagefind-ignore` omission)
**Plans**: TBD

Plans:
- [ ] TBD

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
| 10. Browse Shell Page | v1.3 | 0/? | Not started | - |
| 11. Accordion Component | v1.3 | 0/? | Not started | - |
| 12. Validation | v1.3 | 0/? | Not started | - |

---
*Roadmap created: 2026-04-11 | v1.0 archived: 2026-04-12 | v1.1 archived: 2026-04-18 | v1.2 archived: 2026-04-18 | v1.3 started: 2026-04-20*

## Backlog

### Phase 999.1: Add subfamily column to species.csv (BACKLOG)

**Goal:** Store subfamily-level taxonomy in the data model. The legacy site URL hierarchy includes subfamily (e.g. subfamily-lasiocampinae) but species.csv has no column for it.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Tooling to import from legacy pnwmoths.biol.wwu.edu (BACKLOG)

**Goal:** Reduce manual copy/paste when adding species from the legacy site. No tooling currently exists to pull species metadata, images, or occurrence records programmatically.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
