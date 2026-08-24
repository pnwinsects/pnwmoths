// Copy the advisory reports named in src/_data/curationReports.ts into _site/,
// so /curation/ links real files (issue #332).
//
// Runs after build:eleventy for the same reason build:copy-parquet and
// build:copy-images do: eleventy-plugin-vite renames _site -> .11ty-vite and builds
// into a fresh empty _site/, so nothing an Eleventy passthrough copied survives.
// See docs/lessons-learned.md.
//
// A missing source is a HARD failure, not an advisory one. The reports themselves are
// advisory — they report disagreements for a human to judge — but a source file that
// is not on disk means the manifest names a file this repo does not have, which would
// ship a page full of 404s. The blocking link check would catch it later with a much
// worse message.
//
// Run via: npm run build:copy-curation-reports
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { copyPlan, type CopyInstruction } from '../src/_data/curationReports.ts';

const SITE_DIR = process.env['SITE_DIR'] ?? '_site';

/** Sources the manifest names that are not on disk. Pure — testable without I/O. */
export function missingSources(plan: CopyInstruction[], onDisk: (path: string) => boolean): string[] {
  return plan.map((item) => item.source).filter((source) => !onDisk(source));
}

export async function copyCurationReports(
  plan: CopyInstruction[],
  siteDir: string,
  onDisk: (path: string) => boolean = existsSync,
): Promise<number> {
  const missing = missingSources(plan, onDisk);
  if (missing.length > 0) {
    throw new Error(
      `[curation-reports] ${missing.length} report source(s) named in src/_data/curationReports.ts ` +
        `are not on disk:\n  ${missing.join('\n  ')}\n` +
        'Either generate them, or remove their entry from the manifest.',
    );
  }
  for (const { source, dest } of plan) {
    const target = resolve(siteDir, dest);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(source), target);
  }
  return plan.length;
}

async function main(): Promise<void> {
  if (!existsSync(SITE_DIR)) {
    console.error(`[curation-reports] ERROR: SITE_DIR "${SITE_DIR}" does not exist. Run the build first.`);
    process.exit(1);
  }
  const plan = copyPlan();
  try {
    const count = await copyCurationReports(plan, SITE_DIR);
    console.log(`[curation-reports] copied ${count} report(s) into ${SITE_DIR}/curation/`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
