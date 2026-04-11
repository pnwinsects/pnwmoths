# Phase 1: Data Pipeline Foundation - Research

**Researched:** 2026-04-11
**Domain:** DuckDB build-time data pipeline, Eleventy static site generation, Parquet export, CSV validation
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Species list stored in CSV: genus, species, common_name, noc_id, authority | CSV schema design covered; csv-parse for validation |
| DATA-02 | Occurrence records CSV: ~100k rows, ~15MB uncompressed, ~2-3MB gzipped | DuckDB read_csv handles this scale; field list documented |
| DATA-03 | Pre-build script loads occurrence CSV into DuckDB, exports per-species Parquet files | DuckDB COPY TO parquet pattern documented; @duckdb/node-api is the correct package |
| DATA-04 | Eleventy data files query DuckDB at build time; per-species data NOT embedded inline | Async Eleventy data files supported; DuckDB query patterns documented |
| DATA-05 | Build fails with clear error if CSV is malformed (encoding, missing fields, invalid values) | DuckDB read_csv default strict mode documented; validation query patterns covered |
| DATA-06 | Per-species Parquet files generated at build time and deployed alongside HTML pages | DuckDB COPY TO with PARTITION_BY pattern; hyparquet client-side consumption confirmed |
| SPEC-01 | Eleventy generates one HTML page per species (~700 pages) from a single template via pagination | Eleventy pagination pattern documented; `pages-from-data` is canonical approach |
| SPEC-05 | Species pages use lowercase, hyphenated URL slugs (e.g. `/species/acronicta-americana/`) | Slug generation pattern covered; case-sensitivity pitfall flagged |
</phase_requirements>

---

## Summary

Phase 1 establishes the full build pipeline: CSV source data → DuckDB import and validation → Parquet export per species → Eleventy renders 700 HTML stub pages. This is a greenfield project; the working directory has no `package.json` yet.

The key design decision already made in PROJECT.md is to use DuckDB (not SQLite) for build-time queries because of the analytical workload (100k+ row occurrence joins). The `duckdb` npm package is now deprecated as of DuckDB 1.5 (released early 2026); the correct package is `@duckdb/node-api` from the Node Neo client. This is entirely async/promise-based — unlike `better-sqlite3`, there is no synchronous API. Eleventy data files support async functions natively (via `async function` + `await`), so this is not a blocker, but it does change how data files are written.

Parquet export uses DuckDB's `COPY (SELECT ...) TO 'file.parquet' (FORMAT parquet)` SQL syntax from within the pre-build script. Client-side consumption uses `hyparquet` (pure JavaScript, no dependencies, works via HTTP range requests in the browser). The two are decoupled: DuckDB writes the Parquet files; hyparquet reads them in the browser. Phase 1 does not implement client-side consumption — it only produces the Parquet files.

**Primary recommendation:** Use `@duckdb/node-api` (not the deprecated `duckdb` package) for all DuckDB operations. Implement the pre-build script as a standalone Node.js script invoked via `npm run build:data` before Eleventy runs. Validate CSV strictness using DuckDB's default error-on-malformed behavior plus explicit SQL `CHECK`-style queries after import.

---

## Project Constraints (from CLAUDE.md)

The global CLAUDE.md contains two relevant directives:

1. **Node version in `.nvmrc`**: Specify the Node.js version in `.nvmrc` at the project root. No `.nvmrc` exists yet — Wave 0 must create it. The machine is running Node v25.9.0; the project should pin to a stable LTS version (Node 22 LTS is recommended for 2025-2026).

2. **Documentation**: Keep READMEs concise, focus on principles. This affects what the build script comments should look like.

No project-level `CLAUDE.md` exists.

---

## Standard Stack

