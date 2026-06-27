# Domain Pitfalls: v4.0 Key Characters "Identify" Page

**Domain:** Adding a Lucid-export character-filter page to an existing strict-TS Eleventy/Vite/Lit static site
**Researched:** 2026-06-24
**Confidence:** HIGH — grounded in direct inspection of key.csv (237 × 1228 matrix), the Images/Thumbs folders, species.csv, scripts/, and PROJECT.md; no speculation

---

## Critical Pitfalls

### Pitfall 1: Image-filename → character-label mapping is not a column — must be heuristic

**What goes wrong:**
Only 44 character-illustration images exist for 237 character-states. There is no explicit mapping column in key.csv; the relationship must be inferred. The filenames use abbreviated, informal descriptions ("forewing basal dash, yes.jpg", "patagia distinct.jpg") that do not match the full hierarchical label ("Forewing color and pattern:Lines, dashes, veins and stripes:Does the forewing have a prominent, contrastingly-dark basal dash?:Yes"). A naive fuzzy-match written once and never validated silently maps the wrong image to a character, or maps nothing at all. The failure is invisible at build time unless explicitly audited.

**Why it happens:**
The Lucid key format stores image associations in its own binary state; `key.csv` is a character-state × specimen matrix only. The image-to-character link was never serialized as structured data in the export.

**How to avoid:**
Build an explicit, committed mapping table (`data/key-character-images.csv`, two columns: `character_label`, `image_filename`) rather than computing the mapping at runtime. Populate the initial version programmatically from a heuristic fuzzy-match script, then print every unmapped character and every unused image file as a build-time warning. Lock the table into version control so future changes are visible in git diff. The pipeline reads the table; the heuristic script is a one-time seeding tool.

**Warning signs:**
Image shown next to wrong character (e.g., a forewing spot illustration appearing beside a hindwing question); characters showing no image when one exists; image files in the CDN that are never referenced.

**Phase to address:**
Data pipeline phase (key.csv ingest). The mapping table must be created and validated before any CDN upload or UI work.

---

### Pitfall 2: 0 means "not scored", not "absent" — and the key has no explicit NULL encoding

**What goes wrong:**
The matrix uses only `0` and `1`. A `0` in a sub-question cell does NOT mean "this character does not apply to this species" — it means the species was not scored for that character, either because the parent question already excluded it (e.g., "Is the stigma very large?" has 95% 0,0 pairs because 95% of species lack a stigma) or because the curator simply did not score it. If the filter logic treats any `0` as a hard exclusion, selecting "forewing veins contrast: Yes" will correctly narrow the result, but selecting "patagia are very distinct" will wrongly exclude the ~81% of species with `0` for both patagia states (they were scored for other characters, not patagia). Three species (`Hypenodes fractilinea`, `Hypenodes sobria`, `Xestia normanianus`) have zero `1`s across all 237 characters — they are entirely unscored and must not appear in any filter result if AND logic treats 0 as absence.

**Why it happens:**
Classic Lucid binary key encoding: `1` = scored present, `0` = scored absent OR not scored. The key uses branching (sub-questions only apply if the parent is `1`), so `0,0` on a sub-question pair is the expected "not applicable" state for species that failed the parent test. The matrix format loses this branching metadata.

**How to avoid:**
The correct filter semantics for a `0` in a binary key are: "a species is eliminated by a character selection only if the species has `1` for an explicitly contradicting state." In AND-across / OR-within logic, selecting "patagia very distinct" should only eliminate species that are scored `1` for "patagia not distinct" (the opposing state in the same question). Species with `0` for both states in a question are unscored and must pass through — they are not eliminated. Implement this as: for each selected character, compute the set of species with `1` for any OPPOSING state in the same question; eliminate only those species. A species with all-zero for a question is treated as unscored, not absent. Write TDD tests with concrete matrix cases before implementing.

**Warning signs:**
Selecting any single morphological character reduces results to fewer than 200 species (the correct inclusive behavior should show hundreds); species known to have a character (verified against the original Lucid applet) are absent from results.

**Phase to address:**
Data pipeline phase (define the filtering contract) and client component phase (implement and test the filter logic). The semantics must be decided and tested before the component ships.

---

### Pitfall 3: Distribution and Seasonality characters duplicate existing site filters

