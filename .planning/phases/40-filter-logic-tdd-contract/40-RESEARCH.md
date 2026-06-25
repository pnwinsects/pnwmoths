# Phase 40: Filter Logic TDD Contract — Research

**Researched:** 2026-06-24
**Domain:** Pure TypeScript filter logic, bitset arithmetic, node:test TDD, Zod/mini schema extension, custom event typing
**Confidence:** HIGH — all findings verified against `data/key-matrix.json` (live artifact), `src/types/schemas.ts`, `src/types/events.ts`, `src/components/key-matrix-cache.ts`, `scripts/build-key.ts`, `package.json`, and `tsconfig.node.json`. No WebSearch required; all claims are `[VERIFIED]` from direct codebase inspection.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** OR within a question, AND across questions. Raw `0`/blank never excludes; elimination requires a positively-scored opposing state.
- **D-02 (polymorphic match):** A species scoring `1` on ANY selected state of a question is kept, regardless of how many opposing states also score `1`. `15,492` such instances in the matrix.
- **D-03 (canonical elimination predicate):** For each constrained question Q (≥1 selected state), eliminate a species IFF it scores `0` on ALL selected states of Q AND `1` on ≥1 opposing (unselected) state of Q. AND across constrained questions. Empty total selection → full 1,192 result set. Single uniform rule; no special-casing.
- **D-04 (fully-unscored always kept):** `hypenodes-fractilinea` and `xestia-normanianus` score `0` on all 237 characters; they must appear in every result set. Never eliminate them. No special branch — they satisfy D-03 automatically (no opposing state is ever `1`).
- **D-05 (category-agnostic):** `buildQuestionGroups()` and `computeMatching()` have no knowledge of category names. Distribution/Seasonality UX deferred to Phase 41.
- **Event bus isolation:** `FilterChangeDetail` must NOT be extended. `pnwm-key-filter-change` is a distinct event type.
- **Toolchain:** Node 24 native type-stripping; `node --test`; no Vitest (deferred v3.0-future TSF-03); `zod/mini` for browser boundary; full Zod at build time only.

### Claude's Discretion
- `computeMatching()` return shape — research must propose a concrete signature serving Phase 42 results grid + `pnwm-key-filter-change` event detail.
- `KeyMatrixMetaSchema` field set — determine required fields; decide whether `build-key.ts` emits a `meta` block or meta is derivable client-side.
- `buildQuestionGroups()` question-identity key — determine from actual data (research responsibility).

### Deferred Ideas (OUT OF SCOPE)
- Distribution/Seasonality UX (include/exclude/separate-section): Phase 41.
- Curation of `hypenodes-fractilinea` / `xestia-normanianus` character scores: ongoing, not Phase 40 blocker.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATCH-01 | Slug resolution | Already Complete (Phase 39). Verified: `data/key-matrix.json` has `species[].slug` for all 1,192 matched entries. |
| MATCH-02 | Coverage report | Already Complete (Phase 39). `data/key-coverage-report.json` emitted by `build-key.ts`. |
| MATCH-03 | Nav image join | Already Complete (Phase 39). `species[].nav_image` present in artifact. |
| IDENT-04 | Filter semantics OR-within/AND-across, "0=unscored" handled correctly, TDD-first | This entire phase. `buildQuestionGroups()` + `computeMatching()` implement D-01/D-02/D-03; test suite proves all four named TDD cases before any UI. |
</phase_requirements>

---

## Summary

Phase 40 delivers the pure logic layer for the Identify feature: two exported functions in `src/_lib/key-filter.ts`, a co-located `node --test` suite in `src/_lib/key-filter.test.ts`, `KeyMatrixMetaSchema` added to `src/types/schemas.ts`, and `pnwm-key-filter-change` event detail added to `src/types/events.ts`. All four items are consumed by Phases 41–42; none require UI or network code.

The critical insight is that D-03's elimination predicate is NOT equivalent to the STACK.md pseudocode's naive `charUnion = OR(selected bitsets); result &= charUnion`. That pseudocode treats species absent from all selected states' bitsets (all-zero) the same as species with an opposing `1` — it wrongly eliminates unscored species. D-03 requires eliminating only species that score `0` on all selected states AND `1` on at least one opposing state. The correct bitset expression is derived in the Architecture Patterns section below.

The question-identity key for `buildQuestionGroups()` is the `question` string alone: all 55 question strings are globally unique in the matrix — confirmed by exhaustive inspection of all 237 characters. No two `(category, subcategory)` paths share the same question string. There is one data artifact in the matrix (`"Abdomen and thorax` with a leading quote, characters 233–234) from `relax_quotes` parsing, but its question string remains unique and the trailing `"` in its state values is a cosmetic artifact that does not affect grouping.

