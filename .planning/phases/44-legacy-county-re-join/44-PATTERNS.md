# Phase 44: Legacy County Re-join - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 10 (2 new scripts, 2 new data files, 1 new test, 6 modified schema/column-map files)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/backfill-legacy-county.ts` (NEW) | service (offline batch script) | CRUD (read CSV + DB, join, write-back) | `scripts/recover-clipped-bc-records.ts` | exact |
| `scripts/backfill-legacy-county.test.ts` (NEW) | test | request-response (pure-function unit tests) | `scripts/emit-species-audit.ts` (its co-located test-covered pure functions) + `scripts/migrate-legacy-photos.test.ts` (test file shape) | role-match |
| `data/district-crosswalk.csv` (NEW) | config/curation data | CRUD (static lookup table) | `data/species-synonyms.csv` | exact |
| `data/legacy-rejoin-report.csv` (NEW, generated at runtime) | model/report output | batch (per-run emitted CSV) | `_site/species-audit.csv` emission in `scripts/emit-species-audit.ts` | exact |
| `scripts/build-data.ts` (MODIFY) | service (pipeline / build script) | CRUD (CSV→DuckDB→Parquet) | itself — extend existing `validateCsv` call + `columns = {...}` map | n/a (modify in place) |
| `scripts/emit-species-audit.ts` (MODIFY) | service | CRUD | itself — extend `loadRecordSlugs()`'s `columns = {...}` map | n/a (modify in place) |
| `scripts/emit-species-states.ts` (MODIFY) | service | CRUD | itself — extend its own `columns = {...}` map | n/a (modify in place) |
| `scripts/profile-data.ts` (MODIFY, lower priority) | utility/diagnostic | CRUD | itself — two `columns = {...}` maps | n/a (modify in place) |
| `src/types/schemas.ts` (MODIFY) | model (Zod schema) | transform (validation) | itself — `OccurrenceRecordSchema` | n/a (modify in place) |
| `src/components/parquet-cache.ts` (MODIFY) | utility | transform (schema assertion) | itself — `EXPECTED_PARQUET_COLUMNS` | n/a (modify in place) |
| `package.json` (MODIFY) | config | n/a | itself — `"test"` script's explicit file list | n/a (modify in place) |

## Pattern Assignments

### `scripts/backfill-legacy-county.ts` (service, CRUD)

**Analog:** `scripts/recover-clipped-bc-records.ts` (full file read — 163 lines)

**Imports pattern** (lines 24-29):
```typescript
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
```

**Fixed column-order constant** (lines 41-45) — mirror this exactly, but add the new `district_id` column to `RECORDS_COLUMNS`:
```typescript
const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes',
];
```
→ new script needs `district_id` appended (RESEARCH.md names it as such): `[..., 'notes', 'district_id']`.

**Docker/MySQL query pattern — reuse verbatim, array-args `execFileSync`, no shell interpolation** (lines 80-92):
```typescript
function queryContainer(): Record<string, string>[] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'pnwmoths-mysql', 'mysql', '-upnwmoths', '-ppnwmoths', 'pnwmoths', '--batch'],
    { input: SQL, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const lines = out.replace(/\n$/, '').split('\n');
  const header = (lines[0] ?? '').split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t').map(unescapeBatch);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}
```
Also copy the `unescapeBatch()` helper (lines 74-78) verbatim — decodes `mysql --batch` tab/newline/backslash escaping.

**species.csv → species_id mapping (DO NOT copy verbatim — RESEARCH.md Pitfall 1 supersedes this)**. The analog's naive version (lines 99-105):
```typescript
const speciesCsvPath = resolve(ROOT, 'data/species.csv');
const speciesRows = parse(readFileSync(speciesCsvPath), { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
const slugById = new Map<string, string>();
for (const r of speciesRows) {
  slugById.set(r.id ?? '', `${r.genus ?? ''}-${r.species ?? ''}`.toLowerCase());
}
```
Copy the *shape* (parse species.csv once, build a lookup map) but replace the trust-the-id logic with RESEARCH.md's `resolveDbSpeciesId()` two-strategy algorithm (id-trust-with-epithet-sanity-check, else normalized-binomial fallback) — see RESEARCH.md "Species-ID Resolution" section for the exact pure function to implement and unit-test.

