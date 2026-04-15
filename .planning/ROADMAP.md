# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-04-12) — [archive](.planning/milestones/v1.0-ROADMAP.md)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–5) — SHIPPED 2026-04-12</summary>

- [x] Phase 1: Data Pipeline Foundation (2/2 plans) — completed 2026-04-12
- [x] Phase 2: Species Factsheet (Static) (2/2 plans) — completed 2026-04-12
- [x] Phase 3: Client-side Interactivity (2/2 plans) — completed 2026-04-12
- [x] Phase 4: Search, Glossary, and Validation (3/3 plans) — completed 2026-04-12
- [x] Phase 5: Maintainability (3/3 plans) — completed 2026-04-12

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Pipeline Foundation | v1.0 | 2/2 | Complete | 2026-04-12 |
| 2. Species Factsheet (Static) | v1.0 | 2/2 | Complete | 2026-04-12 |
| 3. Client-side Interactivity | v1.0 | 2/2 | Complete | 2026-04-12 |
| 4. Search, Glossary, and Validation | v1.0 | 3/3 | Complete | 2026-04-12 |
| 5. Maintainability | v1.0 | 3/3 | Complete | 2026-04-12 |

### Phase 6: Make pages look like existing pnwmoths site — layout, colors, banner image

**Goal:** Apply the visual identity of pnwmoths.biol.wwu.edu to every page: cream background, black header/footer, moth-strip banner image, Google Fonts (Open Sans + Spinnaker), white content wrapper with box-shadow, and updated homepage content.
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 2 plans

Plans:
- [ ] 06-01-PLAN.md — Create theme.css, download banner image, add Eleventy passthrough rules
- [ ] 06-02-PLAN.md — Update base.njk layout and homepage content, visual verification

---
*Roadmap created: 2026-04-11 | v1.0 archived: 2026-04-12*

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
