# Task: Edit a Species Description

## What This Changes
- `content/species/{slug}.md` — create or edit prose description
- Build output: updated species page at `_site/species/{slug}/`

## File Format

Location: `content/species/{slug}.md`

```markdown
---
slug: acronicta-americana
---
The American Dagger Moth (Acronicta americana) is a common species found throughout...
```

The `slug` in frontmatter MUST match the filename (without `.md`).
The slug convention is `(genus + '-' + species).toLowerCase()`.

## Steps

1. Look up the species slug. Open `data/species.csv`, find the row, compute slug as `{genus}-{species}` lowercased (e.g., genus=Acronicta, species=americana -> acronicta-americana).

2. Create or edit `content/species/{slug}.md`. The file must have:
   - YAML frontmatter with `slug` field matching the filename
   - Markdown body below the frontmatter

3. Verify the build:
   ```bash
   npm run build
   ```
   Expected: build completes. The species page at `_site/species/{slug}/index.html` contains the description text.

4. If build passes, commit and push:
   ```bash
   git add content/species/{slug}.md
   git commit -m "Update description: [species name]"
   git push
   ```

## Verify
- Expected: `_site/species/{slug}/index.html` contains the description text after build.
- Failure: If description does not appear, check that the `slug` in frontmatter matches the filename exactly.

## Docker Alternative
```bash
docker compose run --rm dev npm run build
```
