# Data provenance

Where the legacy data and content in this repo come from, and how to go back to
the sources of truth. This project is a static rebuild of the original Pacific
Northwest Moths catalog: the committed flat files (`data/*.csv`, `data/*.json`,
`src/content/species/*.md`) are *derived* from the sources below. When something
looks wrong or incomplete, trace it back here rather than guessing.

Domain terms (slug, NOC ID, subfamily, key matrix, …) are defined in
[../../CONTEXT.md](../../CONTEXT.md).

## Original site (source of truth for legacy content)

The canonical legacy site is <https://pnwmoths.biol.wwu.edu/>. It is the source
of truth for legacy copy/content (species prose, captions, credits) and for the
browse taxonomy. When you need to confirm what the old site actually said or how
it grouped taxa, this is the authority.

Fetch it with `curl` from a local machine, **not** a fetch/preview/browser tool:

```sh
curl -s https://pnwmoths.biol.wwu.edu/ | less
```

Two reasons:

- Automated link-checkers (e.g. the lychee run in CI) may refuse or fail to
  reach the host; `curl` from a developer machine still works.
- `curl` returns the verbatim server HTML. Fetch/preview tools re-render and
  transform the page, which can silently alter whitespace, entities, and markup
  you may be trying to reproduce exactly.

Use `curl` whenever you need verbatim legacy text.

## Reference MySQL database (original CMS data)

The original site's CMS data is preserved in a local Docker container named
`pnwmoths-mysql`, running `mysql:5.6`. This is where the original species
records and curated external links live, and it is the origin of much of the
migrated `data/*.csv`.

This is a **reference / read source only** — it is *not* part of the build and
*not* declared in [`docker-compose.yml`](../../docker-compose.yml) (that file
defines only the `dev` build service for the site itself). The container is
stood up separately and left **stopped by default**. There is no local mysql
client or driver in the project, so all access goes through `docker exec`.

Bring it up and query it:

```sh
docker start pnwmoths-mysql
docker exec -i pnwmoths-mysql mysql -upnwmoths -ppnwmoths pnwmoths
```

Database, user, and password are all `pnwmoths`. The scripts that read it use
`mysql --batch` (tab-separated, no header) and decode the escaping in code.

Scripts that consume this container (each writes a committed CSV; re-run only
when the reference data changes):

- [`scripts/extract-reference-links.ts`](../../scripts/extract-reference-links.ts)
  → `data/species-links.csv` (BugGuide / MPG external links).
- [`scripts/extract-species-plates.ts`](../../scripts/extract-species-plates.ts)
  → `data/species-plates.csv` (species → photographic-plate assignment, issue
  #53). Reads the `species_plateimage` / `species_plateimage_member_species`
  join tables — the species-to-plate assignment is a curatorial layout
  decision (which numbered plate a genus landed on) and is not derivable from
  `family`/`subfamily`/`tribe` alone.
- [`scripts/backfill-legacy-county.ts`](../../scripts/backfill-legacy-county.ts)
  → legacy county backfill.
- [`scripts/recover-clipped-bc-records.ts`](../../scripts/recover-clipped-bc-records.ts)
  → recovered BC records.

Connection details are overridable via the `MYSQL_CONTAINER`, `MYSQL_DB`,
`MYSQL_USER`, and `MYSQL_PASSWORD` environment variables; the defaults match the
container above.

## Subfamily encoding (not a DB column)

A species' **subfamily** is not a column in the legacy `species` data. It is
encoded in the original CMS browse-URL paths (`cms_title.path`), and must be
parsed from those paths. There are three URL schemes to handle:

1. `tribe-` segments — subfamily inferred from a tribe segment in the path.
2. bare subfamily segments — the subfamily appears directly as a path segment.
3. a prefix-less Geometridae subtree — Geometridae subfamilies sit in their own
   segment layout without the usual prefixing.

Derive the genus → subfamily mapping by parsing these paths. **Do not** join via
`factsheet_id`, which is stale. The original migration relied on that join and
therefore missed all Geometridae subfamilies; recovering them requires parsing
the browse paths instead. The parsing lives in
[`scripts/build-data.ts`](../../scripts/build-data.ts).

## Tribe encoding (not a DB column)

**Tribe** sits between subfamily and genus and, like subfamily, is not a DB
column — it is the `tribe-<name>` segment of the same browse-URL paths
(`browse/family-…/subfamily-…/tribe-…/<genus>/<species>`). Tribe is a
**genus-level** property (every species of a genus shares it), and the paths map
each genus to exactly one tribe with no conflicts. Only ~36 tribes exist and many
genera have none (their subfamily has no tribal subdivision, or the genus was
added after the 2021 migration and is absent from the legacy hierarchy).

Unlike subfamily, tribe uses a single canonical path scheme (all tribe paths are
`browse/family-…/subfamily-…/tribe-…/…`; Geometridae has no tribes). The genus →
tribe map is materialised into a `tribe` column in `data/species.csv` by
[`scripts/backfill-tribe.ts`](../../scripts/backfill-tribe.ts) (additive-only and
idempotent; container must be running). That committed column — not the DB — is
the runtime source of truth; re-run the backfill only when the reference data
changes. See [ADR 0016](../adr/0016-tribe-hierarchy-level.md).

## Favicon (borrowed from the legacy site)

`public/favicon.ico` is the original WWU site's own favicon, retrieved verbatim from
<https://pnwmoths.biol.wwu.edu/favicon.ico> on 2026-07-25 (1406 bytes, sha256
`07a77f8fab62915488fbed9293ee1bf683d3b2552d3f943a6e07d2433ebb3ae1`). It is a
valid single-image ICO containing a small orange-and-brown moth on a transparent
background — this project's own legacy asset, reused because this site is the
static successor to that one (issue #183).

It is **16×16 only**: no high-DPI, SVG, or touch-icon variant exists. Upscaling a
16×16 source looks bad, so a redrawn higher-resolution icon is separate future
work; do not synthesise one from this file.

It reaches the site root because `public/` is Vite's `publicDir` (see
[`eleventy.config.ts`](../../eleventy.config.ts)), whose contents are copied verbatim
into `_site/`, and it is declared in
[`src/_includes/base.njk`](../../src/_includes/base.njk). It must live at the
origin root (`/favicon.ico`) — browsers request that path automatically — so it
cannot be served from the CDN image paths like the species photo corpus.

## Lucid3 identification key (authoritative character→image bindings)

The character illustrations on the `/identify/` page (see [CONTEXT.md](../../CONTEXT.md)) are
bound authoritatively from the original Lucid3 Builder key data. The exact
character-state → image bindings live in a `key.data` XML file, extracted from
the Lucid Builder file `PNW Moths.data` inside the archive `pnwmoths_https.tar.xz`
(the extracted XML is committed as `data/key.data`).

Extracting bindings from `key.data` yields **180 of 237** character-states with
art. An earlier fuzzy filename matcher (since removed) recovered only **77**
and mis-bound many of them. The authoritative extractor is
[`scripts/extract-character-images.ts`](../../scripts/extract-character-images.ts)
(`npm run key:extract-images`), which emits the committed
`data/key-character-images.csv`.

The remaining gap is genuine: the **Size** and **Seasonality** categories have
no source art at all in the original key — their absence is not a matching
failure, so do not try to "fix" it by loosening the matcher.
