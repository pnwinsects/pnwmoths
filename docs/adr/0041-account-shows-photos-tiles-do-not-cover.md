# 0041. The species account shows its tiles and every catalogued photograph no tile covers

**Status:** Accepted · Refines [ADR 0040](0040-photo-display-module.md)

## Context

Since the high-resolution pipeline shipped, a species account with deep-zoom tiles rendered
them *instead of* its `data/images.csv` photographs. [ADR 0040](0040-photo-display-module.md)
made that rule visible as `TILE_POLICY['account'] = 'replaces'`, and the hidden-images report
([#299](https://github.com/pnwinsects/pnwmoths/issues/299)) measured its cost: on a tiled
species, a catalogued photograph whose specimen and view no tile covers appeared on its own
page never, and elsewhere only if it happened to be the lightest-weight row. Thirty-three
photographs across twelve species appeared nowhere on the site at all.

[#336](https://github.com/pnwinsects/pnwmoths/issues/336) put those to the curator. His
[answer](https://github.com/pnwinsects/pnwmoths/issues/336#issuecomment-5401307703) was the
same for every one of them: the photographs are on the legacy site and *"should be shown on the
new site"* under the species they belong to. That is a ruling on the display rule, not on any
photograph. Nothing about a tiled specimen A makes a catalogued specimen B less worth showing.

Seven further rows on three species (*Euxoa absona*, *Euxoa lucida*, *Xestia c-nigrum*) carried
no `specimen` or `view` cell, so nothing could tell whether a tile already showed them. Every
one turned out to be the same specimen and view as a published tile; the filenames said so.

## Decision

**`TILE_POLICY['account']` is `supplements`.** A tiled account renders every tile *and* every
catalogued photograph whose specimen and view no tile covers, tiles first, then the rest in
`weight` order. A tile supersedes exactly one catalogued row: the one of the same specimen and
view.

- The comparison is `tileOutcome()` in
  [`src/_lib/photo-display.ts`](../../src/_lib/photo-display.ts) — `covered`, `uncovered` or
  `unmatchable` — and it is the **same function** the hidden-images report classifies with, so
  the report cannot call hidden what the page shows. `normalizeView()`, `coverageKey()` and
  `tileCoverage()` moved there from the report for the same reason.
- A row with no `specimen` or no `view` is `unmatchable` and is **not** shown. Showing it
  would risk a duplicate of a tile; hiding it asserts nothing. The report keeps it as
  `unmatchable-by-tiles`, now the top-severity cause, and says to fill in the two cells.
- The report's `hidden-by-tiles` cause is retired: the situation it named no longer exists.
- The slideshow decides per slide whether to open the deep-zoom viewer, from a
  `data-tiles-path` on the figure, rather than assuming figures and tiles line up one to one.
  The `high-res-specimens` attribute that carried the parallel list is gone.
- The seven unmatchable rows were given their `specimen` and `view` from their filenames, in
  the same change.

## Consequences

- The 33 photographs from #336 are on their species accounts. The
  [hidden-images report](../../data/hidden-images-report.csv) has no row that appears nowhere
  on the site for a published species.
- `pickAccountPhotos` takes the species' tile specimens (or `null`), not a boolean, and its
  rows must carry `specimen` and `view`. The display index's `AccountInput.tiles` follows.
- Tiling a species no longer removes anything from its page. The warning to that effect in
  [UPLOADING_TILES.md](../../_instructions/UPLOADING_TILES.md) and
  [ADDING_PHOTO.md](../../_instructions/ADDING_PHOTO.md) is replaced with the one remaining
  trap: a new row without `specimen` and `view` on a tiled species is hidden.
- A catalogued photograph and a tile of the same specimen and view are still shown once, as
  the tile. Nothing here changes the Browse, Identify, similar-species or share rules.

## Alternatives considered

- **Tile every uncovered photograph instead.** Correct in the long run and filed as
  [#342](https://github.com/pnwinsects/pnwmoths/issues/342) for the two species whose TIFFs
  exist; most of the 33 have no high-resolution source, so the rule change is what makes them
  visible at all.
- **Show unmatchable rows too.** Rejected: the seven cases in hand were all duplicates of a
  tile, and a rule that shows a moth twice on its own page to avoid asking for two cells is the
  wrong trade.
- **Keep `replaces` and add the uncovered photographs to a separate section below the
  viewer.** Rejected: two carousels for one species is a layout, not a rule, and the display
  index would have needed a fourth surface to describe it.