**Primary recommendation:** implement `buildQuestionGroups()` as a pure Map-building pass over `KeyMatrix.characters`; implement `computeMatching()` with the D-03 bitset expression (NOT the STACK.md naive union); return `{ matchedSlugs: string[], count: number }` from `computeMatching()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Question grouping (`buildQuestionGroups`) | Node/Browser `_lib` | — | Pure data transform; no DOM, no network; importable by both test runner and Lit component |
| Filter matching (`computeMatching`) | Node/Browser `_lib` | — | Pure Uint8Array bitset arithmetic; no DOM; typed-array code runs identically in Node test and browser |
| KeyMatrixMetaSchema | `src/types/schemas.ts` | — | Extends existing Zod/mini schema file; imported by both browser guard and build-time check |
| `pnwm-key-filter-change` event detail | `src/types/events.ts` | — | Mirrors existing `FilterChangeDetail` augmentation; browser-only at runtime but typed at build time |
| Matrix bitset decode (base64 → Uint8Array) | Shared utility in `key-filter.ts` | `key-matrix-cache.ts` (existing) | `key-matrix-cache.ts` already decodes for structural validation; `key-filter.ts` decodes for computation. Could share a helper but a 2-line Buffer.from decode is simpler to inline |

---

## Standard Stack

### Core (no new dependencies)

All needs are met by existing project dependencies. [VERIFIED: package.json + node_modules inspection]

| Library | Version | Purpose | Relevance to Phase 40 |
|---------|---------|---------|----------------------|
| `zod/mini` | `^4` (from `zod@^4`) | Browser-safe schema parse | `KeyMatrixMetaSchema` added here; imported by browser components |
| `node:test` + `node:assert/strict` | Node 24 built-in | Test runner | `key-filter.test.ts` uses `describe`/`it`/`assert.strictEqual` — identical pattern to `glossary-transform.test.ts` |
| `node --strip-types` | Node 24 built-in | Run `.ts` files without transpiler | Already the project runtime; test files import `.ts` extensions directly |
| `tsc --noEmit` | TypeScript 5.x | Typecheck gate (`npm run typecheck`) | Runs against both `tsconfig.node.json` and `tsconfig.browser.json`; Phase 40 must pass both |

### No New Packages Required

[VERIFIED: package.json] Zero new npm dependencies. All computation uses:
- `Buffer.from(b64, 'base64')` — Node built-in, produces `Uint8Array`
- Typed array bitwise ops — standard JavaScript
- `zod/mini` — already imported by `src/types/schemas.ts`

## Package Legitimacy Audit

> Section skipped: Phase 40 installs zero new packages. All dependencies are Node built-ins or existing project dependencies verified in prior phases.

---

## Architecture Patterns

### Data Flow

```
data/key-matrix.json
  └─ KeyMatrix { characters[], species[], matrix[] }
        │
        ├─ buildQuestionGroups(characters)
        │    └─ Map<questionText, Character[]>
        │         (55 entries; grouped by character.question string)
        │
        └─ computeMatching(matrix, species, selection, questionGroups)
               │  selection: Map<questionText, Set<characterId>>
               │  (empty selection → all 1,192)
               │
               ▼
          { matchedSlugs: string[], count: number }
               │
               ├─ pnwm-key-filter-change event detail (Phase 41→42)
               └─ Phase 42 results grid (slug list + count)
```

### Recommended Project Structure

```
src/
├── _lib/
│   ├── glossary-transform.ts          (existing)
│   ├── glossary-transform.test.ts     (existing)
│   ├── key-filter.ts                  (NEW — Phase 40)
│   └── key-filter.test.ts             (NEW — Phase 40)
├── types/
│   ├── schemas.ts                     (add KeyMatrixMetaSchema)
│   └── events.ts                      (add KeyFilterChangeDetail + augment)
└── components/
    └── key-matrix-cache.ts            (existing — no changes in Phase 40)
```

### Pattern 1: buildQuestionGroups()

**What:** Groups the flat `Character[]` array from `KeyMatrix.characters` into a `Map<string, Character[]>` keyed by `character.question`. Each map entry holds all states for that question in their original order (preserving `character.id` sequence for bitset index lookup).

**Why question string alone:** Verified from data — all 55 question strings are globally unique across all 237 characters. No `(category, subcategory)` path collision exists. [VERIFIED: exhaustive enumeration of `data/key-matrix.json`]

**Data note:** Characters 233–234 have `category: '"Abdomen and thorax'` (leading `"`) and `state: 'Yes"'` / `state: 'No"'` (trailing `"`) as Lucid CSV export artifacts from `relax_quotes` parsing. Their `question` field is unaffected and groups correctly. This is a pre-existing data artifact; Phase 40 does not fix it (no change to `build-key.ts`).

```typescript
// Source: derived from KeyMatrix type in src/types/schemas.ts
import type { Character, KeyMatrix } from '../types/schemas.ts';

export type QuestionGroups = Map<string, Character[]>;

