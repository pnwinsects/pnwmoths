---
layout: base.njk
title: "About the Data -- PNW Moths"
permalink: /about/data/index.html
---

# About the Data

Pacific Northwest Moths presents approximately 30,000 occurrence records for
nearly 900 moth species documented in Washington, Oregon, Idaho, Montana, and
British Columbia. This page explains where the data come from, how they are
processed, and what limitations to keep in mind.

## Data sources

Records originate from three categories of sources:

1. **Institutional collections** — curated databases from natural history
   museums, university insect collections, and government agencies (see
   [Site Credits](/about/credits/) for a full list of contributing
   institutions).
2. **Private collections** — specimen data generously shared by individual
   lepidopterists across the region.
3. **Literature and observations** — published records and vetted field
   observations.

Each record is classified by type: *specimen*, *literature*, or *observation*.

## How records are collected and georeferenced

Record data were compiled over more than a decade by site editors and volunteer
databasers working from specimen labels, collection databases, and published
literature. Georeferencing (assigning latitude/longitude to locality
descriptions) was performed by the databasing team using standard protocols and
reference gazetteers.

Every record includes, where available: species identification, geographic
coordinates, state/province, county, locality name, elevation, date of
collection, collector name, and source collection code.

## Data cleaning and validation

Before records appear on the site, they pass through an automated build pipeline
that enforces several quality checks:

- **Coordinate bounds** — Records must fall within the Pacific Northwest region
  (approximately 42–60° N latitude, 110–139° W longitude). Records with
  coordinates outside these bounds (often caused by swapped lat/lon values) are
  removed from the published dataset and set aside for manual review.
- **Required fields** — Each record must include a valid species slug, latitude,
  longitude, and state/province code. Records missing critical fields are
  flagged and excluded.
- **UTF-8 encoding** — All data files must be valid UTF-8. Files with encoding
  errors are rejected at build time.
- **Species validation** — Record species slugs are checked against the master
  species list. Orphaned records (referencing species not in the taxonomy) do
  not appear on the site.

Records that fail validation are stored separately (`records-bad.csv` and
`records-bad-coords.csv`) for ongoing curation by the editorial team.

## Known limitations

- **Geographic coverage is uneven.** Collection intensity varies by region;
  areas near research institutions and major collectors tend to be
  better-represented.
- **Temporal gaps.** Most records span the late 20th and early 21st centuries.
  Historical records from before 1950 are sparse.
- **Withheld families.** Some families (currently Geometridae) have their
  occurrence records withheld from the site while editorial review is in
  progress.
- **Coordinate precision varies.** Some localities are georeferenced to a
  specific trap site; others represent the center of a town or park. No formal
  uncertainty radius is published.
- **Taxonomy follows the site's editorial committee.** Species concepts and
  subfamily placements may differ from other references (e.g., iNaturalist or
  MPG). The site's Taxonomic Committee makes final determinations.

## How visualizations are derived

### Distribution maps

Each species fact sheet includes an interactive map showing all valid occurrence
records. Points are plotted directly from the georeferenced latitude/longitude
in the dataset — no spatial aggregation or smoothing is applied.

### Phenology (flight period) charts

Flight-period charts show the seasonal distribution of records by month. Each
bar represents the count of records collected in that calendar month across all
years combined. These charts illustrate when adults are most frequently
encountered but do not distinguish between broods or model voltinism.

## Data format

Occurrence records are stored as CSV during development and exported to
per-species [Apache Parquet](https://parquet.apache.org/) files at build time.
Parquet enables fast, columnar queries for the interactive map and chart
components without requiring a server-side database.

## Questions or corrections?

If you notice a data error or would like to contribute records, please visit the
[Contact](/contact/) page.
