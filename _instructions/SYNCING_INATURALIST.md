# Task: Import Records from the iNaturalist Project

Bring research-grade observations from the [PNWMoths iNaturalist
project](https://www.inaturalist.org/projects/pnwmoths) into the site as occurrence records.

Run this whenever you have curated the project — added observations, or had identifications
change — and want the site to catch up. It is safe to run any time, and safe to run twice.

The summary compares against the **last committed** state, not what is sitting in your working
copy, so it keeps reporting the same changes every time you run it until you commit them in
step 4. That is deliberate — it means you can re-run and re-read the summary as often as you
like without it going quiet on you.

## What This Changes
- `data/records-inat.csv` — rewritten in full every run. **Machine-owned: never edit it by hand.**
  Anything you type here is erased on the next run.
- `data/inat-sync-report.csv` — rewritten in full every run. One row per observation that did
  *not* become a record, and why.
- Nothing else. This never touches `data/records.csv`, which stays yours.

## The Rules It Follows

- Only **research grade** observations in the project are imported.
- An observation that leaves the project, drops below research grade, or is re-identified as
  something with no page on this site is **removed** from the site on the next run.
- An observation already entered by hand in `data/records.csv` is **not** imported, so nothing
  is ever duplicated. See "Handing a record over" below.
- Locations are checked against the same county and regional-district boundaries the rest of
  the site uses. An observation that cannot be placed in one of WA, OR, ID, MT, BC or AB is
  left out and listed in the report rather than guessed at.
- Observations whose location iNaturalist has obscured never get a county: the published
  location can be up to 27 km from the true one, which is wider than many counties, so claiming
  one would be a guess. The accuracy is noted on the record. They keep their **state** only when
  it is unambiguous — either every district the true location could be in agrees, or
  iNaturalist's own place name says so outright. Near a state line, where neither holds, the
  record is left out and listed in the report.

## Steps

1. Fetch and review, without changing anything:
   ```bash
   npm run inat:sync -- --dry-run
   ```
   This prints what *would* change, grouped into added, updated and removed, with a reason for
   each removal. Read it. This is the review — it is where you confirm the changes match the
   curation you did in the project.

2. When the summary looks right, run it for real:
   ```bash
   npm run inat:sync
   ```

3. Rebuild the site and check it:
   ```bash
   npm run build:site
   ```
   Expected: the build completes. New points appear on the relevant species pages, filterable
   under the "iNaturalist" collection.

4. If the build passes, commit and push:
   ```bash
   git switch -c inat-sync-$(date +%Y%m%d-%H%M)
   git add data/records-inat.csv data/inat-sync-report.csv
   git commit -m "Sync records from the iNaturalist project"
   git push -u origin HEAD
   gh pr create --fill
   ```

   The `main` branch is protected: it takes changes only through a pull request whose
   build check passes. `gh pr create` opens one; merge it from the PR page (or with
   `gh pr merge`) once the check is green, and the site deploys automatically. The
   date suffix just keeps each branch name unique, so the same command works every
   time. `gh` is the GitHub CLI — see [CONTRIBUTING.md](../CONTRIBUTING.md) for
   installing and signing into it.

## Handing a Record Over

You entered about 145 iNaturalist observations into `data/records.csv` by hand over the years.
When one of those observations is also in the project, the sync stands off and lists it under
"Already in records.csv by hand". Those records work fine as they are — but they are frozen,
where a synced record follows iNaturalist automatically as identifications change.

To hand one over:

```bash
npm run inat:sync             # writes the report listing what can be handed over
npm run inat:migrate          # deletes those rows from data/records.csv
npm run inat:sync             # imports the same observations, now sync-owned
```

The sync must have run within the last hour, or migrate refuses: the report only describes the
project as it was when the sync ran, and acting on a stale one can delete a record that will not
come back. Rows that cite an observation but are not themselves plain iNaturalist photographs —
a museum specimen documented by an observation, say — are never handed over, and migrate says so
rather than skipping them quietly.

`npm run inat:migrate -- --dry-run` shows what it would delete first. The record does not
disappear from the site — it changes hands. Check with `git diff data/records.csv`; the diff
will be nothing but deleted lines.

Only observations the sync has actually seen in the project are ever handed over, so a
hand-entered record whose observation is not in the project (or is not research grade) is left
alone permanently. That is deliberate: those are yours and the sync cannot replace them.

## Reading a Failure

**`REFUSING TO WRITE: ... would be removed`** — the run wanted to delete an implausible share of
the imported records. Almost always iNaturalist being unreachable or the project having changed
unexpectedly, not that many records genuinely going away. Check the project in a browser first.
If the removals really are what you want, re-run with `npm run inat:sync -- --force`.

**`iNaturalist returned HTTP ...`** — the API was unreachable. Nothing was written; re-run later.
The sync never writes a partial result, because a half-finished fetch looks exactly like a
project that suddenly shrank.

**An observation you expected is missing** — look it up in `data/inat-sync-report.csv`. The
`outcome` column says why. The ones you can act on:

| Outcome | What it means | What to do |
|---------|---------------|------------|
| `unresolved-taxon` | Identified as something with no page on this site | Add the species (see [ADDING_SPECIES.md](ADDING_SPECIES.md)), then re-run |
| `not-research-grade` | In the project, but the community has not confirmed it | Nothing here — it imports itself once it reaches research grade |
| `rank-above-species` | Identified only to genus or above | As above |
| `already-curated` | You entered it by hand already | Optional: hand it over, above |
| `no-district` | Could not be placed in any known county or district | Check the coordinates on iNaturalist |
| `out-of-bounds` | Outside the Pacific Northwest | Usually means it should not be in the project |
| `obscured` | Location hidden by the observer | Only appears if the obscured-record policy is set to skip |

## Schema: data/records-inat.csv

Written by the sync. Listed here so you can read the file, **not so you can edit it** — the next
run overwrites whatever is there. The first fifteen columns are exactly `data/records.csv`'s, in
the same order, so the two line up when read side by side.

| Field | Type | Notes |
|-------|------|-------|
| species_slug | string | Resolved from the iNaturalist identification |
| record_type | string | Always `photograph` |
| latitude | decimal | From the observation |
| longitude | decimal | From the observation |
| state | string | Derived from the coordinates |
| county | string | Derived from the coordinates; blank when the location is imprecise |
| locality | string | The observer's place description |
| elevation_ft | integer | Always blank — iNaturalist does not supply it |
| year | integer | From the observation date |
| month | integer | From the observation date |
| day | integer | From the observation date |
| collector | string | The observer's name, or their login |
| collection | string | Always `iNaturalist` |
| notes | string | The observation URL, and the accuracy where the location is obscured |
| district_id | string | Derived from the coordinates; blank when the location is imprecise |
| inat_id | integer | The observation number — how a record is matched run to run |

## Schema: data/inat-sync-report.csv

| Field | Type | Notes |
|-------|------|-------|
| inat_id | integer | The observation number |
| url | string | Link to the observation |
| outcome | string | Why it was not imported — see the table above |
| detail | string | The specifics (the taxon name, the coordinates, and so on) |

## Verify
- Expected: `npm run inat:sync` exits 0 and reports what it wrote.
- Expected: `npm run build:site` completes.
- Expected: re-running `npm run inat:sync` reports the same changes again until you commit
  them — see the note at the top. After the commit is merged, it reports no changes.

## Notes

The project's own geographic rule is set to **North America**, so the sync filters to the
Pacific Northwest itself. Nothing needs changing on iNaturalist for that.

Who may add observations to the project is controlled on iNaturalist, not here.