/**
 * Group the 237 character-states by their question string.
 * Returns a Map<questionText, Character[]> with 55 entries.
 * Question string is the correct grouping key — all 55 question strings
 * are globally unique in the matrix (verified against data/key-matrix.json).
 * Insertion order matches characters[] order, preserving character.id sequence.
 */
export function buildQuestionGroups(characters: Character[]): QuestionGroups {
  const groups = new Map<string, Character[]>();
  for (const char of characters) {
    const existing = groups.get(char.question);
    if (existing !== undefined) {
      existing.push(char);
    } else {
      groups.set(char.question, [char]);
    }
  }
  return groups;
}
```

### Pattern 2: computeMatching() — D-03 Bitset Expression

**What:** Given a selection `Map<questionText, Set<characterId>>` and the loaded matrix, applies D-03's elimination predicate per constrained question and ANDs results across questions.

**The critical bitwise derivation (D-03 vs naive union):**

The STACK.md pseudocode computes per-question:
```
charUnion = OR(selected state bitsets)    // union = "any selected state"
result &= charUnion                       // eliminate species NOT in union
```
This incorrectly eliminates species with all-zero for the question (unscored) because they are absent from `charUnion`. D-03 says such species must pass through.

**Correct D-03 expression per question Q with selected states S and opposing states O:**

```
// A species is ELIMINATED iff: 0 on all selected AND 1 on ≥1 opposing
// Equivalently: KEPT iff: 1 on any selected OR 0 on all opposing

selectedUnion  = bitwise OR of matrix bitsets for all s in S   // species with ≥1 selected state
opposingUnion  = bitwise OR of matrix bitsets for all o in O   // species with ≥1 opposing state

// Kept = has a selected bit  OR  has no opposing bit
// Eliminated = no selected bit AND has an opposing bit
//
// In bitset terms:
//   eliminateMask = (~selectedUnion) & opposingUnion
//   keepMask = ~eliminateMask = selectedUnion | (~opposingUnion)
//   result &= keepMask

result &= (selectedUnion | ~opposingUnion)
```

Note: `~` on a `Uint8Array` must be done byte-by-byte; there is no built-in bitwise NOT on typed arrays. Trailing bits beyond `species.length` in the last byte must be masked to zero before collecting indices (or ignored by bounding the species index loop at `species.length`).

**Concrete implementation plan:**

```typescript
// Source: derived from key-matrix-cache.ts bitset math + D-03 CONTEXT.md
import type { KeyMatrix, KeySpecies } from '../types/schemas.ts';
import type { QuestionGroups } from './key-filter.ts';

// Selection: outer key = question text; inner Set = character IDs (character.id values)
export type Selection = Map<string, Set<number>>;

export interface MatchResult {
  matchedSlugs: string[];   // slugs of matching KeySpecies, in species[] order
  count: number;            // matchedSlugs.length — convenience for event detail + counter
}

/**
 * Apply D-03 filter semantics to produce the matching species set.
 *
 * Empty selection → returns all species slugs (full 1,192).
 *
 * Per constrained question Q (≥1 selected state):
 *   Eliminate species that score 0 on ALL selected states AND 1 on ≥1 opposing state.
 * AND across all constrained questions.
 *
 * Fully-unscored species (hypenodes-fractilinea, xestia-normanianus) satisfy D-03
 * automatically — they have no opposing 1s — and are always kept.
 */
