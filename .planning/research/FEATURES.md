# Feature Research: v4.0 Key Characters Identify Page

**Domain:** Multi-access character-based species identification key (moth identification, 237 states, 1,228 species)
**Researched:** 2026-06-24
**Confidence:** HIGH (key CSV fully parsed; Lucid key UX patterns researched; existing codebase inspected)

---

## Key Data Grounding

The actual key (237 × 1,228 matrix) has this structure:

| Category | States | Sub-questions (groups) | Notes |
|----------|--------|----------------------|-------|
| Forewing color and pattern | 65 | 17 | Color, Stigma, Lines/dashes, Spots, Fringe — deepest hierarchy |
| Distribution | 52 | 6 | 5 state/province + 5 per-state ecoregion questions; 10–11 ecoregions per state |
| Hindwing color and pattern | 45 | 10 | Color + Pattern sub-groups |
| Size | 34 | 5 | Approximate (4 bins) + Precise-by-bin (8+8+7+7 mm values) |
| Abdomen and thorax | 16 | 8 | Thorax + Abdomen sub-groups |
| Seasonality | 12 | 1 | 12 months, single question |
| Wing shape and size | 11 | 4 | Binary/ternary questions |
| Eyes | 2 | 1 | Single yes/no question |

Total: **237 states** grouped into **55 distinct questions** nested under **8 top-level categories**.

Character illustration images: **196 image files** covering ecoregion maps, color swatches, wing feature photos. These are separate from ~1,807 species specimen photos in the same media folder.

The 4-level hierarchy is: `Category : [Subcategory :] Question : State`. Some categories have 2 levels (Distribution, Seasonality, Eyes), others 3 (Forewing/Hindwing, Abdomen/Thorax, Size). The UI must render both depths.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the non-negotiable features that make a multi-access key feel functional. Any functional Lucid-style key (desktop or web) has all of these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Live "N species match" count** | Users expect immediate feedback that their selections are doing something. Without it the panel feels broken. | LOW | Counter in component state, recomputed on every selection change. Already proven by `pnwm-taxon-browser` state filter. |
| **Thumbnail grid of matching species** | Users expect to see who's left, not just a number. Standard output for any modern key (Lucid, Xper3, iKey). | MEDIUM | Flat grid: CDN thumbnail + binomial + common name + link to species page. Reuses browse page card pattern from `pnwm-tb-species-grid`. |
| **Collapsible character groups** | 55 questions across 8 categories = screen death if flat-listed. Standard Lucid layout collapses by category. | LOW | Mirrors existing `aria-expanded` toggle pattern in `pnwm-taxon-browser`. Categories default-collapsed, user opens what they care about. |
| **Deselect / toggle individual states** | Mistakes must be undoable. Lucid has always required this. | LOW | Checkbox semantics: click to select, click again to deselect. OR within a question. |
| **"Clear all" / Reset** | Users experiment; they need a full reset. Standard UX pattern for any filter panel. | LOW | Single button; clears all selections, restores full 1,228-species result set. |
| **Multi-select within a question = OR** | Users may not be certain of exact color; selecting Brown + Tan is natural. Lucid, Xper3 both do this. | LOW | Within a question: species matching **any** selected state survive. Already decided in milestone_context. |
| **Cross-question filter = AND** | Each additional question narrows further. Universal in multi-access keys. | LOW | A species must satisfy all active questions. Already decided. |
| **Character help images on demand** | The 196 illustration images exist precisely to help users answer questions they're unsure about. Users of Lucid keys routinely rely on these. Without them, jargon like "stigma," "claviform spot," "patagia" is opaque. | MEDIUM | Shown beside each question/state, triggered by a small icon or label click. See Character Help Images section below. |
| **No-JS static degradation** | Site-wide requirement (PROJECT.md). Build-time rendered state must be visible without JS. | MEDIUM | Static HTML fallback: full character list rendered as a `<noscript>`-gated or SSR form. Consistent with browse page pattern. |
| **"0 species match" dead-end warning** | If the user's selections produce zero results, they must know — and have a clear path out (undo last selection, or clear all). This is the most user-hostile state in any filter interface. | LOW | Display prominent empty-state message with "Clear all" CTA. Faceted search UX best practice: never leave user stranded with no feedback. |

### Differentiators (Competitive Advantage)

