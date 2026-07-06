# 0003. Eleventy as the static site generator

**Status:** Accepted

## Context

Given flat-file source data ([0002](0002-flat-files-over-cms.md)) and a static-only target
([0001](0001-static-no-server.md)), the site needs a generator that can turn CSV/Markdown into
~700+ species pages plus the browse, identify, search, and glossary pages. The generator has to
handle first-class data files (loading and reshaping CSV at build time) and pagination (one
template producing hundreds of pages), and it needs to be legible to a JS-oriented maintainer.

## Decision

Use **Eleventy 3.x** as the SSG. A single pagination template renders every species factsheet
from the joined data; Eleventy data files (`src/_data/`) load and shape the CSV-derived data
into the taxonomy tree and per-page context. Vite bundles the client-side JavaScript for the
interactive components.

## Consequences

- Eleventy's data cascade and `pagination` feature map cleanly onto "one template, ~700 pages,"
  which is the core generation task.
- It lives in the **JS ecosystem** the rest of the pipeline uses (Node, Vite, Lit, TypeScript),
  so there is one toolchain and no context-switch — this was the deciding factor.
- Integration seams to be aware of: `eleventy-plugin-vite` rewrites the output dir during build,
  so Parquet and image copies run *after* Eleventy via `scripts/copy-images.ts` / a copy-parquet
  step; and asset paths interact with `pathPrefix` (see [0008](0008-deploy-bunny-additive.md)).

## Alternatives considered

- **Hugo** — rejected: fast, but Go templating and a non-JS ecosystem would split the toolchain
  and make the data-shaping and client-component story more awkward.
- **Astro** — rejected: heavier and more framework-opinionated than needed for a
  mostly-static, no-JS-degrading catalog; Eleventy's thinner surface fit the low-maintenance goal.
