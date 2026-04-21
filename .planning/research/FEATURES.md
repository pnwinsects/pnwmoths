# Feature Landscape: bunny.net CDN Image Optimizer

**Domain:** Static site (Eleventy) migrating from build-time image resizing to CDN on-the-fly transformation
**Researched:** 2026-04-21
**Confidence:** HIGH (verified against official bunny.net docs at docs.bunny.net)

---

## bunny.net Image Optimizer: Verified URL Parameter Reference

All parameters are query-string appended to the CDN image URL. Transformations execute in
this fixed order: crop first, then resize, then rotate/flip, then color/luminosity, then
filters, and finally format/quality.

### Resize Parameters

| Parameter | Type | Example | Behavior |
|-----------|------|---------|----------|
| `width` | integer (px) | `?width=300` | Resize to width, maintain aspect ratio |
| `height` | integer (px) | `?height=225` | Resize to height, maintain aspect ratio |
| `width` + `height` | both set | `?width=188&height=225` | Bunny picks whichever dimension constrains smaller while preserving aspect ratio — NOT a forced exact-dimension result |

**Critical caveat:** Setting both `width` and `height` does NOT force exact pixel dimensions.
Bunny selects whichever dimension produces the smaller image while preserving aspect ratio.
To get exact output dimensions, use crop parameters instead.

### Crop Parameters

| Parameter | Type | Example | Behavior |
|-----------|------|---------|----------|
| `crop` | `w,h` | `?crop=188,225` | Center-crop to exact pixel dimensions |
| `crop` | `w,h,x,y` | `?crop=188,225,50,0` | Pixel-offset crop, x/y is top-left start |
| `crop_gravity` | string | `?crop=188,225&crop_gravity=north` | Anchor the crop region to a compass direction |
| `aspect_ratio` | `w:h` | `?aspect_ratio=4:5` | Crop to ratio, maintain center |
| `focus_crop` | `w,h,x,y` | `?focus_crop=188,225,500,400` | Crop centered on absolute pixel coordinate |
| `focus_crop` | `w,h,rx,ry` | `?focus_crop=188,225,0.5,0.3` | Crop centered on relative coordinate (0.0-1.0) |
| `face_crop` | dimensions | `?face_crop=188,225` | Detect faces and crop around them |

`crop_gravity` values: `center` (default), `north`, `south`, `east`, `west`, `northeast`,
`northwest`, `southeast`, `southwest`.

**Glossary portrait use case (188x225 exact):**

```
?crop=188,225&crop_gravity=north
```

This produces exact 188x225px output. North bias keeps the moth's head/body in frame for
portrait-oriented specimen photos. Since crop executes before resize, this is the complete
transform needed. The `width`/`height` HTML attributes stay in the `<img>` tag for layout
reservation (prevents CLS); the CDN delivers the byte dimensions to match.

### Format and Quality Parameters

| Parameter | Type | Values | Default | Notes |
|-----------|------|--------|---------|-------|
| `format` | string | `jpeg`, `png`, `webp`, `gif` | original format | Explicit format override |
| `quality` | integer | 0-100 | 85 | Applies to JPEG and WebP; no effect on PNG |
| `auto_optimize` | string | `low`, `medium`, `high` | none | Multi-factor optimization bundle; `high` adds auto-sharpen |

**AVIF is not supported.** bunny.net has explicitly declined AVIF support citing encoding
latency — AVIF encoding ran up to 60 seconds per image and up to 100x slower than WebP in
their testing. WebP is the modern format ceiling for bunny.net. This is an official position,
not a temporary gap (confirmed via bunny.net blog post).

**WebP auto-conversion (pull zone setting, not a URL parameter):** When Bunny Optimizer is
enabled on a pull zone, it transparently serves WebP to any browser sending
`Accept: image/webp`. The URL stays `photo.jpg`; the response `Content-Type` becomes
`image/webp`. Browsers without WebP support receive the original format. The optimizer
automatically enables `Vary: Accept` cache headers so both formats cache correctly at the
edge. No HTML changes are required.

**Consequence for this project:** A plain `<img src="...photo.jpg">` automatically gets
WebP delivery to modern browsers once the pull zone has Optimizer enabled. No `<picture>`
element or `<source type="image/webp">` is needed for format switching.

### Visual Effect Parameters (low priority for this milestone)

| Parameter | Type | Example |
|-----------|------|---------|
| `sharpen` | boolean | `?sharpen=true` |
| `blur` | numeric | `?blur=5` |
| `brightness` | numeric | `?brightness=10` |
| `contrast` | numeric | `?contrast=5` |
| `saturation` | numeric | `?saturation=-20` |
| `hue` | numeric | `?hue=90` |
| `gamma` | numeric | `?gamma=2` |
| `tint` | value | `?tint=...` |
| `sepia` | numeric | `?sepia=75` |
| `flip` | boolean | `?flip=true` (horizontal mirror) |
| `flop` | boolean | `?flop=true` (vertical mirror) |
| `rotate` | 90-degree steps | `?rotate=90` |

