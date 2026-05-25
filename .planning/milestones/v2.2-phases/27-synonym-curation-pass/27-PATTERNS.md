# Phase 27: Synonym Curation Pass — Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 4 (1 new data + 1 modified script + 1 new doc + 1 new test)
**Analogs found:** 4 / 4 (every artifact has a strong Phase 26 sibling)

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/species-synonyms.csv` | data file (committed seed; header-only) | n/a (flat CSV) | `data/images.csv` + `data/species.csv` | exact (flat-CSV ethos sibling) |
| `scripts/ingest-photos.js` (modified) | CLI script — classify cascade pre-pass | transform (binomial → `{binomial_resolved, species_slug}`) | itself: `loadSpecies()` lines 127-144 + `classify()` lines 173-213 | exact (extending its own shape) |
| `_instructions/CURATING_SPECIES_SYNONYMS.md` | operator/curator runbook | n/a (Markdown) | `_instructions/INGESTING_HIGH_RES_PHOTOS.md` (Phase 26) + `_instructions/UPLOADING_IMAGES.md` (Phase 13) | exact (same audience, same shape) |
| `scripts/ingest-photos.test.js` (or extension of an existing test file) | unit / integration test for classify cascade | n/a | `scripts/lib/manifest.test.js` (round-trip + sort tests) + `scripts/lib/parse-photo-filename.test.js` (pure-function table tests) | exact (Phase 26's RED-then-GREEN TDD shape) |

---

## Pattern Assignments

### `data/species-synonyms.csv` (data file, committed seed)

**Primary analog:** `data/species.csv` (header on line 1, all subsequent lines are data; UTF-8; no BOM).
**Secondary analog:** `data/images.csv` (sibling Phase 13 flat manifest — same directory, same "non-technical curators edit it in a spreadsheet" audience, same PR-as-audit-trail ethos).

D-08 ships the file with the **header line only** — no pre-filled synonyms. Every row is a deliberate curator PR.

**Schema (D-01):** exactly two columns, in this order:

```
from_binomial,to_species_slug
```

- `from_binomial` matches `binomial_raw` in `data/species-photos-manifest.csv` exactly: lowercased, space-separated form (D-02). Example: `grammia nevadensis`, `smerinthus ophthalmica`, `monostoecha n sp`.
- `to_species_slug` matches the slug shape in `data/species.csv` (lowercase, hyphen-joined; the form produced by `toSpeciesSlug()` in `scripts/lib/parse-photo-filename.js:162-165`). Example: `apantesis-nevadensis`.

**File content for the Phase 27 seed commit** (D-08 — header only, terminating newline):

```csv
from_binomial,to_species_slug
```

**Sibling shape reference** (`data/species.csv` header, for ethos comparison):

```csv
id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily
```

The Phase 27 schema is deliberately a 2-column subset of that flat-CSV ethos. D-01 rejects a `decided_by`/`decided_on`/`note` extension; PR diff history is the audit trail.

**Read-first material for the executor:**
- CONTEXT.md D-01, D-02, D-08 (canonical schema + seed-file contract)
- `data/species.csv` lines 1-3 (the slug column to match against)
- `data/images.csv` (sibling flat-file precedent)

---

### `scripts/ingest-photos.js` (modified — add synonyms pre-pass)

**Primary analog:** the script's own existing `loadSpecies()` helper (lines 127-144) and `classify()` cascade (lines 173-213). Phase 27 extends both surfaces with minimal diff.

**The four edits** (concrete; no other source touches):

1. **Add `loadSynonyms(csvPath, species)`** — sibling helper next to `loadSpecies()`. First-run-safe; returns an empty Map if the file is absent (matches the `readManifest` pattern at `scripts/lib/manifest.js:73-77`). Load-time validates each row's `to_species_slug` against `species.bySlug`; rows whose target is missing emit a single `logStage(..., 'synonym-warn', 'target-not-in-species-csv', ...)` and are dropped from the map (D-04).

2. **Call `loadSynonyms()` once at startup** — alongside `loadSpecies()` in `main()` (current line 308). Pass the resulting Map into `classify()`.

3. **Add a pre-pass at the top of `classify()`** — BEFORE the `bucketHintFromParser === 'provisional'` short-circuit at line 176, so D-06 widens the routable buckets (provisional and unparseable get re-routed when synonyms.csv has a matching `from_binomial`).

4. **No other touchpoints.** `scripts/lib/manifest.js`, `scripts/lib/parse-photo-filename.js`, `scripts/lib/dropbox-list.js` are NOT modified. `package.json` aliases are unchanged (`photos:ingest` and `photos:investigate` already exist; their behavior is enriched, not their CLI shape).

#### Pattern excerpt — `loadSpecies()` is the shape to mirror

Source: `scripts/ingest-photos.js:117-144`:

```js
/**
 * Load `data/species.csv` and build the three lookup structures used by
 * classify():
 *   byBinomial: Map<"genus species" (lowercased), record>
 *   bySlug:     Map<"genus-species" (lowercased), record>
 *   genera:     Set<lowercased genus>
 *
 * Ported from spike parse-classify.mjs:84-101 with the hand-rolled CSV parser
 * replaced by csv-parse/sync (same library Phase 13 uses).
 */
