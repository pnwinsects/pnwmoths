# Copilot Instructions — PNW Moths

**Canonical context lives in [`AGENTS.md`](../AGENTS.md)** (a symlink to `CLAUDE.md`), with
the domain glossary in [`CONTEXT.md`](../CONTEXT.md), product scope in [`PRODUCT.md`](../PRODUCT.md),
and the decisions behind the architecture in [`docs/adr/`](../docs/adr/). Read those first;
they are the shared source of truth for every tool. Work is tracked in **GitHub Issues** (`gh`).

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full contributor guide. This file captures
the conventions and constraints most useful during AI-assisted development.

## Key data files

| File | Contents |
|------|----------|
| `data/species.csv` | Species taxonomy (genus, species, common name, …) |
| `data/records.csv` | Observation records with coordinates and dates |
| `data/images.csv` | Image metadata linking photos to species |
| `data/plates.json` | Photographic plate manifest (98 records: number, family, slug, width, height) |

## Slug convention

Species slug = `(genus + '-' + species).toLowerCase()`, alphanumerics and hyphens only
(e.g. `acronicta-americana`) — the foreign key across CSVs and the URL segment. See
[`CONTEXT.md`](../CONTEXT.md) and [ADR 0010](../docs/adr/0010-slug-foreign-key.md).

## Prose descriptions

Optional per-species Markdown files live at `src/content/species/{slug}.md`.
The file is matched to its species by filename (the `{slug}`) and rendered into
the factsheet via `renderFile`; it contains body Markdown only, with no YAML
frontmatter (`species.11tydata.json` sets `permalink: false`).
If the file is absent, the factsheet renders without a prose section.

## Build pipeline

Run `npm run build`. It runs ~16 ordered steps: data → Identify key → HTML → content-gating
gates → asset/Parquet copies → build-time emitters (species-states/districts/audit) → search
index → weight/schema checks → link check. The authoritative order lives in
[`package.json`](../package.json) (`build:site`); [`CONTRIBUTING.md`](../CONTRIBUTING.md) has the
stage-by-stage table. Output lands in `_site/` (gitignored).

## Tests

```sh
npm test
```

Covers the data pipeline (`scripts/build-data.test.ts`) and Lit components
(`src/components/*.test.ts`).

## Node version

24 — see `.nvmrc`. If using nvm: `nvm use`.

## Geographic constraints

Valid state/province codes: `WA`, `OR`, `ID`, `MT`, `BC`.

Coordinate bounds for records:
- Latitude: approximately 42–55 N
- Longitude: approximately −125 to −103 W (extends east to cover full Montana)

Records outside these bounds are likely data errors.
