# PNW Moths Static Site

## What This Is

A proof-of-concept reconstruction of pnwmoths.biol.wwu.edu as a fully static site. Built with Eleventy, flat files (CSV + DuckDB/Parquet, Markdown), Vite for client-side JavaScript, and Lit web components. The site matches pnwmoths.biol.wwu.edu visually and has a clean, tested build pipeline with 191 automated tests. Species fact sheets include an OpenSeadragon deep-zoom viewer (for species with high-res TIFF photos from Dropbox), photo thumbnail carousel, phenology chart with axis labels, occurrence map with county/collection/elevation filters, and a similar species thumbnail row — all as Lit web components loading Parquet asynchronously, with full no-JS static degradation.

## Core Value

Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.

## Last Shipped Milestone: v5.0 Administrative Districts — County Assignment & Browse Filter (Shipped 2026-07-06)

**Next milestone:** not yet defined — start with `/gsd-new-milestone`.

**Goal:** Give every occurrence record an accurate county / regional-district — re-joining the curated legacy assignments, deriving from coordinates to fill gaps and catch data-entry errors — and add a county/regional-district filter to the Browse page scoped to the PNW region. (Issues #25, #96.)

**Delivered:**
- **Re-join legacy district data** — restore the `county_id → species_county.name` mapping the original migration dropped (`records.csv` currently 2.8% filled vs ~96% available in the reference DB); BC records carry **regional districts**, US records carry **counties**
- **Coordinate → district assignment** (#25) — point-in-polygon against boundary shapefiles (US Census counties + BC/Canada regional districts) to fill the remaining ~4% and assign a district to any record on future local upload
- **QC mismatch report** (#25) — non-blocking committed CSV flagging records where the stated county ≠ the coordinate-derived district, or whose coordinates fall outside all known boundaries; curator-reviewable, mirroring the `species-audit.csv` pattern
- **Browse county filter** (#96) — client-side filter on `/browse/` restricted to BC, WA, OR, ID, and western-MT districts (explicit western-MT county list; Alberta and eastern-MT excluded from the dropdown but records keep their assigned district); consistent with the existing state filter and no-JS degradation
- Terminology adapts per jurisdiction ("regional district" for BC, "county" for US states); all TypeScript + Lit, consistent with the v3.0 toolchain and validation gates

## Current State: v5.0 shipped — Administrative Districts

**v5.0 shipped:** 2026-07-06 — 5 phases (44–48), 16 plans, all 14 requirements validated (DIST-01…06, QC-01…03, BFILT-01…05); merged to `main` via PR #122; closes #25, #96. Legacy re-join (`scripts/backfill-legacy-county.ts` + committed `data/district-crosswalk.csv`, name→stable-ID, 3 BC renames) raised `county` fill 2.79%→96.94%, additive-only + idempotent, with a prefixed `district_id` column (`US:<GEOID>`/`CA:<CDUID>`) threaded through the four DuckDB read_csv maps + Zod schema + parquet-cache. WA/OR/ID/MT county + BC regional-district boundaries acquired, simplified (mapshaper), reprojected to WGS84, and committed as `data/boundaries/pnw-districts.geojson`. A shared DB-free axis-order/bounds guard (`scripts/lib/district-assignment.ts`) + coordinate-fill script (`ST_Contains` + ~2 km nearest-boundary fallback) fill blank districts additively; a non-blocking, tiered `_site/records-district-audit.csv` (counts in a JSON sidecar for RFC-4180 validity) flags stated-vs-derived mismatches; and a PNW-scoped cascading county/regional-district filter on `/browse/` mutes taxa with dynamic County/Regional-District labels. Maintainer runbook `_instructions/ASSIGNING_DISTRICTS.md`. **Known gaps (accepted):** valid-coord fill is 99.58% per-state but 57.90% overall because Alberta boundary geometry was only partially acquired (1 of ~19 census divisions) — the Browse filter already excludes Alberta, so no feature is blocked; 2,660 pre-existing BC rows have a county name but no `district_id`; Phase 45's PLAN/SUMMARY artifacts were not retained. Deferred to v5.x: QCX-01, QCX-02, BFILT-06, BFILT-07.

**v4.0 shipped:** 2026-06-27 — 5 phases (39–43), all 43 requirements validated, Phase 43 UAT 5/5. The `/identify/` page lets users narrow 1,228 key-scored species by selecting from 237 character-states across 8 collapsible categories, with a live "N species match" thumbnail grid (OR-within / AND-across / "0 = unscored" semantics, TDD-locked). `data/key-matrix.json` ships matched species × character-states as base64 bitsets with a `meta` block. Character illustrations are bound **authoritatively from the original Lucid3 key data** (`data/key.data` → 180/237 characters; Size & Seasonality have no source art) and shown in a per-state `<details>` CDN expander. A separate **backup→bunny migration** recovered legacy species photos that were never migrated to the CDN — ~150 species across three filename variants (underscore / space-misnamed / hyphen binomial) — closing the grid-thumbnail 404 gaps (#43). Deferred: Identify UI polish (disclosure marker + view-larger), curator alt-text pass, Geometridae release (#48).

**v3.0 complete:** 2026-06-10 — 6 phases (Phases 33–38). Full TypeScript migration of the build pipeline, Eleventy data/config, and Lit web components, with build-time + load-time data validation. CI now gates every PR and deploy on `tsc --noEmit` (both tsconfigs), the 225-test `node --test` suite, a permanent TS-only invariant guard (zero `.js` sources / `allowJs` / `@ts-ignore` / unguarded double-casts), and Parquet schema verification. `_site/` output proven byte-identical to the pre-migration baseline (one-shot proof, MILESTONE-EVIDENCE.md); `build:data` stays at ~3s, well under the 5-minute budget.

**v2.2 shipped:** 2026-05-24 — 7 phases (Phases 26–32), 23 plans, 159 commits, 349 files changed
- Resumable Dropbox ingest: 4,935 TIFFs catalogued with durable manifest (`data/species-photos-manifest.csv`)
- Synonym curation tooling in place; first curator pass not yet performed (~30–80 unresolved binomials)
- libvips DZI tile generation + bunny.net bulk upload pipeline (idempotent, resumable, WebP format)
- `data/species-photos.json` Eleventy data file with per-species `high_res_available` flag
- OpenSeadragon viewer in species lightbox for all `high_res_available: true` species; prev/next specimen navigation; Phase 23 carousel unchanged

## Requirements

### Validated

- ✓ Species list stored in CSV; Eleventy builds pages from flat-file source data — v1.0
- ✓ Per-species Parquet files generated from CSV at build time and deployed alongside HTML — v1.0
- ✓ DuckDB-based build pipeline: CSV → Parquet with pre-flight validation and post-import integrity checks — v1.0
- ✓ Eleventy generates ~700 species pages from a single pagination template — v1.0
- ✓ Each species page includes taxonomy, prose (from per-species Markdown), photos with credit, and similar species links — v1.0
- ✓ Browse pages: all-species grouped by family/genus, per-genus listing, site-wide navigation — v1.0
- ✓ Leaflet occurrence map, phenology chart, state/type/year filters, image slideshow — all as Lit web components loading Parquet asynchronously — v1.0
- ✓ Graceful JS-off degradation: taxonomy, prose, and photos visible as static HTML — v1.0
- ✓ Pagefind static search indexes species pages; excludes occurrence data — v1.0
- ✓ Glossary terms rendered alphabetically from CSV — v1.0
- ✓ Post-build link checker, page weight validator, data integrity validator — v1.0
- ✓ GitHub Actions CI/CD (deploy + PR check); Docker build environment — v1.0
- ✓ LLM-actionable `_instructions/` files for non-technical maintainers — v1.0
- ✓ Vite bundles client-side JS for interactive features — v1.0
- ✓ Site visual identity matches pnwmoths.biol.wwu.edu (cream background, black header/footer, moth-strip banner, Google Fonts) — v1.1
- ✓ All ~700 generated pages inherit visual identity via single `base.njk` layout — v1.1
- ✓ Data linking uses species slug as foreign key in images.csv and records.csv — v1.1
- ✓ `image_filename` in glossary.csv validated against safe-filename pattern at build time — v1.2
- ✓ Pagefind CSS `<link>` in `<head>` (no FOUC on search page) — v1.2
- ✓ DuckDB connection closed in glossary.js (no resource leak) — v1.2
- ✓ ENOENT guard in check-page-weight.js (handles missing files without crash) — v1.2
- ✓ `subfamily` column in `species.csv`; genera without subfamily fall directly under family — v1.3
- ✓ `navigational` flag in `images.csv`; browse falls back to lowest-weight species photos when none flagged — v1.3
- ✓ Build pipeline emits species-×-state JSON (`_site/species-states.json`); `taxon.js` Eleventy data file with family→subfamily→genus→species tree and navImages — v1.3
- ✓ `/browse/` replaced by single dynamic accordion page (Family → Subfamily → Genus → Species) — v1.3
- ✓ Up to 4 navigation images per taxon level; images on by default with show/hide toggle — v1.3
- ✓ Client-side state filter on browse page — v1.3
- ✓ Per-genus static pages (`/browse/{genus}/`) retired — v1.3
- ✓ Images uploaded to bunny.net Storage bucket (3,880 originals from pnwinsects-app Django media dir via rclone FTP); Pull Zone + Optimizer active — v1.4 Phase 13
- ✓ CDN_BASE_URL hard-coded public constant in eleventy.config.js; Image Classes disabled (D-18), direct Optimizer query params used — v1.4 Phase 13
- ✓ Contributor upload workflow documented in `_instructions/UPLOADING_IMAGES.md` (rclone FTP, --ignore-times, cache invalidation) — v1.4 Phase 13
- ✓ All Eleventy templates updated to serve images via CDN; urlencode filter handles Django filenames with spaces — v1.4 Phase 14
- ✓ Git LFS removed: 16,191 tracked files purged from all 356 commits via filter-repo --invert-paths; origin/main force-pushed — v1.4 Phase 15
- ✓ GitHub Actions CI/CD updated: LFS checkout replaced with actions/checkout@v4.3.1 (SHA-pinned) — v1.4 Phase 15
- ✓ Dead species photo copy block removed from copy-images.js; no image resize scripts in build pipeline — v1.4 Phase 16
- ✓ Full legacy dataset migrated: 1,348 species + 85,933 PNW occurrence records from MySQL dump, replacing stub data; 72/72 tests, 1,364 species pages — v1.4 Phase 17
- ✓ Site live on GitHub Pages with full production data — v1.4
- ✓ Build-time glossary term detection in species prose: Eleventy transform wraps first occurrence of each term in `<abbr class="glossary-term">` with definition and CDN image URL as data attributes — v2.0 Phase 19
- ✓ Tooltip/popover shows definition + CDN image for matched glossary terms; image-less terms show definition only — v2.0 Phase 20
- ✓ Graceful no-JS degradation for highlighted terms via `<abbr title="...">` native browser tooltip — v2.0 Phase 19
- ✓ Glossary tooltip implemented as native HTML Popover API with ~89-line vanilla JS handler; no external library — v2.0 Phase 20
- ✓ Pagefind search index unaffected by glossary annotations (definitions in `data-*` attributes, never in DOM at build time) — v2.0 Phase 20
- ✓ Phenology chart X-axis "Month" and Y-axis "# Records" labels; Y-axis begins at 0 and scales to max monthly count — v2.1 Phase 22
- ✓ Photo thumbnail strip (93px) replacing dot navigation; lightbox close button fixed; lightbox z-index above Leaflet controls — v2.1 Phase 23
- ✓ County, collection, and elevation range filters wired to `pnwm-filter-change` event bus; map and phenology chart update in real time — v2.1 Phase 24
- ✓ Similar species horizontal thumbnail row: CDN thumbnails (93px), gray placeholder fallback, clickable links, pure static HTML, placed below photo carousel — v2.1 Phase 25
- ✓ Resumable Dropbox ingest pipeline: API-based one-at-a-time file fetch; filename parser covering all edge cases (hyphenated, 2-char epithets, institutional accessions, provisional bucket); durable `data/species-photos-manifest.csv` with per-row status, content-hash resumability, exponential-backoff retry — v2.2 Phases 26
- ✓ Synonym curation tooling: `data/species-synonyms.csv` maps outdated binomials to current slugs; RESORT_ONLY reclassification without re-downloading; `photos:investigate` surfaces highest-impact decisions first — v2.2 Phase 27
- ✓ End-to-end vertical-slice pilot: one species fully rendered via OSD from bunny.net CDN; PILOT-LESSONS.md seeds tile config for bulk phases — v2.2 Phase 28
- ✓ libvips DZI tile generation pipeline: `scripts/tile-photos.js` manifest-driven, idempotent via status + on-disk .dzi guard, WebP format, tile params committed in `tile-config.json` — v2.2 Phase 29
- ✓ Bulk bunny.net tile upload: `scripts/upload-tiles.js` with pre-flight footprint walk, DRY_RUN guard, idempotent rerun, advanceStatus before file deletion — v2.2 Phase 30
- ✓ `data/species-photos.json` build integration: manifest-derived at build time via `scripts/generate-species-photos.js`; `high_res_available` boolean in Eleventy data tree; legacy low-res entries suppressed for high-res species — v2.2 Phase 31
- ✓ OpenSeadragon viewer in species lightbox for all `high_res_available: true` species; prev/next specimen navigation (viewer.open() to swap DZI sources); specimen_id + D/V view displayed inline; Phase 23 carousel unchanged — v2.2 Phase 32
- ✓ All `src/components/` Lit web components migrated to strict TypeScript (no decorators, `static get properties()` preserved, tests via `node --test` native type-stripping); `pnwm-filter-change` typed via shared `FilterChangeDetail` + global `HTMLElementEventMap` merge; two O(columns/shape) load-time validators (`assertParquetColumns`, `validateSpeciesStates`) at the dynamic CDN boundaries; `src/types/schemas.ts` on `zod/mini` (no full Zod in bundle, +2.7% gzip); build output byte-identical (MIG-04, SCHEMA-08) — v3.0 Phase 37
- ✓ TS toolchain scaffolded: three tsconfigs (browser/node/base), Zod schemas + derived types for all data entities, `npm run typecheck` green — v3.0 Phase 33
- ✓ `scripts/lib/` and `src/_lib/` fully converted to TypeScript, proving the Node 24 native type-stripping path end-to-end (MIG-01) — v3.0 Phase 34
- ✓ All build/data pipeline scripts in `scripts/` converted to TypeScript with Zod validation gates and build-time Parquet/JSON/CSV verification; `build:data` budget confirmed (MIG-02) — v3.0 Phase 35
- ✓ Eleventy data files (`src/_data/`) and `eleventy.config` converted to TypeScript, preserving the `process.env.GITHUB_PAGES`-conditional `pathPrefix` (MIG-03) — v3.0 Phase 36
- ✓ All test files converted to TypeScript and still run via `node --test`; full suite green (MIG-05) — v3.0 Phase 38
- ✓ No `allowJs`, `@ts-ignore`, or unguarded double-casts, and no `.js` source files in any converted area — enforced permanently by `scripts/check-ts-only.sh` (MIG-06) — v3.0 Phase 38
- ✓ `tsc --noEmit` gates the GitHub Actions PR-check and deploy workflows; type errors fail CI (CI-01) — v3.0 Phase 38
- ✓ `_site/` output proven byte-identical to the pre-migration baseline — data files byte-for-byte, HTML identical modulo content-hashed asset names (CI-02) — v3.0 Phase 38
- ✓ `npm run build:data` stays within budget (~3s locally, <60s target) after validation gates added (CI-03) — v3.0 Phase 38
- ✓ `/identify/` page: free-form filter over 237 character-states in 8 collapsible categories; multi-select OR-within / AND-across; "0 = unscored" never excludes; "Clear all"; no-JS degradation — v4.0 Phases 39–41
- ✓ Compact client-loadable key matrix: `key.csv` (237 × 1,228) → `data/key-matrix.json` base64 bitsets with schema + byte-budget gate; species↔key slug matching + coverage report — v4.0 Phases 39–40
- ✓ Live results grid: "N species match" count, thumbnail grid with gray placeholder + load-failure degradation, "0 results" empty state — v4.0 Phase 42
- ✓ Character illustrations bound authoritatively from the original Lucid3 key data (180/237); per-state `<details>` CDN expander; alt-text state-name fallback — v4.0 Phase 43
- ✓ Legacy species-photo CDN 404 gaps recovered from the `pnwmoths_https` backup across three filename variants (underscore / space / hyphen binomial) — v4.0 follow-up (#43)
- ✓ Legacy county/regional-district re-joined onto `records.csv` via a committed name→stable-ID crosswalk (US GEOID / BC CDUID, incl. 3 BC renames), raising county fill 2.79%→96.94%; additive-only + idempotent; `district_id` threaded through DuckDB maps + Zod schema + parquet — v5.0 Phase 44 (DIST-01, DIST-02, #25)
- ✓ WA/OR/ID/MT county + BC regional-district boundaries acquired, simplified, reprojected to WGS84, committed as `data/boundaries/pnw-districts.geojson` with a refresh runbook — v5.0 Phase 45 (DIST-03)
- ✓ Shared point-in-polygon module (mandatory lon/lat axis-order guard + bounds gate) + additive coordinate-fill script with nearest-boundary fallback; valid-coord fill 99.58% ex-Alberta; maintainer runbook — v5.0 Phase 46 (DIST-04, DIST-05, DIST-06, #25)
- ✓ Non-blocking, unlinked `_site/records-district-audit.csv` tiering stated-vs-derived district mismatches (same/adjacent-close/far/outside), counts in a JSON sidecar; missing-coord rows unflagged; build never fails — v5.0 Phase 47 (QC-01, QC-02, QC-03, #25)
- ✓ PNW-scoped county / regional-district Browse filter: build-time `_site/species-districts.json` (compound `${state}:${county}` key, Alberta-dropped, western-MT capped via committed `data/mt-county-allowlist.csv`); cascading single-select district `<select>` on `/browse/` (disabled-until-state, reset-on-change, mute-not-hide, dynamic County/Regional-District label); Alberta dropped from the state filter; no-JS static listing intact — v5.0 Phase 48 (BFILT-01…05, #96)

### Active

- [ ] Eleventy build time verified under 5 minutes on GitHub Actions (MAINT-03 — requires live CI observation)
- [ ] Enable WebP conversion on bunny.net Optimizer (serving JPEG currently; toggle in Pull Zone → Optimizer → WebP conversion)

### Out of Scope

| Feature | Reason |
|---------|--------|
| Admin / editing UI | Editing done in flat files; UX to validate later |
| ~~Zoomify deep-zoom viewer~~ | ~~Complex legacy feature; replaced by lightbox in v1~~ — inverted in v2.2: OSD/DZI deep-zoom for species photos; lightbox hosts the OSD instance |
| ~~Lucid key integration~~ | ~~External tool, not part of static site pipeline~~ — partially inverted in v4.0: the Lucid key's *exported data* (`key.csv` character matrix + character images) is reimplemented as a static, client-side character-filter Identify page; the external Lucid applet itself is still not embedded |
| User submissions / community ID | iNaturalist handles this; adds server infrastructure |
| Server-side search | No server; Pagefind provides static equivalent |
| Real-time data | All data is build-time; live observation feeds out of scope |
| Multi-site support | Original app supported multiple insect sites; this PoC is pnwmoths only |
| Photographic plates page | Deferred to a future feature milestone (PLAT-01, PLAT-02) — not the v3.0 TS rewrite |
| Advanced filtering (collector, elevation, date range) | Deferred to a future feature milestone (FILT-01, FILT-02) — not the v3.0 TS rewrite |
| Django URL redirects | Requires Netlify/Cloudflare; deferred to a future feature milestone (SEO-01) |
| Glossary plural/morphological variant matching (GLOS-07) | Requires stemming or synonym entries; deferred to future milestone |
| CSS Anchor Positioning for tooltip placement (TIP-04) | Baseline 2026; not yet cross-browser |
| Client-side glossary term scanning (runtime JS) | Build-time transform is the agreed approach |
| External tooltip library (Floating UI, Tippy.js) | Native Popover API is sufficient |

## Context

**v1.2 shipped:** 2026-04-18 — 7 phases total, 15 plans, 37 tests passing
**v1.3 shipped:** 2026-04-20 — 12 phases total (Phases 8–12), all 12 requirements verified; 58 tests passing
**v1.4 shipped:** 2026-04-22 — 17 phases total (Phases 13–17); 72/72 tests passing; 1,364 species pages; images on bunny.net CDN; LFS removed; full production dataset live
**v2.0 shipped:** 2026-04-23 — 21 phases total (Phases 19–21); 97/97 tests passing; build-time glossary tooltips with native Popover API; 1,364 species pages with interactive glossary annotations
**v2.1 shipped:** 2026-05-20 — 25 phases total (Phases 22–25); phenology chart axis labels + Y-floor; photo thumbnail carousel; county/collection/elevation filters; similar species thumbnail row; 61 files, +19,241 / -8,632 LOC
**v2.2 shipped:** 2026-05-24 — 32 phases total (Phases 26–32); Dropbox ingest pipeline; synonym curation tooling; libvips DZI tile generation; bunny.net bulk upload; data/species-photos.json build integration; OpenSeadragon viewer for high-res species; 349 files, +30,984 / -41,247 LOC; 191 tests
**v3.0 shipped:** 2026-06-10 — 6 phases (Phases 33–38), 22 plans; full TypeScript migration (pipeline scripts, Eleventy data/config, Lit components) with build-time + load-time data validation; four CI gates (typecheck, 225-test suite, TS-only invariant guard, Parquet verify) wired into PR check + deploy; `_site/` proven byte-identical to pre-migration baseline; zero `.js`/`allowJs`/`@ts-ignore`/unguarded double-casts remain; 229 tests
**v4.0 shipped:** 2026-06-27 — 5 phases (Phases 39–43), 13 plans; `/identify/` character-filter page over a 237-state × 1,228-species bitset key matrix with a live results grid; Lucid3-authoritative character illustrations; legacy species-photo CDN 404 recovery
**v5.0 shipped:** 2026-07-06 — 5 phases (Phases 44–48), 16 plans; county/regional-district assignment (legacy re-join 2.79%→96.94% + coordinate point-in-polygon fill + committed WGS84 boundary GeoJSON), non-blocking tiered QC mismatch report, and a PNW-scoped cascading Browse district filter; closes #25, #96

**Tech stack:**
- Eleventy 3.x (SSG), Vite (JS bundling), DuckDB (build-time queries), Parquet + hyparquet (client-side occurrence data)
- Lit web components, Leaflet (map), Pagefind (static search), Pico CSS (base styles)
- node-html-parser (build-time HTML transform), native Popover API (glossary tooltips)
- GitHub Actions (CI/CD), Docker (reproducible build environment), lychee (link checker)

**Known tech debt (carry forward):**
- MAINT-03: build time under 5 min unverified — requires live CI observation
- No automated visual regression tests for the site's visual identity
- WR-01 (migrate-species): similar_species links silently dropped for record-only species (slug resolution gap)
- WR-02 (migrate-species): safeSpecies sanitization logic duplicated in two loops (maintenance hazard)
- WebP not yet active on bunny.net Optimizer — currently serving JPEG
- v3.0 CI-02: byte-identical `_site/` proof is a one-shot local check (`compare-sites.sh`), deliberately not wired into CI (D-01); CI catches type/test failures but not byte-level data regressions
- v3.0 CI-03: `build:data` timing met empirically (~3s) but not enforced by a CI timeout/assertion (D-07)
- v3.0: `deploy.yml` runs only typecheck (not test/guard/parquet) per D-04/D-05 — relies on PR-check gate + branch protection (follow-up task spawned to harden, WR-01/WR-02 of phase 38 review)
- v3.0 MIG-04: `filterRecords` (parquet-cache.ts) uses an inline structural type instead of importing `FilterChangeDetail` — no compile-time link if the interface gains a field
- v5.0: Alberta boundary geometry only partially acquired (1 of ~19 census divisions) — caps overall coordinate-fill rate to 57.90% (99.58% ex-AB); Browse filter excludes AB so nothing is blocked; widening AB coverage is a deferred acquisition task
- v5.0: 2,660 pre-existing BC rows carry a county name but no `district_id` (additive-only re-join skipped them); fix is a crosswalk name-lookup pass
- v5.0: two known-stale StatCan regional-district names carried verbatim; a Browse display override is deferred
- v5.0: Phase 45 (Boundary Data Acquisition) PLAN/SUMMARY execution artifacts were not retained in `.planning/phases/` (work itself is committed)

**Key data entities:**
- `Species` — genus, species, common name, NOC ID, authority, similar species links
- `SpeciesRecord` — occurrence data: lat/long, state, county, locality, elevation, date, collector, collection, record type
- `SpeciesImage` — photos per species with photographer credit, ordering weight
- `GlossaryWord` — glossary term with optional `image_filename` for CDN images

## Constraints

- **Hosting**: Must deploy as pure static files — no server, no database at runtime
- **Images**: Image assets served from bunny.net CDN; Git LFS removed in v1.4
- **Maintainability**: Non-technical contributors must be able to edit species data and add records without running a build locally (or with minimal tooling)
- **Tech stack**: Eleventy (SSG), Vite (JS bundling), flat files for data storage — start here, change only with reason

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Eleventy over Hugo/Astro | Familiar to user, JS ecosystem, flexible data pipelines | ✓ Good — pagination and data files worked smoothly |
| Flat files over headless CMS | Cheap, Git-native, no external services, LLM-editable | ✓ Good — _instructions/ pattern validated |
| Pagefind for static search | No server required; runs at build time; handles 700+ pages well | ✓ Good — search works; occurrence data correctly excluded |
| DuckDB over SQLite for build-time queries | 100k+ occurrence records; better analytical query performance | ✓ Good — `@duckdb/node-api` works; use `.getRowObjectsJS()` and `closeSync()` |
| Parquet + hyparquet for client-side occurrence data | Async loading avoids large inline JSON payloads; columnar compression efficient | ✓ Good — requires Snappy compression (not ZSTD); use `COMPRESSION snappy` in DuckDB export |
| Lit for client-side components | Lightweight web components standard; lower churn than framework alternatives | ✓ Good — light DOM required for Leaflet; CSS custom properties unavailable in Canvas 2D |
| Git LFS for image assets | Keeps images in repo without bloating git history | ✗ Replaced — bunny.net CDN; LFS purged from all history via filter-repo (v1.4) |
| CDN_BASE_URL as public constant (not env var) | URL is intentionally public; no secret needed; simpler for non-technical maintainers | ✓ Good — eliminates dotenv machinery; hard-coded in eleventy.config.js (v1.4) |
| Clone from LOCAL repo for LFS history rewrite | Local working copy had 60+ unpushed commits; cloning from GitHub would have lost Phase 13/14 work | ✓ Good — critical pattern for force-push workflows with ahead-of-remote local commits (v1.4) |
| Module-level CDN constant in web components (not Lit property) | CDN URL is static; no need for reactive property; simpler and avoids attribute plumbing | ✓ Good — CDN_BASE_URL in pnwm-taxon-browser.js as module-level const (v1.4) |
| Streaming readline for large SQL dump parsing | 634 MB dump exceeds Node.js 512 MB string-length limit; createReadStream + readline is safe equivalent | ✓ Good — migrate-species.js handles full dump without memory crash (v1.4) |
| DB genus+species slug for records.csv | Image-derived slugs differ from DB slugs for ~326 reclassified species; build-data.js JOIN uses lower(genus\|\|'-'\|\|species) | ✓ Good — records correctly join to species in full dataset (v1.4) |
| Docker for build environment | Reproducible builds locally and in CI | ✓ Good — Docker cold-start issue resolved; anonymous volume protects node_modules |
| Pico CSS design token overrides via theme.css | No Pico source modification; clean separation; one file controls all brand tokens | ✓ Good — applied to all ~700 pages via single base.njk link |
| Post-Vite asset copy in scripts/copy-images.js | eleventy-plugin-vite wipes _site/ during build; passthrough copies don't survive Vite's output directory rename | ✓ Good — extends existing copy-images.js pattern cleanly |
| species_slug as foreign key in images.csv and records.csv | Slug is stable, human-readable, and matches URL structure; id is an implementation detail | ✓ Good — slug-keyed CSVs are easier for non-technical contributors to edit |
| JSON over Parquet for species-states.json | At 700 species × ~6 states (~4,200 pairs, ~20–30 KB), hyparquet overhead not justified | ✓ Good — simple fetch + parse, no extra dependency |
| Light DOM for Lit accordion (`createRenderRoot() { return this; }`) | Pico CSS element selectors don't penetrate shadow DOM; must decide at creation, not retrofit | ✓ Good — Pico styles apply correctly; CSS custom properties unavailable in Canvas 2D (pre-existing constraint) |
| DuckDB `nullstr = ''` on read_csv for species.csv | Blank `subfamily` must arrive as null, not empty string, to avoid silent grouping failures | ✓ Good — null-coercion works correctly; required on both read_csv calls |
| Taxonomy JSON as `<script type="application/json" id="taxon-data">` sibling | `data-taxonomy` attribute causes HTML entity encoding of JSON; separate script tag avoids this | ✓ Good — `| safe` on tojson output also required in template |
| Raw `/images/...` paths in templates (not `| url` filter) | Vite HTML transformer double-prefixes asset URLs when Eleventy `| url` filter has already added pathPrefix | ✓ Good — let Vite add base prefix; don't pre-process with `| url` |
| node-html-parser for build-time text-node transform | ~10x faster than JSDOM/cheerio; zero native dependencies; sufficient text-node walk API | ✓ Good — v2.0; loads glossary.csv at Eleventy startup, not per-transform |
| `seen` Set initialized per-transform-invocation (not module scope) | Module-scope Set causes silent first-occurrence failures across pages | ✓ Good — v2.0; critical pattern for stateful build-time transforms |
| substituteTerms() while-loop with pos cursor | Single-substitution-per-call pattern silently dropped positionally-earlier shorter terms in same text node | ✓ Good — v2.0; one exchangeChild call wraps all unseen terms per text node |
| Native HTML Popover API (`popover="auto"`) over custom tooltip div | Browser-native; Escape + click-outside-to-close for free; no external library dependency | ✓ Good — v2.0; per-term popover elements injected at runtime, positioned via getBoundingClientRect |
| Definitions in `data-definition` attribute (not DOM text) | Keeps definition text out of Pagefind index; popover content materialized only at runtime | ✓ Good — v2.0; QA-02 verified: Pagefind excerpts contain no definition text |
| Chart.js v4 axis titles via `scales.{x,y}.title.{display,text}` | No Title plugin import needed; built into CategoryScale/LinearScale | ✓ Good — v2.1 Phase 22; `beginAtZero: true` preferred over `min: 0` for semantic clarity |
| Sibling-walk `inert` for lightbox focus trap | `main.inert` self-blocks the Lit shadow DOM — walk from host to `<body>`, inert siblings at each level, leave ancestor chain interactive | ✓ Good — v2.1 Phase 23; also requires z-index 9000 to clear Leaflet controls at z-index 1000 |
| `min-width: 0` on CSS grid `1fr` children | Without it, `1fr` cells expand past allocation to fit content (overflow into adjacent column) | ✓ Good — v2.1 Phase 23; applied to `.species-photos` and `.species-data` |
| ResizeObserver guard: only update state when value changes | Setting reactive Lit property unconditionally inside ResizeObserver callback causes infinite re-render loop | ✓ Good — v2.1 Phase 23; guard pattern: `if (overflows !== this._stripOverflows) this._stripOverflows = overflows` |
| Null elevation passthrough: no null guard on `r.elevation_ft` | `null < N` evaluates false in JS; null records pass through at default bounds (0, 15000) without an explicit guard | ✓ Good — v2.1 Phase 24; behavior explicitly tested in TDD suite |
| Phenology chart stays in DOM with zero-height bars on filter-returns-empty | Removing the canvas destroys the Chart.js instance; re-inserting a detached canvas causes stale renderer errors | ✓ Good — v2.1 Phase 24 |
| Elevation slider uses `String()` coercion on Lit `.value` binding | Lit treats `Number` type as a Lit property and loses reactive sync with the native range input | ✓ Good — v2.1 Phase 24 |
| Similar species section inside `.species-photos` div under carousel | Visually adjacent to photos (user-directed); `.species-photos` div now contains both carousel and similar-species row | ✓ Good — v2.1 Phase 25; future phases must be aware of this combined structure |
| DRY_RUN guard before BUNNY_API_KEY guard in upload-tiles.js | Enables `DRY_RUN=1 npm run photos:upload` without needing a real API key — useful for pre-flight inspection before committing to a multi-hour run | ✓ Good — v2.2 Phase 30; pattern should be applied to any future upload scripts |
| `advanceStatus(row, 'uploaded')` before `rm`/`unlink` deletion | Status must be committed to the in-memory row before tile files are deleted — if deletion fails, row is still marked uploaded and next run skips it safely | ✓ Good — v2.2 Phase 30; D-03 ordering invariant: status advance always precedes file deletion |
| Self-contained per-script helpers (redact, withRetry, logStage, walk) | Project convention: helpers copied verbatim into each script rather than imported from a shared module — avoids cross-script coupling, keeps each script independently executable | ✓ Good — v2.2 Phase 30; same pattern used in tile-photos.js, upload-plates.js, upload-tiles.js |
| Pre-flight footprint walk uses synchronous readdirSync/statSync | One-time startup cost (30–90s for ~447k files) is acceptable; avoids async complexity in a function that runs once before the main event loop | ✓ Good — v2.2 Phase 30; print the measuring message BEFORE starting the walk so operator knows to wait |
| Vertical-slice pilot phase before bulk phases | Insert a one-species E2E pilot phase (Phase 28) before committing ~1 TB of tiles — surfaces URL conventions, CORS config, OSD aesthetics, and CDN reachability at zero bulk cost | ✓ Good — v2.2 Phase 28; PILOT-LESSONS.md revealed WebP format preference and DROPBOX_TOKEN scope requirements before bulk run |
| WebP (.webp[Q=80]) for DZI tile output | Pilot confirmed ~30% smaller than JPEG; OSD handles WebP DZI format correctly; config in committed tile-config.json | ✓ Good — v2.2 Phase 28/29; WebP is now the locked tile format |
| `species_slug` lowercased unconditionally in tilePrefix | Mixed-case slugs in the manifest (from Phase 28 pilot) caused CDN path mismatches; lowercase-always prevents case collisions regardless of manifest source | ✓ Good — v2.2 Phase 29; applied unconditionally, not conditionally |
| Dropbox shared_link path_display fallback to '/' + entry.name | shared_link API does not return path_display for some entries; '/' + entry.name is a safe fallback that preserves manifest resumability via content_hash | ✓ Good — v2.2 Phase 29 fix; manifest backfilled after discovery |
| `viewer.open()` to swap DZI tile sources between specimens | Reuses the existing OSD instance rather than destroying/recreating it for each prev/next navigation — avoids flash and re-initialization cost | ✓ Good — v2.2 Phase 32; pattern for any multi-image OSD viewer |
| Additive-only district assignment (never overwrite a stated county) | Curator-entered data is authoritative; disagreements are flagged in the QC report, never silently replaced (issue #25 intent) | ✓ Good — v5.0; re-join + coord-fill both idempotent, 0 overwrites |
| `district_id` as prefixed VARCHAR (`US:<GEOID>`/`CA:<CDUID>`), never INTEGER | Preserves zero-padded GEOID/CDUID and disambiguates US vs CA namespaces; a numeric type would drop leading zeros | ✓ Good — v5.0; threaded through all DuckDB maps + Zod as `z.nullable(z.string())` |
| Name→stable-ID crosswalk (not raw name string-matching at join) | Legacy names drift (renames like "Skeena-Queen Charlotte"→"North Coast"); a committed crosswalk keeps joins deterministic and curator-reviewable | ✓ Good — v5.0 Phase 44 |
| QC mismatch report is advisory, never build-blocking | Legacy georeferencing noise near boundaries would otherwise block deploys; report is unlinked and mirrors `species-audit.csv` | ✓ Good — v5.0 Phase 47 |
| Tier-summary counts in a JSON sidecar (not a `#`-commented CSV preamble) | A commented preamble breaks RFC-4180 (header must be line 1); sidecar keeps at-a-glance counts without corrupting the CSV | ✓ Good — v5.0 Phase 47; curator-legibility checkpoint catch |
| `ST_Boundary()` wrap on ST_DWithin/ST_Distance operands | This DuckDB spatial build silently returns 0/true for raw Polygon-Polygon pairs regardless of separation | ✓ Good — v5.0 Phase 47; ST_Touches unaffected |
| District audits join by positional `row_index`, never content tuple | `(species_slug, lat, lon, state, county)` is empirically non-unique across records | ✓ Good — v5.0 Phase 47 |
| Browse district aggregate compound-keyed `${state}:${district}` | County names collide across states (e.g. Lincoln, Lake); a bare county name would merge unrelated taxa | ✓ Good — v5.0 Phase 48 |
| Alberta / eastern-MT excluded from the Browse dropdown (records keep values) | Out of the PNW region scope (#96); filtering happens once at build time in the emitter, browser never re-derives | ✓ Good — v5.0 Phase 48 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-06 after v5.0 milestone — Administrative Districts (Issues #25, #96) COMPLETE and archived: Phases 44–48 shipped (16 plans, 14/14 requirements validated), merged to `main` via PR #122. Next milestone not yet defined — start with `/gsd-new-milestone`.*