async function loadSpecies(csvPath) {
  const raw = await readFile(csvPath);
  const records = parse(raw, { columns: true, skip_empty_lines: true });
  const byBinomial = new Map();
  const bySlug = new Map();
  const genera = new Set();
  for (const r of records) {
    const genus = (r.genus || '').trim();
    const species = (r.species || '').trim();
    if (!genus || !species) continue;
    const binomial = `${genus} ${species}`.toLowerCase();
    const slug = `${genus}-${species}`.toLowerCase();
    byBinomial.set(binomial, r);
    bySlug.set(slug, r);
    genera.add(genus.toLowerCase());
  }
  return { byBinomial, bySlug, genera };
}
```

`loadSynonyms()` should mirror this verbatim (same imports — `readFile`, `parse` from `csv-parse/sync`, both already imported at lines 24-25). Differences: (a) wrap the body in an `existsSync` guard returning an empty Map for first-run safety; (b) resolve each `to_species_slug` against `species.bySlug` at load time; (c) emit `synonym-warn` via `logStage()` for orphans.

Shape suggestion:

```js
import { existsSync } from 'node:fs';

const SYNONYMS_CSV = resolve('data/species-synonyms.csv');

/**
 * Load `data/species-synonyms.csv` and build the synonym lookup used by
 * classify()'s pre-pass. First-run safe: returns an empty Map when the file
 * does not exist (matches scripts/lib/manifest.js:73-77).
 *
 * Each row resolves to { binomial_resolved, species_slug } at load time so the
 * pre-pass is a single Map.get() per row. Rows whose to_species_slug is not
 * present in species.bySlug are dropped and a synonym-warn line is logged
 * once (D-04).
 *
 * Returns: Map<from_binomial, { binomial_resolved, species_slug }>
 */
async function loadSynonyms(csvPath, species) {
  if (!existsSync(csvPath)) return new Map();
  const raw = await readFile(csvPath);
  const records = parse(raw, { columns: true, skip_empty_lines: true });
  const synonyms = new Map();
  for (const r of records) {
    const from = (r.from_binomial || '').trim().toLowerCase();
    const to = (r.to_species_slug || '').trim().toLowerCase();
    if (!from || !to) continue;
    const target = species.bySlug.get(to);
    if (!target) {
      logStage('', 'synonym-warn', 'target-not-in-species-csv', `${from} → ${to}`);
      continue;
    }
    // Reconstruct the resolved binomial from the species.csv record so the
    // manifest row carries the same "genus species" lowercase form Phase 26
    // emits for clean-match rows.
    const resolvedBinomial = `${(target.genus || '').toLowerCase()} ${(target.species || '').toLowerCase()}`.trim();
    synonyms.set(from, { binomial_resolved: resolvedBinomial, species_slug: to });
  }
  return synonyms;
}
```

#### Pattern excerpt — the `classify()` cascade and where to inject

Source: `scripts/ingest-photos.js:173-213`:

```js
/**
 * Match cascade. Order (locked by the spike-findings skill reference
 * §"Match cascade", with the D-14 FIX #3 provisional short-circuit prepended):
 *
 *   0. provisional   — bucketHintFromParser === 'provisional'  (FIX #3, MUST NOT
 *                      be auto-promoted; CONTEXT.md success criterion #4)
 *   1. clean-match   — binomial in byBinomial
 *   2. slug-match    — slug in bySlug   (kept for safety; spike audit hit 0%)
 *   3. genus-only    — first token in genera
 *   4. likely-synonym— neither genus nor species in current data
 *   5. unparseable   — binomial null AND bucketHint null
 *
 * ...
 * Returns: { match_bucket, binomial_resolved, species_slug }
 */
