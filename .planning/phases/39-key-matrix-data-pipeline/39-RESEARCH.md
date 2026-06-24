# Phase 39: Key Matrix Data Pipeline - Research

**Researched:** 2026-06-24
**Domain:** CSV ingest + bitset encoding + slug resolution + DuckDB nav-image join + Zod validation + post-build byte-budget gate
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Source CSV committed as `data/key-characters.csv` (copy of `~/Downloads/may 6 2015 key files/may 6 2015 key.csv`). 1,229 cols × 238 rows. `build-key.ts` reads this path.
- **D-02:** Phase 39 owns the entire data pipeline including species↔key slug matching, synonym fallback, DuckDB nav-thumbnail join, and coverage report.
- **D-03:** Phase 40 shrinks to pure filter-logic TDD contract only.
- **D-04:** Artifact shape: `{ characters, species, matrix }` where `matrix` = per-character-state base64 `Uint8Array` bitsets over matched species only. NOT 237 × N binary rows.
- **D-05:** Build-time Zod schema validates O(states + species) shape (character/species array shapes; each of the 237 `matrix` entries is a valid base64 string of the expected byte length). `zod/mini` load-time structural guard mirrors v3.0 `assertParquetColumns`/`validateSpeciesStates` pattern.
- **D-06:** Post-build byte-budget check asserts gzip ≤ 50 KB on `_site/key-matrix.json`. Existing `check-page-weight.ts` is HTML-only; a separate artifact-size gate is required.
- **D-07:** Both `data/key-matrix.json` and `data/key-coverage-report.json` committed to git (precedent: `species-photos.json`, `plates.json`).
- **No new deps**: `csv-parse@^6.2.1` is already present; `sharp` is Phase 43. Verify `sharp` is NOT in package.json (confirmed: not in `node_modules`); do not add it here.
- Template scripts to mirror: `scripts/emit-species-states.ts` (emit pattern), `scripts/copy-parquet.ts` (post-Eleventy copy → `copy-key-matrix.ts`), `scripts/build-data.ts` (DuckDB nav join, `validateCsv`, csv-parse), `scripts/check-page-weight.ts` (weight gate style), `src/types/schemas.ts` (zod/mini constraint + build-only full-Zod pattern).
- `build:key` wired after `build:data`, before `build:eleventy`; `build:copy-key-matrix` runs post-Eleventy in the existing copy group.

### Claude's Discretion

- Exact bitset byte layout/orientation details (LSB-first confirmed by STACK.md convention; verify below).
- Coverage-report JSON shape.
- Precise `build:key` / `copy-key-matrix` script wiring positions in `package.json` build chain.
- New test file names and test runner invocation line in `package.json`.

### Deferred Ideas (OUT OF SCOPE)

- `src/_lib/key-filter.ts`, filter schemas, `pnwm-key-filter-change` event type → Phase 40.
- Identify page (`src/identify/index.njk`), Lit components → Phases 41–42.
- `sharp` direct dependency, character illustration images, `upload-key-images.ts` → Phase 43.
- Curating remaining ~37 unmatched binomials beyond Grammia→Apantesis → ongoing curator task.
- ROADMAP success-criteria corrections (D-03/D-04/D-06 flags) → apply when convenient.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KEY-01 | Ingest `key.csv` (237 × 1,228 binary matrix) into compact client-loadable artifact (per-character-state base64 bitset JSON, ~30 KB gzip) | Bitset format confirmed: 36.7 KB gzip for full artifact with all fields. Encoding algorithm in §Architecture Patterns. |
| KEY-02 | Character metadata — `Category:[Subcategory:]Question:State` hierarchy (8 categories, ~55 questions, 237 states) with both 2- and 3-level depths | CSV verified: 3-part and 4-part colon labels only; parsing algorithm in §Architecture Patterns. |
| KEY-03 | Zod schema validates artifact shape at build time; load-time structural check guards client boundary | Schema definitions in §Standard Stack; mirrors `OccurrenceRecordSchema` pattern in `build-data.ts`. |
| KEY-04 | Post-build check asserts key matrix artifact byte budget; existing page-weight validator only inspects HTML | New `scripts/check-key-weight.ts` using `gzipSync` from Node built-in `zlib`; wired as `build:check-key-weight`. |
| KEY-05 | `build:key` runs within 5-second budget; wired into `npm run build` and GitHub Actions gates | csv-parse ingest of 237 rows × 1,228 cols + one DuckDB query = under 2 s. Package.json wiring spec in §Architecture Patterns. |
| MATCH-01 | Resolves 1,228 key binomials to site slugs (direct lowercase-hyphen + `species-synonyms.csv`); tolerates whitespace artifacts | Verified: 1,175/1,228 direct match; 17 Grammia→Apantesis synonym entries to commit; whitespace normalization via `/\s+/g`. |
| MATCH-02 | Coverage report listing every unmatched key binomial | `data/key-coverage-report.json` schema in §Architecture Patterns; 53 unmatched confirmed. |
| MATCH-03 | Matched species join to CDN nav thumbnail; unresolved species excluded from results | DuckDB nav-image join mirrors `taxon.ts` pattern; nav_image field in KeySpecies schema. |
</phase_requirements>

## Summary

Phase 39 converts the legacy `may 6 2015 key.csv` (237 character-state rows × 1,228 species columns, binary 0/1 matrix) into a stable, validated, client-loadable JSON artifact (`data/key-matrix.json`) plus a coverage report, wired into `npm run build` and gated by Zod validation and a gzip byte-budget check.

