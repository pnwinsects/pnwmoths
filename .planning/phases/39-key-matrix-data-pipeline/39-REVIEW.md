---
phase: 39-key-matrix-data-pipeline
reviewed: 2026-06-24T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - scripts/build-key.ts
  - scripts/build-key.test.ts
  - scripts/check-key-weight.ts
  - scripts/check-key-weight.test.ts
  - scripts/copy-key-matrix.ts
  - src/components/key-matrix-cache.ts
  - src/components/key-matrix-cache.test.ts
  - src/types/schemas.ts
  - src/types/schemas.test.ts
  - .github/workflows/deploy.yml
  - .github/workflows/pr-check.yml
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-06-24
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the complete key-matrix data pipeline: CSV parse, slug resolution, DuckDB nav-image join, bitset construction, Zod schema, client-side validation guard, weight gate, and CI workflows. The core bitset math is correct — base64 length formula matches `Buffer.from(Uint8Array).toString('base64')` across all species counts 0–1500, LSB-first bit ordering is consistent between builder and guard, and the column-offset math (`row[origIdx + 1]`) correctly maps speciesBinomials indices to CSV columns. The DuckDB pattern (no SQL slug interpolation, TypeScript-side Map join) is correctly implemented per T-39-01.

Four warnings were found: a synonym-map key normalization mismatch that can silently drop synonym resolutions when `species-synonyms.csv` has whitespace anomalies; a genus/epithet display-name mismatch for synonym-resolved species; an unguarded `buildBitset` that silently ignores out-of-bounds indices; and a `NaN` bypass in the weight gate that causes `check-key-weight.ts` to unconditionally pass when `KEY_BUDGET_BYTES` is set to a non-numeric value.

No critical/blocker issues found.

## Warnings

### WR-01: `synonymMap` key not normalized — synonym lookup silently fails on whitespace anomalies

**File:** `scripts/build-key.ts:212`
**Issue:** The synonym map is built from raw CSV values:
```ts
const synonymMap = new Map(synonymRows.map(r => [r.from_binomial, r.to_species_slug]));
```
But `resolveSlug` looks up the map with a normalized key:
```ts
const synonymSlug = synonymMap.get(normalized) ?? null; // normalized = normalizeBinomial(binomial)
```
If `species-synonyms.csv` contains a `from_binomial` with a double-space or trailing space (the same class of whitespace anomaly that prompted `normalizeBinomial` for the key CSV), the lookup silently returns `null` and the species is counted as unmatched rather than using the synonym. There is no warning in the coverage report to indicate a synonym was expected but missed.

This is particularly risky because both source CSVs are manually maintained, and the key CSV is already known to carry such anomalies (hence the `normalizeBinomial` function).

**Fix:** Normalize `from_binomial` keys at map-construction time to make the lookup invariant to whitespace anomalies in both sources:
```ts
const synonymMap = new Map(
  synonymRows.map(r => [normalizeBinomial(r.from_binomial), r.to_species_slug])
);
```

---

### WR-02: `buildBitset` silently discards out-of-bounds indices

**File:** `scripts/build-key.ts:96-103`
**Issue:** The function contains no guard that `matchingIndices[i] < speciesCount`. If any index equals or exceeds `speciesCount`, the corresponding `Uint8Array` write (`bits[i >> 3]! |= ...`) targets a position beyond the allocated buffer. TypedArray out-of-bounds writes are **silently ignored** in JavaScript — no exception, no truncation, no diagnostic. The bit is lost and the emitted bitset is wrong for that character-state.

```ts
export function buildBitset(speciesCount: number, matchingIndices: number[]): string {
  const nBytes = Math.ceil(speciesCount / 8);
  const bits = new Uint8Array(nBytes);
  for (const i of matchingIndices) {
    bits[i >> 3]! |= 1 << (i & 7); // silent no-op if i >= speciesCount
  }
  return Buffer.from(bits).toString('base64');
}
```

The calling code in `main()` computes `matchingRanks` from a controlled loop over `matchedIndices.entries()` so ranks are always in `0..nMatchedSpecies-1` under correct data. However, there is no test for the out-of-bounds path, and the `!` non-null assertion is misleading — it asserts the array element is non-undefined at the TypeScript level but does not prevent the silent no-op at runtime.

**Fix:** Add a bounds assertion so data bugs produce an immediate, diagnosable failure:
```ts
export function buildBitset(speciesCount: number, matchingIndices: number[]): string {
  const nBytes = Math.ceil(speciesCount / 8);
  const bits = new Uint8Array(nBytes);
  for (const i of matchingIndices) {
    if (i < 0 || i >= speciesCount) {
      throw new RangeError(`buildBitset: index ${i} is out of range [0, ${speciesCount})`);
    }
    bits[i >> 3]! |= 1 << (i & 7);
  }
  return Buffer.from(bits).toString('base64');
}
```

---

### WR-03: `KEY_BUDGET_BYTES=<non-numeric>` silently bypasses the weight gate

**File:** `scripts/check-key-weight.ts:8-10`
**Issue:** The budget is parsed with an unvalidated `parseInt`:
```ts
const BUDGET_BYTES = process.env['KEY_BUDGET_BYTES']
  ? parseInt(process.env['KEY_BUDGET_BYTES'], 10)
  : 50 * 1024;
```
If `KEY_BUDGET_BYTES` is set to a non-numeric string (e.g., `abc`, `50kb`, or a typo), `parseInt` returns `NaN`. The subsequent gate check `gz.length > NaN` evaluates to `false` regardless of actual file size, causing the script to exit 0 (success) and print a misleading OK line. Any misconfiguration of the budget env var in CI silently disables the gate rather than surfacing an error.