function classify({ binomialFromParser, bucketHintFromParser }, species) {
  // 0. Provisional short-circuit — FIX #3. The parser's bucketHint must not be
  //    overridden even if a binomial-like substring would otherwise match.
  if (bucketHintFromParser === 'provisional') {
    return { match_bucket: 'provisional', binomial_resolved: '', species_slug: '' };
  }

  // 5. Unparseable — neither a clean binomial nor a provisional marker.
  if (!binomialFromParser) {
    return { match_bucket: 'unparseable', binomial_resolved: '', species_slug: '' };
  }

  // 1. Clean match against byBinomial.
  if (species.byBinomial.has(binomialFromParser)) { ... }
  // 2. slug match ...
  // 3. genus-only ...
  // 4. likely-synonym ...
}
```

**Phase 27 injection point:** insert the synonym pre-pass as **step −1**, BEFORE the existing step 0 (provisional short-circuit), and BEFORE step 5 (unparseable). This honors D-06: any non-empty `binomial_raw` is routable through synonyms.csv, including provisional and unparseable rows.

The signature changes to accept the synonyms Map as a third arg (or by widening the second arg's shape — Claude's discretion per D-09; signature change is the lower-friction option):

```js
function classify({ binomialFromParser, bucketHintFromParser }, species, synonyms) {
  // −1. Synonym pre-pass (Phase 27, D-04, D-06). Applies BEFORE the provisional
  //     and unparseable short-circuits so a curator can re-route any row with
  //     a non-empty binomial_raw.
  //
  //     Note: the lookup key is binomialFromParser, which Phase 26 normalizes
  //     to lowercase 'genus species'. For provisional rows the parser returns
  //     binomialFromParser === null (the bucketHint carries 'provisional'), so
  //     they fall through to the next branch unchanged UNLESS a non-null
  //     binomial substring was extracted. D-06 specifies that
  //     provisional/unparseable routing happens via binomial_raw on the
  //     manifest row, not the parser's transient state — so the caller passes
  //     the manifest row's binomial_raw down here in lieu of binomialFromParser
  //     when re-classifying via photos:investigate. See the RESORT_ONLY path.
  if (binomialFromParser && synonyms.has(binomialFromParser)) {
    const { binomial_resolved, species_slug } = synonyms.get(binomialFromParser);
    return { match_bucket: 'resolved-via-synonym', binomial_resolved, species_slug };
  }

  // 0. Provisional short-circuit (unchanged from Phase 26).
  if (bucketHintFromParser === 'provisional') {
    return { match_bucket: 'provisional', binomial_resolved: '', species_slug: '' };
  }
  // ... rest unchanged ...
}
```

#### The RESORT_ONLY path needs synonym-aware re-classification

Source: `scripts/ingest-photos.js:267-275`:

```js
async function main() {
  // --- RESORT_ONLY: re-sort the existing manifest in place; no Dropbox calls. ---
  if (RESORT_ONLY) {
    const existing = await readManifest(MANIFEST_PATH);
    const sorted = sortForInvestigation(existing);
    await writeManifest(MANIFEST_PATH, sorted);
    console.log(`[ingest-photos] re-sorted manifest; ${sorted.length} rows`);
    return;
  }
  // ...
}
```

**Phase 27 modification:** before `sortForInvestigation()`, walk each row and re-classify based on the current `binomial_raw` value against the synonyms Map. D-05 makes `photos:investigate` the curator's daily-use command: edit synonyms.csv → run → manifest reclassified + re-sorted.

Pattern (replace the RESORT_ONLY block with):

```js
if (RESORT_ONLY) {
  const species = await loadSpecies(SPECIES_CSV);
  const synonyms = await loadSynonyms(SYNONYMS_CSV, species);
  const existing = await readManifest(MANIFEST_PATH);

  // Re-classify each row using its existing binomial_raw (not the parser).
  // Phase 27 D-06: any non-empty binomial_raw is routable through synonyms.csv.
  let promoted = 0;
  for (const row of existing) {
    const binomial = (row.binomial_raw || '').toLowerCase();
    if (binomial && synonyms.has(binomial)) {
      const { binomial_resolved, species_slug } = synonyms.get(binomial);
      // Only count an actual change (idempotent re-run protection).
      if (row.match_bucket !== 'resolved-via-synonym' || row.species_slug !== species_slug) {
        row.match_bucket = 'resolved-via-synonym';
        row.binomial_resolved = binomial_resolved;
        row.species_slug = species_slug;
        promoted++;
        logStage(row.content_hash, 'reclassify', 'resolved-via-synonym', `${binomial} → ${species_slug}`);
      }
    }
  }

  const sorted = sortForInvestigation(existing);
  await writeManifest(MANIFEST_PATH, sorted);
  console.log(`[ingest-photos] re-sorted manifest; ${sorted.length} rows; ${promoted} promoted to resolved-via-synonym`);
  return;
}
```

The full-ingest path (`main()` below the RESORT_ONLY block) also passes `synonyms` into `classify()` — the same Map is consulted on both fresh classifications (new Dropbox rows) and re-classifications (existing rows during `photos:investigate`).

#### Per-stage log lines (existing `logStage` helper, reused)

Source: `scripts/ingest-photos.js:103-115`:

```js
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```

Phase 27 reuses this verbatim. New action values:
- `'synonym-warn'` — emitted at load time when `to_species_slug` is not in `species.bySlug`. Outcome: `'target-not-in-species-csv'`. Extra: `<from_binomial> → <to_species_slug>`.
- `'reclassify'` — emitted per row promoted to `resolved-via-synonym` during the RESORT_ONLY path. Outcome: `'resolved-via-synonym'`. Extra: `<binomial_raw> → <species_slug>`.

No changes to the helper itself.

#### Imports — additions only

Source: `scripts/ingest-photos.js:23-29` (current imports):

```js
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

