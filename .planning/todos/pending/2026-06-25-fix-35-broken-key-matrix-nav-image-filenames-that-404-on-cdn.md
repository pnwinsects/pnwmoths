---
created: 2026-06-25T19:13:06.665Z
title: Fix 35 key-matrix nav_image filenames that 404 on the CDN
area: tooling
files:
  - scripts/build-key.ts
  - data/key-matrix.json
  - src/components/key-results-grid.ts
---

## Problem

35 of 1,190 `nav_image` values in `data/key-matrix.json` do not resolve on the CDN
(`https://pnwmoths.b-cdn.net/<slug>/<nav_image>`), so the Identify results grid
(Phase 42) renders ~35 broken `<img>` thumbnails. Discovered during Phase 42 browser UAT.

Root cause is a filename-convention mismatch in the key-matrix data, NOT the grid
component (the grid correctly emits an `<img>` for any non-null `nav_image`). The 1,140
working entries use a space convention (e.g. `Habrosyne scripta-A-D.jpg`); the 35 broken
entries use underscores and sometimes a different genus spelling, e.g.:

- slug `eudeilinia-herminiata` → `Eudeilinea_herminiata-A-D.jpg` (note Eudeilinea vs Eudeilinia)
- slug `sphinx-luscitiosa`     → `Sphinx_luscitiosa-A-D.jpg`
- slug `smerinthus-cerisyi`    → `Smerinthus_cerisyi-B-D.jpg`

For at least `sphinx-luscitiosa`, neither the underscore nor the space variant resolves on
the CDN — so it is not a simple underscore→space swap; the actual CDN filename must be
looked up per species.

## Solution

TBD. Two layers:

1. **Data fix (proper, owns the bug):** in `scripts/build-key.ts`, normalize the emitted
   `nav_image` to the CDN's real filenames for these 35 species (reconcile genus spelling +
   underscore/space convention against what actually exists on the CDN, or against the
   working nav_image values used by the Browse pipeline / `build-data.ts`). Regenerate
   `data/key-matrix.json`. Add a build-time check that every emitted `nav_image` resolves
   (or matches the Browse data's nav image for the same slug).

2. **Optional grid hardening (Phase 42, satisfies SC3 literally):** add an
   `<img onerror>` → swap to the gray `.similar-species-placeholder` in
   `src/components/key-results-grid.ts`, so a bad/missing CDN file degrades to the
   placeholder instead of a broken image icon. Defensive; the Browse page
   (`pnwm-taxon-browser.ts`) does not currently do this either.
