// scripts/emit-records-district-audit.ts
// Post-build step: emit an UNLINKED diagnostic CSV, _site/records-district-audit.csv,
// with one row per data/records.csv record, comparing the human-entered `county`
// (stated side, resolved via data/district-crosswalk.csv, D-01) against the
// coordinate-derived district (data/records-derived-district.csv, D-04/D-05).
// Referenced by nothing — reachable only by direct URL. Mirrors
// scripts/emit-species-audit.ts's pure row-builder + CSV serializer split.
//
// PURE CSV/JSON joins only — no DuckDB, no spatial extension at build time
// (D-04). The committed data/records-derived-district.csv and
// data/district-adjacency.csv artifacts already carry the expensive spatial
// work (Phase 47 Plans 02/03), so this step is cheap enough to run on every
// build.
//
// findCoverageGaps() runs FIRST in main() and hard-fails the build (D-07) if
// any records.csv row_index is absent from the derived artifact — a stale
// artifact, not a QC mismatch. A tier mismatch (any tier) NEVER fails the
// build (QC-01) — assignTier() only classifies, it never throws or exits.
//
// Run via: npm run build:records-district-audit (after build:species-audit)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

// ---------------------------------------------------------------------------
// Tier classification — pure, exported, unit-testable without I/O
// ---------------------------------------------------------------------------

export type Tier = 'same' | 'adjacent-and-close' | 'far-mismatch' | 'outside-all-boundaries';

/** Severity ordering for the report sort (D-06): worst problems float to the top. */
export const TIER_SEVERITY: Record<Tier, number> = {
  'far-mismatch': 0,
  'adjacent-and-close': 1,
  'outside-all-boundaries': 2,
  'same': 3,
};

export interface AssignTierInput {
  /** null = any no-district derived outcome (unassigned/out-of-bounds/axis-order-suspect/no-coords). */
  derivedDistrictId: string | null;
  /** Resolved via the state-scoped crosswalk (D-01); null = unmapped or no county at all. */
  statedDistrictId: string | null;
  /** Raw stated county string, used for D-03 (blank check) and D-02 (textual fallback). */
  statedCounty: string;
  /** Derived district's human-readable name, used for D-02's textual fallback compare. */
  derivedDistrictName: string | null;
  /** `${a}|${b}` canonical (a < b lexicographically) adjacent district_id pairs. */
  adjacency: Set<string>;
}

/**
 * Classify one record's stated-vs-derived district comparison into one of the
 * four QC-02 tiers. Never throws — only findCoverageGaps() (a distinct,
 * upstream concern) can hard-fail the build (QC-01).
 *
 * Branch order matters (per 47-RESEARCH Code Examples):
 *   1. D-08: derivedDistrictId === null -> outside-all-boundaries, regardless of stated side.
 *   2. D-03: blank/whitespace-only statedCounty -> same (no assertion to compare).
 *   3. ID-resolved stated side: equal -> same; differing but adjacent -> adjacent-and-close;
 *      differing and not adjacent -> far-mismatch.
 *   4. D-02 textual name-fallback (statedDistrictId null, non-empty statedCounty):
 *      case/space-insensitive name match -> same; otherwise -> far-mismatch
 *      (conservative default — no ID available for an adjacency lookup, Pitfall 3).
 */
export function assignTier(input: AssignTierInput): Tier {
  const { derivedDistrictId, statedDistrictId, statedCounty, derivedDistrictName, adjacency } = input;

  // D-08: any no-district derived outcome -> outside-all-boundaries, regardless of stated side.
  if (derivedDistrictId === null) return 'outside-all-boundaries';

  // D-03: no stated assertion at all -> benign, never a mismatch.
  if (statedCounty.trim() === '') return 'same';

  if (statedDistrictId !== null) {
    if (statedDistrictId === derivedDistrictId) return 'same';
    const [a, b] = [statedDistrictId, derivedDistrictId].sort();
    if (adjacency.has(`${a}|${b}`)) return 'adjacent-and-close';
    return 'far-mismatch';
  }

  // D-02: crosswalk has no entry for this (state, county) — compare textually
  // against the derived district's name.
  const normalize = (s: string) => s.trim().toLowerCase();
  if (derivedDistrictName && normalize(statedCounty) === normalize(derivedDistrictName)) {
    return 'same';
  }
  return 'far-mismatch'; // conservative default — no ID available for adjacency lookup (Pitfall 3)
}