**What goes wrong:**
52 of 237 character-states are Distribution characters (5 state/province + 47 ecoregion sub-states), and 12 are Seasonality characters (months). The site already has a `pnwm-filter-change` event bus with `state` and occurrence-record-derived month data driving the browse page and phenology chart. If the Identify page's character filter panel exposes "In which State/Province was the moth found?: Washington" as a checkbox alongside morphological characters, users face two separate state-filter mechanisms on two different pages with no obvious relationship. Worse, the key's distribution data is from 2015 and may contradict the current occurrence records. Selecting "Washington: Yes" in the Identify filter and "WA" in the browse filter on a separate page produces different results with no explanation.

**Why it happens:**
The Lucid key encodes distribution as character-states to enable mixed morphology + distribution queries (e.g., "show me small gray moths found in the Coast Range"). The existing state filter is derived from occurrence records, not the key. Both are valid but represent different datasets and different years.

**How to avoid:**
Decision required in the design phase: either (a) exclude Distribution and Seasonality characters from the Identify page entirely (simplest — only 173 morphological + size characters) and let users apply occurrence-based filters separately; or (b) include them but UI-separate them from morphological characters with a clear label ("Key distribution data, 2015") and never conflate them with the occurrence-record state filter. Option (a) is strongly recommended: it avoids confusion, reduces the character count to 173 (from 237), and eliminates the ecoregion-name mismatch problem (see Pitfall 7).

**Warning signs:**
User confusion about why "Washington" in the Identify panel gives different results than "WA" in the browse filter; support questions about species "missing" from PNW results.

**Phase to address:**
Design phase — decide before building the filter panel. Document the decision in PROJECT.md Key Decisions.

---

### Pitfall 4: Sparse JSON artifact at ~440 KB violates the spirit of the page-weight budget

**What goes wrong:**
The page-weight validator (`check-page-weight.ts`) enforces a 500 KB limit on HTML files only — it does not check side-loaded JSON/binary artifacts. A naive `key.json` artifact using a full 2D array encoding weighs 854 KB; a sparse encoding (character → list of species indices) weighs ~440 KB uncompressed. HTTP/2 + gzip reduces this to ~175 KB on the wire, but a 440 KB synchronous-parse JSON still blocks the main thread on low-end devices. The filter panel is non-functional until this data loads and parses, so a slow artifact means a broken first interaction. If the artifact is accidentally inlined into the HTML (e.g., passed through Eleventy as a template variable), the Identify page HTML will exceed the 500 KB threshold and fail the post-build validator.

**Why it happens:**
Matrix density is ~30%, so sparse encoding offers only ~50% size reduction over the full array — not the 10× reduction that works for sparse data. The page-weight check only catches the HTML symptom, not the artifact source.

**How to avoid:**
Use a bitfield encoding: 237 characters × ⌈1228/8⌉ = 154 bytes per character = 36.5 KB total (48 KB base64-encoded). This is 10× smaller than sparse JSON and parses in microseconds as a `Uint8Array`. Never inline key data into HTML — always emit it as a side-loaded artifact at `_site/key-matrix.bin` (or equivalent). Add a post-build check that asserts the artifact is ≤ 100 KB. Do NOT pass the matrix through Eleventy template data — it is never needed at build time, only at client runtime.

**Warning signs:**
`[page-weight] WARNING: _site/identify/index.html is 512KB` in post-build output; slow Identify page on Chrome DevTools "slow 3G" throttle.

**Phase to address:**
Data pipeline phase (choose encoding before implementing). Post-build validation phase (extend the artifact-size check).

---

### Pitfall 5: AND-across / OR-within selection logic is easy to invert

**What goes wrong:**
The correct semantics for a multi-character identification key are: selections within a single character question are OR'd (selecting "Gray" and "Brown" under "Main hindwing color" should include species with either color), and selections across different character questions are AND'd (selecting "Gray OR Brown hindwing" AND "patagia very distinct" should require both). Inverting these — OR across questions, AND within a question — produces a result set that grows with more selections (nonsensical for identification). This inversion is easy to introduce when writing the reducer for a Lit component with a `Map<charIndex, Set<stateIndex>>` state structure.

**Why it happens:**
The terms "AND" and "OR" feel right in opposite directions depending on whether you're thinking about "I want gray OR brown" (natural English, correct) vs "I want everything matching character A AND character B" (correct across characters). The per-character state is a Set, which invites `intersection` logic at the wrong level.

