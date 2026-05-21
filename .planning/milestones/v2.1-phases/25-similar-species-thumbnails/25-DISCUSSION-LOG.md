# Phase 25: Similar Species Thumbnails - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 25-similar-species-thumbnails
**Areas discussed:** Section layout, Thumbnail dimensions, No-image fallback

---

## Section layout

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal thumbnail row | Flex row of thumbnail + name, scrollable. Consistent with photo carousel and reference pnwinsects-app. | ✓ |
| Grid of cards | CSS grid, N columns, thumbnail on top, name below. | |
| List with thumbnail left | Keep `<ul>`, add small thumbnail left of species name. | |

**User's choice:** Horizontal thumbnail row

| Option | Description | Selected |
|--------|-------------|----------|
| Name below thumbnail | Visible text label below each thumbnail. | ✓ |
| Name as alt text only | Thumbnail-only row; name in alt attribute for screen readers. | |

**User's choice:** Name below thumbnail

**Notes:** Row is horizontally scrollable for many entries. The entire entry (thumbnail + name) wraps in a clickable link.

---

## Thumbnail dimensions

| Option | Description | Selected |
|--------|-------------|----------|
| Match reference app | Same as pnwinsects-app similar species section. | ✓ |
| ~80px height | Compact row; fits 5+ species. | |
| ~120px height | Closer to main photo carousel. | |

**User's choice:** 93px height, matching the reference app (which matches the main species image height of 93px — same as Phase 23's photo carousel).

| Option | Description | Selected |
|--------|-------------|----------|
| Natural aspect ratio | Height fixed at 93px, width varies. | ✓ |
| Fixed square 93×93px | Crops all thumbnails to square. | |

**User's choice:** Natural aspect ratio

**Notes:** 93px is explicitly derived from the reference pnwinsects-app, same value confirmed in Phase 23.

---

## No-image fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Omit thumbnail, show name only | Entry appears but no thumbnail area. | |
| Gray placeholder box | Styled empty 93px-height box; row visual rhythm maintained. | ✓ |
| Omit entire entry | Species without images excluded from section. | |

**User's choice:** Gray placeholder box

| Option | Description | Selected |
|--------|-------------|----------|
| Purely visual (no text) | Gray box, no text. Species name link still below. | ✓ |
| "No photo" label | Small text inside placeholder box. | |

**User's choice:** Purely visual — no text in the placeholder.

---

## Claude's Discretion

- Placeholder box color (Pico CSS muted token or similar neutral color fitting the cream background)
- `object-fit: cover` vs `object-fit: contain` for thumbnail `<img>`
- Whether to use `<ul>` with `display: flex` or a `<div>` container
- CSS details: `gap`, `flex-wrap` (no-wrap + scroll preferred), thumbnail entry min/max-width
- Image selection: use first by weight (`images[slug][0]`) — obvious choice, not discussed

## Reviewed Todos (not folded)

- **Fix close button on the lightbox** (2026-04-23) — already resolved in Phase 23 (PHOTO-03), confirmed in Phase 24. No action needed in Phase 25.

## Deferred Ideas

None — discussion stayed within phase scope.
