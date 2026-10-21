# Ecoregion boundaries

`data/boundaries/pnw-ecoregions.geojson` holds the ecoregions the identification key asks about ("In which ecoregion in Idaho?" and so on). The key build places every record in one of them to derive the key's ecoregion answers ([ADR 0055](../adr/0055-key-distribution-and-seasonality-from-records.md), [#397](https://github.com/pnwinsects/pnwmoths/issues/397)). Nothing in the browser reads the file.

[`scripts/build-ecoregions.ts`](../../scripts/build-ecoregions.ts) downloads the sources, combines them and writes the file; [`_instructions/REFRESHING_BOUNDARIES.md`](../../_instructions/REFRESHING_BOUNDARIES.md#ecoregions) says when and how to run it.

## Sources

| Region | Dataset | Publisher | Licence |
| --- | --- | --- | --- |
| WA, OR, ID, MT | [Level III ecoregions of the conterminous United States](https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states) (`us_eco_l3.zip`) | US EPA | US government work, public domain |
| The High Olympics | Level IV ecoregions of Washington (`wa_eco_l4.zip`), unit 77i only | US EPA | US government work, public domain |
| BC | [Ecoprovinces – Ecoregion Ecosystem Classification of British Columbia](https://catalogue.data.gov.bc.ca/dataset/ecoprovinces-ecoregion-ecosystem-classification-of-british-columbia) (`WHSE_TERRESTRIAL_ECOLOGY.ERC_ECOPROVINCES_SP`) | Province of British Columbia | [Open Government Licence – British Columbia](https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc) |

Each feature carries `name` (as the source spells it), `country` (`US` or `CA`) and `source` (the dataset and its code, e.g. `EPA Level III 15`, `BC ecoprovince GED`). The US layer is clipped to a box around the four states, and every boundary is simplified to within 500 m. Compared with placing the records in the full-resolution files, 12 of about 13,500 species-and-ecoregion pairs differ, most of them shoreline points that only the 2 km fallback places at all.

## How the key's answers map to the sources

The key's answers came from the 2015 Lucid key. Most are the source's name, ignoring case. These differ:

| Key answer | Source name | Why |
| --- | --- | --- |
| Central Cascades | Cascades (EPA Level III 4) | The key also has North Cascades, so it calls Level III 4 "Central". |
| Olympic Highlands | High Olympics (EPA Level IV 77i) | EPA files the High Olympics under North Cascades (77). The key asks about them separately, so the build cuts 77i out of 77. The Low Olympics (1c) stay in Coast Range. |
| Northwest Glaciated Plains | Northwestern Glaciated Plains (EPA 42) | Spelling. |
| Northwest Great Plains | Northwestern Great Plains (EPA 43) | Spelling. |
| Klamath Mts/California High North Coast Range | Klamath Mountains/California High North Coast Range (EPA 78) | Abbreviation. |

The mapping lives in `KEY_ECOREGION_BY_BOUNDARY_NAME` in [`scripts/lib/key-derived-scores.ts`](../../scripts/lib/key-derived-scores.ts). The build script refuses to write a file that leaves any of the key's 47 answers without a polygon, and a test checks the committed file the same way.

Each state's question offers only some ecoregions. A record counts only toward an answer its own state's question offers, so a Washington record that falls in the Snake River Plain adds Washington but no ecoregion. Montana's question is headed "Western Montana", but it lists the Northwestern Great Plains and Glaciated Plains, so every Montana record counts.
