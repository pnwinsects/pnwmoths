---
spike: 001
name: dropbox-photo-audit
report_date: 2026-05-21
verdict: VALIDATED
listed_at: 2026-05-21T06:32:12.516Z
---

# Spike 001 — Dropbox photo audit: REPORT

## TL;DR

**The audit validates the milestone.** Of 5,000 high-res TIFF files (204.6 GB) in the Dropbox shared folder, 77.5% parse cleanly into a binomial that matches a current species record, and 89.9% reach at least the genus level. **93.2% of the 1,348 current species** have at least one high-res photo available. The filename encoding is the **same convention as the existing Phase 13 JPG photos** (`Genus species-{specimen}-{view}.{ext}`), so the parser used for `data/images.csv` can be reused with minor extensions. The unmatched workload — ~484 files representing likely synonyms plus ~621 genus-only files — is bounded enough to handle with a synonym-map + manual investigation queue rather than rejecting the milestone shape.

**Verdict: VALIDATED — milestone v2.2 can proceed to `/gsd-new-milestone` scoping.**

## Headline numbers

| Metric | Value |
|---|---|
| Total entries listed | 5,001 (1 sub-folder `*custom`, 5,000 files) |
| File format | 100% `.tif` (uniform — no `.jpg`/`.png`/`.raw` mixed in) |
| Total bytes | 204.61 GB (≈ 41 MB/file mean) |
| Current species records | 1,348 |
| **Species with ≥1 high-res photo** | **1,257 (93.2%)** |
| Species with no high-res photo | 91 (6.8%) |

## Parseability buckets

| Bucket | Files | % | Meaning |
|---|---:|---:|---|
| **clean-match** | 3,875 | 77.5% | Filename's binomial matches a current species exactly. Ready to ingest. |
| **slug-match** | 0 | 0.0% | Path unused — every match went through the binomial-form path. |
| **genus-only** | 621 | 12.4% | Genus exists in current data but species epithet does not. Likely a synonym/sibling within a known genus. |
| **likely-synonym** | 484 | 9.7% | Neither genus nor species in current data. Deeper synonym resolution or scope-add candidate. |
| **unparseable** | 20 | 0.4% | Filename does not yield a clean binomial. Mostly real edge cases (see below). |
| **non-image** | 0 | 0.0% | All entries are images. |

**Reading:** 89.9% of files attach to a genus we already know about. The truly foreign 9.7% is small enough to triage by hand.

## Filename encoding

The convention is **the same as the existing Phase 13 photos in `data/images.csv`**, modulo file extension (`.tif` here, `.jpg` there):

```
Genus species-{specimen}-{view}.tif
```

- **Genus species** — binomial, Genus capitalized, species lowercase. A small share use `Genus-species` (hyphen between genus and species) — must be tolerated.
- **specimen** — either a single letter `A`/`B`/`C`/… or an institutional accession ID like `OSAC_0001081322`, `WWUC000000083`. The parser must not require a single letter.
- **view** — `D` (dorsal) or `V` (ventral).

**Examples from clean-match (verbatim):**
- `Abagrotis apposita-A-D.tif` → `abagrotis apposita`, specimen A, dorsal
- `Hyalophora euryalus-WWUC000000083-D.tif` → specimen tagged by museum accession
- `Paraseptis-adnixa-B-D.tif` → genus-species joined with a hyphen
- `Sympistis perscripta-A-V.tif` → ventral view

**Photos per matched species** (1,257 species; total 3,875 matched files):

| min | median | mean | max |
|----:|-------:|-----:|----:|
| 2 | 2 | 3.08 | 16 |

Median 2 is the expected D+V pair on a single specimen. Higher counts (up to 16 for `virbia ferruginosa`) reflect multiple specimens. The milestone should display all photos for a species and surface specimen/view metadata in the viewer.

## Synonym & investigation workload