**Read-merge-write-back pattern for records.csv (full-file rewrite, not patch)** (lines 144-150):
```typescript
const recordsCsvPath = resolve(ROOT, 'data/records.csv');
const existing = existsSync(recordsCsvPath)
  ? (parse(readFileSync(recordsCsvPath), { columns: true, skip_empty_lines: true }) as Record<string, string>[])
  : [];
const merged = [...existing, ...bandToAppend];
writeFileSync(recordsCsvPath, stringify(merged, { header: true, columns: RECORDS_COLUMNS }), 'utf8');
```
For this phase: instead of *appending* new rows (as the analog does), the script must *mutate in place* — for each existing row missing `county`/`district_id`, fill both columns when the join resolves, then rewrite the same row count via the same `stringify(..., { columns: RECORDS_COLUMNS })` call. Preserve row order (do not re-sort).

**Console summary logging pattern** (lines 156-159) — mirror this shape for D-04's console summary:
```typescript
console.log(`[recover-bc] candidate clipped records: ${rows.length}`);
console.log(`[recover-bc] appended to records.csv:    ${bandToAppend.length} (now ${merged.length} rows)`);
console.log(`[recover-bc] skipped (species not in species.csv): ${skippedNoSpecies}`);
console.log(`[recover-bc] bad coordinates -> data/records-bad-coords.csv: ${badCoords.length}`);
```
Use a `[backfill-county]` prefix; log matched/filled, already-had-value/skipped, left-blank/no-match, and before/after fill rate, per D-04.

**Fail-fast gate (D-03) — no direct analog in `recover-clipped-bc-records.ts`; model on a hard validation gate.** Use the same pattern as `validateCsv()` in `scripts/build-data.ts` (line 19 area): throw/exit non-zero with a clear message listing every offending value, before writing anything. Concretely: collect all `(state, name)` pairs observed in the DB extraction that have no `district-crosswalk.csv` entry; if any exist, `console.error` the full list and `process.exit(1)` before any `writeFileSync` call touches `records.csv`.

**Entry point convention** — the analog calls `main();` unconditionally at module bottom (line 162: `main();`). Since this phase also needs unit-testable pure functions, follow `emit-species-audit.ts`'s stricter convention instead for the entry guard:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
```
(from `scripts/emit-species-audit.ts` lines 198-203) — this is required so the pure join/match functions can be imported by the test file without triggering `main()`.

---

### `scripts/backfill-legacy-county.ts` — pure-function core (CRUD/transform)

**Analog:** `scripts/emit-species-audit.ts` (full file read — 204 lines) — the project's established "pure-function core, thin CLI wrapper" convention (RESEARCH.md names this explicitly).

**Pattern: separate exported pure functions from `main()`** (lines 68-92, 106-124, 174-203): `buildSpeciesAuditRows()` and `toCsv()` are exported, take only plain-data arguments (no I/O), and are unit-tested directly; `main()` (not exported, or exported separately) wires `readFileSync`/DuckDB/etc. around them. Apply this exact separation to:
- `resolveDbSpeciesId(csvRow, dbSpeciesById, dbIdsByNormalizedBinomial)` — pure, exported, unit-tested (signature given verbatim in RESEARCH.md).
- `joinNaturalKey(csvRows, dbRows, crosswalk)` — pure, exported, unit-tested (signature given verbatim in RESEARCH.md `Code Examples` section).
- A `main()` that shells out to Docker, reads/writes the three CSVs, prints the console summary, and calls `process.exit(1)` on the fail-fast gate.

**CSV field-quoting helper** (lines 94-100) — reuse this exact RFC-4180 escaping helper if hand-rolling the report CSV instead of using `csv-stringify`:
```typescript
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```
(Prefer `csv-stringify` for `legacy-rejoin-report.csv` for consistency with the rest of the codebase — see Shared Patterns below — but this helper is the fallback the project already uses when hand-rolling.)

---

### `scripts/backfill-legacy-county.test.ts` (test)

**Analog A — test file shape:** `scripts/migrate-legacy-photos.test.ts` (full file read — 39 lines):
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhotoName, legacyPhotoStorageUrl, cdnReadUrl } from './migrate-legacy-photos.ts';

describe('normalizePhotoName', () => {
  it('converts underscores to spaces (binomial)', () => {
    assert.equal(normalizePhotoName('Xestia_atrata-A-D.jpg'), 'Xestia atrata-A-D.jpg');
  });
  // ...
});
```
Use `node:test` + `node:assert/strict`, `describe`/`it` blocks grouped by exported pure function, direct relative `.ts` import (Node 24 type-stripping — no compiled `.js` import path).

