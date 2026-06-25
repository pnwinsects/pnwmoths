# Phase 43: Character Illustration Images - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 43 delivers three connected pieces so the `/identify/` filter panel can show
help illustrations on demand:

1. **Idempotent CDN upload script** (`npm run key:upload-images`) — uploads the key's
   character-state illustration images to bunny.net Storage under `key-images/`, reusing
   the `scripts/upload-tiles.ts` curl-PUT / `DRY_RUN=1` / retry / overwrite-idempotent
   pattern. Converts each source image to **WebP, keeping original dimensions** (no resize).
2. **Curator mapping** `data/key-character-images.csv` — committed, columns
   `char_id, image_filename, alt_text`; one image per character state. Shipped as an
   **auto-generated draft** (state-name↔filename matcher) that the curator then corrects
   and extends by hand. Coverage is best-effort/sparse; the build warns on any out-of-range
   `char_id` and soft-skips if the file is absent.
3. **`<details>/<summary>` help expanders** in the filter panel (`pnwm-identify.ts`) beside
   mapped character states: opening one shows the CDN WebP image. States with no mapping
   render no expander; the page stays fully functional with an empty mapping.

Requirements covered: CIMG-01, CIMG-02, CIMG-03.

**Out of scope (Claude / UI-spec discretion this phase — see Discretion below):** exact
expander placement (per-checkbox vs grouped), `<summary>` label wording, in-panel image
sizing, and whether help images appear in the no-JS static fallback.

</domain>

<decisions>
## Implementation Decisions

### Image source & processing (CIMG-01)
- **D-01 — Source = the local extracted Lucid key media.**
  `/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key media/Images/` (2,003 files;
  already extracted, no tar work needed). The same media also lives in the legacy dump under
  `.../static/media/lucidkey/key/PNW Moths/Media/Images/` as the canonical archival copy.
- **D-02 — Upload only the character-state illustrations (~198), not the specimen photos.**
  ~1,811 of the 2,003 files are species specimen photos (filename pattern
  `Genus species-A-D.jpg`) that duplicate plates already on the CDN — **exclude them**. The
  remaining ~198 are genuine character-state illustrations with descriptive filenames
  (`Black Forewing.jpg`, `Eyespot present hindwing.jpg`, `Ecoprovince_Coast_and_Mts.jpg`,
  `forewing discal spot present.jpg`).
- **D-03 — Keep original dimensions; convert to WebP.** No resize. Source JPEGs vary widely
  (e.g. 399×206, 1245×495, 1080×1317). One WebP derived asset per uploaded illustration.
  (Conversion tooling — `cwebp` / `sharp` / `sips` — is planner/researcher discretion.)
- **D-04 — CDN layout + idempotency mirror upload-tiles.** Upload under `key-images/` on the
  `pnwmoths` Storage Zone; `DRY_RUN=1` prints a pre-flight upload list with zero API calls;
  re-running with everything already uploaded produces zero new PUTs (bunny PUT overwrite is
  idempotent). All execution is local (no datacenter server).

### CSV schema & mapping (CIMG-02)
- **D-05 — Per-state, one image.** One CSV row per `char_id` → one `image_filename`.
  Matches the data exactly (filenames are state descriptions; `char_id` = `Character.id` in
  `data/key-matrix.json`) and the roadmap's "maps character IDs to filenames."
- **D-06 — Columns: `char_id, image_filename, alt_text`.** Curator may write meaningful
  `alt_text`; when blank, the render derives alt text from the character's `state` name.
- **D-07 — Auto-generate the draft CSV and commit it.** A one-off matcher links
  `key-matrix.json` state names to the uploaded filenames (normalized match) and writes the
  initial CSV (≈49 exact matches on normalized state text today, concentrated in Forewing
  24/65 and Hindwing 24/45; fuzzy matching should raise this). The committed draft is the
  curator's starting point — they correct/extend by hand. **Not** build-time auto-matching
  (too brittle: renames/typos would silently drop images) and **not** empty-from-zero.

### Build behavior (CIMG-02/03)
- **D-08 — Best-effort, non-fatal.** Build warns on any `char_id` out of range; soft-skips if
  `data/key-character-images.csv` is absent; states without a mapping render no expander.

### Claude's Discretion (left to research / planning / UI-spec)
- **Expander UI** — placement (one `<details>` per state checkbox vs grouped near the
  `<fieldset><legend>`), `<summary>` label wording, and in-panel WebP image sizing. The
  per-state mapping (D-05) implies a per-state expander; final treatment is UI-spec's call.
- **No-JS fallback** — whether help images surface in the separate plain-text no-JS hierarchy
  (Phase 41 D-08) or only in the live JS panel. `<details>` is native HTML, but the panel is
  client-rendered; deferred to UI-spec / planning.
