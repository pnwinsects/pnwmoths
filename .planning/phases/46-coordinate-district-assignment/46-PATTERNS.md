# Phase 46: Coordinate → District Assignment - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 6 (+1 modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/lib/district-assignment.ts` | utility (pure guard/gate module) | transform | `scripts/build-boundaries.ts` (pure-validator section, lines 29–148) | exact |
| `scripts/lib/district-assignment.test.ts` | test | transform | `scripts/backfill-legacy-county.test.ts` | exact (pure-function unit test shape) |
| `scripts/fill-district-from-coords.ts` | service/CLI (maintainer script) | CRUD (batch read-modify-write CSV + DB spatial query) | `scripts/backfill-legacy-county.ts` (CLI/IO shape) + `scripts/verify-boundaries.ts` (DuckDB spatial load) | exact (composite of two analogs) |
| `scripts/fill-district-from-coords.test.ts` | test | CRUD/integration | `scripts/backfill-legacy-county.test.ts` (pure fn tests) + `scripts/verify-boundaries.ts` (real-DuckDB integration style) | role-match |
| `data/coord-fill-report.csv` | config/data (committed report) | batch | `data/legacy-rejoin-report.csv` | exact |
| `_instructions/ASSIGNING_DISTRICTS.md` (or similar name) | doc/runbook | request-response (manual maintainer steps) | `_instructions/REFRESHING_BOUNDARIES.md` | exact |
| `data/records.csv` (MODIFIED) | model/data | CRUD (additive fill) | Same file, prior modification pattern in `backfill-legacy-county.ts`'s `RECORDS_COLUMNS` writer | exact |

## Pattern Assignments

### `scripts/lib/district-assignment.ts` (utility, transform)

**Analog:** `scripts/build-boundaries.ts` lines 29–148 (pure-validator section: `PNW_STATEFP`, `PNW_BOUNDS`, `isInFootprint`, `featureWithinBounds`, `checkCrosswalkCoverage`)

