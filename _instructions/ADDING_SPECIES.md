# Task: Add a New Species

## What This Changes
- `data/species.csv` — new row for the species
- `content/species/{slug}.md` — (optional) prose description
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

**Slug convention:** `(genus + '-' + species).toLowerCase()` — alphanumeric and hyphens only.

## Steps

1. Open `data/species.csv`. Find the highest `id` value. Add a new row with `id` = highest + 1:
   ```csv
   701,Xestia,dolosa,Greater Black-letter Dart,10942,Franclemont 1980,Noctuidae,xestia-smithii
   ```

2. (Optional) Create a prose description file at `content/species/{slug}.md`:
   ```markdown
   ---
   slug: xestia-dolosa
   ---
   Description text here.
   ```
   The `slug` in frontmatter MUST match the slug convention above.

3. Verify the build:
   ```bash
   npm run build
   ```
   Expected: build completes without errors. A new page exists at `_site/species/xestia-dolosa/index.html`.

4. If build passes, commit and push:
   ```bash
   git add data/species.csv
   # If you created a description file in step 2, also add it:
   # git add content/species/xestia-dolosa.md
   git commit -m "Add species: Xestia dolosa"
   git push
   ```

## Verify
- Expected: `_site/species/{slug}/index.html` exists after build.
- Expected: The new species appears on the browse page at `_site/browse/index.html`.
- Failure: If build fails with "invalid slug" or "duplicate id", check the CSV row format.

## Docker Alternative
```bash
docker compose run --rm dev npm run build
```
