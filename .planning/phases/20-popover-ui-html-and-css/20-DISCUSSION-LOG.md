# Phase 20: Popover UI — HTML and CSS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 20 — Popover UI — HTML and CSS
**Areas discussed:** Implementation approach, Phase scope / consolidation

---

## Implementation Approach

**Context surfaced during scout:** `glossary-tooltip.js` and tooltip CSS in `theme.css`
were already implemented outside the GSD phase workflow (commits `8eefbd5`, `539734a`
after Phase 19 completion). The existing implementation used a custom `position: fixed`
div with cursor-following. Two gaps identified: no `tabindex="0"` on `<abbr>` (keyboard
focus events wired but unreachable), and no Escape key dismiss.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep custom div | Fix two gaps (tabindex, Escape) in existing impl | |
| Refactor to Popover API | Replace custom div with native `popover="auto"` | ✓ |

**User's choice:** Refactor to Popover API

---

## Popover Type

| Option | Description | Selected |
|--------|-------------|----------|
| `popover="auto"` | Built-in Escape dismiss + click-outside-to-close | ✓ |
| `popover="manual"` | Full control, no built-in Escape | |

**User's choice:** `popover="auto"`

---

## Positioning

| Option | Description | Selected |
|--------|-------------|----------|
| Below the term | Fixed offset using `getBoundingClientRect()` | ✓ |
| Follow cursor | Keep mousemove tracking from existing impl | |

**User's choice:** Below the term

---

## tabindex

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime JS | JS adds `tabindex="0"` when wiring events | ✓ |
| Build-time transform | Add to `<abbr>` in glossary-transform.js | |

**User's choice:** Runtime JS

---

## Phase Scope / Consolidation

| Option | Description | Selected |
|--------|-------------|----------|
| Include images in Phase 20 | Fold Phase 21 into this rewrite | ✓ |
| Keep phases separate | Phase 20 text only, Phase 21 adds images | |

**User's choice:** Include images in Phase 20 — Phase 21 is vacuous after this ships.

---

## Claude's Discretion

- Exact popover HTML structure
- CSS selector for new popover element
- Exact pixel offset below the term
- show/hide via `showPopover()`/`hidePopover()` or toggle

## Deferred Ideas

- CSS Anchor Positioning (TIP-04) — deferred pending Baseline
- Fix lightbox close button — separate todo, not folded into this phase
