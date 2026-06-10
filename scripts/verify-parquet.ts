// scripts/verify-parquet.ts
// Standalone full-dataset per-row Parquet validation against OccurrenceRecordSchema (SCHEMA-07)
// D-03: reads every data/parquet/{slug}/records.parquet with hyparquet
// D-04: scan-all-then-summarize — never fail-fast mid-scan
// D-05: single quiet summary line on clean run; exit non-zero with FAIL lines on errors
// Pitfall 1: isolate from Node's shared pool ArrayBuffer via raw.buffer.slice(...)
import { parquetReadObjects } from 'hyparquet';
import { readFileSync, readdirSync } from 'node:fs';
import { OccurrenceRecordSchema } from '../src/types/schemas.ts';

type FailureSummary = { slug: string; row: number; issues: string };

const PARQUET_DIR = 'data/parquet';

const species = readdirSync(PARQUET_DIR).sort();
let totalRows = 0;
const failures: FailureSummary[] = [];

for (const slug of species) {
  const filePath = `${PARQUET_DIR}/${slug}/records.parquet`;
  const raw = readFileSync(filePath);
  // CRITICAL (Pitfall 1): isolate from Node's shared pool buffer.
  // raw.buffer is a shared 8192-byte pool when the file is small; byteOffset is non-zero.
  // Passing raw.buffer directly causes hyparquet to throw "parquet file invalid (footer != PAR1)".
  const ab: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const file = {
    byteLength: ab.byteLength,
    slice: (s: number, e: number) => ab.slice(s, e),
  };
  const records = await parquetReadObjects({ file }) as unknown[];
  totalRows += records.length;
  records.forEach((rec, i) => {
    const result = OccurrenceRecordSchema.safeParse(rec);
    if (!result.success) {
      failures.push({
        slug,
        row: i,
        issues: result.error.issues.map(iss => `${iss.path.join('.')}: ${iss.message}`).join('; '),
      });
    }
  });
}

if (failures.length > 0) {
  // D-04: scan-all, print every failure, then summarize
  for (const f of failures) {
    process.stderr.write(`FAIL ${f.slug} row ${f.row}: ${f.issues}\n`);
  }
  process.stderr.write(`FAIL: ${failures.length} validation error(s) across ${species.length} species, ${totalRows} rows\n`);
  process.exit(1);
}

// D-05: single quiet summary line on clean run
process.stdout.write(`OK: ${species.length} species, ${totalRows} rows validated\n`);
