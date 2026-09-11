# 0043. The Checklist filter combines areas as a union, pinned one at a time

**Status:** Accepted · Extends [ADR 0031](0031-checklist-page.md)

## Context

The Checklist filter was single-select at both levels: one state or province, then one
county or regional district within it. When the page shipped the curator asked
([#218](https://github.com/pnwinsects/pnwmoths/issues/218), carried to
[#293](https://github.com/pnwinsects/pnwmoths/issues/293)) for the ability to combine
areas, with two concrete uses: several counties of one state (the Olympic Peninsula) and
two jurisdictions together (Washington plus British Columbia, the Georgia Basin). He also
said to drop it if it was a pain.

Both cases are unions: a species known from *any* selected area belongs on the list. The
filtering was already set-based, so the semantics were a natural extension. The open
question was the control. A multi-select `<select>` is hostile on a phone and invisible on
a desktop until you know to hold a key; a checkbox group for every county in five
jurisdictions is a wall.

## Decision

- **Union semantics.** `visibleSlugs` takes a list of areas and shows a species present in
  any of them. A county whose whole state is also selected is dropped from the list, since
  it adds nothing and naming it would misstate what the filter does.
- **The two selects stay as they were.** Choosing one area filters immediately, exactly as
  before. Nothing changes for the single-area reader, who is the common case and, by his own
  account, the curator.
- **"Add another area" pins the current pick as a chip** and clears the selects for the next
  one. Each chip has a remove control. The list shows the union of the chips and whatever the
  selects hold at the moment, so pinning never changes what is shown, only frees the selects.
  The status line names every area: *Showing 412 of 1,254 species in Clallam (WA), Jefferson
  (WA) and Mason (WA).*
- The note about species a county list cannot reach is summed over the whole-state
  selections only, each species counted once.

## Consequences

- Combining is an explicit extra step rather than a mode, which is what keeps the default
  interaction untouched. The cost is one more button on the page.
- No-JS degradation is unchanged: the element still only hides rows already on the page.
- Browse keeps its own single-select filter. The two pages share the aggregate files and the
  membership predicates, not the control, so they cannot disagree about which species is in
  Whatcom County even though only one of them can combine areas.

## Alternatives considered

- **`<select multiple>`.** Rejected: unusable on mobile and undiscoverable on desktop.
- **Checkbox groups.** Rejected: five jurisdictions and a few hundred districts is a page in
  itself, for a feature the curator does not personally use.
- **Intersection, or a toggle between union and intersection.** Rejected: both of the
  curator's cases are unions, and "species found in every one of these counties" is a
  question nobody asked.
