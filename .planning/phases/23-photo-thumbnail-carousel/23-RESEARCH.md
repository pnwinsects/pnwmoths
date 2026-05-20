# Phase 23: Photo Thumbnail Carousel — Research

**Researched:** 2026-05-20
**Domain:** Lit web component modification — thumbnail strip navigation, ResizeObserver overflow detection, lightbox close button bug fix
**Confidence:** HIGH

---

## Summary

This phase is a focused modification of a single file: `src/components/pnwm-image-slideshow.js`. No new packages are required. The work has three distinct sub-problems: (1) replace dot navigation with a scrollable thumbnail strip, (2) repurpose prev/next buttons to scroll the strip and hide them when it does not overflow, and (3) fix the lightbox close button bug.

The lightbox close button bug (PHOTO-03) has been diagnosed via code inspection: `@click=${this._closeLightbox}` passes an unbound method reference to Lit's event system. When the DOM event fires, `this` inside `_closeLightbox` is not the component instance, so `this._lightboxOpen = false` fails silently (no error in non-strict mode, or throws in strict mode). The fix is to use an arrow function wrapper: `@click=${() => this._closeLightbox()}`. The backdrop click already uses an arrow function and works correctly.

The thumbnail strip design is fully specified by CONTEXT.md and the UI-SPEC. The ResizeObserver pattern for overflow detection follows Lit's `firstUpdated()` lifecycle hook, with cleanup in `disconnectedCallback()`. No alternatives need to be evaluated — all design decisions are locked.

**Primary recommendation:** Implement all changes in `pnwm-image-slideshow.js` in a single wave. Fix the close button bug first (lowest-risk, one-line change), then replace the multi-image render branch with the thumbnail strip.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Thumbnail height: 93px, natural aspect ratio (no square cropping). Matches the reference pnwinsects-app.
- D-02: Active thumbnail indicator: 2px solid primary color border (`var(--pico-primary)`). No opacity dimming.
- D-03: Overflow behavior: horizontal scroll. The strip does not wrap to multiple rows.
- D-04: Dots (`<div class="dots">`) and dot elements (`<span class="dot">`) are removed entirely. The thumbnail strip is the only photo navigation.
- D-05: The index label ("1 of N") is removed — thumbnails make it redundant.
- D-06: The ‹/› buttons scroll the thumbnail strip left/right; they no longer navigate the main image. Direct thumbnail click is the only way to select a photo as the main image.
- D-07: The ‹/› buttons hide when the strip does not overflow the available width.

### Claude's Discretion
- Whether to use ResizeObserver or a simpler `scrollWidth > clientWidth` check to detect overflow for button visibility.
- Thumbnail strip scroll amount per button click (e.g., scroll by one thumbnail width, or by half the strip width).
- Smooth vs. instant scroll animation for the strip buttons (`scroll-behavior: smooth` is sufficient).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHOTO-01 | User sees a thumbnail strip below the main species image; clicking any thumbnail selects it as the main displayed image | Thumbnail strip renders from `this._images[]` already parsed in `connectedCallback()`; `_currentIndex` reactive state drives main image and active border |
| PHOTO-02 | Thumbnail strip replaces dot navigation for multi-image species (dots removed) | `.dots` div and `.dot` spans removed from render(); `.dot`/`.dot.active` CSS rules removed |
| PHOTO-03 | User can close the lightbox via the close button (fix carry-forward bug) | Bug diagnosed: unbound method in `@click=${this._closeLightbox}` — fix with arrow wrapper `@click=${() => this._closeLightbox()}` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Thumbnail strip render | Browser / Client (shadow DOM) | — | All rendering is inside the Lit component's shadow root |
| Active thumbnail state | Browser / Client (reactive state) | — | `_currentIndex` is already a reactive property; derives active border in render() |
| Overflow detection | Browser / Client (ResizeObserver) | — | DOM measurement must happen client-side after render |
| Strip scrolling | Browser / Client (imperative DOM) | — | `this.shadowRoot.querySelector('.thumbnail-strip').scrollBy()` called from event handlers |
| Lightbox close bug fix | Browser / Client (Lit template binding) | — | Fix is an event handler binding correction in render() |

---

## Standard Stack

### Core (no new packages)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| lit | 3.3.2 (installed) / 3.3.3 (latest) | LitElement base class, html/css template tags, reactive properties | Already in project [VERIFIED: npm registry] |

