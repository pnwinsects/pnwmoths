# Pitfalls: LFS Removal + bunny.net CDN Migration

**Domain:** Eleventy/Vite/GitHub Actions static site — removing Git LFS and migrating images to bunny.net Storage + CDN
**Researched:** 2026-04-21
**Confidence:** HIGH (grounded in existing codebase, verified against official docs and known issues)

---

## Critical Pitfalls

### Pitfall 1: `git lfs migrate export` rewrites history but GitHub keeps LFS objects forever

**What goes wrong:**
`git lfs migrate export --everything --include="images/**,plates/**"` rewrites every commit, replacing LFS pointer files with real blobs. After the force-push, collaborators must re-clone — their existing clones reference old SHAs that no longer exist on `origin`. If anyone pushes from a stale clone they will re-introduce LFS pointers for files that are gone.

Additionally: even after removing all LFS pointer commits from history, GitHub does NOT automatically free the LFS storage quota. The LFS objects remain on GitHub's servers and continue counting toward billing until the repository is deleted and re-created. There is no per-object deletion API for regular accounts; GitHub Support can sometimes trigger early cleanup, but this is not guaranteed.

**Why it happens:**
GitHub's LFS storage is content-addressed object storage, not directly tied to git history. Rewriting history removes references to the objects but does not delete the objects from GitHub's LFS store.

**Consequences:**
- Collaborators with stale clones silently re-pollute history with LFS pointers on their next push
- Continued LFS storage billing on GitHub even though no new files are added
- CI that still references `nschloe/action-cached-lfs-checkout` will attempt LFS checkout of an empty LFS dataset, wasting time (not fatal, but wasteful)

**Prevention:**
1. Coordinate with all collaborators: announce the migration, require re-clones after the force-push
2. Pin the force-push to a maintenance window — use `--force-with-lease` not `--force`
3. Remove `nschloe/action-cached-lfs-checkout` from `deploy.yml` and `pr-check.yml` and replace with plain `actions/checkout` in the same PR as the migration
4. Remove `images/**` and `plates/**` patterns from `.gitattributes` in the same commit that rewrites history
5. Accept the storage billing situation — it resolves at the next billing cycle naturally if no new LFS pushes occur; or delete+recreate repo if storage cost is a real concern

**Phase:** LFS removal phase (the rewrite commit and CI workflow update must be a single coordinated step)

---

### Pitfall 2: `git lfs migrate export` inserts "do not track" entries in `.gitattributes` instead of removing existing entries

**What goes wrong:**
`git lfs migrate export` adds lines like `images/**/*.jpg !filter !diff !merge` to `.gitattributes` rather than removing the existing `images/**/*.jpg filter=lfs diff=lfs merge=lfs -text` rules. The repo ends up with both the original LFS tracking rules AND the override negation rules. Git treats the first matching pattern as authoritative, so the effective result is correct, but the `.gitattributes` is confusing and could mislead future contributors into thinking LFS is still active.

**Prevention:**
After running `git lfs migrate export`, manually edit `.gitattributes` to remove all `filter=lfs` lines. Commit this cleanup separately before force-pushing. Verify with `git check-attr filter -- images/test.jpg` that the filter attribute is unset.

**Phase:** LFS removal phase

---

### Pitfall 3: rclone `sync` deletes files in the bunny.net Storage bucket that exist in the bucket but not locally

**What goes wrong:**
`rclone sync local/ bunny:zone/` makes the destination match the source exactly — it deletes any file in the bucket that is not present locally. If the local `images/` directory is incomplete (e.g., a partial checkout, or a CI runner that only has a subset of species photos), `rclone sync` will silently delete the files that are absent locally from the production bucket.

This is particularly dangerous in CI workflows where the working directory is freshly cloned and may not have all image source files, or where images are stored in a separate Django app directory that CI does not mount.

**Why it happens:**
`rclone sync` semantics: destination is updated to match source, including deletion. The `--delete-after` default means files are deleted after the transfer completes, giving no warning before the damage is done.

**Consequences:** Production CDN bucket emptied or partially cleared; images 404 on live site.

