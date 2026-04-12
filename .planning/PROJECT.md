# PNW Moths Static Site

## What This Is

A proof-of-concept reconstruction of pnwmoths.biol.wwu.edu as a fully static site. Built with Eleventy, flat files (CSV + DuckDB/Parquet, Markdown), Vite for client-side JavaScript, and Lit web components. The goal is to validate whether a static approach can be cheap to host, safe to run, and maintainable by non-technical contributors without a server or database.

## Core Value

Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.

## Requirements

### Validated

- [x] Eleventy builds species pages from flat-file source data (Validated in Phase 01: data-pipeline-foundation)
- [x] Per-species Parquet files are generated from CSV at build time and deployed alongside HTML (Validated in Phase 01: data-pipeline-foundation)
- [x] DuckDB-based build pipeline processes CSV → Parquet with validation (Validated in Phase 01: data-pipeline-foundation)

### Active

- [ ] Eleventy scales to ~700 species pages at acceptable speed
- [ ] Per-species occurrence records (lat/long, date, collector, location, record type) are joined to species pages at build time from CSV/SQLite
- [ ] Static search (Pagefind or similar) indexes the full species catalog
- [ ] Vite bundles client-side JS for interactive features (map, chart, image slideshow)
- [ ] Validation scripts catch broken links, missing images, and excessive page weight before deploy
- [ ] Site is deployable as pure static files (GitHub Pages or similar, no server required)
- [ ] LLM instruction files document how to add/edit species, records, and content

### Out of Scope

- Faithful visual reproduction of the original site — this is a tech PoC, not a redesign
- Admin UI for editing data — editing is done in flat files; UX to be validated later
- Image assets in git history — tracked via Git LFS instead
- Zoomify deep-zoom viewer — complex legacy feature; stub or replace with lightbox
- Lucid key — external tool integration, not core to static site validation
- CMS-managed rich text (django-cms placeholders) — replace with Markdown files per species

## Context

The existing site (pnwmoths.biol.wwu.edu) is a Django + django-cms application that gets crawled nightly and published as a static snapshot. It has not been actively maintained and some JavaScript is broken. The project supports multiple insect sites but only pnwmoths ever had content built out.

**Key data entities from the existing model:**
- `Species` — genus, species, common name, NOC ID, authority, similar species links
- `SpeciesRecord` — occurrence data: lat/long, state, county, locality, elevation, date, collector, collection, record type (specimen/photograph/literature/field notes)
- `SpeciesImage` — photos per species with photographer credit, ordering weight
- `PlateImage` — multi-species photographic plates
- `GlossaryWord` — glossary with optional images
- `State`, `County`, `Collector`, `Collection`, `Photographer`, `Author` — reference tables

**Key pages:** home, browse (by family/genus), species factsheet, full browse list, photographic plates, glossary, search.

**Factsheet complexity:** The per-species page is the most complex — it embeds occurrence JSON at build time for client-side map and phenology chart rendering. This is the critical build-time data join to validate.

## Constraints

- **Hosting**: Must deploy as pure static files — no server, no database at runtime
- **Images**: Image assets tracked in repo via Git LFS
- **Maintainability**: Non-technical contributors must be able to edit species data and add records without running a build locally (or with minimal tooling)
- **Tech stack**: Eleventy (SSG), Vite (JS bundling), flat files for data storage — start here, change only with reason

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Eleventy over Hugo/Astro | Familiar to user, JS ecosystem, flexible data pipelines | — Pending |
| Flat files over headless CMS | Cheap, Git-native, no external services, LLM-editable | — Pending |
| Pagefind for static search | No server required; runs at build time; handles 700+ pages well | — Pending |
| DuckDB over SQLite for build-time queries | 100k+ occurrence records; better analytical query performance | Validated Phase 01 — `@duckdb/node-api` works; use `.getRowObjectsJS()` and `closeSync()` |
| Parquet + hyparquet for client-side occurrence data | Async loading avoids large inline JSON payloads; columnar compression efficient for this data shape | Partially validated Phase 01 — Parquet generation works; client-side loading in Phase 03 |
| Lit for client-side components | Lightweight web components standard; lower churn than framework alternatives | — Pending |
| Git LFS for image assets | Keeps images in repo (no missing-file problem) without bloating git history | — Pending |
| Docker for build environment | Reproducible builds locally and in CI; no "works on my machine" for maintainers | — Pending |

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
*Last updated: 2026-04-12 after Phase 01 (data-pipeline-foundation) complete*
