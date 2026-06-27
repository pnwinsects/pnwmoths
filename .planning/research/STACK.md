# Stack Research

**Domain:** v4.0 Key Characters — Identify page additions to the existing Eleventy/Vite/Lit static site
**Researched:** 2026-06-24
**Confidence:** HIGH (based on direct inspection of source data files + verified against existing codebase patterns)

---

## What This Document Covers

The v3.0 STACK.md documented the TS migration toolchain. This document supersedes it for v4.0 and covers **only the new stack decisions** required for the Identify page: the character matrix artifact format, the build-time ingestion approach, and the image processing/upload approach. The existing validated stack (Eleventy 3, Vite 8, Lit 3, DuckDB, hyparquet, Zod 4, bunny.net CDN, curl-based upload scripts) is reused as-is.

---

## Key Data Facts (Measured from Source Files)

These numbers are derived directly from the source files before any decisions are made.

| Fact | Value | Source |
|------|-------|--------|
| Matrix dimensions | 237 character-states × 1,228 species | Direct inspection of `may 6 2015 key.csv` |
| Matrix density (fraction of cells = 1) | 30.2% | Counted from CSV |
| Average species matching per character-state | 370.8 | Computed |
| Raw CSV file size | 629 KB | `wc -c` |
| Images in `/Images/` directory | 2,003 total | `ls \| wc -l` |
| Character illustration images (non-species) | ~236 | Filenames not matching `Genus species-` pattern |
| Species specimen photos in the key media | ~1,767 | Filenames matching `Genus species-` pattern |
| Image size range | 17 KB – 1.2 MB, median ~144 KB, avg 144 KB | `os.path.getsize` over all files |
| Total image directory size | 280.8 MB | Computed |
| Pre-built thumbnails (Thumbs/) | 1,980 files, 70×46px, avg 4 KB | Direct inspection |
| taxa.txt / taxa.dat | 1,228 lines each, identical species lists (Windows CR/LF) | Inspected |
| No Lucid key XML or media-mapping file | Only taxa.txt, taxa.dat, key.csv exist | Directory walk |

**Critical finding on illustration filenames:** The 236 character illustration files are named descriptively (e.g., `Abdomen striped.jpg`, `Forewing Discal Spot Present, yes.jpg`) but do NOT match the character-state labels in `key.csv` by exact string match. Only 13 of 237 state labels match a filename case-insensitively. The illustration→character-state mapping was embedded in the Lucid application and is not present in the exported files. A curator-maintained `data/key-images.csv` mapping file is required before images can be linked to character-states in the pipeline.

---

## Recommendation 1: Character Matrix Artifact Format

### Decision: Per-character-state base64 bitsets in a single JSON file

**Artifact:** `_site/key-matrix.json`

**Format:**
```json
{
  "species": ["Habrosyne scripta", "Pseudothyatira cymatophoroides", ...],
  "states": [
    {
      "label": "Distribution:In which State/Province was the moth found?:Washington",
      "bits": "base64-encoded Uint8Array, 154 bytes (1228 bits), LSB-first"
    },
    ...
  ]
}
```

- `species` array: 1,228 binomial strings in the same order as the key.csv header. The client resolves these to site slugs via `toLowerCase().replace(' ', '-')`.
- `states` array: 237 entries, one per row of key.csv. `bits` is base64-encoded little-endian packed bits — bit `i` is set if `species[i]` matches this state.

**Size (measured from actual data):**

| Format | Uncompressed | Gzip |
|--------|-------------|------|
| Per-character-state base64 bitsets (recommended) | 96 KB | **29 KB** |
| Per-species base64 bitsets (alternative orientation) | 114 KB | 34 KB |
| Sparse index arrays (species indices per state) | 343 KB | 120 KB |
| Full flat 0/1 JSON matrix | 568 KB | 28 KB |
| Parquet with 237 boolean columns | ~47 KB | (Snappy, not gzip) |

For comparison, the existing `species-states.json` (1,348 species × ~6 states, long format) is 205 KB uncompressed — the key matrix at 96 KB / 29 KB gzip is lighter.

### Why per-character-state bitsets, not Parquet

**Parquet rejected.** Adding a 237-column Parquet file would require hyparquet to read 237 column chunks and materialize them into a per-species structure. The existing `records.parquet` pattern works because each file is small (per-species) and the column count is fixed at 14. A 237-column Parquet file adds complexity with no size benefit over the bitset JSON (47 KB Snappy vs 29 KB gzip, comparable). More importantly, the filter logic in the browser client is clearest when each character-state is a typed `Uint8Array` — loading Parquet into that structure requires an extra transformation step that the JSON approach skips entirely.

