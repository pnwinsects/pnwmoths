# Phase 25: Similar Species Thumbnails - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 1 (species.njk — modify lines 83–96) plus theme.css (add rules)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/species/species.njk` lines 83–96 | template | request-response (static build) | `src/species/species.njk` lines 36–62 (slideshow block) | exact — same file, same CDN image pattern |
| `src/styles/theme.css` (new rules) | styles | n/a | `src/components/pnwm-image-slideshow.js` `.thumbnail-strip` CSS block | role-match — same visual strip pattern |

---

## Pattern Assignments

### `src/species/species.njk` — Similar Species Section (lines 83–96)

**Analog:** Same file, lines 36–54 (the `{% set spImages %}` + CDN `<img>` pattern)

**Existing section to replace** (`src/species/species.njk` lines 83–96):
```nunjucks
{% if sp.similar_slugs and sp.similar_slugs.length > 0 %}
  <section>
    <h2>Similar species</h2>
    <ul>
      {% for slug in sp.similar_slugs %}
        {% for s in species %}
          {% if s.slug == slug %}
            <li><a href="{{ ('/species/' + slug + '/') | url }}">{{ s.common_name or (s.genus + ' ' + s.species) }}</a></li>
          {% endif %}
        {% endfor %}
      {% endfor %}
    </ul>
  </section>
{% endif %}
```

**CDN image URL pattern** (`src/species/species.njk` lines 36–42) — replicate for each similar slug:
```nunjucks
{% set spImages = images[sp.slug] %}
...
<img src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}"
     alt="{{ sp.genus }} {{ sp.species }}"
     ...>
```
For similar species, adapt as:
```nunjucks
{% set simImages = images[slug] %}
{# Use simImages[0] — images are pre-sorted by weight ascending in images.js #}
{{ cdnBaseUrl }}/{{ slug }}/{{ simImages[0].filename | urlencode }}
```

**Species name display pattern** (`src/species/species.njk` line 90):
```nunjucks
{{ s.common_name or (s.genus + ' ' + s.species) }}
```

**Link URL pattern** (`src/species/species.njk` line 90):
```nunjucks
href="{{ ('/species/' + slug + '/') | url }}"
```

**Target replacement structure — new similar species section:**
```nunjucks
{% if sp.similar_slugs and sp.similar_slugs.length > 0 %}
  <section class="similar-species">
    <h2>Similar species</h2>
    <div class="similar-species-row">
      {% for slug in sp.similar_slugs %}
        {% for s in species %}
          {% if s.slug == slug %}
            {% set simImages = images[slug] %}
            <a href="{{ ('/species/' + slug + '/') | url }}" class="similar-species-entry">
              {% if simImages and simImages.length > 0 %}
                <img src="{{ cdnBaseUrl }}/{{ slug }}/{{ simImages[0].filename | urlencode }}"
                     alt="{{ s.genus }} {{ s.species }}"
                     height="93"
                     loading="lazy">
              {% else %}
                <div class="similar-species-placeholder" aria-hidden="true"></div>
              {% endif %}
              <span class="similar-species-name">{{ s.common_name or (s.genus + ' ' + s.species) }}</span>
            </a>
          {% endif %}
        {% endfor %}
      {% endfor %}
    </div>
  </section>
{% endif %}
```

---

### `src/styles/theme.css` — New CSS Rules for Similar Species Row

**Analog:** `src/components/pnwm-image-slideshow.js` `.thumbnail-strip` and `.thumbnail` CSS block (lines 26–51)

**Thumbnail strip pattern from Phase 23 slideshow** (lines 26–51 of pnwm-image-slideshow.js):
```css
/* In component shadow DOM — use as model for plain CSS equivalent */
.thumbnail-strip {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  margin-top: 8px;
}
.thumbnail-strip::-webkit-scrollbar { display: none; }
.thumbnail {
  flex-shrink: 0;
  height: 93px;
  width: auto;
}
.thumbnail img {
  height: 93px;
  width: auto;
  display: block;
}
```

**Pico CSS tokens in use** (`src/styles/theme.css` line 9 and pnwm-image-slideshow.js line 52):
- Background: `--pico-background-color: #f3e8ba` (cream page background)
- Muted color: `--pico-muted-color` (used for caption text in slideshow)
- Placeholder candidate: `--pico-muted-background` (a Pico token for muted/neutral backgrounds)

**Target CSS rules to append to `src/styles/theme.css`:**
```css
/* --- Similar species thumbnail row (Phase 25) --- */

.similar-species-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  padding-bottom: 4px;
}
.similar-species-row::-webkit-scrollbar { display: none; }

.similar-species-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  text-decoration: none;
  color: inherit;
  max-width: 120px;
}
.similar-species-entry:hover .similar-species-name {
  text-decoration: underline;
}

.similar-species-entry img {
  height: 93px;
  width: auto;
  display: block;
  object-fit: contain;
}

.similar-species-placeholder {
  height: 93px;
  width: 72px;  /* approximate average thumbnail width */
  background-color: var(--pico-muted-background, #e0d8c0);
  border-radius: 2px;
}

.similar-species-name {
  font-size: 0.8rem;
  text-align: center;
  color: var(--pico-color, #333);
  line-height: 1.3;
  word-break: break-word;
}
```

---

## Shared Patterns

### CDN URL Construction
**Source:** `src/species/species.njk` lines 41, `eleventy.config.js` lines 16 and 57
**Apply to:** The `<img src>` attribute for each similar species thumbnail
```nunjucks
{# cdnBaseUrl is exposed globally via eleventyConfig.addGlobalData("cdnBaseUrl", CDN_BASE_URL) #}
{# CDN_BASE_URL = "https://pnwmoths.b-cdn.net" — hard-coded, not an env var #}
src="{{ cdnBaseUrl }}/{{ slug }}/{{ simImages[0].filename | urlencode }}"
```

### urlencode Filter
**Source:** `eleventy.config.js` line 43 (`eleventyConfig.addFilter("urlencode", v => encodeURIComponent(v))`)
**Apply to:** All CDN filename references — required because Django filenames may contain spaces, parens, and `+`.

### images[slug] Lookup
**Source:** `src/species/species.njk` line 36 (`{% set spImages = images[sp.slug] %}`)
**Apply to:** Similar species image lookup — `{% set simImages = images[slug] %}` inside the `{% for slug in sp.similar_slugs %}` loop. Images are already sorted by weight ascending (lowest weight = hero image) — `simImages[0]` is the thumbnail.

### Link URL Pattern
**Source:** `src/species/species.njk` line 90
**Apply to:** The wrapping `<a>` for each similar species entry
```nunjucks
href="{{ ('/species/' + slug + '/') | url }}"
```
The `| url` filter applies the pathPrefix (conditional on `GITHUB_PAGES` env var per project memory).

### Double-Loop Slug Lookup
**Source:** `src/species/species.njk` lines 87–93 — inner `{% for s in species %}{% if s.slug == slug %}` pattern
**Apply to:** Same pattern preserved in new thumbnail row. This is the established way to resolve a slug to a full species object (no hashmap exists in the template layer).

### `loading="lazy"` on Below-Fold Images
**Source:** `src/species/species.njk` (the main slideshow images do NOT use lazy — they are above the fold). The similar species section is below the fold, so `loading="lazy"` should be added, consistent with the CONTEXT note at line 75.

---

## No Analog Found

None — all patterns have clear analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/species/species.njk`, `src/styles/theme.css`, `src/components/pnwm-image-slideshow.js`, `src/_data/images.js`, `eleventy.config.js`
**Files scanned:** 5
**Pattern extraction date:** 2026-05-20
