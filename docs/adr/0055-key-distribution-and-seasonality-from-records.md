# 0055. The key's Distribution and Seasonality answers are derived from the occurrence records, and add to the hand-entered scores

**Status:** Accepted · Refines [0048](0048-key-scores-one-row-per-species.md) · Issue [#397](https://github.com/pnwinsects/pnwmoths/issues/397) · Curation log [C-040](../curation-log.md)

## Context

Sixty-four of the key's 237 character-states ask where and when a moth was found: 5 states or provinces, 47 ecoregions within them, and 12 months. Until now they were scored by hand in `data/key-scores.csv`, like every other character, so each species added to the key needed all 64 scored by hand. The curator asked for this to be automated "as much as possible", including assigning ecoregions from boundary files, as he recalls the original site doing ([#390](https://github.com/pnwinsects/pnwmoths/issues/390#issuecomment-6049060198)). He then ruled that the key should use the records as they are, sparse or not, provided the key tells its users that these answers change as records are added and are unreliable for species with few records, and points them to iNaturalist for range and season extensions ([C-040](../curation-log.md)).

Comparing the hand scores with today's records showed that the hand scores were almost certainly derived from an earlier copy of the same records:

| Question | Hand-scored cells | Of those, with no record behind them | Cells the records add |
| --- | --- | --- | --- |
| State or province | 3,621 | 41 (39 species) | 210 |
| Ecoregion | 12,267 | 157 (140 species) | 1,247 |
| Month (adults only) | 4,825 | 236 (190 species) | 167 |

The unsupported cells are a mix. Some look like errors the records have since corrected: *Malacosoma disstria* and *Phyllodesma americana* are scored for February, and no adult of either has been recorded in February, which suggests reared specimens. Others may be knowledge that never became a record: *Ctenucha virginica* is scored for Idaho, and its only records are from BC.

## Decision

1. **The records add to the hand scores, and never remove one.** `build-key.ts` ORs the derived answers into the matrix. A species scores 1 on a state, an ecoregion or a month if `data/key-scores.csv` says so or any of its records does. This keeps the repository's rule that derived data never overwrites curator-entered values, and the 434 unsupported cells stay. The maintainer chose this over letting the records replace the hand scores. C-040 records the curator as preferring that the key trust the records. The two agree for every species without hand scores, which includes every species added from now on and all the Geometridae: their answers come from the records alone, sparse or not. They differ only on those 434 cells, and the curator can still decide to remove them.
2. **Which records count.** The ones the site serves (`createAllRecordsTable`), so the key agrees with the species page's map. Months skip reared and immature records by the same keyword rule as the flight chart ([#59](https://github.com/pnwinsects/pnwmoths/issues/59)); the rule now lives in `src/_lib/reared-records.ts` so the two cannot drift apart. A record with no month still counts for its state and ecoregion.
3. **States.** A record's `state` column picks the answer. Every Montana record counts as "Western Montana": the key's only Montana answer already lists the Northwestern Great Plains and Glaciated Plains among its ecoregions, so it was never limited to the west. Alberta and California records add a month and nothing else.
4. **Ecoregions.** Each record is placed by its coordinates in `data/boundaries/pnw-ecoregions.geojson`. It looks only at its own country's ecoregions, and its state's question decides which answers are open to it; a Washington record that falls in the Snake River Plain adds no ecoregion. A point outside every polygon, most often on a shoreline the simplified boundary cuts across, takes the nearest ecoregion within the 2 km tolerance the district assignment already uses. 48 of the 91,947 records in the five regions are left without one.
5. **The boundaries.** EPA Level III ecoregions for the US, and the BC ecoprovinces for BC. They supply all 47 of the key's answers. Two need mapping beyond spelling: "Central Cascades" is Level III "Cascades", and "Olympic Highlands" is Level IV 77i "High Olympics", which EPA files under North Cascades and the build cuts out of it. The low Olympics stay in Coast Range. Sources, licences and the full name mapping are in [`docs/reference/ecoregions.md`](../reference/ecoregions.md). `scripts/build-ecoregions.ts` downloads and simplifies them; it is maintainer-run, like `build-boundaries.ts`, and the file is committed.
6. **The assignment runs in the build.** Placing every record takes under a second with DuckDB's spatial extension, which CI already installs for the tests. A separate maintainer step that wrote an ecoregion onto each record would be one more thing to forget when records are added.
7. **The template leaves the 64 columns out.** `key:merge` accepts a file with or without them, so a template downloaded before this change still merges. A maintainer can still add a hand score by editing `data/key-scores.csv`.
8. **Identify says where these answers come from.** The Distribution and Seasonality sections carry the curator's notice and a link to the PNW Moths project on iNaturalist, replacing the "(Key data, 2015)" label, which is no longer true.

## Consequences

- `data/key-matrix.json` now changes when the records do. The staleness test in `scripts/build-key.test.ts` fails on a records change committed without it, so the records runbooks now commit `data/key-matrix.json` too.
- `npm run build:key`, and so the tests and the build, now need DuckDB's spatial extension. CI pre-installs it; on a laptop DuckDB downloads it on first use.
- No species in the key is entirely unscored any more. The species that used to be, such as *Xestia normanianus*, now have Distribution answers from their records and drop out of results for places they have not been recorded.
- The hand Distribution and Seasonality columns in `data/key-scores.csv` are no longer the whole answer. Reading the file alone understates what the key says; the published key scores at `/curation/` are the same file, so they understate it in the same way.
- The 41 + 157 + 236 hand-scored cells without records stay until someone decides otherwise. Removing them is an edit to `data/key-scores.csv`.

## Alternatives rejected

- **Records replace the hand scores.** The key would always agree with the map and the flight chart, but legacy curator-entered values would be overridden by derived data, which the repository's additive-only rule forbids without the curator's explicit say-so.
- **Write an `ecoregion` column onto each record**, as `district_id` is written. That makes the assignment reviewable cell by cell, at the cost of a maintainer step after every records change. The build is fast enough not to need it.
- **Clip "Western Montana" at a meridian or the Continental Divide.** The key's own Montana ecoregions say it already reaches the plains.
