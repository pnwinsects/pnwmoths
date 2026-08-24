// scripts/emit-hidden-images.ts
// Advisory report: every data/images.csv row the SPECIES ACCOUNT does not display, why,
// and whether it still appears anywhere else on the site (#299).
//
// Requested by the curator, who asked for "a full list of the images that are not
// being displayed because of synonymies, such as with coturnix" so he can decide
// which, if any, should be shown. Nothing here proposes a change: this report is
// read, never acted on by the build, and it can never fail one.
//
// THE ACCOUNT IS NOT THE ONLY PLACE A PHOTOGRAPH APPEARS, and an earlier draft of this
// report assumed it was. Three other surfaces read data/images.csv directly and never
// consult tile status, each taking ONE row per species as a thumbnail:
//
//   browse    src/_data/taxon.ts       first non-ventral row by weight — and its own
//                                      comment says "images.csv rows always win when
//                                      both exist"; tiles are only a fallback
//   identify  scripts/build-key.ts     first row by (navigational, weight)
//   similar   src/species/species.njk  first row by weight, rendered on OTHER species'
//                                      pages that name this one in similar_species
//
// So `cause` answers "why is this not on the species account", and `displayed_as`
// answers "where is it still shown". Seven of the 39 rows this report was built to
// surface are browse or Identify thumbnails today; calling them invisible would have
// sent the curator to rule on photographs he can already see. `displayed_as` is read
// from the BUILT site rather than predicted — see scanBuiltSite() for why a hand model
// of these three consumers is not good enough.
//
// FOUR REASONS THE SPECIES ACCOUNT DOES NOT DISPLAY A PHOTOGRAPH. Checked in this
// order, because the first that applies is the proximate one — a row on a species
// with no page is not "hidden by tiles" in any useful sense, even when tiles exist:
//
//   1. family-withheld       the family is embargoed (#48) — no page is built
//   2. species-unpublished   the slug is on the deny-list (#84) — no page is built
//   3. *-by-tiles            the account exists, but src/species/species.njk shows the
//                            high-res branch INSTEAD OF, not alongside, images.csv:
//                              {% if (not high_res_available) and spImages %} … legacy …
//                              {% elif high_res_available %}                  … tiles  …
//                            so one tiled specimen hides every images.csv row for the
//                            species. Split three ways by what the tiles actually cover
//                            (see classifyTileOutcome) — the split is the whole point.
//   4. cdn-missing           the account renders an <img> whose object is not on the CDN
//                            (#232). A broken image displays nothing, so it belongs here.
//
// WHY THE TILE SPLIT MATTERS. At the time of writing: 3,440 rows on tiled species are
// the SAME specimen and view as a published tile — the photograph is still shown, in a
// better version — against 32 that no tile covers and 7 that cannot be matched at all.
// Of those 39, seven are still browse or Identify thumbnails, so 32 photographs appear
// nowhere on the site at all. That last number is the report. Listing all 3,479 as
// "hidden" would bury them under ninety times their number, which is how a report
// becomes unread. `superseded-by-tiles` is emitted anyway, sorted last, because a report
// that silently drops 88% of its subject is not a report of what is hidden — it is an
// opinion about what matters, and the person reading it has no way to check it.
//
// `cdn_status` COMES FROM A REPORT, NOT FROM THE NETWORK. This script is offline; its
// only evidence about the CDN is data/cdn-inventory-report.csv, which a maintainer
// regenerates by hand (`npm run cdn:inventory`). That report lists findings, not
// everything it examined, so there is no honest 'present' value: 'missing' where it
// says so, 'not-reported-missing' where it does not, 'unknown' when it is absent.
// This is the column that tells the curator whether there is anything to look at, so
// overstating it would be the worst kind of wrong here.
//
// REQUIRES A BUILT `_site/`, because `displayed_as` is read from it. Run
// `npm run build:site` first; the script exits non-zero with that instruction otherwise.
//
// Run via: npm run report:hidden-images  (writes data/hidden-images-report.csv)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { pathToFileURL } from 'node:url';
import { normalizeSlug, loadUnpublishedSpecies } from '../src/_lib/unpublished-species.ts';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../src/_lib/withheld-families.ts';
import { encodePath } from '../src/_lib/derivative-url.ts';