**Analog B — fixture-based pure-function testing without Docker:** RESEARCH.md's Wave 0 Gaps section specifies a small committed **fixture pair** (synthetic DB rows + synthetic `records.csv` rows) exercising: unique match, multi-match-agree, multi-match-conflict-resolved-by-locality, unmapped-name-failure, already-filled-skip — mirroring how `emit-species-audit.ts`'s `buildSpeciesAuditRows()` is tested with hand-constructed in-memory objects (no DuckDB, no file I/O) rather than requiring the live Docker container in CI.

**Must add to `package.json`'s `"test"` script** (Pitfall 6 — this is not implicit; the runner is a hardcoded file list, not a glob):
```
"test": "node --test eleventy.config.test.ts scripts/build-data.test.ts ... scripts/migrate-legacy-photos.test.ts scripts/fetch-analytics.test.ts 'scripts/lib/*.test.ts' src/types/schemas.test.ts src/components/*.test.ts 'src/_lib/*.test.ts' 'src/_data/*.test.ts'"
```
(exact current string at `package.json` line 38) — append `scripts/backfill-legacy-county.test.ts` to this space-separated list.

---

### `data/district-crosswalk.csv` (config/curation data)

**Analog:** `data/species-synonyms.csv` (first 15 lines read of a small committed curation CSV):
```csv
from_binomial,to_species_slug
Grammia doris,apantesis-doris
Grammia virgo,apantesis-virgo
```
Same shape principle: plain 2+-column CSV, no quoting needed unless a field contains a comma, committed to git, hand-edited by a curator, loaded once at script start via `csv-parse`. For `district-crosswalk.csv`, RESEARCH.md's recommended columns are `state, legacy_name, stable_id, notes` (composite key `(state, legacy_name)` — county names collide across states, e.g. three "Lincoln" counties). Include the `notes` column for the anomaly rows (WA/Lake, ID/Beaver, BC/Cranbrook) per RESEARCH.md Pitfall 4.

---

### `data/legacy-rejoin-report.csv` (report output)

**Analog:** `_site/species-audit.csv` emission pattern in `scripts/emit-species-audit.ts` (lines 58-60, 106-124, 193-195):
```typescript
export const AUDIT_HEADER =
  'slug,genus,species,common_name,family,subfamily,has_records,visible,in_key';

export function toCsv(rows: SpeciesAuditRow[]): string {
  const lines = [AUDIT_HEADER];
  for (const r of rows) {
    lines.push([...].join(','));
  }
  return lines.join('\n') + '\n';
}
// ...
mkdirSync(resolve('_site'), { recursive: true });
writeFileSync(resolve('_site/species-audit.csv'), toCsv(rows));
console.log(`Wrote ${rows.length} species to _site/species-audit.csv`);
```
Difference for this phase: `legacy-rejoin-report.csv` is **committed to `data/`**, not an unlinked `_site/` build artifact — write it via `writeFileSync(resolve(ROOT, 'data/legacy-rejoin-report.csv'), ...)` and expect it in the git diff every run (D-04). Suggested columns: `species_slug, latitude, longitude, year, outcome, county_before, county_after, district_id_after, notes` where `outcome` ∈ `filled | already_had_value | conflict_unresolved | no_match | species_unresolved`.

---

### `scripts/build-data.ts` (MODIFY)