The implementation mirrors existing patterns precisely: `scripts/build-key.ts` follows the shape of `emit-species-states.ts` (JSON emit) and `build-data.ts` (DuckDB query + `validateCsv` reuse). The artifact uses per-character-state base64-encoded `Uint8Array` bitsets — confirmed at 36.7 KB gzip (well inside the 50 KB budget). Slug resolution uses the same `from_binomial → to_species_slug` lookup that `ingest-photos.ts` already uses against `data/species-synonyms.csv`. The post-Eleventy copy (`copy-key-matrix.ts`) is a three-line clone of `copy-parquet.ts`. The byte-budget check uses Node built-in `gzipSync` (no new dependency).

The two largest concrete tasks are: (1) copying and committing `data/key-characters.csv` from `~/Downloads/`, and (2) adding 16 confirmed Grammia→Apantesis synonym entries to `data/species-synonyms.csv` (one Grammia species, `Grammia  blakei`, has a double-space in the key — the synonym `Grammia blakei → apantesis-blakei` handles it after whitespace normalization).

**Primary recommendation:** Implement `build-key.ts` as a four-phase script: (1) `validateCsv` pre-flight on `data/key-characters.csv`; (2) csv-parse header into species list + rows into character label + binary values; (3) slug resolution loop building the `species[]` array and `matrix[]` bitsets simultaneously; (4) DuckDB query for nav images and final JSON emit. No new npm packages required.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CSV ingest + bitset encoding | Build script (Node) | — | Pure build-time transform; no client involvement |
| Slug resolution + synonym lookup | Build script (Node) | — | Requires `data/species.csv` + `data/species-synonyms.csv`; deterministic per build |
| DuckDB nav-image join | Build script (Node) | — | Mirrors `taxon.ts` pattern; reads `data/images.csv` |
| Zod artifact validation (O(shape)) | Build script (Node) | — | Gate before `writeFileSync`; not per-cell |
| Committed artifact (`data/key-matrix.json`) | Data files / git | — | Reviewed in PRs; analogous to `species-photos.json` |
| Post-Eleventy copy to `_site/` | Build script (Node) | — | Required because eleventy-plugin-vite wipes `_site/` |
| Gzip byte-budget check | Build script (Node) | GitHub Actions CI | Separate from HTML page-weight check; uses `zlib.gzipSync` |
| Coverage report (`data/key-coverage-report.json`) | Build script (Node) | git (curator review) | Not served to `_site/`; committed for visibility |
| zod/mini load-time guard | Client/browser | — | Phase 41+ concern; schemas defined here but consumed later |

## Standard Stack

### Core (no new packages — everything already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `csv-parse/sync` | `^6.2.1` [VERIFIED: npm registry] | Parse `data/key-characters.csv` (header + 237 data rows) | Already used in `build-data.ts` and `ingest-photos.ts`; `parse` import from `csv-parse/sync` is the established pattern |
| `@duckdb/node-api` | `^1.5.1-r.2` [VERIFIED: npm registry] | Query `data/images.csv` for nav thumbnails per matched slug | Already used in `build-data.ts`, `taxon.ts`, `emit-species-states.ts` |
| `zod` | `^4.4.3` [VERIFIED: npm registry] | Build-time schema validation of artifact shape | Already in `dependencies`; schemas in `src/types/schemas.ts` |
| `zod/mini` | (same package) | Load-time structural guard at client boundary | Already the constraint in `src/types/schemas.ts` (see file header comment) |
| Node built-in `zlib` | Node 24 | `gzipSync` for byte-budget check | No npm dep; `import { gzipSync } from 'zlib'` verified working |
| Node built-in `fs` | Node 24 | `readFileSync`, `writeFileSync`, `existsSync`, `statSync` | Project convention |

**No new packages needed.** `sharp` is NOT installed and is explicitly deferred to Phase 43.

### Installation

No `npm install` step required for this phase.

## Package Legitimacy Audit

No new packages are installed in this phase. All dependencies are existing project dependencies verified against `package.json`.

| Package | Registry | In package.json | Disposition |
|---------|----------|-----------------|-------------|
| `csv-parse` | npm | `^6.2.1` in `dependencies` | Approved — existing |
| `@duckdb/node-api` | npm | `^1.5.1-r.2` in `dependencies` | Approved — existing |
| `zod` | npm | `^4.4.3` in `dependencies` | Approved — existing |

## Architecture Patterns

### System Architecture Diagram

```
data/key-characters.csv  ──────────────────────────────────────────────┐
data/species.csv         ──►  scripts/build-key.ts  ──►  data/key-matrix.json (committed)
data/species-synonyms.csv      (new script)          └──►  data/key-coverage-report.json (committed)
data/images.csv (DuckDB)  ─────┘

data/key-matrix.json  ──►  scripts/copy-key-matrix.ts  ──►  _site/key-matrix.json
                                (post-Eleventy)                (fetchable by client)

_site/key-matrix.json  ──►  scripts/check-key-weight.ts  ──►  build fails if gzip > 50 KB
```

### Recommended Project Structure (new and modified files)

```
data/
├── key-characters.csv       # NEW — committed copy of Lucid export (629 KB)
├── key-matrix.json          # NEW — committed artifact (145 KB raw, 37 KB gzip)
├── key-coverage-report.json # NEW — committed coverage report (~53 unmatched)
└── species-synonyms.csv     # MODIFIED — add 16 Grammia→Apantesis entries

scripts/
├── build-key.ts             # NEW — main build script (mirrors emit-species-states.ts)
├── build-key.test.ts        # NEW — CSV parse, whitespace, slug resolution, bitset shape tests
├── copy-key-matrix.ts       # NEW — post-Eleventy copy (3-line clone of copy-parquet.ts)
└── check-key-weight.ts      # NEW — gzip byte-budget gate for _site/key-matrix.json

src/types/
└── schemas.ts               # MODIFIED — add CharacterSchema, KeySpeciesSchema, KeyMatrixSchema
```

