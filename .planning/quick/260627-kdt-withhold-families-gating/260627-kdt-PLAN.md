---
phase: quick-260627-kdt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - data/withheld-families.csv
  - src/_lib/withheld-families.ts
  - src/_lib/withheld-families.test.ts
  - src/_data/species.ts
  - src/_data/taxon.ts
  - scripts/build-key.ts
  - src/_data/species.test.ts
  - scripts/check-withheld.ts
  - scripts/check-withheld.test.ts
  - package.json
autonomous: true
requirements: [ISSUE-48]

must_haves:
  truths:
    - "Editing data/withheld-families.csv (add/remove a family name) is the ONLY data change needed to hold or release a family — no source data is deleted"
    - "Withheld families (initially Geometridae) produce ZERO species pages in _site/species/"
    - "Withheld families do not appear in the Browse taxonomy tree"
    - "Withheld species are absent from the Identify key matrix (key-matrix.json) and therefore from Identify results"
    - "Withheld species are absent from Pagefind search (transitively — no page is built, so nothing is indexed)"
    - "Non-withheld families are completely unaffected (same pages, same Browse tree, same key matrix as before)"
    - "data/species.csv remains fully intact (Geometridae rows still present)"
  artifacts:
    - path: "data/withheld-families.csv"
      provides: "Single data-driven withhold list, keyed by family name; header 'family' + one row 'Geometridae'"
      contains: "Geometridae"
    - path: "src/_lib/withheld-families.ts"
      provides: "Shared loader + predicate used by all three choke points (loadWithheldFamilies, isWithheld)"
      exports: ["loadWithheldFamilies", "isWithheld"]
    - path: "scripts/check-withheld.ts"
      provides: "Build-time gate proving zero emitted pages AND zero key-matrix leaks for withheld families"
  key_links:
    - from: "src/_data/species.ts"
      to: "src/_lib/withheld-families.ts"
      via: "isWithheld() filter in post-query JS loop"
      pattern: "isWithheld"
    - from: "src/_data/taxon.ts"
      to: "src/_lib/withheld-families.ts"
      via: "isWithheld() filter before tree build"
      pattern: "isWithheld"
    - from: "scripts/build-key.ts"
      to: "src/_lib/withheld-families.ts"
      via: "filter speciesRows before building siteSlugSet (withheld → unmatched)"
      pattern: "isWithheld"
---

<objective>
Implement issue #48's family-withholding gate: a data-driven filter that holds an entire moth family (initially Geometridae, 99 species) back from ALL user-facing output — species pages, Browse taxonomy, Identify key, and search — without deleting any source data. Lifting the embargo later is a one-line edit to a committed data file.

Purpose: Curators need to stage a family's data (records/accounts/photos) before it goes live, and pull it back if needed, without destructive edits to `data/species.csv`. The hold must be obvious and reversible by a non-technical maintainer (a core project value).

Output: A single `data/withheld-families.csv` source of truth, a shared loader/predicate in `src/_lib/`, the filter applied at the three (and only three) choke points that read `species.csv` for user-facing output, a unit test proving the emitted species collection excludes withheld families while keeping others, and a build-time gate that hard-fails if any withheld page or key-matrix entry leaks.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@./CLAUDE.md

# The three choke points (all read data/species.csv directly and independently)
@src/_data/species.ts
@src/_data/taxon.ts
@scripts/build-key.ts

# Downstream of key-matrix.json — needs NO change, included to confirm the no-op
@src/_data/keyMatrix.ts

# Existing test patterns to mirror (node --test + csv-parse)
@scripts/build-data.test.ts

# Project skill: implementation patterns/constraints
# Run Skill("spike-findings-pnwmoths") before coding.
</context>

<key_facts>
The orchestrator and planner traced the full data flow. Bake these in — do not re-derive:

1. NO gating exists today. `species.ts`, `taxon.ts`, and `build-key.ts` each independently read every row of `data/species.csv`. All 99 Geometridae currently get pages, appear in Browse, and resolve into the key matrix.

2. There are exactly THREE user-facing choke points, each reading `species.csv` directly:
   - `src/_data/species.ts` → the `species` Eleventy collection → species pages (species.njk paginates it), the similar-species block, and Browse links.
   - `src/_data/taxon.ts` → Browse taxonomy tree (its own DuckDB read of species.csv).
   - `scripts/build-key.ts` → builds `siteSlugSet` from species.csv (line ~207), resolves key binomials to slugs, writes `data/key-matrix.json`.