import { extractBinomial, parseSpecimenAndView, toSpeciesSlug } from './lib/parse-photo-filename.js';
import { dbxCall } from './lib/dropbox-list.js';
import { readManifest, writeManifest, sortForInvestigation } from './lib/manifest.js';
```

Phase 27 adds one symbol from `node:fs` for the first-run-safe guard:

```js
import { existsSync } from 'node:fs';
```

Note: `existsSync` is already imported inside `scripts/lib/manifest.js:29` — using the same import elsewhere in the project is the established pattern.

#### Module-level path constant

Source: `scripts/ingest-photos.js:36-37`:

```js
const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const SPECIES_CSV = resolve('data/species.csv');
```

Phase 27 adds one constant:

```js
const SYNONYMS_CSV = resolve('data/species-synonyms.csv');
```

Project convention (PROJECT.md Key Decisions; 26-PATTERNS.md "Shared Patterns §1"): every `scripts/` file declares `const FOO = resolve('path/to/foo')` and `const FOO = process.env.FOO ?? 'default'` at module top.

**Read-first material for the executor:**
- `scripts/ingest-photos.js` entire file (only ~470 lines; the modifications cluster around lines 36-37, 117-144, 173-213, 267-275, 308)
- `scripts/lib/manifest.js:73-77` (the `existsSync` first-run-safe read pattern)
- `scripts/lib/parse-photo-filename.js:162-165` (`toSpeciesSlug` — useful in tests / curator-facing utilities, not used inside the script itself for Phase 27)
- CONTEXT.md D-04 (pre-pass placement), D-05 (auto-load semantics), D-06 (bucket-agnostic widening), D-09 (load-helper shape latitude)

---

### `_instructions/CURATING_SPECIES_SYNONYMS.md` (curator/operator runbook)

**Primary analog:** `_instructions/INGESTING_HIGH_RES_PHOTOS.md` (Phase 26; same audience, same tone, same v2.2 milestone).
**Secondary analog:** `_instructions/UPLOADING_IMAGES.md` (Phase 13; the section structure all v2.x runbooks mirror).

Both analogs use this skeleton, locked by L-05 of CONTEXT.md:

1. `# Task: <action-oriented title>`
2. `## What This Changes`
3. `## Before You Start`
4. `## Steps` — numbered
5. `## Verify`
6. (optional) `## When Things Go Wrong` or `## WARNING:` callout

**Header / "What This Changes" pattern** — mirror `INGESTING_HIGH_RES_PHOTOS.md:1-8`:

```markdown
# Task: Curate Species Synonyms

## What This Changes

- `data/species-synonyms.csv` — new rows you author; one per `from_binomial → to_species_slug` decision
- `data/species-photos-manifest.csv` — rows whose `binomial_raw` matches one of your decisions get re-routed to `match_bucket: resolved-via-synonym` with `binomial_resolved` + `species_slug` populated from `data/species.csv`
- **No** Dropbox API calls, **no** bunny.net writes, **no** file downloads — synonym curation is an in-repo edit + re-classify loop
```

**"Before You Start" pattern** — mirror `INGESTING_HIGH_RES_PHOTOS.md:11-17`:

```markdown
## Before You Start

You will need:
- **Node 24** — matches `.nvmrc`. Verify with `node --version`
- A spreadsheet program (Excel, LibreOffice Calc, or Google Sheets imported the CSV) to read `data/species-photos-manifest.csv`
- A text editor for `data/species-synonyms.csv` — direct CSV editing is fine; the file is two columns, header on line 1

You do NOT need a Dropbox token for this task. Phase 27 curation is offline.
```

**"Steps" pattern** — mirror the numbered-step convention from both analogs. CONTEXT.md "Specifics" calls out that the runbook MUST quote the top-12 investigation binomials verbatim so the curator immediately knows which decisions to make first.

Suggested numbered steps:

1. **Open the manifest in a spreadsheet** — `data/species-photos-manifest.csv`. Phase 26's `sortForInvestigation` already surfaces the highest-impact rows at the top (investigation buckets, ordered by binomial_raw frequency desc). Work top-down.
2. **Identify a `from_binomial` to re-route** — the top of the file shows the highest-frequency unmatched binomials. CONTEXT.md "Specifics" enumerates the v2.2 leaders: quote those 12 verbatim so the curator can scan them.
3. **Look up the target species** — find a row in `data/species.csv` with matching `genus` + `species`. The `slug` is `lower(genus + '-' + species)`. Example: `Apantesis,nevadensis` → `apantesis-nevadensis`.
4. **Add a row to `data/species-synonyms.csv`** — exactly two columns, both lowercase:
   ```
   grammia nevadensis,apantesis-nevadensis
   ```
5. **Re-classify the manifest** — run `npm run photos:investigate`. This re-loads the synonyms.csv, walks every manifest row, promotes matches to `resolved-via-synonym`, and re-sorts. No Dropbox traffic.
6. **Confirm the promotion** — re-open the manifest; the rows you just routed should no longer be at the top of the investigation queue. The final summary line on stdout shows the per-bucket distribution.
7. **Commit the synonyms.csv change AND the manifest change in the same PR** — D-01 explicitly relies on git history as the audit trail. The diff is your "why we made this decision" record.

**"Verify" pattern** — mirror `INGESTING_HIGH_RES_PHOTOS.md:98-106`:

```markdown
## Verify

In a spreadsheet view of `data/species-photos-manifest.csv`:

- The rows you re-routed have `match_bucket = resolved-via-synonym`
- `binomial_resolved` and `species_slug` columns are populated (not empty)
- `status` remains `discovered` (Phase 28 uses `status`, not `match_bucket`, to gate downloads)

On the command line:

- `tail` of `npm run photos:investigate` output shows the new `resolved-via-synonym` count in the per-bucket distribution
- The clean-or-resolved match rate (clean-match + resolved-via-synonym, divided by total rows) is climbing toward the ≥95% target (L-04)
```

**"When Things Go Wrong" pattern** — mirror `INGESTING_HIGH_RES_PHOTOS.md:108-114`. For Phase 27 the failure modes are narrow:

- `synonym-warn target-not-in-species-csv …` in the log → the `to_species_slug` you typed is not in `data/species.csv`. Open species.csv, search for the genus, find the correct slug (lowercase, hyphen-joined).
- The manifest row you expected to promote did not move → check that `from_binomial` exactly matches `binomial_raw` from the manifest (lowercased, space-separated, no trailing whitespace).

**Top-12 investigation binomials block** — CONTEXT.md "Specifics" lists them verbatim. Quote them in a markdown table or fenced block under Step 2 so a non-developer opening the runbook sees them immediately:

```
smerinthus ophthalmica (32 files)
grammia nevadensis (10)
sericosema wilsonensis (8)
pheosia rimosa (8)
pero occidentalis (8)
macaria signaria (8)
iridopsis emasculatum (8)
hydriomena irata (8)
dysstroma hersiliata (8)
drepanulatrix hulstii (8)
drepanulatrix bifilata (8)
digrammia muscariata (8)
```