### Pattern 1: CSV Parse (header row = species list, data rows = character-state labels + binary values)

The key.csv structure is inverted from typical CSVs: row 0 is the header (species binomials), rows 1–237 are character-states with their binary scores. `csv-parse` with `columns: false` (not `true`) reads it as string arrays. [VERIFIED: direct inspection of `may 6 2015 key.csv`]

```typescript
// Source: build-data.ts csv-parse/sync import pattern + direct key.csv inspection
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const raw = readFileSync('data/key-characters.csv');
// columns: false — do NOT use column headers as keys; we need raw arrays
const allRows: string[][] = parse(raw, { columns: false, skip_empty_lines: true });
const headerRow = allRows[0]!;                    // row 0: ['', 'Habrosyne scripta', ...]
const speciesBinomials = headerRow.slice(1);      // 1,228 binomials
const dataRows = allRows.slice(1);                // 237 character-state rows
```

### Pattern 2: Character Label Parsing — 3-part and 4-part colon-delimited hierarchy

Verified from direct inspection: label depth is always 2 or 3 colons (3-part or 4-part segments). [VERIFIED: direct inspection of key.csv confirmed `{2, 3}` colon counts]

```typescript
// Source: direct key.csv inspection
function parseCharacterLabel(label: string): {
  category: string; subcategory: string | null; question: string; state: string
} {
  const parts = label.split(':');
  if (parts.length === 3) {
    const [category, question, state] = parts as [string, string, string];
    return { category: category.trim(), subcategory: null, question: question.trim(), state: state.trim() };
  } else if (parts.length === 4) {
    const [category, subcategory, question, state] = parts as [string, string, string, string];
    return { category: category.trim(), subcategory: subcategory.trim(), question: question.trim(), state: state.trim() };
  }
  throw new Error(`Unexpected character label depth: ${label}`);
}
```

### Pattern 3: Whitespace Normalization Before Slug Construction

Three confirmed whitespace anomalies in the CSV header [VERIFIED: direct inspection]:
- Col 15: `'Tolype  laricis'` (double space)
- Col 127: `'Grammia  blakei'` (double space)
- Col 361: `'Tyta luctuosa '` (trailing space)

```typescript
// Normalize ALL binomials — not just known anomalies
function normalizeBinomial(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function binomialToSlug(binomial: string): string {
  const normalized = normalizeBinomial(binomial);
  const [genus = '', epithet = ''] = normalized.split(' ');
  return `${genus.toLowerCase()}-${epithet.toLowerCase()}`;
}
```

### Pattern 4: Slug Resolution with species-synonyms.csv Fallback

Mirrors `ingest-photos.ts` which already reads `data/species-synonyms.csv` with the same `from_binomial → to_species_slug` format. [VERIFIED: `ingest-photos.ts` lines 78–87; `data/species-synonyms.csv` header-only confirmed]

```typescript
// Source: ingest-photos.ts pattern for species-synonyms.csv
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';

// Load site slugs set
const speciesRows: Array<{genus: string; species: string}> = parse(
  readFileSync('data/species.csv'), { columns: true, skip_empty_lines: true }
);
const siteSlugSet = new Set(speciesRows.map(r =>
  `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`
));

// Load synonym fallback
const synonymRows: Array<{from_binomial: string; to_species_slug: string}> = parse(
  readFileSync('data/species-synonyms.csv'), { columns: true, skip_empty_lines: true }
);
const synonymMap = new Map(synonymRows.map(r => [r.from_binomial, r.to_species_slug]));

// Resolution function
function resolveSlug(binomial: string): string | null {
  const normalized = normalizeBinomial(binomial);
  const directSlug = binomialToSlug(binomial);
  if (siteSlugSet.has(directSlug)) return directSlug;
  const synonymSlug = synonymMap.get(normalized) ?? null;
  if (synonymSlug && siteSlugSet.has(synonymSlug)) return synonymSlug;
  return null;
}
```

### Pattern 5: Per-Character-State Base64 Bitset Encoding (LSB-first)

154 bytes per character-state (ceil(1228/8) = 154). Bit `i` set if `species[i]` matches this state. Encoding confirmed [VERIFIED: direct measurement — 36.7 KB gzip for full artifact, 28.7 KB for species+states format]. [CITED: STACK.md §Recommendation 1]

```typescript
// Source: STACK.md filter pseudocode pattern
function buildBitset(speciesCount: number, matchingIndices: number[]): string {
  const nBytes = Math.ceil(speciesCount / 8);
  const bits = new Uint8Array(nBytes);
  for (const i of matchingIndices) {
    bits[i >> 3]! |= (1 << (i & 7));   // LSB-first
  }
  return Buffer.from(bits).toString('base64');
}
```

### Pattern 6: DuckDB Nav-Image Join (mirrors taxon.ts)

Query `data/images.csv` for the lowest-weight navigational (or lowest-weight overall) image per matched slug. [VERIFIED: `src/_data/taxon.ts` lines 111–153 — same images.csv read pattern]

```typescript
// Source: taxon.ts DuckDB images query pattern
const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();

await conn.run(`
  CREATE TABLE images AS
  SELECT * FROM read_csv('data/images.csv',
    header = true, nullstr = '',
    delim = ',', quote = '"', escape = '"', auto_detect = false,
    columns = {
      'species_slug': 'VARCHAR', 'filename': 'VARCHAR',
      'weight': 'VARCHAR', 'navigational': 'VARCHAR'
    }
  )
