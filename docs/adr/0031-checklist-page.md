# 0031. The Checklist is its own page, server-rendered, not a mode of Browse

**Status:** Accepted
**Date:** 2026-08-06
**Issue:** [#218](https://github.com/pnwinsects/pnwmoths/issues/218)

## Context

The legacy site served two views of the same taxonomy: the image browse, and a names-only list
in taxonomic sequence at `/browse-all/`. Professional entomologists use the second one, and
asked for it back. [ADR 0030](0030-checklist-order-from-mpg.md) produced the ordering
(`data/checklist-order.csv`); nothing read it until this page existed.

#218 describes the legacy control as *"a check box for toggling between a view of the browse
list that had images and a view that was a list of names."* Browse already has a **Show images**
checkbox, so the obvious reading is that this is a toggle we half-own already.

It isn't, and following that reading would have produced the wrong thing. The two views differ
in three ways at once, and only one of them is images:

- **Order.** Browse is alphabetical (`ORDER BY family, subfamily, tribe, genus, species`); the
  checklist is taxonomic sequence. The reason the list exists is the order.
- **Expansion.** Browse is a disclosure tree, collapsed by default. #218 asks for a list that is
  *"not expandable but would be the complete list."*
- **Weight and rendering.** Browse ships the whole taxon tree as inlined JSON (735 KB) and
  renders it client-side.

## Decision

**A separate page at `/checklist/`, fully server-rendered, with Browse's filters.**

- **The static HTML is the page.** The list is not expandable, so there is nothing for a
  component to reveal — `pnwm-checklist-filter` only hides rows already present. That satisfies
  the no-JS invariant ([ADR 0005](0005-lit-light-dom.md)) without a `<noscript>` duplicate of
  the content, and it is what makes the page printable and findable with Ctrl-F. Those are what
  a working entomologist does with a checklist, and neither survives a JS-rendered tree.
- **Ordering reuses `taxon.ts`'s gated tree**, reordered, rather than a second DuckDB query.
  Both content gates ([ADR 0015](0015-data-driven-gating.md)) are applied in exactly one place;
  a second derivation would be a second place to forget them, which is what
  [#275](https://github.com/pnwinsects/pnwmoths/issues/275) was. The cost is running the taxon
  query twice (~50 ms), which is the right trade.
- **The species list is excluded from the search index**, as Browse's equivalent list already
  is. Left in, it enters Pagefind as a 94 KB fragment of 1,253 binomials and competes with every
  species page for every species query. The heading and intro stay indexed so the page is still
  findable by name.
- **`/browse-all/` resolves here**, not to Browse. That legacy URL *was* this page; it pointed
  at Browse only because this page did not exist.
- **Filters reuse the predicates exported by `pnwm-taxon-browser.ts`**, so Browse and the
  Checklist cannot disagree about what "in Whatcom County" means.

## Consequences

- **The flattened page order is not `checklist-order.csv` read top to bottom**, and cannot be.
  The page nests by *our* hierarchy while ordering by *MPG's* sequence, and the two disagree on
  subfamily/tribe placement in 53 places
  ([#279](https://github.com/pnwinsects/pnwmoths/issues/279)). Two genera cross a group boundary
  today, *Acopa* and *Protoperigea*. Both render in the right taxonomic place and out of MPG's
  linear order — the right trade for a page whose purpose is the nested taxonomy.
- **A state's species do not all appear under one of its districts.** Montana is capped to a
  western-county allow-list while the state aggregate is not, so 86 of its 344 species are
  reachable by state and by no county; the other jurisdictions lose 1–4 each to records with no
  district. The page says so under the count rather than letting a curator build a quietly
  incomplete county list.
- **Both content gates now read the emitted page.** The checklist publishes *names*, not pages,
  so a gated species reaching it leaves `_site/species/` untouched and every pre-existing gate
  sees nothing — #275's blind spot by another route. Each gate also fails if the page exists but
  parses to zero rows, so a markup change cannot turn the gate into a silent no-op.

## Alternatives rejected

- **A "names only" mode of Browse**, per the literal reading of #218. Rejected: it would have to
  reorder the tree, disable expansion, and drop the inlined JSON — three behaviours that share
  no code with the image browse — inside a 761-line component whose disclosure and image logic
  the checklist wants none of. Both pages get harder.
- **A flat list in pure `checklist-order.csv` sequence.** Simpler, and it would make the page
  order exactly match the artifact. Rejected because #218 asks for names *"nested taxonomically
  below higher taxa"*, and the nesting is what makes a checklist navigable.
- **Rendering the list client-side from JSON**, as Browse does. Rejected: it would make the
  page's own content depend on JavaScript, and lose print and find-in-page.
