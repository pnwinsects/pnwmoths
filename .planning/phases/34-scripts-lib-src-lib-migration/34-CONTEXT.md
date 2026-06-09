# Phase 34: scripts/lib & src/_lib Migration - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the shared utility libraries to TypeScript and prove the Node 24 native type-stripping path works end-to-end with `node --test` — the smallest, lowest-risk areas first, to de-risk all downstream migration phases (35–38).

**In scope — rename `.js` → `.ts` with full strict types:**
- `scripts/lib/dropbox-download.js`
- `scripts/lib/dropbox-list.js`
- `scripts/lib/manifest.js`
- `scripts/lib/parse-photo-filename.js`
- `src/_lib/glossary-transform.js`
- Their existing test files: `scripts/lib/dropbox-download.test.js`, `scripts/lib/manifest.test.js`, `scripts/lib/parse-photo-filename.test.js`, `src/_lib/glossary-transform.test.js`

**Hard constraints (locked by REQUIREMENTS MIG-01 + Phase 33):** no `.js` source remains in either dir; all converted tests run via `node --test` with Node 24 native type-stripping; zero `tsc --noEmit` errors; no `@ts-ignore`, no `allowJs`, no unguarded `as unknown as T` double-casts; `npm run build` still emits the current species-page count (1,433 as of 2026-06-09) with `_site/` byte-identical to the pre-migration baseline.

</domain>

<decisions>
## Implementation Decisions

### External-boundary typing (the pattern Phase 35 will copy across all of scripts/)

- **D-01:** For untyped external returns — Dropbox HTTP API JSON (`fetch().json()` in `dropbox-download.js` / `dropbox-list.js`) and `csv-parse` output (`manifest.js`) — **hand-write a minimal interface covering only the fields we actually consume**, and narrow the raw result through a **small runtime guard** (asserts the needed fields exist) rather than an unguarded cast. Self-documenting, type-safe downstream, and honors the milestone's no-`as unknown as T` rule.
- **D-02:** These guards are **hand-rolled / lightweight, NOT Zod.** Zod stays reserved for the seven data entities and the two runtime CDN boundaries (`records.parquet`, `species-states.json`) per Phase 33 D-05/D-06. The Dropbox-API and manifest shapes are build-side/operator-side and get plain TS guards — no runtime validation library is pulled into these libs.
- **D-03:** Lenient where we control the data, strict where it can drift (carried from Phase 33 D-07): the guard validates the fields the code reads; extra/unknown fields on an external response must not throw.

### Manifest row type (`scripts/lib/manifest.ts`)

- **D-04:** Type the manifest row as **`type ManifestRow = Record<typeof COLUMNS[number], string>`** so `COLUMNS` (the locked D-05 field-order array from Phase 26) stays the single source of truth and the row type cannot drift from it.
- **D-05:** Narrow the **`status`** field to a **string-literal union** (observed values across the pipeline: `'downloaded' | 'tiled' | 'uploaded' | 'failed'`). **No `enum`** (TS-03). The planner MUST confirm the complete status set — including the initial post-ingest status — from `scripts/ingest-photos.js` before finalizing the union; do not invent values.
- **D-06:** `readManifest()` narrows the `csv-parse` output to `ManifestRow[]` via the D-01 guard. `advanceStatus(row, nextStatus, extra)` takes a `ManifestRow`, a `status`-union value, and `extra` typed as `Partial<ManifestRow>`; it returns/mutates a `ManifestRow`. `writeManifest()` keeps emitting the `COLUMNS` header/order.

### Claude's Discretion
- Whether to also lift `view` (`'D' | 'V'`) and `match_bucket` (`clean-match | genus-only | likely-synonym | provisional | unparseable | resolved-via-synonym`) to string-literal unions, consistent with the type-safe direction above — planner's call; not required by this phase.
- The exact local interface names/shapes for the Dropbox API responses (driven by the fields each function actually reads).
- `dropbox-list.js` has **no existing test** — Phase 34 converts existing tests only (MIG-01); adding new coverage for `dropbox-list` is out of scope (left to discretion if trivially cheap, but not required).
- Test-runner mechanics: the `npm test` script currently globs `scripts/lib/*.test.js` and `src/_lib/*.test.js`, which won't match `.ts` after conversion. The planner must update the test invocation so the converted `.ts` tests run under Node 24 type-stripping (e.g. broaden globs to `*.test.{js,ts}` or equivalent) and confirm whether `node --test` needs an explicit strip-types flag on the installed Node 24.x — research/planning detail, not a user decision.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning
- `.planning/REQUIREMENTS.md` — MIG-01 is this phase's requirement (convert `scripts/lib/` + `src/_lib/`); MIG-02..06 / CI-* are later phases
- `.planning/ROADMAP.md` §"Phase 34" — goal + 4 success criteria
- `.planning/phases/33-toolchain-schema-scaffolding/33-CONTEXT.md` — trust-by-immutability (D-01..03), Zod-4-in-`src/types/` (D-04..06), drift/strictness direction (D-07)
- `.planning/phases/33-toolchain-schema-scaffolding/33-RESEARCH.md` — tsconfig layout, Node 24 type-stripping notes, the eleventy.d.ts shim, package state

