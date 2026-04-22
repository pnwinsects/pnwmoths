# Phase 17: Migrate Full Species Data from Legacy Database - Research

**Researched:** 2026-04-22
**Domain:** Data migration — MySQL dump parsing, CSV transformation, taxonomy reconstruction
**Confidence:** HIGH (all findings verified against the actual dump file and source code)

## Summary

This phase replaces the stub data in `data/species.csv` and `data/records.csv` with the full production dataset from the legacy pnwinsects-app MySQL dump. The source is a single SQL dump file at `/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/root/pnwmoths-mysqldump--20210201-123033.sql` (634 MB total; the pnwmoths database section starts at line 4552 and contains ~235 MB). There is no running MySQL server; parsing is done directly in Node.js.

**`data/images.csv` does not need to change.** It was already populated in Phase 13 from image filenames. The species slug in images.csv comes from the image filename (e.g. `Abagrotis rubicundis-A-V.jpg` → slug `abagrotis-rubicundis`), not from the `species_species` table, and that is the canonical slug for the site.

The critical complexity is **family/subfamily**. These fields are not stored in `species_species`; they are encoded in the Django CMS URL hierarchy (`browse/family-noctuidae/subfamily-acronictinae/...`), which is stored in the `cms_title` table in the same dump. Only 10 families appear in the CMS: Drepanidae, Erebidae, Euteliidae, Lasiocampidae, Noctuidae, Nolidae, Notodontidae, Saturniidae, Sphingidae, Uraniidae. Geometridae is absent from the CMS entirely — all ~115 species with images that lack CMS taxonomy belong to Geometridae and have MONA Hodges numbers in the 6202–7499 range.

**Primary recommendation:** One Node.js ESM migration script (`scripts/migrate-species.js`) that reads the SQL dump, extracts all needed tables with regex parsing, joins them in memory, and writes new `data/species.csv` and `data/records.csv`. The script follows the established `migrate-images.js` pattern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SQL dump parsing | Build script (one-time) | — | No MySQL server; file parsing at migration time |
| species.csv generation | Build script (one-time) | — | Written once; consumed by existing build pipeline |
| records.csv generation | Build script (one-time) | — | Written once; filtered to PNW/occurrence |
| Family/subfamily taxonomy | cms_title lookup (dump) | Hard-coded genus→family fallback | CMS encoded family in URL paths |
| Slug canonicalization | Image filename (existing) | DB genus/species (fallback) | 326 species have naming discrepancies |
| Post-migration validation | build-data.js (existing) | npm test | Existing pipeline validates after write |

---

## Source Data Inventory

### MySQL Dump Structure (verified)

| Parameter | Value |
|-----------|-------|
| File | `/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/root/pnwmoths-mysqldump--20210201-123033.sql` |
| Total size | 634 MB, 10,221 lines |
| MySQL version | 5.6.12 |
| pnwmoths section starts | Line 4552 (`USE \`pnwmoths\`;`) |
| pnwmoths section ends | Before line 6563 (`USE \`pnwsawflies\`;`) |
| Charset declaration | `SET NAMES utf8` at connection level |
| Table charset | `latin1` declared, but data is UTF-8 in practice |

[VERIFIED: direct file inspection with Python]

### Non-ASCII Byte Distribution (verified)

The pnwmoths section has 15,582 non-ASCII bytes, all in `cmsplugin_text` (prose descriptions). The tables we extract — `species_species`, `species_speciesrecord`, `species_speciesimage`, `cms_title`, lookup tables — contain only ASCII. Read the file with `encoding: 'latin-1'` (Node.js `latin1`) for safe binary-transparent parsing; the relevant tables will decode correctly.

[VERIFIED: byte scan of pnwmoths section]

### Key Table Row Counts (verified)

| Table | Rows | AUTO_INCREMENT | Notes |
|-------|------|----------------|-------|
| `species_species` | 1,771 | 3,347 | One INSERT statement |
| `species_species_similar` | 2,240 | 8,521 | Bidirectional M2M |
| `species_speciesrecord` | 5,844 | 189,736 | Many deletions over 10 years |
| `species_author` | 645 | 646 | |
| `species_collector` | 2,897 | 4,696 | |
| `species_collection` | 277 | 366 | |
| `species_county` | 632 | 633 | |
| `species_state` | 84 | 85 | |
| `species_speciesimage` | 4,038 | 7,795 | Dump; speciesimage.csv has 4,256 (newer) |
| `cms_title` (species paths) | 1,643 | — | For taxonomy lookup |