export function computeMatching(
  matrix: KeyMatrix,
  selection: Selection,
  questionGroups: QuestionGroups,
): MatchResult {
  const nSpecies = matrix.species.length;
  const nBytes = Math.ceil(nSpecies / 8);

  // Start with all-1s result (all species pass)
  const result = new Uint8Array(nBytes).fill(0xff);

  for (const [question, selectedIds] of selection) {
    if (selectedIds.size === 0) continue;      // empty selection for this question: no constraint

    const allStatesForQ = questionGroups.get(question) ?? [];
    const opposingIds = allStatesForQ.filter(c => !selectedIds.has(c.id)).map(c => c.id);

    // selectedUnion: OR of bitsets for all selected states
    const selectedUnion = new Uint8Array(nBytes);
    for (const id of selectedIds) {
      const b64 = matrix.matrix[id];
      if (b64 === undefined) continue;
      const bits = Buffer.from(b64, 'base64');
      for (let i = 0; i < nBytes; i++) selectedUnion[i]! |= bits[i]!;
    }

    // opposingUnion: OR of bitsets for all opposing states
    const opposingUnion = new Uint8Array(nBytes);
    for (const id of opposingIds) {
      const b64 = matrix.matrix[id];
      if (b64 === undefined) continue;
      const bits = Buffer.from(b64, 'base64');
      for (let i = 0; i < nBytes; i++) opposingUnion[i]! |= bits[i]!;
    }

    // keepMask = selectedUnion | ~opposingUnion  (species kept if selected OR not opposed)
    for (let i = 0; i < nBytes; i++) {
      result[i]! &= (selectedUnion[i]! | (~opposingUnion[i]! & 0xff));
    }
  }

  // Collect matching slugs
  const matchedSlugs: string[] = [];
  for (let i = 0; i < nSpecies; i++) {
    if ((result[i >> 3]! >> (i & 7)) & 1) {
      matchedSlugs.push(matrix.species[i]!.slug);
    }
  }

  return { matchedSlugs, count: matchedSlugs.length };
}
```

**Performance:** For 10 selected states, worst-case is 10 × 149-byte OR loops + 149-byte keep-mask AND loop = ~1,600 byte-ops per question. Well under 1 ms. [VERIFIED: same byte-math as key-matrix-cache.ts; `nBytes = ceil(1192/8) = 149`]

### Pattern 3: KeyMatrixMetaSchema

**What:** A Zod schema (using `zod/mini`) for a lightweight metadata object emitted as part of (or alongside) `data/key-matrix.json`. Consumed by Phase 42's "N of 1,228 species match" counter.

**Recommendation: embed as a `meta` top-level field in `key-matrix.json`; update `build-key.ts` to emit it.**

Rationale:
- Phase 42 needs `totalKeySpecies: 1228` (the original key total including unmatched), `matchedSpecies: 1192` (species in the matrix), and optionally `generatedAt` for debugging. All three are known at build time inside `main()` in `build-key.ts`.
- A separate fetch for meta would add a network round trip; embedding in the existing artifact is zero cost.
- The current `KeyMatrixSchema` does not have a `meta` field, so adding one requires a minor schema extension plus `build-key.ts` change. Both are in Phase 40 scope.

```typescript
// Add to src/types/schemas.ts:
export const KeyMatrixMetaSchema = z.object({
  totalKeySpecies: z.number(),    // 1,228 — all species in key.csv including unmatched
  matchedSpecies:  z.number(),    // 1,192 — species resolved to site slugs (in matrix)
  unmatchedSpecies: z.number(),   // 36 = 1,228 - 1,192 — for curator reference
  generatedAt:     z.string(),    // ISO 8601 timestamp from build-key.ts
});
export type KeyMatrixMeta = z.infer<typeof KeyMatrixMetaSchema>;
```

Then update `KeyMatrixSchema` to include `meta`:

```typescript
export const KeyMatrixSchema = z.object({
  meta:       KeyMatrixMetaSchema,        // NEW in Phase 40
  characters: z.array(CharacterSchema),
  species:    z.array(KeySpeciesSchema),
  matrix:     z.array(z.string()),
});
```

`build-key.ts` adds:
```typescript
meta: {
  totalKeySpecies: speciesBinomials.length,  // 1228
  matchedSpecies:  matchedSlugs.length,       // 1192
  unmatchedSpecies: unmatchedBinomials.length, // 36
  generatedAt:     new Date().toISOString(),
},
```

`validateKeyMatrix()` in `key-matrix-cache.ts` already calls `KeyMatrixSchema.parse(data)`, so the meta field is validated automatically at the client boundary without any changes to that function.

### Pattern 4: pnwm-key-filter-change Event Type

**What:** A typed custom event dispatched by `pnwm-identify` (Phase 41) when filter state changes. `pnwm-key-filter-change` is the transport between the filter panel and the results grid within `pnwm-identify`.

**Mirror the `FilterChangeDetail` / `HTMLElementEventMap` augmentation pattern from `src/types/events.ts` exactly. Do NOT extend `FilterChangeDetail`.**

```typescript
// Add to src/types/events.ts:

export interface KeyFilterChangeDetail {
  matchedSlugs: string[];   // current matching species slugs (mirrors computeMatching return)
  count: number;            // matchedSlugs.length — convenience for the counter component
  hasSelection: boolean;    // true iff any question has ≥1 selected state (drives empty-state UX)
}