### Core (Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@11ty/eleventy` | 3.1.5 | Static site generator | Official; ESM-first in v3; 700-page pagination is canonical use case |
| `@duckdb/node-api` | 1.5.1-r.2 | DuckDB queries at build time | Official DuckDB Node Neo client; `duckdb` package deprecated as of v1.5 |
| `csv-parse` | 6.2.1 | CSV parsing and validation | Most downloaded Node CSV library; synchronous API via `csv-parse/sync` |

**Version verification:** [VERIFIED: npm registry — checked 2026-04-11]
- `@11ty/eleventy`: `3.1.5` (published)
- `@duckdb/node-api`: `1.5.1-r.2` (published 2 hours before research; "r.2" suffix = release candidate 2 of DuckDB 1.5.1)
- `csv-parse`: `6.2.1`

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hyparquet` | 1.25.6 | Client-side Parquet reader | DATA-06 — browser reads per-species Parquet; only referenced in Phase 1 output plan, consumed in Phase 3 |

**Note on `duckdb` (legacy):** The older `duckdb` npm package (v1.4.4) is the last version DuckDB Labs will publish. DuckDB 1.5.x will not release to that package name. [VERIFIED: duckdb.org blog + npm registry — 2026-04-11]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@duckdb/node-api` | `better-sqlite3` | SQLite is synchronous and simpler but lacks analytical query performance for 100k+ rows; DuckDB reads CSV directly without a separate import step |
| `@duckdb/node-api` | legacy `duckdb` package | Legacy package is deprecated and will not receive DuckDB 1.5 binaries |
| `csv-parse` | DuckDB `read_csv` only | DuckDB `read_csv` handles most validation; `csv-parse` is still useful for pre-flight encoding checks before DuckDB import |

### Installation

```bash
npm init -y
npm install @11ty/eleventy @duckdb/node-api csv-parse
# hyparquet is client-side; install when Phase 3 begins
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 scope)

```
pnwmoths/
├── .nvmrc                     # Node version pin (Wave 0)
├── package.json
├── eleventy.config.js         # ESM config (not .eleventy.js)
├── data/
│   ├── species.csv            # DATA-01: genus, species, common_name, noc_id, authority
│   └── records.csv            # DATA-02: species_id, record_type, lat, long, state, county, locality, elevation, year, month, day, collector, collection, notes
├── scripts/
│   └── build-data.js          # DATA-03: imports CSVs → DuckDB → exports per-species Parquet
├── src/
│   ├── _data/
│   │   └── species.js         # DATA-04: async Eleventy data file, queries DuckDB
│   └── species/
│       └── species.njk        # SPEC-01: single template → 700 pages via pagination
└── _site/                     # Eleventy output
    └── species/
        └── acronicta-americana/
            ├── index.html     # SPEC-05: lowercase hyphenated slug
            └── records.parquet  # DATA-06: per-species Parquet alongside HTML
```

### Pattern 1: Pre-build Script (`scripts/build-data.js`)

**What:** A standalone Node.js script that (1) validates and imports CSVs into DuckDB, (2) runs validation queries, (3) exports per-species Parquet files.

**When to use:** Runs as `npm run build:data` before `eleventy`. The script is the sole writer to DuckDB and the sole producer of Parquet files.

```javascript
// scripts/build-data.js
// Source: @duckdb/node-api docs + DuckDB Parquet export docs
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();

// 1. Import CSVs — DuckDB strict mode (default) will throw on malformed rows
await conn.run(`
  CREATE TABLE species AS
  SELECT * FROM read_csv('data/species.csv',
    header = true,
    columns = {
      'id': 'INTEGER',
      'genus': 'VARCHAR',
      'species': 'VARCHAR',
      'common_name': 'VARCHAR',
      'noc_id': 'VARCHAR',
      'authority': 'VARCHAR'
    }
  )
`);

