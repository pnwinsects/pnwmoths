// scripts/check-derivatives.ts
// Post-build gate: hard-fails (exit 1) when an image the site needs has no
// pre-generated derivative on the CDN (#226 / #211, docs/adr/0022).
// Run via: npm run build:check-derivatives (after build:eleventy)
//
// Why this exists: until the Bunny Optimizer was retired, the edge resized and
// format-converted whatever a curator uploaded, so an unprocessed upload still
// looked right. Now it does not — an un-derived image is served raw and
// full-size into a 93px slot, and nothing says so. This turns that silent
// quality regression into a build failure naming the file and the variant.
//
// Two gates, because they fail in opposite directions:
//
//   EMITTED GATE  — every derivative URL in the built HTML must be in the
//                   manifest. Catches a template asking for a variant nobody
//                   generates (a new token, or a token outside the source's
//                   kind in the ADR 0022 matrix).
//   SOURCE GATE   — every source image a built page can reach must have its
//                   whole variant set in the manifest. Catches a new photo that
//                   was uploaded but never run through generate-derivatives,
//                   which the emitted gate cannot see: the Lit components build
//                   their thumbnail URLs in the browser, so those URLs are never
//                   in the HTML at all.
//
// Both read data/image-derivatives.csv rather than probing the CDN. The manifest
// records what upload-derivatives.ts actually PUT, so it answers the question
// exactly, offline and reproducibly (ADR 0017) — where 23,172 HEAD requests
// would fail the build on any network blip.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../src/_lib/withheld-families.ts';
import { loadUnpublishedSpecies, isUnpublished, normalizeSlug } from '../src/_lib/unpublished-species.ts';
import { readSources, specsForSource, type SourceInventory, type SourceKind } from './lib/derivatives.ts';

// ---------------------------------------------------------------------------
// Module-level constants (project convention; mirrors upload-derivatives.ts).
// ---------------------------------------------------------------------------

/** Public constant, not a secret and not an env var — see CLAUDE.md. */
const CDN_BASE_URL = 'https://moths.pnwinsects.org';
const SITE_DIR: string = process.env['SITE_DIR'] ?? '_site';
const DATA_DIR: string = process.env['DATA_DIR'] ?? 'data';
const MANIFEST_PATH: string = process.env['MANIFEST_PATH'] ?? 'data/image-derivatives.csv';

/**
 * Any absolute URL whose path contains a `derived/` segment.
 *
 * Deliberately not anchored to CDN_BASE_URL: a derivative emitted under the
 * wrong origin — a pathPrefix leaking in, say — is a bug we want named, not one
 * we want skipped. The origin is checked after extraction.
 *
 * The character class stops at quote, whitespace and comma so one match is one
 * URL inside `src="…"` and inside a `srcset` list, where entries are separated
 * by commas and followed by a ` 530w` descriptor. Emitted paths are
 * percent-encoded, so no real URL contains any of those characters.
 */
