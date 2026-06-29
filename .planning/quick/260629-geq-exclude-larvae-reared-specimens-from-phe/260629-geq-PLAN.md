---
phase: quick-260629-geq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/parquet-cache.ts
  - src/components/parquet-cache.test.ts
autonomous: true
requirements: ["ISSUE-59"]

must_haves:
  truths:
    - "Specimens whose notes match a REARED_TERM (reared/larva/pupa/etc.) are excluded from the phenology month bars"
    - "The post-2011 stragglers (hecatera-dysodea, arctia-yarrowii, deilephila-elpenor, schizura-concinna) with populated months no longer contribute to phenology counts"
    - "Records with null/empty notes, or notes containing no REARED_TERM, still count toward phenology"
    - "Reared records still appear on the distribution map/popup — filterRecords is unchanged"
  artifacts:
    - path: "src/components/parquet-cache.ts"
      provides: "REARED_TERMS constant, isRearedRecord predicate, reared-exclusion inside aggregateByMonth"
      contains: "REARED_TERMS"
    - path: "src/components/parquet-cache.test.ts"
      provides: "Unit tests for isRearedRecord and aggregateByMonth reared exclusion"
      contains: "isRearedRecord"
  key_links:
    - from: "src/components/parquet-cache.ts:aggregateByMonth"
      to: "src/components/parquet-cache.ts:isRearedRecord"
      via: "skip reared records before counting months"
      pattern: "isRearedRecord"
---

