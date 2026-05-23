# Phase 31: `data/species-photos.json` Build Integration - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 31 materializes `data/species-photos.json` from the manifest's `uploaded` rows and wires the Eleventy build to use it. The deliverable is:

1. `scripts/generate-species-photos.js` — reads `data/species-photos-manifest.csv`, filters `status: uploaded` rows, groups by `species_slug`, and writes `data/species-photos.json` with per-species entries. Operator runs `npm run photos:materialize` after the upload pipeline completes and commits the result. Follows the `data/plates.json` committed-snapshot pattern from Phase 18.
2. `data/species-photos.json` updated — the pilot's hand-edited `abagrotis-apposita` entry (Phase 28) is replaced by a manifest-derived entry with no user-visible change.
3. `src/species/species.njk` updated — a template guard wraps the `images.csv` `<figure>` loop so that high-res species render only their high-res entries. Low-res `<figure>` elements are suppressed entirely for those species (they do not appear in static HTML output).

**Out of scope for Phase 31:** OSD viewer wiring in the lightbox (Phase 32). Carousel thumbnail rendering from `high-res-specimens` (Phase 32). Any change to `scripts/upload-tiles.js` or the upload pipeline.

</domain>

<decisions>
## Implementation Decisions

### Generation mechanism
- **D-01 (script + commit pattern):** `scripts/generate-species-photos.js` is a standalone script; operator runs `npm run photos:materialize` after the upload pipeline and commits `data/species-photos.json`. Follows the `data/plates.json` committed-snapshot pattern. `src/_data/speciesPhotos.js` reads the committed JSON at Eleventy build time — no manifest CSV parsing at build time.
- **D-02 (npm alias):** `photos:materialize` — following the `photos:ingest` / `photos:tile` / `photos:upload` naming convention.

### DATA-03 — legacy low-res replacement (requirement correction)
- **D-03 (high-res replaces, not coexists):** High-res photos fully replace low-res entries on a per-species basis. For a species with `high_res_available: true`, the low-res `<figure>` elements from `images.csv` are suppressed in the template — they do not appear in the static HTML output at all.
- **D-04 (template guard location):** The guard wraps the `{% if spImages and spImages.length > 0 %}` block in `src/species/species.njk` — change to `{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}`. The `<pnwm-image-slideshow>` component still receives `high-res-available` and `high-res-specimens` attributes; the slot content is simply empty for high-res species until Phase 32 adds component-side thumbnail rendering.

### Claude's Discretion
- **Script logging:** Follow `upload-tiles.js` / `tile-photos.js` pattern — `logStage`-style per-species output, summary at end (count uploaded, species with high-res, total specimens).
- **Multi-specimen ordering in JSON array:** Alphabetical by `specimen_id`, then D before V within the same specimen.
- **`DRY_RUN=1` behavior:** Print the derived JSON (or a summary) without writing `data/species-photos.json`. Consistent with other `photos:` scripts.
- **Self-contained helpers:** No shared-module imports; copy `redact` and `logStage` from `tile-photos.js` verbatim (project convention D-13 from Phase 26).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 31 charter
- `.planning/ROADMAP.md` §"Phase 31: `data/species-photos.json` Build Integration" — goal + 5 success criteria (SC-1..SC-5); DATA-01, DATA-02, DATA-03 traceability
- `.planning/REQUIREMENTS.md` — DATA-01 (JSON derived from uploaded rows), DATA-02 (`high_res_available` boolean in Eleventy data tree), DATA-03 (high-res replaces low-res, template renders only high-res)

### Manifest library and source data
- `scripts/lib/manifest.js` — `readManifest`, `writeManifest`, `advanceStatus`, `COLUMNS`; Phase 31 uses `readManifest` read-only; does NOT write back to the manifest
- `data/species-photos-manifest.csv` — input source; 4,935 rows; Phase 31 filters `status: uploaded`

### Output file and Eleventy data wiring
- `data/species-photos.json` — output file; shape locked by the Phase 28 pilot entry (`{high_res_available: bool, specimens: [{specimen_id, view, tiles_path}]}`); downstream agents MUST preserve this shape
- `src/_data/speciesPhotos.js` — Eleventy data loader that reads `data/species-photos.json` and exposes `speciesPhotos` as a global data variable; must keep working unchanged
- `src/species/species.njk` — template to modify for DATA-03 guard; uses `speciesPhotos[sp.slug]` and `images[sp.slug]`

