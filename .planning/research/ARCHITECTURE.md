# Architecture Research: v4.0 Key Characters — Identify Page

**Domain:** Lucid-style character-filter identification page in a static Eleventy/Vite/Lit site
**Researched:** 2026-06-24
**Confidence:** HIGH — based on direct inspection of key.csv, all referenced source files, and the existing build pipeline

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  BUILD-TIME PIPELINE (local + GitHub Actions)                        │
│                                                                      │
│  data/key.csv ──► scripts/build-key.ts ──► data/key-matrix.json     │
│  (237×1228 matrix)    (ingest + match)      (artifact, consumed      │
│                            │                 by Eleventy + client)   │
│                            │                                         │
│             data/species.csv + data/species-synonyms.csv             │
│             data/images.csv (nav thumbnails)                         │
│                            │                                         │
│                            ▼                                         │
│             data/key-coverage-report.json  (unmatched binomials)     │
│                                                                      │
│  data/key-character-images.csv ─► (validated in build-key.ts)        │
│  (manual curator map: char_id → CDN filename)                        │
│                                                                      │
│  key media/Images/ ──► scripts/upload-key-images.ts ──► bunny.net   │
│  (~243 char illustrations   (one-shot, idempotent)     CDN bucket    │
│   + ~1760 specimen photos)                             /key-images/  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    data/key-matrix.json
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  ELEVENTY BUILD (src/_data/ + src/identify/)                         │
│                                                                      │
│  src/_data/keyMatrix.ts ──► reads data/key-matrix.json              │
│      (Eleventy data file)    exposes { characters, species }         │
│                              to templates                            │
│                                                                      │
│  src/identify/index.njk ──► _site/identify/index.html               │
│      inlines { characters, species } in <script type="application/  │
│      json" id="key-matrix-data">                                     │
│      <noscript> renders character group headings + full species list │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT RUNTIME (browser, JS-enabled)                                │
│                                                                      │
│  pnwm-identify (Lit, light DOM)                                      │
│  ├── parses inline JSON (characters[], species[]) synchronously      │
│  ├── fetches _site/key-matrix.json (matrix[][]) at connectedCallback │
│  ├── character-filter-panel (Lit, light DOM) — filter sidebar        │
│  │     8 collapsible categories; each character state is a checkbox; │
│  │     character help image shown on demand (CDN /key-images/)       │
│  └── key-results-grid (Lit, light DOM) — results area               │
│        flat thumbnail grid; "N of M species match" count;            │
│        each card links to /species/{slug}/                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key.csv Structure (verified by inspection)

- **237 character-state rows** (rows 1–237 in key.csv; row 0 is the species header)
- **1228 species columns** (binomials in row 0, columns 1–1228)
- **Matrix values:** strictly binary `"0"` / `"1"` — no other values present
- **Matrix density:** 30.2% (87,874 non-zero entries out of 291,036 cells)
- **Label hierarchy depth:** 3-part labels (`Category:Question:State`) and 4-part labels (`Category:Subcategory:Question:State`); no 2-part or 5-part labels
- **8 categories:** Distribution, Size, Seasonality, Eyes, Wing shape and size, Forewing color and pattern, Hindwing color and pattern, Abdomen and thorax
- **Whitespace anomalies in 3 binomials:** `"Tolype  laricis"` (double space), `"Grammia  blakei"` (double space), `"Tyta luctuosa "` (trailing space) — must be normalized before slug construction

---

## Build Pipeline Integration

### New Script: `scripts/build-key.ts`

Sits alongside `build-data.ts` in the `scripts/` directory. Invoked as `npm run build:key`, added to the `npm run build` sequence **after** `build:data` (species.csv is read) and **before** `build:eleventy` (key-matrix.json is consumed by the Eleventy data file).

Modified build script sequence in `package.json`:
```
build:data → build:key → build:eleventy → build:copy-parquet → build:copy-images
           → build:species-states → build:species-photos → build:pagefind
           → build:validate-links → build:check-weight
```

