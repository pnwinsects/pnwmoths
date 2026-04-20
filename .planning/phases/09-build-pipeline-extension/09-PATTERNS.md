# Phase 9: Build Pipeline Extension - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 3 new/modified files
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/_data/taxon.js` | data-file | CRUD / transform | `src/_data/families.js` | exact |
| `scripts/emit-species-states.js` | utility / build-script | CRUD / file-I/O | `scripts/copy-parquet.js` + `scripts/build-data.js` | role-match |
| `package.json` (build script chain) | config | — | existing `package.json` scripts block | exact |

---

## Pattern Assignments

### `src/_data/taxon.js` (data-file, transform)

**Analog:** `src/_data/families.js`

**Imports pattern** (`src/_data/families.js` lines 1):
```javascript
import { DuckDBInstance } from '@duckdb/node-api';
```

**Core DuckDB lifecycle pattern** (`src/_data/families.js` lines 3-43):
```javascript
export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

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
        'similar_species': 'VARCHAR',
        'subfamily': 'VARCHAR'
      }
    )
  `);

  const generaResult = await conn.runAndReadAll(`SELECT ...`);
  const speciesResult = await conn.runAndReadAll(`SELECT ...`);

  conn.closeSync();   // <-- must always be called; call in all code paths

  const genera = generaResult.getRowObjectsJS();
  const allSpecies = speciesResult.getRowObjectsJS();
  // ... build and return data structure
}
```

**images.csv read_csv schema** (`src/_data/images.js` lines 7-23) — copy this for the images table in `taxon.js`:
```javascript
  await conn.run(`
    CREATE TABLE images AS
    SELECT * FROM read_csv('data/images.csv',
      header = true,
      nullstr = '',
      columns = {
        'species_slug': 'VARCHAR',
        'filename': 'VARCHAR',
        'photographer': 'VARCHAR',
        'weight': 'INTEGER',
        'license': 'VARCHAR',
        'view': 'VARCHAR',
        'specimen': 'VARCHAR',
        'navigational': 'VARCHAR'
      }
    )
  `);
```

**Flat-rows-to-grouped-map pattern** (`src/_data/families.js` lines 48-58) — base grouping shape to copy:
```javascript
  const byGenus = {};
  for (const sp of allSpecies) {
    if (!byGenus[sp.genus_slug]) {
      byGenus[sp.genus_slug] = { genus: sp.genus, family: sp.family, genus_slug: sp.genus_slug, species: [] };
    }
    byGenus[sp.genus_slug].species.push(sp);
  }
  const genusArray = Object.values(byGenus);
```
`taxon.js` extends this two levels deeper (family → subfamily → genus → species). Use a sentinel string `'__none__'` as the map key for rows where `subfamily IS NULL`, and expose `name: null` in the output so Phase 10 templates can omit the subfamily heading.

**navigational image grouping** (`src/_data/images.js` lines 34-39):
```javascript
  const bySpecies = {};
  for (const row of rows) {
    const slug = row.species_slug;
    if (!bySpecies[slug]) bySpecies[slug] = [];
    bySpecies[slug].push(row);
  }
```
Use the same pattern to build a `bySpeciesSlug` map in `taxon.js`. Prefer images where `navigational === 'true'`; fall back to lowest-weight images. Take up to 4 per genus, then roll up to subfamily and family levels.

**Two-query strategy for navImages** (from Research Pitfall 5): run species and images as two separate queries (matching existing `families.js` + `images.js` split), merge in JS rather than a JOIN. This avoids inflating species rows.

**closeSync placement** — `conn.closeSync()` must be called before every `return` and before every `throw`. Follow `families.js` line 43 exactly.

---

### `scripts/emit-species-states.js` (utility, file-I/O)

**Primary analog:** `scripts/copy-parquet.js` (post-Vite file write pattern)
**Secondary analog:** `scripts/build-data.js` (DuckDB connection + `getRowObjectsJS()` + `closeSync()`)

**Imports pattern** (`scripts/copy-parquet.js` lines 8-9; `scripts/build-data.js` lines 4-6):
```javascript
import { DuckDBInstance } from '@duckdb/node-api';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
```

**Post-Vite file write pattern** (`scripts/copy-parquet.js` lines 11-15):
```javascript
// copy-parquet.js uses cp; emit-species-states.js uses writeFileSync instead
const dest = resolve('_site/species');
await cp(src, dest, { recursive: true });
console.log('Copied Parquet files: data/parquet/ -> _site/species/');
```
Adapt to:
```javascript
const outPath = resolve('_site/species-states.json');
mkdirSync(resolve('_site'), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows));
console.log(`Wrote ${rows.length} species-state pairs to _site/species-states.json`);
```

