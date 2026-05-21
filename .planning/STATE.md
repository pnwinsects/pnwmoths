---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: High-resolution species photos
status: "Roadmap defined; Phase 26 awaiting `/gsd:plan-phase 26`"
stopped_at: Phase 26 context gathered
last_updated: "2026-05-21T16:11:43.714Z"
last_activity: 2026-05-21 — v2.2 roadmap created (6 phases, 24 requirements mapped)
progress:
  total_phases: 13
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21 — milestone v2.2 started)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Milestone v2.2 — High-resolution species photos. Roadmap defined (Phases 26–31); awaiting Phase 26 planning.

## Current Position

Phase: 26 — Dropbox Ingest, Filename Parser, and Manifest (not started)
Plan: —
Status: Roadmap defined; Phase 26 awaiting `/gsd:plan-phase 26`
Last activity: 2026-05-21 — v2.2 roadmap created (6 phases, 24 requirements mapped)

## Performance Metrics

**Velocity:**

- Total plans completed: 15 (across v1.0–v1.2), 10 (v1.3), 13 (v1.4), 5 (v2.0), 5 (v2.1) = 48 total
- Average duration: unknown
- Total execution time: unknown

**By Milestone:**

| Milestone | Phases | Plans | Shipped |
|-----------|--------|-------|---------|
| v1.0–v1.2 | 7 | 15 | 2026-04-18 |
| v1.3 | 5 | 10 | 2026-04-20 |
| v1.4 | 5 | 13 | 2026-04-22 |
| v2.0 | 3 | 5 | 2026-04-23 |
| v2.1 | 4 | 5 | 2026-05-20 |
| v2.2 | 6 (planned) | TBD | in flight |

**Recent Trend:**

- v2.1: shipped 2026-05-20 (4 phases, 5 plans, 64 commits, 23 days)
- v2.2: kicked off 2026-05-21 (6 phases planned, server-side pipeline + viewer work)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v2.2 locked (exploration): Local manifest (SQLite/JSON) is source of truth — durable per-image status; survives restarts; seeds `data/species-photos.json`
- v2.2 locked (exploration): Dropbox is a superset; match → replace existing low-res; unmatched → manual investigation (no auto-drop)
- v2.2 locked (exploration): Folder layout flat with encoded filenames — convention `Genus species-{specimen}-{view}.{ext}` (same as Phase 13 photos)
- v2.2 locked (exploration): OpenSeadragon replaces the Phase 23 lightbox host when high-res is available; carousel unchanged
- v2.2 spike 001 (VALIDATED): 5,000 TIFFs / 204.6 GB; 77.5% clean match; 93.2% species coverage; ~30–80 unique unresolved binomials need curation; 100% TIFF source; ~1 TB tile output expected
- v2.2 spike 001: Parser extensions required — 2-char epithets (`ni`, `ou`), hyphenated epithets (`v-alba`, `c-nigrum`), `Genus-species` hyphen, `OSAC_*`/`WWUC*` accession IDs, provisional bucket for `n sp`/`sp`/`nr` patterns
- v2.2 spike 001: Manifest carries `specimen_id`, `view` (D/V), `binomial_raw`, `binomial_resolved`, `match_bucket`, `species_slug`, `dropbox_path`, `content_hash`, `size`, `server_modified`, `status`
- v2.1 Phase 24 (carry): Phenology chart always stays in the DOM with zero-height bars rather than being conditionally removed
- v2.1 Phase 24 (carry): Elevation slider uses String() coercion on .value binding to prevent Lit from treating Number as a Lit property

### Roadmap Evolution

- Phase 19 added: Build-time Glossary Transform (v2.0)
- Phase 20 added: Popover UI — HTML and CSS (v2.0)
- Phase 21 added: JS Hover Enhancement and Glossary Images (v2.0)
- Phase 22 added: Phenology Chart Improvements (v2.1)
- Phase 23 added: Photo Thumbnail Carousel (v2.1)
- Phase 24 added: County, Collection, and Elevation Filters (v2.1)
- Phase 25 added: Similar Species Thumbnails (v2.1)
- Phase 26 added: Dropbox Ingest, Filename Parser, and Manifest (v2.2)
- Phase 27 added: Synonym Curation Pass (v2.2)
- Phase 28 added: DZI Tile Generation Pipeline (v2.2)
- Phase 29 added: bunny.net Upload of Tile Pyramids (v2.2)
- Phase 30 added: `data/species-photos.json` Build Integration (v2.2)
- Phase 31 added: OpenSeadragon Viewer in Lightbox (v2.2)

### Pending Todos

- PROJECT.md Out of Scope: remove the "Zoomify deep-zoom viewer — replaced by lightbox in v1" line (or replace its strike-through with an explicit v2.2 inversion note) before Phase 26 planning
- Phases 26–31 all need plans drafted via `/gsd:plan-phase`

### Blockers/Concerns

None.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Tech debt | MAINT-03: build time under 5 min unverified | Carry forward — Phase 30 build adds species-photos.json materialization; check against target | v1.2 |
| Tech debt | No automated visual regression tests | Carry forward | v1.2 |
| Tech debt | WR-01–03: test cleanup paths could be more robust | Carry forward | v1.2 |
| CDN | GitHub LFS storage quota reclaim | Accept billing; out of scope | v1.4 |
| CDN | WebP not yet active on bunny.net Optimizer (serving JPEG) | Deferred | v1.4 |
| v2.2 | `*custom` Dropbox sub-folder | Deferred until contents understood — out of scope for v2.2 | v2.2 |
| v2.2 | External taxonomic API (GBIF/ITIS) synonym auto-resolution | Manual `species-synonyms.csv` is faster for ~30–80 decisions; revisit if residue stays large | v2.2 |

## Session Continuity

Last session: 2026-05-21T16:11:43.690Z
Stopped at: Phase 26 context gathered
Resume file: .planning/phases/26-dropbox-ingest-filename-parser-and-manifest/26-CONTEXT.md