**Prevention:**
- Use `rclone copy` (not `rclone sync`) for image upload workflows. `rclone copy` only adds/updates, never deletes.
- If sync is genuinely needed (e.g., to remove deleted species images), always run `rclone sync --dry-run` first and review the delete list before committing.
- In `_instructions/` documentation, always show `rclone copy` as the safe default command; explicitly warn that `rclone sync` is destructive.
- Add `--max-delete=0` or `--immutable` as a safety net if sync is used in automated CI.

**Phase:** Upload workflow phase (rclone setup and `_instructions/` documentation)

---

### Pitfall 4: rclone modification-time diffing silently skips re-uploaded files when using bunny.net's FTP backend

**What goes wrong:**
Bunny.net's FTP interface does not support setting modification times via the protocol. Rclone uses modification time as the primary change-detection mechanism when checksums are unavailable. Because bunny.net cannot report or accept accurate modification times, rclone may skip uploading a corrected image that replaces a same-named file — it sees the file exists in the destination and the mtime comparison is unreliable, so it skips the transfer.

The symptom: you replace a corrupt or outdated image locally, run `rclone copy`, rclone reports "no files to transfer," and the old file remains on the CDN.

**Prevention:**
- Always use `rclone copy --ignore-times` (or `--checksum` if bunny.net provides ETags) when re-uploading corrected files, rather than relying on rclone's default mtime comparison.
- After replacing a file, also purge the CDN cache for that URL (see Pitfall 6 on cache invalidation).
- Document this explicitly in `_instructions/` for contributors.

**Phase:** Upload workflow phase

---

### Pitfall 5: Confusing the Storage API endpoint with the CDN Pull Zone hostname

**What goes wrong:**
bunny.net has two distinct services with different hostnames:

- **Storage Zone API** (`storage.bunnycdn.com` or regional endpoints): Used for upload/management with an API key. Files are **not** publicly accessible via this endpoint without authentication.
- **Pull Zone** (`{zonename}.b-cdn.net` or a custom CNAME): The public CDN delivery endpoint. Files are accessible via simple HTTPS GET.

Setting `CDN_BASE_URL=https://storage.bunnycdn.com/zonename/` in Eleventy templates will generate image URLs that require API key authentication — browsers get a 401/403 for every image. The correct value is the Pull Zone hostname.

**Why it happens:**
Both endpoints reference the same underlying storage. The dashboard shows both, and the distinction is not obvious until you see 401 responses in the browser.

**Prevention:**
- Set `CDN_BASE_URL` to the Pull Zone URL (`https://{zonename}.b-cdn.net/`) not the Storage API URL.
- Verify by opening a CDN image URL in an incognito browser before wiring it into Eleventy.
- Document the two endpoints explicitly in `_instructions/`.

**Phase:** bunny.net configuration phase (before any template changes)

---

### Pitfall 6: Stale CDN cache serves old image after re-uploading with same filename

**What goes wrong:**
When an image is uploaded to bunny.net Storage and requested via the CDN Pull Zone, it is cached at edge nodes globally. If the image is subsequently replaced (same filename, different content — e.g., a corrected photo or updated crop), the CDN continues serving the old cached version until the cache TTL expires or the cache is explicitly purged. The default CDN cache TTL can be days or weeks.

For Bunny Optimizer, purging the original also purges all transformed variants (different `?width=` parameters). But the purge must be triggered manually or via the API.

**Prevention:**
- For images that may be updated, use content-addressed filenames (include a hash or upload date in the filename, e.g., `acronicta-americana-001-v2.jpg`) rather than overwriting the same filename.
- When overwriting is unavoidable, trigger a CDN cache purge via the bunny.net dashboard or Purge API after re-uploading.
- Add a note to `_instructions/` explaining this behavior.

**Phase:** Upload workflow phase + bunny.net configuration phase

---

### Pitfall 7: Bunny Optimizer is NOT enabled by default on a new Pull Zone

**What goes wrong:**
Creating a Pull Zone and linking it to a Storage Zone does not automatically enable the Bunny Optimizer. Image resizing via URL query parameters (`?width=400`) only works when the Optimizer is explicitly turned on under the Pull Zone's "Optimizer" settings. Without it, query parameters are ignored or passed through to the origin — images are served at full original resolution regardless of `?width=` parameter.

If Eleventy templates are changed to append `?width=188` for thumbnails before Optimizer is enabled in the dashboard, the site silently loads full-resolution originals for every thumbnail — correct appearance but catastrophically slow page loads.