**Analog:** itself. Two concrete edit points, both verified by direct read:

**`validateCsv()` column-name array** (lines 124-127):
```typescript
validateCsv('data/records.csv', [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes'
]);
```
→ append `'district_id'`.

**DuckDB `read_csv` `columns = {...}` schema map for the `records` table** (lines 155-171, table created 154-171):
```typescript
await conn.run(`
  CREATE TABLE records AS
  SELECT * FROM read_csv('data/records.csv',
    header = true,
    columns = {
      'species_slug': 'VARCHAR',
      'record_type': 'VARCHAR',
      'latitude': 'DOUBLE',
      'longitude': 'DOUBLE',
      'state': 'VARCHAR',
      'county': 'VARCHAR',
      'locality': 'VARCHAR',
      'elevation_ft': 'INTEGER',
      'year': 'INTEGER',
      'month': 'INTEGER',
      -- day, collector, collection, notes continue below (not re-read; see RESEARCH.md line 169-171)
    }
  )
`);
```
→ add `'district_id': 'VARCHAR'` to this map (string-typed, per D-02's zero-padded-string requirement — never `INTEGER`, or leading zeros in `US:05xxx`-style GEOIDs would be lost... though note D-02's actual format is `US:53077` with the prefix already embedded, so it is inherently a VARCHAR, not a bare zero-padded number).

Per RESEARCH.md: no other structural change needed — `build-data.ts` already does `SELECT * FROM records` when copying to Parquet, so once this `columns` map includes `district_id`, it flows through to Parquet and Zod automatically.

---

### `scripts/emit-species-audit.ts` (MODIFY)

**Analog:** itself — `loadRecordSlugs()` (lines 131-159), same `columns = {...}` map:
```typescript
const reader = await conn.runAndReadAll(`
  SELECT DISTINCT species_slug
  FROM read_csv('data/records.csv',
    header = true,
    columns = {
      'species_slug': 'VARCHAR',
      ...
      'notes': 'VARCHAR'
    })
  WHERE species_slug IS NOT NULL AND species_slug != ''
`);
```
→ add `'district_id': 'VARCHAR'` to this map (even though the query doesn't select it, DuckDB's `read_csv` with an explicit `columns` map silently drops any column not listed — Pitfall 7).

---

### `scripts/emit-species-states.ts` (MODIFY)

