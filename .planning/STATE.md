---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Tech Debt
status: In progress
stopped_at: Defining requirements
last_updated: "2026-04-18T00:00:00.000Z"
last_activity: 2026-04-18
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-18 for v1.2 milestone)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** v1.2 Tech Debt — fix WR-01 through WR-04

## Current Status

Milestone v1.2 (Tech Debt) started. Defining requirements.

[░░░░░░░░░░░░░░░░░░░░] 0/? phases complete

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-18 — Milestone v1.2 started

## Accumulated Context

- v1.0 MVP: CSV → DuckDB → Parquet pipeline, ~700 species pages, Lit components, Pagefind search, CI/CD
- v1.1 Visual Identity: cream/black/moth-strip, slug-based foreign keys, devcontainer, Copilot instructions
- Tech debt items WR-01–04 deferred from v1.1 — all targeted for v1.2

## Open Tech Debt (being addressed this milestone)

- ⚠️ WR-01: `image_filename` in glossary.csv not validated against safe-filename pattern
- ⚠️ WR-02: Pagefind `<link>` stylesheet in search page body instead of `<head>` (FOUC)
- ⚠️ WR-03: DuckDB instance not closed in glossary.js (resource leak)
- ⚠️ WR-04: Missing ENOENT guard in check-page-weight.js

## Next Action

Run `/gsd-plan-phase [N]` after roadmap is created.
