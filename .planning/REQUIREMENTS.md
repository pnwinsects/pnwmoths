# Milestone v2.2 — High-resolution species photos: Requirements

**Milestone goal:** Replace existing low-res species photos with OpenSeadragon deep-zoom high-res photos sourced from a ~200 GB Dropbox folder, via a resumable server-side processing pipeline.

**Source material:** `.planning/seeds/milestone-v2.2-high-res-photos.md`, `.planning/notes/high-res-species-photos-exploration.md`, `.planning/spikes/001-dropbox-photo-audit/REPORT.md`, `.claude/skills/spike-findings-pnwmoths/`.

---

## v2.2 Requirements

### INGEST — Dropbox fetch, filename parser, manifest schema

- [x] **INGEST-01**: System ingests files from the v2.2 Dropbox shared folder one at a time via the Dropbox API (`shared_link` parameter for the `scl/fo` rlkey URL); ingest does not require the user to download the folder locally first
- [x] **INGEST-02**: Filename parser handles the convention `Genus species-{specimen}-{view}.{ext}` including: hyphenated genus-species form (`Genus-species`), 2-character species epithets (`ni`, `ou`), hyphenated species epithets (`v-alba`, `c-nigrum`), and specimen IDs that are either a single letter or an institutional accession (`OSAC_*`, `WWUC*`)
- [x] **INGEST-03**: Parser routes provisional IDs (`n sp`, `sp`, `nr <species>`) to a separate `provisional` manifest bucket — they parse successfully but are not auto-published; curator decides whether to publish each
- [x] **INGEST-04**: Local manifest (SQLite or JSON on the processing server) persists per-image rows with at minimum: `dropbox_path`, `content_hash`, `size`, `server_modified`, `filename_raw`, `binomial_raw`, `specimen_id`, `view` (D|V), `binomial_resolved`, `species_slug`, `match_bucket`, `status`
- [x] **INGEST-05**: Ingest is resumable — re-running skips files whose `dropbox_path` + `content_hash` already exist in the manifest without re-downloading

### CURATE — Synonym resolution and investigation queue

- [x] **CURATE-01**: Maintainer can author a flat `data/species-synonyms.csv` (committed to the repo) that maps outdated binomials to current species slugs (e.g. `Grammia nevadensis → Apantesis nevadensis`)
- [x] **CURATE-02**: Re-running classification against an updated `species-synonyms.csv` reclassifies affected manifest rows from `genus-only` / `likely-synonym` to `resolved-via-synonym` without re-downloading source files
- [x] **CURATE-03**: Manifest exposes a readable "needs investigation" view (rows in `genus-only`, `likely-synonym`, `provisional`, or `unparseable` buckets) sorted by frequency so a curator can work through the highest-impact decisions first

### TILE — DZI tile generation pipeline

- [ ] **TILE-01**: System generates DZI tiles from each downloaded TIFF using `libvips` (`vips dzsave`) on the datacenter server
- [ ] **TILE-02**: Tile generation is idempotent per image (`status: downloaded → tiled`); rerunning skips already-tiled images
- [ ] **TILE-03**: Tile parameters (tile size, overlap, format, JPEG quality) are documented in the pipeline config and reproducible across reruns

### UPLOAD — bunny.net upload and manifest finalization

- [ ] **UPLOAD-01**: System uploads each image's tile directory to bunny.net Storage using the Phase 13 HTTP PUT pattern; URL convention `{{ cdnBaseUrl }}/species-tiles/{species-slug}/{specimen_id}-{view}/`
- [ ] **UPLOAD-02**: Manifest tracks upload status (`status: tiled → uploaded`); reruns skip already-uploaded images
- [ ] **UPLOAD-03**: bunny.net storage footprint is sanity-checked against pricing before bulk upload commits (expected ~1 TB; ~5× DZI overhead on 204 GB source)

### DATA — `data/species-photos.json` build integration

- [ ] **DATA-01**: Build pipeline derives `data/species-photos.json` from the manifest with per-species entries containing CDN tile path, `specimen_id`, `view`, and any metadata needed by the OSD viewer
- [ ] **DATA-02**: Each species record (in the Eleventy data tree) carries a `high_res_available` boolean so templates can branch viewer choice without re-querying the manifest
- [ ] **DATA-03**: When a species has high-res photos, the legacy low-res entries from `images.csv` for that species are deprecated in the build (templates render only high-res — no double rendering)

