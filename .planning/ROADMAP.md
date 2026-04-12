# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11
**Milestone:** v1 — Proof of concept

## Phases

- [ ] **Phase 1: Data Pipeline Foundation** — CSV schema, DuckDB import, per-species Parquet export, Eleventy data files, 700 species pages generated. Validates the critical build-time join before any UI work.
- [ ] **Phase 2: Species Factsheet (Static)** — Complete static species page template: taxonomy, prose, photos, similar species, browse pages, site navigation. No interactive JS yet.
- [ ] **Phase 3: Client-side Interactivity** — Vite + Lit integration: hyparquet data loading, Leaflet map, phenology chart, occurrence filters, image slideshow, graceful JS-off degradation.
- [ ] **Phase 4: Search, Glossary, and Validation** — Pagefind integration, glossary page, post-build link checker, page weight script, data integrity validator.
- [ ] **Phase 5: Maintainability** — LLM instruction files, GitHub Actions CI/CD, Docker build environment, build performance verification.

## Phase Details

### Phase 1: Data Pipeline Foundation

**Goal**: The build pipeline reliably joins occurrence data to species at build time and produces 700 deployable HTML stubs.
**Depends on**: Nothing
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, SPEC-01, SPEC-05
**Success Criteria** (what must be TRUE):
  1. Running `npm run build` from a clean checkout produces one HTML file per species (~700 pages) at `/species/[lowercase-hyphenated-slug]/`.
  2. Per-species Parquet files exist in the build output alongside the HTML pages and contain the correct occurrence records for each species.
  3. Introducing a malformed row in `records.csv` (bad encoding, missing required field, out-of-bounds coordinate) causes the build to fail with a specific, actionable error message rather than silently producing wrong output.
  4. The complete build — CSV import, Eleventy render, Parquet export — completes without manual intervention from a clean working directory.
**Plans:** 2 plans
Plans:
- [x] 01-01-PLAN.md — Project scaffold, CSV schemas, DuckDB import/validation, Parquet export
- [x] 01-02-PLAN.md — Eleventy config, species data file, pagination template, full build wiring
**UI hint**: no

### Phase 2: Species Factsheet (Static)

**Goal**: Every species page is complete as a static document — readable, navigable, and correct without any JavaScript.
**Depends on**: Phase 1
**Requirements**: SPEC-02, SPEC-03, SPEC-04, BRWS-01, BRWS-02, BRWS-03
**Success Criteria** (what must be TRUE):
  1. A species page displays scientific name, common name, NOC ID, authority, and prose description (when a Markdown file exists for that species).
  2. A species page shows photos with photographer credit; pages for species with no images display a graceful placeholder rather than broken image tags.
  3. A species page lists similar species as working links to their respective pages.
  4. A browse page lists all species grouped by family then genus, and each genus has its own listing page.
  5. Every page has site-wide navigation linking to browse, search, glossary, and home.
**Plans**: 2 plans
Plans:
- [ ] 02-01-PLAN.md — Data model extensions, base layout, species factsheet template
- [ ] 02-02-PLAN.md — Browse pages (all-species and per-genus) with stub pages
**UI hint**: yes

### Phase 3: Client-side Interactivity

**Goal**: The species factsheet is a fully interactive research tool: occurrence map, phenology chart, data filters, and image slideshow all work in the browser via Parquet data loaded asynchronously.
**Depends on**: Phase 2
**Requirements**: INTV-01, INTV-02, INTV-03, INTV-04, INTV-05, INTV-06
**Success Criteria** (what must be TRUE):
  1. A species page renders a Leaflet map of occurrence points loaded from the per-species Parquet file; map markers appear without a full page reload.
  2. A phenology bar chart (records by month) renders from the same Parquet data on the same page.
  3. Selecting a state, record type, or year range updates both the map and the chart to show only matching records.
  4. Species photos cycle in a slideshow; clicking a photo opens a larger view.
  5. With JavaScript disabled, occurrence data remains visible as a plain HTML table and photos are visible as static images — no content is exclusively behind JS.
  6. Map, chart, slideshow, and search results components are all implemented as Lit custom elements.
**Plans**: 2 plans
Plans:
- [ ] 02-01-PLAN.md — Data model extensions, base layout, species factsheet template
- [ ] 02-02-PLAN.md — Browse pages (all-species and per-genus) with stub pages
**UI hint**: yes

