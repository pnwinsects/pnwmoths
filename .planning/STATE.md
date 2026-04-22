---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Image CDN
status: Executing
stopped_at: Phase 15 complete — both plans done; Phase 16 (Build Pipeline Cleanup) next
last_updated: "2026-04-22T22:06:05Z"
last_activity: 2026-04-22
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 11
  completed_plans: 9
  percent: 55
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22 after Phase 15)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Phase 15 complete — LFS fully removed from history and CI; ready for Phase 16 (Build Pipeline Cleanup)

## Current Position

Phase: 15 — LFS Removal (complete)
Plan: 02 complete — Phase 15 done; Phase 16 (Build Pipeline Cleanup) next
Status: Phase 15 complete — LFS fully removed from history and CI; all success criteria verified
Last activity: 2026-04-22 — Phase 15 Plan 02 complete — CI workflows updated to actions/checkout@v4.3.1; fresh clone verified clean; npm test 72/72

Progress: [██████____] 60%

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

### Pending Todos

None.

### Blockers/Concerns

- PIPE-02: Confirm which scripts constitute "build-time image resize scripts" before planning Phase 16 (may include logic in `scripts/build-data.js` — unconfirmed by research)
- lychee: PRs that modify `data/images.csv` or `data/glossary.csv` now check new CDN image URLs via tj-actions/changed-files; images not in those files (e.g. template-constructed URLs) still require manual spot-check post-deploy

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
Stopped at: Phase 15 UAT complete (5/5 passed); code review fixes applied (WR-01–03); PR image URL checking added; ready for Phase 16
Resume file: none
