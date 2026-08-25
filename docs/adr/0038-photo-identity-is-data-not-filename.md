# 0038. A photograph's species is data, not its filename

**Status:** Accepted

## Context

Every specimen photograph in this project is named for the moth in it:
`Amphipoea keiferi-A-D.jpg` is dorsal view, specimen A, of *Amphipoea keiferi*. That one
string carries three facts, and it is used for two incompatible jobs.

It is the **join key**. `data/images.csv` pairs it with a `species_slug`, the CDN stores it at
`<slug>/<filename>`, `data/image-derivatives.csv` keys 23,703 variants off that path, and the
photo manifest matches the Dropbox TIFF of the same name. A join key has to be stable.

It is also an **assertion of identity** — the only one the high-res pipeline has.
`scripts/ingest-photos.ts` has no metadata for a Dropbox TIFF beyond its name, so
`parse-photo-filename.ts` extracts the binomial and files the photo under the matching slug.
An assertion has to change when the determination changes.

Those requirements are contradictory, and the repo has already tried both branches:

- **Freeze the filename.** `migrate-renamed-species-photos.ts` says it outright — "ONLY THE
  FOLDER CHANGES. Filenames are historical specimen labels and are deliberately untouched" —
  so `trichopolia-rufula` holds photographs named `Protorthodes perforata-*`. Correct, and it
  leaves the filename asserting something false.
- **Rewrite the filename.** C-023 re-lettered filenames on merge (*unipunctaria* B→C and A→D,
  *submarmorata* A→E under *signaria*). Correct too, and it severed the link to the original:
  ten of the 83 photographs in #232 could not be found on the legacy host under their
  catalogued names, and were recoverable only by reversing the letter map by hand.

Both branches are defensible. Neither is safe, because the conflict is in the design.

What made it expensive was that nothing reconciled the two readings. `data/images.csv` carried
the curator's determination; `data/species-photos.json` carried the filename's. They disagreed
for eleven species, and because `src/species/species.njk` renders a species' tiles *instead of*
its catalogued photographs, the filename's reading is the one the public saw. The *Amphipoea
keiferi* account published nothing but photographs of *Resapamea innota*, at full resolution,
with `data/images.csv` correct the entire time and every existing gate green
([#330](https://github.com/pnwinsects/pnwmoths/issues/330),
[#336](https://github.com/pnwinsects/pnwmoths/issues/336)).

CLAUDE.md already carried the rule — "Never derive join slugs from image filenames" — as an
invariant about `species_slug`. The photo pipeline was doing exactly that, one layer down,
where the invariant had never been pointed.

## Decision

**The filename is an opaque, permanent identifier. What a photograph depicts is recorded in
data.**

1. **Filenames are never rewritten**, extending the
   `migrate-renamed-species-photos.ts` rule to the whole pipeline and superseding the C-023
   practice of re-lettering them. A filename records what the moth was called when it was
   photographed. That is provenance, and it is the only thing that still joins our copy to the
   legacy host's.

2. **`data/photo-determinations.csv` is where identity lives** when the filename disagrees with
   the catalogue. It is keyed by *photo stem* — the filename without its extension — because
   one stem names the same photograph in both places it appears (`…-A-D.jpg` in
   `data/images.csv`, `…-A-D.tif` in the manifest). Stems are unique across `data/images.csv`.
   A row carries the destination specimen letter as well as the species, because moving a
   photograph can collide with a letter the destination already uses and C-026 settles that by
   giving the incoming photograph the next free one.

3. **Filename matching stays as the default, not the last word.** `ingest-photos.ts` still
   resolves a binomial from the name — with ~3,800 photographs and no other metadata there is
   nothing else to resolve from. `generate-species-photos.ts` then applies the determinations
   over the result, and names every photograph it re-files.

4. **`scripts/check-photo-determinations.ts` gates the build** on the disagreement itself: no
   tiled specimen slot may hold a photograph the catalogue assigns to a different species. That
   check, run against the pre-fix tree, reports all 20 mis-keyed slots. A recorded determination
   exempts a pair only once the tiles have actually landed where it says — `photos:materialize`
   is not part of `build:site` and `data/species-photos.json` is committed, so exempting on the
   mere existence of a row would let a half-finished runbook ship the wrong moth with every gate
   green.

5. **One filename parser, not three.** `identityFromFilename()` in
   `scripts/lib/photo-determinations.ts` is what ingest, the gate and the migration all read
   names with. A gate that parses filenames more narrowly than the pipeline it guards is blind
   exactly where it matters: a private regex requiring a hyphen before the specimen could not see
   the seven space-separated names ingest admits on purpose (`Euxoa absona A-D`, and six more,
   all tiled). It also may not parse more *loosely* in the wrong dimension — `extractBinomial()`
   splits on the first space and reads `Mniotype aff tenera-B-V` as "mniotype aff", losing a real
   species.

## Consequences

The immediate failure is closed and cannot recur silently: the gate runs in `build:site`, ahead
of anything that renders a page.

The underlying conflation is *reduced, not removed*. The filename is still the join key, and it
still asserts a species; we have merely made the assertion overridable and added a check that
notices when it is wrong. A photograph whose filename is right needs no row, so the default path
is unchanged for ~99% of the corpus.

The honest end state is an opaque photo identifier — `content_hash` already exists in
`data/species-photos-manifest.csv` and would serve — with binomial, specimen and view as
columns rather than substrings. That is a migration across `data/images.csv`, 23,703 derivative
paths, ~2,700 tile objects per re-key and every runbook in `_instructions/`, and it would cost
the one thing the filenames currently give us for free: a maintainer can read a directory
listing and see what is in it. It is not proposed here. It is recorded as the direction, so that
the next person who finds a photograph filed under the wrong moth knows this was a design
choice and not an oversight.

Two things stay unresolved and are tracked, not silently accepted:

- 22 specimen letters are claimed by more than one photograph, all from earlier
  redeterminations that kept the old filename. Check D reports them; it is advisory because each
  needs the curator, and failing the build on a backlog of taxonomic questions would stop all
  work on this repo.
- Renaming remains *possible* through the CDN migration scripts. Nothing mechanically prevents a
  future migration from rewriting filenames; this ADR and the header of
  `scripts/lib/photo-determinations.ts` are what argue against it.