/** Public origin, same constant as eleventy.config.ts. Not a secret, not an env var. */
const CDN_BASE_URL = 'https://moths.pnwinsects.org';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type HiddenCause =
  | 'hidden-by-tiles'
  | 'unmatchable-by-tiles'
  | 'family-withheld'
  | 'species-unpublished'
  | 'cdn-missing'
  | 'superseded-by-tiles';

/**
 * Sort order: most likely to need a ruling first, least last. `superseded-by-tiles`
 * is deliberately at the bottom — it is the bulk of the file and the least of it.
 */
export const CAUSE_SEVERITY: Record<HiddenCause, number> = {
  'hidden-by-tiles': 0,
  'unmatchable-by-tiles': 1,
  'family-withheld': 2,
  'species-unpublished': 3,
  'cdn-missing': 4,
  'superseded-by-tiles': 5,
};

/**
 * What the last CDN inventory establishes about one object — and no more.
 *
 * There is no 'present' value on purpose. The inventory lists FINDINGS, not everything
 * it examined, so absence from it cannot distinguish "looked and found" from "this row
 * is newer than the inventory". `not-reported-missing` says exactly that much.
 */
export type CdnStatus = 'missing' | 'not-reported-missing' | 'unknown';

// ---------------------------------------------------------------------------
// Pure classification — no I/O, unit-testable
// ---------------------------------------------------------------------------

/** The images.csv fields this report reads. */
export interface ImageInput {
  species_slug: string;
  filename: string;
  specimen: string;
  view: string;
}

/** The species.csv fields this report reads. */
export interface SpeciesInput {
  genus: string;
  species: string;
  common_name: string;
  family: string;
}

/** One tiled specimen from data/species-photos.json. */
export interface TileSpecimen {
  specimen_id: string;
  view: string;
}

export interface HiddenImageRow {
  species_slug: string;
  filename: string;
  specimen: string;
  view: string;
  cause: HiddenCause;
  detail: string;
  cdn_status: CdnStatus;
  /**
   * Surfaces of the BUILT site that still show this photograph, space-separated, or ''
   * when it appears nowhere at all. A non-empty value means the photograph IS visible —
   * just not on its own account — so it is a milder question for the curator.
   */
  displayed_as: string;
  /** '1' when the filename opens with a different binomial — the synonymy tell. */
  filename_name_differs: string;
  family: string;
  common_name: string;
  /** Direct link to the photograph on the CDN. Always resolvable; needs no login. */
  image_url: string;
  /** Link to the species account, or '' when no page is built for it. */
  species_page_url: string;
}

/**
 * images.csv spells views `dorsal`/`ventral`; species-photos.json spells them `D`/`V`.
 * Two vocabularies for one concept, so a comparison that forgets to normalise finds
 * ZERO matches and reports every row on every tiled species as hidden — which reads
 * entirely plausibly at 3,711 rows. Returns '' when there is nothing to compare.
 */
export function normalizeView(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === 'dorsal' || v === 'd') return 'D';
  if (v === 'ventral' || v === 'v') return 'V';
  return '';
}

/** Tile coverage key for one specimen+view, or null when the row cannot be keyed. */
export function coverageKey(specimen: string, view: string): string | null {
  const s = specimen.trim().toUpperCase();
  const v = normalizeView(view);
  return s && v ? `${s}|${v}` : null;
}

