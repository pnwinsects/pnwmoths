---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Tech Debt
status: Phase complete
stopped_at: Phase 7 Plan 01 complete — all WR items done
last_updated: "2026-04-18T17:29:26Z"
last_activity: 2026-04-18
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-18 for v1.2 milestone)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** v1.2 Tech Debt — COMPLETE

## Current Status

Milestone v1.2 (Tech Debt) — Phase 7 complete. All four WR items resolved and tested.

[████████████████████] 1/1 phases complete

## Current Position

Phase: 7 — Code Quality Fixes
Plan: 01 (complete)
Status: Complete
Last activity: 2026-04-18 — Phase 7 Plan 01 executed

## Accumulated Context

- v1.0 MVP: CSV → DuckDB → Parquet pipeline, ~700 species pages, Lit components, Pagefind search, CI/CD
- v1.1 Visual Identity: cream/black/moth-strip, slug-based foreign keys, devcontainer, Copilot instructions
- v1.2 Tech Debt: WR-01–04 all fixed (Phase 4) and regression-tested (Phase 7); npm test now covers check-page-weight.js

## Tech Debt Status

- ✅ WR-01: `image_filename` in glossary.csv validated against safe-filename pattern — fix(04) + test(07-01)
- ✅ WR-02: Pagefind `<link>` stylesheet moved to `<head>` in base.njk — fix(04) confirmed
- ✅ WR-03: DuckDB connection closed in glossary.js — fix(04) confirmed
- ✅ WR-04: ENOENT guard added in check-page-weight.js — fix(04) + test(07-01)

## Decisions

- Use wrapper .mjs pattern for WR-01 glossary integration test (same as existing bad-CSV test) — allows process.chdir isolation
- Do not assert exit code 0 for WR-04 test — exit 1 for missing SITE_DIR is correct behavior

## Next Action

v1.2 milestone complete. Run `/gsd-complete-milestone` to archive and plan v1.3.
