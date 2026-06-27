# Phase 42: Results Grid - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 42-results-grid
**Areas discussed:** Count wording & unmatched, Page layout (desktop + mobile), Card details, Default/empty-selection grid, At-rest count

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Empty-selection grid | Render all ~1,190 thumbnails vs prompt until first pick | (revisited later) |
| Count wording & unmatched | Matched-only vs surface the 36 unmatched | ✓ |
| Page layout | Side-by-side vs stacked | ✓ |
| Card details | common_name null handling, card contents | ✓ |

**Notes:** User initially skipped "Empty-selection grid"; it was raised again at the end as the most consequential open decision and resolved (see below).

---

## Count wording & unmatched

| Option | Description | Selected |
|--------|-------------|----------|
| Just matched count | "N species match" / "Showing all 1,192 species"; never mention the 36 unmatched | ✓ |
| Surface the gap | "Showing all 1,192 of 1,228 key species" + note 36 not on site | |
| Footnote only | Live count stays matched-only; static caption mentions 36 not on site | |

**User's choice:** Just matched count
**Notes:** Unmatched species are invisible everywhere else on the site — no reason to introduce a number users can't act on.

---

## Page layout (desktop)

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-side, sticky panel | Panel left & sticky, grid scrolls in main column, count above grid | ✓ |
| Side-by-side, both scroll | Panel left, grid right, neither sticky | |
| Stacked | Panel on top, grid below, full width | |

**User's choice:** Side-by-side, sticky panel

## Page layout (mobile)

| Option | Description | Selected |
|--------|-------------|----------|
| Stack: panel then grid | Single column, panel on top, grid below | (baseline) |
| Collapsible/drawer panel | Filters become a toggle/drawer | |
| You decide | Default to stack; exact treatment to UI spec | ✓ |

**User's choice:** You decide (baseline = stack)
**Notes:** Panel is compact because categories are default-collapsed (Phase 41). A drawer is a maybe for the UI spec, not a requirement.

---

## Card details

| Option | Description | Selected |
|--------|-------------|----------|
| Binomial + common if present | Italic binomial always; common name line only when non-null | ✓ |
| Always two lines | Reserve a common-name line even when null | |
| Binomial only | Drop common names entirely | |

**User's choice:** Binomial + common if present
**Notes:** Matches how the rest of the site treats null common names. Card mechanics (CDN thumb, lazy load, whole-card link, gray placeholder) confirmed inline.

---

## Default / empty-selection grid

| Option | Description | Selected |
|--------|-------------|----------|
| Render all thumbnails | Show all 1,192 cards immediately (lazy) | |
| Prompt until first pick | "Select characters to narrow…" placeholder until first selection | ✓ |
| You decide | Default to render-all, fall back to cap+prompt if perf demands | |

**User's choice:** Prompt until first pick
**Notes:** Avoids a heavy first paint and a wall of unfiltered images on landing.

---

## At-rest count (reconciling the prompt with SC1)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep "Showing all 1,192" | Count line still reads "Showing all 1,192 species" above the prompt | ✓ |
| Fold count into prompt | Number lives in the prompt; no separate count line; amend SC1 wording | |

**User's choice:** Keep "Showing all 1,192"
**Notes:** Count + prompt coexist, so SC1 stays satisfied with no roadmap/SC wording change.

---

## Claude's Discretion

- Mobile/narrow layout treatment (baseline: stack panel then grid).
- Selection → grid wiring (`pnwm-identify` passes `matchedSlugs` down as a property vs grid re-listening to the event).
- Matrix data delivery: fetch `/key-matrix.json` at runtime via `validateKeyMatrix()` (not inlined); confirm page-weight check.
- Re-render performance with Lit keyed rendering (`repeat()` by slug).
- Thumbnail `?height=` value and grid column count (UI spec).
- Exact card styling reconciliation between the taxon-browser nav-card and the v2.1 similar-species visual (UI spec).

## Deferred Ideas

- "Characters used" removable chip strip (IDENT-07) and URL state persistence (IDENT-08) — v4.x.
- Mobile filter drawer beyond the baseline stack — UI spec may propose; otherwise its own scope.
- Surfacing the 36 unmatched key species anywhere — explicitly declined this phase.
- Character illustration / help images — Phase 43.
