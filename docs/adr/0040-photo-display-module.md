# 0040. One module owns photo display selection; the index it derives is checked against the emitted HTML

**Status:** Accepted

## Context

Six surfaces render photographs out of `data/images.csv`, with seven selection rules between
them (Browse picks differently at the genus level than above it). Each rule was written where
it was used: two DuckDB `ORDER BY`s, two in-memory sorts, two Nunjucks expressions, across four
files and three languages. Every one was locally sensible and locally commented, and none of
them could be asked a question.

Only one of the six knew that high-resolution tiles exist. `src/species/species.njk` renders
tiles *instead of* the catalogued photographs, so tiling a species silently removed its
photographs from its own page while leaving them on `/browse/`, on Identify, and on other
species' pages.

The cost landed on the hidden-images report ([#299](https://github.com/pnwinsects/pnwmoths/issues/299)),
which needed exactly the question nobody could answer — *where does this photograph appear* —
and got it wrong three times:

1. Read `species.njk`, saw the tiles branch was exclusive, concluded those photographs reached
   no page. Wrong: three other surfaces display them.
2. Reimplemented the five orderings from source. Still wrong: Identify has no card for
   published species the Lucid key does not carry.
3. Still wrong: the genus strip takes four images across a whole genus, so a species can
   contribute a photograph that no per-species model predicts — the *Phyllodesma coturnix*
   dorsal, the case the curator asked about by name.

The report's answer was to stop modelling and **grep the emitted HTML**. That was honest, and
it was the right call with nothing to trust — but it made a data report depend on a completed
build, and it left the rules themselves unowned.

### The framing that was wrong

[#338](https://github.com/pnwinsects/pnwmoths/issues/338) originally asked for *"one module
answering 'which photograph does this species show, and where'"*. That sentence reproduces the
error it reports. **A species does not show a photograph; a surface does** — the genus strip is
not keyed by species at all, which is exactly what fooled attempt 3. And "show" hides three
inputs that are not in `images.csv`: tile status, gating, and whether the key matrix carries the
species.

## Decision

**Two questions, three layers, and a gate that checks the answer against the bytes.**

The questions are different shapes, and conflating them is what made "one module answering
both" sound like a plan:

1. **Selection** — given a surface and a scope, which row do I render? Per (surface,
   species-or-genus) → one row. Asked at build time by a caller that already knows where it is.
2. **Location** — given a photograph, where does it appear? Per photograph → a set of surfaces.
   It is the **transitive closure** of (1), obtained by running every picker across the
   catalogue and inverting — a derived artifact, not a peer function.

The layers:

- **An ordering, in both dialects** — `WEIGHT_ORDER_SQL` / `NON_VENTRAL_SQL` alongside
  `compareByWeight` / `isVentral` in [`src/_lib/photo-display.ts`](../../src/_lib/photo-display.ts).
  `src/_data/taxon.ts` and `scripts/build-key.ts` select over the whole images table in DuckDB,
  so a per-species TypeScript function was never the right signature for them; they interpolate
  the fragments, and the fragments sit next to their in-memory twins so the two cannot quietly
  diverge.
- **A picker per surface** in the same module, parameterized by scope, count, filter and
  tile-awareness — with `TILE_POLICY` naming what tiles do to each surface
  (`replaces` / `prefers` / `fallback` / `ignores`). The account's exclusive tile branch is
  stated once, as data, instead of being known to one consumer out of six.
- **An inverse index** in [`src/_lib/photo-display-index.ts`](../../src/_lib/photo-display-index.ts),
  built by [`scripts/lib/display-index.ts`](../../scripts/lib/display-index.ts) **out of the
  artifacts the surfaces render from** — the Browse tree from `src/_data/taxon.ts`, the
  committed key matrix, the species collection with its gates already applied. It does not
  restate the strip rule; it walks the tree that already holds the answer.

And the part that makes it safe to trust:

- **[`scripts/check-display-index.ts`](../../scripts/check-display-index.ts) runs inside
  `build:site`** and fails the build on any disagreement between the index and the emitted
  HTML, in either direction. The scan that the report used to depend on lives on in
  [`scripts/lib/site-scan.ts`](../../scripts/lib/site-scan.ts) as the **check**, not as the
  answer.

`data/hidden-images-report.csv` now reports from the index and needs no build.

### Rejected: keep scanning the HTML

It works and it is honest, but it makes every consumer of the question depend on a completed
site, and it answers *where* without ever saying *why* — a scan sees a filename in a page, not
the rule that put it there. It is kept, in its proper role.

### Rejected: trust the module

That is what the three wrong models did. The difference here is not that this model is
cleverer; it is that a wrong model now fails a build instead of producing a plausible CSV.

## Consequences

The site output is unchanged — verified by building `_site/` before and after and comparing all
6,953 files byte for byte; the only difference is the regenerated report CSV. The report
produced from the index is byte-identical to the one produced by scanning the same built site.

The gate costs a DuckDB pass and an `_site/` walk (a few seconds) on every build, and the
report now spins up DuckDB where it used to parse CSVs. In exchange the report drops its build
requirement, and `docs/reference/photo-display-rules.md` stops being a hand-maintained list
that nothing checks — it documents a module that a gate holds to the emitted page.

What this does **not** do: it does not unify the seven rules. They differ for real reasons —
Browse excludes ventral shots ([#107](https://github.com/pnwinsects/pnwmoths/issues/107)), the
genus strip crosses species boundaries, Identify reaches only what the key carries. The module
makes the differences visible and testable in one file; it does not pretend they are one rule.

A surface added later must be added in three places: a picker, the index, and the rules doc. If
it is added to the site and not to the index, the gate fails on the first photograph it
displays — which is the intended way to find out.