### Toolchain produced by Phase 33 (already on disk)
- `tsconfig.node.json` — the Node target that type-checks `scripts/lib/**/*.ts`, `src/_lib/**/*.ts`, and now-scoped `*.test.ts` globs; `allowImportingTsExtensions`, `types: ["node"]`, `isolatedModules`
- `src/types/schemas.ts` / `src/types/index.ts` — the Zod schemas + `z.infer<>` types (consume the derived TYPES only if a lib genuinely handles one of the 7 entities; the manifest is NOT one of them)
- `package.json` scripts.`typecheck` (`tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit`) and scripts.`test`

### Code touchpoints (read to ground the conversion)
- `scripts/lib/manifest.js` §`COLUMNS` (lines 37–50) — the locked 13-column manifest schema and field order; `advanceStatus` / `sortForInvestigation` / `readManifest` / `writeManifest` signatures
- `scripts/lib/dropbox-list.js`, `scripts/lib/dropbox-download.js` — the `fetch()` calls to the Dropbox API whose JSON responses need minimal consumed-field interfaces
- `scripts/ingest-photos.js` — to confirm the COMPLETE `status` value set (incl. the initial post-ingest status) before fixing the D-05 union
- `src/_lib/glossary-transform.js` — uses `node-html-parser` (ships its own types; already JSDoc-annotated) — the most straightforward conversion

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`COLUMNS` array in `manifest.js`** — already the single source of truth for manifest field order; `ManifestRow` derives from it (`Record<typeof COLUMNS[number], string>`), so no duplicate field list.
- **`node-html-parser` types** — `glossary-transform.js` already references `import('node-html-parser').TextNode` in JSDoc; conversion can lean on the library's shipped types directly.
- **Phase 33 `tsconfig.node.json`** — already includes both target dirs and the scoped `*.test.ts` globs; no tsconfig change needed for these files to be type-checked.

### Established Patterns
- All five files already use ESM (`import`/`export`), so conversion is rename + add type annotations — no module-system change.
- Build-side libs only; nothing here ships to the browser bundle, so full `zod`/Node types are free to use (bundle weight is irrelevant per Phase 33 D-05).

### Integration Points
- `manifest.ts`, `parse-photo-filename.ts`, `dropbox-*.ts` are consumed by `scripts/ingest-photos.js`, `scripts/tile-photos.js`, `scripts/upload-tiles.js`, `scripts/generate-species-photos.js` — all still `.js` until Phase 35. During Phase 34 these `.js` consumers import the new `.ts` modules; the planner must confirm `.js`→`.ts` import resolution works under Node 24 (the consumers run via Node directly, not just tsc).
- `src/_lib/glossary-transform.ts` is consumed by `eleventy.config.js` (still `.js` until Phase 36) at build time.

</code_context>

<specifics>
## Specific Ideas

- The two decisions locked here (minimal-interface + guard at external boundaries; `COLUMNS`-derived `ManifestRow` with a `status` string-literal union) are deliberately chosen as the **template Phase 35 will replicate** across the rest of `scripts/`. Keep them consistent rather than re-deciding per file.

</specifics>

<deferred>
## Deferred Ideas

- Adding test coverage for `dropbox-list.js` (no existing test) — not part of MIG-01's "convert existing tests"; could be its own small follow-up if desired.
- Lifting `view` / `match_bucket` to string-literal unions everywhere they appear — natural extension of the type-safe direction, but spans files beyond this phase; revisit during Phase 35.

</deferred>

---

*Phase: 34-scripts-lib-src-lib-migration*
*Context gathered: 2026-06-09*
