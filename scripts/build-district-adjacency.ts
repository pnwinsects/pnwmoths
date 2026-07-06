// scripts/build-district-adjacency.ts
// One-time, boundary-lifecycle maintainer script (Phase 47, Plan 03).
// Precomputes the district-adjacency lookup table from the committed
// data/boundaries/pnw-districts.geojson (205 features) so that Phase 47's
// build-time emit step (47-04) can split QC tiers adjacent-and-close vs.
// far-mismatch with pure set-membership lookups — no distance math, no
// spatial extension at build time (QC-02, RESEARCH Option B).
//
// This artifact is regenerated only when the boundary geometry itself
// changes (via _instructions/REFRESHING_BOUNDARIES.md), NOT when records are
// added (that's ASSIGNING_DISTRICTS.md's concern) — the adjacency
// computation is a pure function of geometry, independent of
// data/records.csv.
//
// Reuses the DuckDB spatial-extension load idiom verbatim from
// scripts/verify-boundaries.ts (custom_extension_repository workaround,
// INSTALL/LOAD spatial, CREATE TABLE districts AS SELECT FROM ST_Read), the
// fail-loud-on-empty zero-row guard from scripts/fill-district-from-coords.ts,
// and the shared FALLBACK_DEGREE_THRESHOLD constant from
// scripts/lib/district-assignment.ts (the same ~2 km tolerance already tuned
// for coordinate-fallback matching in Phase 46 — not a second invented
// number, RESEARCH.md Pitfall 2).
//
// Only the numeric FALLBACK_DEGREE_THRESHOLD constant and the committed
// geojson path are ever interpolated into SQL here — no untrusted string
// (Security Domain V5).
//
// Run: node scripts/build-district-adjacency.ts
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'csv-stringify/sync';
import { DuckDBInstance } from '@duckdb/node-api';
import { FALLBACK_DEGREE_THRESHOLD } from './lib/district-assignment.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ADJACENCY_COLUMNS = ['district_id_a', 'district_id_b'];

/** One data/district-adjacency.csv row — a canonical a<b district pair. */
export interface AdjacencyPair {
  district_id_a: string;
  district_id_b: string;
}

/**
 * Loads the boundary GeoJSON into DuckDB spatial and computes every
 * canonical (district_id_a < district_id_b) pair whose polygons touch
 * (ST_Touches) or are within FALLBACK_DEGREE_THRESHOLD of each other
 * (ST_DWithin, covering US/CA simplification-seam near-misses — RESEARCH.md
 * Pitfall 2). The a<b join predicate yields the canonical orientation and
 * eliminates reverse duplicates and self-pairs in one step. Fails loudly if
 * the districts table loads zero rows — never silently emits an empty
 * adjacency table from a malformed/empty boundary file.
 */
export async function computeAdjacency(geojsonPath: string): Promise<AdjacencyPair[]> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  try {
    // Custom extension repository workaround for a documented HTTP-302
    // redirect gotcha installing `spatial` from the default repo — copied
    // verbatim from scripts/verify-boundaries.ts (load-bearing).
    await conn.run("SET custom_extension_repository='https://extensions.duckdb.org';");
    await conn.run('INSTALL spatial;');
    await conn.run('LOAD spatial;');
    await conn.run(`CREATE TABLE districts AS SELECT * FROM ST_Read('${geojsonPath}');`);

    const countResult = await conn.run('SELECT COUNT(*) AS n FROM districts;');
    const countRows = (await countResult.getRowObjectsJS()) as Array<{ n: bigint | number }>;
    const districtCount = Number(countRows[0]?.n ?? 0);
    if (districtCount === 0) {
      throw new Error(
        `[build-district-adjacency] FAIL: districts table loaded zero rows from ${geojsonPath} — refusing to compute adjacency against an empty/malformed boundary file`,
      );
    }

    // Self-join: a.district_id < b.district_id yields the canonical a<b
    // orientation and eliminates reverse duplicates and self-pairs.
    // ST_Touches catches exact topological adjacency; ST_DWithin(...,
    // FALLBACK_DEGREE_THRESHOLD) additionally catches simplification-seam
    // near-misses (RESEARCH.md Pitfall 2) using the SAME tolerance already
    // established for coordinate-fallback matching, not a second invented
    // number.
    //
    // Rule 1 auto-fix (discovered empirically this plan): this DuckDB
    // spatial build's ST_Distance/ST_DWithin silently returns 0/true for
    // raw Polygon-Polygon geometry pairs regardless of actual separation
    // (verified: two clearly-far synthetic squares ~0.95 degrees apart
    // reported ST_Distance = 0). Wrapping both operands in ST_Boundary()
    // (Polygon -> its ring LineString) restores correct distance
    // computation while ST_Touches is unaffected (topological predicate,
    // not distance-based) and continues to operate on the full polygons.
    //
    // WR-01: verified against `spatial` extension_version 'a415e74' (per
    // `SELECT extension_version FROM duckdb_extensions() WHERE
    // extension_name='spatial';`, captured 2026-07-05), including against
    // MultiPolygon operands (build-district-adjacency.test.ts's
    // "MultiPolygon operands (WR-01)" describe block) — 20 of the 205
    // committed districts in pnw-districts.geojson are MultiPolygon. `INSTALL
    // spatial;` above has no version pin, so a future extension update could
    // silently change this behavior; re-run the version query above and diff
    // against 'a415e74' if this workaround's correctness is ever in doubt.
    const result = await conn.run(`
      SELECT a.district_id AS district_id_a, b.district_id AS district_id_b
      FROM districts a
      JOIN districts b
        ON a.district_id < b.district_id
        AND (
          ST_Touches(a.geom, b.geom)
          OR ST_DWithin(ST_Boundary(a.geom), ST_Boundary(b.geom), ${FALLBACK_DEGREE_THRESHOLD})
        )
      ORDER BY a.district_id, b.district_id
    `);
    const rows = (await result.getRowObjectsJS()) as Array<{
      district_id_a: string;
      district_id_b: string;
    }>;

    return rows
      .map((row) => ({ district_id_a: row.district_id_a, district_id_b: row.district_id_b }))
      .sort((x, y) =>
        x.district_id_a < y.district_id_a
          ? -1
          : x.district_id_a > y.district_id_a
            ? 1
            : x.district_id_b < y.district_id_b
              ? -1
              : x.district_id_b > y.district_id_b
                ? 1
                : 0,
      );
  } finally {
    conn.closeSync();
  }
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const geojsonPath = resolve(ROOT, 'data/boundaries/pnw-districts.geojson');
  const pairs = await computeAdjacency(geojsonPath);

  writeFileSync(
    resolve(ROOT, 'data/district-adjacency.csv'),
    stringify(pairs, { header: true, columns: ADJACENCY_COLUMNS }),
    'utf8',
  );

  console.log(`[build-district-adjacency] pairs: ${pairs.length}`);
  console.log('[build-district-adjacency] wrote data/district-adjacency.csv');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
