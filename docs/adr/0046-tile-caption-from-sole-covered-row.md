# 0046. A tile's caption carries the label data of the one catalogued photograph it supersedes, or none

**Status:** Accepted · Refines [ADR 0041](0041-account-shows-photos-tiles-do-not-cover.md) · Closes [#358](https://github.com/pnwinsects/pnwmoths/issues/358)

## Context

Under a catalogued photograph, a species account shows the specimen's label transcription —
locality, date, collector — which the slideshow builds from `data-*` attributes the template
writes from the `data/images.csv` row. A high-resolution tile set carries none of that: a
`data/species-photos.json` entry records only a specimen letter, a view and a tile path. So a
tiled account captioned every tile "Specimen A · Dorsal" and stopped, while the label data sat
on the `images.csv` row of the same specimen and view — the very row the tile supersedes
([ADR 0041](0041-account-shows-photos-tiles-do-not-cover.md)). The curator read that as label
data lost in migration ([#358](https://github.com/pnwinsects/pnwmoths/issues/358)); it was
never lost, only not rendered. Measured: 3,636 tiles supersede a catalogued row.

A tile does not always supersede exactly one row. Twenty supersede two, and in eighteen of
those the two rows carry different labels — the [#341](https://github.com/pnwinsects/pnwmoths/issues/341)
cases, where a redetermined photograph kept a specimen letter its destination already used, and
the curator has confirmed each pair is two distinct specimens. *Eupsilia tristigmata*'s A-V tile
was cut from `Eupsilia tristigmata-A-V.tif`; the lighter of its two A-V rows is
`Eupsilia sidus-A-V.jpg`, collected on a different road in a different year.

## Decision

- **`pickAccountPhotos` pairs each tile with the catalogued row of the same specimen and view**,
  using the same coverage key that decides which rows a tile supersedes, and returns the pairs
  as `tiles`. The template captions from the pair; it does not restate the match.
- **A tile gets a caption row only when exactly one row matches.** None matching, or two, leaves
  the tile captioned with its specimen and view alone.
- **Both branches of the account write label attributes through one template macro**, so a
  tile's caption and a catalogued photograph's are the same code.
- The tile keeps its own photographer and licence credit from `species-photos.json`; only the
  label transcription comes from the row.

## Consequences

- Every tile that supersedes one row now shows that specimen's collection data.
- The eighteen ambiguous tiles stay uncaptioned until #341 re-letters the incoming photograph,
  at which point each resolves to one row with no change here.
- Which photographs an account displays is unchanged; so is the display index.

## Alternatives considered

- **Lowest weight among the matching rows.** Rejected: it is the rule every other surface uses
  to pick a photograph, but here it picks a *label*, and for *Eupsilia tristigmata* it picks the
  wrong moth's. Printing another specimen's collection data under a photograph is the defect
  [#330](https://github.com/pnwinsects/pnwmoths/issues/330) spent a month removing.
- **Pair by the tile's source photograph.** The correct key in principle — the tile and its row
  share a photo stem — but `species-photos.json` does not record which photograph a tile was cut
  from, and adding it is a generator change under [ADR 0034](0034-generated-artifacts-merge-curator-fields.md)
  for eighteen tiles that #341 will disambiguate anyway.
- **Copy label fields into `species-photos.json`.** Rejected: a second copy of curator-entered
  data that would drift from `images.csv` the first time a label is corrected.
