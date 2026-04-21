# Phase 13: CDN Provisioning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 13-cdn-provisioning
**Areas discussed:** PR check CDN behavior, _instructions/ doc structure, Image source path

---

## PR check CDN behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — same secret, both workflows | Add CDN_BASE_URL to PR check env block; catches broken image paths in CI | |
| No — deploy only | PR check omits CDN_BASE_URL; images emit empty URLs in PR builds | |
| Other (user input) | CDN base URL is not a secret; hard-code it directly in eleventy.config.js | ✓ |

**User's choice:** CDN_BASE_URL is a public URL that doesn't vary across environments — hard-code it in `eleventy.config.js`. Not a secret, not an env var.

**Follow-up — drop fail-fast machinery?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — drop fail-fast + .env machinery | Hard-code public URL; remove TMPL-01/TMPL-02 from Phase 14 | ✓ |
| Keep env var but not secret | Use process.env with hard-coded fallback | |

**User's choice:** Drop TMPL-01 (fail-fast guard) and TMPL-02 (.env.example) from Phase 14. Not needed if URL is hard-coded.

---

## _instructions/ doc structure

| Option | Description | Selected |
|--------|-------------|----------|
| New UPLOADING_IMAGES.md | Standalone rclone guide; ADDING_PHOTO.md updated in Phase 15 | ✓ |
| Update ADDING_PHOTO.md now | Replace LFS section with rclone steps immediately | |

**User's choice:** New `UPLOADING_IMAGES.md`

**Follow-up — audience?**

| Option | Description | Selected |
|--------|-------------|----------|
| Owner only | Assumes credentials already set up | |
| Any trusted contributor | Includes credential request process + full rclone setup | ✓ |

**Follow-up — cache invalidation?**

| Option | Description | Selected |
|--------|-------------|----------|
| bunny.net dashboard | Simple; no extra credentials | |
| curl API call | Scriptable; requires API key in addition to FTP password | ✓ |

---

## Image source path

| Option | Description | Selected |
|--------|-------------|----------|
| Upload from repo images/ (LFS copies) | Already structured correctly; simpler | |
| Restructure Django originals first | Script parses Django filenames → slug/filename; full-res originals on CDN | ✓ |
| Django dir already structured | — | |

**User's choice:** Full migration from Django originals. Path provided: `/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/`

**Follow-up — filename policy?**

| Option | Description | Selected |
|--------|-------------|----------|
| Parse Django filename → slug/weight | Derive slug from genus+species; assign sequential weights | |
| Use LFS images as source of truth | Keep existing sequential filenames | |
| Keep original filenames, adjust images.csv | Upload with original Django filenames; update images.csv to match | ✓ |

**Follow-up — scale?**

| Option | Description | Selected |
|--------|-------------|----------|
| All Django images — full migration | 4,577 moth images + 15 glossary images; rebuild images.csv | ✓ |
| Just current 4 species | | |
| 4 now, bulk later (999.2) | | |

**Follow-up — photographer/license data?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — export from Django | User can dump metadata from Django database | ✓ |
| Leave blank | | |
| Scope creep → 999.2 | | |

**Follow-up — glossary images in same zone?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — same zone, glossary/ prefix | 15 images under glossary/ prefix; consistent with current repo layout | ✓ |
| No — glossary stays local | | |

---

## Claude's Discretion

- Nav thumbnail Image Class exact dimensions — not discussed (user did not select this area); defaulting to `?height=186` (2× CSS display height of 93px); researcher to validate

## Deferred Ideas

- None raised during discussion
