# Milestones

## v1.0 MVP (Shipped: 2026-04-13)

**Phases completed:** 5 phases, 12 plans, 7 tasks

**Key accomplishments:**

- CSV → DuckDB → per-species Parquet build pipeline with pre-flight UTF-8 validation and data integrity checks
- Eleventy pagination generates ~700 static species factsheets from flat-file data at correct URL slugs
- Fully interactive factsheets: Leaflet occurrence map, phenology bar chart, state/type/year filters, and image slideshow — all as Lit web components loading Parquet asynchronously via hyparquet
- Client-side Pagefind search, alphabetized glossary page, post-build link checker, page weight validator, and data integrity validator
- GitHub Actions CI/CD (deploy + PR check), Docker build environment, and four LLM-actionable `_instructions/` files for non-technical maintainers

## v1.1 Visual Identity (Shipped: 2026-04-18)

**Phases completed:** 1 phase (Phase 6), 2 plans, 3 quick tasks
**Known deferred items at close:** 9 (see STATE.md Deferred Items)

**Key accomplishments:**

- Applied pnwmoths.biol.wwu.edu visual identity to all ~700 pages: cream background, black header/footer, moth-strip banner, Google Fonts (Open Sans + Spinnaker), white content wrapper
- Established post-Vite asset copy pattern (`scripts/copy-images.js`) for CSS and image files that don't survive Eleventy-plugin-vite's output directory swap
- Replaced `species_id` foreign key with `species_slug` in images.csv and records.csv; updated all data loaders, build pipeline, and templates
- Fixed stale contributor doc paths, added devcontainer config, added `.github/copilot-instructions.md` for AI coding assistant context
- Fixed similar species displaying raw slugs instead of display names; fixed `| url` double-prefix on Vite-processed asset paths

## v1.2 Tech Debt (Shipped: 2026-04-18)

**Phases completed:** 1 phase (Phase 7), 1 plan, 2 tasks

**Key accomplishments:**

- `image_filename` in glossary.csv validated against safe-filename pattern at build time; invalid values fail the build with a clear error (WR-01)
- Pagefind CSS `<link>` confirmed in `<head>` — no flash of unstyled content on search page (WR-02)
- DuckDB connection closed in glossary.js — no resource leak warning in build output (WR-03)
- ENOENT guard in check-page-weight.js — missing SITE_DIR logs a warning instead of crashing (WR-04)
- check-page-weight.test.js wired into npm test suite; 37 tests, 37 passing

## v1.3 Visual Browse (Shipped: 2026-04-20)

**Phases completed:** 5 phases (Phases 8–12), 10 plans
**Files changed:** 65 files, +9,156 / -186 LOC

**Key accomplishments:**

- `subfamily` and `navigational` CSV columns added with null-coercion and build-pipeline validation; DuckDB `nullstr = ''` required on both read_csv calls for correct null handling
- Build pipeline emits `species-states.json` (29 DISTINCT species-state pairs) for client-side state filter; `taxon.js` Eleventy data file produces family→subfamily→genus→species tree with up to 4 nav images per level
- `/browse/` rewritten as single dynamic Eleventy page with embedded taxonomy JSON and complete `<noscript>` static listing; per-genus static pages retired
- `<pnwm-taxon-browser>` Lit web component: 4-level accordion expand/collapse with navigation image strips, show/hide images toggle, and state filter that mutes taxa with no records in selected state
- Full production build verified: 58/58 tests green, 0 link errors (lychee), `data-pagefind-ignore` confirmed on taxonomy JSON element

## v1.4 Image CDN (Shipped: 2026-04-22)

**Phases completed:** 5 phases (Phases 13–17), 13 plans
**Files changed:** 72 files, +100,275 / -791 LOC
**Known deferred items at close:** 4 (see STATE.md Deferred Items)

**Key accomplishments:**

- bunny.net Storage Zone + Pull Zone provisioned; 3,880 original Django images uploaded via rclone FTP; Bunny Optimizer active with direct query params for resize/crop; contributor upload workflow documented in `_instructions/UPLOADING_IMAGES.md`
- All Eleventy templates (species.njk, glossary/index.njk) and `pnwm-taxon-browser.js` Lit component updated to serve images via CDN; urlencode Nunjucks filter handles Django filenames with spaces
- 16,191 LFS-tracked files purged from all 356 commits via `git filter-repo --invert-paths`; `.gitattributes` deleted; origin/main force-pushed; CI updated to plain `actions/checkout@v4.3.1`
- Dead species photo copy block removed from `scripts/copy-images.js` (ENOENT risk on fresh clones); confirmed no image resize scripts ever existed; build pipeline clean
- Full legacy MySQL database migrated: 1,348 species + 85,933 PNW occurrence records loaded via streaming readline SQL dump parser, replacing 11-species placeholder stub data; npm run build produces 1,364 species pages; 72/72 tests passing