**DuckDB DISTINCT query pattern** (`scripts/build-data.js` lines 184-187 for runAndReadAll + getRowObjectsJS):
```javascript
const result = await conn.runAndReadAll(`
  SELECT DISTINCT species_slug, state
  FROM records
  WHERE state IS NOT NULL AND state != ''
  ORDER BY species_slug, state
`);
const rows = result.getRowObjectsJS();
```
This is directly analogous to the state-validation query in `build-data.js` lines 158-165 — reuse the same `state IS NOT NULL AND state != ''` filter.

**records.csv read_csv schema** (`scripts/build-data.js` lines 116-137):
```javascript
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
        'day': 'INTEGER',
        'collector': 'VARCHAR',
        'collection': 'VARCHAR',
        'notes': 'VARCHAR'
      }
    )
  `);
```

**Script guard pattern** (`scripts/build-data.js` lines 228-232):
```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```
Use the same guard in `emit-species-states.js` so it can be safely imported by tests.

---

### `package.json` (config — build script chain)

**Analog:** existing `package.json` `scripts` block (lines 7-17)

**Current build chain** (line 14):
```json
"build": "npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:pagefind && npm run build:validate-links && npm run build:check-weight"
```

**Pattern to follow** (lines 10, 15 — post-Vite steps):
```json
"build:copy-parquet": "node scripts/copy-parquet.js",
"build:copy-images": "node scripts/copy-images.js",
```

**Add after `build:copy-images`:**
```json
"build:species-states": "node scripts/emit-species-states.js",
```
Then extend the `build` chain by inserting `&& npm run build:species-states` after `build:copy-images` and before `build:pagefind`.

---

## Shared Patterns

### DuckDB Connection Lifecycle
**Source:** `src/_data/families.js` (entire file, 62 lines) and `src/_data/images.js` (entire file, 41 lines)
**Apply to:** `src/_data/taxon.js`, `scripts/emit-species-states.js`

- Always `DuckDBInstance.create(':memory:')` then `db.connect()`
- Always `conn.closeSync()` in ALL code paths (before return and before throw)
- Always `result.getRowObjectsJS()` to get plain JS objects from query results
- Always include `nullstr = ''` in `read_csv()` so blank CSV cells arrive as `NULL`, not `""`

### Script Entry-Point Guard
**Source:** `scripts/build-data.js` lines 228-232
**Apply to:** `scripts/emit-species-states.js`

```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```
Export `main()` (and any testable sub-functions) for test import; guard the CLI invocation separately.

### Post-Vite File Write
**Source:** `scripts/copy-parquet.js` (entire file, 16 lines)
**Apply to:** `scripts/emit-species-states.js`

- Run after `build:eleventy` (which includes the Vite rename step)
- Use `mkdirSync(..., { recursive: true })` before writing
- Write directly to `resolve('_site/...')` — safe because Eleventy + Vite have already completed
- Never rely on `addPassthroughCopy` for files that must survive the Vite rename

---

## Test Patterns

### New Test File: `scripts/build-data.test.js` (extend existing)

**Analog:** `scripts/build-data.test.js` (entire file) — all new tests go in this file per the research validation architecture.

**Unit test pattern** (lines 77-103 — DuckDB in-memory fixture):
```javascript
test('build-data.js: <description>', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`CREATE TABLE records AS SELECT ...`);

  const result = await conn.runAndReadAll(`SELECT DISTINCT ...`);
  const rows = result.getRowObjectsJS();

  assert.strictEqual(rows.length, N, 'description');

  conn.closeSync();
});
```

**Integration test pattern** (lines 154-167 — execSync + file existence check):
```javascript
test('integration: emit-species-states.js produces _site/species-states.json', () => {
  execSync('node scripts/emit-species-states.js', { cwd: ROOT, stdio: 'pipe' });
  assert.ok(
    existsSync(resolve(ROOT, '_site/species-states.json')),
    '_site/species-states.json should exist after emit-species-states.js'
  );
});
```

---

## No Analog Found

All three files have close analogs. No files require fallback to research-only patterns.

---

## Metadata

**Analog search scope:** `src/_data/`, `scripts/`
**Files scanned:** 5 (families.js, images.js, build-data.js, copy-parquet.js, copy-images.js) + package.json + build-data.test.js
**Pattern extraction date:** 2026-04-20
