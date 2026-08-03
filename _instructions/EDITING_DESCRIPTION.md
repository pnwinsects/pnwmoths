# Task: Edit a Species Description

## What This Changes
- `src/content/species/{slug}.md` — create or edit prose description
- Build output: updated species page at `_site/species/{slug}/`

## File Format

Location: `src/content/species/{slug}.md`

The file is **Markdown only — no YAML frontmatter**. The filename is the slug; nothing
inside the file repeats it. All 1,264 accounts on the site are written this way.

```markdown
## Identification

##### Adults

The American Dagger Moth (*Acronicta americana*) is a common species found throughout...
```

The slug convention is `(genus + '-' + species).toLowerCase()`, so
`src/content/species/acronicta-americana.md` is the account for *Acronicta americana*.

## The first paragraph is public twice

The opening paragraph doubles as the species page's **link preview** — the sentence people
see when the page is shared to BlueSky, Slack, or a group chat (and the snippet search
engines show). It is trimmed to about 200 characters at a sentence break.

So write the first paragraph as a standalone one-or-two-sentence summary of the moth,
the way the existing accounts do:

> *Abagrotis apposita* is a mottled brick-red, medium-sized moth (FW length 14–17 mm)
> that flies in forests in late summer.

Headings, bullet lists, and block quotes are skipped, so the paragraph can sit under an
`## Identification` heading as usual — with or without a blank line after the heading.
Species with no `.md` file on file get an automatic "*Genus species* — a moth of the
family …" sentence instead; nothing breaks.

## Steps

1. Look up the species slug. Open `data/species.csv`, find the row, compute slug as `{genus}-{species}` lowercased (e.g., genus=Acronicta, species=americana -> acronicta-americana).

2. Create or edit `src/content/species/{slug}.md`. Markdown body only — no frontmatter.

3. Verify the build:
   ```bash
   npm run build
   ```
   Expected: build completes. The species page at `_site/species/{slug}/index.html` contains the description text.

4. If build passes, commit and push:
   ```bash
   git switch -c edit-description
   git add src/content/species/{slug}.md
   git commit -m "Update description: [species name]"
   git push -u origin HEAD
   gh pr create --fill
   ```

   The `main` branch is protected: it takes changes only through a pull request whose
   build check passes. `gh pr create` opens one; merge it from the PR page (or with
   `gh pr merge`) once the check is green, and the site deploys automatically.

## Verify
- Expected: `_site/species/{slug}/index.html` contains the description text after build.
- Failure: If description does not appear, check that the `slug` in frontmatter matches the filename exactly.

## Docker Alternative
```bash
docker compose run --rm dev npm run build
```