await conn.run(`
  CREATE TABLE records AS
  SELECT * FROM read_csv('data/records.csv',
    header = true,
    columns = {
      'species_id': 'INTEGER',
      'record_type': 'VARCHAR',
      'latitude': 'DOUBLE',
      'longitude': 'DOUBLE',
      'state': 'VARCHAR',
      'county': 'VARCHAR',
      'locality': 'VARCHAR',
      'elevation': 'INTEGER',
      'year': 'INTEGER',
      'month': 'INTEGER',
      'day': 'INTEGER',
      'collector': 'VARCHAR',
      'collection': 'VARCHAR',
      'notes': 'VARCHAR'
    }
  )
`);

// 2. Validate: required fields, coordinate bounds
const badRecords = await conn.runAndReadAll(`
  SELECT species_id, latitude, longitude, record_type
  FROM records
  WHERE species_id IS NULL
     OR latitude IS NULL OR longitude IS NULL
     OR latitude < 42.0 OR latitude > 52.0
     OR longitude < -125.0 OR longitude > -110.0
     OR record_type NOT IN ('specimen', 'photograph', 'literature', 'field notes')
`);
if (badRecords.rows.length > 0) {
  console.error('Validation failed — invalid records:');
  console.error(badRecords.rows);
  process.exit(1);
}

// 3. Export per-species Parquet files
const species = await conn.runAndReadAll('SELECT id, genus, species FROM species');
mkdirSync('_site/species', { recursive: true });

for (const sp of species.rows) {
  const slug = `${sp.genus}-${sp.species}`.toLowerCase().replace(/\s+/g, '-');
  const outDir = `_site/species/${slug}`;
  mkdirSync(outDir, { recursive: true });

  await conn.run(`
    COPY (
      SELECT * FROM records WHERE species_id = ${sp.id}
    ) TO '${outDir}/records.parquet'
    (FORMAT parquet, COMPRESSION zstd)
  `);
}

await conn.close();
```

**Note:** `@duckdb/node-api` is fully async. All operations require `await`. There is no synchronous API. [VERIFIED: duckdb.org blog 2024-12-18]

### Pattern 2: Async Eleventy Data File

**What:** `src/_data/species.js` queries DuckDB asynchronously and returns the species array for Eleventy's pagination.

```javascript
// src/_data/species.js
// Source: Eleventy JS Data Files docs (11ty.dev/docs/data-js/)
import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv', header = true)
  `);

  const result = await conn.runAndReadAll(`
    SELECT
      id,
      genus,
      species,
      common_name,
      noc_id,
      authority,
      lower(genus || '-' || species) AS slug
    FROM species
    ORDER BY genus, species
  `);

  await conn.close();
  return result.rows;
}
```

**Key fact:** Eleventy `_data/` files support `async function` natively — Eleventy awaits the returned Promise automatically. [VERIFIED: 11ty.dev/docs/data-js/]

### Pattern 3: Eleventy Pagination for Species Pages

**What:** A single template generates all 700 species pages via Eleventy's built-in pagination.

```nunjucks
{# src/species/species.njk #}
---
pagination:
  data: species
  size: 1
  alias: sp
permalink: "species/{{ sp.slug }}/index.html"
eleventyComputed:
  title: "{{ sp.genus }} {{ sp.species }}"
---
<h1>{{ sp.genus }} {{ sp.species }}</h1>
<p>{{ sp.common_name }}</p>
<p>NOC: {{ sp.noc_id }}</p>
```

[CITED: 11ty.dev/docs/pages-from-data/]

### Pattern 4: CSV Encoding Validation (Pre-DuckDB)

DuckDB defaults to UTF-8. If input CSV is Windows-1252, DuckDB will throw an error at the invalid byte — which is the right behavior (DATA-05). However, the error message from DuckDB may be cryptic. A pre-flight Node.js check with `csv-parse` can produce a more actionable error:

