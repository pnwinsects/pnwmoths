# Phase 17: Migrate Full Species Data from Legacy Database - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 4 (2 new scripts, 2 replaced data files)
**Analogs found:** 3 / 4 (data/species.csv and data/records.csv have no script analog — they are output artifacts)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/migrate-species.js` | utility (migration script) | transform / file-I/O | `scripts/migrate-images.js` | exact (same role, same file-I/O + transform pattern) |
| `scripts/migrate-species.test.js` | test | request-response | `scripts/build-data.test.js` | exact (same test framework, same execSync + assertion style) |
| `data/species.csv` | data artifact | — | `data/species.csv` (current stub) | n/a — replaced, not scripted |
| `data/records.csv` | data artifact | — | `data/records.csv` (current stub) | n/a — replaced, not scripted |

---

## Pattern Assignments

### `scripts/migrate-species.js` (utility / migration, file-I/O + transform)

**Analog:** `scripts/migrate-images.js`

**Imports pattern** (`migrate-images.js` lines 17–23):
```javascript
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
```

For `migrate-species.js` use the synchronous read variant (dump is read once via `readFileSync`) and drop `execFileSync`/`readdir`:
```javascript
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
```

**Constants / env-override pattern** (`migrate-images.js` lines 25–44):
```javascript
const DEFAULT_MOTHS_SOURCE = '/Users/rainhead/dev/...';
const MOTHS_SOURCE = process.env.MOTHS_SOURCE ?? DEFAULT_MOTHS_SOURCE;
const DRY_RUN = process.env.DRY_RUN === '1';
```

Apply the same pattern for `migrate-species.js`:
```javascript
const DEFAULT_DUMP_PATH =
  '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/root/pnwmoths-mysqldump--20210201-123033.sql';
const DEFAULT_SPECIESIMAGE_CSV =
  '/Users/rainhead/dev/pnwinsects-app/species_speciesimage.csv';
const DUMP_PATH = process.env.DUMP_PATH ?? DEFAULT_DUMP_PATH;
const SPECIESIMAGE_CSV = process.env.SPECIESIMAGE_CSV ?? DEFAULT_SPECIESIMAGE_CSV;
```

**Graceful missing-source check** (`migrate-images.js` lines 105–108):
```javascript
if (!existsSync(MOTHS_SOURCE)) {
  console.warn('[migrate-images] Moths source not found — skipping');
  process.exit(0);
}
```

Apply same guard for `DUMP_PATH` existence before attempting to read 634 MB.

**CSV parse with `relax_column_count`** (`migrate-images.js` lines 122–133):
```javascript
const photographerRows = parse(photographerRaw, {
  skip_empty_lines: true,
  relax_column_count: true,
  from_line: 2,
});
for (const row of photographerRows) {
  const id = row[0];
  const name = row.slice(1).join(',').trim();
  photographerById.set(String(id), name);
}
```

Use `columns: true` for the speciesimage CSV since the column names are stable:
```javascript
const speciesImageRows = parse(speciesImageRaw, { columns: true, skip_empty_lines: true });
```

**Slug derivation from image filename** (`migrate-images.js` lines 64–71, 80–82):
```javascript
function parseMotFilename(fname) {
  const match = fname.match(/^([A-Z][a-z]+) ([a-z]+)-/);
  if (!match) {
    console.warn(`[migrate-images] Skipping unparseable filename: ${fname}`);
    return null;
  }
  return { genus: match[1], species: match[2] };
}

