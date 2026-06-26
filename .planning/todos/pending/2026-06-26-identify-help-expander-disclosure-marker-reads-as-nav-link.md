---
created: 2026-06-26T18:19:38.858Z
title: Identify help-image expander — disclosure marker reads as a nav link
area: ui
files:
  - src/components/pnwm-identify.ts
  - src/styles/theme.css
---

## Problem

UAT feedback on the Phase 43 character-illustration help expander (`/identify/`):
the native `<details>/<summary>` disclosure marker is a **right-pointing caret
(▶)**, which next to the `ⓘ illustration` label reads like a **navigation link
("go to")** rather than a **disclosure triangle ("expand")**. Users may not
realize it opens an inline image.

Functionally correct (verified working in UAT) — this is a visual-affordance nit,
deferred to the planned UI-polish round for the Identify page rather than fixed
as a one-off.

## Solution

TBD during the Identify-page UI polish pass. Candidates:
- Restyle the `<summary>` marker (`list-style`/`::-webkit-details-marker` or a
  custom `::marker`/pseudo-element) to a clearer expand/collapse glyph (e.g. a
  down-chevron that rotates on open, or +/−), so it reads as disclosure not
  navigation.
- Or lean on the existing `ⓘ` info glyph and suppress the native triangle
  entirely, making the whole summary row the affordance.
- Keep it keyboard-accessible and consistent with the `.pnwm-kfp-*` styling and
  the UI-SPEC open/closed treatment (cream tint on open).

## Context

- Bundle this with the broader Identify-page UI-polish round (owner flagged one is
  coming anyway).
- Phase 43 UI-SPEC: `.planning/phases/43-character-illustration-images/43-UI-SPEC.md`
  (§ on the `ⓘ illustration` affordance and open/closed treatment).
- Only ~77/237 states are mapped in the initial draft CSV, so the marker appears
  mainly under Forewing/Hindwing color + Distribution.
</content>
