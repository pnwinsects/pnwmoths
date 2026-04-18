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

---