Features that go beyond bare functionality and make this key better than Lucid's desktop applet for this specific use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Persistent URL state (query params)** | Users can share a "I narrowed to brown medium moths in Washington in May" URL. No Lucid web key does this well. Bookmarkable sessions are genuinely valued by naturalist community. | MEDIUM | Encode active selections as URL params (e.g., `?s=cat-state1+cat-state2`). Parse on load to restore state. Does not affect no-JS path. |
| **"Characters used" summary chip strip** | Show active selections as removable chips above results, so users see at a glance what's active and can remove one without scrolling back to find it in the panel. Xper3 and better Lucid web implementations do this. | LOW-MEDIUM | Array of `{question, state}` pairs rendered as `<button>` chips with ✕. Each click deselects that state. Purely additive to the filter state model. |
| **Approximate + Precise size linked** | The key has both "Approximate size (Small/Medium/Large/VLarge)" AND "Precise size (4mm, 5mm...)" as separate questions. A user selecting "Small" could auto-activate all 4–11mm precise states, or vice versa. Prevents confusing partial overlap where selecting "Small" AND "5mm" is redundant but not obviously so. | MEDIUM | Option A: render them as a single unified size slider/range. Option B: selecting an approximate bin auto-expands to show the precise sub-question. The 4-bin → 34-state structure means approximate-only is sufficient for most users; precise is expert mode. |
| **Inapplicable/conditional character visibility** | Some questions only make sense after others are answered (e.g., "Is the stigma very large?" only applies if "Does the forewing have a stigma? Yes" is selected). Showing inapplicable questions creates noise; hiding them keeps the panel clean. | HIGH | Requires encoding the conditionality (not in the raw CSV — would need manual annotation of ~8 dependent question pairs). Deferred unless the dependency table is provided as part of key data. Flag for phase research. |
| **Character state count annotation** | Show how many of the current remaining species would match each unselected state (e.g., "Brown (483)"). Common in faceted search. Helps users choose high-value discriminators. | HIGH | Requires computing the full intersection matrix client-side on every state change: O(states × remaining_species). With 237 states and up to 1,228 species, this is ~290K lookups per update — feasible with a compact bitset representation but not trivial. Related to but distinct from the deferred "best next character" guided reordering. |
| **Ecoregion-to-state dependency hint** | Distribution has 5 state/province questions + 5 per-state ecoregion questions. A user who selects "Washington" ecoregions without selecting "Washington" at the state level might get confusingly narrow results (species not scored for WA ecoregions but scored for WA state). A UI hint ("You're filtering by WA ecoregions — also select Washington at the state level?") prevents this. | LOW | Purely presentational. Detect if a per-state ecoregion is selected without its parent state; show inline note. No algorithmic change needed. |

### Anti-Features (Explicitly Deferred or Excluded)

| Anti-Feature | Why Requested | Why Problematic / Deferred | Alternative / What to Do Instead |
|--------------|---------------|---------------------------|----------------------------------|
| **"Best next character" guided reordering** | Lucid's "Best" algorithm recommends the single most discriminating next character. Power users love it. | EXPLICITLY DEFERRED to a later milestone (per confirmed product decisions). Requires computing character discriminating power on remaining set after each selection — O(characters × species²) unless pre-computed. Reordering the panel live also breaks the user's spatial memory of where characters are. | Use static ordering (as in the original key). Let users pick their own path. |
| **Scored vs. unscored species distinction** | Lucid distinguishes "entity does not have this state" from "entity was not scored for this character" (the `Not Scoped` score). The raw `key.csv` may encode this via blank/0 cells vs. 1 cells. | The CSV is a binary presence matrix; blank cells are ambiguous (absent OR unscored). Without a tri-valued matrix (present/absent/unscored), implementing this correctly would require auditing the scoring. Showing wrongly-excluded species erodes trust. | For v4.0, treat all non-1 cells as "does not match." Document in coverage report output that scoring completeness is an issue. |
| **Error tolerance / fuzzy matching** | Lucid has adjustable error tolerance (e.g., allow 1 mismatched character) to handle misidentified features. Research confirms ~20% error rate even for expert users. | The key matrix is binary; error tolerance requires a scoring/ranking model rather than hard AND filtering. Implementing it correctly requires weighting each character by its reliability — not in scope. | Show the "0 results" state clearly with "clear last selection" CTA, which achieves the same recovery. |
| **Sort results by "best match" score** | Natural extension of error tolerance — rank by number of matching characters when no exact AND match exists. | Requires scoring model. Increases cognitive complexity of results ("why is this species first?"). | Hard AND filter is simpler to trust. |
| **In-panel text search across all characters** | With 237 states across 55 questions, a search box ("find 'stigma' in the character list") seems useful. | At 237 states in 55 questions, the 8-category collapsible structure is already navigable. Text search adds implementation complexity (fuzzy match? exact?) for a benefit mainly useful to experts who already know the character names. | Category collapse + clear question wording is sufficient. If needed later, add a simple `<input>` that filters visible question panels by matching text. |
| **Paginated / lazy-loaded results grid** | With up to 1,228 species and thumbnails, paginating seems necessary. | With CDN-served thumbnails and `loading="lazy"`, a single grid of 1,228 images is ~50KB of HTML + lazy-loaded images. Pagination adds navigation complexity and breaks the "see all remaining" affordance that makes multi-access keys useful. | Use `loading="lazy"` on all thumbnails. Monitor real performance. Add simple "show N of M" if needed. |
| **Saving sessions / accounts** | Users might want to save a partially-completed identification. | No server; no accounts; adds auth infrastructure. Static site constraint. | URL state encoding (in Differentiators) achieves the bookmarkable-session goal without persistence. |
| **Photographic plate view (grid of all species)** | A "browse all species as photos" mode is separately deferred (PLAT-01, PLAT-02 in PROJECT.md). | Already out of scope in PROJECT.md. | Separate milestone. |

