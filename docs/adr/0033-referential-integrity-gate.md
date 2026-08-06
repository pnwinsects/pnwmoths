# 0033. Every species reference is declared in one table and checked before the build

**Status:** Accepted
**Date:** 2026-08-06
**Issue:** [#287](https://github.com/pnwinsects/pnwmoths/issues/287)
**Supersedes in part:** the closed [#232](https://github.com/pnwinsects/pnwmoths/issues/232), which asked for this and got a derivative-manifest gate

## Context

`species_slug` is the foreign key across every CSV ([ADR 0010](0010-slug-foreign-key.md)), and until
now exactly **one** of its relations was enforced at build time: `records → species`, as a DuckDB
query in `build-data.ts`. The other ten landed in one of three places, chosen historically rather
than by principle:

- **A build gate** — records, and the two visibility deny-lists.
- **A unit test** — `speciesSlugs.json` (both directions), `species-redirects.new_slug`,
  `checklist-order`.
- **Nothing at all** — `images.csv`, `species-links.csv`, `species-plates.csv`,
  `species-synonyms.to_species_slug`, `mpg-crosswalk.csv`, `species.csv`'s `similar_species`
  pipe-list, `src/content/species/*.md`, and `data/species-photos.json`.

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

#232 had already reached this conclusion in July — *"image URLs should be checked somewhere… worth
extending it to assert every `data/images.csv` row resolves"* — and closed once `check-derivatives`
shipped. That guard checks the derivative manifest, not the foreign key, so the question stayed open
while the issue read as answered.

## Decision

**One declarative table of every place a species is referenced by slug, checked by
`scripts/check-referential-integrity.ts` before `build:data`, blocking.**

- **`RELATIONS` is the table.** Each entry names the file, the column (or that the slugs are JSON
  keys or Markdown basenames), whether a species may appear once or many times, and why the relation
  exists. **Adding a data file that names species means adding a line here** — and a test enforces
  that, scanning `data/*.csv` for slug-shaped columns and failing on any that is neither declared nor
  excused with a reason. The rule is checked, not merely written down.
- **Every comparison goes through [`normalizeSlug`](../../src/_lib/unpublished-species.ts)**, so a
  space-form slug (`aseptis-sp no 1`) resolves the way `species.csv` does rather than reading as an
  orphan.
- **Existence, not visibility.** A relation may legitimately reference a gated species: a
  deny-listed taxon keeps its images, records and Parquet on purpose
  ([ADR 0015](0015-data-driven-gating.md)). This gate asserts the row *exists*; `check-withheld` and
  `check-unpublished` own what is *published*. Conflating the two would make the deny-list
  unusable.
- **One missing species is one violation**, however many rows reference it, with every offending
  line named. #232's 83 broken images spanned 27 species; reporting 83 faults would have made one
  problem look three times its size.
- **It runs first, before anything is built.** An orphan slug is a data fault, not a build fault, and
  the gate is cheap enough to front-load: pure CSV/JSON reads over 13,820 references, no DuckDB, well
  under a second. Running first also means it is the first thing to touch these files, so it reports
  a malformed CSV by name rather than leaking a parser stack trace.
- **`data/referential-integrity-exceptions.csv` is a ratchet, not a mute switch.** It lists the
  orphans that exist today, each with the issue that will resolve it. A *new* orphan fails. A listed
  orphan does not. **A listed entry that no longer matches a real violation also fails**, so the file
  shrinks as questions get answered and cannot quietly accumulate waivers.

## Consequences

- **The gate lands green today** with six documented exceptions (five `macaria-*` photo keys, one
  orphan account) rather than waiting on two curator questions. Without the ratchet the choice would
  have been to weaken the check or to not ship it.
- **The scattered test assertions can fold in.** `speciesSlugs`, `species-redirects` and
  `checklist-order` are enforced in three separate test files today; they are declared relations now,
  so those assertions become redundant rather than load-bearing. Left in place for now — deleting a
  working test is a separate change from adding a gate.
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
- **Derive the relation list by scanning for slug-shaped columns.** Tempting — no table to maintain.
  But `old_slug` must be absent, the run reports are expected to be stale, and a manifest's blank
  `species_slug` is normal, so the scan needs an exception list per case anyway. Better to declare
  intent explicitly and let a test enforce that the declaration is complete.