### Image Classes (Named Presets)

A pull-zone dashboard feature that defines reusable named transform presets. After defining
`glossary-portrait` in the Bunny dashboard, any URL can reference it:

```
https://yourzone.b-cdn.net/images/glossary/photo.jpg?class=glossary-portrait
```

The pull zone can optionally be locked to only accept class-based transforms, rejecting
ad-hoc query parameters. This improves caching predictability and prevents arbitrary
transforms from being requested via manipulated URLs.

---

## Table Stakes Features

Features required for the migration to function. Missing any of these means the milestone
is incomplete.

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| CDN URL construction in templates | All `<img src>` attributes must point to CDN; local `/images/` path will no longer be served | Low | One `CDN_BASE_URL` env var; string concatenation in Nunjucks filter |
| Width-constrained resize for species photos | Species slideshow and browse nav strip images need appropriate sizes | Low | `?width=N` single parameter |
| Exact-dimension crop for glossary portraits | Glossary images are 188x225px; `width`+`height` alone produces wrong dimensions | Low-Medium | `?crop=188,225&crop_gravity=north` |
| WebP auto-delivery | All modern browsers should get WebP | None (pull zone dashboard setting) | Enable Optimizer on pull zone; no template or code changes |
| Quality baseline | Default quality=85 is fine; explicit `?quality=80` available for thumbnails | Low | Can skip if default is acceptable |
| Refactor `scripts/copy-images.js` | Currently copies species photos from local `images/` dir; that dir will not exist after LFS removal | Medium | Remove species photo copy block; keep banner image, Pico CSS, and OpenSeadragon copies |
| `CDN_BASE_URL` env var in CI/CD | GitHub Actions needs this secret; local dev needs a fallback | Low | Set secret in repo settings; fallback to empty string or localhost for dev |

## Differentiators

Features that add value without blocking the milestone. Include if phase scope allows.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `srcset` with width descriptors | Delivers appropriately sized images to HiDPI screens and narrow viewports | Low-Medium | 2-3 CDN URLs per `<img>`; Nunjucks macro reduces repetition; Lit slideshow JS also needs CDN URLs |
| Image Classes for named presets | Centralize transform definitions in Bunny dashboard; change display sizes without touching templates | Low | Define `nav-thumb`, `glossary-portrait`, `slideshow-full` once; reference by name |
| `auto_optimize=medium` on thumbnails | Bundle of quality improvements with one extra param on browse nav images | Low | Single extra query param appended to nav image URLs |
| `loading="lazy"` on non-hero images | Defers off-screen image loads; valuable for browse page with many thumbnails | Low | Pure HTML attribute; no CDN interaction required |

## Anti-Features

Features to explicitly avoid.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| `<picture>` + `<source type="image/webp">` | Redundant: bunny.net pull zone auto-negotiates WebP via Accept header; doubling up adds HTML bloat for no benefit | Enable Optimizer on pull zone; let CDN handle format negotiation |
| AVIF delivery | Not supported by bunny.net | WebP is the format ceiling; AVIF is out of scope for this CDN |
| Client-side image resizing or Canvas transforms | Defeats CDN purpose; wastes CPU | Request the right size from CDN via URL params |
| `eleventy-img` build-time processing | This plugin generates local responsive variants at build time, the opposite of CDN offloading | Use CDN URL params instead |
| Storing pre-resized image copies in bunny.net Storage | CDN generates and caches transforms on first request; storing variants wastes storage | Upload originals only; let CDN resize on demand |
| Applying `| url` Eleventy filter to CDN URLs | The `| url` filter prepends `pathPrefix` (`/pnwmoths/` on GitHub Pages); CDN URLs are absolute and must never have pathPrefix added | Use raw CDN URLs; the glossary template currently applies `| url` to image paths and that must be removed |

---

## Feature Dependencies

```
CDN_BASE_URL env var in Eleventy config
  -> cdnUrl filter or Nunjucks macro
    -> species.njk <img> tags (CDN URL + ?width=N)
    -> glossary/index.njk <img> tags (CDN URL + ?crop=188,225&crop_gravity=north)
    -> browse/index.njk nav image data passed to Lit component (CDN URLs in JSON)
    -> pnwm-image-slideshow Lit component JS (CDN URL construction in JS)

Bunny Optimizer enabled on pull zone (dashboard)
  -> Automatic WebP delivery (no code changes)
  -> Image Classes available for use

scripts/copy-images.js refactored
  -> Species photo copy block removed (images/ dir no longer exists in repo)
  -> Banner image copy kept (src/images/ -> _site/images/)
  -> Pico CSS and OpenSeadragon copies kept
```

---

## What the Nunjucks Templates Need

### Current pattern (before migration)

```
species.njk:    src="/images/{{ sp.slug }}/{{ img.filename }}"
glossary:       src="{{ ('/images/glossary/' + term.image_filename) | url }}"
```

