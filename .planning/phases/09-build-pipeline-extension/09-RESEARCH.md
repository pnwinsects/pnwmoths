# Phase 9: Build Pipeline Extension - Research

**Researched:** 2026-04-20
**Domain:** Eleventy data pipeline, DuckDB build-time queries, JSON file emission
**Confidence:** HIGH

## Summary

Phase 9 has two outputs: (1) `src/_data/taxon.js` — a new Eleventy data file that returns a family → subfamily → genus → species tree with up to 4 navigation images per taxon level, superseding `families.js`; and (2) `_site/species-states.json` — a flat array of `{species_slug, state}` pairs written at build time.

Both outputs can be built on patterns already established in this codebase. `taxon.js` follows the exact same DuckDB + `getRowObjectsJS()` + `closeSync()` pattern as `families.js` and `images.js`. The `species-states.json` file must land in `_site/` after the Vite step — the cleanest mechanism is adding it to `scripts/build-data.js` (or a companion script) and appending it to the `build` npm script, following the same post-Vite copy pattern already used for Parquet files and images.

The taxon tree data shape is: an array of family objects, each with `name`, optional `navImages[]` (up to 4), and a `subfamilies` array (which may contain a sentinel null-key entry for genera without a subfamily), each subfamily having `genera[]`, each genus having `species[]`. Navigation images are drawn from `images.csv` where `navigational = 'true'`, with fallback to lowest-weight images per genus/subfamily/family.

