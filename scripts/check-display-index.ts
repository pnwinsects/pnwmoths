// scripts/check-display-index.ts
//
// THE MODEL IS CHECKED AGAINST THE BYTES (#338).
//
// src/_lib/photo-display-index.ts says where every catalogued photograph appears. This
// gate reads the emitted `_site/` and says the same thing from evidence, then fails the
// build on any disagreement.
//
// It exists because the alternative has been tried. The hidden-images report (#299)
// modelled the display rules by hand three times and was wrong three times — the third
// time subtly enough that six photographs went in front of the curator as invisible while
// they were on `/browse/`. The response then was to stop modelling and scan the HTML,
// which was honest but made a data report depend on a completed build.
//
// So: the index is the answer, the scan is the check, and neither is trusted alone. What
// makes this different from the hand models is not that the index is cleverer — it is
// that a wrong index now fails a build instead of producing a plausible CSV.
//
// TWO DIRECTIONS, BOTH FATAL:
//
//   missing   the site shows a photograph the index does not predict. This is the
//             dangerous one: the report would call that photograph invisible and send the
//             curator to rule on something he can already see. It is exactly the #299
//             failure.
//   extra     the index predicts a display the site does not have. The report would call
//             a photograph visible when nothing shows it — the reverse error, and the one
//             that quietly shrinks a report whose whole premise is completeness.
//
// SURFACES THE SCAN CANNOT SEE are excluded from the comparison rather than papered over:
// `account` (the scan deliberately does not label a species' own page) and `other` (a
// filename found on a page that is none of the three surfaces — an escape hatch that has
// never fired). Everything else must match exactly.
//
// Run inside build:site, after eleventy has emitted the pages. Set SITE_DIR to check a
// different tree.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { normalizeSlug, loadUnpublishedSpecies } from '../src/_lib/unpublished-species.ts';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../src/_lib/withheld-families.ts';
import {
  scanBuiltSite,
  readSiteFiles,
  describeIncompleteSite,
  thumbnailKey,
  type ThumbnailSurface,
} from './lib/site-scan.ts';
import { loadDisplayIndex } from './lib/display-index.ts';
import { photoKey, type IndexSurface } from '../src/_lib/photo-display-index.ts';

const ROOT = resolve(import.meta.dirname, '..');
const TAG = '[display-index]';

/** Surfaces both sides can see. `account` and `other` are outside the comparison. */
const COMPARABLE: readonly IndexSurface[] = ['browse', 'identify', 'similar'];

export interface Disagreement {
  slug: string;
  filename: string;
  /** Surfaces the site shows but the index does not predict. */
  missing: ThumbnailSurface[];
  /** Surfaces the index predicts but the site does not show. */
  extra: IndexSurface[];
}

/**
 * Compare predicted locations against observed ones, one photograph at a time.
 *
 * Pure, so the comparison itself is testable without a build — which matters, because a
 * gate that is only exercised by the thing it guards is a gate nobody has checked.
 */
export function compareDisplay(
  predicted: ReadonlyMap<string, ReadonlySet<IndexSurface>>,
  observed: ReadonlyMap<string, ReadonlySet<ThumbnailSurface>>,
  photos: readonly { slug: string; filename: string }[],
): Disagreement[] {
  const disagreements: Disagreement[] = [];
  for (const { slug, filename } of photos) {
    const fromIndex = predicted.get(photoKey(slug, filename)) ?? new Set<IndexSurface>();
    const fromSite = observed.get(thumbnailKey(slug, filename)) ?? new Set<ThumbnailSurface>();
    const missing = COMPARABLE.filter((s) => fromSite.has(s as ThumbnailSurface) && !fromIndex.has(s));
    const extra = COMPARABLE.filter((s) => fromIndex.has(s) && !fromSite.has(s as ThumbnailSurface));
    if (missing.length || extra.length) {
      disagreements.push({ slug, filename, missing: missing as ThumbnailSurface[], extra });
    }
  }
  return disagreements;
}

/** One disagreement, rendered for a maintainer who has to go and look at a page. */
export function describeDisagreement(d: Disagreement): string {
  const parts: string[] = [];
  if (d.missing.length) parts.push(`shown on ${d.missing.join(', ')} but not predicted`);
  if (d.extra.length) parts.push(`predicted on ${d.extra.join(', ')} but not shown`);
  return `  ${d.slug}  ${d.filename}\n      ${parts.join('; ')}`;
}

async function main(): Promise<void> {
  const siteDir = resolve(ROOT, process.env['SITE_DIR'] ?? '_site');
  if (!existsSync(siteDir)) {
    console.error(`${TAG} ERROR: ${siteDir} does not exist. This gate reads the built site; run build:eleventy first.`);
    process.exit(1);
  }

  const rows: Record<string, string>[] = parse(readFileSync(resolve(ROOT, 'data/images.csv'), 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  const photos = rows.map((row) => ({
    slug: normalizeSlug(row['species_slug'] ?? ''),
    filename: row['filename'] ?? '',
  }));

  // The same coverage floor the report used to apply: a hollow `_site/` would show
  // nothing anywhere, and every prediction would read as an over-claim.
  const withheld = loadWithheldFamilies(resolve(ROOT, 'data/withheld-families.csv'));
  const unpublished = loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv'));
  const speciesRows: Record<string, string>[] = parse(
    readFileSync(resolve(ROOT, 'data/species.csv'), 'utf8'),
    { columns: true, skip_empty_lines: true, bom: true },
  );
  let expectedPages = 0;
  for (const row of speciesRows) {
    const slug = normalizeSlug(`${row['genus'] ?? ''}-${row['species'] ?? ''}`);
    if (isWithheldOrUnclassified(row['family'] ?? '', withheld)) continue;
    if (unpublished.has(slug)) continue;
    expectedPages++;
  }
  const problem = describeIncompleteSite(siteDir, expectedPages);
  if (problem) {
    console.error(`${TAG} ERROR: ${siteDir} ${problem}. Nothing can be checked against it.`);
    process.exit(1);
  }

  const observed = scanBuiltSite(readSiteFiles(siteDir), photos).use;
  const predicted = await loadDisplayIndex();
  const disagreements = compareDisplay(predicted, observed, photos);

  if (disagreements.length > 0) {
    console.error(
      `${TAG} FAIL: ${disagreements.length} photograph(s) where the display index and the built ` +
        'site disagree. The index is what data/hidden-images-report.csv reports from, so a ' +
        'disagreement means that report is wrong about what the curator can see.\n' +
        '  Fix src/_lib/photo-display.ts / photo-display-index.ts to match the surface, or the ' +
        'surface to match them — do not adjust this gate.\n',
    );
    for (const d of disagreements.slice(0, 25)) console.error(describeDisagreement(d));
    if (disagreements.length > 25) console.error(`  … and ${disagreements.length - 25} more`);
    process.exit(1);
  }

  const shown = [...predicted.values()].filter((s) => COMPARABLE.some((c) => s.has(c))).length;
  console.log(
    `${TAG} PASS: ${photos.length} catalogued photographs, ${shown} on a browse/identify/similar ` +
      'surface; index agrees with the emitted HTML on every one',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`${TAG} ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
