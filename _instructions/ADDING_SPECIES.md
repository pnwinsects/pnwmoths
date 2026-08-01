# Task: Add a New Species

## What This Changes
- `data/species.csv` — new row for the species
- `src/_data/speciesSlugs.json` — the slug list that keeps old-site links working
- `src/content/species/{slug}.md` — (optional) prose description
- Build output: new species page at `_site/species/{slug}/`

## Schema: data/species.csv

| Field | Type | Required | Example |
|-------|------|----------|---------|
| id | integer | yes | 701 (next unused ID) |
| genus | string | yes | Acronicta |
| species | string | yes | americana |
| common_name | string | yes | American Dagger Moth |
| noc_id | integer | yes | 9200 |
| authority | string | yes | Harris 1841 |
| family | string | yes | Noctuidae |
| similar_species | string (slug) | no | acronicta-oblinita (pipe-separated for multiple: slug1\|slug2) |
| subfamily | string | no | Acronictinae — genus-level; copy from another species of the same genus |
| epithet_quoted | `1` or blank | no | `1` marks epithets the reference site shows in quotes (e.g. Clostera `"apicalis"`); display only |
| tribe | string | no | Blank where the subfamily has no tribal subdivision ([ADR 0016](../docs/adr/0016-tribe-hierarchy-level.md)) |

> **Note:** `noc_id` is the Hodges/MONA checklist number, stored as a string (VARCHAR). Most values are plain integers (e.g., `9200`). Species added after the original Hodges checklist were assigned MONA supplement numbers in the format `93-XXXX` (e.g., `93-0016`) — these are valid and should be entered as-is.

**Slug convention:** `(genus + '-' + species).toLowerCase()` — alphanumeric and hyphens only.

## Adding photos and records for the same species

Photos and records reference the species by its **slug**, not by `id`. The `id` column is
`species.csv`'s own primary key and appears in no other file.

Once the species row is saved, follow [ADDING_PHOTO.md](ADDING_PHOTO.md) and
[ADDING_RECORDS.md](ADDING_RECORDS.md) using `species_slug`. The build validates referential
integrity, so the species row must exist in `data/species.csv` first.

## Steps

1. Open `data/species.csv`. Find the highest `id` value. Add a new row with `id` = highest + 1 —
   all 11 columns, trailing blanks included:
   ```csv
   3162,Xestia,dolosa,Greater Black-letter Dart,10942,Franclemont 1980,Noctuidae,xestia-smithii,Noctuinae,,Noctuini
   ```

2. (Optional) Create a prose description file at `src/content/species/{slug}.md`:
   ```markdown
   ---
   slug: xestia-dolosa
   ---
   Description text here.
   ```
   The `slug` in frontmatter MUST match the slug convention above.

3. Open `src/_data/speciesSlugs.json` and add the new slug in alphabetical order:
   ```json
     "xestia-dolosa",
   ```
   This is the lookup table that `/redirect.html` uses to send visitors from old
   pnwmoths.biol.wwu.edu `/browse/…` addresses to the new species page. Skip it and the
   species page still works, but old links to it dump visitors on Browse and the address
   shows up under **Unmapped Legacy Links** on the analytics page. `npm test` fails if this
   file and `data/species.csv` disagree.

4. Verify the build:
   ```bash
   npm run build:site
   ```
   Expected: build completes without errors. A new page exists at `_site/species/xestia-dolosa/index.html`.

   No page is emitted if the family is withheld (`data/withheld-families.csv` — Geometridae today),
   if the family cell is blank, or if the slug is listed in `data/unpublished-species.csv`. That is
   the gate working, not a failure.

5. If build passes, commit and push:
   ```bash
   git add data/species.csv src/_data/speciesSlugs.json
   # If you created a description file in step 2, also add it:
   # git add src/content/species/xestia-dolosa.md
   git commit -m "Add species: Xestia dolosa"
   git push
   ```

## Verify
- Expected: `_site/species/{slug}/index.html` exists after build.
- Expected: the new species appears on the browse page at `_site/browse/index.html`.
- Failure: `data/species.csv is missing required column: "…"` — a column was dropped from the header.
- Failure: `Invalid common_name "…" — remove the legacy backslash before the apostrophe` — write a
  plain `'`.
- Failure: `npm test` reports `speciesSlugs.json` disagreeing with `species.csv` — step 3 was skipped.

## Docker Alternative
```bash
docker compose run --rm dev npm run build:site
```