const CDN_URL_RE = /https?:\/\/[^"'\s,]*\/derived\/[^"'\s,]+/g;

// ---------------------------------------------------------------------------
// Exported pure helpers — unit-testable without a full build
// ---------------------------------------------------------------------------

/** A derivative URL in the built site that the manifest does not account for. */
export interface EmittedGap {
  /** Site-relative path of the page that emitted it. */
  page: string;
  url: string;
  /** Why it failed: absent from the manifest, or served from the wrong origin. */
  reason: 'not-in-manifest' | 'wrong-origin';
}

/** A source image whose variant set is not fully on the CDN. */
export interface SourceGap {
  sourcePath: string;
  kind: SourceKind;
  /** Variant tokens missing from the manifest, in matrix order. */
  missingVariants: string[];
  speciesSlug: string | null;
}

/** Every `derived/` URL in one HTML document, in document order. */
export function extractDerivativeUrls(html: string): string[] {
  return html.match(CDN_URL_RE) ?? [];
}

/**
 * Storage path addressed by a derivative URL, or null if it is not on our CDN.
 *
 * `decodeURIComponent` is the whole trick: templates emit `%20` for the spaces
 * in Django-era filenames and `%40` for the `@` variant separator, while the
 * manifest stores both raw.
 */
export function storagePathOf(url: string, cdnBaseUrl: string = CDN_BASE_URL): string | null {
  if (!url.startsWith(`${cdnBaseUrl}/`)) return null;
  return decodeURIComponent(url.slice(cdnBaseUrl.length + 1));
}

export interface FindEmittedGapsOptions {
  /** Built pages as `{ page, html }` — page is a site-relative path for messages. */
  pages: ReadonlyArray<{ page: string; html: string }>;
  /** `derived_path` values from the committed manifest. */
  known: ReadonlySet<string>;
  cdnBaseUrl?: string;
}

/**
 * Derivative URLs in the built site that are not backed by an uploaded file.
 *
 * Only `derived/` URLs are considered. The site emits ~3,700 other CDN URLs
 * that are correctly not derivatives — the 1500w hero slot (which *is* the
 * stored `_thumbnail.webp`), plates, site images, and the legacy JPEG og:image
 * that must stay JPEG for crawlers (ADR 0021). Flagging those would be wrong.
 */
export function findEmittedGaps(opts: FindEmittedGapsOptions): EmittedGap[] {
  const { pages, known, cdnBaseUrl = CDN_BASE_URL } = opts;
  const gaps: EmittedGap[] = [];
  const seen = new Set<string>();

  for (const { page, html } of pages) {
    for (const url of extractDerivativeUrls(html)) {
      if (seen.has(url)) continue;
      seen.add(url);
      const path = storagePathOf(url, cdnBaseUrl);
      if (path === null) {
        gaps.push({ page, url, reason: 'wrong-origin' });
      } else if (!known.has(path)) {
        gaps.push({ page, url, reason: 'not-in-manifest' });
      }
    }
  }
  return gaps;
}

/**
 * The subset of the inventory a built page can reach, deduplicated by path.
 *
 * Scoping to species that build is load-bearing rather than a convenience:
 * data/images.csv carries 83 rows for 27 Geometridae whose files are simply not
 * on the CDN (#232). Geometridae is withheld today, so no page renders them and
 * an unscoped gate would fail every build over images nobody can see. Lift that
 * embargo and this gate fails naming all 83 — which is exactly right, because
 * publishing those pages would publish broken images.
 */
export function scopedSources(
  sources: SourceInventory,
  buildableSlugs: ReadonlySet<string>,
): Array<{ path: string; kind: SourceKind; speciesSlug: string | null }> {
  const scoped: Array<{ path: string; kind: SourceKind; speciesSlug: string | null }> = [];
  const seen = new Set<string>();

  for (const kind of Object.keys(sources) as SourceKind[]) {
    for (const entry of sources[kind]) {
      // A null slug means the image is not species-scoped (glossary art), which
      // is always in scope — the glossary page is unconditional.
      if (entry.speciesSlug !== null && !buildableSlugs.has(normalizeSlug(entry.speciesSlug))) continue;
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      scoped.push({ path: entry.path, kind, speciesSlug: entry.speciesSlug });
    }
  }
  return scoped;
}

/** Source images a built page can reach whose variant set is incomplete. */
export function findSourceGaps(
  scoped: ReadonlyArray<{ path: string; kind: SourceKind; speciesSlug: string | null }>,
  known: ReadonlySet<string>,
): SourceGap[] {
  const gaps: SourceGap[] = [];
  for (const entry of scoped) {
    const missingVariants = specsForSource(entry.path, entry.kind)
      .filter((spec) => !known.has(spec.derivedPath))
      .map((spec) => spec.variant.token);
    if (missingVariants.length > 0) {
      gaps.push({
        sourcePath: entry.path,
        kind: entry.kind,
        missingVariants,
        speciesSlug: entry.speciesSlug,
      });
    }
  }
  return gaps;
}

/**
 * Slugs of species that get a page, applying the same two gates src/_data/species.ts does.
 *
 * Derived from data rather than read back out of _site: `_site` is not cleaned
 * between builds, so a stale directory would silently widen the gate's scope.
 */
export function buildableSlugs(
  rows: ReadonlyArray<{ genus: string; species: string; family: string | null }>,
  withheld: Set<string>,
  unpublished: Set<string>,
): Set<string> {
  const slugs = new Set<string>();
  for (const row of rows) {
    if (isWithheldOrUnclassified(row.family, withheld)) continue;
    const slug = normalizeSlug(`${row.genus}-${row.species}`);
    if (isUnpublished(slug, unpublished)) continue;
    slugs.add(slug);
  }
  return slugs;
}

// ---------------------------------------------------------------------------
// File-system wiring
// ---------------------------------------------------------------------------

/** Every built HTML page, as `{ page, html }` with a site-relative page path. */
export function readPages(siteDir: string): Array<{ page: string; html: string }> {
  const pages: Array<{ page: string; html: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // HTML only. The component bundle also contains the string "derived/",
      // but as a template literal it assembles at runtime — there is no URL in
      // it to check, which is precisely what the source gate is for.
      else if (entry.name.endsWith('.html')) pages.push({ page: relative(siteDir, full), html: readFileSync(full, 'utf8') });
    }
  };
  walk(siteDir);
  return pages;
}

