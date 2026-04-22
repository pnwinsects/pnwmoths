# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-04-12) — [archive](.planning/milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Visual Identity** — Phase 6 (shipped 2026-04-18) — [archive](.planning/milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Tech Debt** — Phase 7 (shipped 2026-04-18) — [archive](.planning/milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Visual Browse** — Phases 8–12 (shipped 2026-04-20) — [archive](.planning/milestones/v1.3-ROADMAP.md)
- 🔧 **v1.4 Image CDN** — Phases 13–16 (active)

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

**v1.4 Image CDN (Phases 13–16):**

**Milestone Goal:** Migrate image storage from Git LFS to bunny.net object storage with CDN-native on-the-fly resizing; remove build-time resize scripts and LFS from the repo.

- [ ] **Phase 13: CDN Provisioning** - Create bunny.net Storage + Pull Zone; upload images; configure Optimizer; wire GitHub secret; document upload workflow
- [ ] **Phase 14: Template Migration** - Wire `CDN_BASE_URL` into Eleventy; update all templates and `pnwm-taxon-browser.js` to construct CDN URLs
- [ ] **Phase 15: LFS Removal** - Rewrite git history to purge `images/`; clean `.gitattributes`; replace LFS checkout in CI
- [ ] **Phase 16: Build Pipeline Cleanup** - Remove species photo copy block from `copy-images.js`; retire build-time image resize scripts
- [ ] **Phase 17: Migrate Full Species Data from Legacy Database** - Extract species accounts, taxonomy, and occurrence records from legacy pnwinsects-app MySQL database; replace placeholder CSV data with full production dataset

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
  1. `/browse/` loads and contains a `<pnwm-taxon-browser>` element; taxonomy tree embedded as `<script type="application/json" id="taxon-data">` sibling (per D-01, overrides SC-1 data-taxonomy wording)
  2. With JavaScript disabled, all families, genera, and species are visible as plain HTML in a `<noscript>` block
  3. Per-genus static pages (`/browse/{genus}/`) no longer exist in `_site/`; the link checker reports no broken internal links pointing to them
**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md — Rewrite browse/index.njk, delete genus.njk and families.js, verify build

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
**Plans**: 3 plans

Plans:
- [x] 11-01-PLAN.md — Test scaffold: unit tests for buildStateMap, taxonHasState, collectSlugs (Wave 0)
- [x] 11-02-PLAN.md — Implement pnwm-taxon-browser.js — full Lit accordion component
- [x] 11-03-PLAN.md — Wire component in main.js + build verification

### Phase 12: Validation
**Goal**: A clean production build with all outputs present and tests passing
**Depends on**: Phase 11
**Requirements**: (none — validation phase)
**Success Criteria** (what must be TRUE):
  1. `npm run build` completes without errors; `_site/species-states.json` is present in the output
  2. The link checker reports zero broken links across the built site
  3. `npm test` passes with all existing and new tests green
  4. Pagefind does not index the taxonomy JSON data attribute (no `data-pagefind-ignore` omission)
**Plans**: 1 plan

Plans:
- [x] 12-01-PLAN.md — Commit UAT polish, run verification checklist, update planning docs

### Phase 13: CDN Provisioning
**Goal**: Images are served from bunny.net CDN with the Optimizer active; collaborators have a documented workflow to upload originals; GitHub Actions has the CDN secret
**Depends on**: Nothing (first phase of v1.4)
**Requirements**: CDN-01, CDN-02, CDN-03, CDN-04
**Success Criteria** (what must be TRUE):
  1. A browser request to `{CDN_BASE_URL}/{slug}/{filename}` returns a 200 with `Content-Type: image/webp` and the expected pixel dimensions (Bunny Optimizer active)
  2. A browser request using an Image Class (glossary portrait crop, nav thumbnail) returns correct dimensions without width/height HTML attributes
  3. `CDN_BASE_URL` is set as a secret in the GitHub Actions repository settings; the deploy workflow can read it as an environment variable
  4. `_instructions/` contains a contributor-facing doc covering rclone FTP setup, `rclone copy` (not `sync`) for uploads, `--ignore-times` for replacements, and how to trigger cache invalidation
**UI hint**: no
**Plans**: 5 plans

