# PNW Moths Static Site

## What This Is

A proof-of-concept reconstruction of pnwmoths.biol.wwu.edu as a fully static site. Built with Eleventy, flat files (CSV + DuckDB/Parquet, Markdown), Vite for client-side JavaScript, and Lit web components. v1.0 demonstrated that a static approach can be cheap to host, safe to run, and maintainable by non-technical contributors without a server or database.

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

### Active

- [ ] Eleventy build time verified under 5 minutes on GitHub Actions (MAINT-03 — requires live CI observation)
- [ ] Site deployed to real hosting (GitHub Pages or equivalent) with real species/records data
- [ ] Real occurrence records and species data loaded (currently 5 stub species, 10 stub records)

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

**v1.0 shipped:** 2026-04-12 — 5 phases, 12 plans, ~3,800 LOC (JS/Nunjucks/CSS)

**Tech stack:**
- Eleventy 3.x (SSG), Vite (JS bundling), DuckDB (build-time queries), Parquet + hyparquet (client-side occurrence data)
- Lit web components, Leaflet (map), Pagefind (static search), Pico CSS (base styles)
- GitHub Actions (CI/CD), Docker (reproducible build environment), lychee (link checker)

**Known tech debt from v1.0:**
- `content/species/acronicta-americana.md` publishes as an orphan page in `_site/content/species/` (no layout, no nav — not linked from anywhere but pollutes output)
- `vite.config.js` has a misleading `emptyOutDir: false` comment; plugin uses `emptyOutDir: true` and renames `_site/`
- Dockerfile lychee binary URL hardcoded to x86_64 (works on Linux CI; wrong binary on ARM hosts)
- No automated test suites — all 5 VALIDATION.md files are in `draft` status

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
*Last updated: 2026-04-12 after v1.0 milestone*
