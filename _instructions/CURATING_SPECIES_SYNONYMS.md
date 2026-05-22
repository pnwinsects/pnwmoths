# Task: Curate Species Synonyms

## What This Changes

- `data/species-synonyms.csv` — new rows you author; one per `from_binomial → to_species_slug` decision
- `data/species-photos-manifest.csv` — rows whose `binomial_raw` matches one of your decisions get re-routed to `match_bucket: resolved-via-synonym` with `binomial_resolved` and `species_slug` populated from `data/species.csv`
- **No** Dropbox API calls, **no** bunny.net writes, **no** file downloads, **no** Dropbox token required — synonym curation is an in-repo edit + re-classify loop

## Before You Start

You will need:
- **Node 24** — matches `.nvmrc`. Verify with `node --version`
- A spreadsheet program (Excel, LibreOffice Calc, or Google Sheets with the CSV imported) to read `data/species-photos-manifest.csv` and optionally `data/species.csv`
- A text editor for `data/species-synonyms.csv` — direct CSV editing is fine; the file is two columns, header on line 1

You do NOT need a Dropbox token for this task. Phase 27 curation is offline.

## Steps

### 1. Open the manifest in a spreadsheet

Open `data/species-photos-manifest.csv` in your spreadsheet of choice. LibreOffice Calc handles flat CSVs cleanly; Excel works too; in Google Sheets use File → Import → Append/Replace.

Phase 26's `sortForInvestigation` already moved the `genus-only`, `likely-synonym`, `provisional`, and `unparseable` rows to the top, ordered by binomial frequency. Work top-down — the most-impactful single decision is at the very top.

### 2. Identify a `from_binomial` to re-route

The top of the manifest shows the highest-frequency unmatched binomials in the v2.2 corpus. The top 12 at the time of the Phase 27 curation pass are:

```
smerinthus ophthalmica   (32 files)
grammia nevadensis       (10)
sericosema wilsonensis   (8)
pheosia rimosa           (8)
pero occidentalis        (8)
macaria signaria         (8)
iridopsis emasculatum    (8)
hydriomena irata         (8)
dysstroma hersiliata     (8)
drepanulatrix hulstii    (8)
drepanulatrix bifilata   (8)
digrammia muscariata     (8)
```

Clearing the top 12 alone moves the clean-or-resolved match rate from 77.3% to roughly 80%. The long tail of 30–80 unique binomials provides the remaining bar-clearing toward the ≥95% target (L-04). Note that 22 rows have an empty `binomial_raw` — those are unreachable through synonyms.csv (no key to match on) and should be left alone.

### 3. Look up the target species

Open `data/species.csv` in a spreadsheet and find a row where `genus` + `species` match the current name. The `to_species_slug` you need is `lower(genus + '-' + species)`.

For example: a row with `genus = Apantesis` and `species = nevadensis` gives the slug `apantesis-nevadensis`.

The slug is always lowercase and uses hyphens to join, never underscores, never CamelCase.

### 4. Add a row to `data/species-synonyms.csv`

Open the file in a **text editor** (not a spreadsheet — spreadsheets sometimes rewrite quoting on save and can corrupt a simple flat CSV). The schema is exactly two columns:

```
from_binomial,to_species_slug
```

Append your row at the bottom. Both values are lowercase. `from_binomial` matches `binomial_raw` from the manifest exactly (lowercased, space-separated). `to_species_slug` matches the slug column in `data/species.csv` (lowercased, hyphen-joined).

Example row (illustrative only — not pre-filled in the seed file; every row is a deliberate curator decision):

```
grammia nevadensis,apantesis-nevadensis
```

Make sure each row ends with a newline. Save.

### 5. Re-classify the manifest

Run:

```bash
npm run photos:investigate
```

This re-runs the script in re-sort-only mode: no Dropbox calls. It re-loads `data/species-synonyms.csv`, walks every manifest row, promotes any row whose `binomial_raw` matches one of your `from_binomial` entries to `match_bucket: resolved-via-synonym`, updates `binomial_resolved` and `species_slug`, leaves `status` and every other column untouched, and re-sorts the file in place.

The final log line reports the count of rows promoted:

```
[ingest-photos] re-sorted manifest; N rows; M promoted to resolved-via-synonym
```

### 6. Confirm the promotion

Re-open `data/species-photos-manifest.csv` in your spreadsheet. The rows you re-routed should no longer be at the very top of the file — they have moved into the trailing partition with the `clean-match` rows.

Filter or sort by `match_bucket` and confirm:
- The rows for the binomials you added have `match_bucket = resolved-via-synonym`
- Their `binomial_resolved` and `species_slug` columns are populated (not empty)
- Their `status` is still `discovered`

The first row of the file is now the next-highest-frequency unresolved binomial. Work it next.

### 7. Commit synonyms.csv AND the manifest in the same PR

The git history is the audit trail (D-01). Do NOT split the curator decision and its effect across two commits. Stage both files together:

```bash
git add data/species-synonyms.csv data/species-photos-manifest.csv
git commit -m "data(27): resolve <N> binomials to species slugs"
```

The PR description should briefly note which binomials were added and why — the citation or reference for the synonymy. The diff is the audit trail; the PR review is the human checkpoint.

## Verify

In a spreadsheet view of `data/species-photos-manifest.csv`:

- The rows you re-routed have `match_bucket = resolved-via-synonym`
- `binomial_resolved` and `species_slug` columns are populated (not empty)
- `status` remains `discovered` (Phase 28 uses `status`, not `match_bucket`, to gate downloads)

On the command line:

- The tail of the `npm run photos:investigate` output shows the promoted count and the new per-bucket distribution
- Over multiple passes, the clean-or-resolved match rate (clean-match + resolved-via-synonym divided by total rows) climbs toward the ≥95% target, up from the 77.3% baseline (L-04)

## When Things Go Wrong

**A `synonym-warn target-not-in-species-csv <from> → <to>` line appeared in the log.** Your `to_species_slug` is not present in `data/species.csv`. Open `data/species.csv`, search for the genus you intended, and copy the slug exactly as it appears in the data (lowercase, hyphen-joined). The row in `data/species-synonyms.csv` was dropped and the corresponding manifest rows were NOT promoted. Correct the typo and re-run `npm run photos:investigate`.

**A manifest row you expected to promote did not move.** The `from_binomial` does not exactly match the manifest's `binomial_raw`. Check for: extra trailing whitespace, mixed case (must be all lowercase), use of hyphens instead of spaces (use spaces), or a misspelling. Look at the actual `binomial_raw` value in the spreadsheet and copy it character-for-character into your synonyms.csv row.
