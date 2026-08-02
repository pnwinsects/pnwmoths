# Task: Generate and Upload Image Derivatives

Every image the site displays is served as a **pre-generated derivative** — a WebP or JPEG at a
fixed size, stored under `derived/` on the CDN. The edge no longer resizes anything on request, so
an image that has not been through this pipeline simply does not appear.

Run this **after** uploading any new species photo, glossary illustration, plate, or high-res tile
thumbnail. The build refuses to finish until you do (`[check-derivatives] SOURCE GATE FAILED`).

Background and rationale: [ADR 0022](../docs/adr/0022-pregenerated-image-derivatives.md).

## What This Changes

- **`var/derivatives/`** — the generated files, local scratch. Safe to delete; regenerated on demand.
- **`var/derivatives-manifest.csv`** — run state, local scratch. Rows advance `generated` → `uploaded`.
- **bunny.net Storage Zone `pnwmoths`** — new objects under the `derived/` prefix.
- **`data/image-derivatives.csv`** — committed. The record of what is on the CDN, and what the build
  checks against. **This file must be committed or the build fails for everyone else.**

## Before You Start

- **`vips`** — `brew install vips`. Generation needs nothing else: sources are read from the public
  CDN, so there are no credentials and no Dropbox involved.
- **`BUNNY_STORAGE_PASSWORD`** — needed for the upload step only. bunny.net → Storage → `pnwmoths` →
  FTP & API Access.
- A clean `var/derivatives-manifest.csv` state. The two scripts share it and refuse to run
  concurrently — with each other or with a second copy of themselves. `DRY_RUN=1` is exempt
  and safe at any time, since it writes nothing. If a run died mid-flight, the next one takes
  the stale lock over automatically ([ADR 0025](../docs/adr/0025-manifest-locks.md)).

## Steps

**1. Generate.** Both scripts are resumable and idempotent — a rerun after a complete run does no
work and writes nothing, so re-running after adding one photo processes only that photo.

```bash
DRY_RUN=1 node scripts/generate-derivatives.ts   # print the plan first
node scripts/generate-derivatives.ts
```

**2. Upload.**

```bash
DRY_RUN=1 node scripts/upload-derivatives.ts
BUNNY_STORAGE_PASSWORD=... node scripts/upload-derivatives.ts
```

The committed manifest is written from **uploaded** rows only, so a derivative sitting on your
laptop but not on the CDN still fails the guard. That is deliberate.

**3. Commit the manifest.**

```bash
git add data/image-derivatives.csv
git commit -m "chore(images): record derivatives for <species>"
```

## Verify

```bash
npm run build:site
```

Expected: `[check-derivatives] PASS: … emitted derivative URL(s) …`.

## Reading a failure

The guard runs two checks and names the file either way.

**`SOURCE GATE FAILED`** — an image in `data/images.csv`, `data/species-photos.json` or
`data/glossary.csv` has no derivatives. This is the normal "new photo, forgot the pipeline" case:
run steps 1–3.

```
[check-derivatives] SOURCE GATE FAILED: 1 source image(s) are missing derivatives:
  acronicta-americana/Acronicta americana-A-D.jpg (legacy) — missing @320h, @full
```

**`EMITTED GATE FAILED`** — a template asked for a variant that does not exist. That is a code
change, not a data one: either the variant belongs in the matrix in
[`scripts/lib/derivatives.ts`](../scripts/lib/derivatives.ts) (then regenerate everything), or the
template is asking for the wrong one.

## Notes

- **Withheld families are skipped.** The source gate only checks species that actually get a page,
  so a family under embargo cannot fail the build. Lifting an embargo can, though — see ADR 0022.
- **Regenerating everything** is ~23,000 files and a few hours of `vips`. Use `KIND=legacy |
  highres | glossary | plates`, `LIMIT=8` or `DRY_RUN=1` to scope a trial run first.
- **Nothing is ever deleted.** Superseded derivatives linger on the zone, which the additive-only
  deploy ([ADR 0008](../docs/adr/0008-deploy-bunny-additive.md)) tolerates.
