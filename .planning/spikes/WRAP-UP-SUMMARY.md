# Spike Wrap-Up Summary

**Date:** 2026-05-21
**Spikes processed:** 1
**Feature areas:** Dropbox ingest & filename parsing
**Skill output:** `./.claude/skills/spike-findings-pnwmoths/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 001 | dropbox-photo-audit | standard | ✓ VALIDATED | Dropbox ingest & filename parsing |

## Key Findings

- **Dropbox API path is proven.** `POST /2/files/list_folder` with `shared_link.url` set to the `scl/fo` rlkey URL works without OAuth — just a Dropbox app token with `files.metadata.read` scope. Non-recursive only (an API constraint), which fits because the folder is flat.
- **Filename convention is the existing project convention.** `Genus species-{specimen}-{view}.{ext}` matches what `data/images.csv` already encodes. The v2.2 filename parser is a port + small tweaks, not a from-scratch build.
- **Parser tweaks needed for the real build:** drop the ≥3-char species-epithet rule (misses `Trichoplusia ni`, `Rachiplusia ou`), allow hyphenated species epithets (`Xestia c-nigrum`, `Autographa v-alba`), don't assume specimen IDs are single letters (institutional accessions like `OSAC_…`, `WWUC*` are common).
- **Coverage is excellent.** 93.2% of the 1,348 current species have ≥1 high-res photo. 5,000 TIFFs, 204.6 GB, 100% uniform `.tif` source format — the tile pipeline only needs to handle one input format.
- **Curation workload is bounded.** The 22% unmatched files collapse to an estimated 30–80 unique binomials needing decisions. Most cluster on a few genus-reassignment cases (`Grammia → Apantesis` alone is 58 files). A small `data/species-synonyms.csv` will reclassify most of them in one curation pass; match rate likely lifts from 77.5% to 95%+.
- **Unparseables are real curation signals, not noise.** `n sp`, `nr harrisonata`, `Plataea sp` patterns surface undescribed and provisional species — they should route to a `provisional` bucket, not be coerced into clean matches.
- **A `*custom/` sub-folder exists in the share root** — needs a separate inspection pass before bulk ingest (non-recursive listing skipped it).
- **Storage estimate to validate before phase A:** ~1 TB of tile output on bunny.net (5,000 files × ~5x DZI expansion, mean source 41 MB).

The skill `spike-findings-pnwmoths` will auto-surface these findings in future build conversations for the v2.2 milestone.