**Prevention:**
- Enable Bunny Optimizer on the Pull Zone as the first configuration step, before deploying any Eleventy templates that use size parameters.
- Verify with a browser network tab: request an image with `?width=100`, confirm the response is smaller than the original and the `Content-Type` is appropriate.
- In `_instructions/`, include a setup checklist that lists Optimizer enablement as step 1 of bunny.net configuration.

**Phase:** bunny.net configuration phase (prerequisite to build-time resize script removal)

---

### Pitfall 8: CDN URL construction produces double-slash or missing slash in Nunjucks templates

**What goes wrong:**
The current templates use hardcoded paths like `/images/{{ sp.slug }}/{{ img.filename }}`. After migration, these become CDN URLs. If `CDN_BASE_URL` is set to `https://pnwmoths.b-cdn.net/` (with trailing slash) and the template constructs `{{ CDN_BASE_URL }}images/{{ sp.slug }}/{{ img.filename }}`, the result is correct. But if `CDN_BASE_URL` lacks the trailing slash (`https://pnwmoths.b-cdn.net`), the result is `https://pnwmoths.b-cdn.netimages/...` — a broken URL that silently produces no image.

The existing codebase also has a Vite base-prefix interaction to watch: the Key Decisions section documents that raw `/images/...` paths (without `| url` filter) are used specifically to avoid Vite double-prefixing. CDN URLs are absolute (`https://...`) so they bypass Vite's base transformation entirely — but a Nunjucks filter applying `| url` to an absolute CDN URL would corrupt it. Verify no templates apply `| url` to CDN-derived paths.

**Why it happens:**
Slash handling in URL concatenation is error-prone. Eleventy's `| url` filter is designed for relative paths and will break absolute CDN URLs. The glossary template already uses `| url` on image paths (`src="{{ ('/images/glossary/' + term.image_filename) | url }}"`) — this must be changed to CDN URL construction without `| url`.

**Prevention:**
- Normalize `CDN_BASE_URL` in `eleventy.config.js` to always end with `/`, regardless of what the env var contains: `const cdnBase = (process.env.CDN_BASE_URL || '').replace(/\/?$/, '/');`
- Expose as a global data value or shortcode so all templates use the same normalized string.
- Audit every `| url` filter applied to image paths — remove it from any path that is being converted to a CDN URL.
- After migrating each template, test locally with `CDN_BASE_URL` set to a known value and inspect the HTML source to verify correct URL construction.

**Phase:** Eleventy template migration phase

---

### Pitfall 9: Missing `CDN_BASE_URL` in local dev causes all species images to 404 silently

**What goes wrong:**
After removing `scripts/copy-images.js`'s species photo copy step (which currently copies LFS images into `_site/images/`), local development requires `CDN_BASE_URL` to be set in `.env` or the shell. If a contributor runs `npm start` without `CDN_BASE_URL`, all `<img src="...">` tags for species photos produce 404s — the page renders but images are blank.

This is worse than it sounds: the `pnwm-taxon-browser` component constructs image URLs using `this._prefix` + `"images/"` from the `path-prefix` attribute. If `CDN_BASE_URL` is undefined, the Nunjucks template may emit an undefined/empty base, resulting in relative paths that 404 against the local dev server.

**Prevention:**
- Add a build-time check in `eleventy.config.js`: if `CDN_BASE_URL` is unset, emit a clear warning (not a fatal error — contributors may be building without images intentionally).
- Provide a `.env.example` file with `CDN_BASE_URL=https://pnwmoths.b-cdn.net/` and document it in `_instructions/`.
- Consider a development fallback: if `CDN_BASE_URL` is unset in dev mode, fall back to `/images/` (local path) and keep a minimal set of sample images in `src/images/` for development. This preserves the existing dev workflow for new contributors.

**Phase:** Eleventy template migration phase + contributor documentation phase

---

### Pitfall 10: `pnwm-taxon-browser` constructs image URLs via `_prefix + "images/"` — breaks after CDN migration unless component is updated

**What goes wrong:**
`pnwm-taxon-browser.js` constructs image URLs as:
```js
src="${this._prefix}images/${img.species_slug}/${img.filename}"
```
where `this._prefix` is the `path-prefix` HTML attribute (e.g., `/pnwmoths/` on GitHub Pages). After migration, images are at `https://pnwmoths.b-cdn.net/images/...` — an absolute CDN URL that is not derivable from the Eleventy path prefix.

