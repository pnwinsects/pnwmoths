---
phase: quick-260701-ddi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/emit-species-audit.ts
  - scripts/emit-species-audit.test.ts
  - package.json
autonomous: true
requirements: [QUICK-260701-ddi]

must_haves:
  truths:
    - "`npm run build:species-audit` (after build:data + build:key + build:eleventy) writes _site/species-audit.csv with one data row per data/species.csv row"
    - "The CSV has a header row and columns: slug,genus,species,common_name,family,subfamily,has_records,visible,in_key"
    - "has_records is true iff the row's normalized slug appears in DISTINCT species_slug of data/records.csv"
    - "visible is true iff the row survives the same predicate stats.ts uses for `shown` (family not withheld/blank AND slug not on the unpublished deny-list)"
    - "in_key is true iff the row's slug appears in data/key-matrix.json species[].slug"
    - "All three joins use normalizeSlug() from src/_lib/unpublished-species.ts so the space-vs-hyphen slug forms (e.g. 'aseptis-sp no 1' vs 'aseptis-sp-no-1') reconcile to one row"
    - "The CSV is unlinked: no template, nav, or page references _site/species-audit.csv; it is reachable only by direct URL"
    - "build:species-audit is wired into the top-level `build` npm script and its test is added to the `test` npm script"
    - "The pure row-builder is unit-tested without needing a DuckDB build"
  artifacts:
    - path: "scripts/emit-species-audit.ts"
      provides: "Build step that emits the per-species audit CSV to _site/; pure row-builder + DuckDB/loader-wired main()"
      exports: ["buildSpeciesAuditRows", "toCsv", "main"]
      min_lines: 60
    - path: "scripts/emit-species-audit.test.ts"
      provides: "Unit tests for buildSpeciesAuditRows + toCsv (no build required)"
  key_links:
    - from: "scripts/emit-species-audit.ts"
      to: "normalizeSlug"
      via: "import from src/_lib/unpublished-species.ts to reconcile slug forms"
      pattern: "normalizeSlug"
    - from: "scripts/emit-species-audit.ts"
      to: "loadUnpublishedSpecies"
      via: "unpublished deny-list for the visible flag"
      pattern: "loadUnpublishedSpecies"
    - from: "scripts/emit-species-audit.ts"
      to: "loadWithheldFamilies"
      via: "withheld-families set for the visible flag"
      pattern: "loadWithheldFamilies|isWithheldOrUnclassified"
    - from: "package.json"
      to: "scripts/emit-species-audit.ts"
      via: "build:species-audit in the build chain + test script"
      pattern: "species-audit"
---

<objective>
Add a new build step that emits an **unlinked** diagnostic CSV, `_site/species-audit.csv`, with one row per known species (`data/species.csv`) and three boolean flags: whether the species has occurrence records, whether it is visible on the site, and whether it appears in the identification key. The file is written to `_site/` like the existing `emit-species-states.ts` artifact but is referenced by nothing — it exists purely for curators/maintainers to audit coverage via a direct URL.

Purpose: There is currently no single per-species view reconciling the four data sources (`species.csv` registry, `records.csv`, the withheld/unpublished visibility gates, and `key-matrix.json`). This CSV is that view.

Output: `scripts/emit-species-audit.ts` (+ unit test), registered as `build:species-audit` in the top-level `build` chain and in the `test` script.
</objective>

<task type="execute">
**Task 1: Write `scripts/emit-species-audit.ts`**

Model it on `scripts/emit-species-states.ts` (DuckDB + write to `_site/`) and reuse the existing loaders/predicate so the visibility flag is bug-for-bug identical to `src/_data/stats.ts`.

Structure (keep the join logic pure and testable):

- Define a `SpeciesAuditRow` shape with fields: `slug, genus, species, common_name, family, subfamily, has_records, visible, in_key`.
- `export function buildSpeciesAuditRows(opts)` — a **pure** function taking:
  - `speciesRows`: `{ genus, species, common_name, family, subfamily }[]` (raw `data/species.csv` rows)
  - `recordSlugs`: `Set<string>` (normalized slugs present in records.csv)
  - `keySlugs`: `Set<string>` (normalized slugs from key-matrix.json)
  - `withheldFamilies`: `Set<string>` (from `loadWithheldFamilies()`)
  - `unpublishedSlugs`: `Set<string>` (from `loadUnpublishedSpecies()`)
  Compute per row:
  - `slug = normalizeSlug(\`${genus}-${species}\`)`
  - `has_records = recordSlugs.has(slug)`
  - `in_key = keySlugs.has(slug)`
  - `visible = !isWithheldOrUnclassified(family, withheldFamilies) && !unpublishedSlugs.has(slug)`
  Return rows sorted by `slug`. Import `normalizeSlug`, `loadUnpublishedSpecies` from `../src/_lib/unpublished-species.ts` and `loadWithheldFamilies`, `isWithheldOrUnclassified` from `../src/_lib/withheld-families.ts` (verify exact export names before wiring).