**How to avoid:**
Write TDD tests for the filter function before implementing the Lit component. The test must cover: (a) single character, single state selected → narrows to species with that state; (b) single character, two states selected → wider than either alone; (c) two characters, one state each selected → narrower than either alone. Name the function `filterSpeciesByKey(matrix, selections: Map<charIndex, Set<stateIndex>>): Set<speciesIndex>` and test it in isolation.

**Warning signs:**
Selecting two states under a single color question narrows the result set instead of widening it; selecting a second character question widens results instead of narrowing.

**Phase to address:**
Client component phase — TDD filter function tests required before component implementation.

---

### Pitfall 6: Species binomial → slug matching has 53 confirmed mismatches driven by genus reclassifications, not just typos

**What goes wrong:**
53 of 1,228 key species (4.3%) do not match any current site slug using a naive `genus.lower() + '-' + epithet.lower()` join. This is not primarily a typo problem — the dominant cause is genus reclassification. The entire `Grammia` genus (14 species in the key) was moved to `Apantesis` in the current dataset. Eight other genera present in the key (`Holarctia`, `Neoarctia`, `Notarctia`, `Odontosia`, `Pararctia`, `Parasemia`, `Platarctia`, `Platyprepia`, `Simyra`) are absent from the site. Additionally, two key binomials have a double internal space ("Tolype  laricis", "Grammia  blakei") that a naive `.split(' ')` will partially handle but a `.split(/\s+/)` handles correctly. The existing `species-synonyms.csv` is currently empty (only a header row) and does not yet map any key binomials.

**Why it happens:**
The key was built in 2015 against a different taxonomic checklist. The site uses a MySQL dump from the original pnwmoths database with its own taxonomy. Neither dataset explicitly tracks the other's naming scheme.

**How to avoid:**
Write a build-time `scripts/resolve-key-species.ts` that: (1) normalizes binomials with `split(/\s+/)` to handle double spaces; (2) attempts a direct slug match; (3) falls back to the `species-synonyms.csv` lookup; (4) emits a `_site/key-coverage-report.json` listing every unresolved binomial. Gate the build only on fatal errors (malformed CSV), not on unresolved species — the roadmap specifies best-effort. Populate `species-synonyms.csv` with the known Grammia → Apantesis reclassification as part of the data pipeline phase.

**Warning signs:**
More than 53 unresolved species after the pipeline runs; any Grammia species appearing unmatched after synonym entries are added; coverage report missing from build output.

**Phase to address:**
Data pipeline phase (slug resolution script + coverage report + initial synonym entries). Manual synonym curation is a subsequent ongoing task, not a blocker.

---

### Pitfall 7: Ecoregion name mismatches between character labels and US_ image filenames

**What goes wrong:**
If Distribution/Seasonality characters are included in the Identify page (not recommended — see Pitfall 3), the 19 `US_*.jpg` ecoregion map images do not map cleanly to the 47 ecoregion character-states. Specific problems: "US_Cascades.jpg" matches three character labels ("Central Cascades", "North Cascades", "Eastern Cascades slopes and foothills") — it's ambiguous. "US_Coast Range.jpg" could match "Coast Range" or the much longer "Klamath Mts/California High North Coast Range". 19 BC-specific ecoregions have no corresponding US_ image at all. "US_BlueMts.jpg" uses "Mts" abbreviation while the character label uses "Mountains" in full.

**Why it happens:**
The US_ images were created as reference maps for the Lucid applet UI, which used its own internal character-to-image binding. The CSV export strips that binding.

**How to avoid:**
If Distribution characters are included, extend the `data/key-character-images.csv` mapping table (Pitfall 1) to cover ecoregion characters explicitly. Never auto-generate the ecoregion mapping from filename similarity alone. If Distribution characters are excluded (Pitfall 3 recommendation), this problem disappears entirely.

**Warning signs:**
"Coast Range" character showing the Klamath Mountains map; three Cascades sub-regions all showing the same generic "Cascades" image.

**Phase to address:**
Design phase (if Distribution characters are excluded, this pitfall is eliminated). Data pipeline phase (if included, explicit mapping required).

---

### Pitfall 8: 237-checkbox filter panel with no progressive disclosure overwhelms users and degrades performance