### Prior art to follow
- `data/plates.json` — committed-manifest pattern reference (Phase 18); static JSON committed to repo, read by Eleventy data file
- `scripts/upload-tiles.js` — script shape to mirror: env var pattern (`BUNNY_API_KEY`-style at module top), `DRY_RUN=1` convention, logStage format, self-contained helpers
- `.planning/phases/30-bunny-net-upload-of-tile-pyramids-bulk/30-CONTEXT.md` — locked decisions L-01..L-08 and D-01..D-04; also carries the `tiles_path` URL convention (`species-tiles/{species_slug}/{specimen_id}-{view}/`)

### Project context
- `.planning/PROJECT.md` — CDN_BASE_URL; flat-file ethos; Key Decisions table (especially DRY_RUN and advanceStatus ordering invariants from v2.2 phases)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/lib/manifest.js` — `readManifest`**: Read-only use in this phase. Returns row objects keyed by COLUMNS. Filter `status === 'uploaded'`.
- **`data/species-photos.json` (pilot shape)**: JSON keyed by `species_slug`; each value has `{high_res_available: true, specimens: [{specimen_id, view, tiles_path}]}`. Phase 31's script must emit exactly this shape.
- **`scripts/upload-tiles.js` helpers**: `logStage`, `redact` — copy verbatim per the project's self-contained-script convention.

### Established Patterns
- **Committed JSON (`data/plates.json`)**: Static JSON file committed to the repo; Eleventy reads it at build time via `src/_data/plates.js`. Phase 31 follows the same pattern for `species-photos.json`.
- **`photos:` npm alias prefix**: `photos:ingest`, `photos:investigate`, `photos:tile`, `photos:upload` — new alias is `photos:materialize`.
- **`DRY_RUN=1` guard before side-effects**: Established in Phase 30 (D-01). Print what would be written, then exit.
- **`species_slug` lowercase unconditionally**: CDN paths must be lowercase. Phase 29 fixed a mixed-case bug; Phase 31 must enforce lowercase when constructing `tiles_path`.

### Integration Points
- **`src/_data/speciesPhotos.js`** reads `data/species-photos.json`; Phase 31 must not change this loader — the output JSON shape must remain backward-compatible.
- **`src/species/species.njk` line 36–71**: Template uses both `images[sp.slug]` (images.csv) and `speciesPhotos[sp.slug]` (high-res JSON). The DATA-03 guard goes around the `{% if spImages and spImages.length > 0 %}` block starting at line 47.
- **Phase 32 dependency**: Phase 32 will add carousel thumbnail rendering from `high-res-specimens` inside the Lit component shadow DOM. Phase 31 leaving the `<figure>` slot empty for high-res species is the correct state for Phase 32 to build on.

</code_context>

<specifics>
## Specific Ideas

- **DATA-03 corrected requirement:** User clarified that the intent is for high-res photos to **replace** low-res entries (not be layered alongside them). "No double rendering" means the low-res `<figure>` elements are absent from the HTML entirely, not merely ignored by the component. This is a stronger requirement than "both present, component picks one."
- **`tiles_path` construction:** CDN tile path for each specimen: `species-tiles/${slug.toLowerCase()}/${specimen_id}-${view}` — strip trailing slash. Matches the convention validated in Phase 28 pilot and locked in Phase 29/30.
- **Pilot entry replacement (SC-5):** After `photos:materialize` runs against a manifest that has `abagrotis-apposita` rows with `status: uploaded`, the hand-edited pilot entry is replaced by the manifest-derived entry with identical content (same specimen A, D and V views, same tiles_path). No visible change to the species page.

</specifics>

<deferred>
## Deferred Ideas

- **No-JS fallback for high-res species**: When `high_res_available: true` and `<figure>` elements are suppressed, high-res species have no photos in the no-JS case. The appropriate fallback (message, placeholder, or static tile URL) is a Phase 32 concern — the Lit component can handle it inside shadow DOM or via a noscript block.
- **Phase 32 thumbnail source**: With low-res `<figure>` slot content suppressed, Phase 32 must add carousel thumbnail rendering from the `high-res-specimens` attribute. The specific thumbnail approach (DZI thumbnail tile, fallback placeholder) is Phase 32's design decision.

### Reviewed Todos (not folded)
- "Fix close button on the lightbox" — UI concern; not data integration; deferred for a future UI phase
- "Migrate Pagefind to Component UI" — UI concern; out of scope for Phase 31

</deferred>

---

*Phase: 31-data-species-photos-json-build-integration*
*Context gathered: 2026-05-23*