// Global HTMLElementEventMap augmentation
declare global {
  interface HTMLElementEventMap {
    'pnwm-filter-change':     CustomEvent<FilterChangeDetail>;     // existing — do not touch
    'pnwm-key-filter-change': CustomEvent<KeyFilterChangeDetail>;  // NEW Phase 40
  }
}
```

`hasSelection` is included because Phase 41/42 need to distinguish "empty result from filters" vs "no filters applied yet" (different UX states — GRID-04 dead-end vs initial state). It is derivable from `selection.size > 0`, but including it in the event detail avoids listener-side recomputation.

### Anti-Patterns to Avoid

- **Naive union-then-AND (STACK.md pseudocode):** `result &= OR(selected bitsets)` wrongly eliminates unscored species. See D-03 bitset derivation above.
- **Keying question groups by `category:subcategory:question` path:** The 55 question strings are globally unique — the full path key is unnecessary and creates coupling to the category hierarchy. The `selection` Map uses question strings as keys, so panels and filter logic share the same natural key.
- **Storing selection as `Map<characterId, boolean>`:** This loses question-boundary information needed for OR-within / AND-across. Use `Map<questionText, Set<characterId>>`.
- **Extending `FilterChangeDetail`:** Causes all occurrence-filter listeners (`pnwm-occurrence-map`, `pnwm-phenology-chart`) to receive key-filter events. See `src/types/events.ts` PITFALLS note. [VERIFIED: PITFALLS.md Pitfall 12]
- **Trailing-bit contamination:** The last byte of a 1,192-species bitset has `8 - (1192 % 8) = 0` spare bits (1,192 is exactly divisible by 8 — actually `1192 / 8 = 149.0` exactly; no trailing bits). Spare-bit masking is not required for this specific species count but should be guarded by bounding the collection loop at `nSpecies` rather than `nBytes * 8`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Base64 decode | Custom atob loop | `Buffer.from(b64, 'base64')` (Node) | Already used in `key-matrix-cache.ts`; produces `Uint8Array` directly |
| Bitwise NOT on Uint8Array | Loop + manual flip | `(~byte & 0xff)` inline per byte | No typed-array NOT; inline is idiomatic and fast |
| Question grouping | Recursive tree build | Single `Map<string, Character[]>` pass | 55 questions; a tree is unnecessary complexity for Phase 40 (Phase 41 panel may build a tree for rendering, but the filter logic does not need it) |
| Schema validation at test time | Manual property checks | `zod/mini` parse — already available | Consistent with all other schema-validation sites in the project |

---

## Common Pitfalls

### Pitfall 1: D-03 vs naive OR-then-AND confusion

**What goes wrong:** Implementing `result &= OR(selected bitsets)` (STACK.md pseudocode). Correctly narrows on species with the selected character, but wrongly eliminates unscored species (all-zero row). The `0,0` invariant fails.

**Why it happens:** The STACK.md pseudocode looks correct for the "I want gray OR brown" case but silently conflates "not scored gray or brown" with "is not gray or brown".

**How to avoid:** Use `result &= (selectedUnion | ~opposingUnion)` per question. Write the `0,0` TDD case first (before implementing `computeMatching`) to drive out this distinction.

**Warning signs:** Selecting forewing color "Yellow" reduces results to 73 instead of the expected 75 (the 2 unscored species vanish); TDD case "0,0 pair is NOT eliminated" fails.

### Pitfall 2: question string key vs category path key

**What goes wrong:** Using `${category}:${subcategory}:${question}` as the Map key. The selection coming from the Phase 41 UI panel would need to know the full path to dispatch the correct key. The question string alone is sufficient and simpler.

**How to avoid:** Use `character.question` as the grouping key. Verified: globally unique across all 237 characters. [VERIFIED: data inspection]

### Pitfall 3: Data artifact in characters 233–234

**What goes wrong:** Encountering `category: '"Abdomen and thorax'` and `state: 'Yes"'` / `state: 'No"'` and treating them as bugs that need fixing in Phase 40.

**Why it happens:** `relax_quotes: true` in `build-key.ts`'s `csv-parse` call propagates Lucid's embedded unescaped double-quotes into the JSON. The artifact already exists committed to git.

**How to avoid:** Do not attempt to fix this in Phase 40. The question string `Does it appear as if the tip of the abdomen was "dipped" in a different color?` is unique and groups correctly despite the category/state artifacts. Include the artifact in a TDD comment but do not test for it specifically — fixing it belongs in a future `build-key.ts` pass.

### Pitfall 4: `verbatimModuleSyntax` + `declare global` requires a module boundary

**What goes wrong:** Adding `declare global { interface HTMLElementEventMap {...} }` to a file without an `export` statement causes a TypeScript error under `verbatimModuleSyntax: true`.

**How to avoid:** `src/types/events.ts` already has `export interface FilterChangeDetail {...}` which makes it a module. Adding `KeyFilterChangeDetail` as another export preserves the module boundary. No change needed to the file structure — just add the new export and augment the global map in the existing `declare global` block.

### Pitfall 5: `noUncheckedIndexedAccess` requires `!` on typed array indexing

**What goes wrong:** `result[i] |= bits[i]` fails typecheck under `noUncheckedIndexedAccess` because `Uint8Array[i]` has type `number | undefined`.

**How to avoid:** Use `result[i]! |= bits[i]!` throughout all bitset loops. The project already demonstrates this pattern in `build-key.ts` (`bits[i >> 3]! |= 1 << (i & 7)`). [VERIFIED: build-key.ts line 103]

---

## Code Examples

### Verified bitset encoding (from build-key.ts line 96–106)

```typescript
// Source: scripts/build-key.ts buildBitset() — VERIFIED
export function buildBitset(speciesCount: number, matchingIndices: number[]): string {
  const nBytes = Math.ceil(speciesCount / 8);
  const bits = new Uint8Array(nBytes);
  for (const i of matchingIndices) {
    bits[i >> 3]! |= 1 << (i & 7); // LSB-first: species i is bit (i%8) of byte floor(i/8)
  }
  return Buffer.from(bits).toString('base64');
}
```

Reading a bit (from key-matrix-cache.ts line 34–35):
```typescript
// Source: src/components/key-matrix-cache.ts validateKeyMatrix() — VERIFIED
const nBytes = Math.ceil(artifact.species.length / 8);
// To read bit i: (Buffer.from(b64,'base64')[i >> 3]! >> (i & 7)) & 1
```

### Existing test pattern (from glossary-transform.test.ts — VERIFIED)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestionGroups, computeMatching } from './key-filter.ts';

describe('buildQuestionGroups', () => {
  it('groups 3 characters from 2 questions into 2 groups', () => {
    // ... fixture + assert.strictEqual(groups.size, 2)
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | Phase Changed | Impact |
|--------------|------------------|---------------|--------|
| Vitest / Jest | `node --test` (built-in) | v3.0 | No test runner dependency; `.ts` files run via `--strip-types` |
| Zod v3 | Zod v4 (`import from 'zod'` not `'zod/v4'`) | v3.0 | `zod/mini` for browser; full Zod for Node scripts |
| ts-node / tsx loader | `node --strip-types` (Node 24 native) | v3.0 | No loader; TS imported with `.ts` extension in test files |

---

## Research Questions — Concrete Answers

### 1. Question-identity key: what is the right grouping key?

**Answer: `character.question` string alone.** [VERIFIED: data/key-matrix.json]

Proof: 237 characters, 55 unique question strings. Exhaustive enumeration found zero cases where the same question string appears under a different `(category, subcategory)` path. The selection `Map<questionText, Set<characterId>>` naturally uses question strings as keys, and `buildQuestionGroups` uses the same key — no impedance mismatch.

Questions with the most states:
- "Additional major hindwing color(s)…" — 14 states
- "Additional major forewing color(s)…" — 14 states
- "Main color of forewing" — 13 states
- "In which month was the moth found?" — 12 states
- "In which ecoregion in British Columbia?" — 11 states

### 2. Bitset decode + correct D-03 bitset expression

`nBytes = Math.ceil(1192 / 8) = 149` (1,192 species; 1,192 is exactly divisible by 8, so no spare bits in the last byte). [VERIFIED: 1192 / 8 = 149.0]

Decode: `Buffer.from(matrix.matrix[charId], 'base64')` → 149-byte `Uint8Array`, LSB-first (species index `i` is bit `i & 7` of byte `i >> 3`).

Correct D-03 per-question keepMask (see Architecture Patterns Pattern 2):
```
keepMask[byte] = selectedUnion[byte] | (~opposingUnion[byte] & 0xff)
result[byte]  &= keepMask[byte]
```

### 3. computeMatching() signature and return shape

**Proposed signature:**

```typescript
computeMatching(
  matrix: KeyMatrix,
  selection: Selection,           // Map<questionText, Set<characterId>>
  questionGroups: QuestionGroups, // output of buildQuestionGroups
): MatchResult
// where MatchResult = { matchedSlugs: string[], count: number }
```

**Why this shape:**
- `matchedSlugs` is a `string[]` (slugs) rather than `KeySpecies[]` objects because Phase 42's results grid fetches thumbnail/name data from `matrix.species` by slug lookup, not by index. Slugs are the natural cross-component currency.
- `count` is included as a convenience field because Phase 41's "N species match" counter (GRID-01) needs it without array length recomputation, and the `pnwm-key-filter-change` event detail can mirror it directly.
- Indices are NOT returned: index-based coupling to `matrix.species` would make the function harder to test with fixtures (fixture species counts must match exactly).
- `KeySpecies[]` is NOT returned: copying full objects into the return value wastes memory for Phase 41 (the panel only needs the count); Phase 42 will receive slugs and look up objects from the cached matrix.

**`pnwm-key-filter-change` event detail (`KeyFilterChangeDetail`):**
```typescript
{ matchedSlugs: string[], count: number, hasSelection: boolean }
```
Phase 41 constructs this from `computeMatching()`'s return + `selection.size > 0`.

### 4. KeyMatrixMetaSchema: fields and build-key.ts changes

**Fields:** `{ totalKeySpecies: number, matchedSpecies: number, unmatchedSpecies: number, generatedAt: string }`

**Source of `totalKeySpecies: 1228`:** `speciesBinomials.length` in `build-key.ts` (the raw CSV header, pre-resolution). [VERIFIED: build-key.ts line 200]

**Embedding:** Add as `meta` top-level field in `data/key-matrix.json`. Update `KeyMatrixSchema` to include `meta: KeyMatrixMetaSchema`. Update `build-key.ts`'s `main()` to populate `meta` before calling `KeyMatrixSchema.parse(artifact)`. No separate fetch; no separate file.

**Why not derivable client-side:** `totalKeySpecies: 1228` (the unmatched count) is not present anywhere in the client-loadable artifact — only matched species appear in `species[]`. Without `meta.totalKeySpecies`, Phase 42 cannot show "X of 1,228 species".

**`build-key.ts` change is small:** Add 5 lines before the `KeyMatrixSchema.parse()` call. The schema `parse()` call already validates it. `validateKeyMatrix()` in `key-matrix-cache.ts` inherits the validation for free.

### 5. node --test discovery for key-filter.test.ts

The `npm test` script in `package.json` ends with `'src/_lib/*.test.ts'`. [VERIFIED: package.json]

```
"test": "node --test ... 'src/_lib/*.test.ts'"
```

`key-filter.test.ts` placed in `src/_lib/` will be picked up by the glob automatically. No changes to `package.json` required.

Node 24 runs `.ts` files via `--strip-types` (implicit in this project — `node script.ts` works). The glob is single-quoted in the script (shell expansion handled by Node's test runner via its glob argument). `tsconfig.node.json` already includes `"src/_lib/**/*.test.ts"` in its `include` array, so `npm run typecheck` covers it.

### 6. pnwm-key-filter-change event: augmentation pattern

Exact mirror of the existing `FilterChangeDetail` pattern in `src/types/events.ts`:

1. Export a new interface `KeyFilterChangeDetail` (separate from `FilterChangeDetail` — no inheritance).
2. Add `'pnwm-key-filter-change': CustomEvent<KeyFilterChangeDetail>` to the existing `declare global { interface HTMLElementEventMap {} }` block.
3. The existing `export interface FilterChangeDetail` statement already makes the file a module — `declare global` augmentation works without modification to file structure.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 24 built-in) — same as all other `*.test.ts` in project |
| Config file | none — no jest.config / vitest.config |
| Quick run command | `node --test src/_lib/key-filter.test.ts` |
| Full suite command | `npm test` (picks up via `'src/_lib/*.test.ts'` glob) |
| Typecheck command | `npm run typecheck` (tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit) |

### TDD Cases from SC3 — Phase Requirements → Test Map

All test cases use a minimal fixture `KeyMatrix` (4–8 species, 2–3 characters from 1–2 questions), not the full 1,192-species artifact. Each case drives out a distinct correctness property.

| TDD Case | Behavior Verified | D-0x Rule | Test Type |
|----------|-------------------|-----------|-----------|
| TC-1: single state narrows | Select one state → result ⊆ full set; species absent from that state AND scored elsewhere are eliminated | D-03 | unit |
| TC-2: two states in same question widen | Select S1 AND S2 under Q → result ≥ max(result(S1), result(S2)) | D-01 (OR-within) | unit |
| TC-3: two questions AND narrows | Select S1 under Q1, S2 under Q2 → result ≤ min(result(S1), result(S2)) | D-01 (AND-across) | unit |
| TC-4: 0,0 pair is NOT eliminated | Species with 0 on ALL states of Q passes through when any state of Q is selected | D-03 + D-04 | unit |
| TC-5: habrosyne-scripta polymorphism | Species with WA=1, OR=1, ID=1 etc — selecting WA keeps it (positive selected hit) | D-02 | unit |
| TC-6: unscored species always kept | hypenodes-fractilinea / xestia-normanianus appear in any filtered result | D-04 | integration (real artifact) |
| TC-7: empty selection → full result | No constrained questions → all 1,192 species returned | D-03 base case | unit |
| TC-8: buildQuestionGroups groups correctly | 237 chars → 55 groups; each group's character count matches expected state count | — | unit |

**Concrete expected values** (derived from `data/key-matrix.json`, verified by script):

| Test Fixture | Expected count |
|-------------|----------------|
| D-03, WA state selected (real artifact) | 862 matched (330 eliminated) |
| D-03, WA OR OR selected (real artifact) | 1,011 matched |
| D-03, WA AND forewing eyespot=Yes (real artifact) | 8 matched |
| D-03, forewing eyespot=Yes only (real artifact) | 10 matched |
| D-03, forewing yellow only (real artifact) | 75 matched |
| D-03, forewing yellow OR orange (real artifact) | 173 matched |
| Empty selection (real artifact) | 1,192 matched |

The fixture-based unit tests (TC-1 through TC-8) use small synthetic matrices for determinism and speed. The integration test (TC-6) imports `data/key-matrix.json` directly and asserts `hypenodes-fractilinea` and `xestia-normanianus` appear in the result of a non-empty selection. The real-artifact expected counts above are documented as comments for future regression.

### Sampling Rate

- Per commit: `node --test src/_lib/key-filter.test.ts` (< 1 second)
- Per wave merge: `npm test` (full suite)
- Phase gate: `npm test && npm run typecheck` both green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/_lib/key-filter.ts` — does not exist; must be created with two exported functions and `Selection` / `MatchResult` / `QuestionGroups` types
- [ ] `src/_lib/key-filter.test.ts` — does not exist; must be created with all 8 TDD cases
- [ ] `KeyMatrixMetaSchema` in `src/types/schemas.ts` — schema not yet defined; `KeyMatrixSchema` not yet updated to include `meta` field
- [ ] `KeyFilterChangeDetail` in `src/types/events.ts` — not yet defined; `HTMLElementEventMap` augmentation not yet updated
- [ ] `build-key.ts` `meta` field emission + `data/key-matrix.json` rebuild — `meta` not in current artifact; `build-key.ts` needs 5-line addition; artifact must be regenerated

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 24 (`--strip-types`) | Test runner, `key-filter.ts` execution | ✓ | v24.15.0 | — |
| `data/key-matrix.json` | Integration test TC-6 | ✓ | Phase 39 output; 237 chars × 1,192 species | — |
| `zod/mini` | `KeyMatrixMetaSchema` at browser boundary | ✓ | `zod@^4` in node_modules | — |
| `tsc` | `npm run typecheck` | ✓ | TypeScript 5.x via devDependencies | — |

