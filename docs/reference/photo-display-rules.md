# Photo display rules

Which photograph each surface shows for a species, and why the answer differs by surface.

`data/images.csv` is read by four files that display photographs, with seven distinct rules
between them. Each picks differently, and no module owns the question — [#338](https://github.com/pnwinsects/pnwmoths/issues/338) tracks
that debt. Until a module does, this file is the inventory. **If you change a selection rule,
change the row here too**; each call site carries a comment pointing back at this file.

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

| Surface | Source | Rule |
|---|---|---|
| Species account carousel | [`src/species/species.njk`](../../src/species/species.njk) | **Every** row for the species, in `weight` order — **unless** the species has high-res tiles, in which case the deep-zoom viewer renders *instead of* the catalogued photographs and none of them appear. |
| Browse species card | [`src/_data/taxon.ts`](../../src/_data/taxon.ts) | Lowest `weight` among rows whose `view` is not `ventral`. A species with **no** `images.csv` row at all falls back to a synthetic thumbnail from the high-res manifest (prefers the `D` specimen) — [#84](https://github.com/pnwinsects/pnwmoths/issues/84); `images.csv` rows always win when both exist. |
| Browse **genus** strip | `pickNavImages()` in the same file | Up to **four** images taken across the whole genus by `weight`, deduped by thumbnail path — *not* one per species. A species can therefore put a second photograph on `/browse/` that no per-species rule predicts. |
| Browse **tribe / subfamily / family** strips | `firstFourNavImages()` in the same file | The genus strip's **first** image from each genus in tree order, until four. |
| Identify cards | [`scripts/build-key.ts`](../../scripts/build-key.ts) | Lowest `weight`, ventral **not** excluded — and only for the 1,192 species the key matrix carries, so a species with a page but no key entry has no Identify card at all. |
| Similar-species thumbnails | `src/species/species.njk` | `images[slug][0]` — lowest `weight`, ventral not excluded. Rendered on **other** species' pages, the ones naming this species in `similar_species`. |
| Share / Open Graph image | [`src/_lib/social-meta.ts`](../../src/_lib/social-meta.ts) | The first high-res specimen's thumbnail if the species is tiled, else `images[slug][0]`; else the site share card ([ADR 0021](../adr/0021-sharing-metadata.md)). |

## Consequences worth knowing before you touch this

- **Only the account knows tiles exist.** Tiling a species removes its catalogued photographs
  from its own page while leaving them on `/browse/`, Identify and other species' similar-species
  rows. That asymmetry is the reason
  [`emit-hidden-images.ts`](../../scripts/emit-hidden-images.ts) answers "where is this
  photograph shown" by grepping the built `_site/` rather than predicting it from source — three
  attempts to model these rules by hand were each wrong.
- **Two different null-`weight` conventions.** [`src/_data/images.ts`](../../src/_data/images.ts)
  sorts an unparseable `weight` to the **front** (`?? 0`); `taxon.ts` sorts it to the **back**
  (`?? 999`). Every row currently has a numeric weight, so nothing depends on it today.
- **The ventral exclusion is Browse-only** ([#107](https://github.com/pnwinsects/pnwmoths/issues/107)).
  Rows with a *blank* `view` are kept everywhere — unclassified is not confirmed-ventral.
