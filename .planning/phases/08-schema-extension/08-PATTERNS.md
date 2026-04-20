# Phase 8: Schema Extension - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/build-data.js` | pipeline/utility | batch, CRUD | self (existing file, modify in place) | exact |
| `scripts/build-data.test.js` | test | batch | self (existing file, add tests) | exact |
| `src/_data/families.js` | data provider | CRUD, request-response | `src/_data/images.js` | exact (same role + flow) |
| `src/_data/images.js` | data provider | CRUD, request-response | `src/_data/families.js` | exact (same role + flow) |
| `data/species.csv` | config/data | — | `data/images.csv` | exact (same format) |
| `data/images.csv` | config/data | — | `data/species.csv` | exact (same format) |

## Pattern Assignments

### `scripts/build-data.js` (pipeline/utility, batch)

This file is modified in place. Two distinct change sites exist.

**Change site 1 — `validateCsv` call for `species.csv`** (line 73):

Current pattern to extend:
```javascript
validateCsv('data/species.csv', ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species']);
```
Add `'subfamily'` to the array. The column must be present in the header; blank cell values are allowed.

**Change site 2 — `validateCsv` call for `images.csv`** (line 74):

Current pattern to extend:
```javascript
const imageRows = validateCsv('data/images.csv', ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen']);
```
Add `'navigational'` to the array (D-02).

**Change site 3 — DuckDB `CREATE TABLE species` column map** (lines 98-112):

Current `columns` map:
```javascript
columns = {
  'id': 'INTEGER',
  'genus': 'VARCHAR',
  'species': 'VARCHAR',
  'common_name': 'VARCHAR',
  'noc_id': 'VARCHAR',
  'authority': 'VARCHAR',
  'family': 'VARCHAR',
  'similar_species': 'VARCHAR'
}
```
Add `'subfamily': 'VARCHAR'` to this map (D-05). Also add `nullstr = ''` as a top-level `read_csv` option (D-04), placed alongside `header = true` and `columns = {...}`.

**`nullstr` placement pattern** — `read_csv` named options are comma-separated at the same indentation level as `header` and `columns`. The existing records table call (lines 114-135) shows the three-option form; `nullstr = ''` is a fourth option added in the same style:
```sql
SELECT * FROM read_csv('data/species.csv',
  header = true,
  nullstr = '',
  columns = { ... }
)
```

---

### `scripts/build-data.test.js` (test, batch)