**Sparse index arrays rejected.** 343 KB / 120 KB gzip is 4× larger than the bitset approach. Set intersection logic for AND-across-characters is slower and more complex to implement than bitwise AND on typed arrays.

**Per-species bitsets (alternative orientation) rejected.** Loading the matrix as per-species means the client must iterate over all 1,228 species for every filter change, performing a bitmask check per species. This is O(species × states_checked) per filter event. The per-character-state orientation allows the filter to AND together only the selected states' bitsets, producing a result bitset in one pass — O(states_selected × 154 bytes). The AND result bitset directly encodes which species pass; iterating it to collect matching species indices is an O(species/32) scan, the same cost in both orientations but with no per-species inner loop during the AND.

### Client-side filter algorithm

```typescript
// Pseudocode — exact implementation for a later phase plan
function filterSpecies(
  matrix: KeyMatrix,                      // the loaded artifact
  selectedStates: Map<string, string[]>,  // character → selected state labels (OR within)
): number[] {                             // indices into matrix.species
  // Start with all species matching (all-ones bitset)
  const nBytes = Math.ceil(matrix.species.length / 8);
  let result = new Uint8Array(nBytes).fill(0xFF);

  // AND across characters
  for (const [_char, stateLabels] of selectedStates) {
    // OR within character: union of all selected states' bitsets
    const charUnion = new Uint8Array(nBytes);
    for (const label of stateLabels) {
      const stateEntry = matrix.states.find(s => s.label === label);
      if (!stateEntry) continue;
      const bits = base64ToUint8Array(stateEntry.bits);
      for (let i = 0; i < nBytes; i++) charUnion[i] |= bits[i];
    }
    // AND into running result
    for (let i = 0; i < nBytes; i++) result[i] &= charUnion[i];
  }

  // Collect matching species indices
  const matches: number[] = [];
  for (let i = 0; i < matrix.species.length; i++) {
    if (result[i >> 3]! & (1 << (i & 7))) matches.push(i);
  }
  return matches;
}
```

**Filter cost for 10 selected character-states (worst case):** 10 × 154 byte-OR operations + 154 byte-AND operations = ~1,700 byte operations → microseconds in a Uint8Array loop. Well under any perceptible latency threshold for 1,228 species.

---

## Recommendation 2: Build-time CSV Ingestion

### Decision: Plain CSV parse via csv-parse (already in repo), not DuckDB

**Rationale:** DuckDB `read_csv` is the right tool when you need to import into a typed columnar store and run analytical queries. For the key matrix, the build step is: read 237 × 1,228 cells, pack them into bitsets, emit JSON. This is a straightforward streaming transform — no JOINs, no aggregations, no type coercions. `csv-parse/sync` (already a dependency) handles it cleanly. Adding DuckDB for this step would add complexity (connection lifecycle, typed column spec) with no benefit over a 20-line parse loop.

**Script:** `scripts/emit-key-matrix.ts` — mirrors `scripts/emit-species-states.ts` in structure. Reads `data/key.csv`, parses with `csv-parse/sync`, emits `_site/key-matrix.json`.

**Existing `validateCsv()` from `scripts/build-data.ts`** handles UTF-8 check and column-presence check and should be reused.

### Zod schema validation approach (O(columns), not per-row)

The character matrix has an unusual shape: the "columns" are species (1,228 of them), and the rows are character-states. Standard row-by-row Zod parsing (`z.object({...}).parse(row)`) is not applicable here because the column count is variable and each data column is a `"0"` or `"1"` string.

**What to validate with Zod (O(shape) at artifact emit time):**

```typescript
// src/types/schemas.ts — add:

// Artifact shape validated at build time before write
export const KeyMatrixStateSchema = z.object({
  label: z.string().min(1),
  bits: z.string().regex(/^[A-Za-z0-9+/]+=*$/, 'must be base64'),
});

export const KeyMatrixSchema = z.object({
  species: z.array(z.string()).min(1),
  states:  z.array(KeyMatrixStateSchema).min(1),
});
export type KeyMatrix = z.infer<typeof KeyMatrixSchema>;
```

Parse the emitted artifact object with `KeyMatrixSchema.parse(artifact)` before `writeFileSync` — this gates the build on correct shape without iterating 291,000 cells. Mirrors the existing pattern in `build-data.ts` where `OccurrenceRecordSchema` validates the DuckDB output shape.

