# Requirements: v1.4 Image CDN

**Milestone:** v1.4 Image CDN
**Created:** 2026-04-21
**Status:** Active

---

## v1.4 Requirements

### CDN Provisioning

- [ ] **CDN-01**: bunny.net Storage Zone created; original images uploaded from pnwinsects-app Django media dir; Pull Zone configured and linked to Storage Zone
- [ ] **CDN-02**: Bunny Optimizer enabled on Pull Zone; Image Classes defined for glossary portraits (188×225 north-crop) and nav thumbnails; verified in browser (WebP `Content-Type`, correct dimensions)
- [ ] **CDN-03**: `CDN_BASE_URL` added as GitHub Actions secret; wired into deploy and PR check workflows
- [ ] **CDN-04**: Contributor upload workflow documented in `_instructions/` (rclone `copy` vs `sync`, `--ignore-times` for replacements, cache invalidation)

### LFS Removal

- [ ] **LFS-01**: `git lfs migrate export` + `git filter-repo` run to purge `images/` from history; `.gitattributes` cleaned; force-pushed; all collaborators re-clone
- [ ] **LFS-02**: GitHub Actions LFS checkout action replaced with plain `actions/checkout@v4` in both deploy and PR check workflows

### Template Migration

- [ ] **TMPL-01**: `CDN_BASE_URL` read in `eleventy.config.js`; trailing-slash trimmed; fail-fast error when `GITHUB_PAGES=true` and var is unset; exposed via `addGlobalData('cdnBaseUrl', ...)`
- [ ] **TMPL-02**: `cdnUrl` Nunjucks filter defined; `.env.example` added; `.env` added to `.gitignore`
- [ ] **TMPL-03**: `species.njk` updated to use CDN URLs for all species photos
- [ ] **TMPL-04**: `glossary/index.njk` updated to use CDN URLs; `| url` filter stripped from image path expressions
- [ ] **TMPL-05**: `browse/index.njk` passes `cdn-base-url` attribute to `<pnwm-taxon-browser>`; `pnwm-taxon-browser.js` updated with `cdn-base-url` Lit property; all image src construction sites rewritten to use CDN URL
- [ ] **TMPL-06**: `srcset` with 2× width descriptor added to species photo and glossary portrait `<img>` tags

### Build Pipeline Cleanup

- [ ] **PIPE-01**: Species photo copy block removed from `copy-images.js` (banner, Pico CSS, OSD copies retained)
- [ ] **PIPE-02**: Build-time image resize scripts removed

## Future Requirements

- srcset breakpoints beyond 2× (3 or more sizes) — defer until real traffic data shows need
- Signed CDN URLs for access control — deferred; public site, no auth needed yet
- AVIF delivery — not supported by bunny.net (official position); revisit if they add support

## Out of Scope

| Feature | Reason |
|---------|--------|
| S3-compatible upload CLI for bunny.net | bunny.net S3 is in closed preview as of April 2026; rclone FTP is the stable path |
| Custom CDN hostname (e.g. images.pnwmoths.org) | No domain name yet; `*.b-cdn.net` hostname is fine for now |
| Local image proxy / imgproxy for dev | Not needed; all environments use CDN directly |
| GitHub LFS storage quota reclaim | Requires repo deletion + recreation; accept billing for now |

## Traceability

| Requirement | Phase | Status | Outcome |
|-------------|-------|--------|---------|
| CDN-01 | — | Pending | — |
| CDN-02 | — | Pending | — |
| CDN-03 | — | Pending | — |
| CDN-04 | — | Pending | — |
| LFS-01 | — | Pending | — |
| LFS-02 | — | Pending | — |
| TMPL-01 | — | Pending | — |
| TMPL-02 | — | Pending | — |
| TMPL-03 | — | Pending | — |
| TMPL-04 | — | Pending | — |
| TMPL-05 | — | Pending | — |
| TMPL-06 | — | Pending | — |
| PIPE-01 | — | Pending | — |
| PIPE-02 | — | Pending | — |