---

## Character Help Images — Design Decision

The 196 character illustration images are the central usability asset for non-expert users. The question is where/how to surface them.

**Option A (Recommended): Inline expandable beside each question label.**
A small icon (e.g., a question mark or image preview) beside the question text. Click/tap expands an inline `<details>` element showing the relevant illustration(s). This:
- Keeps images in the DOM flow (no z-index/layering complexity)
- Works without custom JS (native `<details>` / `<summary>`)
- Is screen-reader accessible
- Allows multiple images per question (some questions have 2–3 variants)

**Option B: Hover tooltip with image.**
Hover over state label → small image appears in a popover. The project already uses native Popover API for glossary tooltips, so the pattern exists. However:
- Hover doesn't work on touch devices
- Character images are 100–300px wide; a tooltip is too small
- The glossary tooltip pattern is for definition text + small CDN image, not for large instructional diagrams

**Option C: Modal / lightbox per click.**
Click an icon → full modal with image, caption, and potentially multiple images. Standard Lucid behavior.
- More implementation work than `<details>` inline
- Interrupts the filtering flow (modal blocks the panel)

**Recommendation:** Use `<details>/<summary>` inline expansion for v4.0. It's the lowest-friction path, consistent with the project's "native browser APIs first" philosophy (Popover API for tooltips, `<details>` for expand). Reserve modal for a future polish phase.

**Image-to-character mapping:** The 196 image filenames are loosely named (e.g., "Forewing Stigma Bilobed.jpg", "US_Puget lowland.jpg"). A build-time mapping file (JSON or CSV) linking each of the 55 questions (and optionally each of the 237 states) to its illustration image(s) must be created as part of the character data pipeline. This is a one-time curation step, not a code problem.

---

## The "Unknown / Skip" Problem

The key CSV uses binary scoring: 1 = state present, blank/0 = absent. Unlike Lucid's 7-value scoring (which includes "Uncertain", "Rare", "Not Scoped"), the pnwmoths key matrix does not encode ambiguity.

**Practical consequence:** If a user selects a character state that a species genuinely has but the key's scorer omitted (scoring omission, not biological absence), that species is wrongly eliminated.

**V4.0 approach:**
- Do not attempt to distinguish "absent" from "unscored" — the raw data doesn't support it.
- The coverage report (species↔key matching) will document which species have low key-scoring coverage.
- The "0 results" recovery UX (clear last selection, clear all) is the primary mitigation.
- Users are already accustomed to Lucid's occasional over-narrowing; the same tolerance applies here.

**Deferred:** A "also show near-matches (1 character off)" mode that relaxes the AND filter. This requires a scored/ranked model, not a binary filter.

---

## Feature Dependencies

```
Character data pipeline (CSV → compact artifact)
    └──required-by──> All runtime filtering (no data = no filter)
    └──required-by──> Character help image mapping

Species↔key matching (synonym resolution)
    └──required-by──> Thumbnail grid (need species slug → CDN thumbnail)
    └──required-by──> "N species match" count (need to know which key species resolve to site slugs)

Character help image CDN upload
    └──required-by──> Character help images on demand

Filter state model (selected states → matching species)
    └──required-by──> Live count, thumbnail grid, "characters used" chip strip, URL state encoding

"Characters used" chip strip
    └──enhances──> Filter state model (alternative deselect path)
    └──no new dependency

URL state encoding
    └──enhances──> Filter state model (serialize/deserialize)
    └──no new dependency
```

### Dependency Notes

