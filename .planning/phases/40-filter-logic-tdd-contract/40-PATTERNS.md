# Phase 40: Filter Logic TDD Contract — Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 5 (2 create, 3 modify)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/_lib/key-filter.ts` | utility (pure logic) | transform | `src/components/key-matrix-cache.ts` + `scripts/build-key.ts` | role-match (bitset math) |
| `src/_lib/key-filter.test.ts` | test | batch | `src/_lib/glossary-transform.test.ts` | exact |
| `src/types/schemas.ts` (add KeyMatrixMetaSchema + meta field) | config/schema | — | `src/types/schemas.ts` itself (existing Key Matrix block) | exact |
| `src/types/events.ts` (add KeyFilterChangeDetail + augment) | config/types | event-driven | `src/types/events.ts` itself (existing FilterChangeDetail) | exact |
| `scripts/build-key.ts` (add meta emission) | utility (build script) | batch | `scripts/build-key.ts` itself (existing artifact block) | exact |

---

## Pattern Assignments

### `src/_lib/key-filter.ts` (utility, transform)

**Analogs:** `src/components/key-matrix-cache.ts` (bitset byte-length + base64 decode), `scripts/build-key.ts` (bitset encoding + `noUncheckedIndexedAccess` `!` style)

**Imports pattern** — mirror `key-matrix-cache.ts` lines 6–7:
```typescript
import type { Character, KeyMatrix } from '../types/schemas.ts';
```
Use `import type` for types (verbatimModuleSyntax). Import `.ts` extension explicitly (Node 24 type-stripping project convention).

**Core pattern 1 — `buildQuestionGroups()`:**

Key facts from research:
- Input: `Character[]` from `KeyMatrix.characters` (237 characters, 55 unique question strings)
- Output: `Map<string, Character[]>` (55 entries); keyed by `character.question` string alone — all 55 are globally unique
- Insertion order must match `characters[]` order (preserves `character.id` sequence for bitset index lookup)

```typescript
// Exports to copy:
export type QuestionGroups = Map<string, Character[]>;

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

**Core pattern 2 — `computeMatching()` D-03 bitset expression:**

Key facts:
- `nBytes = Math.ceil(nSpecies / 8)` — from `key-matrix-cache.ts` line 34
- Base64 decode: `Buffer.from(b64, 'base64')` — from `key-matrix-cache.ts` pattern; produces `Uint8Array`
- Bit read: `(bytes[i >> 3]! >> (i & 7)) & 1` — LSB-first, same encoding as `buildBitset()` in `build-key.ts` line 103
- `noUncheckedIndexedAccess` requires `!` on all typed array index accesses — from `build-key.ts` line 103: `bits[i >> 3]! |= 1 << (i & 7)`
- D-03 keepMask per question: `selectedUnion[byte] | (~opposingUnion[byte] & 0xff)` — NOT the naive `result &= OR(selected)` from STACK.md

```typescript
export type Selection = Map<string, Set<number>>;  // Map<questionText, Set<characterId>>

export interface MatchResult {
  matchedSlugs: string[];
  count: number;
}

export function computeMatching(
  matrix: KeyMatrix,
  selection: Selection,
  questionGroups: QuestionGroups,
): MatchResult {
  const nSpecies = matrix.species.length;
  const nBytes = Math.ceil(nSpecies / 8);
  const result = new Uint8Array(nBytes).fill(0xff);  // all 1s = all species pass

  for (const [question, selectedIds] of selection) {
    if (selectedIds.size === 0) continue;

    const allStatesForQ = questionGroups.get(question) ?? [];
    const opposingIds = allStatesForQ.filter(c => !selectedIds.has(c.id)).map(c => c.id);

    const selectedUnion = new Uint8Array(nBytes);
    for (const id of selectedIds) {
      const b64 = matrix.matrix[id];
      if (b64 === undefined) continue;
      const bits = Buffer.from(b64, 'base64');
      for (let i = 0; i < nBytes; i++) selectedUnion[i]! |= bits[i]!;
    }

    const opposingUnion = new Uint8Array(nBytes);
    for (const id of opposingIds) {
      const b64 = matrix.matrix[id];
      if (b64 === undefined) continue;
      const bits = Buffer.from(b64, 'base64');
      for (let i = 0; i < nBytes; i++) opposingUnion[i]! |= bits[i]!;
    }

    // D-03: keepMask = selectedUnion | ~opposingUnion (byte-by-byte; no Uint8Array bitwise NOT)
    for (let i = 0; i < nBytes; i++) {
      result[i]! &= (selectedUnion[i]! | (~opposingUnion[i]! & 0xff));
    }
  }

  const matchedSlugs: string[] = [];
  for (let i = 0; i < nSpecies; i++) {
    if ((result[i >> 3]! >> (i & 7)) & 1) {
      matchedSlugs.push(matrix.species[i]!.slug);
    }
  }
  return { matchedSlugs, count: matchedSlugs.length };
}
```

**Critical anti-pattern:** Do NOT use `result &= OR(selected bitsets)` — that is STACK.md's pseudocode, which eliminates unscored species (all-zero rows). Use the D-03 keepMask expression above.

---

### `src/_lib/key-filter.test.ts` (test, batch)

**Analog:** `src/_lib/glossary-transform.test.ts` (exact match)

**Imports pattern** — copy lines 1–8 structure:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestionGroups, computeMatching } from './key-filter.ts';
```
No config file needed. Node 24 test runner picks this file up via the existing `npm test` glob `'src/_lib/*.test.ts'` (verified in `package.json`).

