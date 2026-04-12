// scripts/check-page-weight.js
// Post-build check: warns when any HTML page exceeds the configured threshold.
// Run via: npm run build:check-weight
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const THRESHOLD_BYTES = 500 * 1024; // 500KB per D-11
const SITE_DIR = process.env.SITE_DIR || '_site';

let warnCount = 0;

function walkHtml(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtml(fullPath);
    } else if (entry.name.endsWith('.html')) {
      const { size } = statSync(fullPath);
      if (size > THRESHOLD_BYTES) {
        console.warn(`[page-weight] WARNING: ${fullPath} is ${(size / 1024).toFixed(1)}KB (threshold: 500KB)`);
        warnCount++;
      }
    }
  }
}

if (!existsSync(SITE_DIR)) {
  console.error(`[page-weight] ERROR: SITE_DIR "${SITE_DIR}" does not exist. Run the build first.`);
  process.exit(1);
}

walkHtml(SITE_DIR);
if (warnCount > 0) {
  console.warn(`[page-weight] ${warnCount} page(s) exceed 500KB threshold.`);
} else {
  console.log('[page-weight] All pages under 500KB threshold.');
}
