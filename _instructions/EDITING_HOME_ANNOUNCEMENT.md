# Task: Post or Update the Homepage Announcement

## What This Changes
- `src/content/home-announcement.md` — create, edit, or delete this file
- Build output: the homepage (`_site/index.html`) shows or hides the announcement box accordingly

## What It's For

A single editable region on the homepage for news, announcements, or short messages
to visitors — e.g. "New copyright status for images" or "The Siskiyou Crest Moth
Project recently launched." This replicates the legacy site's `#home-announcement`
block. It is **not** a dated feed or blog; it's one region you keep current by
editing its content directly, the same way you'd update any prose page.

## File Format

Location: `src/content/home-announcement.md`

Plain Markdown, **no YAML frontmatter** (same convention as species prose files —
see `EDITING_DESCRIPTION.md`). Write one or more short paragraphs. Use bold text or
links as needed:

```markdown
**Exciting news:** the [Siskiyou Crest Moth Project](https://siskiyoucrestcoalition.org/siskiyou-crest-moth-project/)
recently launched. We are looking forward to learning what they find!

**To generate a checklist** of species from a state/province or district, use the
filters at the top of the [species list](/browse/).
```

## Steps

1. **To post or update the announcement:** create or edit
   `src/content/home-announcement.md` with the current message(s).
2. **To remove the announcement:** delete `src/content/home-announcement.md`.
   The homepage renders normally with no announcement box — nothing else needs
   to change.
3. Verify the build:
   ```bash
   npm run build
   ```
   Expected: build completes; `_site/index.html` contains a `home-announcement`
   region with your text (or omits it entirely if the file doesn't exist).
4. If the build passes, commit and push:
   ```bash
   git switch -c edit-announcement-$(date +%Y%m%d-%H%M)
   git add src/content/home-announcement.md
   git commit -m "Update homepage announcement"
   git push -u origin HEAD
   gh pr create --fill
   ```

   The `main` branch is protected: it takes changes only through a pull request whose
   build check passes. `gh pr create` opens one; merge it from the PR page (or with
   `gh pr merge`) once the check is green, and the site deploys automatically. The
   date suffix just keeps each branch name unique, so the same command works every
   time. `gh` is the GitHub CLI — see [CONTRIBUTING.md](../CONTRIBUTING.md) for
   installing and signing into it.

## Notes

- There is no date stamping or automatic expiration — remove or replace the text
  yourself when it's no longer current, same as the legacy site's maintainer workflow.
- The region degrades gracefully with JavaScript disabled; it's plain static HTML.
- Keep it short. This is a visible callout near the top of the homepage, not a
  news archive.

## Docker Alternative
```bash
docker compose run --rm dev npm run build
```
