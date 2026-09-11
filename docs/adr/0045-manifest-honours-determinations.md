# 0045. The photo manifest files a photograph where the curator's determination says, not where its filename does

**Status:** Accepted · Applies [ADR 0038](0038-photo-identity-is-data-not-filename.md) to the ingest resolver · Closes the engineering half of [#342](https://github.com/pnwinsects/pnwmoths/issues/342)

## Context

[ADR 0038](0038-photo-identity-is-data-not-filename.md) made `data/photo-determinations.csv`
the authority on what a photograph depicts, and taught the photo index and the CDN inventory
to apply it. The manifest resolver in `scripts/ingest-photos.ts` was not taught: it still filed
every TIFF by what its filename could be matched to. A determined photograph whose filename
named no current species stayed in `genus-only` or `likely-synonym`, which the tiler does not
touch. That is why six TIFFs the curator ruled on in #330 — four *Amphipoea senilis* that are
*A. keiferi*, two *Nycteola frigidana* that are *N. cinereana* — were ingested, ruled on, and
never tiled.

The workaround would have been a synonym row (`Amphipoea senilis → amphipoea-keiferi`). It is
wrong for the *Nycteola* pair, because *N. frigidana* is a real species and only these two
photographs of it are misnamed; and it would have filed them under specimen A, where
*N. cinereana* already has one, when the ruling gives them letter C.

## Decision

- `npm run photos:investigate` applies every determination to the manifest, after the synonym
  pass and the specimen backfill, so the ruling overrides a synonym or a confident clean match
  and its letter is not backfilled over. The row takes the determined `species_slug` and
  `specimen_id`, `binomial_resolved` from `species.csv`, and the bucket
  **`resolved-via-determination`**.
- That bucket is tileable. A curator's determination *is* the curation the other unresolved
  buckets are waiting for.
- Idempotent: a row already carrying the determined values is untouched. A determination
  naming a slug `species.csv` lacks is skipped with a warning; the referential-integrity gate
  refuses that file before a build anyway.
- Rows already tiled and re-keyed on the CDN under C-028 are re-labelled the same way, so the
  manifest now says on its face what the index and the inventory were computing on the fly.
  `applyDeterminations` in `generate-species-photos.ts` stays as the belt to this brace and is
  a no-op for them.

## Consequences

- After this pass the six #342 rows are tileable; the tiling and upload still need a machine
  with the Dropbox and Bunny credentials and are the operational half of #342.
- A future ruling reaches the tiler by the existing runbook: add the row to
  `photo-determinations.csv`, run `photos:investigate`, tile, upload, materialize.
- The manifest's `species_slug` is no longer "the filename match and nothing else". Anything
  that wanted the filename's claim must read `filename_raw`, which is what
  `identityFromFilename` already does.