---

## Security Domain

> `security_enforcement` not present in config — treated as enabled.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | Yes (trivially) | `KeyMatrixMetaSchema.parse()` validates `meta` fields; all inputs to `computeMatching` come from the already-validated `KeyMatrix` object |
| V2 Authentication | No | No auth in this phase |
| V6 Cryptography | No | No crypto in this phase |

**No threat surface:** `buildQuestionGroups` and `computeMatching` are pure functions operating on pre-validated in-memory data. The only external input is the `selection` argument, which comes from user checkbox state (a `Map<string, Set<number>>`); no user-supplied string is interpolated into SQL, eval, or innerHTML.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**All claims in this research are `[VERIFIED]` from direct inspection of `data/key-matrix.json`, `src/types/schemas.ts`, `src/types/events.ts`, `src/components/key-matrix-cache.ts`, `scripts/build-key.ts`, and `package.json`. No training-data assumptions required.**

---

## Open Questions

None. All research questions specified in the objective are answered above with concrete values derived from the live codebase and artifact.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `data/key-matrix.json` — character structure, question string uniqueness, polymorphism count (15,492), unscored species identity, species counts for TDD fixtures
- `scripts/build-key.ts` — `buildBitset()`, `parseCharacterLabel()`, bitset math, `main()` for meta field design
- `src/components/key-matrix-cache.ts` — `validateKeyMatrix()`, byte-length math (`nBytes = ceil(species/8)`)
- `src/types/schemas.ts` — `CharacterSchema`, `KeySpeciesSchema`, `KeyMatrixSchema`, `zod/mini` import pattern
- `src/types/events.ts` — `FilterChangeDetail`, `HTMLElementEventMap` augmentation pattern
- `src/_lib/glossary-transform.test.ts` — `node:test` `describe`/`it`/`assert` pattern to mirror
- `src/components/key-matrix-cache.test.ts` — `makeValidArtifact()` fixture helper pattern
- `package.json` — `npm test` glob (`'src/_lib/*.test.ts'`), `npm run typecheck` commands
- `tsconfig.node.json` — `noUncheckedIndexedAccess: true` (drives `!` requirement), `src/_lib/**/*.test.ts` include
- `.planning/phases/40-filter-logic-tdd-contract/40-CONTEXT.md` — locked decisions D-01 through D-05
- `.planning/research/PITFALLS.md` — Pitfall 2 (0=unscored), Pitfall 12 (FilterChangeDetail isolation)
- `.planning/research/STACK.md` — bitset encoding details (correct); filter pseudocode (incorrect semantics per D-03)

---

## Metadata

**Confidence breakdown:**
- Filter semantics (D-01/D-02/D-03): HIGH — derived from locked CONTEXT.md decisions + verified against live artifact
- Bitset expression: HIGH — formally derived; verified against `key-matrix-cache.ts` byte math
- Question grouping key: HIGH — exhaustively verified against all 237 characters in `data/key-matrix.json`
- TDD case counts: HIGH — computed by script over the live artifact
- Schema/event patterns: HIGH — verified against existing `schemas.ts` and `events.ts`
- Test runner setup: HIGH — verified against `package.json` and `tsconfig.node.json`

**Research date:** 2026-06-24
**Valid until:** Stable until `data/key-matrix.json` is regenerated (would change TDD counts) or Zod/mini API changes (unlikely in Zod 4 lifecycle). The question-identity finding is permanent (structure of the Lucid key).

---

## RESEARCH COMPLETE

Phase 40 research complete. All six research questions answered with verified data; D-03 bitset expression formally derived (`result &= selectedUnion | ~opposingUnion` per question); concrete TDD case expected values computed from the live artifact; schema additions and event augmentation designed to mirror existing patterns exactly.