**Concrete things NOT to include** (CONTEXT.md "Deferred Ideas"):
- Any mention of GBIF/ITIS or external taxonomic API lookup.
- Any reference to a `decided_by` / `decided_on` / `note` column on synonyms.csv.
- A "preview mode" / dry-run flag for synonym application.
- Genus-wildcard syntax (`Grammia * → Apantesis *`).
- The `*custom/` Dropbox subfolder (it's a Phase 26 deferred item, irrelevant to curation).

**Read-first material for the executor:**
- `_instructions/INGESTING_HIGH_RES_PHOTOS.md` (entire file — port the shape and tone exactly)
- `_instructions/UPLOADING_IMAGES.md` (entire file — sibling Phase 13 runbook; same audience)
- CONTEXT.md "Specifics" §"Top investigation binomials" (the verbatim list to quote)
- CONTEXT.md L-05 (the runbook is REQUIRED and its section structure is locked)

---

### Test(s) for the synonym-aware classify cascade

**Primary analog:** `scripts/lib/manifest.test.js` (round-trip + sort tests; `describe`/`it` shape with `node:test`).
**Secondary analog:** `scripts/lib/parse-photo-filename.test.js` (table-driven tests for a pure function with multiple branches).

**TDD discipline (D-10):** Phase 26 committed RED tests then GREEN implementation in separate commits. The git log shows the contract:

```
a15adc5 test(26-01): add failing tests for parse-photo-filename library
85ca485 test(26-02): add failing tests for scripts/lib/manifest.js
```

Both commits add only the test file; the implementation lands in the next commit per plan. CONTEXT.md "Established Patterns" §"TDD discipline" makes this the Phase 27 contract too.

**Test file location decision (D-10 — Claude's discretion):**

The implementation currently lives in `scripts/ingest-photos.js` (not in `scripts/lib/`), and the new logic is intertwined with `classify()` and the RESORT_ONLY branch of `main()`. Two viable test placements:

| Option | Test file | Pros | Cons |
|---|---|---|---|
| A. **Test the classify function directly** | `scripts/ingest-photos.test.js` (new) | Pure-function shape; fast; mirrors `parse-photo-filename.test.js` | Requires either exporting `classify()` + `loadSynonyms()` from ingest-photos.js, or extracting them to a new `scripts/lib/classify.js` module |
| B. **Test the RESORT_ONLY end-to-end behavior** | `scripts/ingest-photos.test.js` (new) | No refactor needed; exercises the full integration including manifest read/write | Slower (writes temp files); needs `execSync` like `migrate-species.test.js` |

**Recommendation:** Option A with a light refactor — export `classify()`, `loadSynonyms()`, and the `SYNONYMS_CSV` constant from `scripts/ingest-photos.js` (no behavior change; only adds `export` keywords). This matches Phase 26's pattern of unit-testing pure helpers and keeps the test runtime fast. The integration smoke is provided by running `npm run photos:investigate` on the real manifest during Phase 27 verification.

**Test file imports + shape** — copy from `scripts/lib/manifest.test.js:1-11`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { classify, loadSynonyms } from './ingest-photos.js';
```

**Test cases for `classify()` with synonyms** (D-04, D-06):

```js
describe('classify (with synonyms pre-pass)', () => {
  // Build a minimal species fixture once.
  const species = {
    byBinomial: new Map([
      ['apantesis nevadensis', { genus: 'Apantesis', species: 'nevadensis' }],
      ['abagrotis apposita',   { genus: 'Abagrotis', species: 'apposita' }],
    ]),
    bySlug: new Map([
      ['apantesis-nevadensis', { genus: 'Apantesis', species: 'nevadensis' }],
      ['abagrotis-apposita',   { genus: 'Abagrotis', species: 'apposita' }],
    ]),
    genera: new Set(['apantesis', 'abagrotis', 'grammia', 'monostoecha']),
  };
  const synonyms = new Map([
    ['grammia nevadensis', { binomial_resolved: 'apantesis nevadensis', species_slug: 'apantesis-nevadensis' }],
    ['monostoecha n sp',   { binomial_resolved: 'abagrotis apposita',   species_slug: 'abagrotis-apposita'   }],
  ]);

  it('promotes a genus-only binomial to resolved-via-synonym when synonyms.csv has a matching row', () => {
    const r = classify({ binomialFromParser: 'grammia nevadensis', bucketHintFromParser: null }, species, synonyms);
    assert.equal(r.match_bucket, 'resolved-via-synonym');
    assert.equal(r.binomial_resolved, 'apantesis nevadensis');
    assert.equal(r.species_slug, 'apantesis-nevadensis');
  });

  it('promotes a provisional-marked binomial through synonyms.csv (D-06 widening)', () => {
    const r = classify({ binomialFromParser: 'monostoecha n sp', bucketHintFromParser: 'provisional' }, species, synonyms);
    assert.equal(r.match_bucket, 'resolved-via-synonym');
    assert.equal(r.binomial_resolved, 'abagrotis apposita');
  });

  it('falls through to clean-match when synonyms.csv does not contain the binomial', () => {
    const r = classify({ binomialFromParser: 'abagrotis apposita', bucketHintFromParser: null }, species, synonyms);
    assert.equal(r.match_bucket, 'clean-match');
  });

  it('falls through to provisional when no synonym matches and the parser flagged provisional', () => {
    const r = classify({ binomialFromParser: null, bucketHintFromParser: 'provisional' }, species, synonyms);
    assert.equal(r.match_bucket, 'provisional');
  });

  it('falls through to unparseable when no synonym matches and the binomial is null', () => {
    const r = classify({ binomialFromParser: null, bucketHintFromParser: null }, species, synonyms);
    assert.equal(r.match_bucket, 'unparseable');
  });
});
```

**Test cases for `loadSynonyms()`** (D-04, D-09):

```js
describe('loadSynonyms', () => {
  const species = {
    byBinomial: new Map(),
    bySlug: new Map([['apantesis-nevadensis', { genus: 'Apantesis', species: 'nevadensis' }]]),
    genera: new Set(),
  };

  it('returns an empty Map when the file does not exist (first-run safe)', async () => {
    const missingPath = join(tmpdir(), `synonyms-missing-${Date.now()}.csv`);
    const result = await loadSynonyms(missingPath, species);
    assert.equal(result.size, 0);
  });

  it('returns an empty Map when the file has only the header (D-08 seed shape)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'syn-header-'));
    const path = join(dir, 's.csv');
    try {
      writeFileSync(path, 'from_binomial,to_species_slug\n');
      const result = await loadSynonyms(path, species);
      assert.equal(result.size, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('builds a one-row map for a single valid synonym', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'syn-one-'));
    const path = join(dir, 's.csv');
    try {
      writeFileSync(path, 'from_binomial,to_species_slug\ngrammia nevadensis,apantesis-nevadensis\n');
      const result = await loadSynonyms(path, species);
      assert.equal(result.size, 1);
      const entry = result.get('grammia nevadensis');
      assert.equal(entry.binomial_resolved, 'apantesis nevadensis');
      assert.equal(entry.species_slug, 'apantesis-nevadensis');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('drops a row whose to_species_slug is not in species.bySlug and emits a synonym-warn line', async () => {
    // synonym-warn is logged via console.log — capture or spy. For the RED commit
    // it's acceptable to just assert the row was dropped (size === 0 after one bad row).
    const dir = mkdtempSync(join(tmpdir(), 'syn-orphan-'));
    const path = join(dir, 's.csv');
    try {
      writeFileSync(path, 'from_binomial,to_species_slug\nfoo bar,nonexistent-slug\n');
      const result = await loadSynonyms(path, species);
      assert.equal(result.size, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

**`package.json` test runner registration** — the line at `package.json:24` already globs `scripts/lib/*.test.js`. If Phase 27's test lives at `scripts/ingest-photos.test.js`, add that path explicitly:

```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/ingest-photos.test.js scripts/migrate-species.test.js scripts/lib/*.test.js src/components/*.test.js src/_lib/*.test.js"
```

**RED-then-GREEN commit shape** — match the Phase 26 message format:

```
test(27-XX): add failing tests for synonym-aware classify cascade
```

Then in a separate commit:

```
feat(27-XX): synonyms.csv pre-pass in classify() promotes matched rows to resolved-via-synonym
```

**Read-first material for the executor:**
- `scripts/lib/manifest.test.js` (entire file — table-driven test shape with `describe`/`it`, tmp-dir setup/teardown, no input-mutation assertion)
- `scripts/lib/parse-photo-filename.test.js` lines 1-80 (pure-function table tests)
- `git show a15adc5` and `git show 85ca485` (Phase 26 RED commits — the test-first contract)
- CONTEXT.md "Established Patterns" §"TDD discipline"

---

## Shared Patterns

### 1. First-run-safe file read via `existsSync`

**Source:** `scripts/lib/manifest.js:73-77` (verbatim pattern for `readManifest`):

```js
import { existsSync } from 'node:fs';

export async function readManifest(path) {
  if (!existsSync(path)) return [];   // first run — no manifest yet
  const raw = await readFile(path);
  return parse(raw, { columns: true, skip_empty_lines: true });
}
```

**Apply to:** `loadSynonyms()` in `scripts/ingest-photos.js`. The synonyms.csv file does not exist on the very first Phase 27 commit (only the header line lands; on machines that pull before the commit, the file is absent). Returning an empty Map matches the "Phase 26 behavior unchanged" contract from CONTEXT.md "Established Patterns".

### 2. csv-parse/sync with `{ columns: true, skip_empty_lines: true }`

**Source:** `scripts/ingest-photos.js:129` and `scripts/lib/manifest.js:76`:

```js
const records = parse(raw, { columns: true, skip_empty_lines: true });
```

**Apply to:** `loadSynonyms()`. The `csv-parse/sync` package is already a direct dependency (package.json line 32) and is already imported at the top of `ingest-photos.js`. No new dep.

### 3. Module-level path constant at script top

**Source:** `scripts/ingest-photos.js:36-37`:

```js
const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const SPECIES_CSV = resolve('data/species.csv');
```

**Apply to:** add `const SYNONYMS_CSV = resolve('data/species-synonyms.csv');` immediately below. Project convention (PROJECT.md Key Decisions; 26-PATTERNS.md "Shared Patterns §1").

### 4. Per-stage log line via the existing `logStage` helper

**Source:** `scripts/ingest-photos.js:103-115` — reused verbatim.

**Apply to:** every new log line in Phase 27 — `synonym-warn` at load time, `reclassify` per promoted row. No new helper; the 16-char action field and 12-char content_hash prefix conventions carry forward (existing manifest tooling, tmux tail-following, and the Phase 26 runbook's "how to read the log" section all assume this shape).

### 5. `describe`/`it` with `node:test` + tmpdir + rmSync for I/O tests

**Source:** `scripts/lib/manifest.test.js:1-11, 64-67, 128-130`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// inside a test:
const dir = mkdtempSync(join(tmpdir(), 'manifest-roundtrip-'));
const path = join(dir, 'm.csv');
try { /* ... */ } finally { rmSync(dir, { recursive: true, force: true }); }
```

**Apply to:** Phase 27's test file. The `try`/`finally` rmSync is the project's contract for tests that touch the filesystem; matches `manifest.test.js` line-for-line.

### 6. PR-as-audit-trail flat CSV ethos

**Source:** PROJECT.md Key Decisions table + `data/images.csv` (Phase 13) + `data/species.csv` precedents.

**Apply to:** `data/species-synonyms.csv`. D-01 explicitly rejects auxiliary columns (`decided_by` / `decided_on` / `note`) on the grounds that `git log -p data/species-synonyms.csv` carries the same information at lower curator-typed friction. The runbook (`_instructions/CURATING_SPECIES_SYNONYMS.md`) makes "commit synonyms.csv + manifest together" a numbered step so the diff captures both the decision and its effect.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none) | — | — | Every Phase 27 artifact has a strong analog in Phase 26 or the existing repo. Phase 26 shipped the entire surface area Phase 27 extends; the executor's job is incremental insertion at the four documented edit points, not invention. |

The closest gap is the synonym-warn log line at load time — Phase 26 emits `logStage` only inside per-file processing, not at startup. But the helper is signature-compatible with a load-time call (the content_hash arg accepts `''`), so the same idiom carries forward without a new helper.

---

## Metadata

**Analog search scope:** `scripts/`, `scripts/lib/`, `_instructions/`, `data/`, `package.json`, `.planning/phases/26-dropbox-ingest-filename-parser-and-manifest/`, `.planning/spikes/001-dropbox-photo-audit/`
**Files scanned:** 12 (3 ingest-photos artifacts, 3 lib modules + 2 lib tests, 2 instructions analogs, 1 data sibling, 1 package.json, 26-PATTERNS.md + 26-03-PLAN.md for plan-shape reference)
**Pattern extraction date:** 2026-05-22