New npm scripts to add:
- `"build:key": "node scripts/build-key.ts"` — runs build-key.ts
- `"build:copy-key-matrix": "node scripts/copy-key-matrix.ts"` — post-eleventy copy (see below)
- `"key:upload-images": "node scripts/upload-key-images.ts"` — one-shot operator upload

`build:copy-key-matrix` must appear in `build` after `build:copy-parquet` (i.e., in the same post-eleventy copy group). The reason is identical to why `copy-parquet.ts` runs post-eleventy: `eleventy-plugin-vite` wipes `_site/` during the Vite output directory rename step.

`build-key.ts` responsibilities:
1. Validate `data/key.csv` (UTF-8, row 0 = species binomials, rows 1–237 = character states in `Category:...:State` format)
2. Validate `data/key-character-images.csv` if it exists (columns: `char_id`, `image_filename`); soft-skip if absent
3. Load `data/species.csv` and `data/species-synonyms.csv` for slug resolution
4. Load `data/images.csv` via DuckDB to resolve primary nav thumbnails for matched species
5. Resolve 1228 key binomials to site slugs (see Slug Resolution section below)
6. Emit `data/key-matrix.json` (consumed by `src/_data/keyMatrix.ts` and served to client)
7. Emit `data/key-coverage-report.json` (unmatched binomials — not served to client, source-controlled)

### Artifact: `data/key-matrix.json`

Lives in `data/` (source-controlled, same as `data/species-photos.json`) and is copied to `_site/key-matrix.json` by `scripts/copy-key-matrix.ts`, making it fetchable at `{pathPrefix}key-matrix.json`.

Shape (types live in `src/types/schemas.ts`):

```typescript
// New Zod schemas to add to src/types/schemas.ts

export const CharacterSchema = z.object({
  id:             z.number(),              // 0-indexed row in key.csv (0 = first char state row)
  category:       z.string(),              // depth-0: "Forewing color and pattern"
  subcategory:    z.nullable(z.string()),  // depth-1 for 4-part labels; null for 3-part
  question:       z.string(),              // depth-2 (4-part) or depth-1 (3-part)
  state:          z.string(),              // last segment: "Washington", "Black", "Yes"
  image_filename: z.nullable(z.string()),  // from key-character-images.csv; null if unmapped
});
export type Character = z.infer<typeof CharacterSchema>;

export const KeySpeciesSchema = z.object({
  slug:        z.string(),
  genus:       z.string(),
  epithet:     z.string(),
  common_name: z.nullable(z.string()),
  nav_image:   z.nullable(z.string()),  // primary nav image filename from images.csv
});
export type KeySpecies = z.infer<typeof KeySpeciesSchema>;

// key-matrix.json top-level shape
// matrix[char_id][species_index] = 0 | 1
// species_index maps to species[species_index].slug
export const KeyMatrixSchema = z.object({
  characters: z.array(CharacterSchema),
  species:    z.array(KeySpeciesSchema),
  matrix:     z.array(z.array(z.number())),  // 237 × N binary rows
});
export type KeyMatrix = z.infer<typeof KeyMatrixSchema>;

// Inline JSON shape (embedded in HTML; excludes heavy matrix)
export const KeyMatrixMetaSchema = z.object({
  characters: z.array(CharacterSchema),
  species:    z.array(KeySpeciesSchema),
});
export type KeyMatrixMeta = z.infer<typeof KeyMatrixMetaSchema>;
```

**Why JSON, not Parquet:** The matrix is 237 × N binary values. As nested JSON arrays it serializes to ~170 KB gzip. Parquet is designed for columnar analytics over typed float/string data — it provides no compression benefit over JSON for a binary integer matrix this small, and would require hyparquet as a client-side dependency on the Identify page for no practical gain. The `species-states.json` precedent (single fetch, JSON.parse, direct use) applies here.

