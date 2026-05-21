# Spike Manifest

## Idea

Replace the existing low-resolution species photos with deep-zoom high-resolution photos sourced from a ~200GB Dropbox folder, displayed via OpenSeadragon on species account pages. The processing pipeline runs on a datacenter server (not laptop) for bandwidth + 24/7 uptime: fetch one file from Dropbox at a time, generate tiles (likely Zoomify, reusing Phase 18's pattern), upload tile sets to bunny.net.

Pre-spike exploration captured in [`../notes/high-res-species-photos-exploration.md`](../notes/high-res-species-photos-exploration.md); milestone seed in [`../seeds/milestone-v2.2-high-res-photos.md`](../seeds/milestone-v2.2-high-res-photos.md).

## Requirements

Locked during `/gsd:explore` on 2026-05-20 (architectural baseline for milestone v2.2):

- **State model:** Local manifest (SQLite/JSON) on the processing server is source of truth for per-image status — survives restarts, queryable, doubles as seed for `data/species-photos.json`.
- **Photo set relationship:** Dropbox is a superset of current species. When a high-res photo matches a current species, **replace** existing low-res photos for that species entirely. Old scientific names are possible — needs synonym resolution. Unmatched filenames are **investigated**, not auto-dropped.
- **Folder layout:** Flat with encoded filenames. Filename parser is on the critical path.
- **Viewer UX:** OSD replaces the Phase 23 lightbox (carousel unchanged).

Additional requirements may emerge from spike findings.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | dropbox-photo-audit | standard | Given the Dropbox shared folder, when we list metadata and parse filenames, then we get a quantitative parseability report | **VALIDATED ✓** | dropbox, ingest, milestone-v2.2, data-audit, filename-parsing |

## Findings rolled into requirements (from spike 001)

- **5,000 TIFFs / 204.6 GB / uniform `.tif` format** — tile pipeline input is single-format.
- **Filename convention is identical to existing Phase 13 photos** (`Genus species-{specimen}-{view}.{ext}`) — reuse existing parsing approach; do not write from scratch.
- **93.2% of current species have ≥1 high-res photo.** 91 species (6.8%) keep their existing low-res photos.
- **Manifest must carry `specimen_id`** (single letter or institutional accession like `OSAC_…`, `WWUC*`) and `view` (D|V) per image — embedded in filename, valuable for cross-linking to existing `images.csv` and the OSAC physical collection.
- **Synonym map is a milestone deliverable.** ~30–80 unique binomials need curation decisions; expect a `data/species-synonyms.csv` style artifact. Top targets: `Grammia → Apantesis` reassignment (58 files), `Eupithecia*` cluster (52 files), `Smerinthus ophthalmica` (32 files — may be a scope-add not a synonym).
- **Provisional/undescribed species must route to a separate `provisional` bucket** rather than blocking on the parser. Filenames containing `n sp`, `sp`, `nr` are real curation cases.
- **A `*custom` sub-folder exists in the Dropbox root** — needs a separate inspection pass before bulk ingest.
- **Storage estimate to validate before phase A:** ~1 TB of tile output on bunny.net (5,000 files × ~5x DZI overhead, mean source 41 MB). 60-second pricing check warranted.