- `export function toCsv(rows)` — RFC-4180 CSV: fixed header `slug,genus,species,common_name,family,subfamily,has_records,visible,in_key`, booleans rendered as `true`/`false`, each text field quoted-and-escaped only when it contains `,` `"` or a newline (double any `"`). Keep it dependency-free (no csv-stringify import unless you confirm it is already a dependency).
- `export async function main()`:
  - Read `data/species.csv` rows (reuse the csv-parse/sync pattern already used in `scripts/check-unpublished.ts`, or DuckDB — either is fine; be consistent with an existing script).
  - Get `recordSlugs`: DuckDB `SELECT DISTINCT species_slug FROM read_csv('data/records.csv', ...)` (reuse the column spec from emit-species-states.ts), then `normalizeSlug` each. (has_records = appears in records.csv at all — any record counts.)
  - Get `keySlugs`: `JSON.parse(readFileSync('data/key-matrix.json'))`.species.map(s => normalizeSlug(s.slug)). Guard: if the file is missing, warn and treat as empty (mirror check-unpublished.ts's existsSync guard).
  - Load `withheldFamilies` and `unpublishedSlugs` via the loaders.
  - `const rows = buildSpeciesAuditRows(...)`, `writeFileSync(resolve('_site/species-audit.csv'), toCsv(rows))` after `mkdirSync(resolve('_site'), { recursive: true })`.
  - `console.log(\`Wrote ${rows.length} species to _site/species-audit.csv\`)`.
  - Add the `if (import.meta.url === \`file://${process.argv[1]}\`)` CLI guard with the same error handling as emit-species-states.ts.

- files: [scripts/emit-species-audit.ts]
- verify: `node scripts/emit-species-audit.ts` after a build produces `_site/species-audit.csv`; `head` shows the header + true/false flags; row count equals `wc -l data/species.csv` minus 1.
- done: Script emits a well-formed CSV whose visible column matches the stats.ts `shown` predicate.

**Task 2: Unit-test the pure helpers — `scripts/emit-species-audit.test.ts`**

Follow the `node:test` style of `scripts/check-unpublished.test.ts`. Cover:
- A visible species with records and in the key → `true,true,true`.
- A species whose family is withheld (e.g. `Geometridae`) → `visible=false` even with records/key.
- A species whose slug is on the unpublished set → `visible=false`.
- A blank/null family → `visible=false` (fail-closed, matches isWithheldOrUnclassified).
- Slug reconciliation: a species.csv row with an embedded space (`species: 'sp no 1'`) matches a hyphenated record/deny slug (`aseptis-sp-no-1`) — proves normalizeSlug on both sides.
- `toCsv`: a `common_name` containing a comma is quoted; header is exact; boolean rendering is `true`/`false`.

- files: [scripts/emit-species-audit.test.ts]
- verify: `node --test scripts/emit-species-audit.test.ts` passes.
- done: Tests green.

**Task 3: Wire into package.json**

- Add script: `"build:species-audit": "node scripts/emit-species-audit.ts"`.
- Insert `npm run build:species-audit` into the top-level `build` chain immediately after `npm run build:species-states` (both are post-Eleventy `_site/` emitters; audit needs key-matrix.json + species.csv + records.csv, all present by then).
- Append `scripts/emit-species-audit.test.ts` to the `test` script's file list.

- files: [package.json]
- verify: `npm run typecheck` passes; `npm run build:species-audit` runs after a full build and emits the CSV; `grep -rn "species-audit.csv" src eleventy.config.ts` returns nothing (confirms it stays unlinked).
- done: Build chain emits the unlinked CSV; test registered.
</task>

<verification>
- `_site/species-audit.csv` exists after build with header `slug,genus,species,common_name,family,subfamily,has_records,visible,in_key` and one row per species.csv row.
- Spot-check: a `Geometridae` species has `visible=false`; a deny-listed provisional species (e.g. `aseptis-sp-no-1`) has `visible=false` but may have `has_records=true`.
- No source file or template references `species-audit.csv` (unlinked).
- `node --test scripts/emit-species-audit.test.ts` and `npm run typecheck` pass.
</verification>