- **Data pipeline must come first.** The Lit component cannot be built until the compact key artifact (format TBD: likely JSON or small Parquet) is defined and its schema is stable. The pipeline phase must establish the data contract before the UI phase.
- **Thumbnail display requires slug resolution.** The key's 1,228 species binomials must be resolved to site slugs before thumbnails can be shown. The coverage report (unresolved names) determines which species appear in the grid vs. appear as text-only.
- **Character help images are decoupled from filtering logic.** The `<details>` expansion is purely presentational; it does not affect filter state. Image CDN upload can be a separate phase.
- **"Characters used" chip strip depends on filter state model** but is purely additive — it can be added in the same phase as the filter panel or a subsequent one without architectural impact.

---

## MVP Definition (v4.0 scope)

### Launch With

- [ ] **Character data pipeline** — parse `key.csv` into compact client-loadable artifact; Zod schema; build-time validation; coverage report of unresolved species.
- [ ] **Character filter panel** — 8 categories, collapsible; 55 questions; 237 checkbox states; multi-select OR within question, AND across questions.
- [ ] **Live "N species match" count** — updates on every selection change.
- [ ] **Thumbnail grid of matching species** — CDN thumbnails, binomial, link to species page; `loading="lazy"`; 0-results empty-state message.
- [ ] **"Clear all" reset** — single button, full reset.
- [ ] **Deselect individual states** — checkbox toggle.
- [ ] **Character help images on demand** — `<details>/<summary>` inline expansion beside each question; image-to-character mapping JSON built at pipeline time.
- [ ] **Character illustration image CDN upload** — ~196 images uploaded to bunny.net alongside species images.
- [ ] **No-JS static degradation** — full character list and species list visible without JS.

### Add After Validation (v4.x)

- [ ] **"Characters used" chip strip** — removable chips for active selections above results.
- [ ] **URL state persistence** — encode/decode selections in query params for shareable links.
- [ ] **Ecoregion-to-state dependency hint** — inline note when per-state ecoregion selected without parent state.
- [ ] **Approximate + precise size coupling** — auto-activate precise sub-question when approximate bin selected.

### Future Consideration (v5+)

