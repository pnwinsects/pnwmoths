# Roadmap: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Created:** 2026-04-11

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-04-12) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Visual Identity** — Phase 6 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Tech Debt** — Phase 7 (shipped 2026-04-18) — [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Visual Browse** — Phases 8–12 (shipped 2026-04-20) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Image CDN** — Phases 13–17 (shipped 2026-04-22) — [archive](milestones/v1.4-ROADMAP.md)
- ✅ **v2.0 Glossary Tooltips** — Phases 19–21 (shipped 2026-04-23) — [archive](milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Species Fact Sheet Gaps** — Phases 22–25 (shipped 2026-05-20) — [archive](milestones/v2.1-ROADMAP.md)
- 🚧 **v2.2 High-resolution species photos** — Phases 26–31 (in flight)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–5) — SHIPPED 2026-04-12</summary>

- [x] Phase 1: Data Pipeline Foundation (2/2 plans) — completed 2026-04-12
- [x] Phase 2: Species Factsheet (Static) (2/2 plans) — completed 2026-04-12
- [x] Phase 3: Client-side Interactivity (2/2 plans) — completed 2026-04-12
- [x] Phase 4: Search, Glossary, and Validation (3/3 plans) — completed 2026-04-12
- [x] Phase 5: Maintainability (3/3 plans) — completed 2026-04-12

</details>

<details>
<summary>✅ v1.1 Visual Identity (Phase 6) — SHIPPED 2026-04-18</summary>

- [x] Phase 6: Make Pages Look Like Existing pnwmoths Site (2/2 plans) — completed 2026-04-15

</details>

<details>
<summary>✅ v1.2 Tech Debt (Phase 7) — SHIPPED 2026-04-18</summary>

- [x] Phase 7: Code Quality Fixes (1/1 plans) — completed 2026-04-18

</details>

<details>
<summary>✅ v1.3 Visual Browse (Phases 8–12) — SHIPPED 2026-04-20</summary>

**Milestone Goal:** Replace static browse pages with an interactive accordion browse page (Family → Subfamily → Genus → Species) with navigation images and client-side state filtering.

- [x] **Phase 8: Schema Extension** - Add `subfamily` and `navigational` columns to CSV data model with validation
- [x] **Phase 9: Build Pipeline Extension** - Emit `taxon.js` data tree and `species-states.json` for accordion and state filter
- [x] **Phase 10: Browse Shell Page** - Rewrite `/browse/` as single dynamic page; retire per-genus static pages
- [x] **Phase 11: Accordion Component** - Implement `<pnwm-taxon-browser>` Lit component with accordion, nav images, and state filter
- [x] **Phase 12: Validation** - Full build verification; confirm all outputs correct and tests passing

</details>

<details>
<summary>✅ v1.4 Image CDN (Phases 13–17) — SHIPPED 2026-04-22</summary>

**Milestone Goal:** Migrate image storage from Git LFS to bunny.net object storage with CDN-native on-the-fly resizing; remove build-time resize scripts and LFS from the repo; migrate full production dataset.

- [x] **Phase 13: CDN Provisioning** - Create bunny.net Storage + Pull Zone; upload 3,880 images; configure Optimizer; document upload workflow — completed 2026-04-22
- [x] **Phase 14: Template Migration** - Wire `CDN_BASE_URL` into Eleventy; update all templates and `pnwm-taxon-browser.js` to construct CDN URLs — completed 2026-04-22
- [x] **Phase 15: LFS Removal** - Rewrite git history to purge `images/` (16,191 files, 356 commits); clean `.gitattributes`; replace LFS checkout in CI — completed 2026-04-22
- [x] **Phase 16: Build Pipeline Cleanup** - Remove species photo copy block from `copy-images.js`; confirm no image resize scripts exist — completed 2026-04-22
- [x] **Phase 17: Migrate Full Species Data from Legacy Database** - Stream-parse 634 MB MySQL dump; write 1,348 species + 85,933 PNW occurrence records; 72/72 tests, 1,364 species pages — completed 2026-04-22

</details>

<details>
<summary>✅ Phase 18 (between milestones) — Plates CDN Migration — SHIPPED 2026-04-23</summary>

- [x] **Phase 18: Plates CDN Migration** - Restore photographic plates: migrate Zoomify tile data to bunny.net CDN — completed 2026-04-23

</details>

<details>
<summary>✅ v2.0 Glossary Tooltips (Phases 19–21) — SHIPPED 2026-04-23</summary>

**Milestone Goal:** Species prose automatically highlights the first occurrence of each glossary term at build time with a tooltip/popover showing the definition and image.

- [x] **Phase 19: Build-time Glossary Transform** - Annotate species prose HTML at build time with `<abbr>` elements for first occurrences of glossary terms — completed 2026-04-23
- [x] **Phase 20: Popover UI — HTML and CSS** - Add popover HTML structure and CSS so annotated terms show definition text on hover/focus/click without JS — completed 2026-04-23
- [x] **Phase 21: JS Hover Enhancement and Glossary Images** - Add vanilla JS event wiring and CDN glossary images to the popover — folded into Phase 20; completed 2026-04-23

</details>

<details>
<summary>✅ v2.1 Species Fact Sheet Gaps (Phases 22–25) — SHIPPED 2026-05-20</summary>

**Milestone Goal:** Close the remaining UX and feature gaps between pnwmoths and the reference pnwinsects-app on species fact sheet pages.

- [x] **Phase 22: Phenology Chart Improvements** - Axis labels and corrected Y-scale on the phenology chart (completed 2026-05-20)
- [x] **Phase 23: Photo Thumbnail Carousel** - Thumbnail strip navigation and lightbox close button fix (completed 2026-05-20)
- [x] **Phase 24: County, Collection, and Elevation Filters** - Three new occurrence filters wired to the filter event bus (completed 2026-05-20)
- [x] **Phase 25: Similar Species Thumbnails** - CDN thumbnails and clickable links in the similar species section (completed 2026-05-20)

</details>

### v2.2 High-resolution species photos (Phases 26–32) — IN FLIGHT

**Milestone Goal:** Replace existing low-res species photos with OpenSeadragon deep-zoom high-res photos sourced from a ~200 GB Dropbox folder, via a resumable server-side processing pipeline.

- [x] **Phase 26: Dropbox Ingest, Filename Parser, and Manifest** - One-file-at-a-time Dropbox API fetch; filename parser covering audit edge cases; durable manifest as source of truth and recovery state; operability harness (progress logs, exponential-backoff retries, resumable jobs) (completed 2026-05-22)
- [x] **Phase 27: Synonym Curation Pass** - `data/species-synonyms.csv` maps outdated binomials to current species; reclassification rerun without re-downloading; investigation queue surfaces highest-impact unresolved binomials first (completed 2026-05-22)
- [ ] **Phase 28: End-to-End Vertical-Slice Pilot — One Species** - One hand-picked clean-match species rendered via OpenSeadragon in its production lightbox, tiles served from bunny.net CDN, JSON entry hand-edited; surfaces cross-phase integration risks before bulk commit
- [ ] **Phase 29: DZI Tile Generation Pipeline (bulk)** - `vips dzsave` produces DZI tiles per downloaded TIFF on the datacenter server; idempotent per image; tile parameters reproducible from committed config; pilot-derived tile params seed the committed config
- [ ] **Phase 30: bunny.net Upload of Tile Pyramids (bulk)** - Upload each image's tile directory to `species-tiles/{species-slug}/{specimen_id}-{view}/` using the Phase 13 HTTP PUT pattern; idempotent rerun; storage footprint sanity-checked against pricing before bulk commit
- [ ] **Phase 31: `data/species-photos.json` Build Integration** - Eleventy data file derived from manifest; per-species `high_res_available` flag; legacy low-res entries in `images.csv` deprecated for species with high-res replacements; replaces the pilot's hand-edited entry with manifest-derived rows
- [ ] **Phase 32: OpenSeadragon Viewer in Lightbox (generalize pilot)** - Pilot's species-scoped OSD wiring generalized to every `high_res_available: true` species; static `<img>` fallback otherwise; carousel behavior unchanged; specimen/view metadata surfaced inline

## Phase Details

### Phase 19: Build-time Glossary Transform

**Goal**: Species prose pages have first occurrences of glossary terms wrapped in `<abbr class="glossary-term">` elements carrying definition and image URL as data attributes, correct no-JS degradation, and a passing unit test suite
**Depends on**: Phase 18 (build pipeline stable)
**Requirements**: GLOS-01, GLOS-02, GLOS-03, GLOS-04, GLOS-05, GLOS-06, QA-01
**Success Criteria** (what must be TRUE):

  1. A species page rendered by `npm run build` contains `<abbr class="glossary-term" title="..." data-definition="..." data-image-url="...">` wrapping the first occurrence of a matched glossary term, and the same term appearing later on the page is plain text
  2. Matching is case-insensitive and whole-word: "costal" matches in "the costal margin" but not inside "subcostal"
  3. Terms containing regex metacharacters (`1A+2A`, `W-mark`, `CuA1`) are matched correctly and do not corrupt surrounding HTML
  4. The `/glossary/` page and browse pages contain no `<abbr class="glossary-term">` elements (transform is scoped to species prose only)
  5. Unit tests cover regex escaping, first-occurrence deduplication, and prose-scope guard; all tests pass

**Plans**: 3 plans
Plans:

- [x] 19-01-PLAN.md — Install node-html-parser + implement glossary-transform.js (escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms)
- [x] 19-02-PLAN.md — Create unit test suite (QA-01) + add src/_lib/*.test.js to npm test glob
- [x] 19-03-PLAN.md — Wire addTransform into eleventy.config.js + integration verification
- [x] 19-04-PLAN.md — Fix substituteTerms() to wrap all unseen terms in a text node (gap closure)

### Phase 20: Popover UI — HTML and CSS

**Goal**: Users can see a styled popover panel with the full definition when they hover, focus, or click a highlighted glossary term; the feature works without JavaScript and does not pollute the Pagefind search index
**Depends on**: Phase 19
**Requirements**: TIP-01, TIP-02, TIP-03, QA-02
**Success Criteria** (what must be TRUE):

  1. Hovering or focusing an `<abbr class="glossary-term">` element opens a popover showing the full definition text, styled consistently with the site's design tokens
  2. The popover dismisses when the pointer leaves, focus moves away, or the user presses Escape
  3. With JavaScript disabled, the `<abbr title="...">` native browser tooltip remains available and no layout is broken
  4. After a production build and `pagefind --site _site`, species page excerpts in search results do not include glossary definition text

**Plans**: 1 plan
Plans:

- [x] 20-01-PLAN.md — Rewrite glossary tooltip to Popover API + migrate CSS selectors (TIP-01, TIP-02, TIP-03, QA-02)

**UI hint**: yes

### Phase 21: JS Hover Enhancement and Glossary Images

**Goal**: Popovers for terms that have a glossary image display that image from the CDN, and hover/focus show/hide behavior is driven by a small (~20-line) vanilla JS handler
**Depends on**: Phase 20
**Requirements**: TIP-02
**Success Criteria** (what must be TRUE):

  1. For a glossary term with an `image_filename` in `glossary.csv`, the popover panel shows the corresponding CDN image alongside the definition text
  2. For a glossary term without an image, the popover shows definition text only and no broken image placeholder appears
  3. The JS implementation is ~20 lines of vanilla JS with no external library dependency; hover and keyboard focus both trigger show/hide correctly

**Plans**: TBD
**UI hint**: yes

### Phase 22: Phenology Chart Improvements

**Goal**: Users see correctly labeled and scaled phenology charts on every species fact sheet
**Depends on**: Phase 21 (v2.0 complete)
**Requirements**: CHART-01, CHART-02
**Success Criteria** (what must be TRUE):

  1. The X-axis of the phenology chart displays the label "Month" and the Y-axis displays the label "# Records"
  2. The Y-axis begins at 0 and its maximum value equals the highest monthly record count for that species (no fixed cap, no negative baseline)
  3. A species with all records in one month shows a chart with one tall bar and all other bars at zero (Y-axis scales to that bar's height)

**Plans**: 1 plan
Plans:

- [x] 22-01-PLAN.md — Add scales config (axis titles + beginAtZero) to pnwm-phenology-chart.js, full build verification, human visual checkpoint (CHART-01, CHART-02)

**UI hint**: yes

### Phase 23: Photo Thumbnail Carousel

**Goal**: Users can navigate species photos via a thumbnail strip and close the lightbox via its close button
**Depends on**: Phase 22
**Requirements**: PHOTO-01, PHOTO-02, PHOTO-03
**Success Criteria** (what must be TRUE):

  1. For a species with multiple photos, a horizontal thumbnail strip is visible below the main image; clicking any thumbnail swaps it into the main image position
  2. The dot navigation control is absent; only the thumbnail strip provides photo navigation
  3. Opening the lightbox and clicking the close button (or pressing Escape) dismisses the lightbox without a page reload

**Plans**: 1 plan
Plans:

- [x] 23-01-PLAN.md — Replace dot navigation with thumbnail strip (ResizeObserver overflow detection, scrollIntoView on index change) + fix lightbox close button binding (PHOTO-01, PHOTO-02, PHOTO-03)

**UI hint**: yes

### Phase 24: County, Collection, and Elevation Filters

**Goal**: Users can narrow occurrence records on a species page by county, collection, and elevation range, with the map and phenology chart updating in real time
**Depends on**: Phase 23
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04
**Success Criteria** (what must be TRUE):

  1. A county dropdown appears in the filter bar; its options are populated from the distinct counties present in the species' Parquet data; selecting a county filters map pins and phenology bars to matching records
  2. A collection dropdown appears in the filter bar; its options are populated from the distinct collections present in the data; selecting a collection updates the map and chart
  3. An elevation range slider (feet) appears in the filter bar; dragging the min or max handle filters records to those within the selected elevation range
  4. All three new filters integrate with the existing `pnwm-filter-change` event bus; the map and phenology chart respond to the same event they already handle

**Plans**: 2 plans
Plans:
**Wave 1**

- [x] 24-01-PLAN.md — Extend filterRecords() with county/collection/elevation conditions + add tests (FILT-01, FILT-02, FILT-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 24-02-PLAN.md — Extend pnwm-filter-bar.js with county dropdown, collection dropdown, elevation range slider; extend pnwm-filter-change detail; human-verify (FILT-01, FILT-02, FILT-03, FILT-04)

**UI hint**: yes

### Phase 25: Similar Species Thumbnails

**Goal**: Users can see a thumbnail image and follow a link for each similar species listed on a species fact sheet
**Depends on**: Phase 24
**Requirements**: SIM-01, SIM-02
**Success Criteria** (what must be TRUE):

  1. Each entry in the similar species section displays a thumbnail image loaded from the CDN; species with no available image show a placeholder or are omitted gracefully
  2. Each similar species entry is a clickable link that navigates to that species' fact sheet page
  3. The similar species section renders correctly in the static HTML (no-JS degradation preserved)

**Plans**: 1 plan
Plans:

- [ ] 25-01-PLAN.md — Replace similar species &lt;ul&gt; with horizontal CDN thumbnail row in species.njk + append .similar-species-* CSS rules to theme.css; human visual verification (SIM-01, SIM-02)

**UI hint**: yes

### Phase 26: Dropbox Ingest, Filename Parser, and Manifest

**Goal**: An operator can run a single command on the processing server that pulls high-res photos from the Dropbox shared folder, parses their filenames, persists each image's state in a durable manifest, and can be killed and restarted at any time without losing or re-downloading work
**Depends on**: Phase 25 (v2.1 complete)
**Requirements**: INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05, OPS-01, OPS-02, OPS-03
**Success Criteria** (what must be TRUE):

  1. With a Dropbox token in the environment, the ingest job streams files from the v2.2 shared-folder URL via the Dropbox API (`shared_link` param on the `scl/fo` rlkey URL) one at a time — the operator never downloads the folder locally first
  2. After the job processes the audit corpus, the manifest contains one row per file with at minimum `dropbox_path`, `content_hash`, `size`, `server_modified`, `filename_raw`, `binomial_raw`, `specimen_id`, `view` (D|V), `binomial_resolved`, `species_slug`, `match_bucket`, and `status`; the rows reproduce the audit's classification distribution (clean-match ≈ 77.5%, genus-only, likely-synonym, provisional, unparseable)
  3. The parser cleanly handles every edge case surfaced by Spike 001: hyphenated `Genus-species` form, 2-character species epithets (`ni`, `ou`), hyphenated epithets (`v-alba`, `c-nigrum`), single-letter specimens and institutional accessions (`OSAC_*`, `WWUC*`), and dorsal/ventral views (`D`/`V`)
  4. Provisional IDs (`n sp`, `sp`, `nr <species>`) parse successfully but land in a `provisional` bucket — they are never auto-promoted to `clean-match`
  5. Killing the job mid-run and re-running it skips files whose `dropbox_path` + `content_hash` already exist in the manifest (no re-download, no duplicate rows), and resumes from the next unprocessed file without manual reconciliation
  6. Transient failures (Dropbox API 429/5xx, network drops) retry with exponential backoff; permanent failures mark the manifest row `status: failed` with an error reason and the job continues — it does not crash
  7. The running job emits per-stage progress logs (counts, elapsed, ETA) suitable for tailing during a multi-hour run; the same log pattern is reusable by Phases 28 and 29

**Plans**: 4 plans
Plans:
**Wave 1** (parallel)

- [x] 26-01-PLAN.md — Port spike parser into scripts/lib/parse-photo-filename.js with the three D-14 fixes (FIX #1 ≥2-char epithets, FIX #2 hyphenated epithets, FIX #3 provisional bucket) + unit tests covering every audit edge case (INGEST-02, INGEST-03)
- [x] 26-02-PLAN.md — Port spike list-dropbox.mjs into scripts/lib/dropbox-list.js as async generator; create scripts/lib/manifest.js with D-05 COLUMNS + readManifest/writeManifest/sortForInvestigation + tests (INGEST-01, INGEST-04, INGEST-05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 26-03-PLAN.md — Build scripts/ingest-photos.js CLI composing the three libraries; classification cascade against data/species.csv; withRetry exponential backoff with DROPBOX_TOKEN redaction; logStage helper; resumability via content_hash Set; add npm aliases photos:ingest + photos:investigate (INGEST-01, INGEST-05, OPS-01, OPS-02, OPS-03)

**Wave 3** *(blocked on Wave 2 completion; contains the human-verify checkpoint)*

- [x] 26-04-PLAN.md — Author _instructions/INGESTING_HIGH_RES_PHOTOS.md operator runbook; human-verify checkpoint runs real Dropbox ingest and commits data/species-photos-manifest.csv; verify bucket distribution within ±3% of spike audit (INGEST-01..05, OPS-01..03)

### Phase 27: Synonym Curation Pass

**Goal**: A curator can convert the spike's bounded "needs investigation" workload (~30–80 unique unresolved binomials) into committed `data/species-synonyms.csv` decisions and rerun classification on the existing manifest to reclassify affected rows without re-downloading any source files
**Depends on**: Phase 26
**Requirements**: CURATE-01, CURATE-02, CURATE-03
**Success Criteria** (what must be TRUE):

  1. A flat `data/species-synonyms.csv` file (committed to the repo) maps outdated binomials to current species slugs — e.g. `Grammia nevadensis → Apantesis nevadensis` — and is editable by a non-technical curator following the `_instructions/` pattern
  2. Re-running classification against an updated `species-synonyms.csv` reclassifies affected manifest rows from `genus-only` / `likely-synonym` to `resolved-via-synonym`, updates `binomial_resolved` and `species_slug`, and does not redownload the source TIFFs
  3. The manifest exposes a readable "needs investigation" view (rows in `genus-only`, `likely-synonym`, `provisional`, or `unparseable` buckets) sorted by frequency — the curator opens it and immediately sees the highest-impact unresolved binomials at the top (matching the spike's top-unmatched list: `Grammia`, `Eupithecia`, `Smerinthus ophthalmica`, etc.)
  4. After one curation pass against the audit residue, the clean-or-resolved match rate measurably rises (target ≥ 95%, up from the 77.5% baseline) and the count of rows still flagged for investigation falls

**Plans**: 3 plans
Plans:

**Wave 1**

- [x] 27-01-PLAN.md — Seed data/species-synonyms.csv (D-01 two-column schema, D-08 header-only) (CURATE-01)
- [x] 27-02-PLAN.md — RED+GREEN: loadSynonyms helper + classify() pre-pass + RESORT_ONLY synonym-aware re-classification; export classify/loadSynonyms (D-03, D-04, D-05, D-06, D-09, D-10, L-02, L-03) (CURATE-02, CURATE-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 27-03-PLAN.md — Curator runbook _instructions/CURATING_SPECIES_SYNONYMS.md (D-01, D-02, D-07, D-08, L-04, L-05) (CURATE-01, CURATE-03)

### Phase 28: End-to-End Vertical-Slice Pilot — One Species

**Goal**: Prove the entire downstream pipeline (tile → upload → species-photos.json → OpenSeadragon in production lightbox) works on a single hand-picked species, surfacing cross-phase integration risks (URL conventions, manifest shape, viewer wiring, CDN config, build determinism, OSD aesthetics) before committing ~1 TB of tiles and ~5,000 specimen uploads to bunny.net
**Depends on**: Phase 27
**Requirements**: PILOT-01
**Success Criteria** (what must be TRUE):

  1. One hand-picked species (clean-match, 1–3 specimens, both D and V views) is fully visible on its production species page: opening the lightbox launches OpenSeadragon loading DZI tiles from the bunny.net CDN; pan, zoom, and home-reset work
  2. The tile pyramid for that species lives at the production URL convention `{{ cdnBaseUrl }}/species-tiles/{species-slug}/{specimen_id}-{view}/`
  3. `data/species-photos.json` carries a real, hand-edited entry for that species (full manifest derivation is Phase 31's job)
  4. A documented "tiles produced locally via `vips`" recipe exists, sufficient for the operator (the datacenter-server harness is Phase 29's job)
  5. Pilot lessons are recorded — at minimum: tile-parameter choices that survived contact, URL/path conventions that need adjusting before bulk, any OSD configuration surprises — and inform Phase 29's committed config
  6. No regressions to existing species pages: species without high-res still render Phase 23's static lightbox + carousel unchanged

**Locked sub-decisions** (2026-05-22): tile production happens locally on operator hardware; `species-photos.json` is hand-edited for the pilot; pilot species is operator's choice subject to the clean-match / both-views constraint above.

**Out of scope** (deferred to phases 29–32): bulk tiling of all manifest rows (Phase 29), datacenter-server `vips` harness (Phase 29), bulk upload + storage-footprint sanity check (Phase 30), manifest-derived `species-photos.json` build integration (Phase 31), general OSD viewer wiring across all `high_res_available: true` species (Phase 32).

**Plans**: 5 plans
Plans:
**Wave 1** (parallel)

- [ ] 28-01-PLAN.md — Author TILE-RECIPE.md operator runbook; operator selects pilot species and produces DZI tile pyramids locally via `vips dzsave --tile-size 256 --overlap 1 --suffix .jpg[Q=85] --layout dz` (PILOT-01 SC-4)
- [ ] 28-02-PLAN.md — Create data/species-photos.json ({}) + src/_data/species-photos.js loader; verify build still produces 1,364 species pages (PILOT-01 data-layer plumbing, no-regression gate)

**Wave 2** *(blocked on Wave 1)*

- [ ] 28-03-PLAN.md — Author UPLOAD-RECIPE.md (mirrors scripts/upload-plates.js curl PUT pattern); operator uploads pilot tile pyramids to bunny.net at `species-tiles/{slug}/{specimen_id}-{view}/`; CDN reachability + CORS header status verified (PILOT-01 SC-2 + RESEARCH.md Open Question #1)
- [ ] 28-04-PLAN.md — Wire OSD into pnwm-image-slideshow lightbox (gated on highResAvailable + _highResSpecimens?.length); add _buildDziUrl helper + test; extend species.njk with conditional high-res-* attribute block; build still 1,364 pages and zero pages emit high-res-available with empty JSON (PILOT-01 SC-6 no-regression + autonomous code path)

**Wave 3** *(blocked on Wave 2)*

- [ ] 28-05-PLAN.md — Operator hand-edits data/species-photos.json with real pilot entry; visual browser verification of OSD pan/zoom/home against live CDN + no-regression smoke on two non-pilot species; author PILOT-LESSONS.md (tile params, CORS status, OSD surprises, URL adjustments, recommendations for Phases 29/30/32) (PILOT-01 SC-1, SC-3, SC-5, SC-6)

**UI hint**: yes

### Phase 29: DZI Tile Generation Pipeline (bulk)

**Goal**: For each manifest row in `status: downloaded`, the pipeline produces a DZI tile pyramid on the datacenter server using `libvips`, advances the row to `status: tiled`, and reruns are idempotent — tiles are reproducible from a committed configuration. Pilot-derived tile params (Phase 28) seed the committed config.
**Depends on**: Phase 28
**Requirements**: TILE-01, TILE-02, TILE-03
**Success Criteria** (what must be TRUE):

  1. For each manifest row with `status: downloaded`, `vips dzsave` produces a DZI tile pyramid from the source TIFF on the datacenter server; the resulting directory layout is the standard DZI `{prefix}_files/{level}/{col}_{row}.{fmt}` plus `{prefix}.dzi` descriptor
  2. The tile job is idempotent per image: rerunning over an already-tiled row leaves the manifest unchanged and does not retile (status guard checked before invoking `vips`)
  3. Tile parameters (tile size, overlap, output format, JPEG quality) live in a single committed pipeline-config file; changing them and rerunning regenerates tiles deterministically — two runs with the same config produce byte-identical or semantically-equivalent output
  4. Successful tiling advances the manifest row from `downloaded` to `tiled` with no other state changes; tile-stage progress logs follow the Phase 26 pattern

**Plans**: 3 plans
Plans:

**Wave 1**

- [x] 29-01-PLAN.md — Commit scripts/tile-config.json + scripts/lib/dropbox-download.js + advanceStatus helper in manifest.js (TILE-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 29-02-PLAN.md — Build scripts/tile-photos.js CLI composing config + dropbox-download + vips dzsave; per-row idempotency via status + on-disk .dzi guards; redact+withRetry+logStage helpers; npm alias photos:tile (TILE-01, TILE-02, TILE-03)

**Wave 3** *(blocked on Wave 2; contains the human-verify checkpoint)*

- [ ] 29-03-PLAN.md — Author _instructions/TILING_HIGH_RES_PHOTOS.md operator runbook; human-verify checkpoint runs DRY_RUN + idempotency proof + .dzi Format check + npm test on the datacenter server (TILE-01, TILE-02, TILE-03)

### Phase 30: bunny.net Upload of Tile Pyramids (bulk)

**Goal**: For each manifest row in `status: tiled`, the pipeline uploads its tile directory to bunny.net Storage at the agreed URL convention, advances the row to `status: uploaded`, and bulk-upload is preceded by an explicit storage-footprint sanity check against bunny.net pricing
**Depends on**: Phase 29
**Requirements**: UPLOAD-01, UPLOAD-02, UPLOAD-03
**Success Criteria** (what must be TRUE):

  1. For each manifest row with `status: tiled`, the pipeline uploads the entire tile directory (`.dzi` descriptor + `{prefix}_files/`) to bunny.net Storage via the Phase 13 HTTP PUT pattern (`BUNNY_API_KEY` env), under the path convention `species-tiles/{species-slug}/{specimen_id}-{view}/`
  2. The upload step is idempotent per image: rerunning skips already-uploaded rows (`status: uploaded`); partial uploads recover on rerun without manual cleanup
  3. Before the first bulk run, an operator-runnable check produces a measured/projected bunny.net storage footprint (expected ~1 TB on ~204 GB source — roughly 5× DZI overhead) and the operator records the pricing sanity-check outcome in the milestone log
  4. Successful upload advances the manifest row from `tiled` to `uploaded`; upload-stage logs follow the Phase 26 progress/retry pattern; tile URLs verifiably resolve through the Pull Zone (`{{ cdnBaseUrl }}/species-tiles/...`)

**Plans**: TBD

### Phase 31: `data/species-photos.json` Build Integration

**Goal**: At Eleventy build time, the manifest's `uploaded` rows materialize into a committed-or-built `data/species-photos.json` that templates can consume per species; species with high-res photos render only their high-res entries (legacy low-res rows from `images.csv` are deprecated for those species). Replaces the pilot's hand-edited entry (Phase 28) with manifest-derived rows.
**Depends on**: Phase 30
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. The build pipeline derives `data/species-photos.json` from the manifest's `uploaded` rows; each species entry carries CDN tile path (`species-tiles/{species-slug}/{specimen_id}-{view}/`), `specimen_id`, `view`, and the metadata needed by the OSD viewer — following the `data/plates.json` committed-manifest pattern from Phase 18
  2. Each species record in the Eleventy data tree (the data file the species template iterates) carries a `high_res_available` boolean so templates branch viewer choice in a single conditional without re-querying the manifest
  3. For a species where `high_res_available` is true, the build does not render the legacy low-res entries from `images.csv` for that species — there is no double rendering of low-res alongside high-res
  4. `npm run build` produces the same page count it did at the end of v2.1 (1,364 species pages), now with high-res photo entries available on species that have them
  5. The pilot's hand-edited species entry (Phase 28) is replaced by a manifest-derived entry with no user-visible change to that species' lightbox behavior

**Plans**: TBD

### Phase 32: OpenSeadragon Viewer in Lightbox (generalize pilot)

**Goal**: Generalize the pilot's species-scoped OSD wiring (Phase 28) so that every species with `high_res_available: true` opens an OpenSeadragon pan/zoom viewer in its lightbox; species without high-res still get the existing static-image lightbox, with no regression to the Phase 23 carousel
**Depends on**: Phase 31
**Requirements**: VIEWER-01, VIEWER-02, VIEWER-03, VIEWER-04
**Success Criteria** (what must be TRUE):

  1. On any species page with `high_res_available: true`, clicking a thumbnail in the Phase 23 carousel opens the lightbox hosting an OpenSeadragon instance that loads the matching photo's DZI tiles from the CDN; pan, zoom, and home-reset work
  2. On a species page with `high_res_available: false`, clicking a thumbnail opens the existing Phase 23 lightbox with the static `<img>` render — no OSD instance is attached and no regression appears
  3. The thumbnail carousel (hover, click, keyboard, touch, ResizeObserver overflow detection) is unchanged across both code paths — OSD swaps only into the lightbox layer, not the carousel
  4. When a species has multiple high-res photos, the OSD viewer surfaces the current photo's `specimen_id` and `view` (D/V) inline so a visitor or curator can tell which physical specimen is being viewed
  5. The pilot's species filter (if any was used to scope OSD wiring to one species) is removed; OSD coverage tracks `high_res_available` directly from the data file

**Plans**: TBD

**UI hint**: yes

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Pipeline Foundation | v1.0 | 2/2 | Complete | 2026-04-12 |
| 2. Species Factsheet (Static) | v1.0 | 2/2 | Complete | 2026-04-12 |
| 3. Client-side Interactivity | v1.0 | 2/2 | Complete | 2026-04-12 |
| 4. Search, Glossary, and Validation | v1.0 | 3/3 | Complete | 2026-04-12 |
| 5. Maintainability | v1.0 | 3/3 | Complete | 2026-04-12 |
| 6. Make Pages Look Like Existing pnwmoths Site | v1.1 | 2/2 | Complete | 2026-04-15 |
| 7. Code Quality Fixes | v1.2 | 1/1 | Complete | 2026-04-18 |
| 8. Schema Extension | v1.3 | 3/3 | Complete | 2026-04-20 |
| 9. Build Pipeline Extension | v1.3 | 2/2 | Complete | 2026-04-20 |
| 10. Browse Shell Page | v1.3 | 1/1 | Complete | 2026-04-20 |
| 11. Accordion Component | v1.3 | 3/3 | Complete | 2026-04-20 |
| 12. Validation | v1.3 | 1/1 | Complete | 2026-04-20 |
| 13. CDN Provisioning | v1.4 | 5/5 | Complete | 2026-04-22 |
| 14. Template Migration | v1.4 | 2/2 | Complete | 2026-04-22 |
| 15. LFS Removal | v1.4 | 2/2 | Complete | 2026-04-22 |
| 16. Build Pipeline Cleanup | v1.4 | 1/1 | Complete | 2026-04-22 |
| 17. Migrate Full Species Data from Legacy Database | v1.4 | 3/3 | Complete | 2026-04-22 |
| 18. Plates CDN Migration | — | 2/2 | Complete | 2026-04-23 |
| 19. Build-time Glossary Transform | v2.0 | 4/4 | Complete | 2026-04-23 |
| 20. Popover UI — HTML and CSS | v2.0 | 1/1 | Complete | 2026-04-23 |
| 21. JS Hover Enhancement and Glossary Images | v2.0 | 0/0 | Complete (folded into Phase 20) | 2026-04-23 |
| 22. Phenology Chart Improvements | v2.1 | 1/1 | Complete   | 2026-05-20 |
| 23. Photo Thumbnail Carousel | v2.1 | 1/1 | Complete | 2026-05-20 |
| 24. County, Collection, and Elevation Filters | v2.1 | 2/2 | Complete | 2026-05-20 |
| 25. Similar Species Thumbnails | v2.1 | 1/1 | Complete | 2026-05-20 |
| 26. Dropbox Ingest, Filename Parser, and Manifest | v2.2 | 4/4 | Complete    | 2026-05-22 |
| 27. Synonym Curation Pass | v2.2 | 3/3 | Complete    | 2026-05-22 |
| 28. End-to-End Vertical-Slice Pilot — One Species | v2.2 | 0/5 | Planned | — |
| 29. DZI Tile Generation Pipeline (bulk) | v2.2 | 1/3 | In Progress | — |
| 30. bunny.net Upload of Tile Pyramids (bulk) | v2.2 | 0/0 | Not started | — |
| 31. `data/species-photos.json` Build Integration | v2.2 | 0/0 | Not started | — |
| 32. OpenSeadragon Viewer in Lightbox (generalize pilot) | v2.2 | 0/0 | Not started | — |

---
*Roadmap created: 2026-04-11 | v1.0 archived: 2026-04-12 | v1.1 archived: 2026-04-18 | v1.2 archived: 2026-04-18 | v1.3 archived: 2026-04-20 | v1.4 archived: 2026-04-23 | v2.0 archived: 2026-05-19 | v2.1 archived: 2026-05-20 | v2.2 phases added: 2026-05-21 | Phase 28 plans drafted: 2026-05-22*

## Backlog

No backlog items.
