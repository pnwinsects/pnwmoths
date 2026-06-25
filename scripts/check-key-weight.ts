// scripts/check-key-weight.ts
// Post-build gate: fails (exit 1) when _site/key-matrix.json gzip exceeds 50 KB.
// Run via: npm run build:check-key-weight
// Env overrides for testing: KEY_MATRIX_PATH, KEY_BUDGET_BYTES
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'zlib';

const BUDGET_BYTES = process.env['KEY_BUDGET_BYTES']
  ? parseInt(process.env['KEY_BUDGET_BYTES'], 10)
  : 50 * 1024;
const ARTIFACT = process.env['KEY_MATRIX_PATH'] ?? '_site/key-matrix.json';

if (!existsSync(ARTIFACT)) {
  console.error(`[key-weight] ERROR: ${ARTIFACT} not found. Run build first.`);
  process.exit(1);
}

const raw = readFileSync(ARTIFACT);
const gz = gzipSync(raw);

if (gz.length > BUDGET_BYTES) {
  console.error(
    `[key-weight] FAIL: ${ARTIFACT} is ${(gz.length / 1024).toFixed(1)} KB gzip (budget: ${(BUDGET_BYTES / 1024).toFixed(0)} KB)`
  );
  process.exit(1);
}

console.log(
  `[key-weight] OK: ${ARTIFACT} is ${(gz.length / 1024).toFixed(1)} KB gzip (<= ${(BUDGET_BYTES / 1024).toFixed(0)} KB budget)`
);