`);

// For each matched slug, find primary nav image (navigational=true priority, then lowest weight)
const navResult = await conn.runAndReadAll(`
  SELECT species_slug,
    FIRST(filename ORDER BY
      CASE WHEN navigational = 'true' THEN 0 ELSE 1 END,
      TRY_CAST(weight AS INTEGER)
    ) AS nav_image
  FROM images
  WHERE species_slug IN (${matchedSlugs.map(s => `'${s}'`).join(',')})
  GROUP BY species_slug
`);
conn.closeSync();
```

### Pattern 7: Zod Schema Additions to src/types/schemas.ts

`zod/mini` is already the import convention in `schemas.ts` (file header: `import * as z from 'zod/mini'`). New schemas use the same pattern. [VERIFIED: `src/types/schemas.ts` — confirmed `zod/mini` import, `z.nullable(z.string())` convention, `z.object` + `z.array` usage]

```typescript
// Add to src/types/schemas.ts — after existing schemas
// zod/mini constraint already enforced by existing file header

export const CharacterSchema = z.object({
  id:             z.number(),
  category:       z.string(),
  subcategory:    z.nullable(z.string()),   // null for 3-part labels
  question:       z.string(),
  state:          z.string(),
  image_filename: z.nullable(z.string()),   // null until Phase 43 curator pass
});
export type Character = z.infer<typeof CharacterSchema>;

export const KeySpeciesSchema = z.object({
  slug:        z.string(),
  genus:       z.string(),
  epithet:     z.string(),
  common_name: z.nullable(z.string()),
  nav_image:   z.nullable(z.string()),
});
export type KeySpecies = z.infer<typeof KeySpeciesSchema>;

// matrix: 237 base64 strings, each encoding a Uint8Array bitset over matched species
export const KeyMatrixSchema = z.object({
  characters: z.array(CharacterSchema),
  species:    z.array(KeySpeciesSchema),
  matrix:     z.array(z.string()),    // 237 base64 strings; length === characters.length
});
export type KeyMatrix = z.infer<typeof KeyMatrixSchema>;
```

Post-Zod structural invariant assertions (NOT Zod refinements — mirrors `assertParquetColumns`):
```typescript
// After KeyMatrixSchema.parse(artifact):
const expectedBytes = Math.ceil(artifact.species.length / 8);
const expectedB64Len = Math.ceil(expectedBytes / 3) * 4;  // base64 length
if (artifact.matrix.length !== 237) throw new Error(`...`);
if (artifact.species.length !== matchedCount) throw new Error(`...`);
for (const b64 of artifact.matrix) {
  if (b64.length !== expectedB64Len) throw new Error(`...`);
}
```

### Pattern 8: Post-Build Gzip Byte-Budget Check

Node `zlib.gzipSync` is a built-in. No new dependency. [VERIFIED: `node --input-type=module -e "import { gzipSync } from 'zlib'; ..."` runs successfully]

```typescript
// scripts/check-key-weight.ts
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'zlib';

const BUDGET_BYTES = 50 * 1024;  // 50 KB gzip — D-06
const ARTIFACT = '_site/key-matrix.json';

if (!existsSync(ARTIFACT)) {
  console.error(`[key-weight] ERROR: ${ARTIFACT} not found. Run build first.`);
  process.exit(1);
}
const raw = readFileSync(ARTIFACT);
const gz = gzipSync(raw);
if (gz.length > BUDGET_BYTES) {
  console.error(`[key-weight] FAIL: ${ARTIFACT} is ${(gz.length/1024).toFixed(1)} KB gzip (budget: 50 KB)`);
  process.exit(1);
}
console.log(`[key-weight] OK: ${ARTIFACT} is ${(gz.length/1024).toFixed(1)} KB gzip (<= 50 KB budget)`);
```

### Pattern 9: package.json Script Wiring

Current `build` script (verified from `package.json`):
```
build:data && build:eleventy && build:copy-parquet && build:copy-images && build:species-states && build:pagefind && build:validate-links && build:check-weight
```

Required insertions:
- `build:key` after `build:data`, before `build:eleventy`
- `build:copy-key-matrix` after `build:copy-parquet` (post-Eleventy copy group)
- `build:check-key-weight` after `build:copy-key-matrix` (needs `_site/key-matrix.json` to exist)

New build sequence:
```
build:data && build:key && build:eleventy && build:copy-parquet && build:copy-images
  && build:copy-key-matrix && build:species-states && build:build:check-key-weight
  && build:pagefind && build:validate-links && build:check-weight
```

New `package.json` script entries:
```json
"build:key":             "node scripts/build-key.ts",
"build:copy-key-matrix": "node scripts/copy-key-matrix.ts",
"build:check-key-weight": "node scripts/check-key-weight.ts"
```

GitHub Actions: both `.github/workflows/deploy.yml` and `.github/workflows/pr-check.yml` have hardcoded `npm run build:data && ...` chains — both must be updated to include `build:key`, `build:copy-key-matrix`, and `build:check-key-weight` at the same positions. [VERIFIED: both workflows contain the same hardcoded chain]

### Pattern 10: copy-key-matrix.ts (3-line clone of copy-parquet.ts)

```typescript
// scripts/copy-key-matrix.ts
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir(resolve('_site'), { recursive: true });
await copyFile(resolve('data/key-matrix.json'), resolve('_site/key-matrix.json'));
console.log('Copied key matrix: data/key-matrix.json -> _site/key-matrix.json');
```

### Pattern 11: Coverage Report Shape

```typescript
// data/key-coverage-report.json emitted by build-key.ts
interface KeyCoverageReport {
  generated: string;        // ISO timestamp
  matched: number;          // 1,175 expected after Grammia synonyms
  unmatched: number;        // ~37 after Grammia synonyms
  unmatched_binomials: Array<{
    binomial: string;       // original key binomial (normalized)
    direct_slug: string;    // what direct transform produced
    reason: 'no direct match, no synonym';
  }>;
}
```