**What goes wrong:**
Rendering all 237 character-states at once creates a 237-item checkbox list that is unusable for non-specialists. At the same time, a naive "render all checkboxes in one Lit `render()`" will produce poor initial paint on mobile (237 `<input>` + `<label>` pairs is ~5 KB of DOM). A `ResizeObserver` or a similar hook placed at the wrong scope may trigger per-checkbox rather than per-panel.

**Why it happens:**
The key hierarchy (8 top-level categories → subcategories → questions → states) is encoded in the colon-delimited character labels. A developer extracting only the terminal state from each label and rendering a flat list loses all grouping information.

**How to avoid:**
Parse the full hierarchy from the colon-delimited labels at build time and emit a nested structure (`{category: string, questions: {question: string, states: {label: string, index: number}[]}[]}[]`). Render the panel as collapsible accordion sections (one section per top-level category). Collapse all sections by default; let the user open one at a time. This uses the existing Pico CSS accordion pattern already in the browse page. The Lit component renders section headers as static HTML slots and expands only the active section's checkboxes.

**Warning signs:**
Filter panel takes >500ms to paint; page scroll position jumps when a section opens; user testing reveals >2 minutes to locate a character.

**Phase to address:**
Client component phase (design the panel hierarchy rendering before writing any Lit component code).

---

### Pitfall 9: No-JS static degradation is effectively impossible for a live filter page — but the build gate still applies

**What goes wrong:**
The existing pattern (`<pnwm-foo>` component + `<noscript>` fallback showing static HTML) works well for components that display existing data (browse list, phenology chart). The Identify page filter is inherently interactive — there is no meaningful static representation of "select characters and see matching species." A `<noscript>` block showing all 1,228 species as a list is technically correct but useless. However, if the Identify page HTML is generated in a way that causes the post-build link checker or page-weight validator to fail (e.g., by inlining species data), that breaks CI for the entire site.

**Why it happens:**
The PROJECT.md requirement "no-JS static degradation required" was written for content-display features, not for a filter UI. The Identify page is categorically different.

**How to avoid:**
The Identify page must load without errors in a no-JS browser, even if the filter is non-functional. Implement the no-JS fallback as: a static `<noscript>` message ("Enable JavaScript to use the interactive identification key") and a link to the browse page as an alternative. The page body must otherwise be empty of species data (no inline 1,228-row list). The post-build link checker must be able to crawl the Identify page without error. The page-weight validator must pass.

**Warning signs:**
`check-page-weight.ts` reports `identify/index.html is 856KB`; `lychee` reports broken links inside the noscript block.

**Phase to address:**
Identify page template phase (define the static scaffold before any Lit component is wired in).

---

### Pitfall 10: bunny.net upload of ~2,000 character/specimen images without a manifest causes double-uploads on reruns

**What goes wrong:**
The existing `upload-tiles.ts` is manifest-driven (status `tiled` → `uploaded` persisted in `data/species-photos-manifest.csv`) and idempotent. A new image upload script for the key's ~2,003 Images + 1,980 Thumbs files that lacks a manifest will re-upload all files on every rerun. bunny.net PUT is idempotent (overwriting is safe) but a 2,000-file re-upload takes ~30 minutes and burns API rate limits unnecessarily.

**Why it happens:**
Image uploads are simpler than tile uploads (no tiling step), which tempts a "just loop over the folder and PUT" implementation without a manifest.

**How to avoid:**
Follow the same manifest pattern as `upload-tiles.ts`: maintain a `data/key-images-manifest.csv` with columns `filename`, `status` (`pending` | `uploaded`), `remote_path`. Advance status before (conceptual) deletion. Use `DRY_RUN=1` guard before `BUNNY_API_KEY` guard (existing project convention from Phase 30). Include a pre-flight footprint print before starting. The script can be simpler than `upload-tiles.ts` (no per-row DZI directory walk needed) but must use the same manifest-driven idempotency.

**Warning signs:**
Script re-uploading files already present on CDN (visible in bunny.net storage activity log); no `data/key-images-manifest.csv` checked into the repo.

**Phase to address:**
Image pipeline phase (before any upload run).

---

### Pitfall 11: Species in the key with no site photo (or no species page) cause broken thumbnail grid

