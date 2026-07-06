# Contributing

## Prerequisites

- [Node.js 24](https://nodejs.org/) (or use [nvm](https://github.com/nvm-sh/nvm): `nvm use`)
- [lychee](https://lychee.cli.rs/) — required locally for `npm run build:validate-links` (the Docker path includes it automatically)

Or use Docker to skip local tooling (see below).

## Local build

```sh
npm install
npm run build
```

The build runs ~16 steps; the main stages (the full, authoritative order lives in [`package.json`](package.json)):

| Step | Command | What it does |
|------|---------|--------------|
| Data | `npm run build:data` | Validates CSVs, imports to DuckDB, exports per-species Parquet files |
| HTML | `npm run build:eleventy` | Generates ~700 species pages and all browse/search/glossary pages |
| Parquet copy | `npm run build:copy-parquet` | Copies Parquet files into `_site/` after Vite rewrites the output dir |
| Search index | `npm run build:pagefind` | Indexes all pages for client-side search |
| Link check | `npm run build:validate-links` | Fails on broken internal links (requires lychee) |
| Page weight | `npm run build:check-weight` | Warns when any page exceeds the size threshold |

Output lands in `_site/`.

The full step ordering lives in [`package.json`](package.json), not in the CI workflows — the workflows just call a script. `build:site` produces and verifies `_site/` (data → HTML → gates → copies → search index → `verify:parquet`); `build` is `build:site` plus a blocking link check, for local and PR use. Deploys run `build:site` and then the link check as a separate, non-blocking step.

## Docker build

Reproduces the CI environment exactly — no local Node.js or lychee needed.

```sh
# Interactive shell inside the container
docker compose run --rm dev

# Then inside the container:
npm run build
```

The `node_modules` directory is isolated inside the container via an anonymous volume; it will not appear in your working directory.

## Tests

```sh
npm test
```

Tests cover the data pipeline (`scripts/build-data.test.ts`) and Lit components (`src/components/*.test.ts`).

## CI

Three workflows run on GitHub Actions:

- **`production.yml`** — on push to `main`, builds the site at root `/` and uploads `_site` additively to the Bunny Storage Zone (production, <https://moths.pnwinsects.org/>)
- **`staging.yml`** — manual (`workflow_dispatch`) GitHub Pages staging deploy, builds under `/pnwmoths/`
- **`pr-check.yml`** — full build + link check on pull requests

**Required secret:** the production deploy needs the repository secret `BUNNY_STORAGE_PASSWORD` (the Bunny `pnwmoths` Storage Zone password), set at GitHub → Settings → Secrets and variables → Actions. Until it exists, the upload step fails (the rest of CI still runs).

## Project structure

```
data/               CSV source data (species, records, glossary) + plates.json manifest
data/parquet/       Generated per-species Parquet files (build output, gitignored)
scripts/            Build pipeline scripts (build-data.ts, copy-parquet.ts, etc.)
src/
  _data/            Eleventy data files (query DuckDB at build time)
  _includes/        Nunjucks layouts and partials
  components/       Lit web components (map, chart, filter bar, slideshow)
  content/species/  Per-species Markdown prose descriptions (optional, one file per species)
  species/          Species factsheet template
  browse/           Browse and genus listing templates
  search/           Search page
  glossary/         Glossary page
_instructions/      Plain-English maintainer guides
.github/workflows/  CI/CD
```

## Data conventions

- **Species slug:** `(genus + '-' + species).toLowerCase()`, alphanumeric and hyphens only — the canonical key across CSVs and URLs; see [`CONTEXT.md`](CONTEXT.md) / [ADR 0010](docs/adr/0010-slug-foreign-key.md)
- **Parquet path:** `data/parquet/{slug}/records.parquet` → deployed to `_site/species/{slug}/records.parquet`
- **Prose path:** `src/content/species/{slug}.md` — rendered into the factsheet if present

