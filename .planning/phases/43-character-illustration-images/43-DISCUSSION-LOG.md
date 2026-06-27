# Phase 43: Character Illustration Images - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 43-character-illustration-images
**Areas discussed:** Image source & resize, CSV schema & granularity

---

## Image source & resize

### Where do the source image files come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Lucid key media folder | Point the script at the extracted Lucid key media directory | ✓ (refined) |
| Legacy MySQL DB | Pull from pnwmoths-mysql Docker DB | |
| Manual drop folder | Curator collects images by hand | |

**User's choice:** Investigate the MySQL DB, `~/dev/pnwinsects-app`, and the dump listing
(`pnwmoths-listing.txt` of `pnwmoths_https.tar.xz`) to locate them; ask the owner only if absent.
**Notes:** Investigation found the Lucid key media in the dump under
`.../static/media/lucidkey/key/PNW Moths/Media/Images/` (2,009 files: ~1,811 specimen photos
+ ~198 character illustrations with descriptive filenames). User then pointed to an already-extracted
local copy: `/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key media/Images/`.

### How should images be processed before upload?

| Option | Description | Selected |
|--------|-------------|----------|
| Resize to max ~600px WebP | Downscale + WebP | |
| Upload as-is (JPEG) | No processing | |
| Cap width, keep JPEG | Resize-if-wide, keep JPEG | |

**User's choice:** Keep dimensions, convert to WebP (from the local `Images/` folder).
**Notes:** Source dimensions vary widely (399×206, 1245×495, 1080×1317); no resize requested.

---

## CSV schema & granularity

### How should the mapping relate characters to images?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-state, one image | One row per char_id → one image | ✓ |
| Per-state, allow multiple | char_id may map to several images | |
| Per-question, one image | One diagram per question | |

**User's choice:** Per-state, one image.
**Notes:** Filenames are per-state descriptions; char_id identifies a single state.

### How should the CSV get populated initially?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate draft, commit it | Matcher writes CSV; curator refines | ✓ |
| Ship empty, curator fills in | Header-only CSV | |
| Auto-match at build time | No committed CSV; match during build | |

**User's choice:** Auto-generate draft, commit it.
**Notes:** ~49 states exact-match on normalized filename today; fuzzy matching would get more.

### What columns should the CSV carry?

| Option | Description | Selected |
|--------|-------------|----------|
| id, filename + alt | char_id, image_filename, alt_text | ✓ |
| Minimal: id + filename | derive alt from state name | |
| id, filename, alt, verified | adds review flag | |

**User's choice:** `char_id, image_filename, alt_text`.
**Notes:** Blank alt_text → derive from state name at render time.

---

## Claude's Discretion

- Expander UI: placement (per-checkbox vs grouped), `<summary>` wording, in-panel image sizing
  (user chose "I'm ready for context" — leave to UI-spec, guided by the per-state decision).
- Whether help images appear in the no-JS static fallback.
- WebP conversion tooling and the exact normalized state-name↔filename matching algorithm.

## Deferred Ideas

- Locking the expander UI treatment — left to UI-spec / planning this phase.
- Surfacing help images in the no-JS fallback — open for UI-spec.
- Parsing the Lucid binary `.lkc4/.data` files for an authoritative feature→state→image map —
  only if filename-matching coverage proves inadequate after curation.
