# Phase 23: Photo Thumbnail Carousel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 23-photo-thumbnail-carousel
**Areas discussed:** Thumbnail strip appearance, Prev/Next buttons

---

## Thumbnail Strip Appearance

| Option | Description | Selected |
|--------|-------------|----------|
| Square crop, ~64px | Consistent grid — crops to center | |
| Square crop, ~48px | Compact — fits more thumbnails | |
| Natural aspect ratio, fixed height ~56px | No cropping, width varies | |
| Natural aspect ratio, 93px height | Match reference pnwinsects-app | ✓ |

**User's choice:** "Keep height on reference site: 93px."
**Notes:** User specifically referenced the pnwinsects-app as the design reference. 93px is a hard requirement.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Border highlight (2px solid primary) | Clear indicator without obscuring image | ✓ |
| Opacity dim on inactive thumbnails | Active full-opacity; inactive dimmed | |
| You decide | Claude picks style | |

**User's choice:** Border highlight (2px solid primary color)
**Notes:** Standard pattern, clearly communicates active state.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal scroll | Fixed height, overflow with scroll | ✓ |
| Wrap to multiple rows | Thumbnails wrap, takes more vertical space | |
| You decide | Claude picks standard approach | |

**User's choice:** Horizontal scroll
**Notes:** Carousel-like behavior, all photos accessible without layout reflow.

---

## Prev/Next Buttons

| Option | Description | Selected |
|--------|-------------|----------|
| Remove them | Thumbnails are only navigation | |
| Keep them | Buttons step through photos; coexist with thumbnails | |
| You decide | Claude decides based on reference site | |
| Repurpose for strip scrolling | Buttons scroll the thumbnail strip horizontally | ✓ |

**User's choice:** "Buttons are for scrolling the carousel when it overflows the available horizontal space"
**Notes:** Major design decision — buttons are repurposed from main-image navigation to thumbnail-strip scrolling. Direct thumbnail click is the only way to select the main image.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hide when not needed | Appear only when strip overflows | ✓ |
| Always visible | Simpler, no resize detection | |
| You decide | Claude picks standard approach | |

**User's choice:** Hide when not needed
**Notes:** Cleaner UX; requires overflow detection (ResizeObserver or scrollWidth comparison).

---

## Claude's Discretion

- Implementation mechanism for overflow detection (ResizeObserver vs. `scrollWidth > clientWidth`)
- Scroll amount per button click (one thumbnail width or half strip width)
- Smooth vs. instant strip scroll animation
- Whether to remove the index label ("1 of N") — removed, thumbnails make it redundant

## Deferred Ideas

None — discussion stayed within phase scope.
