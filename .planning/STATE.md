---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Image CDN
status: Planning
stopped_at: ~
last_updated: "2026-04-21T00:00:00Z"
last_activity: 2026-04-21
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20 for v1.3 milestone)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Planning next milestone

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-21 — Milestone v1.4 started

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 15 (across v1.0–v1.2)
- Average duration: unknown
- Total execution time: unknown

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1.0–v1.2 | 15 | - | - |
| 11-01 | 1 | 91s | 91s |
| 11-02 | 1 | 78s | 78s |
| 11-03 | 2 | 47s | 47s |

**Recent Trend:**
- v1.3: in progress
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.3 research: Use JSON (not Parquet) for species-×-state distribution file — at 700 species × ~6 states, ~4,200 pairs fits in ~20–30 KB; hyparquet overhead not justified
- v1.3 research: Lit accordion must use light DOM (`createRenderRoot() { return this; }`) — Pico CSS element selectors don't penetrate shadow DOM; decide at creation, not retrofit
- v1.3 research: DuckDB `nullstr = ''` required on both read_csv calls — blank subfamily must arrive as null, not empty string, to avoid silent grouping failures
- Phase 11 UAT: No subfamily data in species.csv — subfamily column blank for all species; component handles correctly by flattening genera under family
- Phase 11 UAT: Vite HTML transformer double-prefixes asset URLs when Eleventy `| url` filter has already added pathPrefix — pattern is to use raw `/images/...` paths and let Vite add base

### Pending Todos

None.

### Blockers/Concerns

- Phase 8: Vite version mismatch — package.json specifies `^8.0.8` but `7.3.2` is installed; resolve with `npm install` before starting Phase 8
- Phase 12: Confirm link checker tool and invocation before planning

## Deferred Items

Items acknowledged and carried forward from v1.2 close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Tech debt | MAINT-03: build time under 5 min unverified | Carry forward | v1.2 |
| Tech debt | No automated visual regression tests | Carry forward | v1.2 |
| Tech debt | WR-01–03: test cleanup paths could be more robust | Carry forward | v1.2 |

## Session Continuity

Last session: 2026-04-20
Stopped at: Phase 11 complete — ready to discuss/plan Phase 12
Resume file: .planning/phases/11-accordion-component/11-UAT.md
