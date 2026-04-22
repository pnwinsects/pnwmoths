# PNW Moths Static Site

## Current Milestone: v1.4 Image CDN

**Goal:** Migrate image storage from Git LFS to bunny.net object storage with CDN-native on-the-fly resizing, removing build-time resize scripts and LFS.

**Target features:**
- Upload original images (from pnwinsects-app Django media dir) to bunny.net Storage bucket; discard downsized LFS copies
- Remove Git LFS from repo; LFS-tracked image files gone from history
- `CDN_BASE_URL` env var required in all environments; templates always use CDN URLs
- bunny.net Image Optimizer handles thumbnail sizes previously baked in at build time
- CLI upload workflow (rclone or bunny CLI) + updated `_instructions/` for contributors
- Build pipeline: remove image resize scripts; CI/CD drops LFS checkout
- HTML continues to be served from GitHub Pages

## What This Is

A proof-of-concept reconstruction of pnwmoths.biol.wwu.edu as a fully static site. Built with Eleventy, flat files (CSV + DuckDB/Parquet, Markdown), Vite for client-side JavaScript, and Lit web components. The site matches pnwmoths.biol.wwu.edu visually (cream background, black header/footer, moth-strip banner, Google Fonts) and has a clean, tested build pipeline with 37 automated tests across the data pipeline and validation scripts.

## Core Value

Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.

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

### Active

- [ ] Images uploaded to bunny.net Storage bucket from original source (pnwinsects-app Django media dir)
- [ ] Git LFS removed from repo; LFS-tracked image files purged
- [ ] `CDN_BASE_URL` env var wired into Eleventy build; all image URLs resolve via CDN
- [ ] bunny.net Image Optimizer configured for on-the-fly resizing; build-time resize scripts removed
- [ ] CLI upload workflow documented in `_instructions/` for contributors
- [ ] GitHub Actions CI/CD updated to drop LFS checkout; `CDN_BASE_URL` secret configured
- [ ] Eleventy build time verified under 5 minutes on GitHub Actions (MAINT-03 — requires live CI observation)
- ✓ Full species dataset migrated from legacy MySQL dump: 1,348 species + 85,933 PNW occurrence records in data/species.csv and data/records.csv — v1.4 Phase 17
- [ ] Site deployed to real hosting (GitHub Pages) with real species/records data

### Out of Scope

| Feature | Reason |
|---------|--------|
| Admin / editing UI | Editing done in flat files; UX to validate later |
| Zoomify deep-zoom viewer | Complex legacy feature; replaced by lightbox in v1 |
| Lucid key integration | External tool, not part of static site pipeline |
| User submissions / community ID | iNaturalist handles this; adds server infrastructure |
| Server-side search | No server; Pagefind provides static equivalent |
| Real-time data | All data is build-time; live observation feeds out of scope |
| Multi-site support | Original app supported multiple insect sites; this PoC is pnwmoths only |
| Photographic plates page | Deferred to v2 (PLAT-01, PLAT-02) |
| Advanced filtering (collector, elevation, date range) | Deferred to v2 (FILT-01, FILT-02) |
| Glossary term highlighting in prose | Deferred to v2 (GLOS-02) |
| Django URL redirects | Requires Netlify/Cloudflare; deferred to v2 (SEO-01) |

## Context

**v1.2 shipped:** 2026-04-18 — 7 phases total, 15 plans, 37 tests passing
**v1.3 shipped:** 2026-04-20 — 12 phases total (Phases 8–12), all 12 requirements verified; 58 tests passing
**Current state:** v1.3 complete; no active phases; future work in backlog (999.1, 999.2) and Future Requirements

**Tech stack:**
- Eleventy 3.x (SSG), Vite (JS bundling), DuckDB (build-time queries), Parquet + hyparquet (client-side occurrence data)
- Lit web components, Leaflet (map), Pagefind (static search), Pico CSS (base styles)
- GitHub Actions (CI/CD), Docker (reproducible build environment), lychee (link checker)

**Known tech debt (carry forward):**
- MAINT-03: build time under 5 min unverified — requires live CI observation
- No automated visual regression tests for the site's visual identity
- Code review WR-01–03: test cleanup paths could be more robust (warnings, non-blocking)

**Key data entities:**
- `Species` — genus, species, common name, NOC ID, authority, similar species links
- `SpeciesRecord` — occurrence data: lat/long, state, county, locality, elevation, date, collector, collection, record type
- `SpeciesImage` — photos per species with photographer credit, ordering weight
- `GlossaryWord` — glossary with optional images

## Constraints

- **Hosting**: Must deploy as pure static files — no server, no database at runtime
- **Images**: Image assets tracked in repo via Git LFS
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
| Git LFS for image assets | Keeps images in repo without bloating git history | — Pending (not yet deployed with real images) |
| Docker for build environment | Reproducible builds locally and in CI | ✓ Good — Docker cold-start issue resolved; anonymous volume protects node_modules |
| Pico CSS design token overrides via theme.css | No Pico source modification; clean separation; one file controls all brand tokens | ✓ Good — applied to all ~700 pages via single base.njk link |
| Post-Vite asset copy in scripts/copy-images.js | eleventy-plugin-vite wipes _site/ during build; passthrough copies don't survive Vite's output directory rename | ✓ Good — extends existing copy-images.js pattern cleanly |
| species_slug as foreign key in images.csv and records.csv | Slug is stable, human-readable, and matches URL structure; id is an implementation detail | ✓ Good — slug-keyed CSVs are easier for non-technical contributors to edit |
| JSON over Parquet for species-states.json | At 700 species × ~6 states (~4,200 pairs, ~20–30 KB), hyparquet overhead not justified | ✓ Good — simple fetch + parse, no extra dependency |
| Light DOM for Lit accordion (`createRenderRoot() { return this; }`) | Pico CSS element selectors don't penetrate shadow DOM; must decide at creation, not retrofit | ✓ Good — Pico styles apply correctly; CSS custom properties unavailable in Canvas 2D (pre-existing constraint) |
| DuckDB `nullstr = ''` on read_csv for species.csv | Blank `subfamily` must arrive as null, not empty string, to avoid silent grouping failures | ✓ Good — null-coercion works correctly; required on both read_csv calls |
| Taxonomy JSON as `<script type="application/json" id="taxon-data">` sibling | `data-taxonomy` attribute causes HTML entity encoding of JSON; separate script tag avoids this | ✓ Good — `| safe` on tojson output also required in template |
| Raw `/images/...` paths in templates (not `| url` filter) | Vite HTML transformer double-prefixes asset URLs when Eleventy `| url` filter has already added pathPrefix | ✓ Good — let Vite add base prefix; don't pre-process with `| url` |

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
*Last updated: 2026-04-21 after v1.4 milestone start*