### Phase 4: Search, Glossary, and Validation

**Goal**: Users can find species by name via static search, read the glossary, and the build catches bad links, excessive page weight, and data integrity problems before deploy.
**Depends on**: Phase 3
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, GLOS-01, VALD-01, VALD-02, VALD-03
**Success Criteria** (what must be TRUE):
  1. Searching for a scientific name (e.g., "Acronicta") or a common name (e.g., "dagger moth") returns relevant species pages with no server required.
  2. Occurrence record data (collector names, county strings, coordinates) does not appear as search results.
  3. The glossary page renders all terms in alphabetical order from the source data file.
  4. A post-build link check fails the build when any internal link points to a non-existent page.
  5. The build emits a warning (or failure) when any HTML page exceeds the configured page weight threshold.
  6. The data validator catches species IDs in records that have no matching species, invalid state/record_type values, and coordinates outside plausible PNW bounds.
**Plans**: 2 plans
Plans:
- [ ] 02-01-PLAN.md — Data model extensions, base layout, species factsheet template
- [ ] 02-02-PLAN.md — Browse pages (all-species and per-genus) with stub pages
**UI hint**: yes

### Phase 5: Maintainability

**Goal**: A non-technical maintainer can add species, records, or edit content by following plain-English instructions, and the CI pipeline builds and deploys the site automatically on every push.
**Depends on**: Phase 4
**Requirements**: MAINT-01, MAINT-02, MAINT-03, MAINT-04
**Success Criteria** (what must be TRUE):
  1. Following only the instructions in `_instructions/ADDING_SPECIES.md`, a non-technical maintainer can add a new species and push changes that trigger a successful deploy.
  2. A push to `main` triggers a GitHub Actions workflow that builds and deploys the site without manual intervention.
  3. The full build — data import, Eleventy, Pagefind, validation — completes in under 5 minutes on a standard GitHub Actions runner.
  4. Running `docker build` followed by the build command produces output identical to the CI workflow; a maintainer can reproduce the production build locally using Docker without installing Node.js or DuckDB manually.
**Plans**: 2 plans
Plans:
- [ ] 02-01-PLAN.md — Data model extensions, base layout, species factsheet template
- [ ] 02-02-PLAN.md — Browse pages (all-species and per-genus) with stub pages
**UI hint**: no

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline Foundation | 0/2 | Planned | - |
| 2. Species Factsheet (Static) | 0/? | Not started | - |
| 3. Client-side Interactivity | 0/? | Not started | - |
| 4. Search, Glossary, and Validation | 0/? | Not started | - |
| 5. Maintainability | 0/? | Not started | - |

## Requirements Coverage

All 32 v1 requirements mapped. No orphans.

| Requirement | Phase |
|-------------|-------|
| DATA-01 | Phase 1 |
| DATA-02 | Phase 1 |
| DATA-03 | Phase 1 |
| DATA-04 | Phase 1 |
| DATA-05 | Phase 1 |
| DATA-06 | Phase 1 |
| SPEC-01 | Phase 1 |
| SPEC-05 | Phase 1 |
| SPEC-02 | Phase 2 |
| SPEC-03 | Phase 2 |
| SPEC-04 | Phase 2 |
| BRWS-01 | Phase 2 |
| BRWS-02 | Phase 2 |
| BRWS-03 | Phase 2 |
| INTV-01 | Phase 3 |
| INTV-02 | Phase 3 |
| INTV-03 | Phase 3 |
| INTV-04 | Phase 3 |
| INTV-05 | Phase 3 |
| INTV-06 | Phase 3 |
| SRCH-01 | Phase 4 |
| SRCH-02 | Phase 4 |
| SRCH-03 | Phase 4 |
| SRCH-04 | Phase 4 |
| GLOS-01 | Phase 4 |
| VALD-01 | Phase 4 |
| VALD-02 | Phase 4 |
| VALD-03 | Phase 4 |
| MAINT-01 | Phase 5 |
| MAINT-02 | Phase 5 |
| MAINT-03 | Phase 5 |
| MAINT-04 | Phase 5 |

---
*Roadmap created: 2026-04-11*
