# Phase 41: Identify Page Scaffold & Filter Panel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 41-identify-page-scaffold-filter-panel
**Areas discussed:** Distribution/Seasonality, Accordion structure, No-JS fallback content, Selection feedback & Clear all

---

## Distribution / Seasonality (resolving the Phase 40 deferral)

| Option | Description | Selected |
|--------|-------------|----------|
| Include all 8 as-is | Full key fidelity; no special-casing; panel stays category-agnostic; Browse overlap accepted | ✓ |
| Include, but visually grouped/noted | All 8, but Dist+Season in a distinct/marked section | |
| Exclude Dist + Season | Only the 6 morphological categories; geography/season filtered on Browse | |

**User's choice:** Include all 8 as-is
**Notes:** Keeps `key-filter.ts`/panel category-agnostic (consistent with Phase 40 D-05). To be recorded as a PROJECT.md Key Decision per PITFALLS Pitfall 3.

| Option | Description | Selected |
|--------|-------------|----------|
| All 6 questions | State/Province + all 5 ecoregion questions (52 states, flat); dependency hint later | ✓ |
| State/Province only | Only the top-level question (5 states); ecoregions wait for IDENT-09 | |

**User's choice:** All 6 questions
**Notes:** Ecoregion→state dependency hint (collapse irrelevant ecoregions) is IDENT-09, deferred to v4.x; renders flat for now.

---

## Accordion structure

| Option | Description | Selected |
|--------|-------------|----------|
| Category-only | Only the 8 categories collapse; opening reveals all questions + checkboxes | ✓ |
| Category + question | Nested collapse at the question level too (tames 19-question Forewing) | |

**User's choice:** Category-only
**Notes:** Questions still render as labeled checkbox groups (OR-within-question boundary stays explicit), just not individually collapsible. Forewing (65 checkboxes) dumps all on open — accepted.

| Option | Description | Selected |
|--------|-------------|----------|
| Key's native order | Distribution, Seasonality, Size, Wing shape, Forewing, Hindwing, Abdomen/thorax, Eyes | ✓ |
| Morphology-first curated | Lead with visual categories; Dist+Season last | |

**User's choice:** Key's native order

---

## No-JS fallback content

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped by family (like Browse) | Family → Genus grouping with species links | ✓ |
| Flat alphabetical list | Single flat list of species links by binomial | |
| You decide | Defer to research/planning | |

**User's choice:** Grouped by family (like Browse)
**Notes:** Lists the 1,192 matched species (all have pages); unmatched excluded.

| Option | Description | Selected |
|--------|-------------|----------|
| Plain nested text list | Category → question → state as nested text, no form controls | ✓ |
| Disabled checkboxes | Inert checkbox UI for visual parity | |

**User's choice:** Plain nested text list
**Notes:** Inert checkboxes would look actionable but do nothing without JS; plain text satisfies SC4.

---

## Selection feedback & Clear all

| Option | Description | Selected |
|--------|-------------|----------|
| Per-category count badges | Collapsed header shows count of selected states (e.g. "Forewing (3)") | ✓ |
| Single selected-count summary | One "N characters selected" line | |
| Both badges + summary | Per-category badges + top-level total | |

**User's choice:** Per-category count badges
**Notes:** Real-time selection reflection (IDENT-03) without a results count, which is Phase 42.

| Option | Description | Selected |
|--------|-------------|----------|
| Top of panel, sticky | Stays reachable while scrolling the 237-state panel | ✓ |
| Top of panel, static | Scrolls away with content | |
| You decide | Defer to research/planning/UI-spec | |

**User's choice:** Top of panel, sticky
**Notes:** Conditionally visible — appears when ≥1 state selected, disappears when cleared (SC3).

---

## Claude's Discretion

- Inline-JSON scope (inline character hierarchy; do NOT inline the ~243 KB matrix — bitsets are Phase 42).
- Data source: Eleventy `_data` loader vs direct template read of `data/key-matrix.json`.
- Light DOM vs Shadow DOM for the panel (lean Light DOM + Pico, per `pnwm-taxon-browser`).
- Badge / sticky-header visual styling (UI-spec / Pico tokens).

## Deferred Ideas

- Ecoregion→State dependency hint (IDENT-09, v4.x).
- Live "N species match" count + results grid + empty state (Phase 42).
- Character illustration / help images (Phase 43).
- "Characters used" chip strip (IDENT-07) and URL state persistence (IDENT-08) — v4.x.
- PROJECT.md Key Decision entry for D-01 (include Dist+Season despite Browse overlap).

## Research / data-quality flags

- "Abdomen and thorax" stray-quote artifact splits one category into two strings in
  `data/key-matrix.json` — merge for the 8-category panel (prefer fixing at `build-key.ts` source).