**What goes wrong:**
The Identify page results grid shows species thumbnails (photo + name). 136 key species (1,228 − matched 1,092 after best-effort slug resolution) either have no matching site species page or have a site page with no uploaded images. A `<img src="${CDN_BASE_URL}/${slug}/...">` reference to a non-existent CDN path returns a 404, breaking the thumbnail grid visually and (if the link checker follows the src attribute) failing CI.

**Why it happens:**
The similar-species thumbnail row (Phase 25) already has this problem and solves it with a gray placeholder (`<div class="species-photo-placeholder">`). The Identify grid is a larger instance of the same challenge.

**How to avoid:**
Reuse the Phase 25 gray placeholder pattern. In the Lit component render: always render the species name link; conditionally render the thumbnail only if the coverage report marks the species as having an image, and fall back to the gray placeholder div otherwise. Never emit a `<img>` with a CDN path unless the image is confirmed to exist in the site's image manifest. The link checker does not follow `<img src>` attributes by default (lychee excludes image assets), but verify this before shipping.

**Warning signs:**
Broken image icons in results grid on first render; lychee reporting 404s on CDN image URLs.

**Phase to address:**
Client component phase (results grid rendering). Coverage data for "has image" must be available from the data pipeline phase.

---

### Pitfall 12: The `FilterChangeDetail` event bus is scoped to occurrence-record filters — adding key-character state to it is wrong

**What goes wrong:**
`FilterChangeDetail` in `src/types/events.ts` has 8 fields: `state`, `recordType`, `yearMin`, `yearMax`, `county`, `collection`, `elevationMin`, `elevationMax`. These drive the occurrence-record filters on species pages. The Identify page has its own filter state (which of 237 character-states are selected). Adding key-character selection to `FilterChangeDetail` and dispatching `pnwm-filter-change` from the Identify panel would cause every `pnwm-occurrence-map` and `pnwm-phenology-chart` component across all species pages to receive and attempt to process key-character filter events — even though those components have no key-character data.

**Why it happens:**
The event bus pattern is already established; it feels natural to extend it. The `pnwm-filter-change` name sounds generic.

**How to avoid:**
The Identify page filter state is self-contained — no other component consumes it. Use local Lit reactive properties (`_selections: Map<number, Set<number>>`) inside the Identify component rather than a document-level event bus. Do NOT add key-character fields to `FilterChangeDetail`. Do NOT emit `pnwm-filter-change` from the Identify panel. If a future milestone needs cross-component key-character events, introduce a new event type with a distinct name.

**Warning signs:**
`FilterChangeDetail` gains a `keySelections` or `charStates` field; `pnwm-occurrence-map` receives an event and logs unexpected fields.

