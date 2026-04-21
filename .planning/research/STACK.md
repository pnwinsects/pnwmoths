# Stack Research: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Researched:** 2026-04-21 (updated for v1.4 Image CDN milestone)
**Mode:** Feasibility — specific tools and configuration for CDN migration

---

## v1.4 Milestone Stack: Image CDN Migration

The existing stack (Eleventy 3.1.x, Vite 8.x, DuckDB, hyparquet, Lit, Leaflet, Pagefind, Pico CSS)
is unchanged. This document covers only the four new capabilities needed for v1.4.

---

## Capability 1: bunny.net Storage Upload

### Recommended tool: rclone via FTP

**Why rclone over alternatives:**

| Tool | Status | Verdict |
|------|--------|---------|
| rclone (FTP backend) | Active, widely used | **Use this** |
| rclone (S3 backend) | Closed preview as of Q1 2026 — not yet GA | Skip — unavailable without invitation |
| simplesurance/bunny-cli | Archived Sept 2023, no releases | Skip — abandoned |
| own3d/bunny-cli | Undocumented, community project | Skip — unvetted |
| DKFN/bunnycdn-cli | Unofficial, small project | Skip — undocumented maintenance status |
| bunny.net HTTP API (curl) | Official, always available | Fallback for CI scripting if rclone proves awkward |

bunny.net S3 compatibility is in closed preview as of April 2026 ("Q2 preview" per their blog).
Do not depend on S3 for this milestone. FTP is the stable, documented, widely-used path.

**rclone version:** Use current stable (1.68.x at time of writing). Install via `brew install rclone`
(macOS) or the official install script for CI. No specific version pinning needed; rclone FTP is mature.

### rclone FTP configuration for bunny.net

```ini
[bunny]
type = ftp
host = ny.storage.bunnycdn.com
user = YOUR_STORAGE_ZONE_NAME
pass = RCLONE_OBSCURED_PASSWORD
port = 21
```

**Regional FTP endpoints** (choose the region where your Storage Zone was created):

| Region | FTP Host |
|--------|----------|
| Falkenstein (default) | `storage.bunnycdn.com` |
| New York | `ny.storage.bunnycdn.com` |
| Los Angeles | `la.storage.bunnycdn.com` |
| Singapore | `sg.storage.bunnycdn.com` |
| Sydney | `syd.storage.bunnycdn.com` |

**Authentication:**
- `user` = Storage Zone name (shown in bunny.net dashboard)
- `pass` = Storage Zone password (API key). Must be obscured: run `rclone obscure YOUR_PASSWORD`,
  paste the output into the config. Do NOT paste the raw password.

**Generate the config non-interactively:**

```bash
rclone config create bunny ftp \
  host=ny.storage.bunnycdn.com \
  user=YOUR_ZONE_NAME \
  pass=$(rclone obscure YOUR_PASSWORD) \
  port=21
```

**Known FTP quirk:** File modification times are not settable via bunny.net's FTP interface.
This affects rclone's `--checksum` and time-based sync; use `--size-only` as the transfer
comparison method when syncing.

### Upload commands

Initial bulk upload (16,000+ files from local `images/` directory):

```bash
# Upload entire images tree, skip files of same size
rclone sync images/ bunny:images/ --size-only --progress --transfers=16

# Dry run first
rclone sync images/ bunny:images/ --size-only --dry-run --progress
```

For CI (upload new/changed images from a Django media dir):

```bash
rclone sync /path/to/django/media/images/ bunny:images/ --size-only --transfers=8
```

**`--inplace` flag:** Add `--inplace` if you encounter partial-file errors on FTP. This writes
directly to the destination file rather than a temp name, avoiding FTP RNFR/RNTO rename issues
reported in the rclone community forum for bunny.net FTP.

**Confidence:** HIGH — FTP endpoint URLs confirmed from bunny.net official API docs;
rclone FTP config pattern confirmed from rclone community forum discussion.

---

## Capability 2: bunny.net Image Optimizer (CDN-native resizing)

### Architecture: Storage Zone + Pull Zone

bunny.net Image Optimizer requires two linked resources:

1. **Storage Zone** — where original images live. Files uploaded via rclone.
2. **Pull Zone** — CDN delivery layer, linked to the Storage Zone. Optimizer is enabled
   on the Pull Zone. Pull Zone gets a `*.b-cdn.net` hostname.