**Size budget (verified):** 237 × 1228 = 291,036 cells × 1 byte = ~284 KB raw nested JSON; gzip compression to ~170 KB. Full matrix as a flat Uint8Array bitset: 36 KB. The nested-array JSON format is chosen for debuggability; optimize to a bitset in a later phase only if network budget becomes an issue.

### Input File: `data/key-character-images.csv`

Curator-maintained. Does not exist in the repo yet. Format:
```csv
char_id,image_filename
0,Washington.jpg
5,US_Coast Range.jpg
...
```

`build-key.ts` validates columns and cross-references `char_id` values against the 0-236 range. Soft-fails if file is absent (all `image_filename` fields emit as `null`). Character illustration images (~243 non-specimen files in the key media folder) must be uploaded to bunny.net under `/key-images/` before this file can be meaningfully populated. Character image coverage is optional — the Identify page ships and is fully usable without any character images; they are incrementally added as the curator maps them.

**Critical finding:** Automated character→image mapping is not feasible. Analysis of the 243 non-specimen images shows filenames do not reliably correspond to character label text via any deterministic pattern. Example: the ecoregion character "Blue Mountains" fuzzy-matches to "Blue.jpg" (a forewing color image) — a false positive. The mapping must be done manually, one character at a time.

---

## Species-to-Slug Matching at Build Time

### Matching results (verified by direct inspection)

- Direct lowercase-hyphen transform (`"Genus species" → "genus-species"`) matches **1175 / 1228 (95.7%)** of key binomials against `data/species.csv`
- **53 unmatched** — all are reclassified taxa; the 17 `Grammia` species (reclassified to `Apantesis` and related genera) are the largest cluster
- `data/species-synonyms.csv` is currently empty (header row only: `from_binomial,to_species_slug`)

### Matching algorithm in `build-key.ts`

```
For each key binomial (column header in row 0):
  1. Normalize: trim(), replace(/\s+/g, ' ')  — handles the 3 whitespace anomalies
  2. Construct direct_slug: lower(genus) + '-' + lower(epithet)
  3. If direct_slug in site_slugs_set → match
  4. Else: check species-synonyms.csv lookup table (from_binomial → to_species_slug)
           If found → match via synonym
  5. Else → emit to coverage report as UNMATCHED; exclude from matrix output
```

The matched species become `species[]` in `key-matrix.json`. Their column indices in the emitted `matrix` arrays correspond to their position in `species[]`, not their original position in key.csv. `build-key.ts` tracks the `key_col_to_species_idx` mapping internally.

### Coverage report: `data/key-coverage-report.json`

Source-controlled in `data/`, not served to `_site/`. Format:
```json
{
  "matched": 1175,
  "unmatched": 53,
  "unmatched_binomials": [
    { "binomial": "Grammia doris", "direct_slug": "grammia-doris", "reason": "no direct match, no synonym" },
    ...
  ],
  "timestamp": "2026-06-24T..."
}
```

Curators populate `data/species-synonyms.csv` from this report to gradually improve coverage. The 53 unmatched includes the empty `species-synonyms.csv` — some of these are genuinely absent from the site (pheosia-rimosa, notodonta-scitipennis, datana-ministra, schizura-ipomoeae, clemensia-albata are not in species.csv at all), while others are reclassified genera that can be resolved via synonyms.

### Nav thumbnails in `key-matrix.json`

For each matched slug, `build-key.ts` queries `data/images.csv` via DuckDB to find the primary nav image (same logic as `taxon.ts`: navigational = 'true' and lowest weight, or lowest-weight image if none flagged navigational). The `nav_image` filename goes into `KeySpecies.nav_image`. This field is used by `key-results-grid` to render CDN thumbnails at `CDN_BASE_URL/{slug}/{nav_image}?height=186`.

---

## Eleventy Data File: `src/_data/keyMatrix.ts`