Not read in full this session (RESEARCH.md cites its own `columns = {...}` map at ~line 13) — apply the identical addition: append `'district_id': 'VARCHAR'` to its DuckDB column map. Planner/implementer should grep `elevation_ft` in this file (RESEARCH.md's suggested sentinel) to locate the exact map before editing.

---

### `scripts/profile-data.ts` (MODIFY, lower priority)

Diagnostic-only script with two `columns = {...}` maps (per RESEARCH.md) — same mechanical addition, lower priority since it doesn't gate the build.

---

### `src/types/schemas.ts` (MODIFY)

**Analog:** itself — `OccurrenceRecordSchema` (lines 8-28, full block read):
```typescript
// county is 100% null in current production data
export const OccurrenceRecordSchema = z.object({
  species_slug:  z.string(),
  record_type:   z.string(),
  latitude:      z.number(),
  longitude:     z.number(),
  state:         z.string(),
  county:        z.nullable(z.string()),   // 100% null in current production data
  locality:      z.nullable(z.string()),
  elevation_ft:  z.nullable(z.number()),
  year:          z.nullable(z.number()),
  month:         z.nullable(z.number()),
  day:           z.nullable(z.number()),
  collector:     z.nullable(z.string()),
  collection:    z.nullable(z.string()),
  notes:         z.nullable(z.string()),
});
```
→ add `district_id: z.nullable(z.string())` following the exact `z.nullable(z.string())` convention already used for every other optional string field (never `z.optional()` — the file's own header comment at line 3 explains why: "hyparquet writes null, not undefined"). **Also update the now-stale comment** at line 11 (`// county is 100% null in current production data`) and the inline comment at line 18 — both are factually wrong after this phase raises fill to ~96%+.

---

### `src/components/parquet-cache.ts` (MODIFY)

**Analog:** itself — `EXPECTED_PARQUET_COLUMNS` (lines 11-15):
```typescript
const EXPECTED_PARQUET_COLUMNS = new Set([
  'species_slug', 'record_type', 'latitude', 'longitude', 'state',
  'county', 'locality', 'elevation_ft', 'year', 'month', 'day',
  'collector', 'collection', 'notes',
]);
```
→ add `'district_id'`. Not build-breaking to omit for this phase alone (the assertion at lines 28-34 only checks *expected* columns are present; extra actual columns are tolerated) — but RESEARCH.md recommends doing it now for consistency since Phase 48 will need it anyway.

---

## Shared Patterns

### CSV parse/stringify (project-standard toolchain)
**Source:** `scripts/recover-clipped-bc-records.ts` lines 28-29; `scripts/emit-species-audit.ts` line 15
**Apply to:** `backfill-legacy-county.ts` (records.csv, species.csv, crosswalk CSV, report CSV) and its test fixtures.
```typescript
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
// ...
const rows = parse(readFileSync(path), { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
// ...
writeFileSync(path, stringify(rows, { header: true, columns: FIXED_COLUMN_ORDER }), 'utf8');
```
Never hand-roll comma-split/join — `notes` fields already contain embedded commas/quotes that require RFC-4180 handling.

### Docker/MySQL access (injection-safe, array-args execFileSync)
**Source:** `scripts/recover-clipped-bc-records.ts` lines 80-92
**Apply to:** `backfill-legacy-county.ts`'s DB-extraction step only.
```typescript
execFileSync('docker', ['exec', '-i', 'pnwmoths-mysql', 'mysql', '-upnwmoths', '-ppnwmoths', 'pnwmoths', '--batch'],
  { input: SQL, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
```
`SQL` must remain a fixed literal template string — never interpolate untrusted CSV/DB field values into it.

### Pure-function core / thin CLI wrapper
**Source:** `scripts/emit-species-audit.ts` (whole-file structure: lines 68-124 exported pure functions; lines 130-203 I/O wiring + `main()`)
**Apply to:** `backfill-legacy-county.ts` — required so `resolveDbSpeciesId()` and `joinNaturalKey()` can be unit-tested without a Docker dependency in CI (RESEARCH.md's explicit Wave-0 test-architecture requirement).

### DuckDB explicit `columns` map — every records.csv reader must list every column
**Source:** `scripts/build-data.ts` lines 155-171 (and mirrored in `emit-species-audit.ts` lines 138-153, `emit-species-states.ts`, `profile-data.ts`)
**Apply to:** All four files' `columns = {...}` maps — add `'district_id': 'VARCHAR'` to each. Grep `elevation_ft` as the sentinel to find every occurrence (RESEARCH.md-recommended technique, already exhaustively enumerated in RESEARCH.md's file list — treat that list as complete).

### `z.nullable(z.string())`, never `z.optional()`, for new nullable CSV-sourced columns
**Source:** `src/types/schemas.ts` line 3 (file header comment) and every field in `OccurrenceRecordSchema`
**Apply to:** the new `district_id` field in `OccurrenceRecordSchema`.

## No Analog Found

None — every file in scope has a direct or closely-related in-repo analog (this codebase's small size and consistent conventions meant 5 strong analogs covered all 10 files).

## Metadata

**Analog search scope:** `scripts/*.ts`, `scripts/*.test.ts`, `data/*.csv`, `src/types/schemas.ts`, `src/components/parquet-cache.ts`, `package.json`
**Files scanned/read in full or targeted range:** `scripts/recover-clipped-bc-records.ts` (full, 163 lines), `scripts/emit-species-audit.ts` (full, 204 lines), `data/species-synonyms.csv` (first 15 lines), `scripts/build-data.ts` (lines 120-170), `src/types/schemas.ts` (lines 1-40), `scripts/migrate-legacy-photos.test.ts` (full, 39 lines), `package.json` (test script line), `src/components/parquet-cache.ts` (lines 11-44)
**Pattern extraction date:** 2026-07-04