The combined `genus-only` (621) + `likely-synonym` (484) = **1,105 files (22.1%)** need taxonomic resolution. Crucially, those 1,105 files do **not** represent 1,105 distinct binomials — they collapse to a small number of recurring names. Top examples:

**Top unmatched binomials (synonym candidates):**

| Binomial | Photos | Likely explanation |
|---|---:|---|
| smerinthus ophthalmica | 32 | Recognized binomial; possibly missing from current `species.csv` scope rather than a synonym |
| grammia nevadensis | 10 | Genus *Grammia* has been moved under *Apantesis* in recent revisions |
| sericosema wilsonensis | 9 | Genus reassignment candidate |
| dasyfidonia avuncularia | 8 | — |
| digrammia muscariata | 8 | Likely synonym for a *Macaria* sp. (Digrammia/Macaria split history) |
| drepanulatrix bifilata | 8 | — |
| drepanulatrix hulstii | 8 | — |
| dysstroma hersiliata | 8 | — |
| hydriomena irata | 8 | — |
| iridopsis emasculatum | 8 | — |
| macaria signaria | 8 | — |
| pero occidentalis | 8 | — |
| pheosia rimosa | 8 | — |

**Top unknown genera (entire genus missing from current data):**

| Genus | Photos | Notes |
|---|---:|---|
| grammia | 58 | Reassigned to *Apantesis* (taxonomy update — affects multiple species in current data: see `Apantesis arizoniensis` row 1 of `species.csv`) |
| eupithecia | 52 | Surprising — common genus; worth verifying whether current species data is missing these or excludes them by scope |
| sericosema | 17 | — |
| iridopsis | 14 | — |
| aspitates | 12 | — |
| neoterpes, pherne, sabulodes, glena, prochoerodes | 9–10 each | Each likely a small synonym cluster |

**Implication:** the unmatched 22% does not require 1,105 individual investigations. A few targeted decisions (e.g., a `Grammia → Apantesis` synonym mapping, a yes/no on adding *Smerinthus ophthalmica* to current species data) will reclassify large chunks of the file list at once. Rough estimate: **~30–80 unique binomials need a curation decision** before this drops to the truly-unknown residue.

## Unparseable cases (20 files)

These are *interesting*, not noise. Every entry below is a real data signal:

```
Autographa v-alba-A-D.tif              ← hyphenated species epithet "v-alba"
Eupithecia nr harrisonata-OSAC...-D    ← "nr" = "near" (provisional ID)
Lasionycta Carolynae-A-D.tif           ← second token is Capitalized (data entry quirk?)
Monostoecha n sp-A-D.tif (×2)          ← "n sp" = new (undescribed) species
Plataea sp-A-D.tif                     ← "sp" = unidentified species
Rachiplusia ou-A-D.tif                 ← real binomial, 2-char species "ou" — parser is too strict
Trichoplusia ni-A-D.tif                ← same — "ni" is the famous cabbage looper species
Xestia c-nigrum-A-D.tif (×2)           ← hyphenated species epithet "c-nigrum"
```

**Parser fixes worth folding into the milestone (cheap, well-bounded):**

1. **Drop the ≥3-char species epithet requirement** — `ni`, `ou` are valid. Min 2 chars.
2. **Allow hyphenated species epithets** — `v-alba`, `c-nigrum` are legitimate.
3. **Recognize provisional IDs** — `nr`, `sp`, `n sp` patterns. These should *parse* but route to a `provisional` bucket separate from `clean-match` — the curation team decides whether to publish them.
4. **`Lasionycta Carolynae` case** — log the capitalization quirk; do not auto-coerce; surface for curator review.

With fixes 1 and 2 applied, ~6 of the 20 unparseables move to clean-match or genus-only. The remaining 14 are intentional curation cases, not parser bugs.

## Data shape signals worth knowing now

