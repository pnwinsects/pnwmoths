---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Glossary Tooltips
status: In progress
stopped_at: ~
last_updated: "2026-04-23T00:00:00Z"
last_activity: 2026-04-23
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23 after v1.4 milestone)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** v1.4 complete — all phases shipped, full production dataset live; ready for /gsd-new-milestone

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-23 — Milestone v2.0 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 15 (across v1.0–v1.2), 10 (v1.3)
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
- v1.3: shipped 2026-04-20
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.4 research: rclone via FTP is the only viable upload tool — bunny.net S3 compatibility is in closed preview (not GA as of April 2026)
- v1.4 research: Enable Bunny Optimizer on Pull Zone BEFORE removing build-time resize scripts; verify in browser network tab first
- v1.4 research: `CDN_BASE_URL` must be the Pull Zone URL (`{zone}.b-cdn.net`), NOT the Storage Zone URL (`storage.bunnycdn.com`)
- v1.4 research: `| url` filter must be stripped from glossary image path expressions before adopting CDN URLs (filter corrupts absolute URLs)
- v1.4 research: `pnwm-taxon-browser.js` has multiple image src construction sites — grep for `this._prefix` + `"images/"` before writing replacement
- v1.4 decision (Phase 15 discuss): LFS history rewrite uses `git filter-repo --invert-paths` ALONE — skip `git lfs migrate export` (would download ~16k images just to delete them; pointer files are 130-byte text, no download needed)
- v1.4 decision (Phase 15 execution): Clone from LOCAL repo (not GitHub remote) when local commits are ahead — avoids losing unpushed work on force-push
- v1.4 decision (Phase 15 execution): No `lfs: false` option in actions/checkout — default is already false; adding it is noise
- v1.4 research: GitHub will not free LFS storage quota until repo is deleted and recreated — accept billing for now (Out of Scope)
- v1.3 decision (carry): `rclone sync` deletes production bucket files — always use `rclone copy`; `sync` only with mandatory `--dry-run` first
- v1.3 decision (carry): Raw `/images/...` paths in templates (not `| url` filter) — Vite HTML transformer double-prefixes asset URLs when Eleventy `| url` filter has already added pathPrefix

### Roadmap Evolution

- Phase 17 added: Migrate Full Species Data from Legacy Database
- Phase 18 added: Plates CDN Migration (prod regression fix — plates/ git-ignored after LFS removal, "No plates available" in production)

### Pending Todos

None.

### Blockers/Concerns

- PIPE-02: Resolved — Phase 16 Plan 01 confirmed no resize scripts exist anywhere in scripts/ or package.json
- lychee: PRs that modify `data/images.csv` or `data/glossary.csv` now check new CDN image URLs via tj-actions/changed-files; images not in those files (e.g. template-constructed URLs) still require manual spot-check post-deploy

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Tech debt | MAINT-03: build time under 5 min unverified | Carry forward | v1.2 |
| Tech debt | No automated visual regression tests | Carry forward | v1.2 |
| Tech debt | WR-01–03: test cleanup paths could be more robust | Carry forward | v1.2 |
| CDN | GitHub LFS storage quota reclaim | Accept billing; out of scope | v1.4 |

Items acknowledged at v1.4 milestone close on 2026-04-23:

| Category | Item | Status |
|----------|------|--------|
| uat_gap | Phase 13: 13-HUMAN-UAT.md partial (0 pending scenarios) | acknowledged — human browser spot-check done |
| verification_gap | Phase 13: 13-VERIFICATION.md human_needed (Optimizer pixel dimensions) | acknowledged — browser checks confirmed |
| verification_gap | Phase 16: 16-VERIFICATION.md human_needed (CI deploy + CDN in browser) | acknowledged — push to main done, CI green, CDN images verified |
| quick_task | 260420-a1k-browse-species-cards-and-tree-nav missing | acknowledged — abandoned task, not actioned |

## Session Continuity

Last session: 2026-04-22
Stopped at: Phase 16 Plan 01 complete (27767a0); scripts/copy-images.js cleaned; build verified; CI deploy checkpoint auto-approved — push to main when ready
Resume file: none