Two problems with the glossary pattern: it builds a local path, and it applies `| url`
which would prepend `/pnwmoths/` on GitHub Pages — CDN URLs must never have pathPrefix added.

### Recommended pattern: Eleventy filter

Add a `cdnUrl` filter in `eleventy.config.js`. Filters are available in all templates
without import, making them lower friction than Nunjucks macros.

```js
// eleventy.config.js
const CDN_BASE = process.env.CDN_BASE_URL?.replace(/\/$/, '') ?? '';

eleventyConfig.addFilter('cdnUrl', function(filename, slug, params) {
  const path = slug ? `${slug}/${filename}` : filename;
  const url = `${CDN_BASE}/images/${path}`;
  return params ? `${url}?${params}` : url;
});
```

**Usage in templates:**

```nunjucks
{# Species slideshow photo #}
<img src="{{ img.filename | cdnUrl(sp.slug, 'width=800') }}"
     alt="{{ sp.genus }} {{ sp.species }}">

{# Glossary portrait — exact 188x225 crop #}
<img src="{{ term.image_filename | cdnUrl('glossary', 'crop=188,225&crop_gravity=north') }}"
     alt="{{ term.term }}"
     width="188" height="225">
```

The `width`/`height` HTML attributes on glossary images stay to reserve layout space and
prevent CLS. The CDN delivers bytes that match those dimensions.

### srcset pattern (differentiator)

```nunjucks
<img src="{{ img.filename | cdnUrl(sp.slug, 'width=800') }}"
     srcset="{{ img.filename | cdnUrl(sp.slug, 'width=400') }} 400w,
             {{ img.filename | cdnUrl(sp.slug, 'width=800') }} 800w,
             {{ img.filename | cdnUrl(sp.slug, 'width=1600') }} 1600w"
     sizes="(max-width: 600px) 400px, 800px"
     alt="{{ sp.genus }} {{ sp.species }}">
```

This is mechanical but works. A Nunjucks macro that accepts a widths array reduces
repetition if this is added. The Lit `pnwm-image-slideshow` component generates `<img>`
tags in JavaScript — its component code will also need CDN URL construction. Pass
`CDN_BASE_URL` as a component attribute or set `window.CDN_BASE_URL` in a `<script>` tag
in `base.njk`.

### Browse nav images

The `taxon.js` Eleventy data file builds the taxonomy tree with `navImages` arrays. After
migration, the image paths stored in that JSON must be CDN URLs, not local paths. The
Eleventy data file builds this at build time using DuckDB queries. The fix is to prepend
`CDN_BASE_URL` when constructing the `navImages` entries in `taxon.js`.

---

## MVP Recommendation

Required for functional migration (do these):
1. Wire `CDN_BASE_URL` into `eleventy.config.js`; add `cdnUrl` filter
2. Update `species.njk` static `<img>` tags to use `cdnUrl` filter with `?width=800` (or display-appropriate width)
3. Update `glossary/index.njk` to use CDN crop URL; remove `| url` filter from image path
4. Update `taxon.js` data file to emit CDN URLs for `navImages` arrays
5. Refactor `scripts/copy-images.js`: remove species photo copy block; keep banner/asset copies
6. Enable Bunny Optimizer on pull zone in Bunny dashboard (one-time manual step)

Defer if phase scope is tight:
- `srcset` responsive variants: real user value but not blocking; add in a follow-up
- Image Classes in Bunny dashboard: useful once display sizes stabilize
- `auto_optimize=medium` on thumbnails: easy add, not critical

---

## Pricing Context

Bunny Optimizer: $9.50/month per pull zone. Unlimited transformations and requests.
CDN bandwidth charged separately at standard rates. No free tier documented.

---

## Sources

- [Bunny Optimizer Resizing docs](https://docs.bunny.net/docs/resizing) — HIGH confidence
- [Bunny Optimizer Cropping docs](https://docs.bunny.net/docs/cropping) — HIGH confidence
- [Bunny Optimizer Formats docs](https://docs.bunny.net/optimizer/dynamic-images/formats.md) — HIGH confidence
- [Bunny Optimizer Automatic Optimization](https://docs.bunny.net/optimizer/automatic-optimization) — HIGH confidence
- [Bunny Optimizer Dynamic Images Overview](https://docs.bunny.net/optimizer/dynamic-images/overview.md) — HIGH confidence
- [Bunny Optimizer Image Classes](https://docs.bunny.net/optimizer/image-classes.md) — HIGH confidence
- [Bunny Optimizer Pricing](https://docs.bunny.net/optimizer/pricing.md) — HIGH confidence
- [AVIF support blog post](https://bunny.net/blog/lets-talk-avif-and-why-we-are-not-adding-support-just-yet/) — HIGH confidence (official bunny.net)
- [BunnyNet-PHP image processing parameter list](https://toshy.github.io/BunnyNet-PHP/image-processing/) — MEDIUM confidence (third-party, cross-referenced with official docs)

*Feature research for: PNW Moths v1.4 Image CDN milestone*
*Researched: 2026-04-21*
