# 0049. Vite builds the client entries, not the pages; Eleventy loads them from Vite's manifest

**Status:** Accepted · Refs [#364](https://github.com/pnwinsects/pnwmoths/pull/364) · Amends [ADR 0003](0003-eleventy-ssg.md)

## Context

Since the start, `@11ty/eleventy-plugin-vite` had run Vite over Eleventy's output. It renamed
`_site/` to `.11ty-vite/`, gave Vite **every HTML page as an entry**, and let Vite rebuild
`_site/` from them. Vite bundled each page's scripts and stylesheets, hashed the assets they
referenced, and rewrote `public/` URLs with the path prefix.

That made build cost scale with the page count, which grows with every species. It has failed
four times:

- **#187, `EMFILE`:** the shared layout's 15 images, read once per page, meant ~20,000
  concurrent `open()` calls. Fixed by moving them into `public/`, which Vite short-circuits.
- **#155, `EISDIR`:** Vite treats every `<link href>` as a local asset, so a canonical link to
  a directory-style URL crashed the build. Fixed with `vite-ignore` on that tag.
- **#395, ~1,370 identical chunks:** one inline module in the layout became an entry per page.
  Fixed by moving it into `main.ts`.
- **#364, out of memory:** vite 8.3 needs more than CI's ~4 GB default heap for ~1,390 entries.
  8.2.1 fits in 2 GB. The 8.3 line roughly doubles memory and build time, and 8.3.3 still
  fails. Moving the inline module out (#395) didn't change this: the cost tracks the pages,
  not the chunks.

The plugin also **discarded every Eleventy passthrough copy** when it rebuilt `_site/`. Four
copy scripts exist to put things back.

## Decision

**Vite builds only the client entries; it never sees a page.**

- `vite.config.ts` builds the entries in `VITE_ENTRIES` (`src/_lib/vite-entries.ts`):
  `main` (the components), `legacy-redirect` (`/redirect.html`'s script) and `site` (Pico plus
  `theme.css`). It writes hashed files and `build.manifest` to `.vite-build/`. `base` is the
  same `pathPrefix` Eleventy uses, defined once in `vite-entries.ts`.
- `npm run build:vite` runs before `build:eleventy`. Eleventy passthrough-copies
  `.vite-build/assets/` to `_site/assets/`.
- Pages load entries with **`{% viteEntry "src/…" %}`**. It looks the entry up in the manifest
  and writes the stylesheet links, modulepreloads and module script, prefixed. An entry
  missing from the manifest fails the build.
- **`public/`** is an Eleventy passthrough to the site root, and its references use `| url`
  like any other link.
- Template values a page script needs go in `data-` attributes or a JSON block, never into
  script source. Inline modules are no longer built at all.
- `npm run dev` runs `scripts/dev.ts`: one `vite build`, then `vite build --watch` beside
  `eleventy --serve`. Eleventy watches the manifest.
- The plugin, its type declaration and its workarounds (`vite-ignore`, the publicDir
  constraints, the Pico and theme copies) are removed.

## Consequences

Measured under Node 24 with `--max-old-space-size=4096`, as on CI:

| | Vite step | `build:site` | vite 8.3 at 4 GB |
|---|---|---|---|
| plugin (before) | ~17 s | — | ❌ out of memory |
| entries (after) | **~1.6 s** | 43 s | ✅ 8.3.0 and 8.3.3: ~1 s, `build:site` passes |

- **What the site serves is unchanged**, except for the deliberate differences below. A
  normalized comparison of all 1,390 pages against a `main` build differed only in the asset
  tags, the removed inline scripts and comments, `vite-ignore`, and the About-page image URLs.
  No file `main` publishes is missing.
- **Removing the plugin exposed a leak it had been hiding.** `eleventy.config.ts` held an
  ungated passthrough of `data/parquet/` → `species/`. With nothing discarding it, it
  published 121 withheld species' occurrence data, and `check-withheld` failed the build.
  The passthrough is removed. `copy-parquet.ts`, which is gated (#275), is the only publisher,
  and dev mode now runs it too.
- **About-page images are no longer content-hashed.** They publish at their source paths,
  e.g. `/about/images/images/plateGuideImage1.jpg`. Under the CDN's long image cache
  ([ADR 0009](0009-bunny-cache-policy.md)), editing one in place would serve the old version
  until it expires. Give an edited image a new name.
- Component tests got Node's types only through the plugin's declaration importing vite's.
  `tsconfig.browser.json` now names `node` explicitly.
- Upgrading vite is a normal dependency bump again: #364 (vite 8.3) builds within the 4 GB
  heap on this arrangement.

## Alternatives considered

- **Raise CI's heap** (`NODE_OPTIONS=--max-old-space-size=6144`). Rejected: it pays the 8.3
  regression on every build (~2× slower) and leaves the page-count scaling in place for the
  next failure.
- **Stay on vite 8.2.x and report the regression.** Viable in the short term, but it pins a
  core build tool to an old line indefinitely, for a cost we impose on ourselves.
- **Keep the plugin and shrink its input** (e.g. `vite-ignore` on more tags, or fewer pages
  through Vite). Rejected: it would still be the same arrangement, with more workarounds
  piled on.
