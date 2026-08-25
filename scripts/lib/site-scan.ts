// scripts/lib/site-scan.ts
//
// READING THE BUILT SITE — the verification half of the photo-display work (#338).
//
// This is not how the site decides what to show. src/_lib/photo-display.ts is, and
// src/_lib/photo-display-index.ts inverts it into "where does this photograph appear".
// What lives here reads the emitted bytes in `_site/` and answers the same question from
// evidence, so that scripts/check-display-index.ts can hold the model to account on every
// build.
//
// The report used to run this scan directly, because three successive hand models of the
// display rules were each wrong and the emitted HTML was the only thing that could be
// trusted (#299). That was the right call with no module to trust; it also meant a data
// report could not run without a completed build. Keeping the scan — as a CHECK on the
// model rather than a substitute for it — is what lets the report drop the build
// requirement without going back to trusting a hand model.
//
// It cannot replace the index in one respect worth stating: a scan sees a filename in a
// page, not the rule that put it there. It is evidence, not explanation.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Where a photograph still appears outside its own species account. */
export type ThumbnailSurface = 'browse' | 'identify' | 'similar' | 'other';

/** `${slug}\u0000${filename}` -> the surfaces that show it. */
export type ThumbnailUse = Map<string, Set<ThumbnailSurface>>;

export function thumbnailKey(slug: string, filename: string): string {
  return `${slug}\u0000${filename}`;
}

/**
 * Every image filename referenced by one built file, in either form it can take.
 *
 * Two forms, because two code paths produce them: the browse payload and the key
 * matrix carry the raw `Genus species-A-D.jpg`, while a rendered <img> carries the
 * percent-encoded derivative, `Genus%20species-A-D%40320h.webp`. Both normalise back
 * to the raw filename here.
 */