// ---------------------------------------------------------------------------
// Coverage-gap gate (D-07) — check-withheld.ts-shaped pure detector
// ---------------------------------------------------------------------------

export interface CoverageGapResult {
  recordsCount: number;
  artifactCount: number;
  /** Indexes present in records.csv's [0, N) range but absent from the artifact. */
  missingIndexes: number[];
}

/**
 * Detect a stale/incomplete derived-district artifact: any records.csv
 * row_index (0..recordsCount-1) absent from artifactRowIndexes, or
 * artifactCount < recordsCount. Empty missingIndexes iff exact {0..N-1}
 * coverage (D-07). Pure — the CLI entry-point (main()) is what hard-fails.
 */
export function findCoverageGaps(
  recordsCount: number,
  artifactRowIndexes: Set<number>,
): CoverageGapResult {
  const missingIndexes: number[] = [];
  for (let i = 0; i < recordsCount; i++) {
    if (!artifactRowIndexes.has(i)) missingIndexes.push(i);
  }
  return { recordsCount, artifactCount: artifactRowIndexes.size, missingIndexes };
}

// ---------------------------------------------------------------------------
// Content-drift gate (D-07 hardening, CR-01) — presence isn't identity
// ---------------------------------------------------------------------------

/** One field-level content divergence between records.csv and the derived artifact. */
export interface ContentDriftEntry {
  rowIndex: number;
  field: 'species_slug' | 'latitude' | 'longitude' | 'state' | 'county';
  recordsValue: string;
  derivedValue: string;
}

/**
 * Detect content drift between records.csv and the derived-district artifact
 * at each row_index they both have. findCoverageGaps() only proves that a
 * row_index is *present* in the artifact — it says nothing about whether the
 * artifact row at that index still describes the *same* record. A future
 * records.csv edit that reorders/splices rows while preserving the total
 * row count would pass findCoverageGaps() but silently mis-attribute every
 * shifted row's derived district. This is a distinct, sibling staleness
 * check to findCoverageGaps (D-07): both are build-failing artifact-identity
 * checks, neither is a QC mismatch (QC-01 — a tier mismatch never fails the
 * build).
 *
 * Compares species_slug (exact), latitude/longitude (as parsed numbers —
 * tolerant of formatting differences like "47.10" vs "47.1", but an
 * identical raw string always short-circuits to equal so blank/blank
 * no-coords rows never false-drift), state (exact), and county (exact, raw
 * string as stored). Rows absent from the artifact are findCoverageGaps'
 * concern, not this function's — silently skipped here. Pure — the CLI
 * entry-point hard-fails on any returned entry, mirroring the existing
 * findCoverageGaps() failure path.
 */
export function findContentDrift(
  recordsRows: RecordsCsvRow[],
  derivedRows: RecordsCsvRow[],
): ContentDriftEntry[] {
  const derivedByIndex = new Map<number, RecordsCsvRow>();
  for (const d of derivedRows) {
    derivedByIndex.set(Number(d.row_index), d);
  }

  const numsEqual = (a: string, b: string): boolean => a === b || Number(a) === Number(b);

  const drift: ContentDriftEntry[] = [];
  for (const rec of recordsRows) {
    const rowIndex = Number(rec.row_index);
    const derived = derivedByIndex.get(rowIndex);
    if (!derived) continue; // absence is findCoverageGaps' concern (D-07), not content drift's.

    const checks: Array<[ContentDriftEntry['field'], boolean]> = [
      ['species_slug', derived.species_slug !== rec.species_slug],
      ['latitude', !numsEqual(derived.latitude, rec.latitude)],
      ['longitude', !numsEqual(derived.longitude, rec.longitude)],
      ['state', derived.state !== rec.state],
      ['county', derived.county !== rec.county],
    ];
    for (const [field, mismatched] of checks) {
      if (mismatched) {
        drift.push({
          rowIndex,
          field,
          recordsValue: rec[field] as string,
          derivedValue: derived[field] as string,
        });
      }
    }
  }
  return drift;
}

