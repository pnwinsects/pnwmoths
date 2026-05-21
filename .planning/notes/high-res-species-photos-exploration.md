---
title: High-resolution species photos — exploration baseline
date: 2026-05-20
context: Pre-milestone exploration for displaying ~200GB of high-res species photos (Dropbox) via OpenSeadragon on species account pages. Captured via /gsd:explore before milestone scoping.
status: locked-pending-spike
related:
  - phase: 13-cdn-provisioning
  - phase: 18-plates-cdn-migration
  - phase: 23-photo-thumbnail-carousel
---

# High-resolution species photos — exploration baseline

## Goal

Display ~200GB of high-resolution species photos (currently in Dropbox) with OpenSeadragon
pan/zoom on species account pages. Processing runs on a datacenter server (not laptop) for
bandwidth + 24/7 uptime; pipeline reads from Dropbox one file at a time, generates tiles,
uploads to bunny.net.

**Dropbox source:** `https://www.dropbox.com/scl/fo/uf3sg1efxau1fug4f6ibe/AARZETfHfpzlvILrd6KLWlc?rlkey=7m1pm3z0rnasb9i01a5ht0ppf&st=emehj9n2&dl=0`

## Locked decisions

These four decisions are the architectural baseline for the upcoming milestone. Downstream
planners and researchers should treat them as fixed unless the spike audit (below) surfaces
reasons to revisit.

### 1. State model — Local manifest is source of truth

A durable per-image manifest (SQLite or JSON) on the processing server tracks each image's
status: `discovered | downloaded | tiled | uploaded | failed | needs-investigation`.

**Why:** Survives restarts. Survives reruns. Lets us attach metadata (capture date,
photographer, magnification) that Bunny directory listing can't carry. Doubles as the seed
for `data/species-photos.json` consumed by Eleventy at build time.

**Rejected alternative:** Stateless reconciliation against Bunny listing. Simpler to start
but punishes us later (LIST cost, no metadata storage, no investigation queue).

### 2. Photo set relationship — Dropbox is a superset; replace on match

Dropbox high-res photos cover ≥ the species already on the site. Some filenames may use
**outdated scientific names** (synonyms) — these need fuzzy/synonym resolution against
current species data, not auto-drop.

**Policy:**
- High-res photo matches a current species → **replace** existing low-res photos for that
  species entirely.
- High-res photo's species name matches a known synonym → resolve to current name, then
  replace.
- No match found → flag for **manual investigation** (status `needs-investigation` in
  manifest). Do not silently drop; do not auto-upload.

**Implication:** The existing ~3,880 Bunny photos from Phase 13 are sunset for any species
that gets a high-res replacement. Need a per-species "high-res available" flag on species
records so templates know which photo set to load.

### 3. Folder layout — Flat with encoded filenames

Source folder is flat: all files in one directory, species/specimen encoded in the filename
itself. Exact encoding is unknown until audited (see spike below).

**Implication:** A reliable filename parser is on the critical path. The whole milestone's
complexity depends on how regular the encoding is.

### 4. Viewer UX — OSD replaces the Phase 23 lightbox

Phase 23 shipped a thumbnail carousel + lightbox. The integration is to swap the lightbox's
static image render for an OpenSeadragon instance when the photo has a high-res counterpart
available. Carousel is untouched.

**Why:** Lowest-friction integration with the shipped UX. No new page templates. Existing
keyboard/touch interactions on the carousel keep working.

**Rejected alternatives:**
- B (separate "deep zoom" button) — Two parallel experiences; cognitive overhead.
- C (OSD embedded inline) — Most ambitious frontend change.
- D (per-photo permalinks) — Cleanest content model but many more page builds.

## Open / blocked on spike

These cannot be answered without inspecting actual Dropbox contents:

- Exact filename encoding pattern
- Match rate of filenames against current species data (1%? 30%? 90% mismatch?)
- Synonym frequency — how often does the resolution step actually fire?
- Sub-collection signals (any photographer/specimen groupings hidden in filenames?)
- Duplicate detection — multiple files per species are expected; outright duplicates may
  exist too.

**Next step:** `/gsd-spike` on Dropbox folder audit. Parse the file listing only (no image
bytes). Produce parseability report. Then scope the milestone.

## Open / for milestone-time decisions

These don't block the spike but need decisions during milestone planning:

- Dropbox API auth (app token vs OAuth flow on a headless server)
- Cache strategy: download → tile → upload → delete, or keep originals locally
- Tile format: DZI vs Zoomify (Phase 18 used Zoomify for plates — likely reuse)
- Tile generation tool: `libvips`/`vips dzsave` is the default candidate
- Tile/pyramid parameters (tile size, overlap, compression, JPEG quality)
- Operability of the long-running job: logging, retry policy, progress reporting,
  resumability after Dropbox API rate limits
- Synonym data source — does a current/historical name mapping already exist in the
  codebase, or do we ingest it from GBIF/ITIS, or curate manually?

## Prior art

- **Phase 13 — CDN provisioning** — bulk upload to bunny.net via HTTP PUT pattern in
  `migrate-images.js`. Pull Zone URL conventions captured in STATE.md decisions.
- **Phase 18 — Plates CDN migration** — Zoomify tiles on bunny.net + OpenSeadragon viewer
  on plate pages. The `data/plates.json` committed-manifest pattern is the model for
  `data/species-photos.json`. CDN URL pattern: `{{ cdnBaseUrl }}/plates/{{ plate.slug }}/`.
- **Phase 23 — Photo thumbnail carousel** — Lightbox component that will host the OSD
  viewer when high-res is available.
