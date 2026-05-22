# Phase 27: Synonym Curation Pass - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 27 converts the ~1,120 non-clean rows in `data/species-photos-manifest.csv` (produced by Phase 26) into curator-driven taxonomy decisions, lifting the manifest's clean-or-resolved match rate from 77.3% to ≥95%. The deliverable is:

1. A new committed `data/species-synonyms.csv` (starter is the header line only — every decision is a deliberate curator PR).
2. A reclassification path inside `scripts/ingest-photos.js` that loads synonyms.csv whenever it exists and rewrites affected manifest rows to `match_bucket: resolved-via-synonym` with updated `binomial_resolved` + `species_slug`. No new script, no new env flag — synonym-aware classification is the default after Phase 27.
3. An operator runbook `_instructions/CURATING_SPECIES_SYNONYMS.md` walking the curator through: open the manifest in a spreadsheet (Phase 26's `sortForInvestigation` already surfaces the highest-impact rows at the top) → add rows to species-synonyms.csv → rerun `npm run photos:investigate` → confirm distribution.

**Out of scope for Phase 27:** Downloading TIFF bytes, tile generation, bunny.net upload (Phases 28–29). External taxonomic API auto-resolution (GBIF/ITIS) — already deferred at the milestone level. Filename fixes for the ~22 unparseable rows with empty `binomial_raw` — those are unreachable through synonyms.csv (no key to match on) and require manual Dropbox renames + re-ingest, deferred to post-v2.2.

</domain>

<decisions>
## Implementation Decisions

### Synonyms CSV schema
- **D-01:** `data/species-synonyms.csv` has exactly **two columns**: `from_binomial,to_species_slug`. The flat-file ethos from Phase 26 carries forward — PR history is the audit trail; `decided_by`/`decided_on`/`note` columns are NOT added (every extra column is curator-typed friction per row).
- **D-02:** `from_binomial` matches the manifest's `binomial_raw` exactly: lowercased, space-separated form (e.g. `grammia nevadensis`, `smerinthus ophthalmica`). `to_species_slug` matches the slug column in `data/species.csv`: lowercased, hyphen-separated form (e.g. `apantesis-nevadensis`). The synonym lookup is a literal-equality match on `binomial_raw`; no normalization tricks.

### Reclassification trigger
- **D-03:** `scripts/ingest-photos.js` **auto-loads** `data/species-synonyms.csv` whenever it exists and applies the lookup during the classify cascade. There is NO `RECLASSIFY_ONLY=1` flag and NO separate `scripts/reclassify-photos.js` — synonym-aware classification is the default after Phase 27 ships.
- **D-04:** Synonym lookup is a **pre-pass before the byBinomial/bySlug/genera cascade**: if `binomial_raw` matches a row in synonyms.csv, the cascade short-circuits to `match_bucket: resolved-via-synonym` with `binomial_resolved` + `species_slug` populated from the synonyms.csv mapping (resolved against `data/species.csv` to confirm the target slug actually exists). If the target slug is NOT in species.csv, the row stays in its original bucket and the script logs a warning via `logStage(content_hash, 'synonym-warn', 'target-not-in-species-csv', from_binomial → to_species_slug)`.
- **D-05:** Both `npm run photos:ingest` (full ingest with Dropbox calls) AND `npm run photos:investigate` (RESORT_ONLY=1, no Dropbox) re-run classification against the current synonyms.csv. The curator's normal workflow is: edit synonyms.csv → `npm run photos:investigate` → manifest reclassified + re-sorted in place, no Dropbox traffic.

### Edge buckets (provisional + unparseable)
- **D-06:** Any manifest row with non-empty `binomial_raw` is routable through synonyms.csv — including `provisional` and `unparseable` rows. If a curator decides `Monostoecha n sp` → `Monostoecha pacifica`, the synonyms.csv lookup promotes the row to `resolved-via-synonym` just like a `genus-only` row. This is a deliberate widening of the roadmap's "from `genus-only` / `likely-synonym`" wording: the wording reflects expected use, but the implementation is bucket-agnostic on the `binomial_raw` side.
- **D-07:** Rows with empty `binomial_raw` (~22 in the v2.2 manifest; subset of unparseable) remain unreachable through synonyms.csv — no key to match on. Their disposition is "leave alone in the manifest"; fixing them would require manual filename edits in Dropbox followed by re-ingest, which is out of scope for Phase 27 and deferred to post-v2.2.

### Seed file
- **D-08:** Phase 27 ships `data/species-synonyms.csv` with the **header line only** (`from_binomial,to_species_slug`). No pre-filled synonyms — even the spike's well-documented `Grammia → Apantesis` cluster is left for the curator to author. Every row is a deliberate decision with a PR diff.

### Locked by ROADMAP.md (not re-discussed)
- **L-01:** File location is `data/species-synonyms.csv` (committed in-repo).
- **L-02:** New manifest bucket name is `resolved-via-synonym` (extends the D-05 bucket set from Phase 26: `clean-match | genus-only | likely-synonym | provisional | unparseable | resolved-via-synonym`).
- **L-03:** The investigation-view sort order (`sortForInvestigation` in `scripts/lib/manifest.js`) does NOT change. `resolved-via-synonym` rows trail with the clean-match rows in the "not-needs-investigation" partition, in original order. The four investigation buckets (`genus-only`, `likely-synonym`, `provisional`, `unparseable`) still surface at the top.
- **L-04:** Phase verification target: clean-or-resolved match rate ≥ 95% (up from 77.3% baseline). With the 1,120 investigation rows tightly clustered on ~30–80 unique binomials, modest curator effort against the top-frequency rows should clear the bar.
- **L-05:** A curator runbook `_instructions/CURATING_SPECIES_SYNONYMS.md` is required (mirrors the Phase 26 / `UPLOADING_IMAGES.md` shape: What This Changes → Before You Start → Steps → Verify).

### Claude's Discretion
- **D-09 (synonym-load location):** Whether synonyms.csv loading lives in `scripts/ingest-photos.js`'s `loadSpecies()` (returning a fourth map alongside byBinomial/bySlug/genera) or in a sibling `loadSynonyms()` helper is Claude's call. The interface to `classify()` is what matters: pre-pass against the synonym lookup before the existing cascade.
- **D-10 (validation gates):** Whether synonyms.csv gets its own unit test (round-trip, header validation, missing-target-slug warning) or just integration coverage via the existing classify tests — Claude's call. The TDD pattern from Phase 26 (RED commit → GREEN commit) applies to whatever shape the test ends up.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 27 charter
- `.planning/ROADMAP.md` §"Phase 27: Synonym Curation Pass" — goal + 4 success criteria; the ≥95% target metric lives here
- `.planning/REQUIREMENTS.md` — CURATE-01 (author flat synonyms.csv), CURATE-02 (reclassify without re-download), CURATE-03 (investigation view sorted by frequency — already satisfied in Phase 26)

### Phase 26 upstream (the contract Phase 27 extends)
- `.planning/phases/26-dropbox-ingest-filename-parser-and-manifest/26-CONTEXT.md` — D-01 to D-15; especially D-05 (manifest schema), D-13 (per-stage CLI shape), D-15 (operability harness)
- `.planning/phases/26-dropbox-ingest-filename-parser-and-manifest/26-03-SUMMARY.md` — actual CLI shape that Phase 27 extends (the `classify()` function, the load helpers, the npm aliases)
- `scripts/ingest-photos.js` — the script Phase 27 modifies (classify cascade at ~line 167; loadSpecies at ~line 137; RESORT_ONLY path at ~line 280)
- `scripts/lib/manifest.js` — read/write surface Phase 27 reuses verbatim (COLUMNS, readManifest, writeManifest, sortForInvestigation — none modified)
- `scripts/lib/parse-photo-filename.js` — `toSpeciesSlug` helper available for slug-form normalization in synonym validation

### Spike findings (the implementation blueprint)
- `.claude/skills/spike-findings-pnwmoths/SKILL.md` — auto-loaded skill
- `.planning/spikes/001-dropbox-photo-audit/REPORT.md` §"Top unmatched binomials" — quote in the curator runbook so the curator knows what their high-impact decisions are before opening the manifest
- `.planning/spikes/001-dropbox-photo-audit/outputs/classifications.json` — bucket frequency table; useful for the runbook's "expected residue" section

### Data joins
- `data/species.csv` — slug column is the truth source for `to_species_slug` (1,348 records); synonym lookup MUST resolve `to_species_slug` against this file or warn-and-skip
- `data/species-photos-manifest.csv` — Phase 26's output; the input to Phase 27's reclassification; 4,935 data rows
- `data/species-synonyms.csv` — the new file Phase 27 creates (header only on first commit)

### Operator-doc analogs
- `_instructions/UPLOADING_IMAGES.md` — Phase 13 runbook; section structure to mirror
- `_instructions/INGESTING_HIGH_RES_PHOTOS.md` — Phase 26's runbook; matches v2.2 style + tone

### Project context
- `.planning/PROJECT.md` — flat-file ethos, Key Decisions table; the "DB genus+species slug" decision lives here
- `.planning/STATE.md` — Phase 26 completed 2026-05-22; v2.2 in flight

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/ingest-photos.js` `classify()` function** — Phase 27 extends with a single pre-pass: `if (synonyms.has(binomialFromParser)) { return resolveSynonym(binomialFromParser); }` before the existing byBinomial → bySlug → genus-only → likely-synonym cascade. The bucketHintFromParser === 'provisional' short-circuit currently runs FIRST; Phase 27 should put the synonyms pre-pass BEFORE that short-circuit so curator-routed provisional rows (D-06) actually get promoted.
- **`scripts/lib/manifest.js`** — readManifest/writeManifest/sortForInvestigation/COLUMNS are all reused verbatim; no changes to the manifest library.
- **`scripts/lib/parse-photo-filename.js` `toSpeciesSlug`** — converts `'abagrotis apposita'` to `'abagrotis-apposita'`; useful for validating that synonyms.csv `to_species_slug` values match the species.csv format.
- **`csv-parse/sync`** — already imported in ingest-photos.js for loading data/species.csv; the same call shape (`parse(buffer, { columns: true, skip_empty_lines: true })`) loads species-synonyms.csv.

### Established Patterns
- **First-run-safe file reads** — Phase 26's `readManifest` uses `existsSync` to return `[]` on missing file; apply the same pattern to `loadSynonyms`: if species-synonyms.csv does not exist, return an empty Map and the cascade behaves identically to Phase 26.
- **Per-stage logStage lines** — D-04's `synonym-warn` log line (`<timestamp> <hash> synonym-warn target-not-in-species-csv <from> → <to>`) follows the existing `logStage(content_hash, action, outcome, extra)` format from Phase 26.
- **TDD discipline** — Phase 26 Plans 01 and 02 committed RED tests before GREEN implementation (visible in `git log --grep='^test(26-'`). Phase 27's reclassification tests should follow the same shape.

### Integration Points
- **`photos:investigate` becomes the curator's daily-use command** — Phase 26 documented `photos:investigate` as "re-sort the manifest." Phase 27 extends it to "re-classify against current synonyms.csv AND re-sort." No interface change to the CLI alias; only the underlying behavior is enriched.
- **Phase 28 reads `status: discovered` rows (NOT `match_bucket`)** — Phase 28 downloads any row in `status: discovered` regardless of match_bucket. So `resolved-via-synonym` rows are eligible for download immediately; clean-match rows already were. Phase 27 does NOT need to gate Phase 28 on bucket — `status` is the gate.
- **Phase 30 (data/species-photos.json build) reads `binomial_resolved` + `species_slug`** — Phase 27 must populate BOTH fields when promoting to `resolved-via-synonym`. The classify() function currently leaves them empty for non-clean buckets; the synonyms pre-pass fills them from the matched species.csv record.

</code_context>

<specifics>
## Specific Ideas

- **Top investigation binomials in the real manifest** (from `tail -n +2 data/species-photos-manifest.csv | awk -F, '$11 != "clean-match" {print $6}' | sort | uniq -c | sort -rn | head -20`):
  - `smerinthus ophthalmica` (32 files) — highest single-binomial impact; one curator decision clears 32 rows
  - `grammia nevadensis` (10), `sericosema wilsonensis` (8), `pheosia rimosa` (8), `pero occidentalis` (8), `macaria signaria` (8), `iridopsis emasculatum` (8), `hydriomena irata` (8), `dysstroma hersiliata` (8), `drepanulatrix hulstii` (8), `drepanulatrix bifilata` (8), `digrammia muscariata` (8)
  - The top ~12 binomials cover ~120 files; clearing all of them gets the manifest from 77.3% to ~80%. The long tail of 30–80 unique binomials provides the rest of the bar-clearing.
  - 22 rows have empty `binomial_raw` (unparseable, no key to match) — these are the unreachable residue.
- **The curator runbook should quote the top-12 list verbatim** so a non-developer opening `_instructions/CURATING_SPECIES_SYNONYMS.md` immediately knows which decisions to make first.
- **Loading order:** Phase 26's `main()` calls `loadSpecies()` once at startup. Phase 27 calls `loadSynonyms()` alongside; both maps are passed into `classify()`. The synonym map is a `Map<from_binomial, { binomial_resolved, species_slug }>` resolved at load time against the species.csv lookup — load-time validation surfaces `synonym-warn` for missing target slugs once, not per-row.
- **The auto-apply semantics mean an existing committed manifest reflects the LATEST synonyms.csv** after any rerun. There is no "snapshot" of historical curation state — `git log data/species-photos-manifest.csv` is the history.

</specifics>

<deferred>
## Deferred Ideas

- **Filename fixes for unparseable rows with empty `binomial_raw`** — Would require manual edits in the Dropbox shared folder followed by a re-ingest. Deferred to post-v2.2; the 22-row residue is acceptable.
- **Curator-typed `note` / `decided_on` / `decided_by` columns on synonyms.csv** — Rejected for v2.2 (D-01); the flat-file PR-as-audit-trail pattern handles provenance. If a future curator complains the diff is insufficient context, revisit with a 4-column variant.
- **A "preview mode" that shows what reclassification WOULD do without writing** — Not required for v2.2; the photos:investigate path is fast enough (~5–15s on a 5K-row manifest, no Dropbox calls) that running and inspecting the diff is acceptable. Claude's discretion to add if test-supporting.
- **External taxonomic API auto-resolution (GBIF/ITIS)** — Already deferred at the milestone level; restated here so Phase 27 doesn't sneak it back in via "small helper to look up unknown binomials."
- **Pre-filled `species-synonyms.csv` from the spike's known cases** — Rejected (D-08); every row should be a deliberate curator PR. Revisit only if curator productivity is bottlenecked by the empty-start.
- **Genus-wildcard synonyms** (`Grammia *` → `Apantesis *`) — Rejected for v2.2; per-binomial rows are the model. Trivial to add later (lookup falls through to genus-prefix scan) if curator volume warrants.
- **The lightbox close-button todo** (`.planning/todos/pending/2026-04-23-fix-close-button-on-lightbox.md`) matched Phase 27 weakly (keyword: "phase", area: ui, score 0.5). NOT folded — that's a UI bug for the lightbox component, not synonym curation. Stays in pending for a future UI phase.

</deferred>

---

*Phase: 27-Synonym Curation Pass*
*Context gathered: 2026-05-22*