**Imports pattern** (lines 1-10) — copy exactly for any new test helper imports:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCsv } from '../scripts/build-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
```

**Synthetic temp-file fixture pattern** (lines 52-73) — use for null-coercion tests. The non-UTF-8 test is the canonical example:
```javascript
test('validateCsv: non-UTF-8 bytes throw with actionable message', () => {
  const tmpDir = resolve(ROOT, '.tmp-test');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'bad-encoding.csv');

  try {
    const buf = Buffer.from('id,name\n1,H\xFCbner\n', 'binary');
    writeFileSync(tmpFile, buf);

    assert.throws(
      () => validateCsv(tmpFile, ['id', 'name']),
      (err) => {
        assert.match(err.message, /non-UTF-8/i);
        return true;
      }
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

Apply this pattern for null-coercion tests: write a minimal CSV string to a temp file, call `validateCsv`, then verify behavior. For DuckDB-level null-coercion tests (blank-becomes-NULL), use the inline DuckDB pattern from lines 77-103:
```javascript
test('description', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`CREATE TABLE ... AS SELECT ...`);

  const result = await conn.runAndReadAll(`SELECT ...`);
  const rows = result.getRowObjectsJS();

  assert.strictEqual(rows[0].someColumn, null, 'blank value should be NULL');

  conn.closeSync();
});
```

**Happy-path column assertions** (lines 17-30) — update both existing happy-path tests to include the new columns:
```javascript
// Line 17-23: add 'subfamily' to species.csv assertion
validateCsv(
  resolve(ROOT, 'data/species.csv'),
  ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species']
  // → add 'subfamily' here
);

// Line 25-30: add 'navigational' to images.csv assertion
validateCsv(
  resolve(ROOT, 'data/images.csv'),
  ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen']
  // → add 'navigational' here
);
```

---

### `src/_data/families.js` (data provider, CRUD)

**Full file pattern** — this is the analog for `images.js` and vice versa. The complete structure is:
1. `DuckDBInstance.create(':memory:')` + `db.connect()`
2. `conn.run(CREATE TABLE ... AS SELECT * FROM read_csv(..., columns = {...}))` 
3. `conn.runAndReadAll(SELECT ...)` for each query
4. `conn.closeSync()` — always called before return
5. `result.getRowObjectsJS()` to materialize rows
6. JS grouping/transformation
7. `return` the shaped object

**Change site 1 — `read_csv` column map** (lines 11-20): add `'subfamily': 'VARCHAR'` and `nullstr = ''` (D-07, D-04):
```javascript
await conn.run(`
  CREATE TABLE species AS
  SELECT * FROM read_csv('data/species.csv',
    header = true,
    nullstr = '',
    columns = {
      'id': 'INTEGER',
      'genus': 'VARCHAR',
      'species': 'VARCHAR',
      'common_name': 'VARCHAR',
      'noc_id': 'VARCHAR',
      'authority': 'VARCHAR',
      'family': 'VARCHAR',
      'similar_species': 'VARCHAR'
      // add: 'subfamily': 'VARCHAR'
    }
  )
`);
```

**Change site 2 — genera SELECT query** (lines 25-29): add `subfamily` to the SELECT column list (D-07):
```javascript
const generaResult = await conn.runAndReadAll(`
  SELECT DISTINCT family, genus, subfamily,
    lower(replace(genus, ' ', '-')) AS genus_slug
  FROM species
  ORDER BY family, subfamily NULLS LAST, genus
`);
```
The ORDER BY change (D-08) — `family, genus` becomes `family, subfamily NULLS LAST, genus` — ensures genera without a subfamily sort after those with one.

**Change site 3 — return value** (lines 43-58): `getRowObjectsJS()` already returns all selected columns as object properties, so `subfamily` appears automatically once it is in the SELECT. The `byGenus` grouping object (line 50) includes all columns from each row; `subfamily` will be present per-row automatically.

---

### `src/_data/images.js` (data provider, CRUD)

**Full file pattern** (all 39 lines) — identical structural pattern to `families.js`. Key sections:

**Change site 1 — `read_csv` column map** (lines 11-19): add `'navigational': 'VARCHAR'` and `nullstr = ''` (D-06, D-04):
```javascript
columns = {
  'species_slug': 'VARCHAR',
  'filename': 'VARCHAR',
  'photographer': 'VARCHAR',
  'weight': 'INTEGER',
  'license': 'VARCHAR',
  'view': 'VARCHAR',
  'specimen': 'VARCHAR'
  // add: 'navigational': 'VARCHAR'
}
```
`specimen` is the existing nullable VARCHAR column — `navigational` follows the identical convention (no special handling beyond VARCHAR type).

**Change site 2 — SELECT column list** (lines 23-27): add `navigational` to the projection:
```javascript
SELECT species_slug, filename, photographer, weight, license, view, specimen, navigational
FROM images
ORDER BY species_slug, weight
```
`getRowObjectsJS()` then includes `navigational` in each row object automatically.

---

### `data/species.csv` (data, —)

**Current header** (line 1):
```
id,genus,species,common_name,noc_id,authority,family,similar_species
```

Add `subfamily` as a new rightmost column. All existing data rows get a blank value (the column is appended, so existing rows get an implicit trailing comma with no value, or an explicit blank):
```
id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily
1,Acronicta,americana,American Dagger Moth,9200,Harris 1841,Noctuidae,autographa-californica,
```
Blank `subfamily` cells → NULL via `nullstr = ''` in DuckDB `read_csv`.

---

### `data/images.csv` (data, —)

**Current header** (line 1):
```
species_slug,filename,photographer,weight,license,view,specimen
```

Add `navigational` as a new rightmost column. All existing rows get a blank value:
```
species_slug,filename,photographer,weight,license,view,specimen,navigational
acronicta-americana,01.jpg,Jane Doe,1,CC BY 4.0,,,
```
Blank `navigational` cells → NULL via `nullstr = ''`; consuming code treats NULL as false (D-01).

---

## Shared Patterns

### DuckDB `getRowObjectsJS` + `closeSync` pattern
**Source:** `src/_data/families.js` lines 41-44, `src/_data/images.js` lines 30-31
**Apply to:** All `_data/*.js` files and any inline DuckDB tests
```javascript
conn.closeSync();          // always before return or after runAndReadAll
const rows = result.getRowObjectsJS();
```
`closeSync()` is synchronous and must be called before the function returns. In `families.js` it is called before `getRowObjectsJS()` because results are already materialized by `runAndReadAll`. In tests it is called at the end of each async test block.

### `nullstr = ''` placement in `read_csv`
**Source:** Decision D-04 / STATE.md
**Apply to:** `build-data.js` species table, `families.js` species read, `images.js` images read
Place `nullstr = ''` as a named option alongside `header = true`, before `columns = {...}`:
```sql
SELECT * FROM read_csv('data/foo.csv',
  header = true,
  nullstr = '',
  columns = { ... }
)
```
This is NOT applied to `records.csv` or `glossary.csv` read_csv calls — only to the two CSVs gaining new nullable columns in Phase 8.

### `validateCsv` call pattern
**Source:** `scripts/build-data.js` lines 73-74
**Apply to:** Any new required-column assertions in `build-data.js`
```javascript
validateCsv('data/filename.csv', ['col1', 'col2', ...]);
// or with destructured result:
const rows = validateCsv('data/filename.csv', ['col1', 'col2', ...]);
```
The function throws on missing column or bad encoding; no return-value check needed for presence-only validation.

## No Analog Found

All files in Phase 8 are modifications to existing files with well-established patterns. No net-new files are introduced.

## Metadata

**Analog search scope:** `scripts/`, `src/_data/`, `data/`
**Files scanned:** 6 (all source files read directly — no codebase-wide search needed; all analogs are the files themselves or their sibling)
**Pattern extraction date:** 2026-04-20
