---
name: spike-findings-pnwmoths
description: Implementation blueprint from spike experiments. Requirements, proven patterns, and verified knowledge for building pnwmoths features — especially the v2.2 high-res photo pipeline. Auto-loaded during implementation work.
---

<context>
## Project: pnwmoths

A static-site rebuild of the Pacific Northwest Moths reference site (Eleventy + bunny.net image CDN). The core value is proving a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site while staying maintainable by non-technical curators.

Spike sessions wrapped: 2026-05-21
</context>

<requirements>
## Requirements

Non-negotiable design decisions established during spike sessions. Every feature area reference must honor these.

**Milestone v2.2 — High-res species photos:**

- **Local manifest is source of truth** for the long-running processing pipeline. SQLite/JSON on the processing server. Per-image durable status; survives restarts; seeds `data/species-photos.json`.
- **Dropbox is a superset of current species.** Match → replace existing low-res photos. Unknown binomial → investigate (do not auto-drop).
- **Folder layout is flat with encoded filenames.** Convention: `Genus species-{specimen}-{view}.{ext}` — identical to existing Phase 13 photos in `data/images.csv`.
- **OSD replaces the Phase 23 lightbox** (carousel unchanged) when high-res is available for a species.
- **Manifest carries `specimen_id` and `view`** per image.
- **Provisional IDs (`n sp`, `sp`, `nr <species>`)** route to a separate bucket — parser must not coerce them into clean matches.
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Dropbox ingest & filename parsing | [references/dropbox-ingest-and-filename-parsing.md](references/dropbox-ingest-and-filename-parsing.md) | API `shared_link` parameter works for `scl/fo` rlkey URLs; filename convention matches existing Phase 13 photos; 77.5% clean match / 89.9% genus-or-better / 93.2% species coverage |

## Source Files

Original spike source files are preserved in `sources/` for complete reference. Each subdirectory contains the spike's working code, README, and final report.

- [`sources/001-dropbox-photo-audit/`](sources/001-dropbox-photo-audit/) — Dropbox listing script, classifier, parseability report
</findings_index>

<metadata>
## Processed Spikes

- 001-dropbox-photo-audit (VALIDATED)
</metadata>