**Additional structural invariants (assert at emit time, not via Zod):**
- All state `bits` strings decode to exactly `ceil(species.length / 8)` bytes
- `states.length === 237` (exact row count)
- `species.length === 1228` (exact column count)

These are one-line `if (x !== expected) throw` guards after the Zod parse, not Zod refinements. Mirrors `assertParquetColumns()` in `parquet-cache.ts`.

**Browser-side load-time validation:** The same `KeyMatrixSchema` is exported from `src/types/schemas.ts` and used by the Lit component to validate the fetched artifact at load time — exactly as `validateSpeciesStates()` validates the `species-states.json` load. Use `zod/mini` for the browser import since the full Zod bundle must not reach the client (existing constraint).

### Species name → site slug resolution

The key.csv header contains quoted binomial strings (e.g., `"Habrosyne scripta"`). The site uses `genus.toLowerCase() + '-' + species.toLowerCase()` as slugs. The two-word binomial directly maps: `"Habrosyne scripta"` → `habrosyne-scripta`.

Two edge cases from inspection:
- `'Idia "concisa"'` (taxa.txt) vs `'Idia concisa'` (key.csv) — quoted subspecies designation; handle by stripping embedded quotes
- `'Tyta luctuosa '` (key.csv) — trailing space; `.trim()` on all header values

The slug derivation is deterministic and does not need `species-synonyms.csv` at artifact-emit time. Unmatched species (key binomials not found in `data/species.csv`) should be logged as a coverage report, not cause a build failure. This is the same best-effort strategy as the photo-manifest synonym curation in v2.2.

---

## Recommendation 3: Image Processing and Upload

### Decision: Resize originals to 800px max-width with sharp (already in repo), then upload; do NOT use Thumbs/ pre-built thumbnails

**Rationale for resizing before upload:**

The `/Images/` directory contains 2,003 files with a median width of 800px and mean size of 144 KB. Of these, 102 files exceed 800px width (up to 2,662px) and 27 exceed 1,200px. Character illustrations are shown at small sizes in the UI (tooltip/expandable panel beside filter checkboxes). Uploading the 280 MB raw originals at up to 1.2 MB each to bunny.net and relying on the Optimizer to resize every request wastes CDN bandwidth per-request (Optimizer charges per optimization). A one-time resize pass produces stable file sizes and predictable costs.

**Resize spec:** `sharp` resize to 800px max-width, quality 85 JPEG, `fit: 'inside'` (preserve aspect ratio, never upscale). This is the same approach as the existing photo thumbnail pipeline. Images already ≤ 800px pass through `sharp` without upscaling (`withoutEnlargement: true`).

**Do NOT use the Thumbs/ pre-built thumbnails.** The existing thumbnails are 70×46px (4 KB each) — sized for the Lucid key's list thumbnail, not for the Identify page's character illustration panels. At 70px wide, the character diagrams (forewing patterns, wing shapes, color swatches) would be unreadable. Generate at 800px and let the CSS constrain display size; bunny.net Optimizer handles delivery-time WebP conversion and any further display-size resize.

**Image upload target path:** `key-media/` in the bunny.net Storage Zone, parallel to the existing `species-tiles/` and `images/` directories. CDN URL pattern: `https://pnwmoths.b-cdn.net/key-media/{filename}`.

### Upload script pattern: new `scripts/upload-key-images.ts`

Reuse the established patterns from `upload-tiles.ts` verbatim:
- `DRY_RUN=1` guard before `BUNNY_API_KEY` guard
- `curl` for PUT (no Node HTTP library — existing project convention)
- `withRetry()` exponential backoff (5 attempts: 2s/4s/8s/16s/32s)
- `redact()` to strip API key from error messages
- Idempotent rerun: check remote existence via HEAD before uploading (or rely on bunny.net PUT idempotency — same as tile upload)
- `DRY_RUN` prints upload plan, no actual writes
- Self-contained helpers (no imports from other scripts — project convention)

**No manifest needed for key images.** The species-photos pipeline requires a manifest because it is resumable across thousands of multi-gigabyte TIFF downloads. For 2,003 JPEG files totalling 280 MB (post-resize ~70–120 MB), a single upload run completes in minutes. A simple `Set` of already-uploaded filenames (fetched via bunny.net Storage API list) suffices for idempotency.

**Script added to `package.json`:**
```json
"key:upload": "node scripts/upload-key-images.ts"
```

---

## New Dependencies Required

**None required for the matrix artifact or upload.** All necessary tools exist:

