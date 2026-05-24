---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: High-resolution species photos
status: executing
stopped_at: Phase 31 UI-SPEC approved
last_updated: "2026-05-24T00:11:58.136Z"
last_activity: 2026-05-23 -- Phase 31 planning complete
progress:
  total_phases: 14
  completed_phases: 5
  total_plans: 19
  completed_plans: 18
  percent: 36
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-23 after Phase 30)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Phase 31 — `data/species photos.json` build integration

## Current Position

Phase: 31
Status: Ready to execute
Last activity: 2026-05-23 -- Phase 31 planning complete

## Performance Metrics

**Velocity:**

- Total plans completed: 24 (across v1.0–v1.2), 10 (v1.3), 13 (v1.4), 5 (v2.0), 5 (v2.1) = 48 total
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
| Phase 30 P02 | 3min | - tasks | - files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 29 Plan 01: WebP (.webp[Q=80]) pinned in tile-config.json — pilot confirmed ~30% smaller than JPEG, OSD handles webp DZI format correctly
- Phase 29 Plan 01: downloadSharedFile has no retry — callers own withRetry (matches dropbox-list.js convention)
- Phase 29 Plan 01: advanceStatus mutates row in-place — consistent with RESORT_ONLY pattern in ingest-photos.js
- Phase 29 Plan 02: Export tilePrefix/tiffCachePath/isAlreadyTiled/isTileable for testability without network or vips
- Phase 29 Plan 02: Filesystem idempotency (isAlreadyTiled) layered on manifest idempotency (status=tiled) to recover from interrupted runs
- Phase 29 Plan 02: species_slug lowercased unconditionally in tilePrefix per Phase 28 mixed-case lesson
- Phase 30 Plan 01: DRY_RUN guard before BUNNY_API_KEY guard — enables dry-run inspection without a real API key
- Phase 30 Plan 01: advanceStatus(row, 'uploaded') before rm/unlink — status committed before deletion (D-03 ordering)
- Phase 30 Plan 01: isUploadable checks status === 'tiled' only — all other statuses filtered at loop entry
- Phase 30 Plan 01: pre-flight footprint walk uses synchronous readdirSync/statSync — one-time startup cost, print measuring message before walking
- Phase 29 fix: Dropbox shared_link API does not return path_display — use '/' + entry.name as fallback; manifest backfilled
- Phase 29 fix: downloadSharedFile marks 4xx (non-429) errors as err.retriable=false; withRetry bails immediately on these
- Phase 29 fix: DROPBOX_TOKEN requires sharing.read + files.content.read scopes (not just files.metadata.read) for tile downloads
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
- Phase 28 added: DZI Tile Generation Pipeline (v2.2) — renumbered to 29 on 2026-05-22 when the pilot was inserted
- Phase 29 added: bunny.net Upload of Tile Pyramids (v2.2) — renumbered to 30 on 2026-05-22
- Phase 30 added: `data/species-photos.json` Build Integration (v2.2) — renumbered to 31 on 2026-05-22
- Phase 31 added: OpenSeadragon Viewer in Lightbox (v2.2) — renumbered to 32 on 2026-05-22
- **Phase 28 inserted 2026-05-22 (current): End-to-End Vertical-Slice Pilot — One Species** — surface cross-phase integration risk on one species (local tiling, hand-edited JSON, production-CDN-served, production-lightbox-rendered) before the bulk tile/upload/build/viewer phases. Existing 28–31 renumbered to 29–32.

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

Last session: 2026-05-24T00:11:58.130Z
Stopped at: Phase 31 UI-SPEC approved
Resume file: None
