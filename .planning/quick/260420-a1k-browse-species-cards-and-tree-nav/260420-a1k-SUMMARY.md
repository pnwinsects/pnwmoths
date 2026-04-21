---
quick_id: 260420-a1k
slug: browse-species-cards-and-tree-nav
date: 2026-04-20
status: complete
---

# Summary

## Changes Made

### `src/_data/taxon.js`
- Added `navImage` property to each species object during genus construction
- Uses same sort order as `pickNavImages` (navigational flag first, then weight) to pick the single best image per species

### `src/components/pnwm-taxon-browser.js`
- `_renderImageStrip`: added optional `onImageClick` parameter — when provided, wraps each image in a `<button>` that calls the handler with the `species_slug`
- `_expandToSpecies(speciesSlug)`: new method that searches the tree and opens the family + subfamily (if named) + genus containing the given species slug, using Lit's Set-identity pattern for reactivity
- `_renderFamily` and `_renderSubfamily`: image strips now pass `_expandToSpecies` as the click handler, so clicking any preview image navigates the tree to that species' genus
- `_renderSpecies`: replaced `<ul>` list with a CSS grid of cards (`.pnwm-tb-species-grid`), each card showing the species' best image (if any) at full card width with `aspect-ratio: 376/249`
- `render()`: added a `<style>` block for the species grid — 1-column mobile, 2-column at ≥600px

## Tests
All 13 existing unit tests pass unchanged (tested pure utility functions only).
