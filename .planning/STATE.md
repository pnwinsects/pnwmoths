---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Glossary Tooltips
status: In progress
stopped_at: ~
last_updated: "2026-04-23T00:00:00Z"
last_activity: 2026-04-23
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23 after v1.4 milestone)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** v2.0 Glossary Tooltips — Phase 20: Popover UI — HTML and CSS

## Current Position

Phase: 20 (Popover UI — HTML and CSS)
Plan: —
Status: Context gathered — ready to plan
Last activity: 2026-04-23 — Phase 20 context captured (Popover API rewrite, Phase 21 folded in)

Progress: [███░░░░░░░] 33%

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
- v1.4: shipped 2026-04-22
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v2.0 research: Use `node-html-parser` (not JSDOM/cheerio) for build-time text-node traversal — ~10x faster, zero native dependencies, sufficient API
- v2.0 research: Load glossary.csv via `csv-parse` (already a project dependency) at Eleventy startup — not via DuckDB, to avoid a second DuckDB lifecycle
- v2.0 research: Initialize `seen` Set inside the transform callback per invocation, never at module scope — shared state causes silent first-occurrence failures across pages
- v2.0 research: Use `node-html-parser` querySelectorAll + text-node walk, never regex on raw HTML string — regex on raw HTML corrupts attributes silently
- v2.0 research: Sort glossary terms longest-first before matching — prevents partial matches ("forewing" consumed before "wing")
- v2.0 research: Use `escapeRegex` on all terms before constructing RegExp — terms like `1A+2A`, `W-mark`, `CuA1` break match patterns without escaping
- v2.0 research: Use Popover API (browser-native, Baseline April 2025) — no external tooltip library needed
- v2.0 research: Definition text lives in `data-definition` attribute on `<abbr>`, not in DOM — keeps it out of Pagefind index; popover `<span>` materialized only at runtime via JS
- v1.4 research: rclone via FTP is the only viable upload tool — bunny.net S3 compatibility is in closed preview (not GA as of April 2026)
- v1.4 research: `CDN_BASE_URL` must be the Pull Zone URL (`{zone}.b-cdn.net`), NOT the Storage Zone URL (`storage.bunnycdn.com`)
- v1.3 decision (carry): Raw `/images/...` paths in templates (not `| url` filter) — Vite HTML transformer double-prefixes asset URLs when Eleventy `| url` filter has already added pathPrefix

### Roadmap Evolution

- Phase 19 added: Build-time Glossary Transform (v2.0)
- Phase 20 added: Popover UI — HTML and CSS (v2.0)
- Phase 21 added: JS Hover Enhancement and Glossary Images (v2.0)

### Pending Todos

- Fix close button on the lightbox (`2026-04-23-fix-close-button-on-lightbox.md`)

### Blockers/Concerns

None.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Tech debt | MAINT-03: build time under 5 min unverified | Carry forward — Phase 19 should benchmark transform cost against this target | v1.2 |
| Tech debt | No automated visual regression tests | Carry forward | v1.2 |
| Tech debt | WR-01–03: test cleanup paths could be more robust | Carry forward | v1.2 |
| CDN | GitHub LFS storage quota reclaim | Accept billing; out of scope | v1.4 |
| CDN | WebP not yet active on bunny.net Optimizer (serving JPEG) | Deferred | v1.4 |

## Session Continuity

Last session: 2026-04-23
Stopped at: Roadmap created for v2.0 (Phases 19–21); REQUIREMENTS.md traceability updated
Resume file: none
