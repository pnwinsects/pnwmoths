---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Image CDN
status: Executing
stopped_at: Phase 15 Plan 01 complete — history rewrite done; Plan 02 (CI update) next
last_updated: "2026-04-22T22:04:00Z"
last_activity: 2026-04-22
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 11
  completed_plans: 8
  percent: 45
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21 for v1.4 milestone)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Phase 14 complete — all image URLs migrated to CDN; templates updated

## Current Position

Phase: 15 — LFS Removal
Plan: 01 complete — Plan 02 (CI workflow update) next
Status: Plan 01 complete — history rewritten, force-pushed, working copy reset
Last activity: 2026-04-22 — Phase 15 Plan 01 complete — LFS history purged (16,191 files → 0), force-pushed, npm test 72/72

Progress: [████______] 40%

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
- v1.4 research: GitHub will not free LFS storage quota until repo is deleted and recreated — accept billing for now (Out of Scope)
- v1.3 decision (carry): `rclone sync` deletes production bucket files — always use `rclone copy`; `sync` only with mandatory `--dry-run` first
- v1.3 decision (carry): Raw `/images/...` paths in templates (not `| url` filter) — Vite HTML transformer double-prefixes asset URLs when Eleventy `| url` filter has already added pathPrefix

### Roadmap Evolution

- Phase 17 added: Migrate Full Species Data from Legacy Database

### Pending Todos

None.

### Blockers/Concerns

- LFS-01: RESOLVED — force-push complete; fresh clone verified clean
- PIPE-02: Confirm which scripts constitute "build-time image resize scripts" before planning (may include logic in `scripts/build-data.js` — unconfirmed by research)
- lychee: CDN image 404s are invisible to CI (lychee excludes image extensions) — add CDN hostname exclusion to `lychee.toml` and manually spot-check image URLs post-deploy

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Tech debt | MAINT-03: build time under 5 min unverified | Carry forward | v1.2 |
| Tech debt | No automated visual regression tests | Carry forward | v1.2 |
| Tech debt | WR-01–03: test cleanup paths could be more robust | Carry forward | v1.2 |
| CDN | GitHub LFS storage quota reclaim | Accept billing; out of scope | v1.4 |

## Session Continuity

Last session: 2026-04-22
Stopped at: Phase 15 Plan 01 complete — LFS history rewritten, force-pushed, working copy reset; next: Phase 15 Plan 02 (CI workflow update)
Resume file: .planning/phases/15-lfs-removal/15-02-PLAN.md