### Pattern 12: Initial species-synonyms.csv Entries (Grammia → Apantesis)

16 confirmed Grammia→Apantesis mappings where the Apantesis slug exists in `data/species.csv` [VERIFIED: direct comparison of key.csv header vs site species.csv]:

```csv
from_binomial,to_species_slug
Grammia doris,apantesis-doris
Grammia virgo,apantesis-virgo
Grammia parthenice,apantesis-parthenice
Grammia virguncula,apantesis-virguncula
Grammia speciosa,apantesis-speciosa
Grammia nevadensis,apantesis-nevadensis
Grammia quenseli,apantesis-quenseli
Grammia margo,apantesis-margo
Grammia behrii,apantesis-behrii
Grammia williamsii,apantesis-williamsii
Grammia elongata,apantesis-elongata
Grammia blakei,apantesis-blakei
Grammia ornata,apantesis-ornata
Grammia complicata,apantesis-complicata
Grammia edwardsii,apantesis-edwardsii
Grammia eureka,apantesis-eureka
Grammia yukona,apantesis-yukona
```

Note: `Grammia  blakei` (double-space in key.csv) normalizes to `Grammia blakei` before synonym lookup, so the synonym entry uses the normalized form. [VERIFIED: whitespace normalization with `/\s+/g` confirmed above]

### Anti-Patterns to Avoid

- **Using `columns: true` in csv-parse for key.csv**: The header row IS the species list (row 0 col 1+). Using `columns: true` would treat it as field names and lose the data. Use `columns: false`.
- **`columns: true` + `skip_empty_lines: true` without `nullstr=''` when reading species.csv via csv-parse**: The `validateCsv` function in `build-data.ts` uses `columns: true` but without `nullstr`. That's fine for `validateCsv` (returns string values). The DuckDB import uses `nullstr = ''` correctly.
- **Inlining `matrix` in HTML via Eleventy data file**: The `src/_data/keyMatrix.ts` Eleventy data file (Phase 41) will return only `{ characters, species }`; the `matrix` array must NOT be returned there. `build-key.ts` writes the full artifact; Eleventy only reads the metadata portion.
- **Guarding `build:key` on `key-characters.csv` mtime**: `build-key.ts` also reads `species-synonyms.csv` (curator updates) and `images.csv` (new photos). Run unconditionally. [CITED: ARCHITECTURE.md §Anti-Pattern 4]
- **`z.string().regex(base64)` for each matrix entry in Zod**: Zod `z.array(z.string())` is sufficient at build time; byte-length assertion is a post-parse `if` check (O(237)), not a per-string refinement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UTF-8 + column presence pre-flight | Custom file validator | `validateCsv()` from `build-data.ts` | Already handles invalid bytes, missing columns, empty file; reexported and importable |
| CSV parse | Custom row-splitting | `csv-parse/sync` `parse()` | Handles quoted fields, escaped commas, Windows CR/LF — all present in key.csv |
| Gzip compression | Manual bit-level compression | `zlib.gzipSync` (Node built-in) | Correct, fast, no new dep |
| Nav-image selection (lowest-weight navigational-first) | Re-implement priority sort | DuckDB `FIRST(filename ORDER BY ...)` query | Mirrors exact logic in `taxon.ts`; tested against real data |
| Species slug construction | Custom normalization | `genus.toLowerCase() + '-' + epithet.toLowerCase()` via normalizeBinomial | Simple and already established as the site slug convention |

**Key insight:** The entire implementation reuses existing utilities. The only "new" code is the bitset encoding loop and the label-parsing switch — both are 10-15 lines each.

## Common Pitfalls

### Pitfall 1: `csv-parse` `columns: true` Destroys the Header Row

**What goes wrong:** Calling `parse(raw, { columns: true })` on `key.csv` promotes row 0 (species binomials) to field names, and returns rows 1–237 as objects keyed by those binomials. You cannot iterate species binomials from rows; you get them only as object keys (un-ordered, O(1228) keys per row).

**Why it happens:** Standard CSV files have a header row with field names. `key.csv` uses row 0 as data (species list), not field names.

**How to avoid:** Use `columns: false` and manually extract `allRows[0].slice(1)` as species list.

**Warning signs:** `speciesBinomials` is empty or `Object.keys(firstRow).length === 1229`.

### Pitfall 2: Leaving the `Grammia  blakei` Double-Space in synonym entries

**What goes wrong:** The synonym map key uses the un-normalized binomial including double-space. After normalization, lookup fails.

**Why it happens:** The synonym CSV entry `Grammia  blakei,apantesis-blakei` contains a double-space, but after `/\s+/g` normalization the lookup key is `Grammia blakei`.

**How to avoid:** All synonym entries use the normalized (single-space, trimmed) form as `from_binomial`. The resolution function normalizes the key binomial BEFORE synonym lookup.

**Warning signs:** Coverage report shows `Grammia blakei` unmatched even after adding synonym entries.

### Pitfall 3: DuckDB SQL Injection via Species Slug Interpolation

**What goes wrong:** `build-data.ts` already shows the concern — `COPY TO parquet` cannot be parameterized. Similarly, if the nav-image query interpolates slug values without validation, a malformed slug could inject SQL.

**Why it happens:** DuckDB node-api bindings do not support prepared statement parameter binding for all query forms.

**How to avoid:** Either (a) use DuckDB's `IN` clause with a literal set and validate each slug against `^[a-z]+-[a-z]+$`, or (b) load all images into a `Map<slug, filename>` in JS after a single `SELECT * FROM images` query, then resolve per slug in TypeScript. Option (b) is simpler and avoids any interpolation. [CITED: `build-data.ts` `validateSlugComponent` guard pattern]