- **WebP conversion tool** and the exact normalized-matching algorithm for the draft CSV.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 43: Character Illustration Images" — goal + SC1–SC3.
- `.planning/REQUIREMENTS.md` — CIMG-01 (idempotent CDN upload, resize/process), CIMG-02
  (curator CSV mapping), CIMG-03 (`<details>/<summary>` expanders, soft-degrade).

### Existing code to extend / mirror
- `scripts/upload-tiles.ts` — the curl-PUT / `DRY_RUN` / retry / status / idempotent-overwrite
  upload pattern to mirror for `key:upload-images` (CIMG-01). See also
  `scripts/upload-tiles.test.ts` and `scripts/lib/manifest.ts`.
- `scripts/build-key.ts` — where `data/key-matrix.json` is produced; likely host for the
  CSV-validation warning (out-of-range `char_id`) and the inlined-data wiring.
- `scripts/copy-key-matrix.ts` — precedent for copying key data assets into `_site/`.
- `src/components/pnwm-identify.ts` — the Light-DOM Lit filter panel; `_renderQuestion()`
  (`<fieldset><legend>` + per-state `<label><input type=checkbox>`) is where the per-state
  expander attaches. `Character` carries `{ id, category, question, state }`; `char_id` = `id`.
- `src/components/pnwm-identify.test.ts` — test patterns for the panel.

### Data inputs
- `data/key-matrix.json` — `characters[]` (237 states with `id`/`category`/`question`/`state`);
  state text is the join key for the draft-CSV matcher.
- Source images: `/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key media/Images/`
  (local, already extracted). Archival copy in the dump at
  `~/dev/pnwinsects-app/pnwmoths_https.tar.xz` →
  `.../static/media/lucidkey/key/PNW Moths/Media/Images/` (18 GB tar — avoid; use the local copy).
- The Lucid binary key files (`PNW Moths.lkc4/.data/.sco/.fil/.dep`) hold the authoritative
  feature→state→image mapping if filename-matching ever proves insufficient — a fallback, not
  the planned path.

### Prior-phase context
- `.planning/phases/41-identify-page-scaffold-filter-panel/41-CONTEXT.md` — panel architecture
  (Light DOM + Pico, inlined `#key-char-data`, separate plain-text no-JS fallback D-08).
- `.planning/phases/42-results-grid/42-CONTEXT.md` — most recent panel/grid wiring.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/upload-tiles.ts`: manifest-driven, idempotent curl-PUT uploader with `DRY_RUN`,
  retry, and status advancement — the direct template for `key:upload-images`.
- `src/components/pnwm-identify.ts` `_renderQuestion()`: the per-state `<label><input>` render
  site where the `<details>` expander is added when a `char_id` has a mapping.

### Established Patterns
- bunny.net Storage uploads via curl PUT (`BUNNY_API_KEY` from env, never committed/logged);
  idempotent overwrite; `DRY_RUN=1` for pre-flight. All operations run locally (no server).
- Key build assets flow through `scripts/build-key.ts` → `data/key-matrix.json` → copied to
  `_site/` (`scripts/copy-key-matrix.ts`); the panel reads inlined `#key-char-data` + fetches
  `key-matrix.json`.
- `pathPrefix` for CDN/asset URLs is conditional on `GITHUB_PAGES` — never hardcode `/pnwmoths/`.

### Integration Points
- New npm script `key:upload-images` (package.json) → `scripts/` uploader.
- New committed `data/key-character-images.csv` (auto-generated draft).
- `pnwm-identify.ts` renders the `<details>` expander per mapped state; the mapping must reach
  the client (inlined into `#key-char-data` alongside the character hierarchy is the likely path).

</code_context>

<specifics>
## Specific Ideas

- Character-illustration filenames already read as state descriptions — e.g. `Black Forewing.jpg`,
  `Transparent Forewing.jpg`, `Eyespot present hindwing.jpg`, `Abdomen striped.jpg`,
  `forewing discal spot present.jpg`. This is why the draft CSV can be machine-matched (D-07).
- Distribution/Seasonality/Size states largely lack matching illustrations (or use `US_` /
  `Ecoprovince_` prefixed files) — expect low coverage there; morphological categories cover best.
- Specimen-photo exclusion filter: filename pattern `^[A-Z][a-z]+[ -][a-z]+.*-[A-Z]-[A-Z]\.jpg$`
  identified ~1,811 of 2,003 files as species photos to skip.

</specifics>

<deferred>
## Deferred Ideas

- **Expander UI lock-down** (placement, `<summary>` wording, image sizing) — intentionally left to
  UI-spec / planning this phase (user chose to leave it to discretion).
- **Help images in the no-JS fallback** — open question for UI-spec; not committed.
- **Parsing the Lucid binary `.lkc4/.data` files** for an authoritative feature→state→image map —
  only if filename-matching coverage proves inadequate after curation.

None of the above expand phase scope.

</deferred>

---

*Phase: 43-character-illustration-images*
*Context gathered: 2026-06-25*