**Style pattern to copy** — pure exported functions, no I/O, doc-commented with the decision ID that motivates them, discriminated-classification return type rather than boolean (`scripts/build-boundaries.ts:116-148`'s `CoverageResult` is the model for a `CoordinateOutcome` union):
```typescript
// scripts/build-boundaries.ts:38-46
export const PNW_STATEFP = ['53', '41', '16', '30'];
export const BC_PRUID = '59';
export const AB_CDUID = '4804';
export const PNW_BOUNDS = { latMin: 41, latMax: 61, lonMin: -140, lonMax: -103 };
```

**Import this constant directly** rather than re-declaring a bounds box (RESEARCH.md Pitfall 2 — 4 inconsistent boxes already exist; `PNW_BOUNDS` is the one tied to real committed geometry):
```typescript
import { PNW_BOUNDS } from '../build-boundaries.ts';
```

**Guard-then-gate ordering pattern** (mirrors `isInFootprint`/`featureWithinBounds`'s independent, composable pure checks at `build-boundaries.ts:56-114`) — RESEARCH.md's own worked example for this exact file should be used near-verbatim:
```typescript
export type CoordinateOutcome = 'axis-order-suspect' | 'out-of-bounds' | 'ok';

export function isAxisOrderSuspect(latitude: number, longitude: number): boolean { /* ... */ }
export function isWithinAssignmentBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= PNW_BOUNDS.latMin && latitude <= PNW_BOUNDS.latMax &&
    longitude >= PNW_BOUNDS.lonMin && longitude <= PNW_BOUNDS.lonMax
  );
}
export function classifyCoordinate(latitude: number, longitude: number): CoordinateOutcome { /* ... */ }
```

**Header comment convention** to copy (cite decision IDs + link to phase docs), from `scripts/build-boundaries.ts:1-23` and `scripts/backfill-legacy-county.ts:1-20`.

---

### `scripts/lib/district-assignment.test.ts` (test, transform)

**Analog:** `scripts/backfill-legacy-county.test.ts` (whole file, esp. lines 1-56 for pure-function testing without Docker/DB)

**Import + describe/it shape to copy**:
```typescript
// scripts/backfill-legacy-county.test.ts:1-8
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDbSpeciesId,
  joinNaturalKey,
  type DbRow,
  type JoinCsvRow,
} from './backfill-legacy-county.ts';
```

**Concrete swap-fixture test cases** (already worked out in RESEARCH.md Code Examples, ready to paste): assert `classifyCoordinate(-117.047, 46.339)` (Asotin WA swap) and `classifyCoordinate(-118.899, 42.889)` (Harney OR swap) both `=== 'axis-order-suspect'`; assert a valid PNW point (Tacoma `47.2529, -122.4443`) `=== 'ok'`. No `package.json` edit needed — this file lives under `scripts/lib/` and is auto-discovered by the existing `'scripts/lib/*.test.ts'` glob (`package.json`'s `test` script, verified present).

**Auto-discovery note (load-bearing):** `scripts/fill-district-from-coords.test.ts` is NOT covered by that glob (it's a top-level `scripts/*.test.ts` file) — it MUST be added explicitly to `package.json`'s `"test"` script string, exactly as `scripts/backfill-legacy-county.test.ts` and `scripts/build-boundaries.test.ts` are today:
```
"test": "node --test ... scripts/backfill-legacy-county.test.ts scripts/build-boundaries.test.ts 'scripts/lib/*.test.ts' ..."
```

---

### `scripts/fill-district-from-coords.ts` (service/CLI, CRUD)

**Analogs:** `scripts/backfill-legacy-county.ts` (whole-file CLI/IO shape) + `scripts/verify-boundaries.ts` (DuckDB spatial load, lines 39-56)

**Imports pattern** (lines 1-26 of `backfill-legacy-county.ts`, adapted — swap `execFileSync`/child_process for `@duckdb/node-api`):
```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { DuckDBInstance } from '@duckdb/node-api';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
```

**RECORDS_COLUMNS constant — copy verbatim** (`backfill-legacy-county.ts:32-36`), the 15-column shape is unchanged by this phase (D-06, no new column):
```typescript
const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection',
  'notes', 'district_id',
];
```

**DuckDB spatial session bootstrap — copy verbatim** (`scripts/verify-boundaries.ts:48-56`, the `custom_extension_repository` workaround is load-bearing, do not omit):
```typescript
const instance = await DuckDBInstance.create(':memory:');
const conn = await instance.connect();
await conn.run("SET custom_extension_repository='https://extensions.duckdb.org';");
await conn.run('INSTALL spatial;');
await conn.run('LOAD spatial;');
await conn.run(`CREATE TABLE districts AS SELECT * FROM ST_Read('${GEOJSON_PATH}');`);
```

**Additive-only write filter pattern** — mirrors `joinNaturalKey`'s `if (row.county !== '') { ...already_had_value...; continue; }` (`backfill-legacy-county.ts:262-266`); this phase's equivalent gate is `if (row.district_id !== '') { skip, do not touch }`.

**Fail-fast vs skip-and-report distinction (important divergence from the analog):** `backfill-legacy-county.ts` fail-fasts (`process.exit(1)`, zero writes) when crosswalk names are unmapped (lines 435-442) — Phase 46 must NOT do this for individual bad-coordinate rows (D-07: "does not hard-fail the run on a bad row"). Copy the *summary console-log + write* pattern (lines 444-464) but drop the fail-fast branch for per-row coordinate problems; keep a fail-fast only for structural failures (e.g., `ST_Read` returns zero districts — mirrors `verify-boundaries.ts:41-46`'s file-size fail-fast style).

**Console summary pattern to copy** (`backfill-legacy-county.ts:451-464`):
```typescript
console.log(`[backfill-county] matched & filled:      ${matched}`);
console.log(`[backfill-county] already had a value:   ${alreadyHad}`);
console.log(`[backfill-county] left blank (no match):  ${leftBlank}`);
console.log(`[backfill-county] fill rate: ...`);
```
Adapt labels to the five outcomes (`assigned-contained`, `assigned-fallback`, `out-of-bounds`, `axis-order-suspect`, `unassigned`) and print the ≥99% fill-rate check called out in RESEARCH.md's Phase Requirements → Test Map (SC#4, a console/manual-verify check, not a `node --test` assertion).

**CLI entry-point guard — copy verbatim** (`backfill-legacy-county.ts:467-472`, identical in `verify-boundaries.ts:83-88` and `build-boundaries.ts:306-311` — a fully established repo convention):
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
```

**Batch containment + fallback SQL** — use RESEARCH.md's Pattern 2 verbatim (already reconciled against this repo's axis-order convention: `ST_Point(lon, lat)` throughout, planar `ST_Distance` for the fallback, never `ST_Distance_Sphere`/`_Spheroid`). Rank fallback candidates by `ORDER BY deg_dist ASC` and take exactly one nearest match per row (RESEARCH.md Pitfall 4 — non-deterministic cross-border fallback risk).

---

### `scripts/fill-district-from-coords.test.ts` (test, CRUD/integration)

**Analogs:** `scripts/backfill-legacy-county.test.ts` (pure-function unit style, esp. the `already_had_value` and idempotency tests at lines 159-200) + `scripts/verify-boundaries.ts` (real-DuckDB-against-real-committed-GeoJSON integration style, no mocking)

**Additive-only unit test to mirror** (`backfill-legacy-county.test.ts:159-168`):
```typescript
it('never overwrites an already-filled row (additive-only) and reports already_had_value', () => {
  const csvRows = [makeCsvRow({ species_id: '5', county: 'Chelan', district_id: 'US:53007' })];
  const dbRows = [makeDbRow({ species_id: '5', county: 'Yakima', state: 'WA' })];
  const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
  assert.equal(result.filled[0]?.district_id, 'US:53007');
  assert.ok(result.reportRows.some((r) => r.outcome === 'already_had_value'));
});
```

**Idempotency test to mirror** (`backfill-legacy-county.test.ts:187-200`) — re-run over own output, assert unchanged (RESEARCH.md's own recommended test: re-run script twice, diff `coord-fill-report.csv`, byte-identical for `assigned-fallback` rows).

**Integration reference-point test to mirror** (`scripts/verify-boundaries.ts:33-37, 59-71`) — reuse the exact same three verified points (Tacoma→US:53053, Victoria→CA:5917, Hanna AB→CA:4804) as containment sanity checks fed through the guard-passing candidate path.

---

### `data/coord-fill-report.csv` (config/data, batch)

**Analog:** `data/legacy-rejoin-report.csv`'s column shape, written by `REPORT_COLUMNS` in `backfill-legacy-county.ts:38-41`:
```typescript
const REPORT_COLUMNS = [
  'species_slug', 'latitude', 'longitude', 'year', 'outcome',
  'county_before', 'county_after', 'district_id_after', 'notes',
];
```

**Recommended column set for this phase** (per CONTEXT.md "Claude's Discretion" + RESEARCH.md's explicit recommendation) — mirror this shape, extended for coordinate-fill provenance:
```
species_slug, latitude, longitude, state, county, outcome, district_id_before, district_id_after, distance_km, notes
```
`outcome` values (D-05, mandatory minimum): `assigned-contained`, `assigned-fallback`, `out-of-bounds`, `axis-order-suspect`, `unassigned`. `distance_km` populated only for `assigned-fallback` rows.

**Write call to copy** (`backfill-legacy-county.ts:445-449`):
```typescript
writeFileSync(
  resolve(ROOT, 'data/coord-fill-report.csv'),
  stringify(reportRows, { header: true, columns: REPORT_COLUMNS }),
  'utf8',
);
```

---

### `_instructions/ASSIGNING_DISTRICTS.md` (doc/runbook)

**Analog:** `_instructions/REFRESHING_BOUNDARIES.md` (whole file — structure to mirror exactly: `## What This Changes`, `## Source Reference` if applicable, `## Steps` with numbered `node scripts/*.ts` invocations + expected console output blocks, `## Verify` with expected/failure pairs).

**Structure to copy verbatim** (headings + numbered-steps-with-expected-output convention):
```markdown
## What This Changes
- `data/records.csv` — additive fill of blank `district_id` cells only...
- `data/coord-fill-report.csv` — rewritten in full each run (one row per attempted record)...

## Steps
1. Run the legacy re-join (Phase 44):
   ```bash
   node scripts/backfill-legacy-county.ts
   ```
2. Run the coordinate fill (Phase 46):
   ```bash
   node scripts/fill-district-from-coords.ts
   ```
   Expected output ends with a per-outcome summary and a fill-rate percentage.

## Verify
- Expected: ...
- Failure: ...
```

Note per user's global CLAUDE.md ("keep READMEs concise... link to source files rather than duplicating volatile configuration"): link to `scripts/fill-district-from-coords.ts` and `scripts/lib/district-assignment.ts` rather than restating the SQL/thresholds in prose, exactly as `REFRESHING_BOUNDARIES.md` already links to `scripts/build-boundaries.ts`'s `PNW_BOUNDS` rather than repeating its numbers.

---

### `data/records.csv` (MODIFIED, model, CRUD)

**Pattern:** additive fill only, using the exact same `RECORDS_COLUMNS` writer shape as `backfill-legacy-county.ts:32-36, 444`. No schema change (D-06) — the `district_id` column already exists from Phase 44. Only blank `district_id` cells for guard-passing, DB-resolved rows are populated; all other columns (including `county`/`state`, per D-02/D-03) pass through untouched.

## Shared Patterns

### Additive-only invariant
**Source:** `scripts/backfill-legacy-county.ts:262-266` (`joinNaturalKey`'s first branch) and its test at `scripts/backfill-legacy-county.test.ts:159-168`
**Apply to:** `scripts/fill-district-from-coords.ts` and its test — never overwrite a non-blank `district_id`; report `already_had_value`/equivalent outcome instead of skipping silently.

### Fixed-literal SQL / no field interpolation
**Source:** `scripts/backfill-legacy-county.ts:43-46` comment + `scripts/verify-boundaries.ts:61` (`ST_Point(${point.lon}, ${point.lat})` — numeric-only interpolation, never raw CSV string values)
**Apply to:** `scripts/fill-district-from-coords.ts`'s containment/fallback queries — coordinates are parsed to `number` before any interpolation; never interpolate raw CSV string cells into SQL text (RESEARCH.md Security Domain V5).

### CLI entry-point guard
**Source:** `scripts/backfill-legacy-county.ts:467-472`, `scripts/verify-boundaries.ts:83-88`, `scripts/build-boundaries.ts:306-311` (identical in all three)
**Apply to:** `scripts/fill-district-from-coords.ts`
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
```

### Console summary + committed-report double-write
**Source:** `scripts/backfill-legacy-county.ts:444-464`
**Apply to:** `scripts/fill-district-from-coords.ts` — write `data/records.csv` and `data/coord-fill-report.csv` in the same run, then print a per-outcome count summary and fill-rate percentage.

### Pure-function-first, DB-free unit testability
**Source:** `scripts/build-boundaries.ts:29-148` (exported pure validators used both by `main()` and unit-tested directly) and `scripts/backfill-legacy-county.ts:73-320` (`normalizeBinomial`, `normalizeCoord`, `joinNaturalKey` — all pure, all exported, all unit-tested without Docker)
**Apply to:** `scripts/lib/district-assignment.ts` — the guard/gate/classification functions must be pure and DB-free so Phase 47 can import them without opening a DuckDB connection.

## No Analog Found

None — every file in this phase has a strong (exact or role-match) analog already committed in this repo (Phase 44/45 precedent).

## Metadata

**Analog search scope:** `scripts/`, `scripts/lib/`, `_instructions/`, `data/*.csv`, `package.json`
**Files scanned:** `scripts/backfill-legacy-county.ts`, `scripts/backfill-legacy-county.test.ts`, `scripts/verify-boundaries.ts`, `scripts/build-boundaries.ts`, `_instructions/REFRESHING_BOUNDARIES.md`, `package.json` (test script glob)
**Pattern extraction date:** 2026-07-05
</content>