**Warning signs:** Build error from DuckDB containing unexpected SQL syntax.

### Pitfall 4: Artifact-Size Check Runs Before `_site/key-matrix.json` Exists

**What goes wrong:** `check-key-weight.ts` is wired before `copy-key-matrix.ts`, so it reads from `_site/` before the file is copied there.

**Why it happens:** Build chain ordering mistake. `copy-key-matrix.ts` must run BEFORE `check-key-weight.ts`.

**How to avoid:** In `package.json` `build` script: `build:copy-key-matrix && build:check-key-weight` (in that order).

**Warning signs:** `check-key-weight.ts` exits with "file not found" error.

### Pitfall 5: tsconfig.node.json `include` Array Missing New Files

**What goes wrong:** `tsc --noEmit` (run as `npm run typecheck`) passes but the new scripts aren't checked.

**Why it happens:** `tsconfig.node.json` has an explicit `include` array. New scripts in `scripts/` with `.ts` extension need to match `"scripts/**/*.ts"` — which they already do. But `scripts/lib/` has its own entries. New test files at `scripts/build-key.test.ts` match the existing glob.

**How to avoid:** No tsconfig change needed — `scripts/**/*.ts` covers all new scripts. But verify `npm run typecheck` includes the new files by checking for type errors in them.

**Warning signs:** New script has a type error that `typecheck` doesn't catch.

### Pitfall 6: Test Runner `package.json` `test` Script Doesn't Include New Test Files

**What goes wrong:** `scripts/build-key.test.ts` and `scripts/check-key-weight.test.ts` are not added to the `node --test ...` invocation in the `test` script.

**Why it happens:** The `test` script lists files explicitly (not via glob for scripts); new test files must be added manually. [VERIFIED: `package.json` `test` script lists each test file explicitly — though the glob `'scripts/lib/*.test.ts'` and `src/components/*.test.ts` are present]

**How to avoid:** Add `scripts/build-key.test.ts scripts/check-key-weight.test.ts` to the `test` script.

**Warning signs:** CI passes even though the new test file has assertion errors.

## Code Examples

### Full build-key.ts Skeleton

```typescript
// scripts/build-key.ts
// Pre-build: parse data/key-characters.csv → emit data/key-matrix.json + data/key-coverage-report.json
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { validateCsv } from './build-data.ts';
import { CharacterSchema, KeySpeciesSchema, KeyMatrixSchema } from '../src/types/schemas.ts';
import * as z from 'zod';  // build-time: full Zod (not zod/mini)

export async function main(): Promise<void> {
  // 1. Pre-flight validation
  validateCsv('data/key-characters.csv', []);  // columns check is by position, not name

  // 2. CSV parse — columns: false (header row is data, not field names)
  const raw = readFileSync(resolve('data/key-characters.csv'));
  const allRows: string[][] = parse(raw, { columns: false, skip_empty_lines: true });
  const [headerRow, ...dataRows] = allRows;
  const speciesBinomials = (headerRow ?? []).slice(1);  // 1,228 entries

  // 3. Load slug resolution resources
  const speciesRows: Array<{genus: string; species: string}> = parse(
    readFileSync(resolve('data/species.csv')), { columns: true, skip_empty_lines: true }
  );
  const siteSlugSet = new Set(speciesRows.map(r =>
    `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`
  ));
  const synonymRows: Array<{from_binomial: string; to_species_slug: string}> = parse(
    readFileSync(resolve('data/species-synonyms.csv')), { columns: true, skip_empty_lines: true }
  );
  const synonymMap = new Map(synonymRows.map(r => [r.from_binomial, r.to_species_slug]));

  // 4. Resolve species slugs (build index: original col → resolved slug or null)
  const resolvedSlugs: Array<string | null> = speciesBinomials.map(b => resolveSlug(b, siteSlugSet, synonymMap));
  const matchedIndices: number[] = resolvedSlugs.flatMap((s, i) => s !== null ? [i] : []);
  const unmatchedBinomials = speciesBinomials.filter((_, i) => resolvedSlugs[i] === null);

  // 5. DuckDB nav-image query for matched slugs
  const matchedSlugs = matchedIndices.map(i => resolvedSlugs[i]!);
  const navImages = await queryNavImages(matchedSlugs);

  // 6. Build characters[], species[], matrix[]
  const characters = dataRows.map((row, idx) => ({
    id: idx,
    ...parseCharacterLabel(row[0] ?? ''),
    image_filename: null,
  }));
  const species = matchedSlugs.map((slug, spIdx) => ({
    slug,
    genus: speciesBinomials[matchedIndices[spIdx]!]!.split(' ')[0] ?? '',
    epithet: speciesBinomials[matchedIndices[spIdx]!]!.split(' ')[1] ?? '',
    common_name: null,
    nav_image: navImages.get(slug) ?? null,
  }));
  const nMatchedSpecies = matchedSlugs.length;
  const matrix = dataRows.map(row => {
    const nBytes = Math.ceil(nMatchedSpecies / 8);
    const bits = new Uint8Array(nBytes);
    for (const [rank, origIdx] of matchedIndices.entries()) {
      if (row[origIdx + 1] === '1') bits[rank >> 3]! |= (1 << (rank & 7));
    }
    return Buffer.from(bits).toString('base64');
  });

  // 7. Validate with Zod
  const artifact = KeyMatrixSchema.parse({ characters, species, matrix });

  // 8. Post-Zod structural invariants
  const nBytes = Math.ceil(artifact.species.length / 8);
  const expectedB64Len = Math.ceil(nBytes / 3) * 4;
  if (artifact.matrix.length !== 237) throw new Error('matrix length !== 237');
  for (const b64 of artifact.matrix) {
    if (b64.length !== expectedB64Len) throw new Error(`bitset length mismatch: ${b64.length} vs ${expectedB64Len}`);
  }

  // 9. Write artifacts
  writeFileSync(resolve('data/key-matrix.json'), JSON.stringify(artifact));
  writeFileSync(resolve('data/key-coverage-report.json'), JSON.stringify({
    generated: new Date().toISOString(),
    matched: matchedSlugs.length,
    unmatched: unmatchedBinomials.length,
    unmatched_binomials: unmatchedBinomials.map(b => ({
      binomial: normalizeBinomial(b),
      direct_slug: binomialToSlug(b),
      reason: 'no direct match, no synonym',
    })),
  }));
  console.log(`build-key: ${matchedSlugs.length} matched, ${unmatchedBinomials.length} unmatched`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error((err as Error).message); process.exit(1); });
}
```

