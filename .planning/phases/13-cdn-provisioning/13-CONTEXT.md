# Phase 13: CDN Provisioning - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Provision bunny.net Storage Zone + Pull Zone with Optimizer enabled; upload all species photos and glossary images (full legacy migration from Django media dir, not just the 4 LFS species); wire CDN base URL into the codebase as a hard-coded constant; document the ongoing upload workflow for trusted contributors.

Phase 13 does NOT modify any Eleventy templates or Nunjucks files (that is Phase 14). It does NOT touch Git history or LFS (that is Phase 15).

</domain>

<decisions>
## Implementation Decisions

### CDN URL: Hard-coded constant, not an env var

- **D-01:** `CDN_BASE_URL` is a public URL (the bunny.net Pull Zone hostname, e.g. `https://pnwmoths.b-cdn.net`) and is NOT treated as a secret. It is hard-coded as a constant in `eleventy.config.js`. No `.env` file, no `dotenv` package, no `process.env` lookup, no `--env-file` flag.
- **D-02:** There is NO fail-fast guard for missing `CDN_BASE_URL`. REQUIREMENTS.md entries TMPL-01 and TMPL-02 (from Phase 14) are **dropped** — they assumed env-var machinery that is no longer needed.
- **D-03:** GitHub Actions has no `CDN_BASE_URL` secret. CDN-03 from REQUIREMENTS.md is revised: the only GitHub Actions change is wiring the constant (already in code) into the deploy workflow via the build step.

### Image migration: full legacy import with original filenames

- **D-04:** Source is the Django media directory at `/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/`. Species photos are in `moths/` (flat directory, ~4,577 files). Glossary images are in `glossary-images/` (~15 files). Subdirectories `thumbnail/`, `medium/`, `cache/` in `moths/` are skipped — originals only.
- **D-05:** Original Django filenames are kept as-is (e.g. `Acronicta americana-A-D.jpg`). They are NOT renamed to sequential numbers. `data/images.csv` is updated to reflect original filenames in its `filename` column.
- **D-06:** CDN Storage Zone path structure: `{slug}/{original-filename}` for species photos, `glossary/{original-filename}` for glossary images. Slug is derived from the `{Genus} {species}` prefix of each Django filename (lowercase, space → hyphen). Note: original filenames contain spaces; downstream template code must URL-encode them (or use `encodeURIComponent` in JS).
- **D-07:** Photographer and license data for all images is exported from the Django database by the project owner before the migration script runs. The migration script consumes this export.
- **D-08:** This is a complete data import. After Phase 13, `data/images.csv` covers all ~700 species (not just the 4 currently tracked). The existing 4 LFS-backed species rows are replaced/reconciled.
- **D-09:** Both species photos and glossary images go into the SAME bunny.net Storage Zone (with their respective path prefixes). One Pull Zone covers both.

### Image Classes

- **D-10:** Glossary portrait dimensions: 188 × 225 px, north crop. Query params: `?width=188&height=225&crop_gravity=north`. These params work directly on the Optimizer without a named Image Class. The Image Class named `glossaryportrait` was defined during Phase 13 but is now disabled (see D-18). Phase 14 templates MUST use direct query params, NOT the class name.
- **D-11:** Nav thumbnail dimensions: height 186 px, width auto-proportioned. 186 = 2× the CSS display height of 93 px. Query param: `?height=186`. This works directly on the Optimizer without a named Image Class. The Image Class named `navthumb` was defined during Phase 13 but is now disabled (see D-18). Phase 14 templates MUST use `?height=186` directly in CDN URLs, NOT the class name.
- **D-18:** bunny.net Image Classes are currently **disabled** on the Pull Zone Optimizer. Root cause: when Image Classes are enabled, bunny.net requires every request to include a valid class name in the URL — requests without a class name receive 403. During Phase 13 execution, all CDN requests were returning 403 because no class name was appended. bunny.net support disabled Image Classes to restore delivery. Resolution: the same resize/crop operations are achieved by passing Optimizer query params directly (`?width=`, `?height=`, `?crop_gravity=`). **Do not re-enable Image Classes** unless Phase 14 templates are simultaneously updated to append class names to every CDN URL — failing to do so will return 403 sitewide.

### rclone FTP notes (discovered during Plan 03 execution)

