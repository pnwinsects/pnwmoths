# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-04-12) — [archive](.planning/milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Visual Identity** — Phase 6 (shipped 2026-04-18) — [archive](.planning/milestones/v1.1-ROADMAP.md)
- **v1.2 Tech Debt** — Phase 7 (in progress)

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

- [x] **Phase 7: Code Quality Fixes** — Patch all deferred tech debt: filename validation, resource leak, crash guard, FOUC fix

## Phase Details

### Phase 7: Code Quality Fixes
**Goal**: All four deferred code-quality defects from v1.1 are resolved — the build is safer, the search page loads without a flash, and validation scripts are robust
**Depends on**: Phase 6 (v1.1 completed)
**Requirements**: WR-01, WR-02, WR-03, WR-04
**Success Criteria** (what must be TRUE):
  1. Running the build with an invalid `image_filename` value in glossary.csv causes an explicit error before the build proceeds
  2. The search page loads with Pagefind styles applied from the first paint (no unstyled flash)
  3. The glossary.js data loader exits cleanly without leaving a DuckDB connection open (no resource warning in build output)
  4. Running `check-page-weight.js` against a missing file path logs a warning instead of throwing an unhandled exception
**Plans**: 1 plan

Plans:
- [x] 07-01-PLAN.md — Add WR-01/WR-04 regression tests, wire check-page-weight.test.js into npm test, mark all four WR items done

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

---
*Roadmap created: 2026-04-11 | v1.0 archived: 2026-04-12 | v1.1 archived: 2026-04-18 | v1.2 started: 2026-04-18*

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
