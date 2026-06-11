---
phase: 36
slug: eleventy-data-files-config-migration
status: secured
threats_open: 0
asvs_level: 1
created: 2026-06-10
---

# SECURITY.md — Phase 36: Eleventy Data Files & Config Migration

**Audit date:** 2026-06-10
**Auditor:** gsd-security-auditor
**ASVS Level:** 1
**Block on:** high (open threats only)

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-36-01 | Tampering | accept | CLOSED | See below |
| T-36-02 | Tampering | accept | CLOSED | See below |
| T-36-03 | Information Disclosure | accept | CLOSED | See below |
| T-36-04 | Tampering | accept | CLOSED | See below |
| T-36-05 | Tampering | mitigate | CLOSED | See below |
| T-36-06 | Tampering | accept | CLOSED | See below |
| T-36-07 | Information Disclosure | accept | CLOSED | See below |
| T-36-08 | Information Disclosure | accept | CLOSED | See below |
| T-36-SC | Tampering | mitigate | CLOSED | See below |

---

## Accepted Risks Log

The following threats carry `accept` disposition. Rationale verified against implementation.

### T-36-01 — execFile child spawn, hardcoded paths

**Rationale:** Paths are repository-static string literals with no user-input interpolation. `execFile` (not `exec`) does not invoke a shell.

**Verification:** All 5 execFile call sites in `eleventy.config.ts` were inspected at lines 107, 108, 119, 120, and 122. The first four use `["scripts/copy-images.ts"]` and `["scripts/emit-species-states.ts"]` — both hardcoded string literals, no variable interpolation. Line 122 uses `["./node_modules/.bin/pagefind", "--site", "_site"]` — also hardcoded. No `.js` script references remain. The `exec` shell form is absent; `execFile` is the only spawn mechanism.

**Evidence:** `eleventy.config.ts:107-108, 119-120, 122`

---

### T-36-02 — addDataExtension parser import(filePath)

**Rationale:** `filePath` is Eleventy-glob-discovered over `src/_data/` (committed repo files only). Defensive `path.resolve` normalizes relative paths; does not expand the import surface.

**Verification:** The parser at `eleventy.config.ts:35-41` receives `filePath` from Eleventy's internal glob. The only transformation applied is `isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)` at line 37 — normalization only, no external influence. The cast at line 38 is a single `as { default: unknown }`. No URL construction, no user-supplied path segments.

**Evidence:** `eleventy.config.ts:33-42`

---

### T-36-03 — Config build-time CSV read

**Rationale:** Only `data/glossary.csv` is read at config module init. No env-derived secrets, no network, no untrusted input.

**Verification:** The only `readFileSync` call in `eleventy.config.ts` is at line 21: `readFileSync("data/glossary.csv")`. The one env read is `process.env.GITHUB_PAGES` (line 12) — a boolean flag, not a secret, not used as a file path.

**Evidence:** `eleventy.config.ts:12, 21`

---

### T-36-04 — DuckDB read_csv over committed CSVs

**Rationale:** DuckDB reads `data/species.csv`, `data/glossary.csv`, `data/images.csv` — all committed repo files, not user-supplied. Type guards add defense-in-depth at the `unknown` boundary.

**Verification:** `species.ts:40-54` reads `data/species.csv`; `glossary.ts:28-37` reads `data/glossary.csv`; `taxon.ts:92-153` reads `data/species.csv` and `data/images.csv`. All paths are hardcoded string literals. No env-derived or user-supplied paths reach `read_csv`.

**Evidence:** `src/_data/species.ts:40`, `src/_data/glossary.ts:28`, `src/_data/taxon.ts:92, 111`

---

### T-36-06 — JSON.parse of build-locked JSON cast to typed shape

**Rationale:** `species-photos.json` and `plates.json` are build-generated/committed files. Single `as T` cast is trust-by-immutability per D-11; no runtime validation needed at this boundary.

**Verification:**
- `speciesPhotos.ts:21`: `JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Record<string, SpeciesPhoto>` — single `as` cast, no double-cast, no `as unknown as`.
- `plates.ts:165`: `JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as PlateEntry[]` — single `as` cast. `MANIFEST_PATH` is resolved via `new URL('../../data/plates.json', import.meta.url).pathname` — static relative URL, not env-derived.

**Evidence:** `src/_data/speciesPhotos.ts:21`, `src/_data/plates.ts:160, 165`

---

### T-36-07 — plates.ts reading PLATES_Z_SOURCE filesystem path

