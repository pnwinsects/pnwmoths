# Task: Produce DZI tiles for the pilot species

Operator-side runbook for Phase 28 Plan 01 Task 2. Produces a local set of DZI tile pyramids — one per `(specimen_id, view)` pair — for one hand-picked pilot species. The tile pyramids stay on your local disk; Plan 03 uploads them to bunny.net Storage.

## What This Changes

- Local working directory: `{prefix}.dzi` descriptor + `{prefix}_files/` tile pyramid per pair (typically 2–6 pairs total for a clean-match species with both Dorsal and Ventral views).
- **No** committed files. **No** bunny.net writes. **No** Eleventy build changes. **No** edits to `data/species-photos.json` (that's Plan 05).

## Prerequisites

- **libvips CLI** installed locally — confirm with `vips --version` (8.x or later).
  - macOS: `brew install vips`
  - Debian/Ubuntu: `sudo apt install libvips-tools`
- **Source TIFFs on local disk** for one species in the `clean-match` bucket. The TIFF filenames follow the Phase 26 convention `Genus species-{specimen}-{view}.{ext}` (see `.claude/skills/spike-findings-pnwmoths/SKILL.md`).
- **Manifest lookup ready** — open `data/species-photos-manifest.csv` in a spreadsheet so you can confirm `specimen_id`, `view`, and `species_slug` per row.

## Pick the pilot species

Constraint (per Phase 26 manifest):

- `match_bucket = clean-match` — synonym already resolved; species page exists.
- Both `D` and `V` views present.
- 1–3 specimens (keeps tile count small for the pilot).
- TIFF files are physically available on your local disk.

Single-specimen candidates surfaced by `28-RESEARCH.md § Pilot Species Selection` (each has exactly 2 files: D + V for specimen `A`):

- `abagrotis-apposita`
- `abagrotis-dickeli`
- `abrostola-urentis`

Richer 3-file candidate with mixed specimen IDs (letter + institutional accession):

- `feltia-herilis` (specimen `A` and `WWUC0000003275`, both D + V)

Pick whichever has TIFFs on your machine. Record the chosen slug — Plan 05 (`PILOT-LESSONS.md`) will reference it.

## Steps

**1. Create a working directory for the pilot tiles.**

```sh
SLUG="abagrotis-apposita"   # replace with your pick
mkdir -p "/tmp/tiles/${SLUG}"
```

**2. Run `vips dzsave` once per `(specimen_id, view)` pair.**

The required flags are exact:

- `--tile-size 256` — OSD default tile size.
- `--overlap 1` — 1-pixel overlap between tiles (prevents seams at zoom edges).
- `--suffix .webp[Q=80]` — WebP output at quality 80; updates the `.dzi` descriptor's `Format` attribute to `webp`. WebP is ~30% smaller than JPEG at equivalent quality (confirmed on pilot: 1.2 MB JPEG → 850 KB WebP per pair).
- `--layout dz` — Deep Zoom Image layout (the only OSD-friendly layout vips emits in this codepath).

The **output argument is the prefix path**. vips writes `{prefix}.dzi` (descriptor) and `{prefix}_files/` (tile pyramid). The last path component of the prefix MUST be the literal token `{specimen_id}-{view}` (hyphen, not slash) so it matches the storage path convention `species-tiles/{slug}/{specimen_id}-{view}/`.

One pair:

```sh
vips dzsave "/path/to/Abagrotis apposita-A-D.tif" "/tmp/tiles/${SLUG}/A-D" \
  --tile-size 256 \
  --overlap 1 \
  --suffix .webp[Q=80] \
  --layout dz
```

Loop over all pairs of the chosen species (typical single-specimen case — 2 pairs):

```sh
for VIEW in D V; do
  vips dzsave "/path/to/Abagrotis apposita-A-${VIEW}.tif" "/tmp/tiles/${SLUG}/A-${VIEW}" \
    --tile-size 256 \
    --overlap 1 \
    --suffix .webp[Q=80] \
    --layout dz
done
```

For `feltia-herilis` (mixed specimen IDs), unroll the loop or iterate `(specimen_id, view)` pairs explicitly:

```sh
for PAIR in A-D A-V WWUC0000003275-D WWUC0000003275-V; do
  vips dzsave "/path/to/Feltia herilis-${PAIR%-?}-${PAIR##*-}.tif" \
    "/tmp/tiles/${SLUG}/${PAIR}" \
    --tile-size 256 \
    --overlap 1 \
    --suffix .webp[Q=80] \
    --layout dz
done
```

(Adjust the source TIFF path pattern to match what you actually have.)

## Verify

For each pair, confirm three things:

**1. Descriptor file exists.**

```sh
ls "/tmp/tiles/${SLUG}/A-D.dzi"
```

**2. Lowest-level tile exists.**

```sh
ls "/tmp/tiles/${SLUG}/A-D_files/0/0_0.webp"
```

**3. Descriptor `Format` attribute matches the tile extension.**

```sh
head -20 "/tmp/tiles/${SLUG}/A-D.dzi"
```

Expected: an `<Image …>` element with `Format="webp"` and `TileSize="256"`. Example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Image Format="webp" Overlap="1" TileSize="256" xmlns="http://schemas.microsoft.com/deepzoom/2008">
  <Size Width="…" Height="…"/>
</Image>
```

If `Format="png"` or `Format="jpg"` appears instead of `webp`, the `--suffix .webp[Q=80]` flag was dropped or overridden — rerun with the explicit flag.

Record per pair (for Plan 05 lessons doc):

- Total tile count: `find "/tmp/tiles/${SLUG}/A-D_files" -name '*.webp' | wc -l`
- Disk size of this pair: `du -sh "/tmp/tiles/${SLUG}/A-D" "/tmp/tiles/${SLUG}/A-D_files"`
- Number of pyramid levels: `ls "/tmp/tiles/${SLUG}/A-D_files" | wc -l`

These feed Phase 30's footprint extrapolation (~5,000 specimens at the per-specimen rate you observe).

## When Things Go Wrong

- **`vips: command not found`** — libvips CLI is not installed. Install per the Prerequisites block (`brew install vips` or `sudo apt install libvips-tools`). The `libvips` library alone is not enough — you need the CLI tools package.
- **`vips dzsave` writes `.png` tiles instead of `.webp`** — the `--suffix .webp[Q=80]` flag was missing or quoted wrong. Make sure the suffix is `.webp[Q=80]` with the bracketed Q parameter (no space, square brackets quoted by your shell if needed). Re-run the same command; vips overwrites existing output without prompting.
- **Output goes to the wrong place** — vips writes to whatever the last path component of the output argument is. If you passed `/tmp/tiles/${SLUG}/A_D` (underscore) instead of `A-D` (hyphen), the tiles land in `A_D.dzi` + `A_D_files/`. The hyphen-separated `{specimen_id}-{view}` form is the project convention because Plan 03's upload path `species-tiles/{slug}/{specimen_id}-{view}/` mirrors it exactly. Re-run with the corrected prefix.
- **vips warning about colour profile / ICC** — vips often emits `vips warning: VIPS_ICC_PROFILE not set` or similar. These are non-fatal for the pilot; record them in PILOT-LESSONS.md so Phase 29 can decide whether to silence or address.
- **`Format` in `.dzi` descriptor does not match tile file extension** — this is RESEARCH.md Pitfall 4. OSD constructs tile URLs from the descriptor's `Format` value, so a mismatch produces 404s on every tile fetch. Fix by re-running with `--suffix .webp[Q=80]` explicit.
- **Disk space pressure** — one pair is typically tens of MB; one species (2–6 pairs) is well under 200 MB. If you see "no space left" mid-run, point the output to a different mount.

## After this step

Tile pyramids are local-only at this point. Next:

- **Plan 03** authors `UPLOAD-RECIPE.md` and the operator uploads the pyramids to bunny.net Storage at `species-tiles/{slug}/{specimen_id}-{view}/...`.
- **Plan 04** wires OpenSeadragon into `pnwm-image-slideshow` (autonomous; runs in parallel with Plan 03's operator step).
- **Plan 05** hand-edits `data/species-photos.json` with the real pilot entry, browser-verifies OSD against the live CDN, and captures lessons in `PILOT-LESSONS.md`.

Report back at the Plan 01 Task 2 checkpoint with: chosen species slug, number of `(specimen_id, view)` pairs tiled, total tile count, total disk size, and any vips warnings or unexpected output.

> **Confirmed** — Parameters verified on pilot run (Phase 28, 2026-05-22): `--tile-size 256 --overlap 1 --suffix .webp[Q=80] --layout dz` produces the expected DZI layout. WebP format chosen over JPEG for ~30% size reduction (1.2 MB → ~850 KB per pair on pilot TIFFs). `Format="webp"` appears correctly in the `.dzi` descriptor and OSD resolves tile URLs accordingly.
