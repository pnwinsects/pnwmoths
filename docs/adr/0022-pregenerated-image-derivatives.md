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

```text
Habrosyne scripta-A-D.jpg  Accept: */*                 → image/jpeg  118,963 B
Habrosyne scripta-A-D.jpg  Accept: image/webp,avif     → image/webp   85,042 B
```

Disabling the Optimizer reverts all ~4,000 legacy JPEGs to their stored form, ~28% larger. No
template names this behaviour, so it is the dependency most likely to be missed.

A three-day access-log audit ([#222](https://github.com/pnwinsects/pnwmoths/issues/222),
`scripts/audit-optimizer-usage.ts`) confirmed the five call sites are the complete set — and turned
up one pattern nothing in the codebase emits, `?width=1200&amp` at 867 requests across 867 distinct
files. That is the share-card URL with its `&` read as the literal HTML entity: the markup escapes
it correctly as `&amp;`, but crawlers that fail to decode it request a query string where
`format=jpg` is lost, and Bunny answers in WebP.

```text
?width=1200&format=jpg       → image/jpeg  174,168 B   (intended)
?width=1200&amp;format=jpg   → image/webp  140,024 B   (what crawlers get)
```

WebP is exactly the format [0021](0021-sharing-metadata.md) calls "not cosmetic" to avoid, on the
branch covering 1,155 of 1,253 species pages. So the share-preview path has a live defect today,
one that exists only because the URL needs a query string at all.

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
   | Glossary illustration | `@188x225.webp`, `@376x450.webp` (fit within box, no crop) |
   | Plate thumbnail (`plates/{slug}/thumbnail.jpg`) | `@240x300.webp` |

   **23,436 objects, ~2 GB** — 4,034 legacy photos ×2, 3,811 high-res thumbnails ×4, 13 glossary
   illustrations ×2, 98 plate thumbnails ×1. (The 1500px hero slot needs no derivative: it *is* the
   stored `_thumbnail.webp`.)

   The plate variant is a **re-encode, not a resize**: the stored thumbnail is already 240×300, the
   exact size the grid displays. It was added late, during the #227 cutover sweep, because it is the
   one place the Optimizer was doing real work that nothing else replaced — see the Consequences
   below.
   At Bunny's storage rate that is a couple of cents a month, so the size does not change the
   decision — but it is twice the count this record first estimated.

3. **One shared URL helper** owns the naming convention. The five call sites that build optimizer
   URLs today — `src/species/species.njk`, `src/components/pnwm-taxon-browser.ts`,
   `src/components/key-results-grid.ts`, `src/glossary/index.njk`, `src/_lib/social-meta.ts` — all
   route through it. Five hand-built URL patterns is how a variant silently stops existing.

4. **A committed derivative manifest + build-time guard.** `scripts/upload-derivatives.ts` writes
   `data/image-derivatives.csv` from its *uploaded* rows, so the file records what is on the CDN
   rather than what exists on a laptop. `scripts/check-derivatives.ts` then runs two gates against
   it, offline — reading the manifest rather than issuing ~23,000 HEAD requests keeps the check
   fast and reproducible ([0017](0017-reproducible-committed-artifacts.md)):

   - **Emitted gate** — every `derived/` URL in the built HTML must be a manifest row. Catches a
     template asking for a variant nobody generates.
   - **Source gate** — every source image a built page can reach must have its *whole* variant set
     in the manifest. Catches a photo that was uploaded but never derived, which the emitted gate
     cannot see: `pnwm-taxon-browser` and `key-results-grid` assemble their thumbnail URLs in the
     browser, so those URLs are never in the HTML at all.

   The source gate is scoped to species that actually build — same withheld-family and
   unpublished-species gates as `src/_data/species.ts`. That scoping is load-bearing, not a
   convenience: `data/images.csv` carries 83 rows for 27 Geometridae whose files are simply absent
   from the CDN ([#232](https://github.com/pnwinsects/pnwmoths/issues/232)). Geometridae is withheld,
   so no page renders them and an unscoped gate would fail every build over images nobody can see.
   Scope is derived from `data/species.csv` rather than read back out of `_site/`, which Eleventy
   does not clean between builds — a stale directory would silently widen it.

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
- **The entity-mangling defect disappears rather than being patched.** A static `@1200.jpg` carries
  no query string, so there is no `&` to escape and nothing for a crawler to misread. This is the
  rare case where the cheaper option is also the more correct one, and it is worth more than the
  $114/year: it fixes share previews on the 1,155 species pages [0021](0021-sharing-metadata.md)
  identified as at risk.
- `og:image` URLs already scraped by Facebook/X/Slack point at `?width=1200&format=jpg`. With the
  Optimizer off the query string is ignored and those serve the 1500px WebP — the format
  [0021](0021-sharing-metadata.md) documents crawlers handling badly — until each card is re-scraped.
  New shares are correct immediately. Note the mis-parsing crawlers are *already* getting WebP, so
  for them this is not a regression.
- **`crop_gravity=north` in the glossary template is dead and always has been.** On this pull zone
  Bunny returns byte-identical output for gravity `north`, `south` and absent (verified by MD5): with
  both dimensions given it fits within the box and never upscales — plain `contain`, no cropping. So
  the glossary derivative is an ordinary bounded resize, and this record's original claim that it was
  "the single non-trivial transform" was wrong. The dead parameter should come out of the template
  along with the rest ([#225](https://github.com/pnwinsects/pnwmoths/issues/225)).
- **The `/plates/` index was the one real regression, and it was only found by measuring.** A full
  HEAD sweep of all 26,829 image objects against an Optimizer-disabled staging pull zone
  (`scripts/verify-cdn-cutover.ts`) returned 200 with the correct content type for every one — no
  missing objects anywhere. But the accompanying negotiation probe showed plate thumbnails dropping
  from ~12 KB to ~54 KB, because those stored JPEGs are encoded at roughly one byte per pixel and
  auto-WebP had been quietly rescuing them. Measured across all 98: **1,283 KB → 5,327 KB** on a
  single page. Adding the `plates` variant brings it to **1,097 KB**, better than the Optimizer
  managed. Nothing in CI would have caught this — `check-page-weight.ts` measures HTML, not images.
- **Species DZI tiles and plate Zoomify tiles are unaffected**, which is worth recording because it
  is not obvious. Species tiles are stored `.webp` already and came back byte-identical across both
  origins; plate tiles are `.jpg`, but at 256px the Optimizer's WebP conversion saved only ~1%
  (10,660 B → 10,548 B). The runtime tile fetches were the largest unknown going in, and they turned
  out to be a non-event.
- Every variant was verified against what the Optimizer serves today: identical pixel dimensions
  across all seven, including Bunny's own rounding (`width=376` yields 375). At `Q=80` the
  pre-generated files run **10–40% smaller** than the Optimizer's output, so the cutover is a modest
  bandwidth improvement rather than a cost.
- Derivatives are reproducible, so `derived/` can be regenerated wholesale if the convention changes;
  the old objects simply linger, which the additive-only zone tolerates.
- **Lifting the Geometridae embargo now fails the build**, naming the 83 absent source images. That
  is the intended behaviour rather than a trap: publishing those 27 pages today would publish broken
  `<img>` tags, and the guard is the first thing in the project that would say so — `lychee.toml`
  excludes image extensions, so CI has never verified an image URL
  ([#232](https://github.com/pnwinsects/pnwmoths/issues/232)).
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
