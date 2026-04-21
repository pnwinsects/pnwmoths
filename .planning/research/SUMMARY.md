# Research Summary: PNW Moths v1.4 Image CDN

**Synthesized:** 2026-04-21
**Overall confidence:** HIGH — all four files grounded in official documentation and direct codebase inspection

---

## Executive Summary

PNW Moths v1.4 migrates species images out of Git LFS and into bunny.net Storage, served through a CDN Pull Zone with the Bunny Optimizer enabled for on-the-fly resizing and automatic WebP delivery. The existing Eleventy/Vite/Lit stack is unchanged; the migration adds one environment variable (`CDN_BASE_URL`), optionally one npm package (`dotenv`), and one external tool (`rclone` via FTP). The work has three loosely sequential concerns: (1) provisioning bunny.net and uploading images, (2) rewriting git history to remove LFS and updating CI, and (3) updating templates and the `pnwm-taxon-browser` Lit component to construct CDN URLs.

The recommended approach is to enable Bunny Optimizer on the Pull Zone **before** removing any build-time image handling, then migrate templates to CDN URLs, then retire the species photo copy step in `copy-images.js`. The LFS history rewrite is the highest-coordination task — a destructive force-push requiring all collaborators to re-clone — and should be a distinct, announced step. GitHub will not free the LFS storage quota until the repository is deleted and recreated; this is a known limitation to accept or plan around explicitly.

---

## Stack Additions

- **rclone via FTP** — only viable upload tool; bunny.net S3 compatibility is in closed preview (not GA as of April 2026). FTP host = regional endpoint (e.g. `ny.storage.bunnycdn.com`); user = Storage Zone name; pass = `rclone obscure` output. Always use `--size-only` or `--ignore-times` (bunny FTP does not support mtime).
- **Node `--env-file=.env`** (Node 20.6+) or `dotenv` — Eleventy 3.x has no built-in `.env` loading. Either works; `--env-file` avoids a new dependency.
- **`git lfs migrate export --everything --include="*"`** then **`git filter-repo --path images/ --invert-paths`** — correct two-step LFS removal. `migrate export` replaces pointers; `filter-repo` strips the directory from history entirely.

## Feature Table Stakes

| Feature | Mechanism |
|---------|-----------|
| Width-constrained resize (species photos) | `?width=N` |
| Exact-dimension crop (glossary 188×225) | `?crop=188,225&crop_gravity=north` — NOT `width`+`height` together |
| WebP auto-delivery | Bunny Optimizer pull-zone setting; no HTML changes needed |
| AVIF | Not supported (official bunny.net position — encoding too slow) |
| Image Classes | Named presets in Bunny dashboard; centralise glossary/nav crop params |

## Architecture: CDN_BASE_URL Data Flow

```
CDN_BASE_URL (env var / .env)
  → eleventy.config.js: trimmed, fail-fast guard when GITHUB_PAGES=true
       → addGlobalData('cdnBaseUrl', value)
            → species.njk: static HTML <img src="https://cdn.../slug/file.jpg">
            → glossary/index.njk: static HTML (remove | url filter first)
            → browse/index.njk: cdn-base-url attribute on <pnwm-taxon-browser>
                 → pnwm-taxon-browser.js: runtime JS img.src construction
```

**Files that change:** `eleventy.config.js`, `scripts/copy-images.js`, `src/species/species.njk`, `src/glossary/index.njk`, `src/browse/index.njk`, `src/components/pnwm-taxon-browser.js`, `.github/workflows/deploy.yml`, `.github/workflows/pr-check.yml`, `lychee.toml`. New: `.env.example`. Add `.env` to `.gitignore`.

**Files that do NOT change:** `vite.config.js`, `src/_includes/base.njk` (banner stays site-relative), `src/_data/taxon.js`, `src/_data/images.js`.

**Vite:** CDN URLs are absolute (`https://`). Vite's HTML transformer ignores absolute hrefs — no Vite config changes needed.

## Critical Pitfalls

| Pitfall | Prevention | Phase |
|---------|-----------|-------|
| LFS purge requires repo recreation to free GitHub storage | Accept billing or plan repo recreation window; document decision | LFS removal |
| `rclone sync` deletes production bucket files | Always use `rclone copy`; `rclone sync` only with mandatory `--dry-run` first | Upload workflow |
| Bunny Optimizer must be enabled before removing build-time resize scripts | Enable → verify in browser network tab → then update templates | Provisioning |
| `\| url` filter corrupts absolute CDN URLs in `glossary/index.njk` | Remove `\| url` from all image path expressions in same commit as CDN URL adoption | Template migration |
| `pnwm-taxon-browser.js` has multiple image src construction sites | Grep for `this._prefix` + `"images/"` before writing replacement; audit `_renderImageStrip` (~line 143) and `_renderSpecies` (~line 199) | Template migration |
| rclone mtime skips re-uploads of same-named replacement files | Use `--ignore-times` when replacing existing files | Upload workflow |
| `CDN_BASE_URL` must be Pull Zone URL, not Storage Zone URL | `CDN_BASE_URL` = `{zone}.b-cdn.net` hostname, NOT `storage.bunnycdn.com` | Provisioning |
| lychee excludes image extensions — CDN image 404s invisible to CI | Add CDN hostname exclusion to `lychee.toml`; manually spot-check image URLs post-deploy | CI/CD |

## Recommended Phase Order

Hard dependencies: Phase A (bunny.net provisioning) must complete before Phase D (copy-images.js retirement). Phase C (template migration) must also complete before Phase D. Phases B and C can run in parallel after A.

**A — bunny.net provisioning + image upload**
Create Storage Zone + Pull Zone; enable Optimizer (verify in browser network tab before proceeding); configure rclone; bulk-upload originals from `pnwinsects-app`; set `CDN_BASE_URL` secret in GitHub Actions; document rclone workflow in `_instructions/`.

**B — LFS removal (history rewrite)**
Announce; backup mirror; `git lfs migrate export --everything`; `git filter-repo --path images/ --invert-paths`; clean `.gitattributes`; force-push. Accept GitHub storage billing or plan repo recreation.

**C — Eleventy template migration**
`CDN_BASE_URL` → `eleventy.config.js` global data with trailing-slash trim + fail-fast guard; `cdnUrl` Nunjucks filter; update `species.njk`, `glossary/index.njk` (strip `| url`), `browse/index.njk` (add `cdn-base-url` attr); update `pnwm-taxon-browser.js` (new `cdn-base-url` Lit property, replace all src construction sites); add `.env.example`.

**D — `copy-images.js` + CI/CD finalization**
Remove species photo copy block (keep banner/Pico/OSD copies); replace LFS checkout action with plain `actions/checkout@v4` in both workflow files; add `CDN_BASE_URL` env to deploy build step; update `lychee.toml` to exclude CDN hostname.

---

## Verify Before Coding

- `grep -n 'src=\|_prefix\|images/' src/components/pnwm-taxon-browser.js` — get exact count and locations of image src construction sites
- Check whether `scripts/build-data.js` has any image resize logic to retire (unconfirmed by research)

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack (rclone FTP, bunny.net, dotenv) | HIGH | Official bunny.net + rclone docs; codebase inspection |
| Features (Optimizer params, WebP, AVIF) | HIGH | Official bunny.net docs; AVIF via official blog |
| Architecture (integration points, data flow) | HIGH | Direct source file inspection; file paths and line numbers verified |
| Pitfalls (LFS, rclone, URL construction) | HIGH | Official docs, rclone issue tracker, git-lfs man page, codebase |

---

*Research completed: 2026-04-21*
*Ready for requirements: yes*