3. CORRECTION to the "Identify-key is a no-op" assumption: it is NOT a no-op. The memory note `project_unmatched_key_species` only applies to species that have NO row in species.csv. Withheld families KEEP their rows (hold, not delete), so `build-key.ts` would still resolve them to slugs and emit them into `key-matrix.json` → they'd show in Identify and link to non-existent (404) pages. The filter MUST be applied in `build-key.ts` too. This is real work, not verification.

4. `src/_data/keyMatrix.ts` is DOWNSTREAM of `key-matrix.json` — it only maps over `raw.species` (then joins family from species.csv for grouping). Once `build-key.ts` drops withheld species from `key-matrix.json`, keyMatrix.ts never sees them. NO change to keyMatrix.ts. (It reads species.csv only to attach a family label to already-present key species.)

5. Pagefind indexes built HTML in `_site/`. If no page is emitted (choke point 1), the species is automatically absent from search. NO separate Pagefind exclusion — the page-emission gate covers it.

6. Other species.csv readers (`build-data.ts`, `extract-reference-links.ts`, `ingest-photos.ts`, `profile-data.ts`) are internal/pipeline, not user-facing output collections — OUT OF SCOPE. Do not touch them.

7. Toolchain: TypeScript + Node 24 native type-stripping; `node --test`; csv-parse/sync already a dependency. TS-only invariant: no `.js` sources, no `@ts-ignore`. Scripts may import from `../src/_lib/` (build-key.ts already imports from ../src/types). `tsconfig.node.json` already includes `src/_lib/**`, `src/_data/**`, and `scripts/**`.

8. The `npm test` script enumerates test files explicitly plus a few globs; it already globs `src/_lib/*.test.ts` (loader test auto-collected) but does NOT glob `src/_data/*.test.ts` or top-level `scripts/*.test.ts`. New tests outside `src/_lib` must be added to the `test` script.
</key_facts>

<design_decision>
## SQL filter vs post-query JS filter — DECISION: post-query JS, via a shared predicate

Filter withheld families in the post-query JS loop (using a shared `isWithheld(family, set)` predicate from `src/_lib/withheld-families.ts`), NOT inside the DuckDB SQL.