The Pull Zone URL becomes `CDN_BASE_URL`. Example:
```
https://pnwmoths.b-cdn.net/images/acronicta-americana/01.jpg
```

### Enabling Image Optimizer

In the bunny.net dashboard: select the Pull Zone → left menu → "Optimizer" → "Turn on Bunny Optimizer".
Also enable "Dynamic Image API" in the Optimizer settings. This is a separate toggle from basic optimization.

**Cost:** $9.50/month per Pull Zone. Bandwidth is charged separately on top. For a low-traffic
specimen photography site, bandwidth costs will be negligible (static site, images are the bulk).

### URL parameters for on-the-fly resizing

Append query parameters to any image URL served through the Pull Zone:

```
# Resize to 400px wide, maintain aspect ratio
https://pnwmoths.b-cdn.net/images/slug/01.jpg?width=400

# Resize to 300px tall, maintain aspect ratio
https://pnwmoths.b-cdn.net/images/slug/01.jpg?height=300

# Both width and height (may distort unless crop is used)
https://pnwmoths.b-cdn.net/images/slug/01.jpg?width=400&height=300

# WebP conversion + quality
https://pnwmoths.b-cdn.net/images/slug/01.jpg?width=400&format=webp&quality=85

# Crop with gravity
https://pnwmoths.b-cdn.net/images/slug/01.jpg?width=400&height=300&crop=true&crop_gravity=center
```

**Full parameter list** (confirmed from official docs):
- Sizing: `width`, `height`, `aspect_ratio`
- Format/quality: `quality` (1–100), `format` (jpeg, png, webp, gif)
- Cropping: `crop`, `crop_gravity`, `face_crop`
- Effects: `blur`, `sharpen`, `brightness`, `contrast`, `saturation`, `hue`, `sepia`, `gamma`
- Orientation: `flip`, `flop`, `rotate`

**Caching behavior:** The optimizer processes on first request, caches at the edge. All subsequent
requests for the same URL+parameters are served from cache. Different parameter combinations = different
cache entries; the original file is stored once.

**Confidence:** HIGH — parameter list confirmed from official bunny.net Dynamic Images documentation.
Pricing confirmed from bunny.net pricing page ($9.50/month/Pull Zone).

---

## Capability 3: Removing Git LFS from the Repository

### Why: git lfs migrate export (not git filter-repo)

`git lfs migrate export` is the correct tool for this task. It is LFS's own migration command,
understands pointer files natively, and handles `.gitattributes` cleanup. `git filter-repo` can
strip blobs but does not understand LFS pointer format and requires custom scripting. Use the built-in tool.

**Important GitHub note:** After LFS removal, the LFS objects remain on GitHub's remote storage
and still count toward the LFS storage quota. The only way to purge them from GitHub's servers is
to delete and recreate the repository (or contact GitHub support). Plan for this.

### Complete workflow

**Prerequisites:** Ensure all LFS objects are downloaded locally before rewriting history.

```bash
# Step 0: Create a full backup (non-negotiable before history rewrite)
git clone --mirror git@github.com:org/pnwmoths.git pnwmoths-backup.git
cd pnwmoths-backup.git && git lfs fetch --all
cd ..

# Step 1: In the working repo — fetch all LFS objects
git lfs fetch --all

# Step 2: Export — converts all LFS pointers to real file blobs in history
# --everything rewrites all local and remote refs
# --include="*" matches all LFS-tracked files
git lfs migrate export --everything --include="*"

# Step 3: Remove LFS hooks and filters from the local repo
git lfs uninstall --local

# Step 4: Remove .gitattributes LFS tracking rules
# Edit .gitattributes and delete all lines containing "filter=lfs"
# Then:
git add .gitattributes
git commit -m "remove Git LFS tracking"

# Step 5: Clean local git objects
git reflog expire --expire=now --all
git gc --aggressive --prune=now

# Step 6: Force-push all branches (coordinate with collaborators first)
git push --force-with-lease --all
git push --force-with-lease --tags
```

**Current repo state (observed):**
- `.gitattributes` tracks: `images/**/*.jpg`, `images/**/*.jpeg`, `images/**/*.png`, `plates/**/*.jpg`
- `git lfs ls-files` reports 16,191 LFS objects — all will be inlined into git history
- 16,191 files × average ~200KB/image ≈ several GB of history after conversion