### VIEWER — OpenSeadragon integration with Phase 23 lightbox

- [ ] **VIEWER-01**: When `high_res_available` is true for a species, the Phase 23 lightbox hosts an OpenSeadragon instance loading that photo's DZI tiles instead of the static `<img>` render
- [ ] **VIEWER-02**: When `high_res_available` is false, the lightbox falls back to the existing static `<img>` behavior with no regression
- [ ] **VIEWER-03**: The Phase 23 thumbnail carousel is unchanged — same hover, click, keyboard, and touch behavior; OSD only swaps into the lightbox layer
- [ ] **VIEWER-04**: OSD viewer surfaces specimen metadata (`specimen_id`, `view`) inline so the curator/visitor can tell which physical specimen is being viewed when a species has multiple

### OPS — Operability of long-running pipeline jobs

- [x] **OPS-01**: Ingest/tile/upload jobs emit per-stage progress logs (counts, elapsed, ETA) suitable for tailing during a multi-hour run
- [x] **OPS-02**: Jobs retry on transient failures (Dropbox API rate limits, bunny.net 5xx, network drops) with exponential backoff; permanent failures mark the row `status: failed` with an error reason in the manifest, not a process crash
- [x] **OPS-03**: Jobs can resume from arbitrary interruption (signal, crash, network drop) using the manifest as recovery state — no manual reconciliation step required

---

## Future Requirements (deferred)

These were considered for v2.2 but are deferred to later milestones:

- External taxonomic API integration (GBIF/ITIS) for auto-synonym resolution — manual `species-synonyms.csv` is faster and more reliable for the bounded ~30–80 unique decisions in the audit residue
- Per-photo permalinks — rejected as viewer UX during exploration; could resurface as a v2.3 SEO/share feature
- Magnification metadata UI — manifest can carry it; UI is a later milestone
- Photographer attribution rendering on species pages — data model can carry it; UI is later
- Same OSD configuration applied to the plate viewer — Phase 18 plates use a separate Zoomify config; unifying is out of scope for v2.2
- The `*custom` sub-folder in the Dropbox source — deliberately deferred until contents are understood

## Out of Scope

| Feature | Reason |
|---------|--------|
| Image search / similarity / classification | Not a v2.2 goal; orthogonal to the viewer upgrade |
| Editing UI for the manifest | Manifest is operator/curator-facing; flat CSVs for synonyms suffice |
| User submissions / community ID for high-res photos | iNaturalist territory; outside the static-site model |
| Real-time photo upload pipeline (drop-folder watcher) | All ingest is operator-triggered, batch-style |
| Auto-publishing of `provisional` and `needs-investigation` rows | Explicit human decision required per the curation policy |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INGEST-01 | Phase 26 | Complete |
| INGEST-02 | Phase 26 | Complete |
| INGEST-03 | Phase 26 | Complete |
| INGEST-04 | Phase 26 | Complete |
| INGEST-05 | Phase 26 | Complete |
| CURATE-01 | Phase 27 | Complete |
| CURATE-02 | Phase 27 | Complete |
| CURATE-03 | Phase 27 | Complete |
| TILE-01 | Phase 28 | Pending |
| TILE-02 | Phase 28 | Pending |
| TILE-03 | Phase 28 | Pending |
| UPLOAD-01 | Phase 29 | Pending |
| UPLOAD-02 | Phase 29 | Pending |
| UPLOAD-03 | Phase 29 | Pending |
| DATA-01 | Phase 30 | Pending |
| DATA-02 | Phase 30 | Pending |
| DATA-03 | Phase 30 | Pending |
| VIEWER-01 | Phase 31 | Pending |
| VIEWER-02 | Phase 31 | Pending |
| VIEWER-03 | Phase 31 | Pending |
| VIEWER-04 | Phase 31 | Pending |
| OPS-01 | Phase 26 | Complete |
| OPS-02 | Phase 26 | Complete |
| OPS-03 | Phase 26 | Complete |

**Coverage:** 24/24 requirements mapped to phases ✓

---

*Defined: 2026-05-21 — milestone v2.2 start, derived from seed + spike 001 report.*
*Traceability filled: 2026-05-21 — roadmap created (Phases 26–31).*
