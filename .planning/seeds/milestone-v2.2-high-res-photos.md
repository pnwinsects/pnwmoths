---
title: Milestone v2.2 — High-resolution species photos
planted_date: 2026-05-20
scope_confirmed_date: 2026-05-21
trigger_condition: v2.1 milestone shipped (user explicitly chose 2026-05-21 to complete v2.1 phases 24 + 25 before starting v2.2)
status: scope-confirmed-awaiting-v2.1-ship
related:
  - note: high-res-species-photos-exploration
  - spike: 001-dropbox-photo-audit (VALIDATED)
  - skill: spike-findings-pnwmoths
---

## User-confirmed scope (2026-05-21)

The v2.2 scope below was presented during `/gsd-new-milestone` and confirmed by the user. The user then chose to complete v2.1 (phases 24 + 25) before formally starting v2.2 to keep milestone history clean. When v2.1 ships, re-invoke `/gsd-new-milestone v2.2` and use this seed + the spike REPORT + the `spike-findings-pnwmoths` skill as the brief.

**Project-level decision to update during v2.2 scoping:** The PROJECT.md Out of Scope table currently lists "Zoomify deep-zoom viewer — replaced by lightbox in v1". v2.2 inverts that for species pages. Move it out of the Out of Scope table at the start of v2.2.


# Milestone v2.2 — High-resolution species photos

## Why this seed exists

Captured during a `/gsd:explore` session on 2026-05-20. The architectural baseline is
locked in [[high-res-species-photos-exploration]]; the data-shape unknowns are deferred
to the Dropbox audit spike. When the spike report lands, scope this milestone with
`/gsd-new-milestone` using this seed + the note + the spike report as the brief.

## Trigger condition

**All of these:**

1. Dropbox audit spike report exists at `.planning/spikes/dropbox-photo-audit/REPORT.md`
   and has been reviewed.
2. The report's parseability metric is good enough to proceed (rough threshold: ≥80% of
   filenames parse cleanly OR a deterministic filename-cleanup step has been identified
   for the residue). If lower, do another spike iteration before milestoning.
3. The v2.1 milestone is either shipped or has enough breathing room that v2.2 planning
   won't starve it.

If the spike reveals data that overturns the locked decisions in the baseline note,
**revisit the note first** — don't carry forward an obsolete baseline into milestone
scoping.

## Sketched milestone shape

This is a working hypothesis to be refined during `/gsd-new-milestone`. Phase boundaries
will likely shift once the spike report is in hand.

**Working name:** v2.2 — High-resolution species photos

**Milestone goal:** Replace existing low-res species photos with OpenSeadragon deep-zoom
high-res photos sourced from a ~200GB Dropbox folder, via a resumable server-side
processing pipeline.

**Proposed phases (5–6, in dependency order):**

| # | Phase | Concern |
|---|---|---|
| A | Dropbox ingest + filename parser + manifest schema | One-file-at-a-time fetch from Dropbox API; parse filenames; resolve scientific-name synonyms against current species data; populate manifest with `discovered`/`needs-investigation` rows. |
| B | Tile processing pipeline | libvips DZI/Zoomify tile generation; idempotent per-image; status transitions `downloaded → tiled`. Run on datacenter server. |
| C | Bunny upload + manifest finalization | Extend Phase 13's HTTP PUT pattern for per-image tile directories. Status `tiled → uploaded`. |
| D | Operability harness | Logging, retry, rate-limit handling, progress reporting. Likely interleaved with A/B/C rather than its own phase — TBD. |
| E | `data/species-photos.json` build integration | Eleventy data file derived from manifest. Per-species `high_res_available` flag. |
| F | OSD viewer integration in Phase 23 lightbox | Swap static `<img>` for OSD instance when species has high-res; carousel keeps working untouched. |

Investigation work for unmatched filenames is a sibling activity — likely an
investigation queue + manual curation tooling rather than a phase.

## Decisions already locked (see [[high-res-species-photos-exploration]])

- **State model:** local manifest (SQLite/JSON) on processing server
- **Photo set:** Dropbox is superset; replace existing on match; investigate unmatched
- **Folder layout:** flat with encoded filenames (exact pattern TBD by spike)
- **Viewer UX:** OSD replaces Phase 23 lightbox; carousel unchanged

## Prior art to reuse

- Phase 13 — bulk upload to bunny.net (`migrate-images.js` HTTP PUT, `BUNNY_API_KEY` env)
- Phase 18 — Zoomify tiles + OSD viewer (`data/plates.json` committed-manifest pattern;
  `{{ cdnBaseUrl }}/plates/{slug}/` URL pattern)
- Phase 23 — thumbnail carousel + lightbox (the host for the OSD instance)

## Out of scope for v2.2 (preserved for later seeds)

- Image search / similarity / classification
- Photographer attribution rendering on species pages (data model can carry it; UI is later)
- Magnification metadata UI
- Replacing plate viewer's Zoomify with the same OSD configuration used by species photos
- Per-photo permalinks (rejected as viewer UX; could resurface as a v2.3 SEO/share feature)