export function extractImageReferences(content: string): Set<string> {
  const found = new Set<string>();
  for (const match of content.matchAll(/[A-Za-z][A-Za-z0-9 ._'"()-]*\.jpg/g)) {
    found.add(match[0]);
  }
  for (const match of content.matchAll(/[A-Za-z][A-Za-z0-9%._'"()-]*%40[0-9a-zA-Z]+\.(?:webp|jpg)/g)) {
    const stem = match[0].slice(0, match[0].lastIndexOf('%40'));
    try {
      found.add(`${decodeURIComponent(stem)}.jpg`);
    } catch {
      // A stem that is not valid percent-encoding is not one of ours.
    }
  }
  return found;
}

/** Which surface a built page is, from its `_site`-relative path. */
export function surfaceOf(relativePath: string, slug: string): ThumbnailSurface | 'account' | null {
  if (relativePath.startsWith('browse/')) return 'browse';
  if (relativePath.startsWith('identify/') || relativePath === 'key-matrix.json') return 'identify';
  const species = /^species\/([^/]+)\//.exec(relativePath);
  if (species) return species[1] === slug ? 'account' : 'similar';
  return 'other';
}

/**
 * Where each catalogued photograph is actually referenced in the BUILT site.
 *
 * Read from `_site`, not predicted from `data/`. An earlier version of this report
 * modelled the three consumers by hand — reproducing their orderings from
 * src/_data/taxon.ts, scripts/build-key.ts and src/species/species.njk — and got browse
 * wrong: the genus strip takes up to FOUR images across a whole genus, so a species can
 * contribute a second photograph the model never predicted, and Identify has no card at
 * all for the 232 published species the Lucid key does not carry. Six photographs were
 * reported invisible while they were on `/browse/` and Identify.
 *
 * Any model of a consumer can drift from it; the emitted bytes cannot. This is the same
 * reasoning as ADR 0035 — the browser smoke gate exists because every other check reads
 * sources rather than what shipped.
 */
export interface SiteScan {
  /** Where each photograph is shown, excluding its own account. */
  use: ThumbnailUse;
  /**
   * Catalogued filenames referenced ANYWHERE in the scanned files, own account included.
   * Not used to classify anything — it is the sanity floor. A real build references
   * nearly the whole catalogue, so a near-empty set means the site handed to this script
   * is hollow or half-built, and every `displayed_as` would come back blank.
   */
  referenced: Set<string>;
}

export function scanBuiltSite(
  files: readonly { path: string; content: string }[],
  images: readonly { slug: string; filename: string }[],
): SiteScan {
  const bySlugFilename = new Map<string, string[]>();
  for (const image of images) {
    const bucket = bySlugFilename.get(image.filename);
    if (bucket) bucket.push(image.slug);
    else bySlugFilename.set(image.filename, [image.slug]);
  }

  const use: ThumbnailUse = new Map();
  const referenced = new Set<string>();
  for (const file of files) {
    for (const filename of extractImageReferences(file.content)) {
      const slugs = bySlugFilename.get(filename);
      if (!slugs) continue;
      referenced.add(filename);
      for (const slug of slugs) {
        const surface = surfaceOf(file.path, slug);
        if (surface === null || surface === 'account') continue;
        const key = thumbnailKey(slug, filename);
        const surfaces = use.get(key);
        if (surfaces) surfaces.add(surface);
        else use.set(key, new Set([surface]));
      }
    }
  }
  return { use, referenced };
}

/** Stable rendering of the surfaces a row appears on, for the CSV cell. */
export function formatSurfaces(surfaces: ReadonlySet<ThumbnailSurface> | undefined): string {
  if (!surfaces || surfaces.size === 0) return '';
  const order: ThumbnailSurface[] = ['browse', 'identify', 'similar', 'other'];
  return order.filter((s) => surfaces.has(s)).join(' ');
}

/**
 * Why the built site cannot be trusted to answer "where is this photograph shown", or
 * null when it can.
 *
 * Names the three surfaces scanBuiltSite() reads, plus a species-page count: a build that
 * stopped early has the layout but not the pages, and a page count below what the
 * visibility gates allow means this scan would miss similar-species thumbnails.
 */
export function describeIncompleteSite(siteDir: string, expectedSpeciesPages: number): string | null {
  for (const required of ['browse/index.html', 'identify/index.html', 'key-matrix.json']) {
    if (!existsSync(join(siteDir, required))) return `has no ${required}, so it is not a built site`;
  }
  const speciesDir = join(siteDir, 'species');
  const built = existsSync(speciesDir)
    ? readdirSync(speciesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(speciesDir, entry.name, 'index.html')))
        .length
    : 0;
  if (built < expectedSpeciesPages) {
    return `has ${built} species pages but the visibility gates allow ${expectedSpeciesPages}, ` +
      'so it is stale or half-built';
  }
  return null;
}

/**
 * The first input newer than the newest built page, or null when the site is current.
 *
 * Compared against `_site/index.html` rather than the directory: a directory's mtime
 * moves when anything inside it is touched, including this report being copied in.
 */
export function stalestInput(siteDir: string, inputs: readonly string[]): string | null {
  const marker = join(siteDir, 'index.html');
  if (!existsSync(marker)) return null; // the coverage floor already rejected non-sites
  const builtAt = statSync(marker).mtimeMs;
  for (const input of inputs) {
    if (existsSync(input) && statSync(input).mtimeMs > builtAt) return input;
  }
  return null;
}

/**
 * Built files that can reference an image: every page, plus the key matrix Identify
 * ships. Parquet, CSVs and binaries are skipped — they cannot display anything, and the
 * report's own CSV sitting in _site/curation/ would otherwise match every row in itself.
 */
export function readSiteFiles(siteDir: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'pagefind' || entry.name === 'curation') continue;
        walk(join(dir, entry.name), rel);
      } else if (entry.name.endsWith('.html') || rel === 'key-matrix.json') {
        files.push({ path: rel, content: readFileSync(join(dir, entry.name), 'utf8') });
      }
    }
  };
  walk(siteDir, '');
  return files;
}
