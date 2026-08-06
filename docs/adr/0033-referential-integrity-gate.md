# 0033. Every species reference is declared in one table and checked before the build

**Status:** Accepted
**Date:** 2026-08-06
**Issue:** [#287](https://github.com/pnwinsects/pnwmoths/issues/287)
**Supersedes in part:** the closed [#232](https://github.com/pnwinsects/pnwmoths/issues/232), which asked for this and got a derivative-manifest gate

## Context

`species_slug` is the foreign key across every CSV ([ADR 0010](0010-slug-foreign-key.md)), and until
now exactly **one** of its thirteen relations was enforced at build time: `records → species`, as a
DuckDB query in `build-data.ts`. The other twelve landed in one of three places, chosen historically
rather than by principle:

- **A build gate (1)** — `records.csv` + `records-inat.csv` → species, via DuckDB.
  `check-unpublished.ts` also asserts that every deny-list slug matches exactly one species row,
  which is the same shape of check on one more file. (`data/withheld-families.csv` is *not* a slug
  relation at all — its only column is `family`.)
- **A unit test (3)** — `speciesSlugs.json` (both directions), `species-redirects.new_slug`,
  `checklist-order.csv`.
- **Nothing at all (8)** — `images.csv`, `species-links.csv`, `species-plates.csv`,
  `species-synonyms.to_species_slug`, `mpg-crosswalk.csv`, `species.csv`'s `similar_species`
  pipe-list, `src/content/species/*.md`, and `data/species-photos.json`. Two more were not even
  counted until this work went looking: `data/key-matrix.json`'s 1,191 `species[].slug` entries and
  `src/_data/speciesSlugs.json`, both committed artifacts that go stale silently.

Every unguarded relation was added without anyone deciding *not* to check it. That is the actual
failure mode: not a wrong check, but a file nobody thought to check.

An orphan slug is invisible by construction. The join produces nothing, the page renders without the
thing, no error is raised. Auditing all eleven relations found two live faults that had never
surfaced:

- **Five high-res photo sets that can never render.** `data/species-photos.json` keys
  `macaria-bitactata`, `-colata`, `-decorata`, `-lorquinaria` and `-plumosata` — 24 tiled specimen
  views, tiles already on the CDN — while `species.csv` still holds those species as *Speranza*. The
  photo pipeline resolved them to MPG's current genus and the catalogue never followed
  ([#279](https://github.com/pnwinsects/pnwmoths/issues/279)).
- **An orphan species account that turned out to be a content bug.**
  `src/content/species/lacinipolia-vicina.md` has no `species.csv` row; pulling that thread found
  `lacinipolia-sareta` publishing *vicina*'s account and *vicina*'s photos
  ([#285](https://github.com/pnwinsects/pnwmoths/issues/285)).

[#232](https://github.com/pnwinsects/pnwmoths/issues/232) had already reached this conclusion in July — *"image URLs should be checked somewhere… worth
extending it to assert every `data/images.csv` row resolves"* — and closed once `check-derivatives`
shipped. That guard checks the derivative manifest, not the foreign key, so the question stayed open
while the issue read as answered.

## Decision

**One declarative table of every place a species is referenced by slug, checked by
`scripts/check-referential-integrity.ts` before `build:data`, blocking.**

- **`RELATIONS` is the table.** Each entry names the file, the column (or that the slugs are JSON
  keys or Markdown basenames), whether a species may appear once or many times, and why the relation
  exists, and each name must be unique — two relations sharing one would collide in the references
  map and silently check one against the other's file. **Adding a data file that names species means
  adding a line here** — and a test enforces that, scanning `data/*.csv` for slug-shaped columns and
  every `data/*.json`, failing on any that is neither declared nor excused with a written reason. The
  rule is checked, not merely written down. Sources outside `data/` (`src/_data/speciesSlugs.json`,
  `src/content/species/`) are declared by hand; the scan does not reach them.
- **References are compared STRICTLY; a normalization-only match is its own failure.** The species
  side is derived exactly as `src/_data/species.ts` does it, and consumers join on the raw cell —
  `src/_data/images.ts` keys its map with `row['species_slug']`, `species.njk` compares
  `s.slug == slug`. So `aseptis-sp no 1` joins to nothing even though the species exists as
  `aseptis-sp-no-1`. Normalizing both sides would have *blessed* exactly the silent empty join this
  gate exists to catch, so a slug that resolves only after
  [`normalizeSlug`](../../src/_lib/unpublished-species.ts) is reported as a **near-miss**, with the
  form to write instead. No such reference exists today; the check is what keeps it that way.
- **Existence, not visibility.** A relation may legitimately reference a gated species: a
  deny-listed taxon keeps its images, records and Parquet on purpose
  ([ADR 0015](0015-data-driven-gating.md)). This gate asserts the row *exists*; `check-withheld` and
  `check-unpublished` own what is *published*. Conflating the two would make the deny-list
  unusable.
- **One missing species is one violation**, however many rows reference it, with every offending
  physical line named (from csv-parse's `info`, so a blank line or a quoted embedded newline cannot
  shift the numbers). The grouping matters at #232's scale: 83 broken image rows spanned 27 species,
  and per-row reporting would have made one problem look three times its size. (Those 83 were files
  missing from the CDN, not slug orphans — `check-derivatives` catches that class, not this gate.)
- **A declared source that yields NO references is itself a violation.** This is the gate's own worst
  failure mode — passing while checking nothing — and it has three realistic causes: a renamed column,
  a truncated file, and a UTF-8 BOM. The BOM is the sharp one: without `bom: true` the first header
  becomes a different string, every row's slug reads as `undefined`, and the relation silently
  disappears. Excel and Notepad on Windows add one, and this project's premise is contributor-edited
  flat files. Every parse passes `bom: true`, and the `empty` violation is the backstop if a future
  edit loses the option.
- **It runs first, before anything is built.** An orphan slug is a data fault, not a build fault, and
  the gate is cheap enough to front-load: pure CSV/JSON reads over 16,435 references, no DuckDB, well
  under a second. Running first also means it is the first thing to touch these files, so it reports
  a malformed CSV by name rather than leaking a parser stack trace — including `species.csv` itself
  and the hand-edited exceptions file, whose free-prose `issue` column will eventually contain an
  unquoted comma.
- **`data/referential-integrity-exceptions.csv` is a ratchet, not a mute switch.** It lists the
  violations that exist today, each with the issue that will resolve it. A *new* one fails. A listed
  one does not. **A listed entry that no longer matches a real violation also fails**, so the file
  shrinks as questions get answered and cannot quietly accumulate waivers. Two details make that
  promise real rather than nominal: the key includes the violation `kind`, so an orphan waiver cannot
  start silently excusing a *duplicate* of the same slug once the species is added; and matching is
  counted rather than set-based, so a copy-pasted line is reported as stale instead of both copies
  reading as live.

## Consequences

- **The gate lands green today** with six documented exceptions (five `macaria-*` photo keys, one
  orphan account) rather than waiting on two curator questions. Without the ratchet the choice would
  have been to weaken the check or to not ship it.
- **The scattered test assertions are NOT redundant, and stay.** All three files are declared
  relations now, but this gate checks one direction only: *every reference resolves to a species*.
  `speciesSlugs.test.ts` also asserts the reverse — that every species appears in
  `speciesSlugs.json`, so no legacy `/browse/` link is left unmapped — and nothing here covers that.
  `speciesRedirects.test.ts` owns the inverse rule for `old_slug`. Both remain load-bearing.
- **`data/species-redirects.csv` is deliberately half-declared.** Its `new_slug` must exist;
  its `old_slug` must *not* — the inverse rule, owned by `speciesRedirects.test.ts`. The meta-guard
  carries an explicit exclusion for it, because listing it would assert the opposite of the truth.
- **The one-shot run reports are excluded on purpose.** `coord-fill-report`, `legacy-rejoin-report`,
  `inat-sync-report` and `records-bad*` are historical records of what a script saw, not live
  references, and they are *expected* to name species that have since been renamed or removed
  ([ADR 0029](0029-removing-a-species.md) prunes them by hand).
- **`records.csv` stays with DuckDB.** `build-data.ts` already fails on orphaned records over the
  unioned curator + iNaturalist table; re-reading 94k rows here would duplicate a stronger check.
- **A `noc_id` collision report is the obvious next neighbour and is not built.** Ten `noc_id`
  values are shared by two species each — the signal that flagged the *Drasteria* and *Catocala*
  duplicate pairs before the MPG crosswalk did — but some sharing is legitimate synonymy, so it needs
  a curator-approved baseline first ([#286](https://github.com/pnwinsects/pnwmoths/issues/286)) and
  belongs in an advisory report rather than a gate.

## Alternatives rejected

- **Extend `build-data.ts` with more DuckDB queries.** It already owns the records checks, so this
  looked natural — but it would mean loading eight more CSVs into DuckDB to answer a set-membership
  question, and it runs *after* the point where a malformed file should already have been reported.
  A plain slug set is the right tool.
- **Keep enforcing these in unit tests.** Tests already covered three relations, and `npm test` runs
  in CI, so coverage was arguably achievable that way. Rejected because a test says nothing at
  `npm run build` time on a maintainer's machine — and a maintainer editing a CSV without a local
  test run is the exact person this needs to catch. The runbooks tell them to build, not to test.
- **Advisory report instead of a blocking gate.** Rejected for the FK checks: an orphan slug produces
  a silent empty join, which is the failure mode that hides for months. Advisory is right where
  judgement is involved (the `noc_id` collisions, the district QC); it is wrong where the answer is
  mechanical.
- **No exceptions file; fix the two faults first.** Both need curator answers (#279, #285), so the
  gate would have sat unmerged behind someone else's decision. The stale-exception check is what
  keeps the compromise honest.
- **Normalize both sides of the comparison.** The first implementation did this, and it is the
  intuitive reading of "the slug rule is `normalizeSlug`". It is wrong here: the *site* joins on raw
  strings, so a normalization-only match is a reference that resolves for the gate and for nobody
  else. An adversarial review caught the test that had enshrined the loose behaviour on a false
  premise about what `src/_data/species.ts` emits.
- **Derive the relation list by scanning for slug-shaped columns.** Tempting — no table to maintain.
  But `old_slug` must be absent, the run reports are expected to be stale, and a manifest's blank
  `species_slug` is normal, so the scan needs an exception list per case anyway. Better to declare
  intent explicitly and let a test enforce that the declaration is complete.

## Provenance

Two reviews shaped the final shape of this, and both found real defects in the first implementation:

- **Violations were reported per row**, so one missing species referenced on four lines read as four
  faults. Caught by a test I wrote while implementing.
- **A UTF-8 BOM made a relation vanish and the gate report PASS**, verified end to end: a real orphan
  plus a BOM on the same file exited 0, and all 31 tests of the day still passed. Fixed with
  `bom: true` plus the `empty` violation.
- **An empty or header-only source counted as a fully-checked relation.** Same fix.
- **The vacuity guards lived only in unit tests**, which this record itself argues is the wrong place:
  the runbooks tell a maintainer to run `build:site`, not `npm test`. Now enforced at build time.
- **The exceptions key ignored `kind`**, so an orphan waiver silently excused a duplicate and never
  reported stale; and duplicated waiver lines both read as live.
- **`main()` and its exit codes were untested** — flipping `process.exit(1)` to `exit(0)` left all
  tests green. Now covered by CLI tests that run the script against a fixture tree.
- **Reported line numbers assumed record index equalled physical line**, wrong after a blank line or
  a quoted embedded newline.
- Several claims in the first draft of this record were false and are corrected above: the relation
  arithmetic, `withheld-families.csv` counted as a slug relation, the "83 broken images" cited as
  slug orphans, and the assertion that three existing tests became redundant.