Mirrors the `speciesPhotos.ts` pattern: reads `data/key-matrix.json`, soft-fails if absent (returns stub with empty arrays, logs a warning). Returns a `KeyMatrixMeta` object (characters + species only; the matrix is NOT inlined into the page HTML — see split-load pattern below).

```typescript
// src/_data/keyMatrix.ts
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { KeyMatrixMeta } from '../types/index.ts';

const MATRIX_PATH = new URL('../../data/key-matrix.json', import.meta.url).pathname;

export default async function (): Promise<KeyMatrixMeta> {
  if (!existsSync(MATRIX_PATH)) {
    console.warn('[key-matrix] data/key-matrix.json not found — identify page will be empty');
    return { characters: [], species: [] };
  }
  // Parse full KeyMatrix, return only the metadata portion (characters + species)
  // The matrix array (~170KB gzip) is served separately and fetched client-side
  const full = JSON.parse(await readFile(MATRIX_PATH, 'utf8')) as { characters: unknown; species: unknown };
  return { characters: full.characters, species: full.species } as KeyMatrixMeta;
}
```

---

## Eleventy Template: `src/identify/index.njk`

Route: `/identify/` → `_site/identify/index.html`. Follows the `src/browse/index.njk` structural pattern.

```njk
---
layout: base.njk
title: Identify — PNW Moths
permalink: /identify/index.html
---
<h1>Identify a moth</h1>

<script type="application/json" id="key-matrix-data" data-pagefind-ignore>
  {{ keyMatrix | tojson | safe }}
</script>

<pnwm-identify path-prefix="{{ '/' | url }}"></pnwm-identify>

<noscript data-pagefind-ignore>
  <p>Use the character filters below to narrow the list of matching species.
     (JavaScript required for interactive filtering.)</p>
  {% for char in keyMatrix.characters %}
    {# Group headings rendered as plain hierarchy — users can read what filters exist #}
  {% endfor %}
  <h2>All {{ keyMatrix.species | length }} species in this key</h2>
  <ul>
    {% for sp in keyMatrix.species %}
      <li><a href="{{ ('/species/' + sp.slug + '/') | url }}">
        <em>{{ sp.genus }} {{ sp.epithet }}</em>
        {% if sp.common_name %} — {{ sp.common_name }}{% endif %}
      </a></li>
    {% endfor %}
  </ul>
</noscript>
```

**No-JS static degradation strategy:** With 237 filter states, no useful pre-filtered static HTML is feasible. The `<noscript>` block provides:
1. Character hierarchy as readable text (tells user what filters exist and how many)
2. Full species list as links (all 1175+ matched species are accessible without JS)

This is the correct degradation level. The filter interaction is fundamentally JS-dependent. Do not attempt to pre-render filter combinations statically.

---

## Client Components

### Architecture decision: self-contained, not event-bus

The `pnwm-filter-change` event bus on species pages connects a filter-controls component to a map and chart on the same page (one emitter → multiple listeners). The Identify page has a single filter owner and a single results display — the same `pnwm-identify` root component manages both. Routing filter changes through the DOM event bus would add no value, would require new event types on the global `HTMLElementEventMap`, and would couple the Identify feature to the species-page filter architecture.

**Decision: `pnwm-identify` is self-contained.** Filter state lives in `pnwm-identify._selectedChars` and flows down to child components as Lit properties. `character-filter-panel` fires `pnwm-key-filter-change` events caught by its direct parent.

### Component 1: `pnwm-identify` (`src/components/pnwm-identify.ts`)

Light DOM (same reason as `pnwm-taxon-browser`: Pico CSS element selectors must reach interior elements).