No new packages are introduced in this phase. All implementation uses browser-native APIs (ResizeObserver, scrollBy, scrollIntoView) and the existing Lit dependency.

### Browser APIs Used

| API | MDN Baseline | Purpose |
|-----|-------------|---------|
| `ResizeObserver` | Widely available | Detect when strip width changes so button visibility can update reactively |
| `Element.scrollBy()` | Widely available | Scroll the strip container on button click |
| `Element.scrollIntoView({ inline: 'nearest' })` | Widely available | Auto-scroll active thumbnail into view when `_currentIndex` changes |
| `::-webkit-scrollbar { display: none }` + `scrollbar-width: none` | Widely available | Hide scrollbar on the strip container |

---

## Package Legitimacy Audit

No new packages are installed in this phase. Audit not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
[species.njk template]
  └── <pnwm-image-slideshow> (light DOM figures as children)
        │
        └── [shadow DOM - pnwm-image-slideshow.js]
              │
              ├── connectedCallback() → parse light DOM figures → this._images[]
              │
              ├── render() (reactive: _currentIndex, _lightboxOpen, _stripOverflows)
              │     ├── [single image path] → main image + captions (unchanged)
              │     └── [multi image path] → main image + captions
              │           ├── .thumbnail-strip (role=tablist)
              │           │     └── .thumbnail buttons (role=tab, aria-selected)
              │           └── .controls (‹ › buttons, hidden when !_stripOverflows)
              │
              ├── firstUpdated() → set up ResizeObserver on .thumbnail-strip
              │     └── ResizeObserver callback → compare scrollWidth vs clientWidth
              │           → set _stripOverflows → triggers re-render
              │
              ├── updated() → when _currentIndex changes, scrollIntoView on active thumb
              │
              ├── _openLightbox() / _closeLightbox() → _lightboxOpen reactive state
              │     └── inert on <main> for accessibility
              │
              └── .lightbox (position:fixed overlay, rendered when _lightboxOpen)
                    ├── main image (full size)
                    └── .lightbox-close button → () => this._closeLightbox()
```

### Recommended Project Structure

No structural changes needed. Single file modification:

```
src/components/
└── pnwm-image-slideshow.js   ← only file changed
```

### Pattern 1: ResizeObserver for Overflow Detection in Lit

**What:** Set up a ResizeObserver in `firstUpdated()` to compare `scrollWidth` vs `clientWidth` on the thumbnail strip and update `_stripOverflows` reactive state.

**When to use:** Whenever a DOM element's overflow state must drive reactive rendering in a Lit component.

**Example:**
```javascript
// Source: https://lit.dev/docs/components/lifecycle/ (firstUpdated pattern)
// Lit recommends firstUpdated() for one-time post-render DOM observation setup

static properties = {
  _stripOverflows: { state: true },
};

constructor() {
  super();
  this._stripOverflows = false;
  this._resizeObserver = null;
}

firstUpdated() {
  const strip = this.shadowRoot.querySelector('.thumbnail-strip');
  if (!strip) return;
  this._resizeObserver = new ResizeObserver(() => {
    const overflows = strip.scrollWidth > strip.clientWidth;
    if (overflows !== this._stripOverflows) {
      this._stripOverflows = overflows;
    }
  });
  this._resizeObserver.observe(strip);
}

disconnectedCallback() {
  super.disconnectedCallback();
  this._resizeObserver?.disconnect();
  // ... existing cleanup
}
```

**Note on alternative (simpler approach):** A plain `scrollWidth > clientWidth` check can also be done in `updated()` after each render, but ResizeObserver is preferred because it fires when the container resizes (e.g., viewport resize) without needing a separate window resize listener. [CITED: https://lit.dev/docs/components/lifecycle/]

### Pattern 2: Scrolling Active Thumbnail into View

**What:** After `_currentIndex` changes, scroll the newly-active thumbnail into the visible strip area.

**When to use:** In `updated()`, which receives a `changedProperties` Map.

**Example:**
```javascript
updated(changedProperties) {
  if (changedProperties.has('_currentIndex')) {
    const activeThumb = this.shadowRoot.querySelector('.thumbnail[aria-selected="true"]');
    activeThumb?.scrollIntoView({ inline: 'nearest', behavior: 'smooth', block: 'nearest' });
  }
}
```

**Note:** `block: 'nearest'` prevents the page from scrolling vertically when the thumbnail scrolls horizontally. [ASSUMED — standard browser API behavior, not verified via official doc]

### Pattern 3: Fixed Lightbox Close Button Bug

**What:** `@click=${this._closeLightbox}` passes an unbound method reference. When the browser invokes it as an event listener, `this` is not the component instance.

**Root cause (code inspection):** In the constructor, only `_handleKeydown` is explicitly bound: `this._handleKeydown = this._handleKeydown.bind(this)`. `_closeLightbox` is not bound. Lit's `@click=${expr}` evaluates `expr` at template render time — `this._closeLightbox` is a method reference without a bound context. When the event fires, the browser invokes it without `this`.

**Fix:** Wrap in an arrow function (consistent with how the backdrop handler works):
```javascript
// Before (broken):
@click=${this._closeLightbox}

