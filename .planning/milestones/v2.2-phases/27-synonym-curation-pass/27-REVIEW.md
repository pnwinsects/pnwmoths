---
phase: 27-synonym-curation-pass
reviewed: 2026-05-22T17:31:15Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - _instructions/CURATING_SPECIES_SYNONYMS.md
  - data/species-synonyms.csv
  - scripts/ingest-photos.js
  - scripts/ingest-photos.test.js
  - package.json
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-05-22T17:31:15Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 27 adds the curator-managed synonym lookup with sensible structure: a first-run-safe `loadSynonyms()` helper, a pre-pass inserted at slot -1 of the cascade, an inline re-classification on the RESORT_ONLY path, and test coverage on the new exports. The cascade ordering is correctly arranged so that the synonym pre-pass beats every other branch — including the FIX #3 provisional short-circuit — and the orphan-target drop with single-line warn matches D-04.

However, the work has several correctness and operability defects that will bite curators:

1. **A stale-promotion gap on the RESORT_ONLY path.** Removing a row from `species-synonyms.csv` does not demote the manifest row out of `resolved-via-synonym`. The runbook frames the file as the source of truth ("re-loads ... walks every manifest row, promotes any row whose binomial_raw matches one of your from_binomial entries"), but the implementation only promotes — it never reverts. This silently breaks the "synonyms.csv is the curator's truth" mental model.
2. **No UTF-8 BOM handling on the curator-edited CSV.** `csv-parse/sync` does not strip a BOM by default; the first column becomes `<U+FEFF>from_binomial`, and every row is silently dropped. A curator who saves the file from Notepad or Excel-with-UTF-8 can trip this with no error message.
3. **Runbook over-promises the RESORT_ONLY log output.** The "Verify" section tells the curator to read a "new per-bucket distribution" from `npm run photos:investigate`, but the RESORT_ONLY path only prints the promoted count — never a bucket distribution. Curators cannot self-verify match-rate progress as documented.
4. **A test fixture pretends D-06 widening is reachable in production, but the parser never returns a non-null binomial together with a provisional bucketHint.** The test passes (the cascade is doing what it claims) but the property under test is unreachable from main(); the test risks giving false confidence that "Monostoecha n sp -> Apantesis foo" curator decisions work end-to-end.

The remaining findings are minor inconsistencies (lowercasing-without-trim parity between two lookup sites, missing tests for the RESORT_ONLY path, silent duplicate-key overrides, an undocumented but allowed clean-match override) and quality nits.

No security issues found. No critical/blocker defects. The four warnings should each be addressed before the first curator pass; the info items can be deferred.

## Warnings

### WR-01: Removing a synonym never demotes a previously-promoted row

**File:** `scripts/ingest-photos.js:329-358`

**Issue:** On the RESORT_ONLY path, the only mutation is promotion: `if (binomial && synonyms.has(binomial)) { ...row.match_bucket = 'resolved-via-synonym'... }`. There is no inverse branch. A curator who adds `grammia nevadensis -> apantesis-nevadensis`, runs `photos:investigate`, then deletes that synonyms.csv row and re-runs, will find the 10 affected manifest rows still sitting in `match_bucket: resolved-via-synonym` with `binomial_resolved = apantesis nevadensis`. The runbook frames the file as canonical curator truth ("walks every manifest row, promotes any row whose binomial_raw matches..."), so this is a correctness gap, not just a UX one. The same gap also lets the row carry forward an obsolete `binomial_resolved` / `species_slug` after a curator typo correction-by-deletion.

Note: a curator who **edits** a synonym row (changes the target slug) IS handled correctly by the idempotency guard at line 342 — only the delete-row case is broken.