- **D-14:** FTP hostname for the pnwmoths Storage Zone is `la.storage.bunnycdn.com` (LA region), not `ny`.
- **D-15:** `rclone obscure` output must NOT be pasted at the `rclone config` password prompt — doing so double-obscures the password and breaks auth. Either type the plain password directly at the `rclone config` prompt, or edit `~/.config/rclone/rclone.conf` and set `pass = $(rclone obscure PLAIN_PASSWORD)`.
- **D-16:** `RCLONE_REMOTE` must be `bunny:` (just the remote name with colon), not `bunny:pnwmoths`. The FTP user `pnwmoths` maps to the root of the pnwmoths Storage Zone, so sub-paths begin directly after the colon: `bunny:slug/`, `bunny:glossary/`.
- **D-17:** Uploading a whole directory via `rclone copy DIR remote:dest/` causes concurrent partial-file renames that bunny.net FTP rejects with `450 Requested file action not taken`. Fix: upload one file at a time (one `rclone copy FILE remote:dest/` call per file), which serializes the temp-file renames.

### _instructions/ documentation

- **D-12:** A new `_instructions/UPLOADING_IMAGES.md` is created. `_instructions/ADDING_PHOTO.md` is NOT changed in this phase (LFS steps remain there until Phase 15 removes LFS).
- **D-13:** `UPLOADING_IMAGES.md` is written for **any trusted contributor** (not owner-only). It covers: how to request FTP credentials + API key from the project owner; `rclone` FTP remote setup for bunny.net; `rclone copy --ignore-times` for new + replacement uploads; `rclone copy` vs. `rclone sync` warning; cache invalidation via `curl` API call (requires the bunny.net API key).

### Claude's Discretion

- Nav thumbnail exact dimensions (D-11 above) — researcher should confirm 186 px height is correct for the accordion's responsive image strips and whether a fixed width cap is needed.
- Slug derivation edge cases: `0817021.JPG` and similarly non-standard filenames in `moths/` — researcher should identify these and decide how to handle them (skip, manual mapping, or prefix-based fallback).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — v1.4 CDN requirements; note D-02 and D-03 above override CDN-03 and TMPL-01/TMPL-02

### Phase 13 roadmap entry
- `.planning/ROADMAP.md` §Phase 13 — success criteria SC-1, SC-2, SC-3, SC-4 (note SC-3 is revised by D-03: no GitHub secret)

### Research
- `.planning/research/SUMMARY.md` — bunny.net Optimizer mechanics, rclone FTP pitfalls, CDN URL data flow; most still applies except the env-var architecture
- `.planning/research/PITFALLS.md` — critical pitfalls for rclone sync/copy, mtime skipping, LFS quota

### Existing codebase
- `scripts/copy-images.js` — current image copy logic; Phase 13 does NOT modify this (Phase 16 removes the species copy block)
- `src/components/pnwm-taxon-browser.js` lines ~132–146 — nav image CSS (`height:93px;width:auto`) that informs D-11

### Django source
- `/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/moths/` — species photo source (~4,577 files, flat)
- `/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/glossary-images/` — glossary images (~15 files)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/images.csv` — will be substantially rebuilt; current schema (species_id, filename, photographer, weight, license, view, specimen) stays intact, filenames change to original Django names
- `data/species.csv` — used by migration script to look up species_id from genus+species (needed to build images.csv rows)
- `.gitattributes` — currently tracks `images/**/*.jpg` etc. via LFS; NOT changed in Phase 13 (Phase 15)

### Established Patterns
- Sequential `weight` ordering in images.csv — migration script assigns weights per-slug (alphabetical order among Django filenames for a given species)
- `navigational` flag in images.csv — migration sets to blank for all imported images (no nav image data in Django export); nav images are curated manually after import

### Integration Points
- Phase 14 reads the hard-coded CDN constant from `eleventy.config.js`; Phase 13 just establishes it
- Phase 15 (LFS removal) depends on Phase 13 CDN being live — do not start Phase 15 before verifying CDN delivers images correctly

</code_context>

<specifics>
## Specific Ideas

- Django filename pattern: `{Genus} {species}-{Specimen}-{View}.jpg` (e.g. `Acronicta americana-A-D.jpg` where D=dorsal, V=ventral). Some filenames break the pattern (numeric IDs like `0817021.JPG`) and need special handling.
- The `navigational` column in the migrated images.csv rows should be blank (not `true`) — nav images are curated manually from the full image set after the migration, not inferred from Django data.
- bunny.net Pull Zone URL becomes a public constant; good candidate for a named const at the top of `eleventy.config.js` with a comment pointing to the bunny.net dashboard.

</specifics>

<deferred>
## Deferred Ideas

- Bulk import automation for future species adds (999.2 backlog) — Phase 13 is a one-time migration; ongoing contributor workflow uses UPLOADING_IMAGES.md
- Signed CDN URLs — public site, not needed (out of scope per REQUIREMENTS.md)
- AVIF delivery — bunny.net doesn't support it (out of scope per REQUIREMENTS.md)
- Per-species contributor subaccounts on bunny.net — FTP password shared via project owner for now

</deferred>

---

*Phase: 13-cdn-provisioning*
*Context gathered: 2026-04-21*
