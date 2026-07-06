// scripts/verify-boundaries.ts
// Standalone DuckDB spatial spot-check of the committed
// data/boundaries/pnw-districts.geojson (Phase 45, Plan 45-02). First use of
// the `spatial` extension / ST_Read / ST_Contains in this repo — see
// .planning/phases/45-boundary-data-acquisition/45-RESEARCH.md Pattern 2.
//
// Confirms three known reference points resolve to the expected district_id
// (SC#2/SC#3): Tacoma, WA -> US:53053 (Pierce); Victoria, BC -> CA:5917
// (Capital); a point near Hanna, AB -> CA:4804 (the Alberta division, D-04).
// Also asserts the committed file is under 1 MB. Fails loudly (process.exit(1))
// on any mismatch — this is the acceptance gate proving the CRS/point-in-
// polygon behavior is actually correct, not just that the file exists.
//
// Run: node scripts/verify-boundaries.ts
import { DuckDBInstance } from '@duckdb/node-api';
import { statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEOJSON_PATH = resolve(ROOT, 'data/boundaries/pnw-districts.geojson');
const MAX_BYTES = 1024 * 1024; // < 1 MB (hundreds of KB expected)

interface ReferencePoint {
  label: string;
  lon: number;
  lat: number;
  expectedDistrictId: string;
}

// The three reference points verified end-to-end in 45-RESEARCH.md against
// the real committed output.
const REFERENCE_POINTS: ReferencePoint[] = [
  { label: 'Tacoma, WA', lon: -122.4443, lat: 47.2529, expectedDistrictId: 'US:53053' },
  { label: 'Victoria, BC', lon: -123.3656, lat: 48.4284, expectedDistrictId: 'CA:5917' },
  { label: 'Hanna, AB', lon: -111.258, lat: 51.424, expectedDistrictId: 'CA:4804' },
];

export async function main(): Promise<void> {
  const stat = statSync(GEOJSON_PATH);
  if (stat.size >= MAX_BYTES) {
    console.error(
      `[verify-boundaries] FAIL: ${GEOJSON_PATH} is ${stat.size} bytes (>= ${MAX_BYTES}, expected hundreds of KB)`,
    );
    process.exit(1);
  }

  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  // Custom extension repository workaround for a documented HTTP-302
  // redirect gotcha installing `spatial` from the default repo (RESEARCH.md
  // Pattern 2 / STACK.md).
  await conn.run("SET custom_extension_repository='https://extensions.duckdb.org';");
  await conn.run('INSTALL spatial;');
  await conn.run('LOAD spatial;');
  await conn.run(`CREATE TABLE districts AS SELECT * FROM ST_Read('${GEOJSON_PATH}');`);

  const failures: string[] = [];
  for (const point of REFERENCE_POINTS) {
    const result = await conn.run(
      `SELECT district_id, name FROM districts WHERE ST_Contains(geom, ST_Point(${point.lon}, ${point.lat}))`,
    );
    const rows = (await result.getRowObjectsJS()) as Array<{ district_id: string; name: string }>;
    if (rows.length !== 1 || rows[0]?.district_id !== point.expectedDistrictId) {
      failures.push(
        `${point.label} (${point.lon}, ${point.lat}): expected ${point.expectedDistrictId}, got ${JSON.stringify(rows)}`,
      );
    } else {
      console.log(`[verify-boundaries] ${point.label} -> ${rows[0]?.district_id} (${rows[0]?.name}) OK`);
    }
  }

  if (failures.length > 0) {
    console.error('[verify-boundaries] FAIL: reference point mismatch(es):');
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }

  console.log(`[verify-boundaries] file size: ${(stat.size / 1024).toFixed(1)} KB (< 1 MB)`);
  console.log('[verify-boundaries] all reference points resolved correctly. OK');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