Responsibilities:
- Parse inline JSON from `<script id="key-matrix-data">` synchronously at `connectedCallback` → `_characters`, `_species`
- Fetch `{path-prefix}key-matrix.json` async at `connectedCallback` → `_matrix`
- Validate fetched JSON with O(1) shape probe (mirrors `validateSpeciesStates` pattern): check `matrix` is an array of length `characters.length`
- Own `_selectedChars: Set<number>` (char_ids) as reactive Lit state
- Compute `_matchingSpecies: KeySpecies[]` from `_selectedChars`, `_matrix`, and `_species` on each selection change
- Pass `_characters`, `_selectedChars` to `character-filter-panel`; pass `_matchingSpecies`, `_pathPrefix` to `key-results-grid`
- Render a "Clear all filters" button at root level when `_selectedChars.size > 0`

Load strategy — split inline vs. async:
- Inline JSON (from Eleventy `<script>` tag): `{ characters: Character[], species: KeySpecies[] }` — the metadata subset (~30 KB) needed to render the full filter panel and empty results grid immediately
- Async fetch: `key-matrix.json` contains the full matrix (~170 KB gzip) needed for filtering — arrives after initial render; prior to arrival, the UI renders in a "loading" state with all checkboxes disabled

### Component 2: `character-filter-panel` (`src/components/character-filter-panel.ts`)

Light DOM.

Responsibilities:
- Accept `characters: Character[]` and `selectedChars: Set<number>` as Lit properties
- Render 8 collapsible category sections (use `aria-expanded` + `?hidden` pattern from `pnwm-taxon-browser`)
- Within each category: group characters by `subcategory` (if present) then `question`; render question as a heading with all its states as checkboxes beneath it
- Each checkbox: `checked` = `selectedChars.has(char.id)`; on change, dispatch `pnwm-key-filter-change` with `{ charId: number, checked: boolean }` — caught by `pnwm-identify`
- Each character state with `image_filename != null`: render a help icon button; clicking opens a native `popover="auto"` element containing `<img src="${CDN_BASE_URL}/key-images/${char.image_filename}">` (same Popover API pattern as glossary tooltips)
- When `selectedChars` is empty: show no visible selection state
- When matrix has not yet loaded: render checkboxes as `disabled`

### Component 3: `key-results-grid` (`src/components/key-results-grid.ts`)

Light DOM.

Responsibilities:
- Accept `matchingSpecies: KeySpecies[]`, `totalCount: number`, and `pathPrefix: string` as Lit properties
- Render "N of M species match" count header (or "Showing all M species" when no filters active)
- Render a CSS grid of species cards (same thumbnail + label card pattern as `pnwm-taxon-browser._renderSpecies`)
- Each card: `<a href="{pathPrefix}species/{slug}/">` wrapping CDN thumbnail (`CDN_BASE_URL/{slug}/{nav_image}?height=186`) + species name in `<em>` + common name
- When `nav_image` is null: render a gray placeholder block (same pattern as similar species row)
- When no species match: render "No species match the selected characters" message

### Filtering logic (in `pnwm-identify`)

Multi-select within a question = OR; across questions = AND. This is standard Lucid semantics as described in PROJECT.md.

```typescript
// Pre-compute question groups once when _characters loads (memoized)
function buildQuestionGroups(characters: Character[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const char of characters) {
    const key = `${char.category}\x00${char.subcategory ?? ''}\x00${char.question}`;
    const group = groups.get(key) ?? [];
    group.push(char.id);
    groups.set(key, group);
  }
  return groups;
}

// Called on every _selectedChars change
function computeMatching(
  selectedChars: Set<number>,
  questionGroups: Map<string, number[]>,
  matrix: number[][],
  species: KeySpecies[]
): KeySpecies[] {
  if (selectedChars.size === 0) return species;

  // Collect only the question groups that have at least one selected char
  const activeGroups: number[][] = [];
  for (const [, charIds] of questionGroups) {
    const active = charIds.filter(id => selectedChars.has(id));
    if (active.length > 0) activeGroups.push(active);
  }

  return species.filter((_, spIdx) =>
    // AND across all active question groups
    activeGroups.every(group =>
      // OR within each question group
      group.some(charId => matrix[charId]![spIdx] === 1)
    )
  );
}
```

