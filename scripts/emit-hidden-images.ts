// scripts/emit-hidden-images.ts
// Advisory report: every data/images.csv row that no page displays, and why (#299).
//
// Requested by the curator, who asked for "a full list of the images that are not
// being displayed because of synonymies, such as with coturnix" so he can decide
// which, if any, should be shown. Nothing here proposes a change: this report is
// read, never acted on by the build, and it can never fail one.
//
// FOUR REASONS A CATALOGUED PHOTOGRAPH REACHES NO PAGE. They are checked in this
// order, because the first that applies is the proximate one — a row on a species
// with no page is not "hidden by tiles" in any useful sense, even when tiles exist:
//
//   1. family-withheld       the family is embargoed (#48) — no page is built
//   2. species-unpublished   the slug is on the deny-list (#84) — no page is built
//   3. *-by-tiles            the page exists, but src/species/species.njk shows the
//                            high-res branch INSTEAD OF, not alongside, images.csv:
//                              {% if (not high_res_available) and spImages %} … legacy …
//                              {% elif high_res_available %}                  … tiles  …
//                            so one tiled specimen hides every images.csv row for the
//                            species. Split three ways by what the tiles actually cover
//                            (see classifyTileOutcome) — the split is the whole point.
//   4. cdn-missing           the page renders an <img> whose object is not on the CDN
//                            (#232). A broken image displays nothing, so it belongs here.
//
// WHY THE TILE SPLIT MATTERS. At the time of writing: 3,440 rows on tiled species are
// the SAME specimen and view as a published tile — the photograph is still shown, in a
// better version — against 32 that no tile covers and 7 that cannot be matched at all.
// Those 39 are the report. Listing all 3,479 as "hidden" would bury them under ninety
// times their number, which is how a report becomes unread. `superseded-by-tiles` is
// emitted anyway, sorted last, because a report that silently drops 88% of its subject
// is not a report of what is hidden — it is an opinion about what matters, and the
// person reading it has no way to check it.
//
// `cdn_status` COMES FROM A REPORT, NOT FROM THE NETWORK. This script is offline; its
// only evidence about the CDN is data/cdn-inventory-report.csv, which a maintainer
// regenerates by hand (`npm run cdn:inventory`). That report lists findings, not
// everything it examined, so there is no honest 'present' value: 'missing' where it
// says so, 'not-reported-missing' where it does not, 'unknown' when it is absent.
// This is the column that tells the curator whether there is anything to look at, so
// overstating it would be the worst kind of wrong here.
//
// Run via: npm run report:hidden-images  (writes data/hidden-images-report.csv)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
  cdnBaseUrl?: string;
}

/**
 * One row per catalogued photograph that reaches no page, worst-first.
 *
 * A row that IS displayed produces no output — the absence of a row is the statement
 * that the photograph is visible.
 */
export function buildHiddenImageRows(options: BuildHiddenImageRowsOptions): HiddenImageRow[] {
  const { images, species, tiled, withheldFamilies, unpublished, missingOnCdn } = options;
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
      family: speciesRow.family.trim(),
      common_name: speciesRow.common_name.trim(),
      image_url: `${cdnBaseUrl}/${encodePath(objectPath)}`,
      species_page_url: pageBuilt ? `${cdnBaseUrl}/species/${slug}/` : '',
    });
  }

  rows.sort((a, b) => {
    const bySeverity = CAUSE_SEVERITY[a.cause] - CAUSE_SEVERITY[b.cause];
    if (bySeverity !== 0) return bySeverity;
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

/** Per-cause counts, for the run summary. */
export function summarize(rows: readonly HiddenImageRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.cause] = (counts[row.cause] ?? 0) + 1;
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
    withheldFamilies: loadWithheldFamilies(resolve(ROOT, 'data/withheld-families.csv')),
    unpublished: loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv')),
    missingOnCdn,
  });

  const outPath = resolve(ROOT, 'data/hidden-images-report.csv');
  writeFileSync(outPath, toCsv(rows));

  const counts = summarize(rows);
  console.log(`[hidden-images] ${rows.length} of ${images.length} catalogued photographs reach no page`);
  for (const cause of Object.keys(CAUSE_SEVERITY) as HiddenCause[]) {
    if (counts[cause]) console.log(`  ${cause.padEnd(22)} ${counts[cause]}`);
  }
  console.log(`[hidden-images] wrote ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
