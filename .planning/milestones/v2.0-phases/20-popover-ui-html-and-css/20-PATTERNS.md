# Phase 20: Popover UI -- HTML and CSS - Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 2 (1 rewrite, 1 update)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/glossary-tooltip.js` | component | event-driven | `src/components/glossary-tooltip.js` (self -- rewrite in place) | exact |
| `src/styles/theme.css` | config | n/a | `src/styles/theme.css` (self -- update selectors) | exact |

Both files are self-analogs: the existing implementation is being rewritten/updated
in place. The current code IS the pattern source. No other file in this project uses
vanilla JS DOM manipulation in the same style (all other components are Lit/Shadow DOM).

## Pattern Assignments

### `src/components/glossary-tooltip.js` (component, event-driven) -- REWRITE

**Analog:** `src/components/glossary-tooltip.js` (current implementation, lines 1-91)

This is a full rewrite. The existing file defines the structure, event wiring, and
show/hide logic that the new Popover API version must replicate with a different
mechanism. Below are the patterns to preserve, adapt, or replace.

**Module docblock pattern** (lines 1-9) -- PRESERVE:
```javascript
/**
 * Glossary term tooltip -- shows definition + image on hover/focus.
 *
 * Reads data-definition and data-image-url from <abbr class="glossary-term">
 * elements inserted by the build-time glossary transform.
 *
 * Removes the `title` attribute at runtime (replaced by aria-label) to prevent
 * the browser's native tooltip from appearing alongside the custom one.
 */
```

**Element creation pattern** (lines 11-16) -- ADAPT to Popover API:
```javascript
// OLD: single shared tooltip div
const tooltip = document.createElement('div');
tooltip.id = 'glossary-tooltip';
tooltip.setAttribute('role', 'tooltip');
tooltip.setAttribute('aria-hidden', 'true');
tooltip.innerHTML = '<img class="gt-img" alt=""><p class="gt-def"></p>';
document.body.appendChild(tooltip);
```
NEW pattern must create one `<div popover="auto">` per `<abbr>` element (per UI-SPEC),
with `id="gt-popover-{index}"`, `class="glossary-popover"`, `role="tooltip"`,
`aria-hidden="true"`. Append to `document.body`.

**title-to-aria-label swap pattern** (lines 22-29) -- PRESERVE exactly:
```javascript
for (const abbr of document.querySelectorAll('abbr.glossary-term')) {
  // Move title -> aria-label so the browser's native tooltip doesn't conflict
  const title = abbr.getAttribute('title');
  if (title) {
    abbr.setAttribute('aria-label', title);
    abbr.removeAttribute('title');
  }
```

**tabindex addition** -- NEW (not in current code). Add inside the same loop:
```javascript
  abbr.setAttribute('tabindex', '0');
```

**Event wiring pattern** (lines 30-49) -- ADAPT:
```javascript
  // OLD: mouseenter with cursor coords
  abbr.addEventListener('mouseenter', (e) => {
    clearTimeout(hideTimer);
    show(abbr, e.clientX, e.clientY);
  });
  // OLD: mousemove for cursor-following
  abbr.addEventListener('mousemove', (e) => {
    position(e.clientX, e.clientY);
  });
  abbr.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(hide, 80);
  });

  // Keyboard focus support
  abbr.addEventListener('focus', (e) => {
    clearTimeout(hideTimer);
    const r = abbr.getBoundingClientRect();
    show(abbr, r.left, r.bottom);
  });
  abbr.addEventListener('blur', () => {
    hideTimer = setTimeout(hide, 80);
  });
```
NEW: Remove `mousemove` listener entirely (no cursor-following). Both `mouseenter`
and `focus` should use `getBoundingClientRect()` positioning. The `hideTimer` /
`clearTimeout` debounce pattern (80ms) must be preserved. Each `<abbr>` shows/hides
its own associated popover element.

**Show function pattern** (lines 52-69) -- ADAPT:
```javascript
function show(abbr, x, y) {
  const imageUrl = abbr.dataset.imageUrl;
  const definition = abbr.dataset.definition;

  gtDef.textContent = definition || '';

  if (imageUrl) {
    gtImg.src = imageUrl;
    gtImg.hidden = false;
  } else {
    gtImg.src = '';
    gtImg.hidden = true;
  }

  tooltip.style.display = 'block';
  tooltip.removeAttribute('aria-hidden');
  position(x, y);
}
```
NEW: Replace `tooltip.style.display = 'block'` with `popover.showPopover()`.
Remove `aria-hidden` on show. Content population (definition text, image
show/hide) pattern is preserved but operates on the per-term popover element.

**Hide function pattern** (lines 71-74) -- ADAPT:
```javascript
function hide() {
  tooltip.style.display = 'none';
  tooltip.setAttribute('aria-hidden', 'true');
}
```
NEW: Replace with `popover.hidePopover()` and set `aria-hidden="true"`.