// ---------------------------------------------------------------------------
// Row-builder — pure, joins records.csv to records-derived-district.csv by
// row_index ONLY (never by content, RESEARCH.md Pattern 3)
// ---------------------------------------------------------------------------

/** One data/records.csv row, augmented with its 0-based file-order row_index. */
export interface RecordsCsvRow {
  row_index: number | string;
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
}

/** One data/records-derived-district.csv row (as parsed — all string fields). */
export interface DerivedDistrictCsvRow {
  row_index: number | string;
  outcome: string;
  district_id: string;
  distance_km: string;
}

export interface BuildAuditRowsOptions {
  recordsRows: RecordsCsvRow[];
  derivedRows: DerivedDistrictCsvRow[];
  /** State-scoped crosswalk (D-01): `${state}|${county}` -> stable district_id. */
  crosswalk: Map<string, string>;
  /** district_id -> human-readable name (from the boundary GeoJSON, Pattern 2). */
  nameById: Map<string, string>;
  /** `${a}|${b}` canonical adjacent district_id pairs. */
  adjacency: Set<string>;
}

/** One emitted audit row (all string fields, per AUDIT_HEADER's fixed column order). */
export interface AuditRow {
  row_index: string;
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
  stated_district_id: string;
  stated_district_name: string;
  derived_district_id: string;
  derived_district_name: string;
  derived_outcome: string;
  tier: Tier;
  stated_resolution_method: string;
  distance_km: string;
}

/**
 * Build one AuditRow per records.csv row (D-06). Joins the derived side by
 * row_index only — never by (species_slug, latitude, longitude, ...), which
 * is empirically non-unique in records.csv (RESEARCH.md Pattern 3).
 */
export function buildRecordsDistrictAuditRows(opts: BuildAuditRowsOptions): AuditRow[] {
  const { recordsRows, derivedRows, crosswalk, nameById, adjacency } = opts;

  const derivedByIndex = new Map<number, DerivedDistrictCsvRow>();
  for (const d of derivedRows) {
    derivedByIndex.set(Number(d.row_index), d);
  }

  return recordsRows.map((rec): AuditRow => {
    const rowIndex = Number(rec.row_index);
    const derived = derivedByIndex.get(rowIndex);

    const derivedDistrictId = derived?.district_id ? derived.district_id : null;
    const derivedOutcome = derived?.outcome ?? '';
    const distanceKm = derived?.distance_km ?? '';
    const derivedDistrictName = derivedDistrictId ? nameById.get(derivedDistrictId) ?? null : null;

    const state = rec.state ?? '';
    const county = rec.county ?? '';

    let statedDistrictId: string | null = null;
    let statedResolutionMethod: string;
    if (county.trim() === '') {
      statedResolutionMethod = 'none';
    } else {
      const crosswalkId = crosswalk.get(`${state}|${county}`);
      if (crosswalkId) {
        statedDistrictId = crosswalkId;
        statedResolutionMethod = 'crosswalk';
      } else {
        statedResolutionMethod = 'name-fallback';
      }
    }

    const statedDistrictName = statedDistrictId ? nameById.get(statedDistrictId) ?? '' : '';

    const tier = assignTier({
      derivedDistrictId,
      statedDistrictId,
      statedCounty: county,
      derivedDistrictName,
      adjacency,
    });

    return {
      row_index: String(rowIndex),
      species_slug: rec.species_slug ?? '',
      latitude: rec.latitude ?? '',
      longitude: rec.longitude ?? '',
      state,
      county,
      stated_district_id: statedDistrictId ?? '',
      stated_district_name: statedDistrictName,
      derived_district_id: derivedDistrictId ?? '',
      derived_district_name: derivedDistrictName ?? '',
      derived_outcome: derivedOutcome,
      tier,
      stated_resolution_method: statedResolutionMethod,
      distance_km: distanceKm,
    };
  });
}

