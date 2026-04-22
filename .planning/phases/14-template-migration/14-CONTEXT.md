# Phase 14: Template Migration - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `CDN_BASE_URL` into all Eleventy templates and `pnwm-taxon-browser.js` so every image URL in the built site resolves through bunny.net CDN. All `/images/` local paths in templates and the browser component are replaced with CDN URLs using Optimizer query params.

Phase 14 does NOT remove LFS or git history (Phase 15), does NOT clean up build-time image scripts (Phase 16).

Note: ROADMAP success criteria #1 (fail-fast guard when `CDN_BASE_URL` absent) is **superseded** by Phase 13 D-02 — `CDN_BASE_URL` is hard-coded as a public constant, so it cannot be absent. No fail-fast guard is needed.

</domain>

<decisions>
## Implementation Decisions

### URL Encoding

- **D-01:** Add a custom `urlencode` Nunjucks filter in `eleventy.config.js` using `encodeURIComponent`:
  ```js
  eleventyConfig.addFilter("urlencode", v => encodeURIComponent(v));
  ```
  Use as `{{ img.filename | urlencode }}` in templates. This handles all reserved characters in Django filenames (spaces, parentheses, `+`, `#`, etc.), not just spaces. Do NOT use `| replace(' ', '%20')` — it silently mishandles other reserved chars.

### CDN URL Exposure to Templates

- **D-02:** Expose `CDN_BASE_URL` to Nunjucks templates via `addGlobalData('cdnBaseUrl', CDN_BASE_URL)` in `eleventy.config.js`. Templates construct CDN URLs as `{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}`. No separate `cdnUrl` filter is needed (TMPL-02 was dropped in Phase 13, D-02).

### srcset (TMPL-06)

- **D-03:** Add `srcset` with 2× width descriptor to **glossary portraits only**. Glossary portrait dimensions are known (188×225px, Optimizer params: `?width=188&height=225&crop_gravity=north`), so 2× is: `?width=376&height=450&crop_gravity=north 2x`.
- **D-04:** Species photo `srcset` is **deferred**. The `<pnwm-image-slideshow>` component reads only `src` and `alt` from slotted `<figure><img>` elements in `connectedCallback` — a `srcset` attribute on static Nunjucks HTML would be silently dropped. Species srcset requires a separate component update; defer to a follow-up phase when the slideshow is being touched.

### Taxon Browser CDN Wiring (TMPL-05)

- **D-05:** Hard-code `CDN_BASE_URL` directly inside `pnwm-taxon-browser.js` as a module-level constant. Do NOT add a new `cdn-base-url` Lit attribute. Rationale: the CDN URL is a fixed public constant (same in production, preview, and local dev) — no reason to pass it through the template. The existing `path-prefix` attribute stays for non-image URLs (species page links). All image `src` construction in `_renderImageStrip` and `_renderSpeciesCard` switches from `${this._prefix}images/${img.species_slug}/${img.filename}` to `${CDN_BASE_URL}/${img.species_slug}/${encodeURIComponent(img.filename)}`.

### Dropped Requirements (Phase 13 decisions carry forward)

- **TMPL-01 dropped**: No fail-fast guard for missing `CDN_BASE_URL`. URL is hard-coded; it cannot be absent.
- **TMPL-02 dropped**: No `.env.example`, no `dotenv` package, no `cdnUrl` Nunjucks filter abstraction.
- **CDN-03 revised**: No `CDN_BASE_URL` GitHub Actions secret. The constant is already in code.

### Claude's Discretion

- Whether to add Optimizer query params to species photo CDN URLs in `species.njk` (e.g. a width cap for performance). The ROADMAP success criteria only requires CDN URLs — Optimizer params on species photos are optional for Phase 14.
- Nav thumbnail Optimizer param in `pnwm-taxon-browser.js`: `?height=186` (D-11 from Phase 13 — confirmed, no change needed).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TMPL-01 through TMPL-06; note TMPL-01 and TMPL-02 are superseded by Phase 13 D-02

### Phase 13 Context (critical decisions carry forward)
- `.planning/phases/13-cdn-provisioning/13-CONTEXT.md` — D-01 (hard-coded CDN constant), D-02 (TMPL-01/TMPL-02 dropped), D-06 (filename spaces require URL encoding), D-10 (glossary Optimizer params), D-11 (nav thumb ?height=186), D-18 (Image Classes disabled — use direct query params)

### Roadmap
- `.planning/ROADMAP.md` §Phase 14 — success criteria (note SC-1 superseded by D-02 from P13)

### Templates to update
- `src/species/species.njk` line 48 — `/images/{{ sp.slug }}/{{ img.filename }}` → CDN URL
- `src/glossary/index.njk` line 41 — `('/images/glossary/' + term.image_filename) | url` → CDN URL + srcset
- `src/browse/index.njk` line 12 — `<pnwm-taxon-browser path-prefix>` — no change needed (cdn-base-url NOT passed)

### Component to update
- `src/components/pnwm-taxon-browser.js` — image src construction at lines ~143, ~199; add CDN_BASE_URL constant; update `encodeURIComponent` for filename spaces

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `eleventy.config.js` — `CDN_BASE_URL` constant already present at line 14; `addFilter` pattern already used for `fileExists` and `tojson`
- `src/components/pnwm-taxon-browser.js` — `this._prefix` already gates image URLs; refactor to use CDN_BASE_URL constant instead

### Established Patterns
- Nunjucks filters: `addFilter(name, fn)` pattern already used in `eleventy.config.js`; `urlencode` fits the same shape
- Glossary template uses inline `width`/`height` attributes on `<img>` (line 43) — add `srcset` alongside these existing attributes
- Species template has no `width`/`height` on species photo `<img>` (line 48) — no srcset needed here in Phase 14

### Integration Points
- `eleventy.config.js` exposes global data to all templates via `addGlobalData`; `cdnBaseUrl` follows the same pattern as any other global
- The `| url` filter MUST NOT be used on CDN URLs (absolute URLs) — it corrupts them by prepending pathPrefix (per STATE.md decision)

</code_context>

<specifics>
## Specific Ideas

- Glossary `srcset` syntax: `<img src="{{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=188&height=225&crop_gravity=north" srcset="{{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=376&height=450&crop_gravity=north 2x" alt="{{ term.term }}" width="188" height="225">`
- Species photo `src` syntax: `<img src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}" alt="{{ sp.genus }} {{ sp.species }}" data-photographer="{{ img.photographer }}">`
- Taxon browser CDN constant: `const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';` at top of module, before class definition

</specifics>

<deferred>
## Deferred Ideas

- Species photo `srcset` — requires updating `pnwm-image-slideshow.js` to read and forward `srcset` from slotted figures; defer to a follow-up phase or Phase 16 when slideshow is next touched
- Optimizer query params on species factsheet photos (width cap for performance) — not required by Phase 14 success criteria; consider in Phase 16 or post-v1.4

</deferred>

---

*Phase: 14-template-migration*
*Context gathered: 2026-04-22*