**Primary recommendation:** Implement `taxon.js` as a self-contained Eleventy data file using DuckDB (same pattern as `families.js`), and emit `species-states.json` as a side-effect of `build-data.js` (write the file to `_site/`) rather than as a separate script step.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| species-states.json emission | Build Script (`build-data.js`) | — | Needs DuckDB + records.csv; already imported in build-data.js; file must land post-Vite so script step wins over Eleventy passthrough |
| Taxon tree construction | Eleventy Data (`src/_data/taxon.js`) | — | Eleventy data files are the idiomatic location; consumed by Eleventy templates at build time |
| Navigation image selection | Eleventy Data (`src/_data/taxon.js`) | — | Image data is queried alongside species data in the same DuckDB session |
| families.js retirement | Eleventy Data | — | Replace by updating templates to use `taxon` instead of `families`; delete or stub `families.js` |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SFILT-01 | Build pipeline emits `species-states.json` (DISTINCT species_slug × state) to `_site/` | DuckDB `SELECT DISTINCT` on records.csv already loaded in build-data.js; write JSON via `fs.writeFileSync` after DuckDB export; copy to `_site/` post-Vite via script step in `npm run build` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@duckdb/node-api` | `^1.5.1-r.2` [VERIFIED: package.json] | Build-time CSV queries, DISTINCT aggregation | Already the project's query engine; `getRowObjectsJS()` + `closeSync()` pattern established |
| `node:fs` | built-in [VERIFIED: codebase] | Write JSON file to disk | Used in `build-data.js` already; `writeFileSync` is synchronous and safe after async DuckDB work |
| Eleventy data files (`src/_data/*.js`) | Eleventy 3.x [VERIFIED: package.json] | Supply data to templates at build time | `taxon.js` lives here, same as `families.js`, `images.js`, `species.js` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` (`cp`) | built-in [VERIFIED: copy-parquet.js] | Post-Vite file copy | If `species-states.json` is generated pre-Vite and needs copying (alternative to writeFile-to-_site) |
| `csv-parse` | `^6.2.1` [VERIFIED: package.json] | Synchronous CSV parsing | Not needed for Phase 9 — DuckDB handles CSV; `csv-parse` used only in `validateCsv` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adding JSON emission to `build-data.js` | New `scripts/emit-species-states.js` | Separate script is cleaner if `build-data.js` grows large; adds another `npm run build` step; acceptable either way |
| Writing to `_site/` directly from script | Eleventy `addPassthroughCopy` of a pre-generated file | Passthrough copy does NOT survive the Vite rename (confirmed in PROJECT.md Key Decisions); must use post-Vite script step |

**Installation:** No new packages needed. [VERIFIED: all dependencies already in package.json]

## Architecture Patterns

### System Architecture Diagram

```
data/records.csv ──────────────────┐
data/species.csv ──┐               │
data/images.csv ───┤               │
                   │               │
             build-data.js         │
             (DuckDB, Node.js)      │
                   │               │
                   ├── data/parquet/{slug}/records.parquet
                   └── _site/species-states.json  ◄── new output
                                   │
                                   │  (written post-Vite via build script)
                                   │
data/species.csv ──┐
data/images.csv ───┤
                   │
            src/_data/taxon.js  ◄── new Eleventy data file
            (DuckDB, Node.js)
                   │
                   └── taxon{}  (family→subfamily→genus→species tree)
                                   │
                              Eleventy templates
                              (browse page, Phase 10)
                                   │
                                   └── _site/browse/index.html
```

### Recommended Project Structure
```
scripts/
├── build-data.js        # Add species-states.json emission here (or new companion)
└── copy-images.js       # Existing pattern — post-Vite copy

src/_data/
├── taxon.js             # NEW — replaces families.js for browse hierarchy
├── families.js          # RETIRE — stub out or delete after taxon.js is wired
├── images.js            # UNCHANGED
├── species.js           # UNCHANGED
└── glossary.js          # UNCHANGED
```

### Pattern 1: DuckDB Eleventy Data File
**What:** Async default-export function that opens DuckDB, runs queries, closes connection, returns JS object
**When to use:** Any `src/_data/*.js` file needing structured data from CSV

```javascript
// Source: [VERIFIED: src/_data/families.js, src/_data/images.js]
import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv',
      header = true,
      nullstr = '',
      columns = { 'family': 'VARCHAR', 'subfamily': 'VARCHAR', 'genus': 'VARCHAR',
                  'species': 'VARCHAR', 'common_name': 'VARCHAR', ... }
    )
  `);

  const result = await conn.runAndReadAll(`SELECT ... FROM species ...`);
  conn.closeSync();

  const rows = result.getRowObjectsJS();
  // Build tree structure from flat rows
  return tree;
}
```

### Pattern 2: Post-Vite JSON File Emission
**What:** Write JSON to `_site/` using `writeFileSync` after the Vite step, analogous to `copy-parquet.js` and `copy-images.js`
**When to use:** Any file that must survive the Vite rename and land in `_site/` without being bundled

```javascript
// Source: [VERIFIED: scripts/copy-parquet.js pattern]
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// After DuckDB query produces rows:
const outPath = resolve('_site/species-states.json');
mkdirSync(resolve('_site'), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows));
```

**Critical:** `_site/` directory is created by Eleventy before the Vite step. Writing to `_site/` directly from a post-Vite script is safe. [VERIFIED: scripts/copy-parquet.js, scripts/copy-images.js both do this]

### Pattern 3: Taxon Tree Construction in JavaScript
**What:** Build a nested tree from a flat array of rows (family, subfamily, genus, species)
**When to use:** When DuckDB returns flat rows that Eleventy templates need as a nested hierarchy

```javascript
// Source: [ASSUMED — standard JS grouping pattern; consistent with families.js grouping]
const tree = {};
for (const row of rows) {
  const fam = row.family;
  if (!tree[fam]) tree[fam] = { name: fam, subfamilies: {}, navImages: [] };

  const subfam = row.subfamily ?? '__none__';
  if (!tree[fam].subfamilies[subfam]) {
    tree[fam].subfamilies[subfam] = { name: row.subfamily, genera: {}, navImages: [] };
  }

  const gen = row.genus;
  if (!tree[fam].subfamilies[subfam].genera[gen]) {
    tree[fam].subfamilies[subfam].genera[gen] = {
      name: gen,
      genus_slug: row.genus_slug,
      navImages: [],
      species: []
    };
  }

  tree[fam].subfamilies[subfam].genera[gen].species.push({
    slug: row.slug,
    name: row.species,
    common_name: row.common_name
  });
}
// Convert nested objects to arrays
return Object.values(tree).map(fam => ({
  ...fam,
  subfamilies: Object.values(fam.subfamilies)
}));
```

### Pattern 4: Navigation Image Selection (up to 4 per taxon level)
**What:** For each taxon level, pick up to 4 images: prefer `navigational = 'true'` images, fall back to lowest-weight images
**When to use:** Phase 9 taxon tree needs `navImages[]` on family, subfamily, and genus nodes

The query should JOIN species with images and use a window function or subquery to get the first 4 images per genus (ranked by: navigational first, then weight ascending).

```sql
-- Source: [ASSUMED — DuckDB window function pattern]
SELECT s.family, s.subfamily, s.genus, s.species,
       lower(s.genus || '-' || s.species) AS slug,
       s.common_name,
       i.filename, i.photographer, i.navigational, i.weight,
       ROW_NUMBER() OVER (
         PARTITION BY s.genus
         ORDER BY (i.navigational = 'true') DESC, i.weight ASC
       ) AS img_rank
FROM species s
LEFT JOIN images i ON i.species_slug = lower(s.genus || '-' || s.species)
```

Then filter `WHERE img_rank <= 4` or handle in JS. [ASSUMED — DuckDB supports window functions; consistent with Sphinxidae queries done elsewhere]

### Anti-Patterns to Avoid
- **Eleventy passthrough for `species-states.json`:** `addPassthroughCopy` does not survive the Vite rename step. PROJECT.md Key Decision confirms this — binary passthrough copies require post-Vite script. [VERIFIED: eleventy.config.js + copy-parquet.js commentary]
- **Two separate DuckDB connections in `taxon.js`:** Open one connection, run all queries, close once. `closeSync()` must be called or the process may hang. [VERIFIED: all existing `_data/*.js` files follow this pattern]
- **Generating `species-states.json` inside an Eleventy data file:** Eleventy data files return data to templates — they should not have filesystem side-effects. Side-effect file writes belong in the build script. [ASSUMED — Eleventy convention]
- **Not using SELECT DISTINCT:** Success criteria explicitly requires DISTINCT. Without it, file size grows linearly with record count (100k records × 6 states = 600k rows). [VERIFIED: requirements spec and STATE.md]
- **Empty string vs NULL for state:** Records with NULL or empty state should be excluded from `species-states.json`. The existing `build-data.js` validation query already filters `state IS NOT NULL AND state != ''` — apply the same filter. [VERIFIED: build-data.js lines 159-163]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DISTINCT aggregation | Custom deduplication loop | DuckDB `SELECT DISTINCT` | Correct at any data scale; handles NULL correctly |
| Tree grouping from flat rows | Recursive parser | Standard JS `Map`/object grouping | Flat → nested is a one-pass O(n) loop; no library needed |
| File copy post-Vite | Custom watcher/hook | `node:fs` `writeFileSync` or `cp` | Established project pattern; synchronous, reliable |
| Image ranking per taxon | Manual sort + slice | DuckDB window function + `LIMIT` | `ROW_NUMBER() OVER (PARTITION BY ...)` handles multi-row per species correctly |

**Key insight:** The complexity in this phase is data shaping (flat rows → nested tree + image selection), not infrastructure. All infrastructure patterns are already established.

## Common Pitfalls

### Pitfall 1: species-states.json Written Before Vite Step
**What goes wrong:** File is present after Eleventy, missing after Vite renames `_site`
**Why it happens:** The `eleventy-plugin-vite` rename cycle deletes pre-Vite `_site/` contents that are not re-emitted by Vite
**How to avoid:** Append a `build:species-states` step to the `build` npm script that runs AFTER `build:eleventy` (which includes the Vite step). Model on `build:copy-parquet` and `build:copy-images`.
**Warning signs:** `_site/species-states.json` exists after `npm run build:eleventy` but is gone after `npm run build`

### Pitfall 2: taxon.js DuckDB Connection Left Open
**What goes wrong:** Build hangs or test process does not exit
**Why it happens:** `conn.closeSync()` must be called in all paths, including error paths
**How to avoid:** Call `conn.closeSync()` before returning or throwing. Follow the exact pattern in `families.js` and `images.js`.
**Warning signs:** `npm run build:eleventy` hangs after completing the taxon query

### Pitfall 3: families.js Still Referenced After Retirement
**What goes wrong:** Eleventy loads both `families.js` and `taxon.js`; templates may use stale `families` data
**Why it happens:** Eleventy auto-loads all `_data/*.js` files
**How to avoid:** Either delete `families.js` entirely or replace its contents with `export default () => null` and verify no templates reference `families`. Check `src/` templates for `families` usage before deleting.
**Warning signs:** Build log shows two DuckDB connections opening for the same species.csv query

### Pitfall 4: NULL subfamily produces broken tree key
**What goes wrong:** `null` used as object key becomes the string `"null"`; genera without subfamily get grouped under a `"null"` subfamily key
**Why it happens:** JavaScript `{}[null]` coerces null to `"null"`
**How to avoid:** Use a sentinel string (e.g., `'__none__'`) as the internal key for null-subfamily genera, and expose `name: null` or `name: undefined` in the output. The Phase 10 accordion component will need to know whether to render a subfamily header.
**Warning signs:** Browse tree shows a "null" subfamily heading for genera that should appear directly under their family

### Pitfall 5: Image JOIN produces duplicate species rows
**What goes wrong:** A species with 3 images appears 3 times in the flat result, inflating the tree
**Why it happens:** JOIN on images is a one-to-many relation
**How to avoid:** Either (a) use a subquery/window function and filter `img_rank <= 4`, or (b) run two separate queries — one for species, one for images — and merge in JS (same pattern as `families.js` + `images.js` currently do separately). Option (b) avoids the JOIN complexity entirely and is more consistent with existing code patterns.
**Warning signs:** A family shows the same genus multiple times, or species counts are multiplied

## Code Examples

Verified patterns from official sources:

### SELECT DISTINCT species × state query
```javascript
// Source: [VERIFIED: build-data.js records table schema, DuckDB query patterns]
const result = await conn.runAndReadAll(`
  SELECT DISTINCT species_slug, state
  FROM records
  WHERE state IS NOT NULL AND state != ''
  ORDER BY species_slug, state
`);
const rows = result.getRowObjectsJS();
// rows = [{ species_slug: 'acronicta-americana', state: 'OR' }, ...]
```

**Verified output shape** (against current data/records.csv): 29 distinct (species_slug, state) pairs across 11 species and 6 states. [VERIFIED: live DuckDB query run in research session]

### JSON file write to _site/
```javascript
// Source: [VERIFIED: scripts/copy-parquet.js + copy-images.js patterns]
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outPath = resolve('_site/species-states.json');
mkdirSync(resolve('_site'), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows));
console.log(`Wrote ${rows.length} species-state pairs to _site/species-states.json`);
```

### npm build script extension
```json
// Source: [VERIFIED: package.json build script chain]
"build:species-states": "node scripts/emit-species-states.js",
"build": "npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:species-states && npm run build:pagefind && npm run build:validate-links && npm run build:check-weight"
```

OR (if emitted inside build-data.js rather than a separate script):
```json
"build": "npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:copy-species-states && ..."
```

Note: `build:data` (build-data.js) runs BEFORE Eleventy. If species-states.json is emitted there, a separate copy step is needed post-Vite. If a dedicated post-Vite script is used, it can write directly to `_site/`.

**Recommended:** Use a dedicated `scripts/emit-species-states.js` that runs after `build:eleventy`. This keeps `build-data.js` focused on validation + Parquet export, avoids the two-step generate-then-copy pattern, and is consistent with the existing post-Vite copy pattern.

### taxon.js return structure
```javascript
// Source: [ASSUMED — derived from requirements and families.js pattern]
// Return value shape expected by Phase 10 accordion component:
[
  {
    name: "Sphingidae",
    navImages: [{ filename: "01.jpg", photographer: "...", species_slug: "hyles-lineata" }],
    subfamilies: [
      {
        name: null,              // null means "no subfamily — genera appear directly under family"
        navImages: [...],
        genera: [
          {
            name: "Hyles",
            genus_slug: "hyles",
            navImages: [...],
            species: [
              { slug: "hyles-lineata", name: "lineata", common_name: "White-lined Sphinx" }
            ]
          }
        ]
      }
    ]
  }
]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `families.js` returns `{ genera, genusArray }` for browse/index + per-genus pages | `taxon.js` returns full family→subfamily→genus→species tree | Phase 9 | Phase 10 accordion uses `taxon`; per-genus pages retired in Phase 10 |
| Per-genus static pages (`/browse/{genus}/`) | Single `/browse/` page with accordion | Phase 10 | `genusArray` from `families.js` no longer needed after Phase 10 |

**Deprecated/outdated:**
- `families.js`: superseded by `taxon.js` in Phase 9. Safe to retire once Phase 10 templates no longer reference `families`. Phase 9 should supersede `families.js` but the template migration happens in Phase 10. Decision: Phase 9 creates `taxon.js` without deleting `families.js`; Phase 10 removes `families.js` when per-genus pages are retired.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `taxon.js` should include `navImages` arrays (up to 4) at family, subfamily, and genus levels | Standard Stack / Code Examples | If navImages belong only on genus level, tree structure is simpler; verify against Phase 10/11 accordion requirements |
| A2 | A dedicated `scripts/emit-species-states.js` is cleaner than adding emission to `build-data.js` | Architecture Patterns | If the planner prefers keeping all DuckDB work in `build-data.js`, the script split may be unnecessary |
| A3 | The `'__none__'` sentinel string is acceptable for null-subfamily grouping | Common Pitfalls | If Phase 10 accordion component uses a different convention (e.g., `null` key, or flat genus list), the sentinel must match |
| A4 | DuckDB window functions (`ROW_NUMBER() OVER (PARTITION BY ...)`) are available in `@duckdb/node-api` 1.5.x | Code Examples | All current DuckDB versions support window functions; risk is very low |
| A5 | `families.js` should NOT be deleted in Phase 9 (only superseded; deletion deferred to Phase 10) | State of the Art | If Phase 10 planner expects `families.js` gone, it creates a conflict |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions (RESOLVED)

1. **Where does `species-states.json` JSON emission happen: in `build-data.js` or a new script?**
   - What we know: Both approaches work technically. `build-data.js` already has a DuckDB connection for records.csv; a new script keeps separation of concerns.
   - What's unclear: User preference for script organization.
   - Recommendation: Dedicated `scripts/emit-species-states.js` for clarity; planner can override.
   - **RESOLVED:** Dedicated `scripts/emit-species-states.js` (Plan 09-01 implements this, consistent with `copy-parquet.js` separation-of-concerns pattern).

2. **Should `taxon.js` include navImages at all three taxon levels (family, subfamily, genus) or only genus?**
   - What we know: Success criterion says "up to 4 navigation images per taxon level." Phase 11 BROWSE-02 through BROWSE-06 describe images at each accordion level.
   - What's unclear: Whether Phase 9 should pre-compute family/subfamily-level navImages or leave that to Phase 11.
   - Recommendation: Include navImages at all levels in Phase 9. Phase 11 accordion component will consume them directly. This avoids rewriting `taxon.js` in Phase 11.
   - **RESOLVED:** navImages included at all three levels — family, subfamily, genus (Plan 09-02 implements this).

3. **Confirm `families.js` retirement timing**
   - What we know: `families.js` is used by existing browse templates (`browse/index.njk`, per-genus pages).
   - What's unclear: Whether Phase 9 should stub out `families.js` (replace with null export) or leave it intact until Phase 10 retires the per-genus pages.
   - Recommendation: Leave `families.js` intact in Phase 9. Phase 10 removes it alongside per-genus pages.
   - **RESOLVED:** `families.js` left intact in Phase 9; retirement deferred to Phase 10 alongside per-genus page retirement (Plan 09-02 objective explicitly states this).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts | ✓ | v22.20.0 [VERIFIED] | — |
| `@duckdb/node-api` | `taxon.js`, `emit-species-states.js` | ✓ | ^1.5.1-r.2 [VERIFIED] | — |
| `node:fs` built-in | JSON file write | ✓ | built-in [VERIFIED] | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (no external test runner) [VERIFIED: package.json] |
| Config file | none — test files listed explicitly in `npm test` script |
| Quick run command | `node --test scripts/build-data.test.js` |
| Full suite command | `node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SFILT-01 | `_site/species-states.json` exists after build with correct content | integration | `node --test scripts/build-data.test.js` | ❌ Wave 0 |
| SFILT-01 | SELECT DISTINCT produces correct pair count from test data | unit | `node --test scripts/build-data.test.js` | ❌ Wave 0 |
| SC-2 | `src/_data/taxon.js` returns correct tree structure | unit | `node --test scripts/build-data.test.js` | ❌ Wave 0 |
| SC-4 | `npm test` still passes 39+ tests after Phase 9 changes | regression | `npm test` | ✅ (existing) |

### Sampling Rate
- **Per task commit:** `node --test scripts/build-data.test.js`
- **Per wave merge:** `npm test` (all 39+ tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Test for `emit-species-states.js` (or the equivalent function): verifies `_site/species-states.json` written with correct DISTINCT pairs
- [ ] Test for `taxon.js` default export: verifies tree structure (family → subfamily → genus → species) with sample data
- [ ] Both test files should follow the synthetic-fixture pattern already established in `build-data.test.js`

*(Existing test infrastructure covers regression; new tests needed for new behaviors only)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `validateCsv` already validates records.csv and species.csv; `state` values validated against allowlist in build-data.js |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal in slug construction (records.csv species_slug) | Tampering | `validateSlugComponent` already enforced in `build-data.js` for genus/species; species_slug is a derived value — no free-form user input |
| Unbounded output file size | Denial of Service | `SELECT DISTINCT` bounds output; validation checks ensure valid state values (max 6 known states) |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: `/Users/rainhead/dev/pnwmoths/scripts/build-data.js`] — DuckDB pipeline patterns, validateCsv, Parquet export
- [VERIFIED: `/Users/rainhead/dev/pnwmoths/src/_data/families.js`] — Eleventy data file pattern, DuckDB connection lifecycle
- [VERIFIED: `/Users/rainhead/dev/pnwmoths/src/_data/images.js`] — images query pattern, navigational column
- [VERIFIED: `/Users/rainhead/dev/pnwmoths/scripts/copy-parquet.js`] — post-Vite file copy pattern
- [VERIFIED: `/Users/rainhead/dev/pnwmoths/scripts/copy-images.js`] — post-Vite multi-file copy pattern
- [VERIFIED: `/Users/rainhead/dev/pnwmoths/eleventy.config.js`] — Vite plugin configuration, passthrough copy behavior
- [VERIFIED: `/Users/rainhead/dev/pnwmoths/package.json`] — build script chain, dependency versions
- [VERIFIED: live DuckDB query] — `SELECT DISTINCT species_slug, state FROM records` returns 29 pairs from current test data
- [VERIFIED: `npm test`] — 39/39 tests passing as baseline

### Secondary (MEDIUM confidence)
- [VERIFIED: `.planning/STATE.md`] — v1.3 research decisions (JSON not Parquet, nullstr requirement, light DOM note, Phase 9 copy mechanism blocker)
- [VERIFIED: `.planning/phases/08-schema-extension/08-VERIFICATION.md`] — Phase 8 confirmed complete; confirmed state of all modified files

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json; no new dependencies needed
- Architecture: HIGH — patterns verified from existing scripts; copy mechanism confirmed via copy-parquet.js precedent
- species-states.json shape: HIGH — live query confirmed output format
- taxon.js navImages selection: MEDIUM — window function approach assumed; alternative (two-query JS merge) equally valid
- families.js retirement timing: MEDIUM — deferred to Phase 10 is assumed; planner should confirm

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable ecosystem, 30-day validity)
