# 0022. Image derivatives are pre-generated offline; the Bunny Optimizer is retired

**Status:** Accepted

## Context

Images are served from the Bunny CDN ([0007](0007-bunny-cdn-images.md)) with the **Bunny
Optimizer** add-on enabled on the pull zone. Templates ask for resized variants by query string —
`?width=530`, `?height=186`, `?width=188&height=225&crop_gravity=north`,
`?width=1200&format=jpg` — and the edge produces them on demand.

Bunny prices the Optimizer at **$9.50/month flat per pull zone, unlimited requests**. The July 2026
bill was $10.71 incl. VAT: $9.54 Optimizer, $0.11 traffic, $0.04 storage. The add-on is therefore
**~89% of the bill for a project with no budget**, and because the fee is a flat subscription rather
than metered usage, *reducing* optimizer traffic saves nothing. Only disabling it does. There is no
partial credit, so the work has to land as one coordinated cutover ([#211](https://github.com/pnwinsects/pnwmoths/issues/211)).

Two facts make the cutover tractable. Every needed variant is derivable from files **already on the
CDN** — the tiling pipeline emits a 1500px `_thumbnail.webp` per specimen ([0013](0013-highres-osd-dzi.md)),
and the ~4,000 legacy originals total under 500 MB — so nothing has to be re-read from the 1 TB of
Dropbox TIFFs. And the pattern already exists: `scripts/upload-images.ts` pre-converts the ~191 key
character illustrations to WebP offline instead of asking the Optimizer.

One dependency is invisible in the codebase. The Optimizer also performs **automatic WebP
content-negotiation on every image**, with no query string involved:

```
Habrosyne scripta-A-D.jpg  Accept: */*                 → image/jpeg  118,963 B
Habrosyne scripta-A-D.jpg  Accept: image/webp,avif     → image/webp   85,042 B
```

Disabling the Optimizer reverts all ~4,000 legacy JPEGs to their stored form, ~28% larger. No
template names this behaviour, so it is the dependency most likely to be missed.

## Decision

**Pre-generate every image variant offline, upload it to the CDN as a normal object, and turn the
Bunny Optimizer off.**

Four parts:

1. **A `derived/` prefix on the storage zone.** Generated files live at
   `derived/<source-path-without-extension>@<variant>.<ext>` — e.g.
   `derived/habrosyne-scripta/Habrosyne scripta-A-D@320h.webp`,
   `derived/species-tiles/abagrotis-apposita/A-D_thumbnail@530.webp`. Keeping generated objects
   under one prefix, disjoint from curator uploads, makes "everything under `derived/` is
   reproducible from its source" an invariant worth having on a zone that is never deleted from
   ([0008](0008-deploy-bunny-additive.md)). `@` separates the variant token because legacy
   filenames are already full of hyphens.

2. **A consolidated variant set**, not one file per CSS pixel size. A single `320h` thumbnail
   serves the 93px, 186px and 320px slots and the browser scales it down. Traffic costs $0.11/month,
   so over-sending a few KB is free; halving the object count is not.

   | Source | Variants |
   |---|---|
   | Legacy photo (`{slug}/{filename}`) | `@320h.webp`, `@full.webp` |
   | High-res thumbnail (`{tiles_path}_thumbnail.webp`, 1500px) | `@530.webp`, `@1060.webp`, `@320h.webp`, `@1200.jpg` |
   | Glossary illustration | `@188x225.webp`, `@376x450.webp` (north-gravity crop) |

   ≈12,000 objects, well under 1 GB.

3. **One shared URL helper** owns the naming convention. The five call sites that build optimizer
   URLs today — `src/species/species.njk`, `src/components/pnwm-taxon-browser.ts`,
   `src/components/key-results-grid.ts`, `src/glossary/index.njk`, `src/_lib/social-meta.ts` — all
   route through it. Five hand-built URL patterns is how a variant silently stops existing.

4. **A committed derivative manifest + build-time guard.** The generator writes
   `data/image-derivatives.csv`; a build check fails when a template references a derivative absent
   from it. The check reads the manifest rather than issuing ~12,000 HEAD requests, which keeps it
   offline, fast, and reproducible ([0017](0017-reproducible-committed-artifacts.md)).

The guard is the load-bearing part. Today a curator uploads a JPEG and the edge compresses, converts
and resizes it with no pipeline knowledge required — which is exactly the
"edit without a local build" constraint the project is built around. Afterwards, an unprocessed
upload is served raw and full-size into a 93px slot, and nothing says so. The guard converts that
silent quality regression into a build failure naming the missing file.

Cutover is verified on a **second pull zone pointed at the same storage zone with the Optimizer
disabled**, with a staging build's `CDN_BASE_URL` aimed at it. Pull zones cost nothing but traffic,
and this is the only way to exercise the loss of auto-WebP without experimenting on the live site.

## Consequences

- The bill drops from ~$10.71/month to ~$0.20/month; ~$114/year saved on a project with no budget.
- Adding a photo gains a required step: generate and upload derivatives. `_instructions/ADDING_PHOTO.md`
  and `_instructions/UPLOADING_IMAGES.md` must carry it, and the guard enforces it.
- Changing an image size stops being a template edit and becomes a re-derive-and-upload run.
- `og:image` URLs already scraped by Facebook/X/Slack point at `?width=1200&format=jpg`. With the
  Optimizer off the query string is ignored and those serve the 1500px WebP — the format
  [0021](0021-sharing-metadata.md) documents crawlers handling badly — until each card is re-scraped.
  New shares are correct immediately.
- Derivatives are reproducible, so `derived/` can be regenerated wholesale if the convention changes;
  the old objects simply linger, which the additive-only zone tolerates.
- Re-enabling the Optimizer remains a single dashboard toggle if any of this proves wrong.

## Alternatives considered

- **Keep the Optimizer.** Rejected on cost: 89% of the bill, and the convenience it buys is
  reproducible offline in an afternoon from files already on the CDN.
- **Reduce optimizer usage without disabling it.** Rejected as incoherent: the fee is a flat
  subscription, so partial migration costs the same as none.
- **One derivative per exact CSS pixel size** (93/186/320/530/1060/1500). Rejected: ~32,000 objects
  and a re-derive run on every size tweak, to save bytes on a $0.11/month traffic bill.
- **A build-time guard that HEADs every derivative on the CDN.** Rejected: ~12,000 network requests
  per build, and it makes the build fail on a network blip. The committed manifest answers the same
  question offline.
- **Self-hosted image proxy** (imgproxy, Thumbor). Rejected: a server, forbidden by
  [0001](0001-static-no-server.md).
