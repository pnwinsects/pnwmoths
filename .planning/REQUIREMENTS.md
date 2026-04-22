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

- [ ] **LFS-01**: `git filter-repo --invert-paths` run to purge `images/` and `plates/` from history (no `git lfs migrate export` — pointer files are 130-byte text, no object download needed); `.gitattributes` deleted; force-pushed
- [ ] **LFS-02**: GitHub Actions LFS checkout action replaced with plain `actions/checkout@v4` in both deploy and PR check workflows

### Template Migration

- [x] **TMPL-01**: `cdnBaseUrl` global data exposed via `addGlobalData` in `eleventy.config.js`. CDN URL is a public hard-coded constant — env var / fail-fast approach overridden (O-14-01, 2026-04-22)
- [x] **TMPL-02**: `urlencode` Nunjucks filter defined (encodeURIComponent). No `.env.example` or `.gitignore` entry needed — CDN URL is a public constant, not a secret (O-14-01, 2026-04-22)
- [x] **TMPL-03**: `species.njk` updated to use CDN URLs for all species photos
- [x] **TMPL-04**: `glossary/index.njk` updated to use CDN URLs; `| url` filter stripped from image path expressions
- [x] **TMPL-05**: `pnwm-taxon-browser.js` uses module-level `CDN_BASE_URL` constant for all image src construction. No Lit attribute required — module-level constant is correct architecture (O-14-02, CONTEXT.md D-05, 2026-04-22)
- [x] **TMPL-06**: `srcset` 2× descriptor added to glossary portrait. Species photo srcset deferred to Phase 16 — `pnwm-image-slideshow` drops srcset on slotted img (O-14-03, CONTEXT.md D-04, 2026-04-22)

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
| CDN-01 | Phase 13 | Pending | — |
| CDN-02 | Phase 13 | Pending | — |
| CDN-03 | Phase 13 | Pending | — |
| CDN-04 | Phase 13 | Pending | — |
| LFS-01 | Phase 15 | Pending | — |
| LFS-02 | Phase 15 | Pending | — |
| TMPL-01 | Phase 14 | Complete | cdnBaseUrl global + urlencode filter live; env var approach overridden (O-14-01) |
| TMPL-02 | Phase 14 | Complete | urlencode filter; no .env.example needed — CDN URL is public constant (O-14-01) |
| TMPL-03 | Phase 14 | Complete | species.njk uses {{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename \| urlencode }} |
| TMPL-04 | Phase 14 | Complete | glossary/index.njk CDN URL + Optimizer params; \| url filter removed |
| TMPL-05 | Phase 14 | Complete | pnwm-taxon-browser.js uses module-level CDN_BASE_URL constant (O-14-02) |
| TMPL-06 | Phase 14 | Complete | Glossary srcset 2x done; species srcset deferred to Phase 16 (O-14-03) |
| PIPE-01 | Phase 16 | Pending | — |
| PIPE-02 | Phase 16 | Pending | — |
