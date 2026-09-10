# 0042. The iNaturalist sync keeps an observation's date only when the observer annotated it Adult

**Status:** Accepted · Applies [C-013](../curation-log.md) · Extends [ADR 0018](0018-phenology-reared-exclusion.md)

## Context

Phenology bars depict flight seasonality, so a record of a larva, pupa or egg must not
contribute its date ([ADR 0018](0018-phenology-reared-exclusion.md)). Hand-entered records
achieve that through a keyword scan of `notes`, which works because the curator writes
"larva" or "em. ex." in the note. An iNaturalist observation has no such prose. What it has is
a structured **Life Stage** annotation, when the observer bothered to set one.

The curator ruled on this in [#172](https://github.com/pnwinsects/pnwmoths/issues/172),
recorded as [C-013](../curation-log.md): only an observation annotated *adult* may
contribute its date; egg, larva and pupa move the date into the notes; and an observation
with **no** annotation is treated the same way. Until now the sync ignored the annotation and
imported every date, so the rule was recorded but not applied.

#172 also asked whether the life stage should become an explicit column rather than text in
`notes`.

## Decision

- The sync requests `annotations` and reads the Life Stage term (id 1). Only the value
  **Adult** (id 2) keeps `year`/`month`/`day`. Teneral (id 3) does not count as adult: it is
  an adult that cannot yet fly, and the ruling names adults on the wing.
- Any other value, and no annotation at all, blanks the three date columns and writes the
  stage and the observed date into `notes`, between the accuracy and the URL:
  `location accuracy: 15m; larva, observed 2021-07-04; https://www.inaturalist.org/observations/…`.
  A missing annotation is written as `life stage not annotated, observed …`.
- **No new column.** The record still plots on the map; only its date is withheld. Putting
  the date in `notes` is what C-013 says in the curator's own words, it is where the
  hand-entered convention already keeps such dates (`"em. ex. larva; July 24, 1930"`), and
  it means `data/records-inat.csv` keeps the same fifteen columns as `data/records.csv`. A
  column would have required every reader of records to learn it for the sake of a
  distinction the blank month already expresses.
- The ids are constants in [`scripts/lib/inat.ts`](../../scripts/lib/inat.ts), with the
  full value list from `GET /v1/controlled_terms` in the comment beside them. An unknown
  value id is written to the note by number rather than mapped to anything.

## Consequences

- An unannotated adult loses its date from the phenology bars. That is the conservative
  direction the curator chose; the remedy is on iNaturalist, where anyone can add the
  annotation, and the next sync picks it up.
- The `REARED_TERMS` scan ([ADR 0018](0018-phenology-reared-exclusion.md)) also matches the
  word `larva` in these notes, so an immature record is excluded twice over. Harmless.
- `assertObservationShape` accepts an absent `annotations` field, because the API omits it on
  an observation that has none, but rejects a non-array, so a renamed field still fails loudly.