**Fix:** Validate the parsed value before using it:
```ts
const rawBudget = process.env['KEY_BUDGET_BYTES'];
const BUDGET_BYTES = rawBudget !== undefined
  ? (() => {
      const n = parseInt(rawBudget, 10);
      if (!Number.isFinite(n) || n < 0) {
        console.error(`[key-weight] ERROR: KEY_BUDGET_BYTES="${rawBudget}" is not a valid non-negative integer`);
        process.exit(1);
      }
      return n;
    })()
  : 50 * 1024;
```

---

### WR-04: Synonym-resolved species stores old (key CSV) genus/epithet, not accepted-name genus/epithet

**File:** `scripts/build-key.ts:233-244`
**Issue:** For species resolved via the synonym map, the `species[]` entry is constructed from the key CSV binomial (the old name), not from the site's `species.csv`:
```ts
const species = matchedSlugs.map((slug, spIdx) => {
  const origIdx = matchedIndices[spIdx]!;
  const binomial = speciesBinomials[origIdx] ?? '';  // from key CSV -- may be old name
  const normalized = normalizeBinomial(binomial);
  const parts = normalized.split(' ');
  return {
    slug,               // correct: accepted slug from site
    genus: parts[0] ?? '',   // WRONG for synonyms: old genus from key CSV
    epithet: parts[1] ?? '', // WRONG for synonyms: old epithet from key CSV
    common_name: null,
    nav_image: navImages.get(slug) ?? null,
  };
});
```
Example: `Grammia doris` (key CSV) resolves via synonym to slug `apantesis-doris`. The emitted entry will have `genus: 'Grammia'`, `epithet: 'doris'` but `slug: 'apantesis-doris'`. When the key UI renders the species name from `genus`+`epithet`, it will display the old, non-accepted name.

**Fix:** After slug resolution, look up the accepted name from `speciesRows` (already loaded):
```ts
// Build a slug → accepted-name lookup from the site's species.csv
const slugToName = new Map(
  speciesRows.map(r => [
    `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`,
    { genus: r.genus, epithet: r.species },
  ])
);

const species = matchedSlugs.map((slug, spIdx) => {
  const accepted = slugToName.get(slug);
  return {
    slug,
    genus: accepted?.genus ?? parts[0] ?? '',
    epithet: accepted?.epithet ?? parts[1] ?? '',
    common_name: null,
    nav_image: navImages.get(slug) ?? null,
  };
});
```

---

## Info

### IN-01: DuckDB instance (`db`) is not closed after `queryNavImages`

**File:** `scripts/build-key.ts:222-223`
**Issue:** `DuckDBInstance.create()` returns an instance with a `closeSync()` method (confirmed via reflection). The connection is correctly closed in the `finally` block of `queryNavImages`, but the instance itself is never closed:
```ts
const db = await DuckDBInstance.create(':memory:');
const navImages = await queryNavImages(db);
// db never closed
```
For the current pattern (single-use build script that exits immediately after `main()` returns), the OS reclaims resources on process exit. This is not a functional issue today. However, if `main()` is ever called from a test harness or longer-lived process (e.g., watch mode), the instance leak would persist across calls.

**Fix:** Close the instance after the query:
```ts
const db = await DuckDBInstance.create(':memory:');
try {
  const navImages = await queryNavImages(db);
  // ... rest of main
} finally {
  db.closeSync();
}
```

---

### IN-02: Integration test in `build-key.test.ts` has no timeout

**File:** `scripts/build-key.test.ts:144-151`
**Issue:** The integration test runs `execSync('node scripts/build-key.ts', ...)` with no `timeout` option. DuckDB initialization or a large CSV parse that hangs would block the test runner indefinitely with no diagnostic output.

**Fix:** Add a generous but finite timeout:
```ts
execSync('node scripts/build-key.ts', { cwd: ROOT, stdio: 'pipe', timeout: 60_000 });
```

---

### IN-03: Shared `TEMP_DIR` across tests in `check-key-weight.test.ts` is a latent race condition

**File:** `scripts/check-key-weight.test.ts:9`
**Issue:** Both the "under budget" and "exceeds budget" tests share the same constant `TEMP_DIR` path:
```ts
const TEMP_DIR = join(ROOT, '_tmp_key_weight_test');
```
Each test creates the directory, writes a file, runs the check, then deletes the directory in `finally`. `node:test` runs top-level `test()` calls serially by default, so this does not currently race. But if the test file is ever run with `--test-concurrency > 1` or restructured under a `describe` block with `concurrency` enabled, the shared teardown (`rmSync`) from one test will remove the directory while another test's subprocess is reading from it.

**Fix:** Use unique temp directories per test (e.g., append `Date.now()` or a random suffix):
```ts
const TEMP_DIR_1 = join(ROOT, `_tmp_key_weight_test_${process.pid}_under`);
const TEMP_DIR_2 = join(ROOT, `_tmp_key_weight_test_${process.pid}_over`);
```

---

_Reviewed: 2026-06-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