## v2.0 Glossary Tooltips (Shipped: 2026-04-23)

**Phases completed:** 3 phases (Phases 19–21), 5 plans
**Known deferred items at close:** 5 (see STATE.md Deferred Items)

**Key accomplishments:**

- Build-time Eleventy transform wraps first occurrences of ~70 glossary terms in `<abbr class="glossary-term">` elements with definition and CDN image URL as data attributes; 97/97 unit tests covering escaping, deduplication, and prose-scope guard
- Fixed substituteTerms() with while-loop cursor to wrap all unseen terms in a single text-node pass — both "forewing" and "outer margin" in the same node correctly annotated (gap closure in 19-04)
- Native HTML Popover API (`popover="auto"`) tooltip — per-term popovers with getBoundingClientRect positioning below the term; keyboard/Escape/click-outside dismiss; no external library
- CDN glossary images displayed in popovers when `image_filename` set in glossary.csv; graceful no-image fallback; definitions in `data-*` attributes keep Pagefind index clean
- No-JS degradation via `<abbr title="...">` native browser tooltip preserved across all 1,364 species pages

## v2.1 Species Fact Sheet Gaps (Shipped: 2026-05-20)

**Phases completed:** 4 phases (Phases 22–25), 5 plans, 64 commits
**Files changed:** 61 files, +19,241 / -8,632 LOC
**Timeline:** 2026-04-27 → 2026-05-20 (23 days)

**Key accomplishments:**

- Phenology chart axis labels ("Month" X, "# Records" Y) with `beginAtZero` Y-floor — Chart.js `scales` block, no new imports (CHART-01, CHART-02)
- 93px horizontal thumbnail strip replacing dot navigation; lightbox close fixed via sibling-walk `inert` pattern; lightbox z-index raised above Leaflet controls; `min-width: 0` on CSS grid children (PHOTO-01, PHOTO-02, PHOTO-03)
- `filterRecords()` extended with county, collection, and elevation dimensions; 10 new TDD tests locked behavioral contract including null-elevation passthrough (FILT-01, FILT-02, FILT-03)
- County/collection dropdowns and dual-handle elevation range slider in filter bar, wired to `pnwm-filter-change` event bus; phenology chart stays in DOM with zero-height bars on filter-returns-empty (FILT-04)
- Horizontal scrollable similar-species thumbnail row (CDN thumbnails at 93px, gray `#d6d0bc` placeholder fallback, clickable links) inside `.species-photos` div below carousel — pure static HTML, scientific-name labels (SIM-01, SIM-02)

## v2.2 High-resolution species photos (Shipped: 2026-05-24)

**Phases completed:** 7 phases (Phases 26–32), 23 plans, 159 commits
**Files changed:** 349 (+30,984 / −41,247 LOC)
**Timeline:** 2026-05-20 → 2026-05-24 (4 days)

**Key accomplishments:**

- Resumable Dropbox ingest pipeline: 4,935 TIFFs catalogued with filename parser (77.3% clean-match, 14.1% genus-only, 8.2% likely-synonym); durable `data/species-photos-manifest.csv` as source of truth with per-row status tracking and exponential-backoff retry
- Synonym curation tooling: `data/species-synonyms.csv` + `loadSynonyms`/`classify()` pre-pass + `photos:investigate` RESORT_ONLY reclassification + curator runbook `_instructions/CURATING_SPECIES_SYNONYMS.md`
- End-to-end vertical-slice pilot on one species (_abagrotis-apposita_): DZI tiles locally via libvips, uploaded to bunny.net, hand-edited into data JSON, rendered in OpenSeadragon lightbox — surfaces integration risks before bulk commit; PILOT-LESSONS.md seeds Phase 29 committed config
- libvips DZI tile generation pipeline: `scripts/tile-photos.js` manifest-driven, idempotent per-row via status + on-disk .dzi guards, WebP format pinned in committed `tile-config.json`; operator runbook `_instructions/TILING_HIGH_RES_PHOTOS.md`
- Bulk bunny.net tile upload: `scripts/upload-tiles.js` with pre-flight footprint walk, DRY_RUN guard, idempotent rerun, `advanceStatus` before file deletion (D-03 ordering invariant); operator runbook `_instructions/UPLOADING_TILES.md`
- `data/species-photos.json` build integration: `scripts/generate-species-photos.js` materializes manifest `uploaded` rows to JSON; `high_res_available` boolean in Eleventy data tree; DATA-03 template guard suppresses legacy low-res entries for high-res species
- OpenSeadragon viewer generalized to all `high_res_available: true` species: `_prevSpecimen`/`_nextSpecimen` in-lightbox prev/next buttons, `viewer.open()` to swap DZI tile sources, specimen metadata (id + D/V) displayed inline; Phase 23 carousel unchanged

---