/** `derived_path` values from the committed manifest. */
export function readManifestPaths(manifestPath: string): Set<string> {
  const rows = parse(readFileSync(manifestPath), {
    columns: true, skip_empty_lines: true,
  }) as Array<{ derived_path: string }>;
  return new Set(rows.map((r) => r.derived_path));
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

function main(): void {
  const known = readManifestPaths(resolve(MANIFEST_PATH));
  if (known.size === 0) {
    console.error(
      `[check-derivatives] ${MANIFEST_PATH} is empty — every image would be reported missing. ` +
      'Regenerate it with `node scripts/upload-derivatives.ts`.',
    );
    process.exit(1);
  }

  // EMITTED GATE
  const siteDir = resolve(SITE_DIR);
  if (!existsSync(siteDir)) {
    console.error(`[check-derivatives] ERROR: SITE_DIR "${SITE_DIR}" does not exist. Run the build first.`);
    process.exit(1);
  }
  const pages = readPages(siteDir);
  const emittedGaps = findEmittedGaps({ pages, known });

  // SOURCE GATE
  const speciesRows = parse(readFileSync(resolve(DATA_DIR, 'species.csv')), {
    columns: true, skip_empty_lines: true,
  }) as Array<{ genus: string; species: string; family: string | null }>;
  const buildable = buildableSlugs(speciesRows, loadWithheldFamilies(), loadUnpublishedSpecies());
  const scoped = scopedSources(readSources(resolve(DATA_DIR)), buildable);
  const sourceGaps = findSourceGaps(scoped, known);

  if (emittedGaps.length > 0) {
    console.error(
      `[check-derivatives] EMITTED GATE FAILED: ${emittedGaps.length} derivative URL(s) in ${SITE_DIR} are not on the CDN:\n` +
      emittedGaps.slice(0, 40).map((g) => `  ${g.url}\n    in ${g.page} (${g.reason})`).join('\n') +
      (emittedGaps.length > 40 ? `\n  …and ${emittedGaps.length - 40} more` : ''),
    );
  }

  if (sourceGaps.length > 0) {
    console.error(
      `[check-derivatives] SOURCE GATE FAILED: ${sourceGaps.length} source image(s) are missing derivatives:\n` +
      sourceGaps.slice(0, 40).map((g) => `  ${g.sourcePath} (${g.kind}) — missing @${g.missingVariants.join(', @')}`).join('\n') +
      (sourceGaps.length > 40 ? `\n  …and ${sourceGaps.length - 40} more` : ''),
    );
  }

  if (emittedGaps.length > 0 || sourceGaps.length > 0) {
    console.error(
      '\n[check-derivatives] Generate and upload the missing variants:\n' +
      '  node scripts/generate-derivatives.ts && node scripts/upload-derivatives.ts\n' +
      '  git add data/image-derivatives.csv\n' +
      'See docs/adr/0022-pregenerated-image-derivatives.md and _instructions/.',
    );
    process.exit(1);
  }

  const checkedUrls = new Set(pages.flatMap(({ html }) => extractDerivativeUrls(html))).size;
  console.log(
    `[check-derivatives] PASS: ${checkedUrls.toLocaleString('en-US')} emitted derivative URL(s) across ` +
    `${pages.length.toLocaleString('en-US')} page(s), and every variant of ` +
    `${scoped.length.toLocaleString('en-US')} source image(s) reachable from ` +
    `${buildable.size.toLocaleString('en-US')} buildable species, ` +
    `matched against ${known.size.toLocaleString('en-US')} manifest row(s)`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