Pre-computing question groups is O(237) and happens once at load. Each subsequent filter operation is O(active_questions × matched_species) — well within synchronous budget for ≤1228 species.

---

## Data Flow Diagram

```
BUILD TIME:
  data/key.csv ────────────────────────────────────────────────────────┐
  data/species.csv ──────► scripts/build-key.ts ──► data/key-matrix.json
  data/species-synonyms.csv                      └──► data/key-coverage-report.json
  data/key-character-images.csv (optional)
  data/images.csv (DuckDB query for nav thumbnails)

  data/key-matrix.json ──► src/_data/keyMatrix.ts ──► { characters, species }
                                                          │
                       └──► scripts/copy-key-matrix.ts ──► _site/key-matrix.json

  key media/Images/ ──► scripts/upload-key-images.ts ──► bunny.net /key-images/

  Eleventy template (src/identify/index.njk):
    keyMatrix.characters + keyMatrix.species
      ──► <script id="key-matrix-data"> (inline JSON, ~30 KB)
      ──► <noscript> species list (static degradation)

CLIENT TIME:
  Browser loads /identify/index.html
    │
    ├── pnwm-identify.connectedCallback()
    │     ├── (sync) Parse inline JSON → _characters, _species
    │     │         → renders character-filter-panel + empty results grid
    │     └── (async) fetch('{prefix}key-matrix.json') → _matrix
    │                 → O(1) shape validation
    │                 → enables checkboxes in character-filter-panel
    │
    ├── character-filter-panel renders _characters
    │     └── User checks a state
    │           → pnwm-key-filter-change({ charId, checked })
    │           → pnwm-identify._selectedChars updated
    │           → computeMatching() → _matchingSpecies
    │           → key-results-grid rerenders
    │
    └── key-results-grid renders _matchingSpecies
          └── CDN thumbnails from bunny.net /{slug}/{nav_image}?height=186
              Character help images from bunny.net /key-images/{image_filename}
```

---

## Component Boundaries

| Component | File | Responsibility | Communicates With |
|-----------|------|----------------|-------------------|
| `pnwm-identify` | `src/components/pnwm-identify.ts` | Root; owns `_selectedChars` state; fetches matrix; runs filtering | Passes `characters`, `selectedChars` to filter panel; passes `matchingSpecies`, `totalCount`, `pathPrefix` to results grid; listens for `pnwm-key-filter-change` from filter panel |
| `character-filter-panel` | `src/components/character-filter-panel.ts` | Renders 237 character checkboxes in 8 collapsible categories; character image popovers | Receives `characters[]`, `selectedChars` from parent as Lit properties; dispatches `pnwm-key-filter-change` upward |
| `key-results-grid` | `src/components/key-results-grid.ts` | Renders matching species thumbnail grid + count | Receives `matchingSpecies[]`, `totalCount`, `pathPrefix` from parent; no events emitted |

All three components use light DOM. All live in `src/components/`. All registered as custom elements and bundled by Vite alongside existing components.

---

## New vs. Modified Files

### New files