**Rationale:** Operator-local read-only filesystem access at build time. Env-overridable default path points to legacy local directory. No secrets, no network.

**Verification:** `plates.ts:18`: `const PLATES_Z_SOURCE = process.env.PLATES_Z_SOURCE ?? DEFAULT_SOURCE`. Default is a hardcoded local path (`/Users/rainhead/dev/pnwinsects-app/.../plates_z`). The env override is operator-controlled at build time. All operations on the path are `readdir`/`readFile` only (lines 180, 198, 151) — no exec, no network.

**Evidence:** `src/_data/plates.ts:17-18, 163, 180, 198`

---

### T-36-08 — Local npm run dev server

**Rationale:** Eleventy `--serve` binds localhost only for operator verification; not deployed.

**Verification:** The `dev` script in `package.json` is `npm run build:data && eleventy --serve --config=eleventy.config.ts`. Eleventy's `--serve` binds to localhost by default. No `--host 0.0.0.0` or equivalent flag present. The HMR port in `eleventy.config.ts:99` (`hmr: { port: 24679 }`) is also localhost-only. No public network exposure.

**Evidence:** `package.json:17`, `eleventy.config.ts:97-100`

---

## Mitigations Verified

### T-36-05 — getRowObjectsJS() unknown→typed narrowing

**Declared mitigation:** Runtime type guards (`isSpeciesDbRow` / `isGlossaryEntry` / taxon guards) narrow the `unknown` DuckDB output rather than an unguarded `as unknown as T` double-cast.

**Verification:**

- **species.ts:** `isSpeciesDbRow(obj: unknown): obj is SpeciesDbRow` defined at line 17, checking `typeof obj === 'object'`, `typeof r['id'] === 'number'`, `typeof r['genus'] === 'string'`, `typeof r['species'] === 'string'`, `Array.isArray(r['similar_slugs'])`, `typeof r['slug'] === 'string'`. Invoked at line 81 in a `for...of` loop: `if (!isSpeciesDbRow(row)) continue`. No `as unknown as` present (grep confirms empty).

- **glossary.ts:** `isGlossaryEntry(obj: unknown): obj is GlossaryEntry` defined at line 11, checking term/definition/letter/slug as strings. Invoked at line 61: `if (!isGlossaryEntry(row)) continue`. No `as unknown as` present.

- **taxon.ts:** Two guards — `isTaxonSpeciesDbRow` (line 17, checks family as `string | null`, genus/species/slug/genus_slug as strings) and `isNavImageDbRow` (line 38, checks species_slug/filename/photographer as strings). Both invoked at lines 161 and 167 in `for...of` loops. The final `return families as TaxonFamily[]` at line 257 is a single narrowing cast bridging `TaxonFamilyBuild` (which allows `name: string | null`) to `TaxonFamily` — this is NOT an `as unknown as` double-cast; it is a single `as` at a well-typed intermediate. No `as unknown as` present anywhere.

**Gap search:** `grep -n 'as unknown as'` across all three files returned empty.

**Evidence:** `src/_data/species.ts:17-27, 81`, `src/_data/glossary.ts:11-19, 61`, `src/_data/taxon.ts:17-46, 161, 167, 257`

---

### T-36-SC — No new npm packages installed this phase

**Declared mitigation:** No new packages were installed during phase 36.

**Verification:** `git diff 80825d37..HEAD -- package.json` (spanning all phase 36 commits from the pre-phase baseline through `HEAD`) shows changes only to `scripts` entries (`build:eleventy` gained `--config=eleventy.config.ts`, `dev` gained `--config=eleventy.config.ts`, `test` updated filename from `.js` to `.ts`). The `dependencies` and `devDependencies` objects are unchanged across all phase 36 commits. Confirmed by targeted grep for additions to non-script keys: zero results.

**Evidence:** `package.json:32-52` (current), `git log 80825d37..HEAD -- package.json` shows only `da4543c3` and `94231845` touched `package.json`, both for script-only changes.

---

## Unregistered Flags

All SUMMARY.md `## Threat Flags` sections across Plans 01–04 explicitly state **"No new threat surface introduced"** or **"None — build-side only"**. No unregistered flags were raised during implementation.

---

## Summary

| Count | Status |
|-------|--------|
| 9/9 | Threats closed |
| 0 | Open threats (blockers) |
| 0 | Unregistered flags |

Phase 36 is **CLEARED** for release from a security audit perspective. All accepted-risk threats have verified rationale matching the implementation. Both `mitigate` dispositions (T-36-05 type guards, T-36-SC supply chain) have confirmed mitigations present in code.