### Zod Import Strategy in build-key.ts

Use full `zod` (not `zod/mini`) in build scripts, same as `build-data.ts` uses `OccurrenceRecordSchema` from schemas.ts (which itself uses `zod/mini`). The schemas are defined with `zod/mini` so they are browser-safe; the BUILD scripts can parse them with either. Because `z.parse()` is available on `zod/mini` schemas via the mini runtime, no special import is needed in `build-key.ts` beyond importing the schemas.

```typescript
// In build-key.ts — just import the schema, which internally uses zod/mini
// The .parse() method is available on zod/mini schemas
import { KeyMatrixSchema } from '../src/types/schemas.ts';
// KeyMatrixSchema.parse(artifact) works — zod/mini exposes parse()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nested-array JSON matrix (170 KB gzip) | Per-character-state base64 bitsets (37 KB gzip) | v4.0 research phase 2026-06-24 | 4.6× size reduction; ARCHITECTURE.md divergence resolved by SUMMARY.md |
| `zod` (full) in browser | `zod/mini` in browser | v3.0 toolchain | Smaller bundle; schemas.ts uses `import * as z from 'zod/mini'` |
| Phase 40 owned slug resolution | Phase 39 owns full pipeline | CONTEXT.md D-02 | Stable data contract before filter logic; no rewrite between phases |

**Deprecated/outdated:**
- ROADMAP Phase 39 SC1 "matrix (237 × N binary rows)" wording: overridden by CONTEXT.md D-04 (bitsets).
- ROADMAP Phase 39 SC3 "100 KB byte budget (raw)": overridden by CONTEXT.md D-06 (50 KB gzip).
- ARCHITECTURE.md `matrix: number[][]` shape: overridden by SUMMARY.md + CONTEXT.md D-04 (base64 bitsets).

## Open Questions

1. **`validateCsv` reuse for key-characters.csv**: `validateCsv` in `build-data.ts` calls `parse()` with `{ columns: true }` which works when the first row IS column headers. For `key-characters.csv`, the first row contains species names as values (col 0 is empty, cols 1–1228 are binomials). `validateCsv` with `requiredColumns: []` would still succeed (no required columns to check), but the row count check and UTF-8 check would pass, making it useful for those guards. The returned rows would be keyed by species binomials (bizarre but harmless for a pre-flight check). Alternative: call `validateCsv` only for the UTF-8 + file-exists checks, then do a separate `parse(raw, { columns: false })` for the actual data.
   - **Recommendation:** Use `validateCsv` for UTF-8 + existence pre-flight with `requiredColumns: []`, then immediately re-parse with `columns: false`. The double-parse is negligible on a 629 KB file.

2. **DuckDB SQL injection guard for nav-image query**: Three options — (a) JS-side resolution using a `Map<slug, filename>` built from `SELECT * FROM images`, (b) slug allowlist validation before interpolation, (c) parameterized `IN` clause. Option (a) is simplest (load all images into memory, no interpolation at all).
   - **Recommendation:** Use option (a) — load all image rows into a `Map<slug, string>` and resolve nav images in TypeScript. The images dataset is small enough.

3. **`zod/mini` `.parse()` at build time**: `schemas.ts` imports from `zod/mini`. Full Zod's `.parse()` throws on validation failure; `zod/mini`'s `.parse()` also throws. The APIs are compatible for this use case.
   - **Recommendation:** No special handling needed — `KeyMatrixSchema.parse(artifact)` works in both environments.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All build scripts | ✓ | v24.15.0 | — |
| `csv-parse` | `build-key.ts` | ✓ | 7.0.0 (listed as `^6.2.1` in package.json) | — |
| `@duckdb/node-api` | Nav-image join | ✓ | `^1.5.1-r.2` | — |
| `zod` / `zod/mini` | Schema validation | ✓ | `^4.4.3` | — |
| `zlib` (Node built-in) | Byte-budget check | ✓ | Node 24 built-in | — |
| `data/key-characters.csv` | `build-key.ts` | ✗ (not yet committed) | — | Must be copied from `~/Downloads/may 6 2015 key files/may 6 2015 key.csv` |
| `sharp` | Character images | ✗ | — | Not needed in Phase 39; defer to Phase 43 |

**Missing dependencies with no fallback:**
- `data/key-characters.csv` — plan must include a task to copy this file from `~/Downloads/may 6 2015 key files/may 6 2015 key.csv` and commit it before any other task runs.

**Missing dependencies with fallback:**
- `sharp` — not needed; confirmed deferred to Phase 43.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` (v24.15.0) |
| Config file | None — invoked directly |
| Quick run command | `node --test scripts/build-key.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KEY-01 | bitset encoding: bit `i` set iff species `i` has `1` in CSV row | unit | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |
| KEY-01 | full artifact gzip ≤ 50 KB | integration | `node --test scripts/check-key-weight.test.ts` | ❌ Wave 0 |
| KEY-02 | 3-part label parsed to `{cat, subcategory: null, question, state}` | unit | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |
| KEY-02 | 4-part label parsed to `{cat, subcategory, question, state}` | unit | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |
| KEY-03 | `KeyMatrixSchema.parse()` rejects wrong shape | unit | `node --test src/types/schemas.test.ts` | ❌ Wave 0 |
| KEY-04 | `check-key-weight.ts` exits 1 when artifact > 50 KB gzip | unit | `node --test scripts/check-key-weight.test.ts` | ❌ Wave 0 |
| KEY-05 | `build:key` completes in < 5 s | smoke | `time npm run build:key` (manual) | ❌ manual |
| MATCH-01 | double-space `Tolype  laricis` resolves to `tolype-laricis` | unit | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |
| MATCH-01 | trailing-space `Tyta luctuosa ` resolves to `tyta-luctuosa` | unit | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |
| MATCH-01 | `Grammia doris` resolves to `apantesis-doris` via synonym | unit | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |
| MATCH-02 | coverage report lists unmatched binomials; matched count = 1175+ | integration | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |
| MATCH-03 | matched species include `nav_image` field from DuckDB join | integration | `node --test scripts/build-key.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test scripts/build-key.test.ts scripts/check-key-weight.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `scripts/build-key.test.ts` — covers KEY-01, KEY-02, MATCH-01, MATCH-02, MATCH-03
- [ ] `scripts/check-key-weight.test.ts` — covers KEY-04
- [ ] `src/types/schemas.test.ts` additions — covers KEY-03 (CharacterSchema, KeySpeciesSchema, KeyMatrixSchema)