**Post-LFS repo size consideration:** After `git lfs migrate export`, all image blobs become
regular git objects in history. This will make the repository very large. Options:

1. **Preferred:** After migrating, do a `git filter-repo --path images/ --invert-paths` pass to
   strip `images/` from history entirely (since images are moving to bunny.net anyway), then add a
   fresh commit that adds only the non-image files. This keeps the repo small.
2. **Simpler but large:** Just remove the `images/` passthrough copy from the build and don't
   commit the directory. History remains large but manageable.

If option 1 (strip from history), install `git-filter-repo`:

```bash
pip install git-filter-repo
# or: brew install git-filter-repo

# Remove images/ from all history
git filter-repo --path images/ --invert-paths
```

Run `git filter-repo` AFTER `git lfs migrate export` (so there are real blobs to strip,
not just pointer files), then garbage-collect again.

**Confidence for migrate export command:** HIGH — confirmed from official git-lfs man page
(`git-lfs-migrate.adoc` in git-lfs repo). Note that `--everything` rewrites only local refs;
remote refs need force-push separately.

**Confidence for GitHub LFS object purge limitation:** HIGH — confirmed from GitHub Docs
(docs.github.com/en/repositories/working-with-files/managing-large-files/removing-files-from-git-large-file-storage).

---

## Capability 4: Eleventy env var handling for CDN_BASE_URL

### Pattern: Global data file reads process.env

Eleventy 3.x does not have built-in `.env` file loading. The established pattern for this project
(already used for `GITHUB_PAGES`) is to read `process.env` directly in `eleventy.config.js`.

**Two places CDN_BASE_URL must be threaded:**

1. **Nunjucks templates** — `img src` attributes in `species.njk`, `glossary/index.njk`,
   `base.njk` (header image). These need `CDN_BASE_URL` at template render time.
2. **Client-side JS components** — `parquet-cache.js` already uses `import.meta.env.BASE_URL`
   for Vite's base prefix; image URLs in Lit components need a CDN prefix.

### Implementation A: Global data file (for templates)

Create `src/_data/env.js`:

```js
// src/_data/env.js
export default function () {
  return {
    cdnBaseUrl: process.env.CDN_BASE_URL || '',
  };
}
```

Then in Nunjucks templates, replace hardcoded `/images/` paths:

```nunjucks
{# Before #}
<img src="/images/{{ sp.slug }}/{{ img.filename }}">

{# After #}
<img src="{{ env.cdnBaseUrl }}/images/{{ sp.slug }}/{{ img.filename }}">
```

The `env.cdnBaseUrl` will be `''` locally (falling back to relative paths, which requires images
to still be served locally) or `https://pnwmoths.b-cdn.net` in production.

**Preferred local dev approach:** Set `CDN_BASE_URL` in a `.env` file and load it in
`eleventy.config.js` with dotenv. This avoids needing local image copies.

```bash
npm install dotenv
```

In `eleventy.config.js` (add at top):

```js
import 'dotenv/config';
```

Then `.env` (gitignored):

```
CDN_BASE_URL=https://pnwmoths.b-cdn.net
```

And `.env.example` (committed):

```
CDN_BASE_URL=https://pnwmoths.b-cdn.net
```

### Implementation B: Vite define (for client-side components)

To expose `CDN_BASE_URL` to Lit components during Vite bundling, add a `define` to `viteOptions`
in `eleventy.config.js`:

```js
eleventyConfig.addPlugin(EleventyVitePlugin, {
  viteOptions: {
    // ...existing options...
    define: {
      __CDN_BASE_URL__: JSON.stringify(process.env.CDN_BASE_URL || ''),
    },
  }
});
```

Then in any Lit component or `parquet-cache.js`:

```js
// Vite replaces __CDN_BASE_URL__ at bundle time
const cdnBase = __CDN_BASE_URL__;
const imgSrc = `${cdnBase}/images/${slug}/${filename}`;
```

### GitHub Actions secret

In the CI workflow (`.github/workflows/deploy.yml`), add:

```yaml
env:
  CDN_BASE_URL: ${{ secrets.CDN_BASE_URL }}
  GITHUB_PAGES: "true"
```

And add `CDN_BASE_URL` as a repository secret in GitHub Settings → Secrets and variables →
Actions. Value: `https://pnwmoths.b-cdn.net` (no trailing slash).

### Template migration scope

Current hardcoded `/images/` paths that need updating:

| File | Path pattern | Note |
|------|-------------|------|
| `src/_includes/base.njk:17` | `/images/header.png` | Site banner — static asset, stays in repo |
| `src/species/species.njk:48` | `/images/{{ sp.slug }}/{{ img.filename }}` | Species photos → CDN |
| `src/glossary/index.njk:41` | `('/images/glossary/' + term.image_filename) \| url` | Glossary images → CDN |

Note: `base.njk` banner image (`/images/header.png`) is a UI asset kept in `src/images/`, not a
species photo. It stays in the repo and should NOT use `CDN_BASE_URL`. Only species photos and
glossary images move to bunny.net.

**Confidence:** HIGH — `process.env` pattern confirmed from official Eleventy 3.x docs;
`dotenv` package requirement confirmed (no built-in .env loading in Eleventy 3);
Vite `define` option confirmed from Vite docs. Template paths confirmed by direct file inspection.

---

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| rclone S3 backend for bunny.net | Closed preview, not GA — unavailable without bunny.net invitation |
| Any unofficial bunny CLI | All are archived or unmaintained; rclone FTP is the stable path |
| `sharp` or `jimp` for build-time image processing | Entire point of this milestone is to remove build-time processing and use CDN Optimizer |
| `@11ty/eleventy-img` plugin | Adds build-time image processing; contradicts CDN-native strategy |
| Storing images in both git and CDN | Pick one; after migration, images live exclusively on bunny.net |
| `cross-env` package | Only needed for Windows cross-platform env var setting; this project targets macOS/Linux CI |

---

## Integration Notes

### copy-images.js retirement

`scripts/copy-images.js` currently copies `images/` from the repo root to `_site/images/`. After
CDN migration, species images no longer live in the repo. The script should be updated to:

1. Remove the `images/` → `_site/images/` copy (line 17–20 in current script)
2. Keep the `src/images/` → `_site/images/` copy (banner image remains in repo)
3. Keep styles copy and Pico CSS copy (unrelated to images)

The `build:copy-images` npm script and `writeBundle` hook remain; they just do less.

### GitHub Actions LFS checkout

`.github/workflows/deploy.yml` likely has `lfs: true` on the `actions/checkout` step. Remove it
after LFS is purged. This eliminates the Git LFS bandwidth cost from CI.

### Build pipeline image resize scripts

`scripts/build-data.js` does not currently resize images (confirmed by inspection). Image resizing
appears to be done elsewhere (or was done to produce the LFS-stored downscaled copies). Verify
what produces the current LFS images before removing anything.

---

## Version Summary

| Tool | Version | Source |
|------|---------|--------|
| rclone | 1.68.x (current stable) | brew install rclone or rclone.org |
| dotenv | ^16.x (latest) | npm install dotenv |
| git-lfs (built-in migrate) | installed with git-lfs | git lfs migrate export |
| git-filter-repo | latest (optional) | pip install git-filter-repo |

No new npm packages are strictly required. `dotenv` is the only likely addition, and only if
`.env` file loading is desired locally (vs. always setting env vars in shell or CI).

---

## Sources

- bunny.net Storage API docs (PUT endpoint, regional hostnames): docs.bunny.net/reference/put_-storagezonename-path-filename
- bunny.net Storage quickstart (FTP config, S3 status): docs.bunny.net/storage/quickstart
- bunny.net Dynamic Images API: docs.bunny.net/optimizer/dynamic-images/overview
- bunny.net Optimizer pricing ($9.50/Pull Zone/month): bunny.net/pricing/optimizer/
- bunny.net S3 compatibility blog ("Q2 preview", closed access): bunny.net/blog/whats-happening-with-s3-compatibility/
- rclone FTP `--inplace` flag and bunny.net FTP: forum.rclone.org/t/rclone-problem-with-bunny-cdn/44383
- git-lfs migrate export man page (--everything, --include): github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-migrate.adoc
- GitHub Docs on LFS removal limitations: docs.github.com/en/repositories/working-with-files/managing-large-files/removing-files-from-git-large-file-storage
- Eleventy 3.x environment variables: 11ty.dev/docs/environment-vars/
- Codebase inspection: eleventy.config.js, src/species/species.njk, src/glossary/index.njk, src/_includes/base.njk, .gitattributes, scripts/copy-images.js

---
*Stack research for: pnwmoths v1.4 Image CDN milestone*
*Researched: 2026-04-21*