**Test structure pattern** — copy `glossary-transform.test.ts` style:
- One `describe` block per exported function
- `it('description of specific case', () => { ... })` — one assertion per case
- Use `assert.strictEqual` / `assert.deepStrictEqual` / `assert.ok`
- Fixture data defined at `describe` scope (not module scope), mirroring lines 64–70

**TC-6 integration test pattern** — import real artifact:
```typescript
// Integration case: real artifact (data/key-matrix.json)
import keyMatrix from '../../data/key-matrix.json' with { type: 'json' };
// Then assert hypenodes-fractilinea and xestia-normanianus appear after a non-empty selection
```

**TDD cases to implement (8 total from RESEARCH.md SC3):**
| Case | Description |
|------|-------------|
| TC-1 | single state narrows: result ⊆ full set |
| TC-2 | two states same question widen (OR-within) |
| TC-3 | two questions AND narrows (AND-across) |
| TC-4 | `0,0` species (scored 0 on all selected AND all opposing) NOT eliminated |
| TC-5 | polymorphic species (WA=1, OR=1) kept when filtering WA |
| TC-6 | unscored species always kept (integration, real artifact) |
| TC-7 | empty selection → full 1,192 result |
| TC-8 | `buildQuestionGroups` groups 237 chars → 55 groups |

Use synthetic fixture matrices for TC-1 through TC-5, TC-7, TC-8 (small 4–8 species, 2–3 characters). Use real `data/key-matrix.json` only for TC-6.

---

### `src/types/schemas.ts` (add `KeyMatrixMetaSchema` + add `meta` to `KeyMatrixSchema`)

**Analog:** Existing Key Matrix block in `src/types/schemas.ts` lines 155–183 (exact match)

**Import pattern** — already established (line 6):
```typescript
import * as z from 'zod/mini';
```
All schema additions use `zod/mini` (browser-safe). No full Zod import in this file.

**Schema declaration pattern** — copy lines 157–183 style:
```typescript
// Add after KeyMatrixSchema (currently lines 178–183):
export const KeyMatrixMetaSchema = z.object({
  totalKeySpecies:  z.number(),    // 1,228 — all species in key.csv including unmatched
  matchedSpecies:   z.number(),    // 1,192 — species resolved to site slugs (in matrix)
  unmatchedSpecies: z.number(),    // 36 = 1,228 − 1,192
  generatedAt:      z.string(),    // ISO 8601 timestamp from build-key.ts
});
export type KeyMatrixMeta = z.infer<typeof KeyMatrixMetaSchema>;
```

**KeyMatrixSchema update** — add `meta` field as first property (lines 178–183, modify):
```typescript
export const KeyMatrixSchema = z.object({
  meta:       KeyMatrixMetaSchema,        // NEW Phase 40
  characters: z.array(CharacterSchema),
  species:    z.array(KeySpeciesSchema),
  matrix:     z.array(z.string()),
});
```

`validateKeyMatrix()` in `key-matrix-cache.ts` calls `KeyMatrixSchema.parse(data)` and needs no changes — it inherits `meta` validation automatically.

---

### `src/types/events.ts` (add `KeyFilterChangeDetail` + augment `HTMLElementEventMap`)