Justification:
1. `build-key.ts` has no DuckDB species query at all — it parses species.csv with csv-parse in JS. JS-side filtering is the ONLY way to apply ONE consistent predicate across all three choke points.
2. Keeping curator-controlled family strings out of SQL honors the repo's existing no-string-interpolation-into-SQL mitigation (T-39-01). A shared Set lookup has no injection surface.
3. The dataset is small (~1.2k rows); the cost of filtering in JS is negligible.
4. One shared predicate means the withhold list is defined once; there is no risk of three SQL `NOT IN (...)` clauses drifting out of sync.
</design_decision>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create the data-driven withhold list and shared loader</name>
  <files>data/withheld-families.csv, src/_lib/withheld-families.ts, src/_lib/withheld-families.test.ts</files>
  <behavior>
    - loadWithheldFamilies() reads data/withheld-families.csv and returns a Set of lowercased, trimmed family names. With the initial file it returns a set containing "geometridae".
    - A header-only CSV (no data rows) returns an empty set (embargo lifted).
    - A missing file returns an empty set and logs a warning (defensive; does not throw — removing the file must not break the build).
    - isWithheld(family, set): returns true when family is a non-null string whose trimmed lowercase form is in the set; false for null/undefined/empty/unlisted families. Case-insensitive ("GEOMETRIDAE", "Geometridae", " geometridae " all match).
  </behavior>
  <action>
    Create `data/withheld-families.csv` with a single column. First line is the header `family`; second line is `Geometridae`. This is THE single data-driven source of truth — lifting the embargo is deleting the `Geometridae` line (per ISSUE-48). Keep it curator-obvious: one family name per line, nothing else.

    Create `src/_lib/withheld-families.ts` exporting two functions. `loadWithheldFamilies(csvPath?: string): Set<string>` — default path resolves to `data/withheld-families.csv`; parse with `csv-parse/sync` using `{ columns: true, skip_empty_lines: true }` (mirror the parse options used in keyMatrix.ts and build-key.ts); map each row's `family` to `.trim().toLowerCase()`, drop empties, return a Set. If the file does not exist, `console.warn` and return an empty Set (do not throw). `isWithheld(family: string | null | undefined, withheld: Set<string>): boolean` — return `family != null && withheld.has(family.trim().toLowerCase())`. No `@ts-ignore`; type the csv rows inline as `Array<{ family: string }>`.

    Create `src/_lib/withheld-families.test.ts` using `node --test` + `node:assert/strict`, mirroring scripts/build-data.test.ts structure (temp dir via mkdirSync/writeFileSync/rmSync for fixture CSVs). Cover the four behaviors above: real file yields a set with "geometridae"; header-only yields empty; missing path yields empty (no throw); isWithheld is case/whitespace-insensitive and false for null/empty/unlisted.
  </action>
  <verify>
    <automated>node --test src/_lib/withheld-families.test.ts</automated>
  </verify>
  <done>Loader + predicate exist and pass tests; data/withheld-families.csv contains the Geometridae row; no @ts-ignore, no .js sources introduced.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Apply the withhold filter at all three choke points</name>
  <files>src/_data/species.ts, src/_data/taxon.ts, scripts/build-key.ts, src/_data/species.test.ts, package.json</files>
  <behavior>
    - The `species` collection emitted by species.ts contains ZERO rows whose family is Geometridae, while a known non-withheld family (e.g. Noctuidae) is still present with its full count.
    - taxon.ts produces a tree with NO top-level family node named "Geometridae".
    - build-key.ts treats withheld-family binomials as unmatched: their slugs are absent from siteSlugSet, so they fall out of key-matrix.json (and thus the Identify page).
  </behavior>
  <action>
    In `src/_data/species.ts`: import `loadWithheldFamilies, isWithheld` from `../_lib/withheld-families.ts`. Load the set once at the top of the default function. In the post-query loop that builds `result_rows`, skip any row where `isWithheld(row.family, withheld)` is true (use `continue`). Per the design decision, do this in JS, not in the SQL — keep the existing query unchanged.

    In `src/_data/taxon.ts`: import the same two functions. Load the set once. After `speciesRows` is built (the validated array of TaxonSpeciesDbRow), filter it with `isWithheld(row.family, withheld)` BEFORE the family-tree build loop, so withheld families never create a familyMap entry.

    In `scripts/build-key.ts`: import `loadWithheldFamilies, isWithheld` from `../src/_lib/withheld-families.ts` (same relative style as the existing `../src/types/schemas.ts` import). Load the set once. Where `speciesRows` is parsed from species.csv (around line 206), widen the inline row type to include `family: string` and filter out withheld-family rows BEFORE building `siteSlugSet` and `slugToName`. Effect: withheld binomials resolve to null in `resolveSlug` → land in `unmatchedBinomials` → excluded from the matrix and species lists written to key-matrix.json. Do NOT touch keyMatrix.ts (it is downstream of the now-filtered key-matrix.json).

    Create `src/_data/species.test.ts` (`node --test`): import the default export from `./species.ts`, await it, and assert: (a) NO emitted row has `family === 'Geometridae'`; (b) a non-withheld family is still present — assert at least one row with `family === 'Noctuidae'` exists (Noctuidae is the dominant family in the dataset); (c) NO emitted slug starts with a known Geometridae genus from the data (spot-check at least one, e.g. derive expected withheld slugs by reading data/species.csv and confirm intersection with emitted slugs is empty). This proves both halves of the requirement: withheld absent AND non-withheld unaffected.

    Edit `package.json` `test` script: add the glob `'src/_data/*.test.ts'` so the new test runs under `npm test`.
  </action>
  <verify>
    <automated>node --test src/_data/species.test.ts && npm run typecheck</automated>
  </verify>
  <done>species.ts and taxon.ts exclude Geometridae from emitted output; build-key.ts excludes withheld families from key-matrix.json; species.test.ts passes; typecheck clean (no @ts-ignore); non-withheld families verified present.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Build-time leak gate (pages + key matrix) and verification wiring</name>
  <files>scripts/check-withheld.ts, scripts/check-withheld.test.ts, package.json</files>
  <behavior>
    - check-withheld passes (exit 0) when no withheld-family species has an emitted page AND none appears in key-matrix.json.
    - check-withheld fails (exit non-zero, actionable message listing leaked slugs) if any withheld species has `_site/species/<slug>/index.html` OR appears in key-matrix.json species[].
    - An empty withhold set is a clean no-op pass.
  </behavior>
  <action>
    Create `scripts/check-withheld.ts` (a build gate, mirroring the existing check-*.ts scripts that run in the build chain). Steps: (1) `loadWithheldFamilies()` from ../src/_lib/withheld-families.ts; if empty, print "no withheld families — skipping" and exit 0. (2) Parse data/species.csv (csv-parse/sync, `{ columns: true, skip_empty_lines: true }`); compute the set of withheld-family slugs using the SAME slug rule species.ts uses for the permalink — `(genus + '-' + species).toLowerCase()` (this matches `lower(genus || '-' || species)`). (3) PAGE GATE: for each withheld slug, assert `_site/species/<slug>/index.html` does NOT exist (existsSync); collect any that do. (4) KEY-MATRIX GATE: read data/key-matrix.json, assert none of its `species[].slug` is in the withheld slug set; collect any that are. (5) If either collection is non-empty, print an actionable message naming the leaked slugs and which gate caught them, then `process.exit(1)`. Otherwise print a one-line pass summary (counts checked) and exit 0. Factor the leak-detection into a small pure exported function (e.g. `findLeaks({ withheldSlugs, siteDir, keyMatrixSlugs })`) so it is unit-testable without a full build.

    Create `scripts/check-withheld.test.ts` (`node --test`): unit-test the pure `findLeaks` helper with in-memory fixtures — (a) clean case returns no leaks; (b) a planted emitted-page slug is reported; (c) a planted key-matrix slug is reported; (d) empty withheld set returns no leaks. Use a temp `_site/species/<slug>/index.html` fixture for the existsSync path (mkdirSync/writeFileSync/rmSync), mirroring scripts/build-data.test.ts.

    Edit `package.json`: (1) add `"build:check-withheld": "node scripts/check-withheld.ts"`; (2) insert `&& npm run build:check-withheld` into the `build` chain immediately after `build:eleventy` (key-matrix.json already exists from the earlier build:key step, and _site/species pages exist from build:eleventy — so the gate fails fast if anything leaks); (3) add `scripts/check-withheld.test.ts` to the explicit file list in the `test` script.
  </action>
  <verify>
    <automated>node --test scripts/check-withheld.test.ts && node scripts/check-withheld.ts</automated>
  </verify>
  <done>check-withheld.ts is wired into the build chain after build:eleventy and exits 0 against the current tree (no leaks); its test passes; an injected leak (page or key-matrix entry) makes the gate exit non-zero with a slug-naming message.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| curator → build | `data/withheld-families.csv` is curator-edited free text consumed by build scripts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | family name interpolated into DuckDB SQL | mitigate | Filter in JS via a Set lookup (design decision); never interpolate the withhold list into SQL — preserves repo's T-39-01 no-interpolation invariant |