// ---------------------------------------------------------------------------
// CSV serialization — RFC-4180 quoting + severity sort (pure CSV, no preamble)
// ---------------------------------------------------------------------------

/** CSV header — fixed column order. */
export const AUDIT_HEADER =
  'row_index,species_slug,latitude,longitude,state,county,stated_district_id,stated_district_name,derived_district_id,derived_district_name,derived_outcome,tier,stated_resolution_method,distance_km';

/** Per-tier count summary + total, tallied from audit rows. Pure — no I/O. */
export interface AuditSummary {
  'far-mismatch': number;
  'adjacent-and-close': number;
  'outside-all-boundaries': number;
  'same': number;
  total: number;
}

/**
 * Tally per-tier counts + total across audit rows (D-06's summary counts,
 * now emitted as a JSON sidecar + build stdout instead of a CSV preamble).
 */
export function buildSummary(rows: AuditRow[]): AuditSummary {
  const counts: Record<Tier, number> = {
    same: 0,
    'adjacent-and-close': 0,
    'far-mismatch': 0,
    'outside-all-boundaries': 0,
  };
  for (const r of rows) counts[r.tier]++;

  return {
    'far-mismatch': counts['far-mismatch'],
    'adjacent-and-close': counts['adjacent-and-close'],
    'outside-all-boundaries': counts['outside-all-boundaries'],
    same: counts.same,
    total: rows.length,
  };
}

/** Quote-and-escape a single CSV field per RFC-4180 (only when needed). */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize audit rows to pure RFC-4180 CSV: AUDIT_HEADER followed by data
 * rows sorted by severity (far-mismatch -> adjacent-and-close ->
 * outside-all-boundaries -> same), then species_slug, then numeric row_index
 * as a final deterministic tie-break. NO comment/preamble lines — the output
 * must be parseable by a standard single-header-row CSV reader. Per-tier
 * summary counts live in buildSummary()'s JSON sidecar instead (D-06).
 */