**Position function pattern** (lines 76-91) -- REPLACE:
```javascript
function position(x, y) {
  const pad = 12;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = x + pad;
  let top = y + pad;

  if (left + tw > vw - pad) left = Math.max(pad, x - tw - pad);
  if (top + th > vh - pad) top = Math.max(pad, y - th - pad);

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}
```
NEW: Position below the `<abbr>` element using `getBoundingClientRect()`:
```
left  = abbr.getBoundingClientRect().left + window.scrollX
top   = abbr.getBoundingClientRect().bottom + window.scrollY + 6
```
Viewport edge clamp: `if (left + popoverWidth > viewportWidth - 8) left = viewportWidth - popoverWidth - 8`.
Use `position: absolute` (not `fixed`) since popover is in top layer with `inset: unset; margin: 0`.

---

### `src/styles/theme.css` (config) -- UPDATE SELECTORS

**Analog:** `src/styles/theme.css` (self, lines 145-180)

**abbr.glossary-term rule** (lines 147-152) -- PRESERVE unchanged:
```css
abbr.glossary-term {
  cursor: help;
  text-decoration: underline dotted 2px;
  text-underline-offset: 3px;
  text-decoration-color: #7f8956;
}
```

**#glossary-tooltip block** (lines 154-165) -- REPLACE selector, adapt properties:
```css
/* OLD */
#glossary-tooltip {
  display: none;
  position: fixed;
  z-index: 200;
  background: #fff;
  border: 1px solid #bbb;
  border-radius: 4px;
  padding: 10px 12px;
  max-width: 260px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
```
NEW `.glossary-popover` rule must:
- Remove `display: none` (Popover API manages display state)
- Change `position: fixed` to `position: absolute`
- Remove `z-index: 200` (popover top layer handles stacking)
- Add `margin: 0; inset: unset;` (reset browser popover defaults)
- Change `padding: 10px 12px` to `padding: 8px 12px` (per UI-SPEC grid alignment)
- Preserve: `background`, `border`, `border-radius`, `max-width`, `box-shadow`, `pointer-events`

**Child selectors** (lines 167-180) -- REPLACE parent selector only:
```css
/* OLD */
#glossary-tooltip .gt-img { ... }
#glossary-tooltip .gt-def { ... }

/* NEW */
.glossary-popover .gt-img { ... }
.glossary-popover .gt-def { ... }
```
All child property values remain identical.

---

## Shared Patterns

### title-to-aria-label swap
**Source:** `src/components/glossary-tooltip.js` lines 23-28
**Apply to:** `src/components/glossary-tooltip.js` (rewrite preserves this pattern)
```javascript
const title = abbr.getAttribute('title');
if (title) {
  abbr.setAttribute('aria-label', title);
  abbr.removeAttribute('title');
}
```

### Image conditional display
**Source:** `src/components/glossary-tooltip.js` lines 58-64
**Apply to:** `src/components/glossary-tooltip.js` (rewrite preserves this pattern)
```javascript
if (imageUrl) {
  gtImg.src = imageUrl;
  gtImg.hidden = false;
} else {
  gtImg.src = '';
  gtImg.hidden = true;
}
```

### Hide debounce (80ms)
**Source:** `src/components/glossary-tooltip.js` lines 20, 38-39, 48-49
**Apply to:** `src/components/glossary-tooltip.js` (rewrite preserves this timing)
```javascript
let hideTimer;
// on mouseleave / blur:
hideTimer = setTimeout(hide, 80);
// on mouseenter / focus:
clearTimeout(hideTimer);
```

### Design tokens (CSS custom properties)
**Source:** `src/styles/theme.css` lines 1-18
**Apply to:** `src/styles/theme.css` popover CSS -- use these tokens for consistency
```css
:root {
  --pico-background-color: #f3e8ba;
  --pico-primary: #a4ab78;
  --pico-primary-hover: #7f8956;
  --pico-font-family-sans-serif: 'Open Sans', Verdana, sans-serif;
}
```

### Module import wiring
**Source:** `src/components/main.js` line 7
**Apply to:** No change needed -- already imports `glossary-tooltip.js`
```javascript
import './glossary-tooltip.js';
```

## No Analog Found

No files lack analogs. Both files being modified are their own analogs (in-place rewrite/update).

However, note that **no existing code in this project uses the Popover API**. The
`showPopover()` / `hidePopover()` / `popover="auto"` pattern is entirely new to this
codebase. The planner should reference the UI-SPEC (`20-UI-SPEC.md`) for the exact
Popover API usage contract rather than any codebase analog.

| Concept | Analog | Guidance |
|---------|--------|----------|
| `popover="auto"` attribute | none in codebase | Follow 20-UI-SPEC.md Popover Element Structure Contract |
| `showPopover()` / `hidePopover()` | none in codebase | Follow 20-UI-SPEC.md Show/hide mechanism table |
| `position: absolute` + `inset: unset` + `margin: 0` | none in codebase | Follow 20-UI-SPEC.md CSS Selector Migration section |

## Metadata

**Analog search scope:** `src/components/`, `src/styles/`
**Files scanned:** 14 (all JS in `src/components/`, `src/styles/theme.css`)
**Pattern extraction date:** 2026-04-23