// After (fixed) — arrow function captures `this` lexically:
@click=${() => this._closeLightbox()}
```

**Confidence:** HIGH — diagnosed from direct code inspection. [VERIFIED: codebase inspection]

### Pattern 4: Thumbnail Strip Rendering

**What:** Replace the `dots` + `index-label` in the multi-image render branch with a `thumbnail-strip` tablist.

**Example:**
```javascript
// thumbnail strip replacing dots in render()
const thumbnails = this._images.map((img, i) => html`
  <button
    class="thumbnail"
    role="tab"
    aria-selected=${i === this._currentIndex ? 'true' : 'false'}
    aria-label=${`Photo ${i + 1} of ${this._images.length}: ${img.alt}`}
    @click=${() => { this._currentIndex = i; }}
  >
    <img src=${img.src} alt="" height="93">
  </button>
`);

// Controls section (replaces dots + index-label):
html`
  <div
    class="thumbnail-strip"
    role="tablist"
    aria-label="Photo thumbnails"
  >${thumbnails}</div>
  <div class="controls">
    <button
      aria-label="Scroll thumbnails left"
      style=${this._stripOverflows ? '' : 'display:none'}
      @click=${this._scrollLeft}
    >&#x2039;</button>
    <button
      aria-label="Scroll thumbnails right"
      style=${this._stripOverflows ? '' : 'display:none'}
      @click=${this._scrollRight}
    >&#x203a;</button>
  </div>
`
```

**Note on button visibility:** The UI-SPEC specifies `display: none` for hidden buttons (D-07). Using Lit's conditional style binding or the `hidden` attribute achieves this. Prefer inline style or a CSS class toggled via `_stripOverflows`. [CITED: 23-UI-SPEC.md]

### Pattern 5: Strip Scroll Methods

**What:** Repurpose `_prev()` / `_next()` (or add new `_scrollLeft()` / `_scrollRight()`) to scroll the strip by half its client width.

**Example:**
```javascript
_scrollLeft() {
  const strip = this.shadowRoot.querySelector('.thumbnail-strip');
  strip?.scrollBy({ left: -(strip.clientWidth / 2), behavior: 'smooth' });
}

_scrollRight() {
  const strip = this.shadowRoot.querySelector('.thumbnail-strip');
  strip?.scrollBy({ left: strip.clientWidth / 2, behavior: 'smooth' });
}
```

**Note:** The `scroll-behavior: smooth` on the strip container is an alternative to the `behavior: 'smooth'` in `scrollBy()` options. Either works. [ASSUMED — standard browser API]

### CSS Additions for Thumbnail Strip

```css
/* Source: 23-UI-SPEC.md Component Inventory */
.thumbnail-strip {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
}

.thumbnail-strip::-webkit-scrollbar {
  display: none;
}

.thumbnail {
  flex-shrink: 0;
  height: 93px;
  width: auto;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  background: none;
}

.thumbnail.active,
.thumbnail[aria-selected="true"] {
  border-color: var(--pico-primary);
}