| File | Type | Purpose |
|------|------|---------|
| `scripts/build-key.ts` | Build script | Ingests key.csv, resolves slugs, queries nav images, emits key-matrix.json + coverage report |
| `scripts/build-key.test.ts` | Tests | Unit tests for CSV parse, slug normalization, slug resolution, matrix shape, coverage report |
| `scripts/copy-key-matrix.ts` | Build script | Copies data/key-matrix.json → _site/key-matrix.json (post-Eleventy, same as copy-parquet) |
| `scripts/upload-key-images.ts` | One-shot operator script | Uploads key media/Images/ to bunny.net /key-images/ prefix; idempotent with DRY_RUN guard |
| `data/key-character-images.csv` | Source data (curator-maintained) | char_id → CDN image filename map; does not exist yet; build soft-skips if absent |
| `data/key-matrix.json` | Generated artifact | Build output, source-controlled (like species-photos.json); serves as _site/key-matrix.json |
| `data/key-coverage-report.json` | Generated artifact | Unmatched binomials for curator review; not served to _site/ |
| `src/_data/keyMatrix.ts` | Eleventy data file | Reads data/key-matrix.json, returns KeyMatrixMeta { characters, species }; soft-fails if absent |
| `src/identify/index.njk` | Eleventy template | /identify/ route; inline JSON; noscript degradation |
| `src/components/pnwm-identify.ts` | Lit component | Root; filter state; matrix fetch + O(1) validation; filtering logic |
| `src/components/character-filter-panel.ts` | Lit component | Character checkbox UI; collapsible by category/question; help image popovers |
| `src/components/key-results-grid.ts` | Lit component | Species thumbnail grid; "N of M" count |
| `src/components/pnwm-identify.test.ts` | Tests | Unit tests for buildQuestionGroups, computeMatching |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add `build:key`, `build:copy-key-matrix`, `key:upload-images` scripts; insert into `build` sequence at correct positions |
| `src/types/schemas.ts` | Add `CharacterSchema`, `KeySpeciesSchema`, `KeyMatrixSchema`, `KeyMatrixMetaSchema` |
| `src/types/index.ts` | Export new types |
| `src/types/events.ts` | Add `pnwm-key-filter-change` event detail type + `HTMLElementEventMap` augmentation |
| `tsconfig.node.json` | New scripts in `include` |
| `tsconfig.browser.json` | New components in `include` |
| Test runner in `package.json` | Add new test files to `test` script |

No existing components are modified. No existing build scripts modified except `package.json` script sequence.

---

## Build Order Summary (Producer → Consumer)

```
1. scripts/upload-key-images.ts  [npm run key:upload-images]
   One-shot operator task (local only, not in CI build)
   Producer: key media/Images/ on local disk
   Consumer: bunny.net /key-images/ CDN bucket
   Note: run before character image curation; independent of build pipeline

2. data/key-character-images.csv  [curator task]
   Producer: human curator (assisted by coverage report)
   Consumer: scripts/build-key.ts

3. scripts/build-key.ts  [npm run build:key]
   Producer: data/key.csv + data/species.csv + data/species-synonyms.csv
             + data/key-character-images.csv (optional) + data/images.csv
   Consumer: data/key-matrix.json + data/key-coverage-report.json
   Position in build: after build:data, before build:eleventy

4. src/_data/keyMatrix.ts  [runs inside build:eleventy]
   Producer: data/key-matrix.json
   Consumer: src/identify/index.njk → _site/identify/index.html

5. scripts/copy-key-matrix.ts  [npm run build:copy-key-matrix]
   Producer: data/key-matrix.json
   Consumer: _site/key-matrix.json
   Position in build: after build:eleventy (Vite wipes _site/ during build)

6. Client runtime
   Producer: _site/identify/index.html (inline JSON), _site/key-matrix.json
   Consumer: pnwm-identify → character-filter-panel + key-results-grid
```

---

## Scaling Considerations

| Concern | At 1175 matched species, 237 chars | Notes |
|---------|-------------------------------------|-------|
| Matrix JSON size | ~170 KB gzip — acceptable single fetch | At 5000 species: ~700 KB gzip; still one request, acceptable |
| Filter DOM size | 237 checkboxes in collapsible sections — fine | No virtualization needed at this scale |
| Filter computation | O(active_questions × matched_species) per change; <5ms at full scale | No Web Worker needed |
| CDN character images | 243 images in /key-images/; served on demand | No loading strategy changes needed |
| Page weight | Inline JSON ~30 KB; matrix fetch ~170 KB gzip | Inline is lean; matrix arrives async |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Inlining the full matrix in the HTML page

**What people do:** Pass `keyMatrix` (including the `matrix` array) directly to `| tojson` in the template, inlining ~426 KB uncompressed into every page load.

