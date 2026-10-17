# Renaming a Species

For a species that stays the same moth but gets a new scientific name: an epithet ending that
follows the grammar of the genus (`californicum` → `californica`), a move to another genus, or a
spelling correction. Not for merging two species into one, and not for removing a species. Those
are [CURATING_SPECIES_SYNONYMS.md](CURATING_SPECIES_SYNONYMS.md) and
[REMOVING_SPECIES.md](REMOVING_SPECIES.md).

**Photographs do not move.** A species' photographs and tiles stay in the CDN folder they were
first published in, even when the species' address changes. You do not copy anything to the CDN,
and you do not need the Bunny password. The decision and its reasons are in
[ADR 0054](../docs/adr/0054-cdn-folder-is-frozen-and-rename-is-one-command.md).

You need Node 24 (see `.nvmrc`) and a checkout with `npm install` done.

## 1. Decide, and write it down

A rename changes the page address, so the curator should have agreed to it. If this is a
curator's ruling, add an entry to [docs/curation-log.md](../docs/curation-log.md) in the same
pull request ([ADR 0032](../docs/adr/0032-curation-log.md)).

## 2. See what would change

```bash
DRY_RUN=1 npm run species:rename -- malacosoma-californicum "Malacosoma californica"
```

The first name is the species' current slug. The second is the new name in quotes, genus first. If
only the genus or only the epithet changes you may give the new slug instead
(`malacosoma-californica`). The command asks for the quoted name when it cannot tell where the
genus ends.

It prints how many rows it would change in each file, and which file it would move. Nothing is
written.

## 3. Do it

```bash
npm run species:rename -- malacosoma-californicum "Malacosoma californica" --reason "MPG spelling (#369)"
```

The reason is saved in `data/species-redirects.csv` beside the redirect from the old address.

It changes the slug in every data file that holds one, moves the species' account to the new file
name under `src/content/species/`, adds the redirect and a synonym row for the old name, and
regenerates the checklist order and the Identify data. It stops before writing anything if the old
slug would still appear somewhere afterwards, and it tells you where.

It is safe to run twice. The second run says the new species already exists and does nothing.

## 4. What it leaves for you

- **The authority, common name and `noc_id`** in `data/species.csv`. If the new name has a different
  authority (for example *Macaria notata* became *M. ulsterata*, Pearsall 1913), edit that row.
- **The account text.** The prose in `src/content/species/<new-slug>.md` still uses the old name.
  That is the author's text; change it only if the author agrees.
- **The synonym row.** `data/species-synonyms.csv` now maps the old name to the new species, so a
  photograph or key row filed under the old name still finds it. Delete that row if the old name
  was a different animal and not a synonym.

## 5. Check and commit

```bash
npm test
npm run build:site
```

`build:site` regenerates the hidden-images and CDN inventory reports. Commit those with the rest.
In the built site, the old address should show a "redirecting" page and the new address the
account, with the same photographs.

## What the CDN looks like afterwards

The photographs keep their old folder name. In `data/images.csv` the `cdn_folder` cell of each of
the species' rows now holds the old slug, and in `data/species-photos-manifest.csv` so do the rows
whose tiles are uploaded. The CDN audit ([AUDITING_THE_CDN.md](AUDITING_THE_CDN.md)) accounts for
objects by folder and filename, so it will not report those folders as leftovers.

Leave `cdn_folder` blank when you add a photograph of a species that has never been renamed.
