# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-04-12) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Visual Identity** — Phase 6 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Tech Debt** — Phase 7 (shipped 2026-04-18) — [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Visual Browse** — Phases 8–12 (shipped 2026-04-20) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Image CDN** — Phases 13–17 (shipped 2026-04-22) — [archive](milestones/v1.4-ROADMAP.md)

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

## Active Phases

### Phase 18: Plates CDN Migration

**Goal:** Restore the photographic plates feature in production by migrating Zoomify tile data to bunny.net CDN. Phase 15 removed `plates/` from Git LFS and added it to `.gitignore`, leaving production with no tile source and "No plates available" on the plates index.

**Depends on:** Phase 13 (CDN Provisioning), Phase 15 (LFS Removal)

**Plans:** 2 plans

Plans:
- [ ] 18-01-PLAN.md — Commit data/plates.json manifest, update plates.js + templates to CDN URLs, write upload-plates.js
- [ ] 18-02-PLAN.md — Run one-time CDN upload, verify tile delivery and browser plate viewer

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
| 18. Plates CDN Migration | — | 0/2 | Ready to execute | — |

---
*Roadmap created: 2026-04-11 | v1.0 archived: 2026-04-12 | v1.1 archived: 2026-04-18 | v1.2 archived: 2026-04-18 | v1.3 archived: 2026-04-20 | v1.4 archived: 2026-04-23*

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
