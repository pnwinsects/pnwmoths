# 0018. Phenology graphs exclude reared/immature records via a notes keyword scan

**Status:** Accepted

## Context

Phenology bars are meant to depict **flight seasonality** — when adults are on the wing. Records of
larvae, pupae, eggs, and specimens reared in captivity carry a collection date that says nothing
about flight, and including them distorts the graph. Issue
[#59](https://github.com/pnwinsects/pnwmoths/issues/59) asked to exclude them.

The legacy Django site handled this at *data entry*, not at render time: `species/forms.py` scanned a
record's notes against a `REARED_TERMS` keyword list, and on a match appended the collection date
into the notes text and set `month`/`day`/`year` to NULL. The chart then simply skipped null-date
records.

That nulling is baked into our data — `data/records.csv` was exported from the same MySQL DB, so
reared records arrive with an empty `month` and the date preserved only inside `notes` (e.g.
`"em. ex. larva; July 24, 1930"`). Of 963 records matching the legacy keywords, 956 already have a
null month and are already excluded. The 7 stragglers were all added after 2011, when the
auto-nulling form stopped running.

## Decision

Replicate the keyword scan at **aggregation time** rather than mutating the data: `isRearedRecord`
in [`src/components/parquet-cache.ts`](../../src/components/parquet-cache.ts) case-insensitively
substring-matches `REARED_TERMS` against a record's notes, and `aggregateByMonth` skips matches.
This catches the 7 stragglers and makes the rule durable — a future import cannot reintroduce the
problem by supplying a populated month.

Two scoping constraints:

- **Notes field only, never any other column.** Short tokens like `em.` would false-match locality
  and collector text; one locality is literally "Emergeo".
- **No foodplant genus terms.** The legacy list carried `Rubus`, `Taraxacum`, and `broadleaf`. Notes
  record the plants *adults* were visiting as well as larval foodplants, so those terms drop
  legitimate flight records — e.g. `hemaris-thetis`, "nectaring on Taraxacum". Excluded per the
  curator.

Rejected: replicating the legacy list verbatim (keeps the foodplant false-positives), and nulling
months in `data/records.csv` at import (destroys curator-entered dates, violating the additive-only
data rule in [0014](0014-districts-offline-writeback.md)).

## Consequences

- Reared records still appear on the **distribution map**, which reads `filterRecords`, not
  `aggregateByMonth`. Only the phenology bars drop them.
- The keyword list is a heuristic over free text and will drift as notes conventions change. It is
  exported and unit-tested so its contents are reviewable in one place.
- Dropping the foodplant terms changes no graph today: only 4 records match one, all 4 match *only*
  a plant term, and all 4 already have a null month. The value is in preventing future imports from
  misclassifying nectaring adults.
- Reared dates remain trapped in prose inside `notes`, so they are not clickable on the map and
  cannot be filtered on. Tracked separately.
