# 0020. Modal focus is contained with `inert`, not a keydown focus trap

**Status:** Accepted

## Context

The species-photo lightbox in [`pnwm-image-slideshow.ts`](../../src/components/pnwm-image-slideshow.ts)
is a modal overlay. While it is open, keyboard focus must not reach the page behind it.

The launch-time accessibility audit ([#200](https://github.com/pnwinsects/pnwmoths/issues/200)) found
it did not hold. The component walked up the ancestor chain inerting siblings, but stopped one level
short:

```ts
while (node.parentElement && node.parentElement.tagName !== 'BODY') { … }
```

`<body>`'s own children — `<header>`, the partners banner, `<footer>` — were therefore never inerted.
Probing with four Tab presses from the open lightbox landed on the partner-institution links behind
the overlay. Separately, the slideshow *inside* the host stayed reachable, because the ancestor walk
deliberately skips the host itself (inerting it would take the lightbox with it).

Fixing containment then exposed a second problem. `_closeLightbox()` restored focus to the opening
button synchronously, but that button sits inside the now-`inert` slideshow; `focus()` on an element
in an inert subtree is silently ignored, so focus fell back to `<body>` and the keyboard user was
returned to the top of the page.

A code review recommended adding an explicit Tab/Shift+Tab keydown handler cycling focus across the
lightbox's controls, on the grounds that `role="dialog"`/`aria-modal` do not themselves trap focus.

## Decision

Contain focus with `inert` alone:

1. Walk from the host up to **and including** `<body>`'s own children, inerting siblings at each level.
2. Inert the slideshow beneath the overlay declaratively, via `?inert=${this._lightboxOpen}` in
   `render()`, since the ancestor walk cannot inert the host.
3. Mark the overlay `role="dialog"` + `aria-modal="true"` with a label, for AT semantics.
4. Defer focus restore to `updateComplete`, so `inert` has cleared before `focus()` runs.

No keydown-based focus trap.

`inert` removes elements from the tab order at the platform level, which is the same mechanism
`dialog.showModal()` uses. Verified over 14 consecutive Tab presses with the lightbox open: the only
reachable stops are the four lightbox controls plus `<body>` as the cycle point. No page content is
reachable, in either direction.

## Consequences

- Containment is enforced by the platform, so it covers focusable elements we do not enumerate —
  OpenSeadragon injects its own `tabindex="0"` canvas into the overlay at runtime, and it is handled
  without the component knowing about it. A hand-written trap would need updating whenever the
  overlay's contents change.
- Focus passes through `<body>` once per cycle before returning to the overlay. This is normal for
  inert-based modals (`dialog.showModal()` behaves the same way) and is not an escape.
- **Any focus restore after un-inerting must be deferred a frame.** This is the non-obvious part and
  the easiest thing to reintroduce; it is covered by tests in
  [`pnwm-image-slideshow.test.ts`](../../src/components/pnwm-image-slideshow.test.ts).
- `inert` requires a reasonably modern browser. It is unprefixed in all current evergreen browsers,
  and the failure mode without it is degraded containment, not a broken page.

## Alternatives rejected

**Keydown Tab/Shift+Tab focus trap.** Requires enumerating the overlay's focusable descendants and
cycling them manually. It would duplicate a cycle the platform already enforces here, and it goes
stale whenever overlay contents change — concretely, it would have to special-case the
OpenSeadragon canvas. Rejected because the empirical evidence shows containment already holds; the
premise that Tab can leave the modal is not true for this implementation.

**Native `<dialog>` + `showModal()`.** The idiomatic choice and it would remove the manual walk
entirely. Not adopted now because the overlay renders inside a Lit shadow root alongside the
slideshow, and moving to `<dialog>` changes stacking/backdrop handling and the OpenSeadragon mount
point. Worth revisiting if the lightbox is reworked — it would make this ADR obsolete rather than
wrong.