**Analog:** `src/types/events.ts` lines 1–22 (exact mirror)

**Key constraint:** Do NOT extend or modify `FilterChangeDetail`. Add a completely separate interface (event-bus isolation, PITFALLS Pitfall 12).

**New interface pattern** — add after line 14:
```typescript
export interface KeyFilterChangeDetail {
  matchedSlugs: string[];    // current matching species slugs (from computeMatching)
  count: number;             // matchedSlugs.length — convenience for counter component
  hasSelection: boolean;     // true iff selection.size > 0 (drives empty-state vs initial-state UX)
}
```

**`declare global` augmentation pattern** — add into the existing `declare global` block (lines 18–22); do NOT create a second `declare global` block:
```typescript
declare global {
  interface HTMLElementEventMap {
    'pnwm-filter-change':     CustomEvent<FilterChangeDetail>;     // existing — do not touch
    'pnwm-key-filter-change': CustomEvent<KeyFilterChangeDetail>;  // NEW Phase 40
  }
}
```

**Module boundary note:** The existing `export interface FilterChangeDetail` (line 5) already makes this file a module, satisfying `verbatimModuleSyntax: true`'s requirement for `declare global` to work. No structural change needed.

---

### `scripts/build-key.ts` (add `meta` emission)

**Analog:** `scripts/build-key.ts` lines 276–297 (existing artifact build + Zod validation block)

**Change location:** Between step 6 (matrix build, line 274) and step 7 (Zod validation, line 277). The `meta` object must be present in the value passed to `KeyMatrixSchema.parse()`.

**Pattern to copy** — inline the `meta` field into the artifact literal at the `KeyMatrixSchema.parse()` call:
```typescript
// Before (line 277 currently):
const artifact = KeyMatrixSchema.parse({ characters, species, matrix });

// After (Phase 40 change — add meta field):
const artifact = KeyMatrixSchema.parse({
  meta: {
    totalKeySpecies:  speciesBinomials.length,    // 1,228 (from line 200: headerRow.slice(1))
    matchedSpecies:   matchedSlugs.length,         // 1,192
    unmatchedSpecies: unmatchedBinomials.length,   // 36
    generatedAt:      new Date().toISOString(),
  },
  characters,
  species,
  matrix,
});
```

Variable references available at that point in `main()`:
- `speciesBinomials` — defined line 200 (`headerRow.slice(1)`, 1,228 entries)
- `matchedSlugs` — defined line 245 (`matchedIndices.map(i => resolvedSlugs[i]!)`, 1,192 entries)
- `unmatchedBinomials` — defined line 224 (`speciesBinomials.filter(...)`, 36 entries)

After this change, regenerate `data/key-matrix.json` by running `npm run build:key`.

---

## Shared Patterns

### `noUncheckedIndexedAccess` typed-array indexing
**Source:** `scripts/build-key.ts` line 103
**Apply to:** All typed array index accesses in `key-filter.ts`
```typescript
bits[i >> 3]! |= 1 << (i & 7);   // ! required; TSConfig noUncheckedIndexedAccess: true
```
Verified in `tsconfig.node.json`.

### Base64 → Uint8Array decode
**Source:** `src/components/key-matrix-cache.ts` line 34 comment + `scripts/build-key.ts` line 105
**Apply to:** `computeMatching()` inner loops
```typescript
Buffer.from(b64, 'base64')   // Node built-in; produces Uint8Array; no import needed
```

### Zod/mini schema + `z.infer<>` type pattern
**Source:** `src/types/schemas.ts` lines 28, 44, 165–166, 175, 183
**Apply to:** `KeyMatrixMetaSchema` addition
```typescript
export const KeyMatrixMetaSchema = z.object({ ... });
export type KeyMatrixMeta = z.infer<typeof KeyMatrixMetaSchema>;
```
Always declare the `export type` alias immediately after the schema constant.

### `.ts` extension on local imports
**Source:** `src/components/key-matrix-cache.ts` lines 6–7, `src/_lib/glossary-transform.test.ts` line 8
**Apply to:** All imports in `key-filter.ts` and `key-filter.test.ts`
```typescript
import { buildQuestionGroups } from './key-filter.ts';  // .ts extension required
```

---

## No Analog Found

None — all five files have close analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/_lib/`, `src/types/`, `src/components/`, `scripts/`
**Files scanned:** 5 analog files read in full
**Pattern extraction date:** 2026-06-24