- [ ] **Best next character guided reordering** — EXPLICITLY DEFERRED per product decision. Requires discriminating-power computation per remaining set.
- [ ] **Character state count annotation** — "Brown (483 species)" beside each unselected state. Requires bitset representation.
- [ ] **Inapplicable character hiding** — requires manual annotation of conditional question pairs.
- [ ] **Error tolerance / fuzzy matching** — requires tri-valued scoring model.
- [ ] **Scored vs. unscored distinction** — requires auditing key scoring completeness.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Character data pipeline | HIGH (everything depends on it) | MEDIUM | P1 |
| Filter panel + live count | HIGH | MEDIUM | P1 |
| Thumbnail grid + empty state | HIGH | LOW-MEDIUM | P1 |
| Clear all / deselect | HIGH | LOW | P1 |
| Character help images (CDN upload + inline expand) | HIGH (non-experts can't use jargon-only labels) | MEDIUM | P1 |
| No-JS degradation | MEDIUM (site requirement) | MEDIUM | P1 |
| "Characters used" chip strip | MEDIUM | LOW | P2 |
| URL state persistence | MEDIUM | MEDIUM | P2 |
| Ecoregion-state hint | LOW-MEDIUM | LOW | P2 |
| Approximate/precise size coupling | LOW (most users pick approximate; precise is expert) | MEDIUM | P2 |
| Character state count annotation | MEDIUM | HIGH | P3 |
| Best next character | MEDIUM (expert users) | HIGH | P3 (deferred milestone) |
| Inapplicable character hiding | LOW (manageable with collapsing) | HIGH | P3 |

---

## Interaction Semantics for Non-Expert Users

### How to present AND/OR without confusing users

Non-expert users should not need to understand AND/OR logic explicitly. The correct framing:

- **Within a question:** Multiple checkboxes visible, no explicit "OR" label needed. Selecting "Brown" and "Tan" is natural — they're both colors the moth might be. The result count dropping less steeply than a single selection implicitly teaches the OR behavior.
- **Across questions:** Users experience AND implicitly as "each new question narrows the results further." The shrinking count communicates this without needing a label.
- **The "0 results" case** is the only moment AND logic needs explanation. If the user hits zero, a message like "No species match all your selections — try removing one" communicates the issue without requiring logic vocabulary.

### "This character has no effect on the remaining set"

This occurs when every remaining species already satisfies a character state (e.g., after narrowing to Washington-only species, selecting "Washington" at the state level changes nothing). In Lucid, available features are pruned to only those that would actually discriminate; in the pnwmoths key, implementing full discrimination-power pruning is out of scope for v4.0.

**V4.0 approach:** Let the user select it; the count doesn't change; the chip strip (if implemented) shows it as active. No special treatment needed. The character state count annotation (P3) would make this obvious ("Washington (all remaining)") but that's a later phase.

### Scored vs. unscored species in results

Some species in the key may have minimal scoring coverage — scored for distribution/seasonality but not for morphological characters. These species will always survive morphological character filters (because their absent/blank matrix cells pass through as "not excluded"), which can be confusing (why is a moth with no forewing color data appearing when I filter by forewing color?).

**V4.0 approach:** Don't try to distinguish these cases — the data doesn't support it. Document the scoring coverage gap in the pipeline coverage report. Consider a future "scored species only" toggle if the coverage gap proves noisy in practice.

---

## Consistency With Existing Components

The existing `pnwm-taxon-browser` component establishes these patterns that the Identify page must be consistent with:

| Pattern | Existing implementation | Identify page approach |
|---------|------------------------|----------------------|
| Collapsible sections with `aria-expanded` | `_toggleFamily`, `_toggleSubfamily`, `_toggleGenus` in `pnwm-taxon-browser.ts` | Same button + `aria-expanded` toggle pattern for category sections |
| Thumbnail grid (`pnwm-tb-species-grid`) | CSS Grid, 1→2 columns at 600px breakpoint | Reuse or clone for Identify results grid. Species card: CDN thumb + name + link |
| CDN thumbnail URL construction | `${CDN_BASE_URL}/${slug}/${encodeURIComponent(filename)}?height=186` | Same formula for matching species thumbnails |
| Light DOM (Pico CSS penetration) | `createRenderRoot() { return this; }` | Same decision required for Identify component — Pico CSS selects must reach inside |
| State stored as new Set (not mutated) | `this._expandedFamilies = new Set([...this._expandedFamilies, name])` | Same immutable-set pattern for `_selectedStates: Map<questionId, Set<stateIndex>>` |
| Toolbar with filter controls | `pnwm-tb-toolbar` div | Identify panel is the toolbar, essentially. Same `display:flex; flex-wrap:wrap` approach |

The Identify page introduces a new interaction pattern that does NOT exist in the browse page: the character filter panel is the primary content (not a sidebar to taxonomy). The species grid is the result output. The layout is filter-panel-above-results on mobile, side-by-side on wider viewports — standard faceted-search layout.

---

## Sources

- **Key CSV fully parsed** (HIGH confidence) — `/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key.csv`; 237 rows (1 header blank + 237 states); 1,229 columns (1 state label + 1,228 species). Python CSV parser used to handle embedded newlines.
- **Character illustration images counted** (HIGH confidence) — `/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key media/Images/`; 2,003 total files; ~196 non-species character illustration images; ~1,807 species specimen photos.
- **Lucid key four-panel architecture** (HIGH confidence) — [How to use a Lucid key | Grasshoppers of the Western U.S.](https://idtools.org/grasshoppers/index.cfm?pageID=3082): four panels, remaining taxa count, deselect by unchecking, any-order selection.
- **DELTA interactive key principles** (HIGH confidence) — [Principles of Interactive Keys (PDF)](https://www.delta-intkey.com/www/interactivekeys.pdf): AND across characters, OR within character, best-next-character algorithm, remaining-taxa count, dead-end recovery.
- **Xper3 unknown-state handling** (MEDIUM confidence) — [Xper3 documentation](https://www.researchgate.net/publication/390935564_An_Xper3_reference_guide_for_taxonomists_a_collaborative_system_for_identification_keys_and_descriptive_data): species with no state described remain in results; multi-select within a character is supported.
- **Lucid scoring system** (MEDIUM confidence) — [Lucid Builder About Lucid scores](https://help.lucidcentral.org/lucid/how-to-use-the-lucid-scores/): 7-value scoring including Not Scoped, Uncertain, Rare — the pnwmoths CSV does not implement this; binary only.
- **Non-expert error rate research** (MEDIUM confidence) — [Wäldchen et al. 2022, People and Nature](https://besjournals.onlinelibrary.wiley.com/doi/full/10.1002/pan3.10405): ~20% character misidentification rate even from experts; keys should tolerate some error.
- **Faceted search "zero results" UX** (HIGH confidence) — multiple faceted search best practices sources: never strand user at zero results; provide clear "remove filter" CTA; warn before eliminating all results if possible.
- **Existing codebase** (HIGH confidence) — `src/components/pnwm-taxon-browser.ts`, `src/browse/index.njk`, `.planning/PROJECT.md`.

---

*Feature research for: PNW Moths v4.0 Key Characters Identify page*
*Researched: 2026-06-24*