.thumbnail img {
  height: 93px;
  width: auto;
  display: block;
}
```

### Anti-Patterns to Avoid

- **Hardcoding `_closeLightbox` without bind or arrow wrapper:** The bug is already in the codebase — don't replicate it for new handlers.
- **Using `this.querySelector()` instead of `this.shadowRoot.querySelector()`:** Shadow DOM elements are not accessible from the host element's querySelector. [CITED: https://lit.dev/docs/components/shadow-dom/]
- **Observing the host element (`this`) with ResizeObserver instead of the strip element:** The strip's overflow is what matters; the host element's size change does not directly imply strip overflow change.
- **Setting `_stripOverflows` unconditionally in ResizeObserver callback:** Always check if the value changed before setting — unnecessary reactive updates cause re-renders and make the `updated()` scroll logic re-fire. [VERIFIED: codebase inspection — pattern follows existing reactive state management]
- **Forgetting `block: 'nearest'` in `scrollIntoView`:** Without it, switching thumbnails will also scroll the page vertically to keep the strip in view, which is jarring.
- **Removing `_prev()` / `_next()` from class without re-adding scroll methods:** The render() multi-image branch currently calls `@click=${this._prev}` and `@click=${this._next}`. These references must be replaced or the methods repurposed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Overflow detection | Custom window resize listener | ResizeObserver | ResizeObserver fires on element resize, not just window resize; handles flex/grid layout changes automatically |
| Horizontal scrolling | Custom drag/touch handlers | Native CSS `overflow-x: auto` | Browser handles touch scrolling, momentum, and accessibility natively |
| Active thumbnail scrolling | Custom scroll calculation | `scrollIntoView({ inline: 'nearest' })` | Browser computes correct scroll delta; handles RTL layouts automatically |
| Lightbox position | Teleporting to `<body>` | `position: fixed` inside shadow DOM | For this component the simpler fix (binding the close handler) is sufficient — full teleport adds complexity without benefit |

**Key insight:** This phase has no genuinely complex algorithmic problems. All the hard scroll/layout work is handled by browser-native APIs. The implementation difficulty is primarily in wiring Lit's reactive lifecycle correctly.

---

## Common Pitfalls

### Pitfall 1: Unbound Event Handlers in Lit Templates

**What goes wrong:** `@click=${this.someMethod}` passes the method without `this` binding. The method runs with `this` as the event target element, not the component. Property assignments like `this._lightboxOpen = false` silently do nothing (set a property on the DOM element).

**Why it happens:** JavaScript class methods are not auto-bound. Lit evaluates the event handler expression at template render time, but the function is invoked later by the DOM event system without a `this` context.

**How to avoid:** Use arrow functions in templates: `@click=${() => this.someMethod()}`. Alternatively, bind in the constructor: `this.someMethod = this.someMethod.bind(this)`.

**Warning signs:** Handler fires (you can see it in DevTools event listener list) but nothing happens — reactive state does not change.

### Pitfall 2: ResizeObserver Setup Timing

**What goes wrong:** Setting up ResizeObserver in `connectedCallback()` before Lit has rendered the shadow DOM — `.thumbnail-strip` does not exist yet, `querySelector` returns null.

**Why it happens:** `connectedCallback()` fires before the first render. Shadow DOM elements are created during render, not during connection.

**How to avoid:** Use `firstUpdated()` for one-time DOM observation setup. This is called after the first render. [CITED: https://lit.dev/docs/components/lifecycle/]

**Warning signs:** `this.shadowRoot.querySelector('.thumbnail-strip')` returns null; ResizeObserver observes nothing; `_stripOverflows` stays false permanently.

### Pitfall 3: Infinite Re-render Loop from ResizeObserver

**What goes wrong:** ResizeObserver callback sets `_stripOverflows` → triggers Lit re-render → re-render changes DOM → ResizeObserver fires again → loop.

**Why it happens:** If the re-render changes the strip's scrollWidth or clientWidth (e.g., by showing/hiding buttons that affect layout), the observer fires again.

**How to avoid:** Guard the state update: only set `_stripOverflows` if the value actually changes. `if (overflows !== this._stripOverflows) { this._stripOverflows = overflows; }`. Also: make button visibility a visual-only change (CSS or inline style) that does not affect the strip's scroll dimensions.

**Warning signs:** Component appears to flicker; DevTools shows continuous re-renders; browser becomes sluggish when inspecting a multi-photo species.

### Pitfall 4: `scrollIntoView` Scrolling the Page Vertically

**What goes wrong:** Clicking a thumbnail causes the page to jump vertically so the strip is centered in the viewport.

**Why it happens:** Default `scrollIntoView()` scrolls both axes. Without `block: 'nearest'`, it scrolls vertically to bring the element into the block direction center.

**How to avoid:** Always use `scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })`.

### Pitfall 5: Thumbnail Images Lacking `alt=""` Causing Screen Reader Noise

**What goes wrong:** Thumbnail `<img>` elements read out the species alt text for every thumbnail, flooding the screen reader with redundant announcements.

**Why it happens:** The ARIA pattern for a tablist is that the `<button role="tab">` provides the label via `aria-label`. The image inside is decorative.

**How to avoid:** Set `alt=""` (empty string, not absent) on thumbnail `<img>` elements. The button's `aria-label` carries the semantic label. [CITED: 23-UI-SPEC.md Component Inventory]

---

## Line-Level Change Map

Exact lines/methods that change in `src/components/pnwm-image-slideshow.js`:

| Item | Action | Location |
|------|--------|----------|
| `static properties` | Add `_stripOverflows: { state: true }` | Lines 4–9 |
| `static styles` | Remove `.dots`, `.dot`, `.dot.active`, `.index-label` CSS | Lines 24–32 |
| `static styles` | Add `.thumbnail-strip`, `.thumbnail`, scroll button visibility styles | Lines 11–60 |
| `constructor()` | Add `this._stripOverflows = false` and `this._resizeObserver = null` | Lines 62–69 |
| `disconnectedCallback()` | Add `this._resizeObserver?.disconnect()` | Lines 103–109 |
| `firstUpdated()` | Add new method — set up ResizeObserver on `.thumbnail-strip` | (new method, after `disconnectedCallback`) |
| `updated()` | Add new method — scrollIntoView when `_currentIndex` changes | (new method) |
| `_prev()` | Repurpose as `_scrollLeft()` (or rename in-place) | Lines 159–161 |
| `_next()` | Repurpose as `_scrollRight()` (or rename in-place) | Lines 163–165 |
| `render()` multi-image branch | Remove `dots` array, remove `index-label`, add thumbnail strip + repurposed buttons | Lines 206–236 |
| lightbox close button `@click` | Change `${this._closeLightbox}` to `${() => this._closeLightbox()}` | Line 182 |

---

## Runtime State Inventory

Step 2.5: SKIPPED. This is a UI modification phase, not a rename/refactor/migration phase. No stored data, live service config, OS-registered state, secrets, or build artifacts reference the changed code elements.

---

## Environment Availability

Step 2.6: No external tool dependencies. This phase modifies a single JavaScript file using already-installed packages. Build system (`eleventy --serve`) and test runner (`node --test`) are available.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner, build | ✓ | v24.15.0 | — |
| lit | Component base | ✓ | 3.3.2 (installed) | — |
| eleventy dev server | Manual testing | ✓ | (project dep) | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in Node.js test runner) |
| Config file | none — tests run via `node --test src/components/*.test.js` |
| Quick run command | `node --test src/components/pnwm-image-slideshow.test.js` |
| Full suite command | `node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/migrate-species.test.js src/components/*.test.js src/_lib/*.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHOTO-01 | Thumbnail strip renders from `_images[]`; click sets `_currentIndex` | unit | `node --test src/components/pnwm-image-slideshow.test.js` | ❌ Wave 0 |
| PHOTO-02 | Dots and index label absent from rendered output | unit | `node --test src/components/pnwm-image-slideshow.test.js` | ❌ Wave 0 |
| PHOTO-03 | `_closeLightbox()` called with correct `this` on close button click | unit | `node --test src/components/pnwm-image-slideshow.test.js` | ❌ Wave 0 |

**Note on testability:** `pnwm-image-slideshow.js` uses a browser-only API (`LitElement`, custom elements, shadow DOM). The existing test files for pure utility functions (`buildStateMap`, `filterRecords`) use `node:test` directly because those functions do not depend on the DOM. A browser-based test harness (Playwright, Web Test Runner) would be needed for full integration testing of the Lit component.

**Practical recommendation:** For this phase, unit tests should cover only the extractable pure logic (e.g., `_formatCaption`). The interactive behaviors (thumbnail click, ResizeObserver, scrollIntoView, lightbox open/close) require manual browser verification. Mark PHOTO-01/PHOTO-02/PHOTO-03 as `manual-only` for automated testing.

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| PHOTO-01 | Thumbnail strip visible and functional | manual | Requires browser; verify on species with multiple photos |
| PHOTO-02 | No dots or index label in DOM | manual | Inspect shadow DOM in DevTools |
| PHOTO-03 | Lightbox close button fires `_closeLightbox` | manual | Click ✕; lightbox must dismiss |

### Sampling Rate
- **Per task commit:** `node --test src/components/pnwm-image-slideshow.test.js` (if file is created; otherwise manual)
- **Per wave merge:** full suite `npm test`
- **Phase gate:** Full suite green + manual lightbox verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/pnwm-image-slideshow.test.js` — pure logic tests for `_formatCaption` (existing method, no behavior change); confirms test file exists and imports work

*(Browser-dependent behavior tests for PHOTO-01/02/03 are manual-only — no automated test gap to fill for the interactive behaviors.)*

---

## Security Domain

This phase modifies a UI-only Lit component with no network requests, no user input processing, no authentication, and no data persistence. ASVS categories are not applicable.

| ASVS Category | Applies | Rationale |
|---------------|---------|-----------|
| V2 Authentication | no | No auth changes |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No access control |
| V5 Input Validation | no | No user-submitted data — only CDN image URLs and metadata parsed from static HTML |
| V6 Cryptography | no | No crypto |

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Dot navigation (CSS circles) | Thumbnail strip (actual image thumbnails) | Standard pattern for photo galleries with visual content |
| `window.addEventListener('resize', ...)` | ResizeObserver | ResizeObserver is the current standard for element-level resize detection |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `block: 'nearest'` in `scrollIntoView` prevents vertical page scroll | Pattern 2, Pitfall 4 | Low — worst case the page scrolls slightly on thumbnail click; easy to diagnose and fix |
| A2 | `scrollBy({ left: ..., behavior: 'smooth' })` works equivalently to CSS `scroll-behavior: smooth` on the container | Pattern 5 | Low — `scroll-behavior: smooth` on container is an alternative; if JS `behavior: 'smooth'` is not honored, use CSS property instead |
| A3 | Unbound `this._closeLightbox` as event handler causes the close button to silently fail (PHOTO-03 root cause) | Pitfall 1, Pattern 3 | Medium — if wrong, the bug has a different cause (stacking context, z-index, pointer-events). Researcher's confidence is HIGH from code inspection — `_handleKeydown` is bound in constructor but `_closeLightbox` is not. |

---

## Open Questions

1. **PHOTO-03 alternate failure modes**
   - What we know: `_closeLightbox` is unbound; button's `@click` handler is unbound.
   - What's unclear: Whether the browser's error is silent (method runs with wrong `this`, assigns property to button element, no exception) or throws (strict mode, `this` is undefined).
   - Recommendation: Fix the binding first. If lightbox still doesn't close after fix, investigate z-index / pointer-events as a secondary cause.

2. **ResizeObserver vs. simple check in `updated()`**
   - What we know: Both approaches work. ResizeObserver is more robust (fires on viewport resize, not just after re-render).
   - What's unclear: Whether the simpler `updated()` approach is sufficient given that the strip container width can change on viewport resize (e.g., mobile orientation change).
   - Recommendation: Use ResizeObserver — it handles viewport resize automatically. The code complexity difference is minimal.

---

## Sources

### Primary (HIGH confidence)
- `src/components/pnwm-image-slideshow.js` — direct code inspection, all findings about current implementation [VERIFIED: codebase inspection]
- `23-CONTEXT.md` — locked design decisions D-01 through D-08 [VERIFIED: project docs]
- `23-UI-SPEC.md` — component inventory, spacing, color, ARIA contracts [VERIFIED: project docs]
- https://lit.dev/docs/components/lifecycle/ — `firstUpdated()` pattern for ResizeObserver setup [CITED: official Lit docs]
- https://lit.dev/docs/components/shadow-dom/ — `this.renderRoot` / `shadowRoot.querySelector()` patterns [CITED: official Lit docs]

### Secondary (MEDIUM confidence)
- https://github.com/WICG/webcomponents/issues/672 — shadow DOM stacking context behavior (verified that `position: fixed` works outside shadow DOM stacking context) [CITED: WICG issue, cross-referenced with WebSearch results]

### Tertiary (LOW confidence)
- WebSearch results on Lit + ResizeObserver patterns — cross-verified with official Lit lifecycle docs

---

## Metadata

**Confidence breakdown:**
- PHOTO-03 bug diagnosis: HIGH — direct code inspection shows unbound handler; `_handleKeydown` is explicitly bound in constructor but `_closeLightbox` is not
- Thumbnail strip implementation: HIGH — fully specified by CONTEXT.md and UI-SPEC; uses standard Lit patterns
- ResizeObserver pattern: HIGH — confirmed via official Lit lifecycle documentation
- Test architecture: MEDIUM — node:test runner confirmed; browser-dependent behaviors noted as manual-only

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (stable APIs — Lit 3.x, browser APIs)
