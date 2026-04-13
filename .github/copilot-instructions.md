# Copilot Instructions — PNW Moths

See CONTRIBUTING.md for the full contributor guide. This file captures conventions
and constraints for AI-assisted development.

## Key data files

| File | Contents |
|------|----------|
| `data/species.csv` | Species taxonomy (genus, species, common name, …) |
| `data/records.csv` | Observation records with coordinates and dates |
| `data/images.csv` | Image metadata linking photos to species |

## Slug convention

Species slugs are computed as `(genus + '-' + species).toLowerCase()`.
Slugs contain alphanumeric characters and hyphens only.

Example: genus=Acronicta, species=americana → `acronicta-americana`

## Prose descriptions

Optional per-species Markdown files live at `src/content/species/{slug}.md`.
Each file requires YAML frontmatter with a `slug` field matching the filename.
If the file is absent, the factsheet renders without a prose section.

## Build pipeline

Run `npm run build`. Steps in order:

1. `build:data` — validates CSVs, imports to DuckDB, exports per-species Parquet files
2. `build:eleventy` — generates ~700 species pages plus browse/search/glossary pages
3. `build:copy-parquet` — copies Parquet files into `_site/` after Vite rewrites output dir
4. `build:pagefind` — indexes all pages for client-side search
5. `build:validate-links` — fails on broken internal links (requires lychee locally)
6. `build:check-weight` — warns when any page exceeds the size threshold

Output directory: `_site/` (gitignored).

## Tests

```sh
npm test
```

Covers the data pipeline (`scripts/build-data.test.js`) and Lit components
(`src/components/*.test.js`).

## Node version

22 — see `.nvmrc`. If using nvm: `nvm use`.

## Geographic constraints

Valid state/province codes: `WA`, `OR`, `ID`, `MT`, `BC`.

Coordinate bounds for records:
- Latitude: approximately 42–55 N
- Longitude: approximately −125 to −110 W

Records outside these bounds are likely data errors.