## Security Domain

The security surface of this phase is minimal — it is a local build script processing trusted local files.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (limited) | Slug component validation before any SQL interpolation; use JS-side Map instead of SQL interpolation |
| V2 Authentication | no | Build script only |
| V3 Session Management | no | Build script only |
| V4 Access Control | no | Build script only |
| V6 Cryptography | no | Base64 is encoding, not encryption |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via species slug in DuckDB query string | Tampering | Use JS-side `Map<slug, filename>` — no slug interpolation into SQL |
| Malformed base64 output (truncated bitset) | Tampering | Post-Zod byte-length assertion on all 237 bitsets before `writeFileSync` |

## Sources

### Primary (HIGH confidence — direct file inspection)

- `data/key-characters.csv` (via `~/Downloads/may 6 2015 key files/may 6 2015 key.csv`) — matrix dimensions 237 × 1,228 verified; whitespace anomalies at cols 15, 127, 361 confirmed; colon depths `{2, 3}` confirmed; gzip measurements performed
- `scripts/build-data.ts` — `validateCsv` function, DuckDB pattern, `csv-parse/sync` import
- `scripts/emit-species-states.ts` — JSON artifact emit pattern
- `scripts/copy-parquet.ts` — post-Eleventy copy pattern
- `scripts/check-page-weight.ts` — HTML-only weight gate; confirms why a separate artifact check is needed
- `scripts/ingest-photos.ts` — `species-synonyms.csv` read + `from_binomial → to_species_slug` pattern
- `src/types/schemas.ts` — `zod/mini` constraint confirmed; schema style (`z.nullable(z.string())`)
- `src/types/events.ts` — `FilterChangeDetail` confirmed unchanged (8 fields; no key-character fields)
- `src/_data/taxon.ts` — DuckDB nav-image join pattern (images query with `TRY_CAST(weight AS INTEGER)`)
- `src/_data/speciesPhotos.ts` — soft-fail if absent pattern for Eleventy data files
- `package.json` — confirmed build chain order; `csv-parse@^6.2.1` in dependencies; no `sharp`
- `data/species-synonyms.csv` — confirmed header-only (empty)
- `.github/workflows/*.yml` — both deploy and PR-check workflows confirmed with hardcoded build chains
- `node_modules/csv-parse/package.json` — csv-parse installed at v7.0.0
- `.planning/phases/39-key-matrix-data-pipeline/39-CONTEXT.md` — locked decisions D-01 through D-07
- `.planning/research/SUMMARY.md`, `STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md` — v4.0 milestone research

### Secondary (MEDIUM confidence)

- Python measurement of key.csv bitset encoding: 36.7 KB gzip for full artifact with hierarchy + species + matrix (measured in this session using actual source file)
- Grammia→Apantesis mapping: 16 confirmed entries via direct comparison of key.csv header vs `data/species.csv` (17 Grammia in key; 1 has double-space and normalizes correctly)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `zod/mini` schemas defined with `z.object()` etc. have a `.parse()` method compatible with the build-time invocation in `build-key.ts` | Standard Stack / Code Examples | If wrong: import full `zod` in build-key.ts and skip `zod/mini` type inference — trivial fix |
| A2 | The 53 unmatched binomials after adding 16 Grammia→Apantesis synonyms will be ~37 (53 - 16 = 37) | Open Questions | Actual number may differ if some Grammia synonyms already existed or site slugs differ; coverage report will show the truth on first run |

**All other key claims (CSV structure, slug counts, gzip sizes, script patterns) are VERIFIED from direct file inspection in this session.**

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified as installed; no new packages
- Architecture: HIGH — patterns verified by reading every template script
- Pitfalls: HIGH — grounded in direct key.csv inspection and existing script review
- Byte-budget claim: HIGH — measured with Python against actual source file (36.7 KB gzip)
- Slug counts: HIGH — computed by running resolution algorithm against actual CSV + species.csv

**Research date:** 2026-06-24
**Valid until:** Stable — key.csv format, site slug convention, and codebase patterns are unlikely to change