export function toCsv(rows: AuditRow[]): string {
  const sorted = [...rows].sort(
    (a, b) =>
      TIER_SEVERITY[a.tier] - TIER_SEVERITY[b.tier] ||
      (a.species_slug < b.species_slug ? -1 : a.species_slug > b.species_slug ? 1 : 0) ||
      Number(a.row_index) - Number(b.row_index),
  );

  const lines = [AUDIT_HEADER];
  for (const r of sorted) {
    lines.push(
      [
        csvField(r.row_index),
        csvField(r.species_slug),
        csvField(r.latitude),
        csvField(r.longitude),
        csvField(r.state),
        csvField(r.county),
        csvField(r.stated_district_id),
        csvField(r.stated_district_name),
        csvField(r.derived_district_id),
        csvField(r.derived_district_name),
        csvField(r.derived_outcome),
        csvField(r.tier),
        csvField(r.stated_resolution_method),
        csvField(r.distance_km),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI entry-point — wires the real committed data sources (pure CSV/JSON, D-04)
// ---------------------------------------------------------------------------

interface RawRecordsCsvRow {
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
}

interface RawDerivedDistrictCsvRow {
  row_index: string;
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
  outcome: string;
  district_id: string;
  distance_km: string;
}

interface RawCrosswalkRow {
  state: string;
  legacy_name: string;
  stable_id: string;
}

interface RawAdjacencyRow {
  district_id_a: string;
  district_id_b: string;
}

interface BoundaryGeoJson {
  features: Array<{ properties: { district_id: string; name: string } }>;
}

export async function main(): Promise<void> {
  const recordsRaw = parse(readFileSync(resolve('data/records.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as RawRecordsCsvRow[];

  const derivedRaw = parse(readFileSync(resolve('data/records-derived-district.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as RawDerivedDistrictCsvRow[];

  const recordsRows: RecordsCsvRow[] = recordsRaw.map((r, i) => ({
    row_index: i,
    species_slug: r.species_slug,
    latitude: r.latitude,
    longitude: r.longitude,
    state: r.state,
    county: r.county,
  }));

  // findCoverageGaps() FIRST — hard-fail before any join/write on a stale artifact (D-07).
  const artifactRowIndexes = new Set<number>(derivedRaw.map((r) => Number(r.row_index)));
  const gap = findCoverageGaps(recordsRaw.length, artifactRowIndexes);
  if (gap.missingIndexes.length > 0) {
    console.error(
      `[emit-records-district-audit] COVERAGE GAP: ${gap.missingIndexes.length} record(s) in ` +
        `data/records.csv are absent from data/records-derived-district.csv ` +
        `(recordsCount=${gap.recordsCount}, artifactCount=${gap.artifactCount}). ` +
        `Re-run \`node scripts/derive-district-audit.ts\` and commit the regenerated ` +
        `data/records-derived-district.csv before building. First missing index: ${gap.missingIndexes[0]}.`,
    );
    process.exit(1);
    return;
  }

  // findContentDrift() SECOND (CR-01 hardening of D-07) — findCoverageGaps only
  // proves row_index presence; this proves the artifact row at each index still
  // describes the SAME record as records.csv, catching a reorder/splice that
  // preserves total row count. Also a staleness/integrity failure, never a QC
  // mismatch — hard-fails the build exactly like the coverage-gap check above.
  const derivedContentRows: RecordsCsvRow[] = derivedRaw.map((r) => ({
    row_index: Number(r.row_index),
    species_slug: r.species_slug,
    latitude: r.latitude,
    longitude: r.longitude,
    state: r.state,
    county: r.county,
  }));
  const drift = findContentDrift(recordsRows, derivedContentRows);
  const [first] = drift;
  if (first) {
    console.error(
      `[emit-records-district-audit] CONTENT DRIFT: ${drift.length} field(s) diverge between ` +
        `data/records.csv and data/records-derived-district.csv at shared row_index(es) — the ` +
        `artifact no longer describes the same records (a reorder/splice of records.csv since ` +
        `the artifact was generated). First divergence: row_index=${first.rowIndex}, ` +
        `field=${first.field} (records.csv="${first.recordsValue}" vs artifact="${first.derivedValue}"). ` +
        `Re-run \`node scripts/derive-district-audit.ts\` and commit the regenerated ` +
        `data/records-derived-district.csv before building.`,
    );
    process.exit(1);
    return;
  }

  const crosswalkRaw = parse(readFileSync(resolve('data/district-crosswalk.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as RawCrosswalkRow[];
  const crosswalk = new Map<string, string>();
  for (const row of crosswalkRaw) {
    crosswalk.set(`${row.state}|${row.legacy_name}`, row.stable_id);
  }

  const adjacencyRaw = parse(readFileSync(resolve('data/district-adjacency.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as RawAdjacencyRow[];
  const adjacency = new Set<string>();
  for (const row of adjacencyRaw) {
    adjacency.add(`${row.district_id_a}|${row.district_id_b}`);
  }

  // Pattern 2: read the boundary GeoJSON as plain JSON for the id->name map — no DuckDB, no ST_Read.
  const geo = JSON.parse(
    readFileSync(resolve('data/boundaries/pnw-districts.geojson'), 'utf8'),
  ) as BoundaryGeoJson;
  const nameById = new Map<string, string>(
    geo.features.map((f) => [f.properties.district_id, f.properties.name]),
  );

  const derivedRows: DerivedDistrictCsvRow[] = derivedRaw.map((r) => ({
    row_index: Number(r.row_index),
    outcome: r.outcome,
    district_id: r.district_id,
    distance_km: r.distance_km,
  }));

  const rows = buildRecordsDistrictAuditRows({
    recordsRows,
    derivedRows,
    crosswalk,
    nameById,
    adjacency,
  });

  mkdirSync(resolve('_site'), { recursive: true });
  writeFileSync(resolve('_site/records-district-audit.csv'), toCsv(rows));

  const summary = buildSummary(rows);
  writeFileSync(
    resolve('_site/records-district-audit-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );

  console.log(
    `[emit-records-district-audit] far-mismatch=${summary['far-mismatch']} ` +
      `adjacent-and-close=${summary['adjacent-and-close']} ` +
      `outside-all-boundaries=${summary['outside-all-boundaries']} ` +
      `same=${summary.same} total=${summary.total}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
