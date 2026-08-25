# Photo display rules

Which photograph each surface shows for a species, and why the answer differs by surface.

`data/images.csv` is read by six surfaces that display photographs, with seven distinct rules
between them. The rules live in one module — [`src/_lib/photo-display.ts`](../../src/_lib/photo-display.ts),
one picker per surface — and this file is its prose companion: what each surface does and why
the answers differ ([ADR 0040](../adr/0040-photo-display-module.md)).

**Where a photograph appears** is the inverse question, and it is derived rather than restated:
[`src/_lib/photo-display-index.ts`](../../src/_lib/photo-display-index.ts) inverts the pickers
over the artifacts the surfaces render from, and
[`scripts/check-display-index.ts`](../../scripts/check-display-index.ts) fails the build if that
index and the emitted HTML disagree about any of the 4,034 catalogued photographs.

Domain terms are in [../../CONTEXT.md](../../CONTEXT.md).

## The ordering key

**`weight`** — an integer per `(species_slug, filename)` row, low first. It is the only thing
that orders a species' photographs, and it is how a curator promotes one: give it the lowest
`weight` for that species and every surface below that takes "the first" will take it.

There is no flag that overrides `weight`. The `navigational` column that used to suggest
otherwise was empty in all 4,034 rows and has been removed
([ADR 0039](../adr/0039-photo-display-selection-by-weight.md),
[#337](https://github.com/pnwinsects/pnwmoths/issues/337)).

A **navigation image** is whichever photograph a surface picks to stand for a species —
derived, never declared. `NavImage`, `pickNavImages()` and `navImages` all name that concept.

## The rules, surface by surface

| Surface | Picker | Rule |
|---|---|---|
| Species account carousel | `pickAccountPhotos` | **Every** row for the species, in `weight` order — **unless** the species has high-res tiles, in which case the deep-zoom viewer renders *instead of* the catalogued photographs and none of them appear. |
| Browse species card | `pickCardPhoto` | Lowest `weight` among rows whose `view` is not `ventral`. A species with **no** `images.csv` row at all falls back to a synthetic thumbnail from the high-res manifest (prefers the `D` specimen) — [#84](https://github.com/pnwinsects/pnwmoths/issues/84); `images.csv` rows always win when both exist. |
| Browse **genus** strip | `pickGenusStrip` | Up to **four** images taken across the whole genus by `weight`, deduped by thumbnail path — *not* one per species. A species can therefore put a second photograph on `/browse/` that no per-species rule predicts. |
| Browse **tribe / subfamily / family** strips | `pickHigherStrip` | The genus strip's **first** image from each genus in tree order, until four. |
| Identify cards | `pickIdentifyPhoto` | Lowest `weight`, ventral **not** excluded — and only for the 1,192 species the key matrix carries, so a species with a page but no key entry has no Identify card at all. |
| Similar-species thumbnails | `pickSimilarPhoto` | `images[slug][0]` — lowest `weight`, ventral not excluded. Rendered on **other** species' pages, the ones naming this species in `similar_species`. |
| Share / Open Graph image | `pickSharePhoto` | The first high-res specimen's thumbnail if the species is tiled, else `images[slug][0]`; else the site share card ([ADR 0021](../adr/0021-sharing-metadata.md)). |

Each picker is a function in [`src/_lib/photo-display.ts`](../../src/_lib/photo-display.ts); the
call sites are `src/species/species.njk` (via the `accountPhotos` / `similarThumbnail` Eleventy
filters), `src/_data/taxon.ts`, `scripts/build-key.ts` and `src/_lib/social-meta.ts`.

## Consequences worth knowing before you touch this

- **Only the account lets tiles REPLACE the catalogued photographs.** Tiling a species removes
  its photographs from its own page while leaving them on `/browse/`, Identify and other species'
  similar-species rows. Three surfaces do consult tile status, and they do three different things
  with it: `TILE_POLICY` says which — `replaces` for the account, `prefers` for the share image,
  `fallback` for Browse (a tile stands in only where there is no catalogued row at all),
  `ignores` for Identify and similar species. One table rather than four conventions.
- **The ventral exclusion is Browse-only** ([#107](https://github.com/pnwinsects/pnwmoths/issues/107)).
  Rows with a *blank* `view` are kept everywhere — unclassified is not confirmed-ventral. Browse
  and Identify differ **only** in that filter, which is exactly the difference a tidying
  refactor would erase; `src/_lib/photo-display.test.ts` asserts it directly.
- **One null-`weight` convention: last.** An unparseable weight sorts to the back, in SQL
  (`TRY_CAST` → `NULL` in an `ASC` sort) and in memory alike, so a malformed cell can never
  quietly become a species' thumbnail. `src/_data/images.ts` used to sort such a row to the
  *front*; every row has a numeric weight today, so unifying changed nothing observable.
- **Adding a surface means three edits**: a picker here, a branch in the index, and a row in
  this table. Skip the second and `build:check-display-index` fails on the first photograph the
  new surface displays.
