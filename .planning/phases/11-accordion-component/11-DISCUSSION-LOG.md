# Phase 11: Accordion Component - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 11 — Accordion Component
**Areas discussed:** Image display, State filter UX, Expand/collapse feel, Controls placement

---

## Image Display

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal thumbnail strip | Inline-flex row, fixed ~64px height, object-fit: cover, no captions. Rows stay compact and uniform. | ✓ |
| 2×2 grid | Square cells, more detail per image, but doubles row height for all families. | |

**User's choice:** Horizontal strip  
**Notes:** User specified 93px as the minimum height for specimen detail visibility. On mobile, horizontal scroll on the strip is acceptable (overflow-x: auto). No photographer credit at accordion level — belongs on the species factsheet page.

---

## State Filter UX

**Sub-question 1: UI form**

| Option | Description | Selected |
|--------|-------------|----------|
| `<select>` dropdown + mute empty rows | Dropdown matching pnwm-filter-bar.js; taxa with no records shown but visually muted (lower opacity / aria-disabled). | ✓ |
| `<select>` dropdown + hide empty rows | Dropdown, but families/genera with no records in the selected state disappear entirely. | |
| Button group + mute empty rows | Inline state buttons; empty rows muted. Requires custom CSS for Pico. | |

**User's choice:** `<select>` + mute empty rows  
**Notes:** Consistent with existing `pnwm-filter-bar.js` pattern. Muting rather than hiding preserves taxonomic context — naturalists benefit from knowing which families exist outside their region.

---

## Expand/Collapse Feel

| Option | Description | Selected |
|--------|-------------|----------|
| Instant show/hide | Hidden attribute or display:none toggle. Zero jank, matches existing components, simplest. | ✓ |
| CSS height transition | grid-template-rows 0fr→1fr animation. Smooth feel but layout recalc cost on large taxa subtrees. | |

**User's choice:** Instant show/hide  
**Notes:** No other Lit component on this site uses animation. Avoids layout-recalc jank on large genera (Noctuidae). Consistent with the project's correctness-first priorities.

---

## Controls Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inside the component | Toolbar rendered inside `<pnwm-taxon-browser>`'s own render(). Template stays minimal. Self-contained. | ✓ |
| Outside in index.njk | Template owns controls; communicates via attributes/events. Requires template editing for future changes. | |

**User's choice:** Inside the component  
**Notes:** `browse/index.njk` stays at its current minimal 2-line structure. Consistent with `pnwm-filter-bar.js` encapsulation pattern. Future maintainers only touch the component file to change controls behavior.

---

## Claude's Discretion

- Show/hide images toggle form factor (checkbox vs. button toggle)
- Visual muting treatment for filtered rows (opacity, CSS class, aria-disabled)
- Component architecture (single class vs. sub-components)
- Loading state for species-states.json fetch
