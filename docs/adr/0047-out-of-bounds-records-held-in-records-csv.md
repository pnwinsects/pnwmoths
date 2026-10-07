# 0047. Out-of-bounds records are held in `records.csv`, not in a sidecar; the build leaves them out and lists them every build

**Status:** Accepted · Closes [#386](https://github.com/pnwinsects/pnwmoths/issues/386) · Extends [ADR 0044](0044-record-id.md) · Refs [#367](https://github.com/pnwinsects/pnwmoths/issues/367) · The bounds quoted below were widened to lat 41–61° N, lon 104–139° W by the curator's #367 rulings (C-037), as the Consequences section anticipated; the mechanism is unchanged.

## Context

166 occurrence records carry plausible coordinates outside the publishing bounds
(`RECORD_COORDINATE_BOUNDS`, lat 42–60° N, lon 110–139° W): 160 from central and eastern
Montana, east of 110° W, and 6 labelled Oregon or Idaho that fall a few kilometres into
California or Nevada. Whether they belong on the site is the curator's call, put to him
in #367.

They lived in `data/records-bad-coords.csv`, written once by
`scripts/recover-clipped-bc-records.ts` from the reference MySQL container. That file could
not be regenerated: the container is stopped by default and not on every maintainer's
machine, the build is offline, and a re-run would have restored every resolved row. So the
only way to resolve a record was to delete its row, and the deletion was the only trace a
decision had been made. #368 resolved 18 records that way; nothing outside its diff said
which or why, and no curation-log entry was written.

A rulings file keyed by record (the first proposal) does not work: the sidecar's rows had no
`record_id`. ADR 0044 mints ids only in `records.csv`, and the extraction never captured
the legacy id.

## Decision

- **The held records move into `data/records.csv`**, appended with ids 94147–94312 from
  `npm run records:assign-ids` and districts from the usual runbook. The sidecar is deleted
  and the recovery script refuses to run.
- **An *out-of-bounds record* is a `records.csv` row outside the publishing bounds but
  inside the district-assignment bounds** (`PNW_BOUNDS`, lat 41–61, lon −140 to −103). It is
  plausibly regional, just not on the map. The predicate lives beside the bounds in
  [`scripts/lib/records-source.ts`](../../scripts/lib/records-source.ts), in TypeScript and
  in SQL, with tests that hold the two to each other.
- **The served union leaves them out.** `buildAllRecordsSql` is already the one definition
  of "every record the site serves"; its curator side gains `WHERE NOT <out of bounds>`, so
  the Parquet export, the state and district aggregates, the species audit and the
  home-page count all drop held records without any of them changing. A blank coordinate is
  not "out of bounds" — it stays in the union so the NULL check fails on it.
- **Held records are still validated.** `build-data.ts` runs the slug, type, state and NULL
  checks over a second table that includes them. Otherwise widening the bounds could publish
  an orphan, and a row could sit unpublishable for a second reason nobody sees. The first
  build that checked them found one: a Havre, Montana record still under
  `protorthodes-incincta`, a slug retired when *Protorthodes* moved to *Trichopolia*
  ([C-016 and C-017](../curation-log.md), #259). Every published record had been moved at the time; the
  sidecar was not. It now carries `trichopolia-incincta`, as the ruling already said.
- **A coordinate outside the district-assignment bounds still fails the build.** That is a
  typo, not a coverage question: almost always swapped latitude and longitude, or a missing
  minus sign. Before this change the curator saw those as a build failure; holding them
  silently would hide the slip.
- **The iNaturalist file is not filtered.** The sync drops out-of-bounds observations before
  writing, so an out-of-bounds row there is a generator bug, and the bounds check (now over
  the served table) still fails on it.
- **The report derives every build**:
  [`scripts/emit-out-of-bounds-records.ts`](../../scripts/emit-out-of-bounds-records.ts)
  writes `_site/records-out-of-bounds.csv`, one row per held record with its `record_id` and
  the edge it lies past, listed on `/curation/`.

## Consequences

- **A ruling is an ordinary data edit**, and the report follows on the next build. "Yes" to
  Montana east of 110° W is widening `RECORD_COORDINATE_BOUNDS`; correcting a coordinate
  publishes the row; deleting a row excludes it and retires its id. The ruling's reasoning
  goes in the curation log, as for any other.
- **What the site serves is unchanged by the move.** The 166 rows were not served before and
  are not served now; only their location changed.
- **The district audit includes held records.** It compares a record's stated county with
  its coordinates, which is as useful for a held record as any other, and it is a curation
  report rather than a published surface.
- **`records.csv` now holds rows the site does not show**, as the deny-lists already do for
  species. A curator who appends a record east of 110° W sees the build pass and the record
  absent from the map; the build log names the count, and the runbook says where to look.
- The build gains one step, and the runbooks that quote the step count were updated.

## Alternatives considered

- **A `record-rulings.csv` beside a committed snapshot of the sidecar.** Rejected: the
  snapshot rows had no identifier to key a ruling by, and minting one there would create a
  second id space beside ADR 0044's. With the records in `records.csv`, the ruling *is* the
  edit, and there is nothing to key.
- **Re-extracting with the legacy record id** from the MySQL container and keying rulings on
  that. Rejected: it needs the container on a maintainer's machine, and it keeps a
  hand-curated snapshot that the build cannot regenerate.
- **Holding every out-of-bounds row, including typos.** Rejected: it turns a swapped
  coordinate from a build failure into a silent hold, which is worse feedback than the
  curator had before.