Plans:
- [x] 13-01-PLAN.md — Add CDN_BASE_URL constant to eleventy.config.js; widen build-data.js filename regex
- [ ] 13-02-PLAN.md — Write migrate-images.js migration script; rebuild data/images.csv
- [ ] 13-03-PLAN.md — bunny.net dashboard setup, Optimizer, Image Classes, image upload (human-assisted)
- [ ] 13-04-PLAN.md — Write _instructions/UPLOADING_IMAGES.md; CDN delivery spot-check (task 2 superseded)
- [ ] 13-05-PLAN.md — Update CONTEXT.md (D-10/D-11/D-18 Image Classes disable), commit outstanding artifacts, CDN spot-check

### Phase 14: Template Migration
**Goal**: Every image URL in the built site resolves through the CDN; the Eleventy build fails fast when `CDN_BASE_URL` is absent in production
**Depends on**: Phase 13
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05, TMPL-06
**Success Criteria** (what must be TRUE):
  1. Running `GITHUB_PAGES=true npm run build` without `CDN_BASE_URL` set exits with a clear error message and non-zero exit code
  2. All species factsheet pages contain `<img src="https://...">` CDN URLs (no `/images/` relative paths) for species photos
  3. All glossary portrait `<img>` tags use CDN URLs; the `| url` filter is absent from glossary image path expressions
  4. The `<pnwm-taxon-browser>` element on `/browse/` receives a `cdn-base-url` attribute; image URLs constructed by the component in the browser resolve correctly via CDN
  5. Species photo and glossary portrait `<img>` tags include a `srcset` with a 2× width descriptor pointing to the CDN
**UI hint**: yes
**Plans**: TBD

### Phase 15: LFS Removal
**Goal**: Git history contains no LFS pointers or `images/` blobs; CI no longer performs an LFS checkout
**Depends on**: Phase 13
**Requirements**: LFS-01, LFS-02
**Success Criteria** (what must be TRUE):
  1. `git lfs ls-files` returns no tracked files; `.gitattributes` contains no `filter=lfs` lines
  2. A fresh `git clone` of the repository succeeds without `git lfs pull` and produces a working directory with no `images/` directory
  3. Both `deploy.yml` and `pr-check.yml` use plain `actions/checkout@v4` with no LFS-related options or steps
**UI hint**: no
**Plans**: TBD

### Phase 16: Build Pipeline Cleanup
**Goal**: The build pipeline contains no image-copy or resize logic for species photos; CI builds cleanly using CDN URLs throughout
**Depends on**: Phase 14, Phase 15
**Requirements**: PIPE-01, PIPE-02
**Success Criteria** (what must be TRUE):
  1. `scripts/copy-images.js` contains no species photo copy block; the banner, Pico CSS, and OSD asset copies remain and function correctly
  2. No build-time image resize scripts exist in `scripts/`; `npm run build` completes without executing any image transformation step
  3. A full GitHub Actions deploy run (using the real `CDN_BASE_URL` secret) completes successfully and the deployed site loads species images from the CDN
**UI hint**: no
**Plans**: TBD

### Phase 17: Migrate Full Species Data from Legacy Database
**Goal**: All species, taxonomy, and occurrence records from the legacy pnwinsects-app MySQL database are loaded into the static site's CSV data files, replacing placeholder data with the full production dataset
**Depends on**: Phase 1 (data pipeline)
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. `species.csv` contains all species from the legacy database (not just sample data)
  2. `records.csv` contains occurrence records with the same filtering applied as the legacy site
  3. `npm run build` completes without errors with the full dataset
  4. `npm test` passes
**Plans**: 3 plans

Plans:
- [x] 17-01-PLAN.md — Test scaffold: failing smoke tests for species.csv and records.csv output
- [x] 17-02-PLAN.md — Write migrate-species.js migration script; run migration
- [x] 17-03-PLAN.md — Fix test suite for full dataset; verify npm run build

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
| 13. CDN Provisioning | v1.4 | 1/4 | In progress | - |
| 14. Template Migration | v1.4 | 0/? | Not started | - |
| 15. LFS Removal | v1.4 | 0/? | Not started | - |
| 16. Build Pipeline Cleanup | v1.4 | 0/? | Not started | - |
| 17. Migrate Full Species Data from Legacy Database | v1.4 | 3/3 | Complete | 2026-04-22 |

---
*Roadmap created: 2026-04-11 | v1.0 archived: 2026-04-12 | v1.1 archived: 2026-04-18 | v1.2 archived: 2026-04-18 | v1.3 archived: 2026-04-20 | v1.4 started: 2026-04-21*

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