```javascript
// In build-data.js, before DuckDB import:
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

function validateCsv(filePath, requiredColumns) {
  let raw;
  try {
    raw = readFileSync(filePath);
  } catch (e) {
    throw new Error(`Cannot read ${filePath}: ${e.message}`);
  }

  // Fail on non-UTF-8 bytes
  try {
    raw.toString('utf8');
  } catch (e) {
    throw new Error(`${filePath} contains non-UTF-8 bytes. Export as CSV UTF-8, not CSV (Windows).`);
  }

  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  if (rows.length === 0) {
    throw new Error(`${filePath} is empty or has no data rows.`);
  }

  const headers = Object.keys(rows[0]);
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      throw new Error(`${filePath} is missing required column: "${col}". Found: ${headers.join(', ')}`);
    }
  }

  return rows;
}
```

### Anti-Patterns to Avoid

- **Do not use the `duckdb` npm package:** It is deprecated and will not receive DuckDB 1.5 binaries. [VERIFIED: duckdb.org + npm registry]
- **Do not use `better-sqlite3` for this project:** SQLite is not the chosen tool; DuckDB is. The prior research documents at `.planning/research/STACK.md` pre-dated the DuckDB decision being confirmed.
- **Do not write synchronous wrappers around `@duckdb/node-api`:** There is no synchronous API. Use async/await.
- **Do not embed occurrence JSON inline in HTML pages:** DATA-04 explicitly states per-species occurrence data is NOT embedded inline. Per-species data goes in Parquet files.
- **Do not call DuckDB from Eleventy's pagination template (per-page):** Query DuckDB in `_data/` files (runs once at build start), not in computed data per page.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet file writing | Custom binary serializer | DuckDB `COPY TO ... (FORMAT parquet)` | Parquet is complex binary with row groups, column encodings, metadata; DuckDB handles all of this correctly |
| CSV parsing with type coercion | Manual string split + Number() | `csv-parse` with `columns: true` | Handles quoting, multi-line fields, BOM, encoding edge cases; 1.4M weekly downloads |
| Slug generation from genus+species | Custom regex | `toLowerCase().replace(/\s+/g, '-')` is sufficient | Simple rule; no library needed |
| 700-page generation loop | Custom file-writing script | Eleventy pagination | Eleventy handles incremental builds, template inheritance, data cascade; don't re-implement |

**Key insight:** Parquet is a columnar binary format with multiple encoding options, compression codecs, and a metadata footer. Using DuckDB's `COPY TO` is the only sane approach for a build pipeline.

---

## Common Pitfalls

### Pitfall 1: Using the deprecated `duckdb` npm package

**What goes wrong:** `npm install duckdb` installs the legacy package (v1.4.4). It will stop receiving updates. DuckDB 1.5 binaries are only released to `@duckdb/node-api`. The legacy package has a callback-based API (not Promises), making it awkward with async Eleventy data files.

**Why it happens:** The package name `duckdb` is the obvious npm search result; the new package name is non-obvious.

**How to avoid:** Always install `@duckdb/node-api`. Verify with `npm view duckdb deprecated` — it should show a deprecation notice.

**Warning signs:** `require('duckdb')` or `import duckdb from 'duckdb'` in any build script.

### Pitfall 2: Parquet files written before `_site/` directories exist

**What goes wrong:** The pre-build script runs `COPY ... TO '_site/species/acronicta-americana/records.parquet'` but `_site/species/acronicta-americana/` doesn't exist yet. DuckDB throws `Error: IO Error: failed to open file`.

**Why it happens:** The Parquet export loop runs before Eleventy has created the output directory structure.

**How to avoid:** In the pre-build script, call `mkdirSync(outDir, { recursive: true })` before each `COPY TO`. Alternatively, export Parquet to a staging directory (e.g., `data/parquet/`) and have Eleventy's passthrough copy move them to `_site/`.

**Better approach:** Export to `data/parquet/[slug].parquet` during `build:data`, then configure Eleventy passthrough copy to mirror `data/parquet/` into `_site/species/[slug]/`. This decouples the DuckDB script from the Eleventy output directory.