**Fix:** Track which rows were `resolved-via-synonym` and re-evaluate them against the current synonyms map; if no longer present, demote. The simplest correct shape is to re-classify every row from its `binomial_raw` and let `classify()` produce the bucket. For rows whose original bucket is unknown (the manifest doesn't preserve the pre-synonym classification), the right answer is to re-derive the bucket via the cascade and let it land wherever the data dictates:

```js
// Re-classify every row from its binomial_raw, so deletions in synonyms.csv
// correctly demote previously-promoted rows.
let promoted = 0;
let demoted = 0;
for (const row of existing) {
  const binomialRaw = (row.binomial_raw || '').trim().toLowerCase();
  const wasSynonym = row.match_bucket === 'resolved-via-synonym';
  // Pass through classify() so the cascade owns the bucket decision.
  // bucketHintFromParser is unrecoverable from the manifest row, so we pass
  // null; the synonym pre-pass + clean/slug/genus/likely-synonym cascade is
  // sufficient for re-classification.
  const result = classify(
    { binomialFromParser: binomialRaw || null, bucketHintFromParser: null },
    species,
    synonyms,
  );
  if (row.match_bucket !== result.match_bucket
      || row.binomial_resolved !== result.binomial_resolved
      || row.species_slug !== result.species_slug) {
    if (result.match_bucket === 'resolved-via-synonym') promoted++;
    else if (wasSynonym) demoted++;
    row.match_bucket = result.match_bucket;
    row.binomial_resolved = result.binomial_resolved;
    row.species_slug = result.species_slug;
    logStage(row.content_hash, 'reclassify', result.match_bucket, `${binomialRaw} -> ${result.species_slug || '-'}`);
  }
}
console.log(`[ingest-photos] re-sorted manifest; ${sorted.length} rows; ${promoted} promoted, ${demoted} demoted`);
```

Note one caveat: re-classify-via-classify() loses the original `bucketHintFromParser`, so a row that Phase 26 routed to `provisional` because the filename contained `n sp` will (when re-classified through the cascade) land in `unparseable` (its `binomial_raw` is empty). Verify against current manifest contents before adopting; an alternative is to add an explicit demote branch keyed only on `was synonym but no longer matches`.

---

### WR-02: `loadSynonyms` does not strip a UTF-8 BOM

**File:** `scripts/ingest-photos.js:164-185`

**Issue:** The curator-facing CSV is the one file in Phase 27 most likely to acquire a UTF-8 BOM — a curator on Windows opening it in Notepad or Excel-with-UTF-8 can introduce one on save. `csv-parse/sync` does NOT strip the BOM unless `bom: true` is passed. The header line becomes `{ "<U+FEFF>from_binomial": "...", "to_species_slug": "..." }`, so `r.from_binomial` is `undefined`, and `(r.from_binomial || '').trim().toLowerCase()` yields `''`, dropping the row silently (the `if (!from || !to) continue` skips with no log line). Every curator decision in the file is silently ignored. There is no warning to the curator that anything is wrong.

Reproduced locally: `parse(Buffer.from('<U+FEFF>a,b\n1,2\n'), { columns: true, skip_empty_lines: true })` returns `[{ "<U+FEFF>a": "1", "b": "2" }]` — the BOM becomes part of the first column name.

Note: `loadSpecies()` (line 129) has the same gap, but `species.csv` is generated/edited by repo-controlled processes (Phase 17 migrate-species), so its risk surface is much smaller than the curator-edited `species-synonyms.csv`.

**Fix:** Pass `bom: true` to csv-parse:

```js
const records = parse(raw, { columns: true, skip_empty_lines: true, bom: true });
```

Apply the same fix to `loadSpecies()` for defense-in-depth (same line, same option).

---

### WR-03: Runbook claims a per-bucket distribution that RESORT_ONLY does not print

**File:** `_instructions/CURATING_SPECIES_SYNONYMS.md:121-122`

**Issue:** The "Verify" section instructs the curator:

> "On the command line:
> - The tail of the `npm run photos:investigate` output shows the promoted count and the new per-bucket distribution"

But `photos:investigate` runs `RESORT_ONLY=1`, and that code path in `scripts/ingest-photos.js:329-358` only emits one summary line:

```
[ingest-photos] re-sorted manifest; ${sorted.length} rows; ${promoted} promoted to resolved-via-synonym
```

No per-bucket distribution is printed (the full-ingest path prints one at lines 535-538, but `photos:investigate` never reaches that branch). The curator cannot use `photos:investigate` to monitor progress toward the >=95% match-rate target as the runbook directs.

**Fix:** Pick one of:

(a) Add a bucket tally to the RESORT_ONLY path:

```js
const buckets = {};
for (const row of sorted) {
  const b = row.match_bucket || '';
  buckets[b] = (buckets[b] ?? 0) + 1;
}
console.log(`[ingest-photos] re-sorted manifest; ${sorted.length} rows; ${promoted} promoted to resolved-via-synonym`);
console.log(`  per-bucket distribution:`);
for (const [bucket, count] of Object.entries(buckets)) {
  console.log(`    ${bucket.padEnd(20)} ${count}`);
}
const cleanOrResolved = (buckets['clean-match'] ?? 0) + (buckets['resolved-via-synonym'] ?? 0);
const rate = sorted.length ? (cleanOrResolved / sorted.length * 100).toFixed(1) : '0.0';
console.log(`  clean-or-resolved rate: ${rate}% (target >= 95%)`);
```

(b) Update the runbook to instruct curators to read the distribution from the manifest itself in a spreadsheet (group/pivot on `match_bucket`). This is the lighter touch but loses the ergonomic single-command verification.

(a) is recommended — the curator's mental model is "run photos:investigate, read the tail," and emitting the rate progress is exactly the L-04 verification surface called out in CONTEXT.md.

---

### WR-04: Test fixture for "D-06 widening" exercises a state the parser cannot produce

**File:** `scripts/ingest-photos.test.js:45-56`

**Issue:** The test "promotes a provisional-marked binomial through synonyms.csv (D-06 widening)" passes `{ binomialFromParser: 'monostoecha n sp', bucketHintFromParser: 'provisional' }`. But `scripts/lib/parse-photo-filename.js:75,83` always sets `binomial: null` when it returns `bucketHint: 'provisional'` — the two are mutually exclusive in the production parser. So:

- The test verifies `classify()` is internally correct (synonym pre-pass beats provisional short-circuit), which is a valid defensive-coding test.
- But the test's framing as "D-06 widening" gives the false impression that "Monostoecha n sp -> Apantesis foo" curator decisions can land in production. In practice, a provisional row from Phase 26 has `binomial_raw = ''` (because `row.binomial_raw = parsed.binomial ?? ''` at line 478), so the synonym lookup on the RESORT_ONLY path (`if (binomial && synonyms.has(binomial))`) skips it for lack of a key — exactly D-07.

The CONTEXT.md text at D-06 ("If a curator decides Monostoecha n sp -> Monostoecha pacifica...") and the test name together suggest this routing works end-to-end. It does not.

**Fix:** Pick one of:

(a) Rename and re-document the test to reflect what it actually proves:

```js
it('synonym pre-pass beats the provisional short-circuit (defensive ordering; production parser never co-emits both)', () => {
  // ...same fixture
});
```

(b) Restore reachability by extending the parser to emit a `binomial` alongside `bucketHint: 'provisional'` (e.g., for `Genus n sp`, emit `binomial: 'genus n sp'` so the synonym lookup has a key). This is a parser-level change with downstream implications and is likely out of scope for Phase 27; (a) is the lighter fix.

The CONTEXT.md D-06 wording should also be amended to reflect that "provisional rows are routable" requires `binomial_raw` to be non-empty, which the current parser does not guarantee.

---

## Info

### IN-01: RESORT_ONLY synonym lookup does not trim or normalize `binomial_raw`

**File:** `scripts/ingest-photos.js:338`

**Issue:** `const binomial = (row.binomial_raw || '').toLowerCase();` — no `.trim()`. Compare to `loadSynonyms` line 170, which does `.trim().toLowerCase()`. If a manifest row's `binomial_raw` ever carries leading/trailing whitespace (csv-parse preserves it), the lookup silently misses. The Phase 26 writer never injects whitespace, so this is a defensive parity nit, but the asymmetry is a code smell.

**Fix:**

```js
const binomial = (row.binomial_raw || '').trim().toLowerCase();
```

---

### IN-02: Duplicate `from_binomial` rows silently override each other

**File:** `scripts/ingest-photos.js:168-183`

**Issue:** If a curator pastes two rows with the same `from_binomial` and different `to_species_slug`, `synonyms.set(from, ...)` silently overwrites — only the last row wins. There is no warning to the curator, and the runbook does not warn about this either. The PR diff makes it visible, but a curator working alone (no second reviewer) could ship a typo'd duplicate.

**Fix:** Detect the second insertion and warn:

```js
if (synonyms.has(from)) {
  logStage('', 'synonym-warn', 'duplicate-from_binomial', `${from} (keeping last: -> ${to})`);
}
synonyms.set(from, { binomial_resolved: resolvedBinomial, species_slug: to });
```

---

### IN-03: Synonym pre-pass can override a clean-match without curator-visible warning

**File:** `scripts/ingest-photos.js:218-230`

**Issue:** The cascade puts the synonym pre-pass at slot -1, **before** the clean-match check. So a curator who accidentally adds `apantesis nevadensis -> some-other-slug` (a binomial that's already a clean species) will see all those clean-match rows quietly re-bucketed to `resolved-via-synonym`. The CONTEXT.md D-06 ("Any manifest row with non-empty `binomial_raw` is routable through synonyms.csv — including provisional and unparseable rows") implies this is intentional ("including" -> "all"), but the runbook (_instructions/CURATING_SPECIES_SYNONYMS.md) frames synonyms as "re-routing unmatched" rows and never mentions that clean-match rows are also routable.

This is more accurately a documentation gap than a defect — the behavior is consistent with the locked decision — but it is the kind of footgun a runbook should mention.

**Fix:** Add a sentence to the runbook, e.g., under step 4:

> Note: a `from_binomial` that is already a clean species in `data/species.csv` will be **overridden** by your synonym row. Use this deliberately to re-route a clean-match binomial; review the diff in `data/species-photos-manifest.csv` to confirm only the intended rows moved.

Optionally, in `loadSynonyms`, warn if `from` is already in `species.byBinomial`:

```js
if (species.byBinomial?.has(from)) {
  logStage('', 'synonym-warn', 'overrides-clean-match', `${from} -> ${to}`);
}
```

---

### IN-04: No test coverage for the RESORT_ONLY re-classification path

**File:** `scripts/ingest-photos.test.js`

**Issue:** The 9 new tests cover `classify()` and `loadSynonyms()` in isolation but never exercise the RESORT_ONLY block (`scripts/ingest-photos.js:329-358`), which is the **primary curator interaction surface** (D-05). Specifically, no test asserts:

- The idempotency guard (line 342) suppresses re-logging when a row is already correctly classified
- A row whose `binomial_raw` is empty does NOT get promoted (D-07 guard at line 339, `if (binomial && synonyms.has(binomial))`)
- Demotion does NOT happen when a synonym is removed (WR-01 — this would document the current behavior as a regression-anchor pending the fix)
- Existing manifest rows in other buckets retain their `status`, `last_error`, `specimen_id`, `view`, `dropbox_path`, `size_bytes`, etc. unchanged

Because the RESORT_ONLY path is invoked as a `main()` branch (not an exported function), testing it requires either (a) extracting it into an exported `reclassifyInPlace(rows, synonyms)` helper, or (b) running the script as a subprocess in the test. (a) is the lighter touch and gives the test the same fixture-as-test shape used for `classify()`/`loadSynonyms()`.

**Fix:** Extract the RESORT_ONLY loop body into an exported helper:

```js
// In ingest-photos.js
export function reclassifyInPlace(rows, synonyms) {
  let promoted = 0;
  for (const row of rows) {
    const binomial = (row.binomial_raw || '').trim().toLowerCase();
    if (binomial && synonyms.has(binomial)) {
      const { binomial_resolved, species_slug } = synonyms.get(binomial);
      if (row.match_bucket !== 'resolved-via-synonym' || row.species_slug !== species_slug) {
        row.match_bucket = 'resolved-via-synonym';
        row.binomial_resolved = binomial_resolved;
        row.species_slug = species_slug;
        promoted++;
      }
    }
  }
  return promoted;
}
```

Then test it directly with hand-built row objects.

---

### IN-05: `last_error` is not cleared when a previously-failed row is promoted

**File:** `scripts/ingest-photos.js:343-346`

**Issue:** If a row was previously written with `status: 'failed'` and `last_error: 'some old failure'` (per the per-file catch block at lines 492-514), and the curator later adds a synonym matching that row's `binomial_raw`, the RESORT_ONLY path promotes the row to `match_bucket: 'resolved-via-synonym'` but leaves `last_error` as the stale failure message. This is a minor data-quality concern — `status: 'failed'` also stays, which is deliberate per the runbook ("leaves status ... untouched"), but the orphan `last_error` text becomes misleading.

Note: in practice this is unlikely — `status='failed'` rows typically don't have a populated `binomial_raw` (the catch block writes `binomial_raw: ''` at line 501).

**Fix:** Only clear `last_error` when the promotion actually changes the bucket meaningfully:

```js
if (row.match_bucket !== 'resolved-via-synonym' || row.species_slug !== species_slug) {
  row.match_bucket = 'resolved-via-synonym';
  row.binomial_resolved = binomial_resolved;
  row.species_slug = species_slug;
  if (row.status !== 'failed') row.last_error = ''; // preserve failure history; otherwise clear
  promoted++;
  logStage(row.content_hash, 'reclassify', 'resolved-via-synonym', `${binomial} -> ${species_slug}`);
}
```

Or simply leave as-is and document that `last_error` is best-effort historical context, not a runtime contract.

---

_Reviewed: 2026-05-22T17:31:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
