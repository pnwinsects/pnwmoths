# Milestones

## v1.0 MVP (Shipped: 2026-04-13)

**Phases completed:** 5 phases, 12 plans, 7 tasks

**Key accomplishments:**

- CSV → DuckDB → per-species Parquet build pipeline with pre-flight UTF-8 validation and data integrity checks
- Eleventy pagination generates ~700 static species factsheets from flat-file data at correct URL slugs
- Fully interactive factsheets: Leaflet occurrence map, phenology bar chart, state/type/year filters, and image slideshow — all as Lit web components loading Parquet asynchronously via hyparquet
- Client-side Pagefind search, alphabetized glossary page, post-build link checker, page weight validator, and data integrity validator
- GitHub Actions CI/CD (deploy + PR check), Docker build environment, and four LLM-actionable `_instructions/` files for non-technical maintainers

---
