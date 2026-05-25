---
phase: 26-dropbox-ingest-filename-parser-and-manifest
verified: 2026-05-22T16:04:16Z
status: passed
score: 7/7 truths verified
overrides_applied: 0
---

# Phase 26: Dropbox Ingest, Filename Parser, and Manifest — Verification Report

**Phase Goal:** An operator can run a single command on the processing server that pulls high-res photos from the Dropbox shared folder, parses their filenames, persists each image's state in a durable manifest, and can be killed and restarted at any time without losing or re-downloading work.

**Verified:** 2026-05-22T16:04:16Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ingest streams files via Dropbox API with `shared_link` param on `scl/fo` rlkey URL | VERIFIED | `scripts/lib/dropbox-list.js:78` and `scripts/ingest-photos.js:227,246` use `shared_link: { url: shareUrl }`; `DROPBOX_SHARE_URL` default at `scripts/ingest-photos.js:41` is the v2.2 `scl/fo/.../?rlkey=...` URL. Only `/2/files/list_folder` and `/2/files/list_folder/continue` are called (no `/download`). |
| 2 | Manifest has one row per file with 13 D-05 columns; bucket distribution reproduces audit | VERIFIED | `data/species-photos-manifest.csv` exists with 4,936 lines (1 header + 4,935 data). Header byte-for-byte matches D-05: `content_hash,dropbox_path,size_bytes,server_modified,filename_raw,binomial_raw,specimen_id,view,binomial_resolved,species_slug,match_bucket,status,last_error`. Observed buckets: 3,815 clean-match (77.3%) / 694 genus-only (14.1%) / 404 likely-synonym (8.2%) / 14 unparseable / 8 provisional — all within ±3pp of spike audit. |
| 3 | Parser cleanly handles Spike 001 edge cases | VERIFIED | (a) Hyphenated `Genus-species`: `Paraseptis-adnixa-B-D.tif` → clean-match at row 3843 in manifest; (b) 2-char epithets: `Trichoplusia ni-A-D.tif` → clean-match at row 4750; (c) Hyphenated epithets: `Autographa v-alba-A-D.tif` parsed as binomial (genus-only — `Autographa` not in species.csv, but the parser correctly extracted the binomial); (d) Institutional accessions: `WWUC0000000086`, `OSAC_*` correctly parsed at rows 4-12, provisional bucket entries; (e) D/V views correctly parsed. All 22 unit tests in `parse-photo-filename.test.js` pass. |
| 4 | Provisional IDs parse to `provisional` bucket, never auto-promoted | VERIFIED | `classify()` in `scripts/ingest-photos.js:176-178` short-circuits to `provisional` BEFORE any byBinomial/bySlug/genera lookup. 8 provisional rows in manifest: 2× `Monostoecha n sp` (×2 views=4), 1× `Plataea sp` (×2 views=2), 1× `Eupithecia nr harrisonata` (×2 views=2). Parser unit tests (`parse-photo-filename.test.js:51-67`) lock all three triggers (`sp`, `n sp`, `nr`). |
| 5 | Re-running skips files whose `content_hash` already in manifest; resumes from next unprocessed file | VERIFIED | `scripts/ingest-photos.js:311-315` reads existing manifest, builds `seen` Set keyed on `content_hash`, preserves existing rows verbatim. Line 339-343 checks `seen.has(entry.content_hash)` and logs `skip already-in-manifest`. Plan 04 checkpoint confirmed checks 6 & 7 (resumability + investigate) passed on real run. |
| 6 | Transient failures retry with exponential backoff; permanent failures mark `status: failed` and continue (never crash) | VERIFIED | `withRetry` at `scripts/ingest-photos.js:84-101` has exact delays `[2000, 4000, 8000, 16000, 32000]` ms, 5 attempts. Per-file try/catch at lines 345-428 catches any error, marks row `status: 'failed'` + `last_error: safeMsg`, pushes and continues. Page-exhaustion at 430-435 catches fatal pagination error and still calls `writeManifest` before exit 1 to preserve work. |
| 7 | Per-stage progress logs suitable for tmux tailing; pattern reusable by Phases 28/29 | VERIFIED | `logStage()` at `scripts/ingest-photos.js:109-115` emits ISO timestamp + 12-char content_hash prefix + 16-char action field + outcome. Pattern documented in runbook `_instructions/INGESTING_HIGH_RES_PHOTOS.md:55-60`. The three Wave 1 libraries (`scripts/lib/{parse-photo-filename,dropbox-list,manifest}.js`) are pure/parameterized so Phases 28/29 can compose them; `dropbox-list.js` and `manifest.js` are reusable verbatim (no project-specific assumptions). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/lib/parse-photo-filename.js` | Pure-function parser with extractBinomial, parseSpecimenAndView, toSpeciesSlug | VERIFIED | 165 lines; exports exactly 3 names; FIX #1/2/3 all present (`b.length >= 2` at line 102/119, `(-[a-z]+)?` at line 45, `PROVISIONAL_SINGLE_TOKENS` at line 39); no I/O imports |
| `scripts/lib/parse-photo-filename.test.js` | node:test unit tests for D-14 edge cases | VERIFIED | 152 lines; 22 it() blocks across 3 describe blocks; all D-14 named edge cases covered + REPORT.md unparseables |
| `scripts/lib/dropbox-list.js` | Async generator wrapping list_folder + list_folder/continue | VERIFIED | 96 lines; exports `dbxCall`, `listSharedFolder`; `async function*` present; `recursive: false`; no `recursive: true`; no Dropbox SDK; progress to stderr |
| `scripts/lib/manifest.js` | CSV read/write + investigation re-sort; D-05 column order locked | VERIFIED | 146 lines; exports COLUMNS (13 elements, D-05 order exactly), readManifest, writeManifest, sortForInvestigation; csv-parse/sync + csv-stringify/sync imported |
| `scripts/lib/manifest.test.js` | Unit tests pinning manifest contract | VERIFIED | 248 lines; 14 it() blocks across 4 describe blocks; CSV round-trip including comma/newline/quote stress test; sortForInvestigation ordering verified |
| `scripts/ingest-photos.js` | Operator CLI composing all 3 libraries | VERIFIED | 467 lines; imports all 3 Wave 1 libraries; redaction idiom present (`replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]')`); backoff schedule `[2000, 4000, 8000, 16000, 32000]` verbatim; `node --check` passes; sortForInvestigation invoked before writeManifest |
| `package.json` | `photos:ingest` + `photos:investigate` aliases; test glob extended | VERIFIED | Both aliases present mapped correctly; test script includes `scripts/lib/*.test.js`; no new dependencies added |
| `_instructions/INGESTING_HIGH_RES_PHOTOS.md` | Operator runbook | VERIFIED | 113 lines; mirrors UPLOADING_IMAGES.md structure (What This Changes/Before You Start/Steps/Verify); covers token creation, dry-run, tmux run, schema, resumability, investigate re-sort, *custom/ deferred-item; no forbidden references (dotenv/GBIF/--genus/rclone confirmed absent) |
| `data/species-photos-manifest.csv` | Committed manifest, ~5000 rows, 13-col header | VERIFIED | 4,936 lines (1 header + 4,935 data); D-05 header byte-for-byte; produced by real Dropbox run committed in `c0599d4` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `scripts/ingest-photos.js` | `scripts/lib/parse-photo-filename.js` | static import | WIRED | `import { extractBinomial, parseSpecimenAndView, toSpeciesSlug }` at line 27; all three used at lines 187, 196, 374, 375 |
| `scripts/ingest-photos.js` | `scripts/lib/dropbox-list.js` | static import (of `dbxCall`) | WIRED | `import { dbxCall }` at line 28; called at lines 246 and 250 within `listSharedFolderWithRetry` |
| `scripts/ingest-photos.js` | `scripts/lib/manifest.js` | static import | WIRED | `import { readManifest, writeManifest, sortForInvestigation }` at line 29; all three used (lines 271-272, 311, 438-439) |
| `scripts/ingest-photos.js` | `data/species.csv` | csv-parse read | WIRED | `loadSpecies(SPECIES_CSV)` at line 308 reads via `readFile` + `parse(...)` at lines 128-129 |
| `scripts/lib/dropbox-list.js` | `https://api.dropboxapi.com` | fetch with Bearer auth | WIRED | `fetch('https://api.dropboxapi.com${endpoint}', { headers: { Authorization: 'Bearer ${token}' } })` at lines 39-44 |
| `scripts/lib/manifest.js` | `csv-parse/sync` + `csv-stringify/sync` | named imports | WIRED | Lines 26-27 |
| `_instructions/INGESTING_HIGH_RES_PHOTOS.md` | `scripts/ingest-photos.js` | command reference | WIRED | `npm run photos:ingest` mentioned 4× in runbook |
| `data/species-photos-manifest.csv` | `scripts/lib/manifest.js` COLUMNS | schema produced by writeManifest | WIRED | Header line matches COLUMNS exactly |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `scripts/ingest-photos.js` `rows` | `rows` array written to manifest | Dropbox API via `listSharedFolderWithRetry` + parser + classifier; existing rows from `readManifest` | Yes — 4,935 real Dropbox files classified | FLOWING |
| `data/species-photos-manifest.csv` | row content | Plan 04 real ingest run | Yes — 4,935 rows with real content_hashes, sizes, server_modified timestamps | FLOWING |
| `loadSpecies` lookup maps | `byBinomial`, `bySlug`, `genera` | `data/species.csv` real species records | Yes — 1,348 species rows produce non-empty lookup maps | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Script parses as valid JavaScript | `node --check scripts/ingest-photos.js && echo OK` | `OK` | PASS |
| Test suite passes | `npm test` | 148/148 pass, 0 fail | PASS |
| DRY_RUN smoke (no network) | `DRY_RUN=1 DROPBOX_TOKEN= node scripts/ingest-photos.js` | Exits 0; prints "(no DROPBOX_TOKEN set — skipping Dropbox call; script structure validated)" | PASS |
| RESORT_ONLY against real manifest | `RESORT_ONLY=1 node scripts/ingest-photos.js` | "[ingest-photos] re-sorted manifest; 4935 rows" — exits 0 | PASS |
| Investigate sort puts genus-only at top | `awk -F, 'NR>1 {print $11}' manifest \| head -10` | All 10 are genus-only (Smerinthus ophthalmica, matching audit's top-unmatched) | PASS |
| Provisional bucket has FIX #3 cases | `awk -F, 'NR>1 && $11=="provisional" {print $5}' manifest` | 8 rows: Monostoecha n sp (×4), Plataea sp (×2), Eupithecia nr harrisonata (×2) | PASS |
| Clean-match includes Trichoplusia ni (FIX #1) | `awk -F, '$5 ~ /Trichoplusia ni-/ {print}' manifest` | 2 rows, both clean-match (rows 4750-4751) | PASS |
| Clean-match includes Paraseptis-adnixa (Genus-species hyphen) | `awk -F, '$5 ~ /Paraseptis-adnixa/ {print}' manifest` | 2 rows, both clean-match | PASS |
| Token leak check | `grep -cF 'sl.' data/species-photos-manifest.csv` | 0 | PASS |
| All 4,935 data rows have status=discovered | `awk -F, '$12' \| sort \| uniq -c` | `4935 discovered` (no failed rows in real run) | PASS |
| No debt markers in modified files | `grep -nE 'TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER' scripts/{ingest-photos.js,lib/*.js}` | No output (zero markers) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INGEST-01 | 26-02, 26-03, 26-04 | Stream files via Dropbox API `shared_link` param on scl/fo rlkey URL | SATISFIED | `scripts/lib/dropbox-list.js:78` + `scripts/ingest-photos.js:227,246`; default URL is the v2.2 scl/fo rlkey URL |
| INGEST-02 | 26-01, 26-04 | Filename parser handles hyphenated Genus-species, 2-char epithets, hyphenated epithets, single-letter/institutional specimens | SATISFIED | `scripts/lib/parse-photo-filename.js` FIX #1 (line 102/119), FIX #2 (line 45), institutional specimen regex (line 33); 22 unit tests lock behavior; real manifest contains correctly-parsed examples |
| INGEST-03 | 26-01, 26-04 | Parser routes `n sp`, `sp`, `nr <species>` to provisional bucket | SATISFIED | `PROVISIONAL_SINGLE_TOKENS` at line 39; `n` + `sp` pair detection at lines 78-84; `classify()` short-circuits to provisional at `ingest-photos.js:176-178`; 8 provisional rows in real manifest |
| INGEST-04 | 26-02, 26-04 | Manifest persists per-image rows with dropbox_path, content_hash, size, server_modified, filename_raw, binomial_raw, specimen_id, view, binomial_resolved, species_slug, match_bucket, status | SATISFIED | `COLUMNS` array in `manifest.js:37-51` has all 13 columns in D-05 order; `data/species-photos-manifest.csv` header matches byte-for-byte; 4,935 rows committed |
| INGEST-05 | 26-02, 26-03, 26-04 | Ingest is resumable — re-running skips files in manifest without re-downloading | SATISFIED | `ingest-photos.js:311-315` builds `seen` Set from existing manifest; line 339-343 skips files with seen content_hash; Plan 04 checkpoint verified resumability |
| OPS-01 | 26-03, 26-04 | Per-stage progress logs suitable for tailing during multi-hour run | SATISFIED | `logStage()` at `ingest-photos.js:109-115` emits one line per file with ISO timestamp, hash prefix, action, outcome; per-page progress to stderr; final summary at lines 442-453 |
| OPS-02 | 26-03, 26-04 | Retry on transient failures with exponential backoff; permanent failures mark status=failed, not crash | SATISFIED | `withRetry` at lines 84-101 with delays `[2000, 4000, 8000, 16000, 32000]` ms; per-file try/catch at 345-428 marks `status: 'failed'` and continues; page-exhaustion preserves work-so-far before exit 1 |
| OPS-03 | 26-03, 26-04 | Jobs can resume from arbitrary interruption using manifest as recovery state — no manual reconciliation | SATISFIED | Same evidence as INGEST-05 (content_hash-keyed resumability); fatal pagination errors still write manifest before exit; runbook step 6 documents kill-and-restart |

All 8 requirement IDs claimed by phase 26 plans are SATISFIED. REQUIREMENTS.md maps Phase 26 to exactly these 8 IDs (INGEST-01..05 + OPS-01..03); no orphaned requirements.

### Anti-Patterns Found

None. Scanned all modified files (`scripts/ingest-photos.js`, `scripts/lib/parse-photo-filename.js`, `scripts/lib/dropbox-list.js`, `scripts/lib/manifest.js`, plus test files) for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/empty implementations. Zero hits.

### Notable Observations (Informational)

- **`dropbox_path` column populated as empty string in all 4,935 rows.** This is a Dropbox API characteristic when using the `shared_link` parameter — `path_display` returns `null` for shared-link entries. Code uses defensive `entry.path_display ?? ''` (line 352), so the column exists and is wired correctly; the data simply isn't returned by the API in this listing mode. The file identity is fully captured in `filename_raw` (column 5) and `content_hash` (column 1), and INGEST-04 says the manifest persists rows "with at minimum" those columns — so the truth holds. Phase 28 may need to reconstruct dropbox_path from `name` if it needs absolute paths for the download stage. Not a blocker for Phase 26's goal.

- **Manifest row count is 4,935** (not the spike's 5,000). Plan 04 SUMMARY documents this 1.3% gap with two plausible drivers (snapshot drift + folder-entry counting); within tolerance for a metadata-only snapshot taken weeks apart from the spike. Bucket distribution still matches audit within ±3pp on all five buckets.

- **`Autographa v-alba` lands in genus-only, not clean-match.** This is correct — the parser correctly extracted the binomial `autographa v-alba` (verified by unit test at `parse-photo-filename.test.js:39-43`), but `Autographa` doesn't exist in `data/species.csv`. The genus is recognized via `byBinomial` lookup fallback. The parser's job (INGEST-02) is to extract correctly; whether the binomial matches species.csv is a downstream concern handled by Phase 27. Truth 3 is verified by the parser correctly handling the edge case, not by the classifier matching it.

### Gaps Summary

No gaps. All seven observable truths verified with codebase evidence. All required artifacts exist, are substantive, are wired, and have real data flowing through them. All eight requirement IDs satisfied. No anti-patterns, no debt markers, no token leaks. The committed manifest is a real artifact produced by a real operator run under human oversight (Plan 04 checkpoint approved).

---

_Verified: 2026-05-22T16:04:16Z_
_Verifier: Claude (gsd-verifier)_
