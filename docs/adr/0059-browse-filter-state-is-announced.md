# 0059. Browse filter results are greyed, labelled for screen readers, and summarised

**Status:** Accepted - Refs [#205](https://github.com/pnwinsects/pnwmoths/issues/205)
Refines D-06 of the Browse accordion design (phase 11, April 2026)

## Context

Browse can be filtered by state, then by county or regional district. Groups (family,
subfamily, tribe, genus) with no records in the chosen place were faded to 35% opacity
and nothing else. The phase 11 design chose fading over hiding on purpose (D-06): that
Washington has no Lasiocampidae is itself useful to a naturalist.

The launch audit (#200) found two failures in that:

- **Screen readers got nothing.** With Washington and a county chosen, 334 of 417 groups
  were faded and none said so to assistive technology, so a screen-reader user heard
  every group as an equally good result (WCAG 1.3.1).
- **Faded text was unreadable.** 35% opacity left headings near 2:1 contrast, and nested
  groups faded twice over (WCAG 1.4.3).

#205 set out three options: hide non-matching groups, keep and mark them, or only add a
summary. The maintainer chose to keep and mark them, and add the summary (2026-11-11).

## Decision

- **Groups with no records stay on the page.** D-06 stands; nothing is hidden.
- **Their text is greyed with Pico's muted colour** (`--pico-muted-color`, 5.4:1 on
  the white content area) instead of fading the whole row. Their photos still fade to 35%, since a photo
  carries no text.
- **Their heading carries hidden text**, so the button reads as, for example,
  "Drepanidae, no records in Adams County, Washington".
- **A status line under the filters says how much matched**, for example "90 of 1,254
  species have records in Adams County, Washington. Groups with none are greyed out." It
  is visible, and screen readers announce it when the filter changes. The element is
  always in the page, even when empty, because a live region that appears or is un-hidden
  as its text changes is often not announced (the search box failed this way in #200).
- The count is of species, not groups: a naturalist asks how many moths are found in a
  county, not how many tribes.

The browser smoke test checks that choosing Washington fills the status line and that
every greyed group's heading includes the hidden text.

## Consequences

- Greyed headings are easier to read and harder to tell apart from the others: the muted
  grey (5.4:1 on the white content area) is only 2.1:1 against the normal heading colour,
  where fading gave a starker difference.
  With photos shown, the faded photos remain the strongest cue. With "Show images" off,
  the grey text and the status line are the only ones. If that proves too subtle, a
  visible marker on greyed groups is the next step, not a return to low-contrast text.
- A screen-reader user moving through the list hears "no records in …" on most groups
  once a county is chosen. That is longer, but it is the information sighted users get
  from the grey.

## Rejected alternatives

- **Hide groups with no records.** Simplest, but it drops what D-06 kept on purpose.
- **Only add the summary.** Cheapest, but a screen-reader user still cannot tell which
  groups matched while reading the list.
- **`aria-disabled` on greyed groups.** The groups are not disabled: a greyed family still
  expands, and its species pages still open. Saying otherwise would be false.
