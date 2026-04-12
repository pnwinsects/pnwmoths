---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 4 complete
stopped_at: Phase 4 verified — 8/8 must-haves passed
last_updated: "2026-04-12T00:00:00.000Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 14
  completed_plans: 14
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Phase 5 — Maintainability

## Current Status

Phase 4 complete. Ready to plan Phase 5.

[████████████████░░░░] 4/5 phases complete

## Phase Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | Data Pipeline Foundation | Complete (2026-04-12) |
| 2 | Species Factsheet (Static) | Complete (2026-04-12) |
| 3 | Client-side Interactivity | Complete (2026-04-12) |
| 4 | Search, Glossary, and Validation | Complete (2026-04-12) |
| 5 | Maintainability | Not started |

## Accumulated Context

### Decisions

- DuckDB `@duckdb/node-api` API shape: use `.getRowObjectsJS()` not `.rows`, `closeSync()` not `conn.close()`
- Eleventy passthrough copy: `addPassthroughCopy({ "data/parquet": "species" })` routes Parquet files to `_site/species/{slug}/`
- Slug convention: `(genus + '-' + species).toLowerCase()` — alphanumeric-only validated
- ESM-first: `package.json type:module`, `import.meta.url` guard for direct execution
- Pagefind UI widget styled via Pico CSS custom property mappings (no custom CSS file)
- Glossary keyed by first letter (object, not array) for `for letter, terms in glossary` Nunjucks pattern
- `/browse/` page genus/family listings appear in search results — expected, genus names legitimately match species queries

### Open Issues (from code review WR-01–WR-04)

- ⚠️ WR-01: `image_filename` in glossary.csv not validated against safe-filename pattern
- ⚠️ WR-02: Pagefind `<link>` stylesheet in search page body instead of `<head>` (FOUC)
- ⚠️ WR-03: DuckDB instance not closed in glossary.js (resource leak)
- ⚠️ WR-04: Missing ENOENT guard in check-page-weight.js

## Session Continuity

Last session: 2026-04-12
Stopped at: Phase 4 verified

## Next Action

Run `/gsd-plan-phase 5` to plan the Maintainability phase.