[VERIFIED: counting rows in INSERT statements]

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose |
|---------|---------|---------|
| Node.js | 22.20.0 | Runtime |
| csv-parse | ^6.2.1 | CSV parsing (for reading speciesimage.csv) |
| csv-stringify | ^6.7.0 | CSV writing (already used by migrate-images.js) |
| node:fs (readFileSync, readFile) | built-in | Reading dump file |
| node:readline | built-in | Alternative: streaming line reader |

**No new dependencies needed.** The migration is pure Node.js with existing packages.

[VERIFIED: package.json inspection]

### Installation

```bash
# No new packages needed
```

---

## Architecture Patterns

### System Architecture Diagram

```
SQL Dump File (634 MB)
        |
        v
[Stream lines, find pnwmoths section]
        |
        v (regex extraction, single pass)
[In-memory lookup tables]
  species_author:    id → authority string
  species_collector: id → name string
  species_collection: id → name string
  species_county:    id → name string
  species_state:     id → code string (WA/OR/ID/BC/AB/MT/...)
  cms_title:         page_id → (family, subfamily)
  species_species_similar: from_id → [to_id, ...]
  species_speciesimage:    species_id → slug (from image filename)
        |
        v (join pass)
[species_species rows × lookups]
        |
        ├──→ [Filter: species with images OR PNW records]
        |           ↓
        |    [Write data/species.csv]
        |    (slug, genus, species, common_name, noc_id,
        |     authority, family, subfamily, similar_species)
        |
        └──→ [species_speciesrecord rows × lookups]
                    |
                    v (filter: state IN PNW + linked_photo=0)
             [Write data/records.csv]
             (species_slug, record_type, latitude, longitude,
              state, county, locality, elevation_ft,
              year, month, day, collector, collection, notes)
```

### Recommended Project Structure

```
scripts/
├── migrate-species.js    # New: one-time migration (write species.csv + records.csv)
├── migrate-images.js     # Existing: already ran (images.csv is complete)
├── build-data.js         # Existing: validates + builds Parquet (no change needed)
└── build-data.test.js    # Existing: may need stub data update for tests
data/
├── species.csv           # REPLACED by migration
├── records.csv           # REPLACED by migration
└── images.csv            # NO CHANGE (already complete)
```

### Pattern 1: Single-Pass Dump Reader

Read the dump once, line by line (streaming), accumulate INSERT data for each table, parse rows after the section boundary. The pnwmoths section is ~235 MB; all needed table data is small enough to hold in memory (~10 MB total).

