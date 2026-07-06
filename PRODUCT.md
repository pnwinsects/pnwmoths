# PRODUCT.md — What PNW Moths Is

A fully static rebuild of [pnwmoths.biol.wwu.edu](https://pnwmoths.biol.wwu.edu), the Pacific Northwest Moths natural-history catalog. It generates ~700+ species factsheets and the browse/identify/search/glossary pages entirely at build time from flat files (CSV + Markdown), with no server or database at runtime. Production runs at <https://moths.pnwinsects.org/>.

## Core value

Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural-history site — and that **non-technical maintainers can keep it running** by editing flat files, without standing up any server infrastructure.

## Who it's for

- **Public visitors** — naturalists, lepidopterists, and the curious — browsing species accounts, occurrence maps, phenology, and a visual identification key.
- **Maintainers / curators** — the WWU/pnwinsects stewards who add species, records, photos, and descriptions by editing CSV/Markdown, guided by [`_instructions/`](_instructions/). Editing must not require running a build locally, or only minimal tooling.
- **Future developers** — this repo may change ownership and sit unmaintained for stretches; the architecture favors legibility and low operational surface over cleverness.

## What it does

- **Species factsheets** — taxonomy, prose description, credited photo carousel, occurrence map (Leaflet), phenology chart, similar-species row, and an OpenSeadragon deep-zoom viewer for species with high-res tiles. Interactive parts are Lit web components loading Parquet asynchronously; everything degrades gracefully with JS off.
- **Browse** — a single accordion over the `Family → Subfamily → Genus → Species` tree, with navigation images and state + county/regional-district filters.
- **Identify** — a client-side character-key filter over a 237-state × 1,228-species bitset matrix (a static reimplementation of the site's exported Lucid3 key), with a live "N species match" grid.
- **Search** — Pagefind static full-text search (occurrence data deliberately excluded from the index).
- **Glossary** — illustrated terms, plus build-time tooltips on their first occurrence in species prose.
- **Occurrence data** — ~86k–100k records with administrative-district assignment (legacy re-join + coordinate point-in-polygon fill) and a maintainer-facing QC report.

See [CONTEXT.md](CONTEXT.md) for the domain vocabulary and [docs/adr/](docs/adr/) for the decisions and their rationale.

## Constraints

- **Static hosting only** — pure static files, no server or database at runtime, ever. This is the load-bearing constraint; see [ADR 0001](docs/adr/0001-static-no-server.md).
- **Flat-file, contributor-editable data** — species/records/glossary live in CSV; prose in per-species Markdown. Non-technical maintainers must be able to edit them.
- **Images from the Bunny CDN** — no image assets in the repo (Git LFS was removed in v1.4).
- **All pipeline operations run locally** — upload, tiling, district assignment, and materialization are maintainer-run scripts on a local machine. There is no build/data server.

## Scope

**In scope:** the pnwmoths catalog, its data pipeline, and the read-only public site.

**Out of scope** (with reasons):

| Not building | Why |
|---|---|
| Admin / editing UI | Editing is done in flat files; a UX would be premature |
| User submissions / community ID | iNaturalist already fills this role; it needs server infrastructure |
| Server-side search | No server; Pagefind is the static equivalent |
| Real-time / live observation feeds | All data is build-time |
| Multi-site support | The original app served several insect sites; this is pnwmoths only |
| Embedding the external Lucid applet | The key's *exported data* is reimplemented statically on `/identify/`; the applet itself is not embedded |

## Status

Not yet publicly launched — "almost live" with a small team as of mid-2026. Production deploys to Bunny on push to `main`; branch protection (required PR + build check) is enabled on `main`. See [docs/concerns.md](docs/concerns.md) for the live known-gaps register.