- **100% TIFF source.** No HEIC/RAW/CR2 mixed in. Tile-generator pipeline (libvips) needs only TIFF input. Simpler than expected.
- **Institutional accession IDs (`OSAC_*`, `WWUC*`) appear in the specimen slot.** These should be **preserved in the manifest as `specimen_id`** — they enable cross-linking to physical specimen records (OSAC = Oregon State Arthropod Collection; WWUC = Western Washington University collection, presumably) and to the existing `images.csv` (which already has a `collector` field).
- **A `*custom` sub-folder exists** and was skipped by the non-recursive listing. Worth a quick look during ingest phase to know what's in there.
- **No password on the share** (the listing call succeeded without supplying one).
- **Mean file size 41 MB** ⇒ each image will produce a substantial tile pyramid. At ~5x expansion factor for DZI, expect ~1 TB of tile output total. Worth a sanity check on bunny.net storage pricing before commit.

## Implications for milestone v2.2 shape

**The locked decisions hold up.** Specifically:

| Decision (from `notes/high-res-species-photos-exploration.md`) | Supported by audit? |
|---|---|
| Local manifest is source of truth | ✓ Reinforced — manifest needs `specimen_id`, `view`, `binomial_raw`, `binomial_resolved`, `match_bucket` columns |
| Dropbox is a superset; investigate unmatched | ✓ 93.2% species coverage; 22% files need curation |
| Flat with encoded filenames | ✓ Confirmed; same convention as existing photos |
| OSD replaces Phase 23 lightbox | ✓ Average 3 photos/species fits the carousel-then-lightbox UX |

**Phase refinements for `/gsd-new-milestone`:**

- The **filename parser** is mostly a port of existing image-handling logic — much less risky than feared. Most of the parsing work is the *resolution* layer (synonym map, provisional bucket, curator workflow), not the *extraction* layer.
- Plan an **early curation pass** before bulk processing kicks off: feed the audit's "top unmatched binomials" + "top unknown genera" lists to the project lead, capture decisions as a synonym map (`data/species-synonyms.csv`?), then re-run classification. Match rate likely jumps from 77.5% to 95%+ after one curation pass.
- **Manifest schema fields** confirmed by audit:
  - `dropbox_path`, `content_hash` (already available in API response), `size`, `server_modified`
  - `filename_raw`, `binomial_raw`, `specimen_id`, `view` (D|V)
  - `binomial_resolved`, `species_slug`, `match_bucket` (clean | resolved-via-synonym | provisional | needs-curation)
  - `status` (discovered | downloaded | tiled | uploaded | failed | skipped-curation)
- **Storage estimate to validate:** ~1 TB of output tiles on bunny.net (5,000 files × ~5x DZI overhead). Worth a 60-second pricing check before phase A planning.

## What's deliberately NOT recommended

- **Don't fix the 20 unparseables programmatically before the audit team sees them.** They contain meaningful taxonomic information (provisional IDs, undescribed species) that a parser shouldn't paper over.
- **Don't try to auto-resolve synonyms by querying an external taxonomic API** (GBIF/ITIS/etc.) for this milestone. The unmatched binomials cluster on ~30–80 unique names — manual curation against a tiny synonym table is faster and more reliable than wiring up an external service. Consider an external API later if the residue stays large.
- **Don't process the `*custom` folder until it's understood.** It's not in the file count above.

## Evidence

- **`outputs/classifications.json`** (committed) — full bucket counts, percentages, top-N tables, and 10-sample-per-bucket exemplars. The source of every number in this report.
- **`outputs/filenames.json`** (gitignored, 1.3 MB) — full Dropbox listing with sizes, content hashes, server-modified timestamps. Kept locally for the next phase but not committed.

## Reproducibility

```bash
export DROPBOX_TOKEN='sl.…'   # files.metadata.read scope sufficient
node .planning/spikes/001-dropbox-photo-audit/list-dropbox.mjs
node .planning/spikes/001-dropbox-photo-audit/parse-classify.mjs
```

Both scripts use only Node built-ins; no npm install.
