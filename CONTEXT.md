# CONTEXT.md — Domain Language

Shared vocabulary for PNW Moths. Use these terms as defined here, in code, commits, and conversation. Update this file whenever a term is coined, sharpened, or deprecated.

This project is a fully static rebuild of [pnwmoths.biol.wwu.edu](https://pnwmoths.biol.wwu.edu) — a natural-history catalog of Pacific Northwest moths. All data is flat files (CSV + Markdown), transformed at build time; there is no server or database at runtime.

## Taxonomy

- **Species** — the unit of the catalog: a genus + specific epithet, plus common name, author/**authority**, and NOC ID. One row in `data/species.csv`; one factsheet page. ~1,430 species, ~700+ with pages.
- **NOC ID** — the stable species identifier carried from the legacy dataset (the moth-checklist number). Present in `species.csv`; not used as a foreign key (the **slug** is).
- **Taxonomic hierarchy** — `Family → Subfamily → (Tribe) → Genus → Species`. Browse presents this as a tree; tribe is a conditional level, so branches are 4 or 5 deep. Genera without a subfamily fall directly under family, and genera without a tribe fall directly under their subfamily.
- **Subfamily** — a species' subfamily is **not** a `species.csv` column in the legacy data; it is encoded in the original CMS browse-URL paths and parsed from there. See [docs/reference/data-provenance.md](docs/reference/data-provenance.md).
- **Tribe** — an optional rank between subfamily and genus (e.g. Noctuinae: Acontiini), shown in Browse and the species-account breadcrumb only where present. Like subfamily it is a genus-level property encoded in the CMS browse-URL paths, materialized into the `tribe` column of `species.csv`. See [ADR 0016](docs/adr/0016-tribe-hierarchy-level.md).
- **Epithet** — the specific epithet (second half of the binomial). Normally rendered plain; three species intentionally display a **quoted epithet** (e.g. *Clostera "apicalis"*), modeled via an `epithet_quoted` flag in `species.csv` and `format-epithet.ts`. Quoting is **display-only** — it never appears in the slug.
- **Synonym** — an outdated binomial mapped to a current species. `data/species-synonyms.csv` maps synonyms to current slugs so legacy photo/record filenames still resolve.
- **Morphospecies / provisional / undescribed** — informal names (`sp`, `n sp`, `aff`, `nr`). Listed in `data/unpublished-species.csv` and **hidden** from the public site (see *Content gating*); their records/images/key data are preserved.

## Data entities

- **slug** — the canonical species key: `(genus + '-' + species).toLowerCase()`, alphanumeric and hyphens only. It is both the URL segment (`/species/{slug}/`) and the foreign key across every CSV that references a species. Slugs are self-documenting for non-technical contributors; numeric IDs are avoided.
- **SpeciesRecord** (occurrence) — one observation: latitude/longitude, state/province, county/district, locality, elevation, date, collector, collection, record type, notes. ~94k records, in two files with different owners (below).
- **curator file / machine file** — occurrence records live in `data/records.csv` (curator-owned, hand-edited, mutated only by deliberate one-shot maintainer scripts) and `data/records-inat.csv` (machine-owned, rewritten wholesale by the iNaturalist sync). "Every record the site serves" is the union of the two, defined once in `scripts/lib/records-source.ts`. See [ADR 0026](docs/adr/0026-inaturalist-project-sync.md).
- **iNaturalist sync** — the maintainer-run reconcile between the [PNWMoths project](https://www.inaturalist.org/projects/pnwmoths) and `data/records-inat.csv`. Research-grade observations become records; observations that leave the project, lose research grade, or are re-identified to a taxon with no page here are removed. Keyed by `inat_id`, the observation number.
- **handover** — moving a hand-entered iNaturalist record out of the curator file so the sync owns it and it tracks iNaturalist automatically. Happens one record at a time, only once the sync has seen the observation in the project; never in bulk.
- **SpeciesImage** — a photo in `data/images.csv`: keyed to a species by slug, with photographer credit and an ordering weight. The **navigational** flag marks images used as browse-tree thumbnails.
- **GlossaryWord** — an illustrated glossary term in `data/glossary.csv`, with an optional `image_filename` for a CDN illustration.
- **Plate** — a photographic plate in `data/plates.json` (number, family, slug, dimensions). A separate deep-zoom asset from species photos.

## Geography (administrative districts)

- **District** — the administrative unit a record falls in. Terminology adapts per jurisdiction: **county** for US states, **regional district** for BC. Displayed dynamically ("County" vs "Regional District").
- **`district_id`** — a prefixed VARCHAR, `US:<GEOID>` (US Census county) or `CA:<CDUID>` (StatCan census division). Never an integer — the prefix disambiguates namespaces and the string preserves zero-padding.
- **In-scope states/provinces** — `WA`, `OR`, `ID`, `MT`, `BC`. Records for **Alberta** and eastern Montana exist and keep their values, but are excluded from the Browse district dropdown (out of PNW scope). Two coordinate boxes, deliberately different: the **publishing** bounds a record must fall in (lat 42–60 N, lon −139 to −110 W, `RECORD_COORDINATE_BOUNDS` in `scripts/lib/records-source.ts`, enforced by `build-data.ts`), and the wider **district-assignment** bounds sized to the committed boundary geometry (lat 41–61 N, lon −140 to −103 W, `PNW_BOUNDS`). A coordinate can be assignable to a district and still not be publishable.
- **Crosswalk** — `data/district-crosswalk.csv` maps legacy district names to stable `district_id`s (absorbing renames like *Skeena-Queen Charlotte → North Coast*). Joins go through the crosswalk, never raw name-matching.
- **Boundaries** — `data/boundaries/pnw-districts.geojson`: simplified, WGS84 county + regional-district polygons used for point-in-polygon district assignment.

## Site features

- **Factsheet** — a species page: taxonomy, prose description, photo carousel, occurrence **map** (Leaflet), **phenology chart** (Chart.js), similar-species row, and — for high-res species — an **OpenSeadragon** deep-zoom viewer. All interactive parts are **Lit web components** that load Parquet asynchronously, with full **no-JS degradation** (taxonomy, prose, photos remain visible as static HTML).
- **Browse** — a single dynamic accordion page (`/browse/`) over the `Family → Subfamily → (Tribe) → Genus → Species` tree, with navigation-image strips, a state filter, and a cascading county/regional-district filter.
- **Checklist** — the static, names-only companion to Browse (`/checklist/`): the same gated species over the same tree, ordered by **checklist order** rather than alphabetically, not expandable, with the same two filters. The legacy site called it `/browse-all/`.
- **Identify** — the character-key page (`/identify/`): narrows species by selecting **character-states** across 8 collapsible categories, with a live "N species match" thumbnail grid. Backed by the **key matrix**.
- **key matrix** — `data/key-matrix.json`: a 237-character-state × 1,228-species bitset (base64 `Uint8Array` per state) reimplementing the exported Lucid3 key as static client-side data. Filter semantics: OR **within** a question, AND **across** questions, and **"0 = unscored, never absent"** (a raw `0`/blank never eliminates a species).
- **Glossary tooltips** — first occurrence of each glossary term in species prose is wrapped at build time in `<abbr>` and shown via the native Popover API (definition + optional CDN image); degrades to the native `title` tooltip with JS off.
- **`species-audit.csv`** — an unlinked build diagnostic (`_site/species-audit.csv`) flagging per-species coverage gaps (`has_records` / `visible` / `in_key`); a maintainer tool, nothing on the site links to it. Columns and live URL in the [README](README.md#coverage-audit).
- **Sharing metadata** — the `<meta name="description">`, Open Graph, and `rel=canonical` tags every page emits so that a link posted to BlueSky, Slack, or a chat renders a preview. Species and plate previews use their own CDN photo where one exists; every other page — and any species with no photo on file — falls back to the **share card**, `public/images/social-card.png` (1200×630, regenerated with `npm run generate:social-card`). Species descriptions are derived from the factsheet's opening paragraph, not authored ([ADR 0021](docs/adr/0021-sharing-metadata.md)).
- **`high_res_available`** — a per-species boolean (from the photo manifest) marking species with DZI deep-zoom tiles on the CDN; gates the OpenSeadragon viewer.

## Content gating

Two data-driven deny-lists suppress content from the public site without deleting the underlying data (both reversible by deleting one line):

- **Withheld family** — `data/withheld-families.csv`. Holds an entire family out of pages, Browse, Identify, and search, with a build-time leak gate. Used for the **Geometridae** public embargo (GitHub issue #48), pending curator content.
- **Unpublished species** — `data/unpublished-species.csv`. A per-species deny-list for provisional/undescribed morphospecies.
- **`shown` / visible predicate** — the single source of truth (`stats.ts`) for whether a species appears publicly, applied consistently across all choke points.

## Infrastructure & roles

- **CDN** — [Bunny](https://bunny.net): a Storage Zone + Pull Zone + Optimizer holds all image assets. `CDN_BASE_URL` is a hard-coded **public** constant (not a secret, not an env var).
- **Production** — <https://moths.pnwinsects.org/>, served from Bunny; a push to `main` triggers an additive `_site` upload. **Staging** — GitHub Pages, a manual `workflow_dispatch` deploy under `/pnwmoths/`.
- **Maintainer / curator** — a (typically non-technical) person who edits flat-file data and adds records/photos, following the guides in [`_instructions/`](_instructions/). **Contributor** — anyone submitting data or code changes; see [CONTRIBUTING.md](CONTRIBUTING.md).