```javascript
// Source: direct analysis of dump structure
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

async function extractTable(dumpPath, tableName, inSection) {
  const rl = createInterface({ input: createReadStream(dumpPath, { encoding: 'latin1' }) });
  let rows = [];
  for await (const line of rl) {
    if (line.startsWith(`INSERT INTO \`${tableName}\``)) {
      rows = parseInsert(line);
    }
  }
  return rows;
}
```

**Alternative:** `readFileSync` with `encoding: 'latin1'` and `String.prototype.split('\n')` — simpler since the entire dump is only 634 MB and Node.js 22 can hold it without issue. The pnwmoths section has one INSERT per table on a single line.

### Pattern 2: Regex Row Extraction for Simple Tables

All lookup tables (author, collector, collection, county, state) use simple `(id, 'value')` format with no embedded newlines. A single regex per table extracts all rows.

```javascript
// Source: direct inspection of INSERT statements
function parseAuthor(line) {
  // (id,'authority string')
  return new Map(
    [...line.matchAll(/\((\d+),'((?:[^'\\]|\\.)*)'\)/g)]
      .map(m => [m[1], m[2].replace(/\\'/g, "'")])
  );
}
```

### Pattern 3: Slug Canonicalization from Image Filename

The canonical slug is derived from the image filename stored in `species_speciesimage.image` (`moths/{Genus} {species}-X-Y.jpg`). Use the same regex as `migrate-images.js`:

```javascript
// Source: migrate-images.js line 65-70
function slugFromFilename(imageField) {
  // imageField: "moths/Acronicta americana-A-D.jpg"
  const fname = imageField.startsWith('moths/') ? imageField.slice(6) : imageField;
  const match = fname.match(/^([A-Z][a-z]+) ([a-z]+)-/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`.toLowerCase();
}
```

Build a `Map<species_id → slug>` from the speciesimage INSERT before processing species. For species with multiple images (common), all images share the same species_id so the slug is the same.

### Pattern 4: CMS Taxonomy Extraction

The `cms_title` table encodes family/subfamily in the URL path field (column index 5):

```
(page_id, 'en', 'Species Name', 'menutitle', 'slug', 'browse/family-X/subfamily-Y/genus/species-slug', ...)
```

Depths:
- depth 5: `browse/family-X/subfamily-Y/genus/species-slug` (no tribe)
- depth 6: `browse/family-X/subfamily-Y/tribe-Z/genus/species-slug` (with tribe)

Extract only depth >= 5 paths (actual species pages). Build `Map<page_id → {family, subfamily}>`.

```javascript
// Source: cms_title analysis
function extractCmsTaxonomy(line) {
  const pageMap = new Map();
  const re = /\((\d+),'en','(?:[^'\\]|\\.)*','[^']*','[^']*','(browse\/family-[^']+)'/g;
  for (const m of line.matchAll(re)) {
    const parts = m[2].split('/');
    if (parts.length >= 5) {
      const family = parts[1].replace('family-', '');
      const subfamily = parts[2].startsWith('subfamily-')
        ? parts[2].replace('subfamily-', '')
        : null;
      pageMap.set(parseInt(m[1]), { family, subfamily });
    }
  }
  return pageMap;
}
```

Capitalize family/subfamily names (e.g. `noctuidae` → `Noctuidae`).

### Pattern 5: Geometridae Fallback

Species where `noc_id` matches `MONA \d+` or is a bare Hodges number (6202–7499 range) belong to Geometridae. Use this as the fallback when CMS taxonomy is absent:

```javascript
// Source: noc_id analysis — all unresolvable species have MONA numbers
function inferFamily(nocId) {
  if (!nocId) return null;
  // "MONA 6380", "MONA 7223", bare "6952", "MOTH 7524"
  const monaMatch = nocId.match(/(?:MONA|MOTH)\s+(\d+)/);
  const bareMatch = nocId.match(/^(\d{4}(?:\.\d+)?)$/);
  const num = monaMatch ? parseFloat(monaMatch[1]) : bareMatch ? parseFloat(bareMatch[1]) : null;
  if (num !== null && num >= 6202 && num <= 7499) return 'Geometridae';
  return null;  // unknown — leave blank
}
```

This covers 104 of the 115 unresolvable species. The remaining 11 are resolvable via genus lookup.

### Pattern 6: Records Filtering

Apply two filters (verified against Django `RecordManager` and data content):

1. **`linked_photo = 0`**: Records with `linked_photo = 1` are image labels (attached to `SpeciesImage` as specimen data), not independent occurrence records. [VERIFIED: `species/models.py` line 267]
2. **PNW states only**: Filter to `state_id IN (42, 80, 66, 43, 61, 77)` (WA, OR, ID, BC, AB, MT). The existing `build-data.js` validator rejects non-PNW states.

After both filters: approximately 3,589 occurrence records (down from 5,844 total).

State ID lookup from `species_state` dump:
```
42=WA, 43=BC, 61=AB, 66=ID, 77=MT, 80=OR
```
[VERIFIED: species_state INSERT data]

### Anti-Patterns to Avoid

- **Do not use species.genus + species.species as the slug.** 326 species have taxonomy updates since 2021 (e.g., `Apantesis ornata` in DB but image file says `Grammia ornata`). The images.csv slug must match.
- **Do not require a running MySQL server.** The dump is self-contained; regex parsing is sufficient and avoids infra dependencies.
- **Do not import non-PNW records.** `build-data.js` will fail validation. Filter to PNW states during migration, not after.
- **Do not treat `species_speciesrecord.sight_field_notes` as a special case.** The dump contains only `specimen`, `photograph`, and `literature` record types; the `sight_field_notes` type does not appear.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| CSV writing | Custom string concatenation | `csv-stringify` (already used by migrate-images.js) |
| CSV parsing of speciesimage.csv | Manual splitting | `csv-parse/sync` (already in project) |
| Post-migration validation | Custom checks | `npm run build:data` (existing build-data.js) |

---

## Exact SQL→CSV Transformations

### species.csv

**Source tables:** `species_species`, `species_species_similar`, `species_speciesimage` (for slugs), `cms_title` (for family/subfamily), `species_author` (for authority string)

**Filter:** Include species where `species_id` appears in `species_speciesimage` OR in `species_speciesrecord` with PNW state + `linked_photo=0`. (Excludes 397 species with neither images nor PNW records.)

**Slug:** Derive from `species_speciesimage.image` filename using `slugFromFilename()`. For species without images, fall back to `(genus + '-' + species).toLowerCase()`.

**Field mappings:**

| species.csv column | Source | Transformation |
|-------------------|--------|----------------|
| `id` | `species_species.id` | As-is (INTEGER) |
| `genus` | `species_species.genus` | As-is |
| `species` | `species_species.species` | As-is |
| `common_name` | `species_species.common_name` | NULL → empty string |
| `noc_id` | `species_species.noc_id` | NULL → empty string |
| `authority` | `species_author.authority` via `species_species.authority_id` | NULL → empty string |
| `family` | `cms_title` path via `species_species.factsheet_id` | Capitalize; fall back to `inferFamily(noc_id)` |
| `subfamily` | `cms_title` path via `species_species.factsheet_id` | Capitalize; NULL if not in CMS |
| `similar_species` | `species_species_similar` grouped by `from_species_id` | Pipe-join of target slugs |

**similar_species construction:**
1. Build `Map<from_id → [to_id, ...]>` from similar table.
2. For each species, look up `[to_id, ...]`.
3. For each `to_id`, get its slug (from speciesimage map or genus-species fallback).
4. Pipe-join: `slug1|slug2|slug3`.

### records.csv

**Source tables:** `species_speciesrecord`, `species_state`, `species_county`, `species_collector`, `species_collection`, `species_speciesimage` (for slug lookup)

**Filter:** `linked_photo = 0` AND `state_id IN (42, 43, 61, 66, 77, 80)`.

**Field mappings:**

| records.csv column | Source | Transformation |
|-------------------|--------|----------------|
| `species_slug` | `species_speciesimage` → slug, via `species_id` | slugFromFilename fallback to genus-species |
| `record_type` | `species_speciesrecord.record_type` | As-is (`specimen`/`photograph`/`literature`) |
| `latitude` | `species_speciesrecord.latitude` | NULL → skip row (no map point) |
| `longitude` | `species_speciesrecord.longitude` | NULL → skip row |
| `state` | `species_state.code` via `state_id` | Two-letter code (WA/OR/etc.) |
| `county` | `species_county.name` via `county_id` | NULL → empty string |
| `locality` | `species_speciesrecord.locality` | NULL → empty string |
| `elevation_ft` | `species_speciesrecord.elevation` | Already in feet (per model `help_text`); NULL → empty |
| `year` | `species_speciesrecord.year` | NULL → empty |
| `month` | `species_speciesrecord.month` | NULL → empty |
| `day` | `species_speciesrecord.day` | NULL → empty |
| `collector` | `species_collector.name` via `collector_id` | NULL → empty string |
| `collection` | `species_collection.name` via `collection_id` | NULL → empty string |
| `notes` | `species_speciesrecord.notes` | NULL → empty string; strip embedded newlines |

**Records without lat/lon:** The dump contains records where `latitude` or `longitude` is NULL. These cannot be mapped and should be excluded (consistent with current validation in `build-data.js` which rejects NULL lat/lon).

### images.csv

**No changes.** Already complete from Phase 13. [VERIFIED: images.csv has 3,880 rows; all derived from image filenames + photographer data]

---

## Common Pitfalls

### Pitfall 1: Slug Mismatch Between DB and Image Filename
**What goes wrong:** Building species slug from `species_species.genus + species_species.species` gives a different slug than what images.csv uses. For example, DB has `Apantesis edwardsii` but image filename says `Grammia edwardsii`. Result: orphaned images (images.csv species_slug not matching any species in species.csv).
**Why it happens:** Taxonomy reclassifications after 2021 are in the image filenames (which were updated) but not in the legacy DB.
**How to avoid:** ALWAYS derive slug from image filename first (via `species_speciesimage` JOIN). Use DB genus/species only as fallback for species without images.
**Warning signs:** Build fails with "orphaned records" validation error, or browse page has species with photos missing.

### Pitfall 2: Including Image Label Records
**What goes wrong:** Including `species_speciesrecord` rows where `linked_photo=1` in records.csv. These are specimen data attached to photos, not occurrence records. The Leaflet map will show duplicate or misleading location pins.
**Why it happens:** Django has two managers: `RecordManager` (occurrence) and `LabelManager` (labels). The label records are excluded from the public-facing map.
**How to avoid:** Always filter `WHERE linked_photo = 0`.
**Warning signs:** records.csv has ~5,800 rows instead of ~3,589.

### Pitfall 3: Non-PNW Records Failing Build Validation
**What goes wrong:** Importing records from CA (state_id=59), UT (72), AK (64), etc. causes `build-data.js` to fail with "invalid state values".
**Why it happens:** 375 records in the dump are from outside the 6 PNW states/provinces.
**How to avoid:** Filter to `state_id IN (42, 43, 61, 66, 77, 80)` before writing records.csv.
**Warning signs:** `npm run build:data` outputs "invalid state values: CA, UT, AK, ..."

### Pitfall 4: Missing Family for Geometridae Species
**What goes wrong:** 104+ species (Speranza, Digrammia, Macaria, Hydriomena, etc.) have no CMS taxonomy. If left with blank family, they cannot appear in the accordion browse.
**Why it happens:** Geometridae was not added to the CMS taxonomy on the legacy site.
**How to avoid:** Use `inferFamily(noc_id)` to assign `Geometridae` for MONA-numbered species. Leave subfamily blank (acceptable — Geometridae is a large family with many subfamilies; a future phase can add subfamily data).
**Warning signs:** Browse page has 104+ species with no family grouping.

### Pitfall 5: Collection Table Has 3-Column Format
**What goes wrong:** Parsing `species_collection` with a 2-column regex misses the `url` field, corrupting collection names.
**Why it happens:** `species_collection` has `(id, name, url_or_null)`, not `(id, name)`.
**How to avoid:** Parse with `(id, 'name', url_or_null)` pattern. Only take column index 1 (name).

### Pitfall 6: Latin-1 File Encoding
**What goes wrong:** Opening the dump with `encoding: 'utf-8'` throws on the latin-1 byte sequences in `cmsplugin_text`.
**Why it happens:** MySQL declared latin1 but used SET NAMES utf8, causing mixed encoding.
**How to avoid:** Use `encoding: 'latin1'` (Node.js). The species/records tables are pure ASCII; only prose description fields have non-ASCII content (which we don't extract).

### Pitfall 7: build-data.js Tests Use Stub Data
**What goes wrong:** After migration, `npm test` may fail if `build-data.test.js` integration tests call `main()` which reads full species.csv (1,374 rows) and expects stub row counts.
**Why it happens:** Integration tests use `process.chdir()` to test with alternate data dirs. Unit tests call `validateCsv()` with the real data/species.csv path.
**How to avoid:** Check build-data.test.js after migration. If tests count rows or reference specific stub values, update to work with real data.

---

## Code Examples

### Reading the Dump (verified approach)

```javascript
// Source: file structure verified by direct inspection
import { readFileSync } from 'node:fs';

const dump = readFileSync(DUMP_PATH, 'latin1');  // binary-safe
const pnwStart = dump.indexOf('USE `pnwmoths`;');
const pnwEnd = dump.indexOf('USE `pnwsawflies`;');
const pnwSection = dump.slice(pnwStart, pnwEnd);

// Each table has one INSERT line; find it:
function getInsertLine(section, tableName) {
  const marker = `INSERT INTO \`${tableName}\` VALUES `;
  const start = section.indexOf(marker);
  if (start === -1) return null;
  const end = section.indexOf('\n', start);
  return section.slice(start, end);
}
```

### Parsing Simple Lookup Table (id, 'value')

```javascript
// Covers: species_author, species_collector, species_state
// Source: dump format verified
function parseIdValue(line) {
  const map = new Map();
  for (const m of line.matchAll(/\((\d+),'((?:[^'\\]|\\.)*)'\)/g)) {
    map.set(m[1], m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  }
  return map;
}
```

### Parsing Three-Column Table (collection has url field)

```javascript
// Source: species_collection schema: (id, name, url_or_null)
function parseCollection(line) {
  const map = new Map();
  for (const m of line.matchAll(/\((\d+),'((?:[^'\\]|\\.)*)',(?:NULL|'[^']*')\)/g)) {
    map.set(m[1], m[2].replace(/\\'/g, "'"));
  }
  return map;
}
```

### Parsing species_species_similar

```javascript
// Source: schema (id, from_species_id, to_species_id) — all integers
function parseSimilar(line) {
  const map = new Map();  // from_id -> [to_id, ...]
  for (const m of line.matchAll(/\(\d+,(\d+),(\d+)\)/g)) {
    if (!map.has(m[1])) map.set(m[1], []);
    map.get(m[1]).push(m[2]);
  }
  return map;
}
```

### Writing species.csv row

```javascript
// The csv-stringify library handles quoting, escaping, etc.
// Columns match build-data.js read_csv schema exactly
const row = {
  id: sp.id,
  genus: sp.genus,
  species: sp.species,
  common_name: sp.common_name ?? '',
  noc_id: sp.noc_id ?? '',
  authority: authorById.get(sp.authority_id) ?? '',
  family: sp.family ?? '',
  subfamily: sp.subfamily ?? '',   // blank = null per nullstr='' in build-data.js
  similar_species: sp.similar_species ?? '',
};
```

---

## Data Coverage Summary

| Dataset | Count | Notes |
|---------|-------|-------|
| Species in DB | 1,771 | From species_species |
| Species with images | ~1,380 | From species_speciesimage.csv |
| Species with PNW records | ~735 | linked_photo=0, PNW states |
| Species with images OR PNW records | ~1,374 | Target for species.csv |
| Species with CMS taxonomy (family/subfamily) | ~1,211 | Via factsheet_id JOIN |
| Species without CMS taxonomy (family=NULL) | ~163 | Of the 1,374 |
|   - Inferrable as Geometridae (MONA numbers) | ~104 | Hard-code family=Geometridae |
|   - Genus lookup resolves | ~11 | Same genus as CMS species |
|   - Remaining (no family) | ~48 | Blank family; acceptable gap |
| Total records in dump | 5,844 | |
| PNW records (linked_photo=0, PNW states) | ~3,589 | Target for records.csv |
| Images in images.csv | 3,880 | Already complete; no change |

[VERIFIED: all counts from direct dump analysis]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Migration script | ✓ | 22.20.0 | — |
| csv-parse | Script input | ✓ | 6.2.1 | — |
| csv-stringify | Script output | ✓ | 6.7.0 | — |
| MySQL server | Dump parsing | ✗ | — | Regex parsing (no MySQL needed) |
| SQL dump file | Source data | ✓ | 634 MB at known path | — |
| speciesimage.csv | Slug mapping | ✓ | 4,256 rows | Filename scan fallback |
| photographer.csv | images.csv (done) | ✓ | 7 rows | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node 22) |
| Config file | none — invoked via `npm test` |
| Quick run command | `node --test scripts/build-data.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | species.csv contains all species from legacy DB | integration smoke | `node --test scripts/migrate-species.test.js` | ❌ Wave 0 |
| SC-2 | records.csv has filtered occurrence records | integration smoke | `node --test scripts/migrate-species.test.js` | ❌ Wave 0 |
| SC-3 | npm run build completes with full dataset | system | `npm run build:data` | ✓ (existing) |
| SC-4 | npm test passes | unit/integration | `npm test` | ✓ (existing) |

### Sampling Rate

- **Per task commit:** `npm run build:data` (validates CSV → Parquet pipeline)
- **Per wave merge:** `npm test`
- **Phase gate:** Full `npm run build` green before marking complete

### Wave 0 Gaps

- [ ] `scripts/migrate-species.test.js` — covers SC-1, SC-2 with assertions on row counts, required columns, no orphaned species_slug in records

---

## Open Questions

1. **Species without images or PNW records (397 species)**
   - What we know: They exist in the DB but have no images and no PNW occurrence records.
   - What's unclear: Should they appear in species.csv? The site generates one HTML page per species. Without images or records, the page would be nearly empty (just taxonomy and common name).
   - Recommendation: Exclude them from species.csv (do not generate empty pages). Include a comment in the script noting this filter.

2. **Subfamily for Geometridae species**
   - What we know: ~104 species are Geometridae (MONA numbers) with no CMS subfamily.
   - What's unclear: Whether the user wants subfamily populated for these (would require an external reference like MONA, Discover Life, or a hand-curated CSV).
   - Recommendation: Leave subfamily blank for now. The accordion browse will show a flat list under "Geometridae" with no subfamilies. A future phase can add Geometridae subfamilies.

3. **18 species with factsheet_id not in cms_title**
   - What we know: 18 species have a factsheet_id pointing to a CMS page that doesn't have a `browse/family-...` path (e.g. page IDs like 220, 965, 2423–2474). These are likely recently added species pages that were not yet organized in the family hierarchy.
   - What's unclear: Their actual family classification.
   - Recommendation: Fall back to genus lookup (if another species in the same genus has CMS taxonomy, use that family). If still unresolved, leave family blank and flag in console output.

4. **Species added after Feb 2021 dump**
   - What we know: images.csv has 9 species_ids (3349–3360+) that don't exist in the dump. These are species added after the Feb 2021 backup.
   - What's unclear: Their taxonomy, authority, and whether they have PNW records.
   - Recommendation: Skip species_ids that aren't in the dump. They currently have images in images.csv (those image rows will have an orphaned slug after migration). Flag this in console output. A future manual step would add these species to species.csv.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Records filtered to `linked_photo=0` matches "same filtering as legacy site" | Records filtering | Records.csv may include/exclude differently than legacy site expected |
| A2 | Non-PNW records should be excluded (not just flagged as invalid) | Records filtering | Some valid PNW-adjacent records from WY, CA border areas may be lost |
| A3 | Species with neither images nor PNW records should be excluded | Species coverage | Taxonomy-only species excluded; user may want them for browse completeness |
| A4 | MONA numbers 6202–7499 = Geometridae (family assignment) | Pitfall 4/Code examples | Some non-Geometridae may share number range; subfamily gaps remain |
| A5 | `elevation` field in `species_speciesrecord` is already in feet | Field mapping | Legacy site help text says "measured in feet" [CITED: models.py line 305] |

---

## Sources

### Primary (HIGH confidence)

- Direct file inspection of `/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/root/pnwmoths-mysqldump--20210201-123033.sql` — all table schemas, row counts, data samples, charset analysis
- `/Users/rainhead/dev/pnwinsects-app/species/models.py` — `RecordManager` filter, `SpeciesRecord` field definitions, `linked_photo` semantics
- `/Users/rainhead/dev/pnwmoths/scripts/migrate-images.js` — slug derivation pattern, csv-stringify usage, ESM script structure
- `/Users/rainhead/dev/pnwmoths/scripts/build-data.js` — CSV schema, DuckDB API patterns, validation queries, state whitelist
- `/Users/rainhead/dev/pnwmoths/data/images.csv` — 3,880 rows; current state; slug format
- `/Users/rainhead/dev/pnwinsects-app/species_speciesimage.csv` — 4,256 rows; species_id to filename mapping
- `/Users/rainhead/dev/pnwinsects-app/species_photographer.csv` — 7 photographers; id lookup

### Secondary (MEDIUM confidence)

- MONA Hodges number ranges for Geometridae (6202–7499) — [ASSUMED] from training knowledge of North American moth taxonomy; not independently verified against MONA publications in this session

---

## Metadata

**Confidence breakdown:**
- Data scale and table structure: HIGH — verified by direct file inspection
- Slug mismatch scope: HIGH — verified by cross-referencing speciesimage.csv and dump species names
- CMS taxonomy extraction: HIGH — verified by testing regex against actual cms_title INSERT
- Records filtering: HIGH — verified against models.py RecordManager and data counts
- MONA number → Geometridae assignment: MEDIUM — training knowledge (A4)

**Research date:** 2026-04-22
**Valid until:** Indefinite (source data is a static file; no external services)