function toSlug(genus, species) {
  return `${genus}-${species}`.toLowerCase();
}
```

In `migrate-species.js`, combine these into one helper that takes the `image` field (with `moths/` prefix):
```javascript
function slugFromImageField(imageField) {
  const fname = imageField.startsWith('moths/') ? imageField.slice(6) : imageField;
  const match = fname.match(/^([A-Z][a-z]+) ([a-z]+)-/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`.toLowerCase();
}
```

**CSV output with explicit column order** (`migrate-images.js` lines 300–335):
```javascript
const COLUMNS = ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen', 'navigational'];
// ...
const csvOut = stringify(outputRows, { header: true, columns: COLUMNS });
await writeFile('data/images.csv', csvOut);
console.log(`[migrate-images] Wrote ${outputRows.length} rows to data/images.csv`);
```

Apply same pattern for both output files. Column orders come from `build-data.js` `validateCsv` calls (lines 73–91):
```javascript
// species.csv columns (from build-data.js line 73):
const SPECIES_COLUMNS = ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species', 'subfamily'];

// records.csv columns (from build-data.js lines 88–91):
const RECORDS_COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes'
];
```

**Progress logging pattern** (`migrate-images.js` lines 251–266):
```javascript
console.log(`[migrate-images] Uploading ${total} files via bunny.net HTTP API...`);
// ...
if (uploaded % 100 === 0) console.log(`[migrate-images] ${uploaded}/${total} uploaded`);
console.log(`[migrate-images] Done: ${uploaded} uploaded`);
```

Use `[migrate-species]` prefix consistently for all `console.log` and `console.warn` calls.

**Main guard / entry point** (`migrate-images.js` lines 340–344):
```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

Copy this exactly. Also export `main` (as `migrate-images.js` does implicitly via the `async function main()` declaration) so tests can import it.

**Error handling / warn-and-skip pattern** (`migrate-images.js` lines 68–70):
```javascript
if (!match) {
  console.warn(`[migrate-images] Skipping unparseable filename: ${fname}`);
  return null;
}
```

Use `console.warn` for per-row skips; use `console.error` + `process.exit(1)` only for fatal missing inputs (missing dump file).

---

### `scripts/migrate-species.test.js` (test, integration smoke)

**Analog:** `scripts/build-data.test.js`

**Imports pattern** (`build-data.test.js` lines 1–13):
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
```

Copy this block verbatim. `ROOT` is needed for resolving paths to the real data files.

**Integration test with `execSync`** (`build-data.test.js` lines 154–167):
```javascript
test('integration: build-data.js with good CSV produces Parquet files', () => {
  execSync('node scripts/build-data.js', { cwd: ROOT, stdio: 'pipe' });

  assert.ok(
    existsSync(resolve(ROOT, 'data/parquet/acronicta-americana/records.parquet')),
    'data/parquet/acronicta-americana/records.parquet should exist'
  );
});
```

For the migration smoke test, adapt this to run `migrate-species.js` and then check row counts in the output CSVs:
```javascript
test('integration: migrate-species.js produces species.csv with expected row count', () => {
  execSync('node scripts/migrate-species.js', { cwd: ROOT, stdio: 'pipe' });
  const rows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), { columns: true, skip_empty_lines: true });
  assert.ok(rows.length >= 1300, `species.csv should have ≥1300 rows, got ${rows.length}`);
});
```

**Negative test with stderr capture** (`build-data.test.js` lines 169–211):
```javascript
try {
  execSync(`node ${wrapperScript}`, {
    cwd: tmpDir,
    timeout: 30000,
    stdio: 'pipe'
  });
} catch (err) {
  threw = true;
  stderrOutput = err.stderr ? err.stderr.toString() : '';
}
assert.ok(threw, 'build-data.js should exit non-zero for bad data');
assert.ok(
  stderrOutput.includes('Validation failed'),
  `stderr should contain "Validation failed", got: ${stderrOutput}`
);
```

Use the same try/catch + `err.stderr.toString()` pattern when testing that `migrate-species.js` exits non-zero when the dump file is absent.

**Wrapper script for isolated cwd** (`build-data.test.js` lines 182–188):
```javascript
const wrapperScript = resolve(ROOT, 'scripts/build-data.js');  // or a temp .mjs
writeFileSync(wrapperScript, [
  `import { main } from '${scriptPath}';`,
  `process.chdir('${tmpDir}');`,
  `main().catch(err => { console.error(err.message); process.exit(1); });`
].join('\n'));
```

For `migrate-species.test.js`, pass env vars (e.g. `DUMP_PATH`) instead of `process.chdir()`, since the migration script reads from absolute paths, not from `cwd`.

**Unit assertion on CSV column presence** (pattern from `build-data.test.js` lines 17–23):
```javascript
test('validateCsv: species.csv with correct columns does not throw', () => {
  validateCsv(
    resolve(ROOT, 'data/species.csv'),
    ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species', 'subfamily']
  );
});
```

For the migration test, import `validateCsv` from `build-data.js` to check that the newly written files have all required columns:
```javascript
import { validateCsv } from '../scripts/build-data.js';
// ...
test('migrate-species: species.csv has all required columns', () => {
  validateCsv(resolve(ROOT, 'data/species.csv'), SPECIES_COLUMNS);
});
```

**`npm test` registration** (`package.json` line `"test"`):
```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js"
```

After creating `migrate-species.test.js`, add it to this list. The smoke tests are not auto-discovered — they must be listed explicitly.

---

### `data/species.csv` and `data/records.csv` (data artifacts)

**No script analog** — these are output files written by `migrate-species.js`. Their schema is defined by the `validateCsv` calls in `build-data.js` (lines 73 and 88–91) and the DuckDB `read_csv` schema (lines 97–137).

**Required columns for species.csv** (`build-data.js` line 73):
```
id, genus, species, common_name, noc_id, authority, family, similar_species, subfamily
```

**Required columns for records.csv** (`build-data.js` lines 88–91):
```
species_slug, record_type, latitude, longitude, state, county,
locality, elevation_ft, year, month, day, collector, collection, notes
```

**Stub structure to understand** — current `data/species.csv` (11 rows) and current `data/records.csv` (667 rows) will be fully replaced. The stub structure matches the required schema exactly, so no schema change is needed in `build-data.js`.

---

## Shared Patterns

### File-I/O: Reading Binary-Safe Source File
**Source:** RESEARCH.md Pattern 1 + Standard Stack section
**Apply to:** `scripts/migrate-species.js`

```javascript
import { readFileSync } from 'node:fs';
const dump = readFileSync(DUMP_PATH, 'latin1');  // binary-safe; UTF-8 would throw on cmsplugin_text
const pnwStart = dump.indexOf('USE `pnwmoths`;');
const pnwEnd   = dump.indexOf('USE `pnwsawflies`;');
const pnwSection = dump.slice(pnwStart, pnwEnd);
```

### Logging Prefix Convention
**Source:** `scripts/migrate-images.js` throughout
**Apply to:** `scripts/migrate-species.js`

All console output uses `[migrate-species]` prefix:
- `console.log('[migrate-species] Loaded X rows ...')`
- `console.warn('[migrate-species] Dump not found — exiting')`
- `console.error('[migrate-species] Fatal: ...')`

### CSV Write with Explicit Column Order
**Source:** `scripts/migrate-images.js` lines 300–337
**Apply to:** Both CSV output calls in `migrate-species.js`

```javascript
const csvOut = stringify(outputRows, { header: true, columns: COLUMNS });
writeFileSync('data/species.csv', csvOut, 'utf8');
console.log(`[migrate-species] Wrote ${outputRows.length} rows to data/species.csv`);
```

Note: use synchronous `writeFileSync` (not `await writeFile`) since the migration script is synchronous overall once the dump is read.

### Test Framework and Root Resolution
**Source:** `scripts/build-data.test.js` lines 1–13
**Apply to:** `scripts/migrate-species.test.js`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
```

### ESM Guard Pattern
**Source:** `scripts/migrate-images.js` lines 340–344 and `scripts/build-data.js` lines 228–232
**Apply to:** `scripts/migrate-species.js`

```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

---

## Update Required: `build-data.test.js` After Migration

**Pitfall 7 from RESEARCH.md** — two integration tests in `build-data.test.js` hard-code slug names from the stub data (lines 158–166):

```javascript
assert.ok(
  existsSync(resolve(ROOT, 'data/parquet/acronicta-americana/records.parquet')),
  'data/parquet/acronicta-americana/records.parquet should exist'
);
assert.ok(
  existsSync(resolve(ROOT, 'data/parquet/hyles-lineata/records.parquet')),
  'data/parquet/hyles-lineata/records.parquet should exist'
);
```

Both `acronicta-americana` and `hyles-lineata` exist in the full DB (they were in the stub because they are real PNW species), so these assertions will likely still pass after migration. However, the test at line 412 checks `_site/species-states.json` structure, which is data-driven. Verify `npm test` passes after migration before modifying these tests.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| SQL dump regex parsing (inline in migrate-species.js) | utility | transform | No existing regex-based SQL parser in codebase; patterns come from RESEARCH.md Code Examples section |

---

## Metadata

**Analog search scope:** `scripts/`, `data/`, `src/`
**Files scanned:** `migrate-images.js`, `build-data.js`, `build-data.test.js`, `data/species.csv`, `data/records.csv`, `package.json`
**Pattern extraction date:** 2026-04-22