If only the Nunjucks templates are updated to CDN URLs but the Lit component's URL construction is not, the browse page will still display broken images even after migration — a bug that only manifests on the browse page, not on species pages.

**Prevention:**
- Add a `cdn-base` attribute to `pnwm-taxon-browser` to receive the CDN base URL from the template (e.g., `cdn-base="{{ CDN_BASE_URL }}"`), replacing the `path-prefix + "images/"` pattern.
- The `path-prefix` attribute should remain for page navigation links (`/species/{slug}/`) — only the image URL construction needs to change.
- Test the browse page specifically in a production build (not dev server) to catch this.

**Phase:** Eleventy template migration phase (must update Lit component alongside template changes)

---

### Pitfall 11: `lychee` link validator excludes image URLs — CDN image 404s are invisible to CI

**What goes wrong:**
`lychee.toml` currently excludes image file extensions from link checking:
```
exclude = ["\\.(?:jpg|jpeg|png|gif|webp|svg|ico)$"]
```
After migration, CDN image URLs appear in HTML. If a CDN URL is malformed (wrong hostname, missing path segment), lychee will not detect it. The only way a broken CDN image URL would be caught in CI is by an explicit image-fetch validation step.

**Prevention:**
- Either update `lychee.toml` to check CDN image URLs (remove the image extension exclusion, or add a targeted CDN-URL check), or add a separate validation step that fetches a sample of CDN image URLs and asserts HTTP 200 responses.
- At minimum, document that lychee does not validate image URLs and that CDN URL correctness must be verified manually during migration.

**Phase:** CI/validation phase (alongside workflow updates)

---

### Pitfall 12: GitHub Actions still runs LFS checkout after migration — slow and confusing, not fatal

**What goes wrong:**
`deploy.yml` and `pr-check.yml` both use `nschloe/action-cached-lfs-checkout`. After LFS is removed from the repo, this action will still attempt to download LFS objects (finding none), wasting time and leaving confusing log output. Over time, contributors will not understand why the LFS action is present for a non-LFS repo.

**Prevention:**
Replace `nschloe/action-cached-lfs-checkout` with plain `actions/checkout` in both workflow files in the same PR as the LFS migration. This is low-risk since LFS files will no longer exist in the repo.

**Phase:** CI/workflow update phase (same as LFS removal)

---

## Moderate Pitfalls

### Pitfall 13: Bunny Optimizer WebP conversion breaks image filename assumptions in templates

**What goes wrong:**
Bunny Optimizer may rewrite response `Content-Type` to `image/webp` and serve WebP content, but the `src` URL still ends in `.jpg`. This is generally correct browser behavior, but if any JavaScript code (e.g., in `pnwm-image-slideshow.js`) inspects the image filename extension to determine format or alt-text behavior, it will see `.jpg` even when WebP is being delivered.

**Prevention:** Don't use filename extensions for format detection. This is already best practice in the codebase.

**Phase:** bunny.net configuration phase (test Optimizer output)

---

### Pitfall 14: `rclone` uses bunny.net FTP backend — path must include storage zone name

**What goes wrong:**
When configuring rclone to use bunny.net's FTP interface, the remote path must include the storage zone name as the root directory (e.g., `bunny:pnwmoths/images/`). If the zone name is omitted, rclone either errors out or lists an empty bucket at an unexpected path level.

**Prevention:**
In `_instructions/`, provide the exact rclone config and command with the zone name explicitly shown. Test with `rclone ls bunny:pnwmoths/` first before running any copy/sync.

**Phase:** Upload workflow phase

---

## Phase-to-Pitfall Mapping

