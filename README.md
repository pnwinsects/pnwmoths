# PNW Moths

A static rebuild of [pnwmoths.biol.wwu.edu](https://pnwmoths.biol.wwu.edu) — a natural history catalog of Pacific Northwest moths.

The site is generated entirely at build time from flat files (CSV + Markdown). There is no server or database at runtime. Each species page includes taxonomy, prose description, photos, occurrence map, phenology chart, and similar species links.

## How it works

Data lives in `data/`:
- `species.csv` — taxonomy, common names, NOC IDs
- `records.csv` — ~100k occurrence records (lat/long, date, collector, record type)
- `glossary.csv` — illustrated glossary terms

At build time, a DuckDB script joins the CSVs, validates integrity, and exports a per-species Parquet file alongside each HTML page. The browser loads occurrence data asynchronously from those Parquet files — nothing is embedded inline.

The site is built with [Eleventy](https://www.11ty.dev/) (HTML generation), [Vite](https://vite.dev/) (JS bundling), and [Lit](https://lit.dev/) web components for the interactive factsheet features (map, chart, filters, slideshow). Search is powered by [Pagefind](https://pagefind.app/), which indexes the site at build time.

## Deployment

A push to `main` triggers GitHub Actions: build → index → validate → deploy to GitHub Pages. The full build runs in Docker for local reproducibility. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup instructions.

## Adding content

Plain-English instructions for common maintenance tasks are in [`_instructions/`](_instructions/):

- [`ADDING_SPECIES.md`](_instructions/ADDING_SPECIES.md)
- [`ADDING_RECORDS.md`](_instructions/ADDING_RECORDS.md)
- [`EDITING_DESCRIPTION.md`](_instructions/EDITING_DESCRIPTION.md)
- [`ADDING_PHOTO.md`](_instructions/ADDING_PHOTO.md)
- [`ADDING_PLATE.md`](_instructions/ADDING_PLATE.md)

## License

Data and content © respective contributors. Code MIT.