<objective>
Exclude larvae/reared/pupae specimens from the phenology month bars (GitHub issue #59).

Purpose: The legacy Django site excluded reared records from phenology graphs by nulling their month/day/year at data-entry time. ~956 of 963 reared records already carry null months and are already excluded by the existing `aggregateByMonth` (which only counts months 1-12). But 7 newer (post-2011) reared records slipped through with populated months and currently appear in phenology charts. Replicating the legacy keyword scan explicitly makes the exclusion durable and catches these stragglers and any future ones.

Output: A `REARED_TERMS` constant + `isRearedRecord` predicate in `parquet-cache.ts`, wired into `aggregateByMonth` only, plus a companion unit test. The distribution map (which reads `filterRecords`) is deliberately untouched — reared records must still appear on the map.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/parquet-cache.ts
@src/components/pnwm-phenology-chart.ts
@src/types/schemas.ts

# Established facts (from prior investigation — do NOT re-research):
# - aggregateByMonth has exactly ONE caller: pnwm-phenology-chart.ts:110. Filtering
#   inside aggregateByMonth therefore scopes the exclusion to phenology only.
# - The phenology chart's "N records" label already counts null-month/photograph
#   records that never appear as bars, so excluding reared records from
#   aggregateByMonth (but not from the label) introduces NO new inconsistency.
#   Do NOT modify the count label or filterRecords.
# - OccurrenceRecord.notes is `string | null` (src/types/schemas.ts).
# - Exact legacy keyword list from original species/models.py REARED_TERMS:
#   ["reared","larva","em.","pupa","Rubus","immature","broadleaf","Taraxacum","ovum","emerged","emgd","em in","em ex","eggs"]
# - Real straggler note strings observed in data/records.csv (use as test fixtures):
#   hecatera-dysodea  year=2014 month=5 day=4   notes="reared ex pupa, collected late April 2014"
#   arctia-yarrowii   year=2011 month=7 day=29  notes="larva on limestone ridge; Jul. 29, 2011"
#   deilephila-elpenor year=2013 month=8 day=31 notes="Larva"
#   schizura-concinna (reared host-plant note, populated month)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add REARED_TERMS + isRearedRecord and exclude reared records from aggregateByMonth</name>
  <files>src/components/parquet-cache.ts, src/components/parquet-cache.test.ts</files>
  <behavior>
    Write src/components/parquet-cache.test.ts FIRST (RED), using node:test (`describe`/`it`)
    and node:assert/strict — match the style of src/types/schemas.test.ts and
    src/_lib/key-filter.test.ts. Tests run via `node --test <file>.ts` (Node 24
    type-stripping; same mechanism as the existing suite). Define a small helper that
    builds a valid OccurrenceRecord with overridable notes/month.

    isRearedRecord cases (predicate reads r.notes ONLY):
    - returns true for notes "reared ex pupa, collected late April 2014" (matches "reared","pupa")
    - returns true for notes "larva on limestone ridge; Jul. 29, 2011" (matches "larva")
    - returns true for notes "Larva" (case-insensitive match of "larva")
    - returns true for notes "ex. larva on Lactuca serriola; August 13, 2009"
    - returns true for a note containing "em." (e.g. "em. ex pupa")
    - returns false for notes = null
    - returns false for notes = "" (empty string)
    - returns false for a non-reared note, e.g. "At UV light trap, MV lamp"

    aggregateByMonth cases:
    - Given 3 records all month=6: two reared (populated notes), one clean → counts[5] === 1
    - A reared record with populated month does NOT increment any bucket
    - A clean record with month=null still contributes 0 (existing behavior preserved)
  </behavior>
  <action>
    In src/components/parquet-cache.ts:
    1. Define and export a module-level `REARED_TERMS` string array with EXACTLY the
       legacy list (preserve order and casing): "reared","larva","em.","pupa","Rubus",
       "immature","broadleaf","Taraxacum","ovum","emerged","emgd","em in","em ex","eggs".
       Add a one-line comment citing the legacy source (original species/models.py
       REARED_TERMS) and ISSUE-59.
    2. Add and export `isRearedRecord(record: OccurrenceRecord): boolean`. It performs a
       CASE-INSENSITIVE substring match of any REARED_TERM against the `notes` field ONLY
       — never any other column (short tokens like "em." would false-match locality/
       collector). Records with null or empty-string notes are NOT reared (return false).
       Implementation: if notes is null/empty return false; lowercase the notes once and
       return REARED_TERMS.some(term => lowered.includes(term.toLowerCase())).
    3. In `aggregateByMonth`, skip reared records before the month tally: at the top of the
       loop body, `if (isRearedRecord(r)) continue;`. Leave the existing month 1-12 guard
       intact. Do NOT change the function signature.
    Do NOT touch filterRecords, the phenology chart's "N records" label, or any map/popup
    code — reared records must still appear on the distribution map.
    Match existing file style: exported pure functions with JSDoc, no enums/namespaces
    (Node 24 type-stripping constraint already noted in the file's siblings).
  </action>
  <verify>
    <automated>node --test src/components/parquet-cache.test.ts && npm run typecheck</automated>
  </verify>
  <done>
    parquet-cache.test.ts passes; `isRearedRecord` and `REARED_TERMS` are exported;
    `aggregateByMonth` skips reared records via `isRearedRecord`; typecheck (browser + node
    tsconfigs) is clean; filterRecords and pnwm-phenology-chart.ts label are unchanged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| records.parquet → browser | Occurrence data (incl. free-text `notes`) loaded client-side; already zod-validated as OccurrenceRecord at load |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick260629geq-01 | Tampering | isRearedRecord substring scan | accept | `notes` is curator-controlled CSV data, not user input; substring list is a verbatim replica of long-standing legacy behavior. Over/under-match risk is identical to the original site and bounded to phenology bars only (map/popup unaffected). |
| T-quick260629geq-02 | Denial of Service | aggregateByMonth loop | accept | Adds one O(terms) substring check per record (~14 terms, small per-species record counts); negligible cost, no new allocation beyond one lowercased string per record. |
| T-quick260629geq-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this plan (internal logic + test only). |
</threat_model>

<verification>
- `node --test src/components/parquet-cache.test.ts` passes (predicate + aggregation cases).
- `npm run typecheck` clean (both tsconfig.browser.json and tsconfig.node.json).
- Full suite sanity: `npm test` still green (new file is auto-globbed via `src/components/*.test.ts`).
- Real-data grounding (supplementary, not a gate): the straggler rows exist in data/records.csv —
  `grep -iE "hecatera-dysodea|arctia-yarrowii|deilephila-elpenor|schizura-concinna" data/records.csv | grep -iE "reared|larva|pupa"`
  confirms the fixtures used in the test mirror real reared records with populated months.
</verification>

<success_criteria>
- The 7 post-2011 stragglers' note patterns are matched by `isRearedRecord` and excluded from `aggregateByMonth` output, closing #59.
- A clean record (empty/non-reared notes) with a valid month still increments its phenology bucket.
- Reared records remain visible on the distribution map (filterRecords untouched).
- Exclusion is scoped to phenology aggregation only; no change to the chart's record-count label.
</success_criteria>

<output>
Create `.planning/quick/260629-geq-exclude-larvae-reared-specimens-from-phe/260629-geq-SUMMARY.md` when done.
</output>
