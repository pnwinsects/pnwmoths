# 0029. Removing a species deletes its rows outright; no tombstone redirect

**Status:** Accepted
**Date:** 2026-08-05
**Issue:** [#268](https://github.com/pnwinsects/pnwmoths/issues/268)

## Context

Names leave the catalog for three different reasons, and until now only two of them had a
written answer.

- **A name is provisional or undescribed** — it stays in `data/species.csv`, and
  `data/unpublished-species.csv` hides it from Browse, Search, the checklist and the key. The
  data survives; the page is never emitted ([ADR 0015](0015-data-driven-gating.md)).
- **A name is superseded by another** — a genus rename or a lump. The old slug goes in
  `data/species-redirects.csv` and visitors land on the surviving species
  ([#155](https://github.com/pnwinsects/pnwmoths/issues/155),
  [#265](https://github.com/pnwinsects/pnwmoths/issues/265)).
- **A name should not be in the catalog at all.** *Hemileuca nuteglan* is a hybrid population
  (*H. nuttalli* × *eglanterina*), not a described species. It had been deny-listed since
  [#106](https://github.com/pnwinsects/pnwmoths/issues/106) — hidden, but still carrying 13
  occurrence records and a row in every derived artifact.

Asked which of the first two treatments the third case should get, the collaborator chose
neither: *"Go ahead and entirely delete Hemileuca nuteglan from the site, including any records
associated with it. Having a query for the page redirect to a 404 is fine."*

## Decision

**Removal is a full delete of the species row and every occurrence record that references its
slug, in all files — not a move to the deny-list, and not a redirect.**

- **The deny-list is not a graveyard.** It marks names that are *expected to become valid* —
  provisional morphospecies awaiting description. Parking a rejected name there would make the
  list mean two incompatible things, and `scripts/check-unpublished.ts` enforces that every
  deny-list entry matches exactly one `data/species.csv` row, so the two files must be edited
  together in any case.
- **No redirect, because there is nothing to redirect to.** `data/species-redirects.csv` exists
  to send a visitor to the *surviving* taxon; a deleted name has no survivor. A legacy
  `/browse/…/` URL falls through to Browse, and `/species/<slug>/` is a plain 404.
- **Build-derived artifacts are regenerated, never hand-edited.**
  `data/records-derived-district.csv` is keyed by `row_index` into `data/records.csv`, so
  deleting rows mid-file shifts every later index; the build's coverage gate catches this.
  Re-run `scripts/derive-district-audit.ts`.
- **One-shot run reports are the exception, and are pruned by hand.** `data/coord-fill-report.csv` and
  `data/legacy-rejoin-report.csv` carry one row per record examined. Neither can be reproduced
  by re-running its script today (both are one-shot backfills, one of which needs the
  out-of-tree reference database), so their nuteglan rows are deleted by hand. Pruning is
  strictly closer to what a fresh run would produce than leaving rows for records that no
  longer exist.

## Consequences

- **The CDN keeps whatever it was already serving.** Deploy is additive — no purge, no deletes
  ([ADR 0008](0008-deploy-bunny-additive.md)) — so removing a species that *had* a published
  page does not take that page down. It has to be deleted from the storage zone by hand, the
  way retired images are tracked in `data/cdn-retired-images.csv`. This cost nothing for
  *nuteglan*, which was deny-listed and so never had a page, and it is the single step most
  likely to be missed next time. `_instructions/REMOVING_SPECIES.md` leads with it.
- **The removed slug becomes a permanent entry in "Unmapped Legacy Links."**
  `scripts/fetch-analytics.ts` replays the legacy resolver over CDN logs and reports every
  unmatched species-shaped path as a mapping nobody has written
  ([#181](https://github.com/pnwinsects/pnwmoths/issues/181)). There is no way to mark a path as
  *deliberately* unmapped, so a deleted species will sit in that queue for as long as anyone
  follows the old link. Filed as [#270](https://github.com/pnwinsects/pnwmoths/issues/270).
- **Removal is destructive and reviewed as a diff**, like the two other pure deletions allowed
  against the curator-owned `data/records.csv` (`dedup-records.ts`, `migrate-inat-records.ts`).
  Git history is the only record that the name was ever catalogued — which is precisely what
  "entirely delete" asks for.

## Alternatives rejected

- **Move the row to `data/unpublished-species.csv`.** Offered on #268 as the lower-blast-radius
  option; the collaborator declined it. It also conflates "not yet described" with "not a
  species."
- **A tombstone row in `data/species-redirects.csv` pointing at Browse.** It would keep the slug
  out of the unmapped-links queue, but at the price of a redirect file that no longer means "go
  here instead" — the same overloading rejected for the deny-list. If the analytics noise proves
  annoying, the fix belongs in the analytics report (#270), not in the redirect table.
- **Leaving the occurrence records in place under a dead slug.** Rejected outright by the
  collaborator ("including any records associated with it"), and `scripts/build-data.ts`
  validates for orphaned records anyway.
