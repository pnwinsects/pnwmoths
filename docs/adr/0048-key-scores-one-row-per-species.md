# 0048. The identification key is scored one species per row, by binomial, with a derived template for the species it lacks

**Status:** Accepted · Refs [#390](https://github.com/pnwinsects/pnwmoths/issues/390) · Amends [ADR 0012](0012-identify-static-key.md)

## Context

Identify's scores came from Lucid3's export, `data/key-characters.csv`: one **row per
character-state** (237) and one **column per species** (1,228). Nothing had been added to it
since the import. Adding a species meant inserting a column into all 237 rows by hand, which is
error-prone in Excel and turns every line of the file into a diff. The export also left one
label's inner quotes unescaped (`was "dipped" in`), so the file could only be read with
`relax_quotes`, and `parseCharacterLabel` had to strip a stray outer quote pair.

The curator asked (#390) for a spreadsheet with **a row per species and a column per
character** that he could fill in, one species or many at a time. That matters now: 46
published species have no scores, and none of the 122 Geometridae do, so they can't be added to
the key when their embargo lifts.

## Decision

- **`data/key-scores.csv` replaces `data/key-characters.csv`, transposed.** The first column is
  `binomial`. Every other column is a character-state, headed with Lucid's full
  `Category:[Subcategory:]Question:State` label. A cell is `1`, or blank for unscored (`0` is
  accepted on input and means the same). "Unscored, never absent" from ADR 0012 is unchanged.
  The file is written by csv-stringify, so its quoting is valid CSV and `relax_quotes` is gone.
- **Rows are named by binomial, not by slug.** The key holds 19 names we cannot join to a
  published species. Eleven are probable synonyms waiting on a curator ruling (C-032).
  Re-keying by slug would have meant either dropping their scores or making those rulings
  silently in a data migration. Binomials resolve to slugs exactly as before: directly, then
  through `data/species-synonyms.csv`. They are also what the curator writes. So the file is
  not a slug relation and is not in `RELATIONS`. An unmatched name surfaces in the committed
  `data/key-coverage-report.json`, which the staleness test forces into the diff.
- **Column position is still `char_id`.** `data/key-character-images.csv` binds help images by
  it, so the 237-column invariant stays, and its error message says to re-bind the images
  before changing it.
- **`build-key.ts` also emits `data/key-template.csv`**: the same header, then one blank row
  for each species we hold that no key row resolves to. That includes withheld species, because
  scoring them is how an embargo lifts. Unpublished ones are left out. Published species come
  first, then withheld, each in checklist order. It is committed, covered by the same staleness
  test as the matrix, and listed on `/curation/` (ADR 0037).
- **`npm run key:merge -- <file>` appends a filled-in template**, additive only. It refuses
  the whole file if its columns differ from the key's, or if any name resolves to no species.
  It skips rows with no `1`. It leaves species the key already scores untouched and lists them,
  because correcting an existing species is a deliberate edit to `data/key-scores.csv`.

The transposition was verified by rebuilding: `key-matrix.json` and `key-coverage-report.json`
came out byte-identical to the versions built from the old file.

## Consequences

- Adding species to the key is: download the template, fill in `1`s in Excel, attach it, run
  `key:merge`, run `build:key`. One species or the 122 Geometridae go through the same steps.
- A git diff of a key change shows one line per species touched.
- Rows with no scores at all make a species match every query. Three such rows came over from
  Lucid (*Hypenodes fractilinea*, *Hypenodes sobria*, *Xestia normanianus*), and two of them
  reach Identify. They are kept as-is here, so the transposition changes no output. `key:merge`
  will not add more.
- Adding a character means adding a column, re-binding the help images after it and updating
  the 237 invariant. Existing species are unscored on a new character, so it never excludes
  them.

- **Since C-038**, the curator has confirmed 12 of those unmatched names as synonyms of species we
  publish, so 7 remain unmatched (one unpublished, one unscored, *Lacinipolia vicina*, and four
  species we hold no account for).

## Alternatives considered

- **A template beside the old file, with an importer that inserts columns.** Rejected: it keeps
  the sideways layout as the thing people edit, so the diff noise, the quoting workaround
  and the hand-editing risk all stay. Correcting an existing species would still mean finding
  its column among 1,228.
- **Key the rows by `species_slug`.** Rejected for now (see above). Doing it would turn
  the 19 unmatched names into referential-integrity exceptions or deleted data. It is worth
  revisiting once the C-032 synonym rulings are made.
- **An `.xlsx` or Google Sheet as the source.** The curator is happy with either for scoring
  ([#390](https://github.com/pnwinsects/pnwmoths/issues/390#issuecomment-6049060198)), so the template
  stays a CSV that opens in both, and `data/key-scores.csv` stays the source. A committed `.xlsx`
  would have meant a binary in the repo and a second format to parse.
- **Fill blank template rows into `key-scores.csv` directly.** Rejected: an all-blank row puts
  the species in every Identify result.