| T-quick-02 | Information disclosure | premature reveal of a withheld family on the live site | mitigate | Three-choke-point filter + build-time `check-withheld` gate hard-fails the build if any withheld page or key-matrix entry leaks |
| T-quick-03 | Denial of service | missing/empty withheld-families.csv breaks the build | accept | Loader returns empty set + warning on missing file; empty set = no embargo (graceful, intended degrade) |

No package-manager installs are introduced (csv-parse/sync already a dependency) — package legitimacy gate not applicable.
</threat_model>

<verification>
After execution, confirm end-to-end:

1. `npm test` — all suites pass (loader, species emission, check-withheld).
2. `npm run typecheck` — clean; TS-only invariant intact (no new `.js`, no `@ts-ignore`).
3. `npm run build` — completes; `build:check-withheld` passes (zero leaks).
4. Spot-check after build: `_site/species/` contains NO Geometridae slugs; `data/key-matrix.json` contains NO Geometridae slugs; Pagefind index (built from _site) therefore omits them automatically — NO separate Pagefind change made (confirm, don't add).
5. Confirm `keyMatrix.ts` was NOT modified (downstream of filtered key-matrix.json — no change needed).
6. Confirm `data/species.csv` is unchanged (all 99 Geometridae rows still present — this is a hold, not a delete).
7. One-line-release check: temporarily delete the `Geometridae` row from data/withheld-families.csv, rebuild, confirm Geometridae pages/Browse/key reappear; then restore the row.
</verification>

<success_criteria>
- A single committed file (`data/withheld-families.csv`) controls withholding, keyed by family name; lifting the embargo is one line.
- Geometridae produce zero species pages, zero Browse nodes, zero key-matrix entries, zero search hits — verified by test AND build gate.
- Non-withheld families are byte-for-byte unaffected (Noctuidae et al. present with full counts).
- `data/species.csv` is fully intact.
- TS-only invariant preserved; `npm test`, `npm run typecheck`, and `npm run build` all pass.
</success_criteria>

<output>
Create `.planning/quick/260627-kdt-withhold-families-gating/260627-kdt-SUMMARY.md` when done.
</output>