**Why it's wrong:** The matrix is only needed when a user interacts with filters. It inflates the HTML page for all visitors, including those who immediately leave. The characters + species metadata (~30 KB) is sufficient to render the full interactive UI skeleton immediately; the matrix should arrive async.

**Do this instead:** `src/_data/keyMatrix.ts` returns only `{ characters, species }`. The Eleventy template inlines that. `pnwm-identify` fetches `key-matrix.json` (which contains the full matrix) asynchronously.

### Anti-Pattern 2: Automated character→image mapping

**What people do:** Write a fuzzy-match script that maps character state labels to image filenames, commit the output as "good enough."

**Why it's wrong:** The key media Images folder mixes specimen photos (1760 files), ecoprovince maps (27 files), color swatches (50+ files), and morphological illustrations (~150 files). Text similarity between state labels and filenames produces plausible-looking but incorrect mappings — "Blue Mountains" (an ecoregion) fuzzy-matches "Blue.jpg" (a forewing color). Users following character help images for identification would receive silently wrong guidance.

**Do this instead:** Ship the Identify page with all `image_filename: null` initially. Curator populates `data/key-character-images.csv` manually. Character images arrive incrementally.

### Anti-Pattern 3: Using the `pnwm-filter-change` event bus

**What people do:** Extend the existing `pnwm-filter-change` event type (or add a new event to the same bus) to carry character-filter state from `character-filter-panel` to `key-results-grid`.

**Why it's wrong:** The event bus on species pages solves a fan-out problem (one filter emitter → map + chart on the same page). The Identify page has no fan-out — `pnwm-identify` is the sole listener and sole state owner. Routing through the bus adds global type surface (`HTMLElementEventMap`) for an event that means nothing outside this page.

**Do this instead:** `character-filter-panel` dispatches `pnwm-key-filter-change` caught by its direct parent `pnwm-identify`. Add the type to `src/types/events.ts` with a distinct name so it is not confused with `pnwm-filter-change`.

### Anti-Pattern 4: Skipping `build:key` when key.csv hasn't changed

**What people do:** Add a guard so `build:key` is skipped if `data/key-matrix.json` already exists and `data/key.csv` hasn't changed.

**Why it's wrong:** `build-key.ts` also reads `data/species-synonyms.csv` (updated as curators resolve unmatched binomials), `data/key-character-images.csv` (updated as curators map character images), and `data/images.csv` (updated as new photos are added, changing nav thumbnails). A guard on `key.csv` alone would silently serve a stale matrix.

**Do this instead:** Run `build:key` unconditionally in `npm run build`. It parses 237 rows × 1228 columns and runs one DuckDB query — expected runtime under 2 seconds.

---

## Integration Summary

The v4.0 Identify feature integrates into the existing architecture at exactly four seams:

1. **Build pipeline seam:** `scripts/build-key.ts` follows the same pattern as `build-data.ts` and `emit-species-states.ts`. Inserted into `npm run build` at the correct producer-before-consumer position (`after build:data`, `before build:eleventy`). `copy-key-matrix.ts` runs post-eleventy in the existing copy group.

2. **Data file seam:** `src/_data/keyMatrix.ts` follows the `speciesPhotos.ts` pattern. Reads `data/key-matrix.json`, soft-fails if absent, exposes metadata subset to the Identify page template.

3. **Route seam:** `src/identify/index.njk` uses `base.njk` layout, same as all other pages. Route `/identify/` has no conflicts with existing routes.

4. **Component seam:** Three new Lit components in `src/components/`, bundled by Vite alongside existing components. They share `CDN_BASE_URL` and the light DOM convention. They do not modify or extend any existing component.

No existing components are modified. No existing build scripts are modified. `src/types/schemas.ts` and `src/types/events.ts` gain new definitions.

---

*Architecture research for: pnwmoths v4.0 Key Characters Identify page (Issue #19)*
*Researched: 2026-06-24*
