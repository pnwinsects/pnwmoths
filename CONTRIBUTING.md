# Contributing

## Prerequisites

- [Node.js 22](https://nodejs.org/) (or use [nvm](https://github.com/nvm-sh/nvm): `nvm use`)
- [Git LFS](https://git-lfs.com/) — images are tracked via LFS; run `git lfs install` once
- [lychee](https://lychee.cli.rs/) — required locally for `npm run build:validate-links` (the Docker path includes it automatically)

Or use Docker to skip local tooling (see below).

## Local build

```sh
npm install
npm run build
```

The build runs these steps in order:

| Step | Command | What it does |
|------|---------|--------------|
| Data | `npm run build:data` | Validates CSVs, imports to DuckDB, exports per-species Parquet files |
| HTML | `npm run build:eleventy` | Generates ~700 species pages and all browse/search/glossary pages |
| Parquet copy | `npm run build:copy-parquet` | Copies Parquet files into `_site/` after Vite rewrites the output dir |
| Search index | `npm run build:pagefind` | Indexes all pages for client-side search |
| Link check | `npm run build:validate-links` | Fails on broken internal links (requires lychee) |
| Page weight | `npm run build:check-weight` | Warns when any page exceeds the size threshold |

Output lands in `_site/`.

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

Tests cover the data pipeline (`scripts/build-data.test.js`) and Lit components (`src/components/*.test.js`).

## CI

Two workflows run on GitHub Actions:

- **`deploy.yml`** — builds and deploys to GitHub Pages on push to `main`
- **`pr-check.yml`** — runs the full build on pull requests

Both use the same Docker image for reproducibility.

## Project structure

```
data/               CSV source data (species, records, glossary)
data/parquet/       Generated per-species Parquet files (build output, gitignored)
images/             Species photos (Git LFS)
scripts/            Build pipeline scripts (build-data.js, copy-parquet.js, etc.)
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

- **Species slug:** `(genus + '-' + species).toLowerCase()` — alphanumeric and hyphens only
- **Parquet path:** `data/parquet/{slug}/records.parquet` → deployed to `_site/species/{slug}/records.parquet`
- **Prose path:** `src/content/species/{slug}.md` — rendered into the factsheet if present

## Known issues

- Dockerfile lychee binary is hardcoded to `x86_64` — wrong binary on ARM hosts, but the CI target is Linux x86_64
- An orphan page is generated at `_site/content/species/acronicta-americana/` (Eleventy publishes any `.md` file without an explicit `permalink: false`)
- The existing `src/content/species/acronicta-americana.md` has no YAML frontmatter, which contradicts the requirement stated in `_instructions/EDITING_DESCRIPTION.md`. The build currently tolerates missing frontmatter; new files should follow the documented format with a `slug` field.
- `noc_id` is described as `integer` in `_instructions/ADDING_SPECIES.md` but is loaded as `VARCHAR` in `build-data.js`. This means non-numeric values won't be caught at import time. Consider aligning the schema documentation with the actual column type, or add a validation check for numeric-only values.
- The `species.csv` schema has no `subfamily` column. The pnwmoths.biol.wwu.edu URL hierarchy includes subfamily, but there is nowhere to store it in the current data model.
- The `_instructions/` guides cover each task (add species, add photo, add records) separately and each instructs the contributor to run the full build for verification. When adding a new species for the first time (species + photo + records together), there is no combined workflow guide. A contributor must read all three documents and perform the steps in the correct order (species first so the `id` is known, then photos and records using that `id`).
- No tooling exists to pull species metadata, images, or occurrence records directly from the legacy pnwmoths.biol.wwu.edu site. Contributors must copy data manually from that site.