**Phase to address:**
Client component phase (design the Identify component's state model before implementation).

---

### Pitfall 13: O(n × m) per-keystroke filtering of 237 × 1,228 without typed arrays is perceptibly slow on mobile

**What goes wrong:**
Filtering 237 × 1,228 using JavaScript arrays of `0`/`1` numbers (or strings from JSON) requires iterating 291,036 cells per filter update. In a Lit reactive property that triggers on every checkbox click, a naive array scan runs in ~10–30ms on desktop (acceptable) but ~100–300ms on mid-range mobile (perceptible jank). If the filter triggers on every `input` event during a drag or keyboard-repeat, compound clicks can queue multiple re-renders.

**Why it happens:**
The matrix is small enough that O(n × m) "feels fast" during desktop development but does not hold on devices with single-threaded JS and slower memory bandwidth.

**How to avoid:**
Represent each character-state's species membership as a `Uint8Array` bitfield (154 bytes for 1,228 species). AND two bitfields with a 154-byte loop (not 1,228 comparisons — 8× faster than per-species). The bitfield approach is also the recommended artifact encoding (Pitfall 4). Write the filter function as a typed-array bitfield AND, not a JavaScript array scan. Benchmark on Chrome DevTools "Mid-tier mobile" before shipping.

**Warning signs:**
Filter response time >50ms on Chrome DevTools CPU 4× slowdown; checkbox clicks feel "laggy" compared to the browse page state filter.

**Phase to address:**
Data pipeline phase (choose bitfield encoding) and client component phase (implement bitfield filter).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Heuristic image mapping without committed mapping table | Fast initial implementation | Silent mis-mappings accumulate; no audit trail | Never — always commit the table |
| Treat all 0s as "character absent" | Simpler filter code | Wrongly excludes unscored species; identification results are wrong | Never |
| Include Distribution/Seasonality characters without UX separation | More complete key | User confusion; data-freshness mismatch with occurrence records | Only if explicitly labeled and separated from morphological filters |
| Inline key matrix in HTML template | No separate fetch | 440+ KB HTML exceeds 500 KB page-weight gate; build fails | Never |
| Full 2D array JSON encoding | Simple to generate | 854 KB uncompressed; slow parse on mobile | Never — use bitfield |
| Extend `FilterChangeDetail` with key-character fields | Reuse existing bus | Breaks occurrence-record filter components; couples unrelated systems | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| bunny.net image upload | Upload all ~2,000 files unconditionally on every run | Manifest-driven with `status` field; idempotent via manifest, not via HEAD check |
| bunny.net CDN URL for key images | Assume same URL prefix as species photos | Key images live under a different CDN path prefix; define a separate constant |
| Vite MPA entry discovery | Add Identify page without a `<script src>` entry in the HTML | Vite discovers entries from HTML script tags; the Identify page needs its own entry or shares the existing `main.ts` |
| post-build link checker (lychee) | Emit CDN `<img>` src URLs for unconfirmed images | lychee does not check `<img src>` by default, but do not rely on this; use placeholder pattern |
| page-weight validator | Emit key JSON as an Eleventy data variable inlined into HTML | Key data must be a side-loaded artifact (`_site/key-matrix.bin`), not a template variable |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| JavaScript array scan over 237 × 1228 per checkbox click | >50ms filter response; mobile jank | Uint8Array bitfield AND loop (154 bytes per character) | Any mid-range mobile device |
| Parsing 440 KB JSON synchronously on load | Filter panel blocked for 150–300ms on load | Bitfield binary artifact (36.5 KB raw, <10ms parse) | Low-end devices, slow connections |
| Lit reactive property that re-renders entire results grid on every selection | Checkbox click causes full 1,228-item re-render | Compute result set in a derived property; render diff via Lit's built-in keyed repeat | Any device after ~5 selections |
| `readdirSync` of 2,000-image flat folder during upload pre-flight | 2–5s startup cost | Acceptable one-time cost per project convention (Phase 30 pattern); print "measuring…" message before starting | Not a problem at 2,000 files |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 237 flat checkboxes | Unusable; users cannot find characters | Collapsible accordion by category (8 top-level groups); show question count per section |
| No indication of how many species currently match | Users select characters without knowing if results are narrowing | Running "N species match" counter updates on every selection change |
| Showing all 1,228 species in the results grid before any filter is applied | Page renders thousands of thumbnails on load; slow initial paint | Show empty state or top-N "start here" characters before first selection; only render results grid after first selection |
| Results grid species link goes to a page that no longer exists (slug mismatch) | Dead link 404 | Coverage report identifies matched vs unmatched slugs; only render links for confirmed-matched species |
| Species with no photo rendered as a broken image | Visual noise; reduces trust | Gray placeholder (Phase 25 pattern); always render species name even without photo |

---

## "Looks Done But Isn't" Checklist

- [ ] **Image mapping:** `data/key-character-images.csv` committed; build warns on every unmapped character and every unused image
- [ ] **Unscored-species filter:** Selecting a character does NOT eliminate species with `0,0` for a yes/no pair unless the opposing state is explicitly scored `1` — verified by TDD test
- [ ] **Double-space binomials:** "Tolype  laricis" and "Grammia  blakei" resolve correctly (split on `\s+`, not `' '`) — verified by test
- [ ] **Slug coverage report:** `_site/key-coverage-report.json` emitted at build time; 53+ unresolved species listed (not silently dropped)
- [ ] **Artifact size:** `_site/key-matrix.bin` (or equivalent) is ≤ 100 KB — post-build check asserts this
- [ ] **HTML page weight:** `_site/identify/index.html` is under 500 KB — key data is NOT inlined in HTML
- [ ] **Event bus isolation:** `FilterChangeDetail` has no key-character fields; Identify component uses local Lit state only
- [ ] **AND/OR logic:** Single-question multi-state selection widens results; cross-question selection narrows results — both verified by test
- [ ] **bunny.net upload:** `data/key-images-manifest.csv` exists; re-running the upload script with all statuses `uploaded` produces zero API calls
- [ ] **No-JS degradation:** Identify page loads without JS errors in a no-script browser; lychee crawls the page without 404s
- [ ] **Distribution/Seasonality decision:** Explicitly documented in PROJECT.md Key Decisions (include or exclude)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong image-to-character mappings shipped | MEDIUM | Update `data/key-character-images.csv`; re-run CDN upload (idempotent); rebuild — no structural code change |
| Filter inverted (OR-across, AND-within) | HIGH | Requires rewriting filter function and regression-testing all cases; shipped behavior is visibly wrong |
| Large JSON artifact inlined in HTML | MEDIUM | Move to side-loaded artifact; update Vite entry; rebuild — but requires a re-deploy |
| 53 unmatched species silently dropped | LOW | Add synonym entries to `species-synonyms.csv`; rebuild — coverage improves incrementally |
| bunny.net re-upload without manifest | LOW | Upload is idempotent; create manifest retroactively from CDN file listing; mark all as `uploaded` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Image-filename heuristic mapping | Data pipeline (key ingest) | `data/key-character-images.csv` committed; build warns on unmapped |
| 0 = unscored not absent | Data pipeline (define filtering contract) | TDD: `0,0` pair passes through filter |
| Distribution/Seasonality overlap | Design phase | Decision documented in PROJECT.md; excluded or explicitly separated |
| Sparse JSON artifact size | Data pipeline (encoding decision) | Post-build: artifact ≤ 100 KB |
| AND/OR inversion | Client component (TDD filter function) | Tests: two-state-same-question widens; two-question narrows |
| Species binomial slug drift | Data pipeline (slug resolution script) | Coverage report emitted; Grammia synonyms in species-synonyms.csv |
| Ecoregion name mismatches | Design phase (if Distribution excluded: moot) | If included: explicit mapping in key-character-images.csv |
| 237-checkbox panel UX | Client component (hierarchy rendering) | Category accordion renders ≤8 collapsed sections by default |
| No-JS degradation | Identify page template phase | Page loads without JS; lychee passes; page-weight check passes |
| bunny.net re-upload without manifest | Image pipeline phase | DRY_RUN=1 shows 0 files when manifest is all-uploaded |
| Thumbnail grid broken images | Client component (results grid) | Gray placeholder renders; no `<img>` pointing to unconfirmed CDN paths |
| FilterChangeDetail contamination | Client component (design) | `FilterChangeDetail` in events.ts unchanged; grep confirms |
| O(n×m) typed-array performance | Data pipeline (encoding) + client component (filter impl) | Chrome DevTools 4× CPU: filter response <50ms |

---

## Sources

- Direct inspection: `/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key.csv` (237 × 1228 matrix; all cell values are `0` or `1`; confirmed 3 all-zero species; 2 double-space binomials; yes/no pair analysis showing 95% unscored rate for stigma sub-questions)
- Direct inspection: `may 6 2015 key media/Images/` (2003 files: 1959 species photos `Genus epithet-A-D.jpg`, 44 character illustrations including 19 `US_*.jpg` ecoregion maps) and `Thumbs/` (1980 files, `_TN.jpg` suffix, 5 illustration thumbnails missing)
- `.planning/PROJECT.md` Key Decisions (bunny.net upload idempotency D-03; DRY_RUN guard convention; advanceStatus-before-delete invariant; JSON over Parquet for species-states.json; similar-species gray placeholder; pnwm-filter-change event bus; FilterChangeDetail typed interface; page-weight 500 KB threshold D-11; pathPrefix conditional)
- `scripts/check-page-weight.ts` — confirms threshold is HTML-only, 500 KB
- `scripts/upload-tiles.ts` — manifest-driven idempotency pattern to replicate
- `scripts/verify-parquet.ts` — scan-all-then-summarize validation pattern
- `scripts/emit-species-states.ts` — side-loaded JSON artifact pattern
- `src/types/events.ts` — FilterChangeDetail 8-field interface; HTMLElementEventMap augmentation
- `data/species-synonyms.csv` — confirmed empty (header only); no existing key synonym entries
- `data/species.csv` cross-referenced against key binomials: 53 unmatched; Grammia → Apantesis genus reclassification confirmed; 10 key genera absent from site

---
*Pitfalls research for: v4.0 Key Characters Identify page — adding Lucid character-filter to pnwmoths static site*
*Researched: 2026-06-24*
