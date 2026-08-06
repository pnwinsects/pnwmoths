# Removing a Species From the Site

For a name that should not be in the catalog at all — a hybrid, a misidentification, a name
that was never valid. **This deletes data permanently.** Git history is the only copy afterwards.

Two other situations look similar and are not this:

- **The name is provisional or undescribed** (`sp`, `n sp`, `aff`, `nr`) and may yet be
  described — add its slug to `data/unpublished-species.csv` instead. The page disappears; the
  records, photos and key data survive.
- **The name was renamed, or lumped into another species** — see
  [CURATING_SPECIES_SYNONYMS.md](CURATING_SPECIES_SYNONYMS.md) and add a row to
  `data/species-redirects.csv` so visitors land on the surviving species.

Removal is for the case where nothing survives to point at. The reasoning is in
[ADR 0029](../docs/adr/0029-removing-a-species.md).

## Before you start

**Does the species have a live page right now?** Ask the live site, not the repo — a species
can be hidden from every build and still be published, because deploys never delete:

```bash
curl -sI https://moths.pnwinsects.org/species/<slug>/ | head -1
```

- **404** — good, nothing is published. Skip to step 1.
- **200** — the page loads. Read the warning at the bottom of this file *first*. Deleting the
  rows will not take it down.

Do not answer this question by looking at `_site/`, or by reasoning that the species is already
hidden. That is exactly the mistake made in #268: the species had been deny-listed for a month,
emitted no page, and was still live at its old build — along with 32 others (#273).

The slug is the genus and species, lowercased and joined with a hyphen: *Hemileuca nuteglan* →
`hemileuca-nuteglan`.

## 1. Delete every row that names the slug

Search for the slug across `data/`, case-insensitively, and delete every line it appears on:

```bash
grep -ril "<slug>" data/
```

Expect hits in some of these:

| File | What to delete |
|---|---|
| `data/species.csv` | the one species row |
| `data/unpublished-species.csv` | its deny-list row, if it has one |
| `data/records.csv` | every occurrence record |
| `data/records-inat.csv` | any imported observation (see the note below) |
| `data/records-bad.csv`, `data/records-bad-coords.csv` | records held back for curation |
| `data/images.csv` | photo rows |
| `data/species-links.csv`, `data/species-plates.csv`, `data/species-synonyms.csv` | external links, plate assignments, synonyms |
| `data/mpg-crosswalk.csv` | its hand-authored MPG match, if it has one |
| `data/species-photos.json` | its high-res tile entry, if it has one |
| `data/coord-fill-report.csv`, `data/legacy-rejoin-report.csv` | one row per record examined by a past backfill — prune to match |
| `src/_data/speciesSlugs.json` | the legacy-URL lookup entry |

Two more hold references that `grep -ril "<slug>" data/` finds but that you must **not** fix by
deleting a line:

| File | What to do instead |
|---|---|
| `data/checklist-order.csv` | **Regenerate**, don't hand-edit: `node scripts/build-checklist-order.ts` ([ADR 0030](../docs/adr/0030-checklist-order-from-mpg.md)) |
| `data/species.csv` — *other* species' `similar_species` | Remove the retired slug from the `\|`-separated list in each row that names it. Leaving it there renders no "similar species" entry at all — silently, with no error |

And if the species was in the Identify key, `data/key-matrix.json` needs `npm run build:key` and a
commit; it is a committed artifact derived from `data/species.csv`.

Also delete `src/content/species/<slug>.md` if a description was written
([EDITING_DESCRIPTION.md](EDITING_DESCRIPTION.md)), and `data/parquet/<slug>/` if it exists
(it is rebuilt anyway, and is not in git).

`data/species.csv` and `data/unpublished-species.csv` must be edited **together**: the build
requires every deny-list entry to match exactly one species row, and fails loudly if one is left
behind.

Leave `data/records-derived-district.csv` alone for now — step 2 rewrites it.

> **If the species had iNaturalist records:** deleting them from `data/records-inat.csv` is not
> enough. That file is rewritten from scratch on every sync, so they come straight back. Remove
> the observations from the [iNaturalist project](https://www.inaturalist.org/projects/pnwmoths)
> — or correct their identification there — and see
> [SYNCING_INATURALIST.md](SYNCING_INATURALIST.md).

## 2. Rebuild the derived district audit

`data/records-derived-district.csv` has one row per record in `data/records.csv`, joined by
position — so deleting records mid-file puts every later row out of step and the build stops.
Regenerate it:

```bash
node scripts/derive-district-audit.ts
```

Deterministic and safe to re-run; takes a few seconds to a couple of minutes. The `coverage:`
line it prints should match the new record count.

## 3. Build and check

```bash
npm test
npm run build:site
```

If a photo, link or key entry was missed, the build says so. Three messages point back at step 1:

- **`[check-referential-integrity] FAILED: … "<slug>" has no data/species.csv row`** — the first
  gate to run, and the one that catches almost everything: a leftover row in `images.csv`,
  `species-links.csv`, `species-plates.csv`, `checklist-order.csv`, `species-synonyms.csv`,
  `mpg-crosswalk.csv`, `species-photos.json`, `speciesSlugs.json`, another species'
  `similar_species` list, or an orphaned `src/content/species/<slug>.md`. It names the file and the
  line, and prints what that file is for
  ([ADR 0033](../docs/adr/0033-referential-integrity-gate.md)).
- **`Validation failed — orphaned records (species_slug not in species table)`** — records were
  left behind after the species row was deleted.
- **`check-unpublished … 0 matches in species.csv`** — the deny-list row was left behind.

Then confirm the name is gone from the built site:

```bash
grep -ril "<slug>" _site/ | wc -l    # expect 0
```

## 4. Commit

```bash
git switch -c remove-<slug>
git add -A
git commit -m "Remove <Genus species> from the catalog"
git push -u origin HEAD
gh pr create --fill
```

`main` is protected: changes land through a pull request whose build check passes. Merge from
the PR page once it is green, and the site deploys automatically.

## The one thing the deploy will not do

**Deploys never delete anything from the CDN.** Files are uploaded and overwritten, never
removed ([ADR 0008](../docs/adr/0008-deploy-bunny-additive.md)) — the storage zone is shared
with the photo library, where a syncing delete could destroy originals.

So if the species had a published page, `/species/<slug>/` **stays live and reachable** after
this change merges, frozen at its last build. It drops out of Browse, Search and the checklist,
and nothing on the site links to it, but a bookmark or a search-engine result still finds it.

Taking it down means deleting the built page from the Bunny storage zone by hand. Ask whoever
holds the Bunny credentials, and be precise about what comes out:

- **Delete** `species/<slug>/` — the generated HTML, and nothing else. It is rebuilt from the
  data on every deploy, so there is no original to lose.
- **Leave the photo originals alone.** They live in the same zone under their own paths, and
  they are the only copy. The site does not delete images even when they are superseded; it
  records the retired path in `data/cdn-retired-images.csv` and stops referencing it. Do the
  same here, and never point a syncing delete at the zone.

Then confirm the page is actually gone:

```bash
curl -sI https://moths.pnwinsects.org/species/<slug>/ | head -1   # expect 404
```

Bunny caches, so allow a few minutes before concluding the delete did not work.

## Record the decision

A removal is a curator's ruling, not a maintenance chore. Add an entry to the
[curation log](../docs/curation-log.md) **in this same change** — the required fields and the
numbering rule are in ["How to add an entry"](../docs/curation-log.md#how-to-add-an-entry), which is
the one place they live. Do not restate them from memory.

Do it now rather than later: the species row is gone after this task, and with it every in-tree
trace of why — the failure this log exists to prevent
([ADR 0032](../docs/adr/0032-curation-log.md)).

If the call was made by **email**, quote it into the GitHub issue first and cite the issue. Email is
not a source the next maintainer can open.

## Docker alternative

```bash
docker compose run --rm dev npm run build:site
```