/** The keys a species' published tiles cover. */
export function tileCoverage(specimens: readonly TileSpecimen[]): Set<string> {
  const keys = new Set<string>();
  for (const specimen of specimens) {
    const key = coverageKey(specimen.specimen_id, specimen.view);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Which of the three tile outcomes applies to one row on a tiled species.
 *
 * `unmatchable-by-tiles` is its own outcome rather than being folded into
 * `hidden-by-tiles`: a row with no specimen or no view cannot be compared against the
 * tiles at all, so calling it uncovered would assert something unmeasured. The curator
 * is being asked a different question about those — "what is this photograph of?"
 */
export function classifyTileOutcome(row: ImageInput, coverage: ReadonlySet<string>): HiddenCause {
  const key = coverageKey(row.specimen, row.view);
  if (key === null) return 'unmatchable-by-tiles';
  return coverage.has(key) ? 'superseded-by-tiles' : 'hidden-by-tiles';
}

/**
 * Whether a filename opens with a binomial other than the species it is filed under.
 *
 * This is the coturnix tell, and it is the reason the curator asked for the report:
 * `phyllodesma-americana` holds `Phyllodesma coturnix-C-D.jpg`, and
 * `lacinipolia-sareta` holds `Lacinipolia vicina-B-D.jpg`. Comparing only the GENUS
 * would miss both — the genus matches in each and the epithet does not.
 *
 * Implemented as a prefix test rather than by parsing the name out of the filename.
 * There is no suffix grammar worth trusting: specimen and view are separated by a
 * hyphen in `Grammia margo-C-D.jpg` and by a space in `Euxoa absona A-D.jpg`, and
 * epithets contain hyphens of their own (`Xestia c-nigrum-A-v.jpg`) and, for
 * provisional names, spaces. Asking "does this filename start with the name we filed
 * it under" needs none of that and cannot be fooled by it.
 *
 * Display hint ONLY. Slugs are NEVER derived from image filenames (CLAUDE.md); nothing
 * here joins on the result, and a flagged row is a question, not a finding.
 */
export function filenameNameDiffers(filename: string, genus: string, species: string): boolean {
  const expected = `${genus.trim()} ${species.trim()}`.trim().toLowerCase();
  if (!expected || !filename.trim()) return false;
  return !filename.trim().toLowerCase().startsWith(expected);
}

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
export function scanBuiltSite(
  files: readonly { path: string; content: string }[],
  images: readonly { slug: string; filename: string }[],
): ThumbnailUse {
  const bySlugFilename = new Map<string, string[]>();
  for (const image of images) {
    const bucket = bySlugFilename.get(image.filename);
    if (bucket) bucket.push(image.slug);
    else bySlugFilename.set(image.filename, [image.slug]);
  }

  const use: ThumbnailUse = new Map();
  for (const file of files) {
    const referenced = extractImageReferences(file.content);
    for (const filename of referenced) {
      const slugs = bySlugFilename.get(filename);
      if (!slugs) continue;
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
  return use;
}

/** Stable rendering of the surfaces a row appears on, for the CSV cell. */
export function formatSurfaces(surfaces: ReadonlySet<ThumbnailSurface> | undefined): string {
  if (!surfaces || surfaces.size === 0) return '';
  const order: ThumbnailSurface[] = ['browse', 'identify', 'similar', 'other'];
  return order.filter((s) => surfaces.has(s)).join(' ');
}

export interface BuildHiddenImageRowsOptions {
  images: readonly ImageInput[];
  /** Normalized slug -> species.csv row. */
  species: ReadonlyMap<string, SpeciesInput>;
  /** Normalized slug -> published tile specimens, for species with high_res_available. */
  tiled: ReadonlyMap<string, readonly TileSpecimen[]>;
  /**
   * Withheld family names, LOWERCASED — exactly what loadWithheldFamilies() returns.
   * isWithheld() lowercases the family it is given but not the set, so a set built by
   * hand with `Geometridae` in it matches nothing and this report silently under-counts.
   * That is the fail-open direction, which is why it is spelled out here.
   */
  withheldFamilies: ReadonlySet<string>;
  /** Deny-listed slugs, already normalized — what loadUnpublishedSpecies() returns. */
  unpublished: ReadonlySet<string>;
  /** `slug/filename` paths the CDN inventory reports as missing, or null when unavailable. */
  missingOnCdn: ReadonlySet<string> | null;
  /** Where each photograph is still shown outside its account, from computeThumbnailUse(). */
  thumbnailUse: ThumbnailUse;
  cdnBaseUrl?: string;
}

/**
 * One row per catalogued photograph that reaches no page, worst-first.
 *
 * A row that IS displayed produces no output — the absence of a row is the statement
 * that the photograph is visible.
 */
export function buildHiddenImageRows(options: BuildHiddenImageRowsOptions): HiddenImageRow[] {
  const { images, species, tiled, withheldFamilies, unpublished, missingOnCdn, thumbnailUse } = options;
  const cdnBaseUrl = options.cdnBaseUrl ?? CDN_BASE_URL;
  const rows: HiddenImageRow[] = [];

  for (const image of images) {
    const slug = normalizeSlug(image.species_slug);
    const speciesRow = species.get(slug);
    // A slug that joins to nothing is not this report's business: the referential
    // integrity gate fails the build on it before any of this runs (ADR 0033).
    if (!speciesRow) continue;

    const objectPath = `${image.species_slug}/${image.filename}`;
    const cdnStatus: CdnStatus = missingOnCdn === null
      ? 'unknown'
      : missingOnCdn.has(objectPath) ? 'missing' : 'not-reported-missing';

    const gated = isWithheldOrUnclassified(speciesRow.family, withheldFamilies);
    const denied = unpublished.has(slug);
    const coverage = tiled.get(slug);

    let cause: HiddenCause | null = null;
    let detail = '';
    if (gated) {
      cause = 'family-withheld';
      detail = speciesRow.family.trim()
        ? `${speciesRow.family.trim()} is withheld; no species page is built`
        : 'species has no family; no species page is built';
    } else if (denied) {
      cause = 'species-unpublished';
      detail = 'slug is on the unpublished deny-list; no species page is built';
    } else if (coverage) {
      const keys = tileCoverage(coverage);
      cause = classifyTileOutcome(image, keys);
      detail = cause === 'superseded-by-tiles'
        ? 'the same specimen and view is published as a high-resolution tile'
        : cause === 'hidden-by-tiles'
          ? `no tile covers specimen ${image.specimen.trim() || '?'} ${normalizeView(image.view) || '?'};` +
            ` tiled: ${[...keys].sort().map((k) => k.replace('|', '-')).join(' ') || 'none'}`
          : 'row has no specimen or no view, so it cannot be matched against the tiles';
    } else if (cdnStatus === 'missing') {
      cause = 'cdn-missing';
      detail = 'the page links this object, but the last CDN inventory did not find it';
    }

    if (cause === null) continue; // displayed — nothing to report

    const pageBuilt = !gated && !denied;
    rows.push({
      species_slug: slug,
      filename: image.filename,
      specimen: image.specimen.trim(),
      view: image.view.trim(),
      cause,
      detail,
      cdn_status: cdnStatus,
      filename_name_differs:
        filenameNameDiffers(image.filename, speciesRow.genus, speciesRow.species) ? '1' : '',
      displayed_as: formatSurfaces(thumbnailUse.get(thumbnailKey(slug, image.filename))),
      family: speciesRow.family.trim(),
      common_name: speciesRow.common_name.trim(),
      image_url: `${cdnBaseUrl}/${encodePath(objectPath)}`,
      species_page_url: pageBuilt ? `${cdnBaseUrl}/species/${slug}/` : '',
    });
  }

  rows.sort((a, b) => {
    const bySeverity = CAUSE_SEVERITY[a.cause] - CAUSE_SEVERITY[b.cause];
    if (bySeverity !== 0) return bySeverity;
    // Within a cause, a photograph shown NOWHERE outranks one still on a thumbnail:
    // the second is visible, just not on its own account, and is a milder question.
    const byVisibility = (a.displayed_as ? 1 : 0) - (b.displayed_as ? 1 : 0);
    if (byVisibility !== 0) return byVisibility;
    if (a.species_slug !== b.species_slug) return a.species_slug < b.species_slug ? -1 : 1;
    return a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0;
  });
  return rows;
}

export const HIDDEN_IMAGE_COLUMNS = [
  'species_slug',
  'filename',
  'specimen',
  'view',
  'cause',
  'detail',
  'cdn_status',
  'displayed_as',
  'filename_name_differs',
  'family',
  'common_name',
  'image_url',
  'species_page_url',
] as const;

/** RFC-4180 CSV. Filenames carry spaces and commas; details carry semicolons. */
export function toCsv(rows: readonly HiddenImageRow[]): string {
  const escape = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [HIDDEN_IMAGE_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(HIDDEN_IMAGE_COLUMNS.map((column) => escape(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Per-cause counts, split by whether the photograph is still shown somewhere. */
export function summarize(
  rows: readonly HiddenImageRow[],
): Record<string, { total: number; nowhere: number }> {
  const counts: Record<string, { total: number; nowhere: number }> = {};
  for (const row of rows) {
    const entry = counts[row.cause] ?? { total: 0, nowhere: 0 };
    entry.total += 1;
    if (!row.displayed_as) entry.nowhere += 1;
    counts[row.cause] = entry;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, '..');

function readCsv(path: string): Record<string, string>[] {
  return parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, bom: true });
}

/**
 * Built files that can reference an image: every page, plus the key matrix Identify
 * ships. Parquet, CSVs and binaries are skipped — they cannot display anything, and the
 * report's own CSV sitting in _site/curation/ would otherwise match every row in itself.
 */
function readSiteFiles(siteDir: string): { path: string; content: string }[] {
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

/**
 * `slug/filename` paths the CDN inventory reports absent, or null when the report is
 * not on disk. null is NOT an empty set: an absent report is no evidence either way,
 * and an empty set would silently assert every object is present.
 */
export function loadMissingOnCdn(path: string): Set<string> | null {
  if (!existsSync(path)) return null;
  const missing = new Set<string>();
  for (const row of readCsv(path)) {
    if ((row['shape'] ?? '') === 'missing-photo') missing.add(row['path'] ?? '');
  }
  return missing;
}

function main(): void {
  const species = new Map<string, SpeciesInput>();
  for (const row of readCsv(resolve(ROOT, 'data/species.csv'))) {
    const slug = normalizeSlug(`${row['genus'] ?? ''}-${row['species'] ?? ''}`);
    species.set(slug, {
      genus: row['genus'] ?? '',
      species: row['species'] ?? '',
      common_name: row['common_name'] ?? '',
      family: row['family'] ?? '',
    });
  }

  const photos: Record<string, { high_res_available?: boolean; specimens?: TileSpecimen[] }> =
    JSON.parse(readFileSync(resolve(ROOT, 'data/species-photos.json'), 'utf8'));
  const tiled = new Map<string, readonly TileSpecimen[]>();
  for (const [slug, entry] of Object.entries(photos)) {
    if (entry.high_res_available && entry.specimens?.length) {
      tiled.set(normalizeSlug(slug), entry.specimens);
    }
  }

  const images: ImageInput[] = readCsv(resolve(ROOT, 'data/images.csv')).map((row) => ({
    species_slug: row['species_slug'] ?? '',
    filename: row['filename'] ?? '',
    specimen: row['specimen'] ?? '',
    view: row['view'] ?? '',
  }));

  const withheldFamilies = loadWithheldFamilies(resolve(ROOT, 'data/withheld-families.csv'));
  const unpublished = loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv'));

  // `displayed_as` is read from the BUILT site, so a build is required. Predicting it
  // from data/ is what the earlier version did, and it was wrong — see scanBuiltSite().
  const siteDir = resolve(ROOT, process.env['SITE_DIR'] ?? '_site');
  if (!existsSync(siteDir)) {
    console.error(
      `[hidden-images] ERROR: ${siteDir} does not exist. This report reads the built site to ` +
        'find where each photograph is still shown. Run `npm run build:site` first.',
    );
    process.exit(1);
  }
  const thumbnailUse = scanBuiltSite(
    readSiteFiles(siteDir),
    images.map((row) => ({ slug: normalizeSlug(row.species_slug), filename: row.filename })),
  );

  const missingOnCdn = loadMissingOnCdn(resolve(ROOT, 'data/cdn-inventory-report.csv'));
  if (missingOnCdn === null) {
    console.warn(
      '[hidden-images] data/cdn-inventory-report.csv is absent — cdn_status is "unknown" for ' +
        'every ' +
        'row. Run `npm run cdn:inventory` for the CDN half of this report.',
    );
  }

  const rows = buildHiddenImageRows({
    images,
    species,
    tiled,
    withheldFamilies,
    unpublished,
    missingOnCdn,
    thumbnailUse,
  });

  const outPath = resolve(ROOT, 'data/hidden-images-report.csv');
  writeFileSync(outPath, toCsv(rows));

  const counts = summarize(rows);
  const nowhere = rows.filter((row) => !row.displayed_as).length;
  console.log(
    `[hidden-images] ${rows.length} of ${images.length} catalogued photographs are absent from ` +
      `their species account; ${nowhere} appear nowhere on the site at all`,
  );
  console.log(`  ${'cause'.padEnd(22)} ${'absent'.padStart(6)} ${'nowhere'.padStart(8)}`);
  for (const cause of Object.keys(CAUSE_SEVERITY) as HiddenCause[]) {
    const entry = counts[cause];
    if (entry) {
      console.log(`  ${cause.padEnd(22)} ${String(entry.total).padStart(6)} ${String(entry.nowhere).padStart(8)}`);
    }
  }
  console.log(`[hidden-images] wrote ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
