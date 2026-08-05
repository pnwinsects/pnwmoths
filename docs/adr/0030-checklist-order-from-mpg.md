# 0030. Checklist order comes from the MPG taxon list

**Status:** Accepted

Supersedes the legacy-CMS nested-set extraction, described in
[data-provenance](../reference/data-provenance.md#reference-mysql-database-original-cms-data), as of PR #221 /
issue #259. (`data/README.md#checklist-order` now documents *this* decision, not the one being
superseded.) That approach was never released; its rationale is preserved below
rather than deleted, because the *problem* it identified is unchanged and the reasoning about
row-order-as-data survived intact into this decision.

## Context

Professional users read the catalog in **checklist order** — phylogenetic sequence, the order a
printed checklist uses. Drepanidae before Noctuidae; *Habrosyne* before *Ceranemota*. The checklist
page ([#218](https://github.com/pnwinsects/pnwmoths/issues/218)) needs it, and nothing in `data/`
encoded it.

`noc_id` cannot serve as a sort key. Across the 1,424 species it has 26 blanks, three incompatible
formats in one column (bare integers, `93-XXXX` Poole 1989 Noctuoidea numbers, and `MONA 7731`),
and 10 values shared by two species. More fundamentally it says nothing about the order of
families, subfamilies, or tribes — only species carry it.

### What we tried first

The order survives in the reference MySQL database. The legacy site was a django-cms install whose
page tree under `/browse/` is an MPTT nested set, and its left-to-right walk *is* the sequence
`/browse-all/` rendered. Walking it produced two files — `data/taxon-order.csv` (482 rows: family,
subfamily, tribe, genus) and `data/species-order.csv` (297 rows: the 30 genera the site does not
list alphabetically). Verified against the curator's `species_with_published_pages.docx`: over the
418 higher taxa the two share, **the order matched exactly**.

It worked. It had one structural flaw: **the tree can only place taxa that existed when the CMS was
dumped.** Every species added since had no node, and fell to the end of its genus unless a curator
placed it by hand. That cost recurs on every future addition, forever.

### What changed

The curator proposed the Moths Photographers Group taxon list
([#218 comment](https://github.com/pnwinsects/pnwmoths/issues/218#issuecomment-5162215105)),
`MPG-Taxa_20240311.xlsx`, 13,245 rows covering all of North America. Measured against our 1,424
species it wins on three counts:

- **It agrees with the order we reconstructed.** Kendall τ = 0.96 over the 1,339 species that match
  by name (1.98% of pairs discordant). We are not trading one curated sequence for a different one;
  we are getting the same sequence from a maintained source.
- **Our genera stay contiguous in it.** Restricted to the species we hold, every one of our genera
  occupies a single unbroken block of MPG rows. So *one* sort key over species reproduces family,
  subfamily, tribe and genus order — two files collapse to one. This is asserted by a test, not
  assumed; see "Consequences".
- **It answers placement for future additions.** MPG covers the continent, so a new PNW species
  arrives with a position already assigned instead of needing a curator decision.

## Decision

**Derive checklist order from the MPG taxon list. Emit one file, `data/checklist-order.csv`, in
which row order is the data.**

- `data/mpg-taxa.csv` is the committed source — all 17 workbook columns, rendered from the `.xlsx`
  once by [`scripts/convert-mpg-xlsx.ts`](../../scripts/convert-mpg-xlsx.ts). The workbook is a zip
  of XML: opaque to `git diff`, and reading it at build time would mean a spreadsheet dependency
  this project does not have. A CSV rendering is diffable against the next MPG release.
- [`scripts/build-checklist-order.ts`](../../scripts/build-checklist-order.ts) joins it to
  `data/species.csv` and writes `data/checklist-order.csv` (ADR 0017: a reproducible, committed
  artifact).
- **No ordinal column.** Row order *is* the order. An integer rank would have to be renumbered
  downstream of every insertion. `mpg_p_no` rides along as provenance so a future MPG release can
  be diffed against this one — it is deliberately **not** the sort key, because MPG renumbers
  between releases.
- **Matching runs in tiers, and every tier is either mechanical or an explicit committed decision.**
  Exact binomial → Latin gender-ending variant → MONA number → full original combination named in
  MPG's synonymy → [`data/mpg-crosswalk.csv`](../../data/mpg-crosswalk.csv), where each row records
  a curator decision *and its source*. Current coverage: 1,364 exact, 5 gender, 23 MONA,
  5 synonymy, 5 crosswalk = 1,402 of 1,424.
- **Anything unplaced falls to the end of its genus and is reported on every run**, so the
  alphabetical fallback stays a visible decision. The remaining 22 are 21 provisional names
  (`sp`, `n sp`, `aff x`, `nr x`) that have no MPG row by definition, plus one open curator
  question — `macaria-marmorata`, where MPG's mapping crosses subfamily and the curator said not
  to act.

**Ordering by MPG does not mean adopting MPG's generic placement.** `species_slug` is the foreign
key across every CSV and the URL structure, so each rename costs a redirect plus a data migration.
The crosswalk lets us sit at MPG's position while keeping our own name; renames are decided one at
a time by the curator. Six were, in this PR (see #259).

## Consequences

- **Family sequence changes** from the legacy tree's Geometridae-first to the standard Pohl
  sequence: Drepanidae, Lasiocampidae, Saturniidae, Sphingidae, Uraniidae, Geometridae,
  Notodontidae, Erebidae, Euteliidae, Nolidae, Noctuidae. Geometridae is withheld today
  (`data/withheld-families.csv`), so this is not user-visible yet. A test pins the sequence.
- **Genus contiguity is a load-bearing invariant, so it is tested.** If a future MPG release or a
  new species ever fragments one of our genera, the one-sort-key design silently stops reproducing
  genus order. `scripts/build-checklist-order.test.ts` fails instead.
- **A partial genus rename fragments a genus.** Renaming two of our six *Protorthodes* to
  *Trichopolia* interleaved the two names, because MPG holds all six under *Trichopolia*. Renames
  within a genus have to be all-or-nothing; that is what forced the other four in this PR.
- **Renaming a slug leaves the CDN behind.** `species_slug` is the CDN folder key, so the eight
  renames in this PR left **1,730 objects** needing an additive copy before their images resolve
  ([#266](https://github.com/pnwinsects/pnwmoths/issues/266), done). `data/cdn-retired-images.csv`
  is *not* the work-list, though it was first taken for one: it enumerates the originals and the
  derivative variants — 144 rows — but not the DeepZoom pyramids under `species-tiles/`, which are
  1,586 of the total and are what the high-res viewer fetches. The work-list is a walk of the four
  slug prefixes in the storage zone. `check-derivatives.ts` reads the manifest, not the CDN, so the
  build cannot catch any of it.
- **Ordering surfaced duplicate species.** Six of our species resolve to an MPG row another of our
  species already occupies — the curator's synonymies plus three the matcher found
  ([#265](https://github.com/pnwinsects/pnwmoths/issues/265)). Order is unaffected (the tie-break
  is deterministic), but the duplication is a data-integrity problem the join made visible.
- **A refresh is a maintainer run, not a build step.** When MPG ships a new workbook:
  `node scripts/convert-mpg-xlsx.ts <file>` then `node scripts/build-checklist-order.ts`, and read
  the unplaced report. Both outputs are committed.
- **The reference MySQL container is no longer needed for ordering.** It remains the source for
  reference links, plates, tribe and county backfills
  ([docs/reference/data-provenance.md](../reference/data-provenance.md)).

## Alternatives rejected

- **Keep the CMS extraction.** Same order, but no answer for new species, and two hand-maintained
  files instead of one. Its verification against the curator's document is what gave us confidence
  that MPG's sequence is the right one, so it earned its keep.
- **Commit the `.xlsx` (1.6 MB).** Smaller than the 4.1 MB CSV and byte-identical to what the
  curator sent, but binary — unreviewable in a diff, and it would need a spreadsheet parser as a
  new dependency or a checked-in converter anyway.
- **Commit a trimmed CSV (2.0 MB).** Drops columns no code reads. Rejected: the file is our only
  copy of a source we do not otherwise keep, and the next curator question is as likely to be about
  an authority or a taxonomic note as about sequence.
- **An ordinal `sort_order` column.** Renumbering on every insertion, and a merge conflict on every
  concurrent edit.
- **Adopt MPG's genus, subfamily and tribe wholesale.** 37 genus reassignments and 53
  subfamily/tribe disagreements, each costing a redirect and a migration. Sequence and nomenclature
  are separable, so they are separated.