| Need | Existing dep | Version |
|------|-------------|---------|
| CSV parsing | `csv-parse` | `^6.2.1` |
| Image resize | `sharp` (via libvips) | Already in scripts |
| Bunny upload | `curl` CLI (not a Node dep) | Already used |
| Schema validation | `zod` / `zod/mini` | `^4.4.3` |
| JSON write | Node built-in `fs` | — |

**Wait** — `sharp` must be verified as a direct project dependency vs. available via PATH. Let the implementation phase confirm; if sharp is not in package.json as a dependency but only installed for the tile pipeline, it needs to be added as a dependency (not devDependency) since build scripts run in CI.

---

## What NOT to Add

| Do Not Add | Why |
|-----------|-----|
| New Parquet file for the key matrix | hyparquet adds a transformation step with no size benefit; JSON bitsets serve the same function more directly |
| SQLite or any client-side database (sql.js, wa-sqlite) | The bitset AND approach handles 237 × 1,228 in microseconds; a full query engine is architectural overkill |
| fuse.js or similar fuzzy search for character labels | Character labels are fixed and enumerable; exact string matching on a 237-item list is sufficient |
| Any new client-side framework or state management library | The existing Lit component pattern is sufficient |
| DuckDB for key.csv ingestion | No analytical queries needed; csv-parse handles the simple row→bitset transform |
| Thumbs/ directory pre-built thumbnails | 70×46px is too small for character illustrations; resize to 800px instead |
| A Lucid key XML parser | No XML file was exported; the three available files (key.csv, taxa.txt, taxa.dat) contain all needed data |
| Automatic illustration→character-state label matching | The filenames do not match labels reliably (13/237 exact matches). A human-curated `data/key-images.csv` mapping is required |

---

## New Data Files Required

| File | Format | Content |
|------|--------|---------|
| `data/key.csv` | Copy of source CSV | The 237 × 1,228 binary matrix |
| `data/key-images.csv` | New, curator-maintained | Mapping: `state_label,image_filename` — links each character-state to its illustration JPG. Must be human-curated since automated filename-to-label matching fails. |
| `_site/key-matrix.json` | Generated at build time | The bitset artifact (96 KB / 29 KB gzip) |

---

## Integration With Existing Patterns

| Pattern | How v4.0 Reuses It |
|---------|-------------------|
| `emit-species-states.ts` → `_site/species-states.json` | `emit-key-matrix.ts` → `_site/key-matrix.json` — same script shape: DuckDB or csv-parse, writeFileSync, logged row count |
| `validateCsv()` from `build-data.ts` | Reuse for UTF-8 + required-columns pre-flight on `key.csv` |
| `KeyMatrixSchema.parse(artifact)` at emit | Mirrors OccurrenceRecordSchema DuckDB output validation |
| `assertParquetColumns()` O(columns) shape guard | Mirrors `assert(states.length === 237)` structural guard after Zod parse |
| `loadParquet()` / `species-states.json` fetch in Lit | New `loadKeyMatrix()` function in `src/_lib/` or as a module-level import — same `fetch` + `arrayBuffer` + schema-validate pattern |
| `pnwm-filter-bar` dispatching `pnwm-filter-change` | New `pnwm-identify-filters` component dispatches a new typed event `pnwm-key-filter-change` with selected states map; add to `src/types/events.ts` |
| `upload-tiles.ts` curl PUT pattern | `upload-key-images.ts` reuses the same curl PUT, withRetry, redact, DRY_RUN patterns verbatim |
| `CDN_BASE_URL` module-level constant | `key-media/` path appended: `${CDN_BASE_URL}/key-media/${filename}` |

---

## Sources

- Direct inspection of `/Users/rainhead/Downloads/may 6 2015 key files/` — key.csv dimensions, image counts/sizes, taxa file formats (HIGH confidence)
- `/Users/rainhead/dev/pnwmoths/src/components/parquet-cache.ts` — existing fetch + validate pattern (HIGH confidence)
- `/Users/rainhead/dev/pnwmoths/scripts/upload-tiles.ts` — established upload pattern (HIGH confidence)
- `/Users/rainhead/dev/pnwmoths/src/types/schemas.ts` — Zod mini constraint, build-only validation approach (HIGH confidence)
- `/Users/rainhead/dev/pnwmoths/scripts/emit-species-states.ts` — emit script template (HIGH confidence)
- `/Users/rainhead/dev/pnwmoths/.planning/PROJECT.md` — key decisions log confirming: JSON over Parquet for species-states (same reasoning applies here), curl upload pattern, DRY_RUN ordering invariant (HIGH confidence)

---

*Stack research for: pnwmoths v4.0 Key Characters — Identify page*
*Researched: 2026-06-24*
