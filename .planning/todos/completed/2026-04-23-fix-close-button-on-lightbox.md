---
created: 2026-04-23T00:00:00Z
title: Fix close button on the lightbox
area: ui
files: []
resolves_phase: 23
---

## Problem

The close button on the lightbox is not working correctly. No additional context was captured at time of logging — investigate the lightbox component to determine the specific failure mode (missing click handler, z-index issue, focus trap, etc.).

## Solution

TBD — inspect the lightbox component and close button behavior.

## Resolution (2026-06-10)

Investigated against the current `src/components/pnwm-image-slideshow.ts` (the
lightbox was rewritten from the original phase-23 carousel into this Lit
component during the v3.0 TS migration, phase 37). Drove the live component in
a browser (served `_site`, species page `macaria-sexmaculata`) and verified all
four close paths work:

- Close button (`.lightbox-close` → `_closeLightbox()`) → lightbox removed from DOM
- Escape key → closes
- Backdrop click (target === currentTarget) → closes
- Focus-trap `inert` applied on open (3 ancestors' siblings) and fully removed on close (0 stray `[inert]`)

The original failure was on the old carousel implementation, which no longer
exists. The close button works correctly in the current component. Added
regression tests (`_closeLightbox`, `_handleKeydown` Escape) in
`src/components/pnwm-image-slideshow.test.ts` so the close logic can't silently
regress. Status: resolved (no production code change needed).