| Phase | Pitfalls to Address | Verification |
|-------|---------------------|-------------|
| bunny.net account + zone setup | #5 (Storage vs Pull Zone), #7 (Optimizer not default), #14 (FTP path includes zone name) | Manually request a CDN image URL in incognito; verify Optimizer resizes with `?width=100` |
| LFS removal (history rewrite + force-push) | #1 (GitHub keeps LFS objects), #2 (.gitattributes cleanup), #12 (CI still runs LFS checkout) | `git check-attr filter -- images/test.jpg` returns unset; `actions/checkout` in both workflows |
| rclone upload workflow + `_instructions/` | #3 (sync deletes bucket), #4 (mtime diffing skips re-uploads), #6 (CDN cache after reupload) | `rclone copy --dry-run` shows additions only; sample re-upload test |
| Eleventy template migration | #5 (CDN URL vs Storage URL), #8 (slash construction), #9 (missing CDN_BASE_URL in dev), #10 (Lit component uses path-prefix for images), #11 (lychee misses image 404s) | Full production build; inspect HTML source; browse page images load; `.env.example` committed |
| Build-time resize script removal | #7 (Optimizer must be live before removal) | Full build succeeds; no resize script references remain; page-weight validator passes |
| CI/CD finalization | #12 (LFS action), #11 (lychee validation) | `deploy.yml` uses `actions/checkout`; CDN image sample validation step added |

---

## Integration Gotchas Specific to This Stack

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-----------------|
| Nunjucks `{{ CDN_BASE_URL }}images/...` | Missing trailing slash on `CDN_BASE_URL` breaks URL construction | Normalize in `eleventy.config.js`: `.replace(/\/?$/, '/')` |
| Nunjucks `| url` filter on CDN URL | `| url` prepends `pathPrefix` to absolute URL, corrupting it | Never apply `| url` to absolute CDN URLs; audit all templates |
| `pnwm-taxon-browser` `_prefix + "images/"` | Relative path construction incompatible with absolute CDN base | Add `cdn-base` attribute to component; use it for image URLs only |
| `rclone copy` vs `rclone sync` | `sync` deletes production files absent from local source | Always use `rclone copy` for image uploads |
| rclone mtime comparison on bunny.net FTP | Skips re-uploads of same-named replacement files | Use `--ignore-times` flag when replacing existing files |
| bunny.net Optimizer query params | `?width=400` silently ignored if Optimizer not enabled on Pull Zone | Enable Optimizer first, verify before template changes |
| GitHub LFS storage post-migration | Storage continues billing even after history rewrite | Accept cost or delete/recreate repo; document the situation |
| lychee image URL exclusion | CDN image 404s invisible to CI link checker | Add explicit CDN image spot-check to CI or remove image exclusion |

---

## Sources

- `/Users/rainhead/dev/pnwmoths/eleventy.config.js` — Vite base/pathPrefix interaction; copy-images.js pattern
- `/Users/rainhead/dev/pnwmoths/scripts/copy-images.js` — species photo copy from LFS images/ dir
- `/Users/rainhead/dev/pnwmoths/src/components/pnwm-taxon-browser.js` — `_prefix + "images/"` URL construction
- `/Users/rainhead/dev/pnwmoths/src/_includes/base.njk`, `src/species/species.njk`, `src/glossary/index.njk` — image URL patterns in templates
- `/Users/rainhead/dev/pnwmoths/.gitattributes` — LFS filter patterns for images/ and plates/
- `/Users/rainhead/dev/pnwmoths/.github/workflows/deploy.yml` — `nschloe/action-cached-lfs-checkout` usage
- `/Users/rainhead/dev/pnwmoths/lychee.toml` — image extension exclusion from link checking
- [git-lfs-migrate man page](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-migrate.adoc) — export mode inserts negation entries, does not remove existing rules
- [GitHub Docs: Removing files from Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/removing-files-from-git-large-file-storage) — storage quota not freed until repo deletion
- [GitHub LFS Billing Docs](https://docs.github.com/billing/managing-billing-for-git-large-file-storage/about-billing-for-git-large-file-storage) — objects persist post-migration
- [rclone sync docs](https://rclone.org/commands/rclone_sync/) — deletes destination files absent from source; --dry-run required
- [rclone bunny.net FTP issue #7607](https://github.com/rclone/rclone/issues/7607) — mtime not settable via bunny FTP API
- [bunny.net Dynamic Images docs](https://docs.bunny.net/optimizer/dynamic-images/overview) — Optimizer must be explicitly enabled; query param syntax
- [bunny.net CDN cache purge](https://support.bunny.net/hc/en-us/articles/115003700071-How-to-purge-all-files-from-a-Pull-Zone) — purging original clears all Optimizer variants
- PROJECT.md Key Decisions — Vite double-prefix problem; raw `/images/...` paths required

---
*Pitfalls research for: v1.4 Image CDN — LFS removal and bunny.net migration*
*Researched: 2026-04-21*