### Pitfall 3: DuckDB's async API in Eleventy data files causes ordering issues

**What goes wrong:** If `_data/species.js` opens a DuckDB connection and does not close it before Eleventy pagination runs, and another data file also opens DuckDB, there can be file lock contention or race conditions if using a file-based database.

**Why it happens:** DuckDB file databases allow only one writer at a time. Multiple data files opening the same `.duckdb` file can conflict.

**How to avoid:** Use DuckDB in `:memory:` mode in data files (import CSV fresh each build). Memory mode has no file locking. Alternatively, use a single shared connection created in `eleventy.config.js` via the `before` event and closed in the `after` event — but this requires passing the connection via `addGlobalData`.

**Recommended:** Use `:memory:` mode. At 100k rows and 700 species, DuckDB loads the data in milliseconds.

### Pitfall 4: `eleventyComputed` does not see pagination alias on first pass

**What goes wrong:** Using `eleventyComputed` in a directory data file (`.11tydata.js`) to access `data.sp` (the pagination alias) can fail on the first evaluation pass — Eleventy may pass stub data before the pagination alias is populated.

**Why it happens:** Eleventy evaluates computed data before the pagination data is fully available in some edge cases (see GitHub issue #2365).

**How to avoid:** Return `[]` or `null` gracefully when `data.sp` is undefined: `occurrences: (data) => data.sp ? recordsBySpecies[data.sp.id] ?? [] : []`. Since Phase 1 is HTML stubs without occurrence data inline (DATA-04 forbids it), this is not critical for Phase 1 but will matter in Phase 3.

### Pitfall 5: Slug case sensitivity — macOS vs. Linux

**What goes wrong:** On macOS (case-insensitive filesystem), a file at `_site/species/Acronicta-americana/index.html` and a link to `/species/acronicta-americana/` both work locally. On GitHub Pages (Linux, case-sensitive), the link is a 404.

**Why it happens:** Genus names are capitalized (Acronicta); slug generation must explicitly lowercase.

**How to avoid:** Generate slugs with `(genus + '-' + species).toLowerCase()` everywhere. Enforce this in the DuckDB query that returns species data: `lower(genus || '-' || species) AS slug`.

### Pitfall 6: Excel encoding corruption on CSV input

**What goes wrong:** Species authority names (e.g., "Hübner" with ü) and locality strings saved from Excel on Windows produce Windows-1252 encoding. DuckDB's default UTF-8 mode will throw `Invalid Input Error: Invalid unicode` on the corrupted bytes.

**Why it happens:** Scientists use Excel. Windows Excel saves CSV in Windows-1252 by default on older versions.

**How to avoid:** Pre-flight UTF-8 check using Node.js `Buffer.from(raw).toString('utf8')` before passing to DuckDB. Emit an actionable error: "records.csv contains non-UTF-8 bytes. If you edited this in Excel on Windows, re-save as CSV UTF-8 (not 'CSV Windows')." DuckDB's encodings extension can convert Latin-1 but has known bugs with Windows-1252; the iconv CLI is more reliable for one-off conversions.

### Pitfall 7: Per-species Parquet export is slow if done row-by-row in Node.js

**What goes wrong:** A loop in Node.js that queries DuckDB for each species separately (`SELECT * FROM records WHERE species_id = ?`) and writes Parquet one file at a time will take seconds for 700 species.

**Why it happens:** 700 round-trips to DuckDB plus 700 file writes.

**How to avoid:** Use DuckDB's `COPY ... TO ... (FORMAT parquet, PARTITION_BY (species_id))` to produce all per-species Parquet files in a single SQL statement. DuckDB handles the partitioning internally:
```sql
COPY (SELECT * FROM records) TO 'data/parquet/'
(FORMAT parquet, PARTITION_BY (species_id), COMPRESSION zstd);
```
This produces `data/parquet/species_id=101/data_0.parquet` etc. The directory naming uses Hive partitioning format. Eleventy passthrough copy can be configured to flatten or rename these. Alternatively, loop in Node.js but use a batch query; 700 iterations of `COPY` in Node.js takes ~1-2 seconds total (each is fast), which is acceptable.

---

## Code Examples

### DuckDB Node Neo: Connect, Query, Close

```javascript
// Source: duckdb.org/2024/12/18/duckdb-node-neo-client
import { DuckDBInstance } from '@duckdb/node-api';

const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();

await conn.run('CREATE TABLE t AS SELECT 1 AS id, 42.0 AS val');
const result = await conn.runAndReadAll('SELECT * FROM t');
console.log(result.rows); // [{ id: 1, val: 42.0 }]

await conn.close();
```

### DuckDB: Read CSV with Explicit Schema

```sql
-- Source: duckdb.org/docs/current/data/csv/overview
CREATE TABLE species AS
SELECT * FROM read_csv('data/species.csv',
  header = true,
  columns = {
    'id': 'INTEGER',
    'genus': 'VARCHAR',
    'species': 'VARCHAR',
    'common_name': 'VARCHAR',
    'noc_id': 'VARCHAR',
    'authority': 'VARCHAR'
  }
);
```

### DuckDB: Export to Parquet (per-species, partitioned)

```sql
-- Source: duckdb.org/docs/current/guides/file_formats/parquet_export
COPY (SELECT * FROM records)
TO 'data/parquet/'
(FORMAT parquet, PARTITION_BY (species_id), COMPRESSION zstd);
-- Produces: data/parquet/species_id=101/data_0.parquet, etc.
```

Or per-species loop approach:
```sql
COPY (SELECT * FROM records WHERE species_id = 101)
TO '_site/species/acronicta-americana/records.parquet'
(FORMAT parquet, COMPRESSION zstd);
```

### Eleventy Pagination from Data Array

```nunjucks
{# Source: 11ty.dev/docs/pages-from-data/ #}
---
pagination:
  data: species
  size: 1
  alias: sp
permalink: "species/{{ sp.slug }}/index.html"
---
<h1>{{ sp.genus }} {{ sp.species }}</h1>
<p>Common name: {{ sp.common_name }}</p>
<p>NOC: {{ sp.noc_id }}</p>
<p>Authority: {{ sp.authority }}</p>
```

### hyparquet: Load Parquet in the Browser (Phase 3 reference)

```javascript
// Source: github.com/hyparam/hyparquet README
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

const url = '/species/acronicta-americana/records.parquet';
const file = await asyncBufferFromUrl({ url });
const records = await parquetReadObjects({ file });
// records: [{ species_id: 101, latitude: 47.6, longitude: -122.3, ... }, ...]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `duckdb` npm package | `@duckdb/node-api` (Node Neo client) | DuckDB 1.5 (early 2026) | `duckdb` will receive no more updates; migrate to `@duckdb/node-api` |
| Synchronous SQLite builds | Async DuckDB builds | n/a (DuckDB never had sync API) | Eleventy data files must use `async function` |
| Inline occurrence JSON in HTML | Per-species Parquet files loaded client-side | Project decision | Keeps HTML pages small; async load via hyparquet |
| CommonJS Eleventy configs | ESM-first `eleventy.config.js` | Eleventy 3.0 (Oct 2024) | New projects should use `"type": "module"` in package.json |

**Deprecated/outdated:**
- `duckdb` npm package: Deprecated as of DuckDB 1.5 (early 2026). Last release: v1.4.4.
- `better-sqlite3` for this project: Not wrong in general, but not the chosen tool. DuckDB provides SQL-level CSV import without a separate ETL step.
- `csv-parser` (npm): Deprecated 2023. Use `csv-parse` instead.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Parquet files should live at `_site/species/[slug]/records.parquet` alongside `index.html` | Architecture | Client-side URL path would differ; hyparquet URL must match deployed path |
| A2 | `@duckdb/node-api` `runAndReadAll()` returns `{ rows: [...] }` with row objects | Code Examples | Code pattern would need adjustment; verify against actual API |
| A3 | DuckDB PARTITION_BY produces Hive-format directories (`species_id=101/data_0.parquet`) | Code Examples | Passthrough copy logic may need adjustment if format differs |
| A4 | Node 22 LTS is appropriate to pin in `.nvmrc` | Project setup | Could cause compatibility issues if a dependency requires higher |

---

## Open Questions

1. **Parquet deployment path: alongside HTML vs. flat directory**
   - What we know: DATA-06 says "deployed alongside HTML pages"
   - What's unclear: Whether "alongside" means same directory (`_site/species/[slug]/records.parquet`) or a parallel flat structure (`_site/data/[slug].parquet`)
   - Recommendation: Use same-directory approach (matches DATA-06 wording); hyparquet client URL is then `/species/[slug]/records.parquet`

2. **CSV sample data: does it exist yet?**
   - What we know: No `data/` directory exists in the project yet
   - What's unclear: Will representative sample CSVs (even 10-row stubs) be provided, or must the plan include creating them?
   - Recommendation: Plan Wave 0 should create stub `data/species.csv` and `data/records.csv` with the correct schema and ~5 rows each to enable build testing without real data

3. **Eleventy config format: `eleventy.config.js` vs `.eleventy.js`**
   - What we know: Eleventy 3.x prefers `eleventy.config.js` with ESM; `"type": "module"` in package.json
   - What's unclear: Whether the project has any preference
   - Recommendation: Use `eleventy.config.js` with `export default` + `"type": "module"` in package.json

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All JS | Yes | v25.9.0 | — |
| npm | Package install | Yes | 11.12.1 | — |
| DuckDB CLI | Manual data inspection | Yes | v1.5.1 | Not required for build |
| Git | Version control | [ASSUMED] | — | — |

**Missing dependencies with no fallback:** None detected for Phase 1.

**Note:** `@duckdb/node-api` uses prebuilt native binaries distributed via npm. On Apple Silicon (darwin-arm64) and Linux x64 (GitHub Actions runner), prebuilt binaries are available. No native compilation step is required. [CITED: github.com/duckdb/duckdb-node-neo]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — Wave 0 must establish |
| Config file | `none — see Wave 0` |
| Quick run command | `node --test src/**/*.test.js` (Node.js built-in test runner, no install required) |
| Full suite command | `node --test` |

Node.js 22 LTS includes a built-in test runner (`node:test`) — no Jest/Vitest install required for a build pipeline with no UI components. This keeps dependencies minimal.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | species.csv schema validates correctly | unit | `node --test scripts/build-data.test.js` | Wave 0 |
| DATA-02 | records.csv with 100k rows imports without error | integration | `node scripts/build-data.js && echo OK` | Wave 0 |
| DATA-03 | Pre-build script produces Parquet files in output | integration | `node scripts/build-data.js && ls data/parquet/` | Wave 0 |
| DATA-04 | DuckDB data file returns species array | unit | `node --test src/_data/species.test.js` | Wave 0 |
| DATA-05 | Malformed CSV causes exit(1) with message | unit | `node --test scripts/build-data.test.js` | Wave 0 |
| DATA-06 | Parquet files exist alongside HTML after full build | integration | `npm run build && ls _site/species/*/records.parquet` | Wave 0 |
| SPEC-01 | `npm run build` produces ~700 HTML files | integration | `npm run build && find _site/species -name index.html \| wc -l` | Wave 0 |
| SPEC-05 | All species URLs are lowercase hyphenated | unit | `node --test scripts/slug.test.js` | Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test` (unit tests only, < 5s)
- **Per wave merge:** `npm run build` integration check
- **Phase gate:** Full build produces ~700 HTML files + Parquet files; no errors

### Wave 0 Gaps

- [ ] `data/species.csv` — 5-row stub with correct schema
- [ ] `data/records.csv` — 10-row stub with correct schema
- [ ] `package.json` — with `"type": "module"`, build scripts
- [ ] `.nvmrc` — Node version pin (Node 22 LTS)
- [ ] `scripts/build-data.js` — pre-build script
- [ ] `scripts/build-data.test.js` — unit tests for validation logic
- [ ] `src/_data/species.js` — async DuckDB data file
- [ ] `src/species/species.njk` — pagination template stub
- [ ] `eleventy.config.js` — ESM Eleventy config

---

## Security Domain

Security enforcement is not explicitly disabled in config.json, but Phase 1 is a build-time data pipeline with no network exposure, authentication, or user input. ASVS categories are assessed below for completeness.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Build pipeline; no auth |
| V3 Session Management | No | Static build; no sessions |
| V4 Access Control | No | No runtime permissions |
| V5 Input Validation | Yes — partial | CSV validation in build-data.js; DuckDB strict mode |
| V6 Cryptography | No | No secrets handled |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious CSV injection (formula injection) | Tampering | Not applicable — output is HTML/Parquet, not spreadsheet; no `=CMD` vectors in use |
| Path traversal in species slug generation | Tampering | Slug uses only `genus` and `species` columns; validate these contain only alphanumeric + space characters |
| Malformed data producing incorrect Parquet | Information Disclosure | DuckDB strict mode + explicit column typing; post-import row count validation |

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: npm registry] `@duckdb/node-api` version 1.5.1-r.2, `@11ty/eleventy` 3.1.5, `csv-parse` 6.2.1, `hyparquet` 1.25.6 — checked 2026-04-11
- [CITED: duckdb.org/2024/12/18/duckdb-node-neo-client] — DuckDB Node Neo client announcement; confirms `duckdb` package deprecation
- [CITED: duckdb.org/docs/current/data/parquet/overview] — Parquet COPY TO syntax, compression options
- [CITED: duckdb.org/docs/current/data/csv/reading_faulty_csv_files] — CSV error modes, reject tables
- [CITED: 11ty.dev/docs/data-js/] — Async Eleventy data file support confirmed
- [CITED: 11ty.dev/docs/pages-from-data/] — Pagination template pattern
- [CITED: github.com/hyparam/hyparquet README] — asyncBufferFromUrl, parquetReadObjects API

### Secondary (MEDIUM confidence)

- [CITED: duckdb.org blog + npm] `duckdb` package final release at 1.4.4; no 1.5.x release planned
- [CITED: github.com/duckdb/duckdb-node-neo] — `@duckdb/node-api` is async-only (no synchronous API)
- `.planning/research/STACK.md` — prior project research on Eleventy, csv-parse, Pagefind (cross-referenced)
- `.planning/research/ARCHITECTURE.md` — prior project research on build patterns, data join (cross-referenced)
- `.planning/research/PITFALLS.md` — prior project research on CSV encoding, slug case sensitivity (cross-referenced)

### Tertiary (LOW confidence — ASSUMED, flagged above)

- A2: `runAndReadAll()` return shape `{ rows: [...] }` — [ASSUMED from blog post description; verify with actual package]
- A3: PARTITION_BY Hive directory format — [ASSUMED from DuckDB general docs; verify with actual output]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all package versions verified via npm registry 2026-04-11
- Architecture: HIGH for Eleventy pagination pattern (official docs); MEDIUM for DuckDB Node Neo integration in Eleventy context (API verified but no prior Eleventy-specific docs found)
- Pitfalls: HIGH — prior project research in `.planning/research/` confirmed and extended; DuckDB-specific pitfalls from official issue tracker

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable stack; DuckDB releases frequently — verify `@duckdb/node-api` version at install time)
