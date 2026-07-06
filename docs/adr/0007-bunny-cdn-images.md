# 0007. Image assets served from the Bunny CDN; no images in the repo

**Status:** Accepted

## Context

The catalog references thousands of photos (3,880+ originals, plus deep-zoom tiles). Early on
these lived in the repo via **Git LFS**, which kept binaries out of the working tree but still
bloated history and coupled every clone to LFS bandwidth and pointers. For a low-maintenance,
frequently-cloned static repo that AI tools and non-technical curators also work in, carrying
image binaries in Git is pure overhead.

## Decision

Serve all image assets from the **[Bunny](https://bunny.net) CDN** (Storage Zone + Pull Zone +
Optimizer). No image binaries live in the repo. In v1.4 Git LFS was **purged from all history**
(`git filter-repo --invert-paths`, ~16,191 tracked files across all commits) and `origin/main`
force-pushed. Templates build image URLs from **`CDN_BASE_URL`, a hard-coded public constant**
in `eleventy.config.ts` (and a module-level const in the web components), not an env var or secret.

## Consequences

- Clones are small; the repo holds text only. Curators add photos by uploading to Bunny (see
  [`_instructions/UPLOADING_IMAGES.md`](../../_instructions/UPLOADING_IMAGES.md)), never by
  committing binaries.
- `CDN_BASE_URL` being a plain constant is **intentional**: the URL is meant to be public, so
  there is no secret to manage — no dotenv machinery, nothing for a non-technical maintainer to
  configure. Simplicity over ceremony.
- Django-era filenames contain spaces, so templates must `urlencode` image paths.
- The force-push history rewrite was a one-time event; the LFS-removal commit history is the
  record. (The rewrite was driven from the *local* repo, which was ahead of remote, to avoid
  losing unpushed work.)

## Alternatives considered

- **Git LFS** — used, then rejected: history bloat and clone-time coupling; replaced by the CDN.
- **`CDN_BASE_URL` as an env var / secret** — rejected: the URL is public, so a secret adds
  configuration burden with no security benefit.
