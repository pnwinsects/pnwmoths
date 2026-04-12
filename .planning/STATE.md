---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to plan
stopped_at: Phase 3 UI-SPEC approved
last_updated: "2026-04-12T15:41:43.854Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Phase 2 — Species Factsheet (Static)

## Current Status

Phase 1 complete. Ready to plan Phase 2.

[████░░░░░░░░░░░░░░░░] 2/2 plans (Phase 1 of 5 complete)

## Phase Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | Data Pipeline Foundation | Complete (2026-04-12) |
| 2 | Species Factsheet (Static) | Ready to plan |
| 3 | Client-side Interactivity | Not started |
| 4 | Search, Glossary, and Validation | Not started |
| 5 | Maintainability | Not started |

## Accumulated Context

### Decisions

- DuckDB `@duckdb/node-api` API shape: use `.getRowObjectsJS()` not `.rows`, `closeSync()` not `conn.close()`
- Eleventy passthrough copy: `addPassthroughCopy({ "data/parquet": "species" })` routes Parquet files to `_site/species/{slug}/`
- Slug convention: `(genus + '-' + species).toLowerCase()` — alphanumeric-only validated
- ESM-first: `package.json type:module`, `import.meta.url` guard for direct execution

### Blockers/Concerns

- ⚠️ Code review CR-01: `outDir` SQL interpolation in `scripts/build-data.js` — slug validated but not structurally safe
- ⚠️ Code review CR-02: `sp.id` BigInt stringification may produce invalid SQL (`1n`)
- ⚠️ HUMAN-UAT: Clean-checkout build not yet confirmed by human

## Session Continuity

Last session: 2026-04-12T04:05:19.706Z
Stopped at: Phase 3 UI-SPEC approved
Resume file: .planning/phases/03-client-side-interactivity/03-UI-SPEC.md

## Next Action

Run `/gsd-discuss-phase 2` to gather context, or `/gsd-plan-phase 2` to plan directly.
