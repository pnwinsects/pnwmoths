/**
 * scripts/emit-cdn-inventory.ts
 *
 * Maintainer-run inventory of the Bunny Storage Zone: list everything in the
 * zone, join each object against the source of truth that should account for
 * it, and report what nothing accounts for (#277).
 *
 * The zone is the only place where this project's history accumulates. Deploys
 * are additive — no purge, no deletes (ADR 0008) — so every object ever
 * uploaded is still there, and until this script nothing in the repo could say
 * what that set was. Three cleanups in one afternoon (#268, #273, #275) each
 * ran aground on the same missing answer, and each was recovered by probing
 * URLs one at a time.
 *
 * ADVISORY, NEVER A GATE. It writes a report and exits 0 whatever it finds.
 * It needs the network, and the build is offline by construction, so it is not
 * part of `npm run build` (ADR 0036). It also never deletes: what to do about
 * an orphan is a curator's call, and the zone holds the photo originals.
 *
 * ACCOUNTING — each object is attributed to the artifact that explains it:
 *
 *   deploy-manifest  `_site-manifest.json`, the uploader's own bookkeeping
 *   site             a path in the CURRENT `_site-manifest.json`
 *   derivative       a `derived_path` in data/image-derivatives.csv
 *   photo            a `{species_slug}/{filename}` pair in data/images.csv
 *   retired-photo    an `old_path` in data/cdn-retired-images.csv (kept on purpose)
 *   glossary-image   an `image_filename` in data/glossary.csv
 *   key-image        an `image_filename` in data/key-character-images.csv
 *   tiles            a tile pyramid for an uploaded data/species-photos-manifest.csv row
 *   plate            a Zoomify tile tree for a `slug` in data/plates.json
 *   analytics        the `_analytics/` prefix scripts/upload-analytics.ts owns
 *   superseded-build a content-addressed bundle or search shard from an earlier deploy
 *   (nothing)        → the report, as an `orphan`-shaped finding
 *
 * The report carries the other direction too: a path the repo says is on the
 * CDN but that the listing did not find (`missing-*`). Every existing check
 * runs repo→zone over *derived* paths only, so a photo row whose file was
 * never uploaded stays invisible until a page renders it broken (#232).
 *
 * The site manifest is what makes the site half of this work at all: it lists
 * the paths of the CURRENT build, so a site-shaped object missing from it is by
 * definition left over from an earlier deploy — which is exactly #273's 33
 * still-live gated pages and #275's 171 orphan Parquet files. That is also why
 * a failed manifest fetch is fatal here: without it every site object reads as
 * unaccounted and the report would be worse than none.
 *
 * TILE PYRAMIDS ARE UNITS, NOT OBJECTS. The zone holds ~350,000 DZI tiles
 * across ~3,800 pyramids plus the Zoomify plates. Enumerating them would cost
 * ~40,000 directory listings to answer a question ("is there a pyramid here,
 * and does anything account for it") that one listing per pyramid answers.
 * `_files/` and `TileGroup*` directories are therefore recorded as single
 * units and not descended into. DEEP=1 descends everything, for the rare day
 * you suspect junk inside a pyramid.
 *
 * Usage:
 *   BUNNY_STORAGE_PASSWORD=... node scripts/emit-cdn-inventory.ts
 *   USE_CACHE=1 node scripts/emit-cdn-inventory.ts     # re-classify var/ listing, no network
 *   DEEP=1 BUNNY_STORAGE_PASSWORD=... node scripts/emit-cdn-inventory.ts
 *
 * BUNNY_STORAGE_PASSWORD: bunny.net → pnwmoths Storage Zone → FTP & API Access
 * → Password. Read-only use here. Never commit, log, or hardcode it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { createBunnyStorage } from './lib/bunny-storage.ts';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../src/_lib/withheld-families.ts';
import { loadUnpublishedSpecies, isUnpublished, normalizeSlug } from '../src/_lib/unpublished-species.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[emit-cdn-inventory]';

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const DATA_DIR: string = process.env['DATA_DIR'] ?? 'data';
const USE_CACHE: boolean = process.env['USE_CACHE'] === '1';
const DEEP: boolean = process.env['DEEP'] === '1';
const CONCURRENCY: number = Math.max(1, Number(process.env['LIST_CONCURRENCY'] ?? '12') || 12);
/**
 * Zone prefix to list, for trying something out against one directory.
 *
 * A partial listing makes every un-listed object look absent, so a run with a
 * PREFIX writes only the var/ artifacts and leaves the committed report alone.
 */
const PREFIX: string = process.env['PREFIX'] ?? '';

/** Reserved storage key for the site uploader's content-hash manifest (zone root). */
const SITE_MANIFEST_KEY = '_site-manifest.json';

/** Cached listing + site manifest, so classification can be re-run offline. */
const CACHE_LISTING = 'var/cdn-listing.csv';
const CACHE_SITE_MANIFEST = 'var/cdn-site-manifest.json';

/** Full per-unit accounting — every object, not just the unexplained ones. */
const FULL_PATH = 'var/cdn-inventory-full.csv';

/** The committed artifact: only what nothing accounts for. */
const REPORT_PATH = 'data/cdn-inventory-report.csv';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** What explains an object's presence in the zone. */
export type Accounting =
  | 'deploy-manifest'
  | 'site'
  | 'derivative'
  | 'photo'
  | 'retired-photo'
  | 'glossary-image'
  | 'key-image'
  | 'tiles'
  | 'plate'
  | 'analytics'
  | 'superseded-build'
  | 'unaccounted';

/**
 * One thing in the zone: an object, or a tile pyramid taken as a whole.
 *
 * `bytes` is null for a pyramid — its contents were deliberately not listed.
 */
export interface Unit {
  path: string;
  kind: 'object' | 'tile-pyramid';
  bytes: number | null;
}

/** Everything in the repo that can account for an object, pre-indexed. */
export interface Sources {
  /** Paths in the current `_site-manifest.json`. */
  site: ReadonlySet<string>;
  /** `derived_path` values from data/image-derivatives.csv. */
  derivatives: ReadonlySet<string>;
  /** `{species_slug}/{filename}` from data/images.csv. */
  photos: ReadonlySet<string>;
  /** `old_path` → `superseded_by`, from data/cdn-retired-images.csv. */
  retired: ReadonlyMap<string, string>;
  /** `glossary/{image_filename}` from data/glossary.csv. */
  glossaryImages: ReadonlySet<string>;
  /** `key-images/{image_filename}` from data/key-character-images.csv. */
  keyImages: ReadonlySet<string>;
  /** `species-tiles/{slug}/{specimen_id}-{view}` prefixes with tiles uploaded. */
  tilePairs: ReadonlySet<string>;
  /** `slug` values from data/plates.json. */
  plateSlugs: ReadonlySet<string>;
  /** Every slug in data/species.csv, published or not. */
  speciesSlugs: ReadonlySet<string>;
  /** Slugs in data/species.csv that get no page (withheld family or unpublished). */
  gatedSlugs: ReadonlySet<string>;
  /**
   * Top-level directories the current build owns, read off the site manifest.
   *
   * Derived rather than listed so it cannot drift: a new site directory is
   * recognised the first time a deploy puts something in it.
   */
  siteDirs: ReadonlySet<string>;
}

/** A row of the committed report: one thing nothing accounts for. */
export interface ReportRow {
  path: string;
  unit: Unit['kind'];
  bytes: string;
  species_slug: string;
  shape: string;
  detail: string;
}

/**
 * Top-level names that are never a species directory.
 *
 * Site directories are excluded by shape instead (`css`, `assets`, `about` —
 * a species slug always contains a hyphen), which leaves only the handful of
 * hyphenated non-species prefixes to name here.
 */
const RESERVED_PREFIXES = new Set(['derived', 'species', 'species-tiles', 'plates', 'glossary', 'key-images']);

/**
 * Prefix owned by the nightly analytics upload rather than by any data file.
 *
 * `scripts/upload-analytics.ts` writes it and the local copies are gitignored,
 * so the zone IS the store of record here; the accounting is the prefix itself.
 */
const ANALYTICS_PREFIX = '_analytics/';

/**
 * Build directories whose every object is content-addressed.
 *
 * Vite's hashed bundles and Pagefind's index shards are replaced wholesale on
 * every deploy, and the abandoned ones are unreachable except from the build
 * that named them. They are the bulk of the zone by object count and there is
 * nothing in them for a human to decide, so they are accounted for rather than
 * reported — separately from `site`, so the summary still shows the churn.
 */
const BUILD_ASSET_DIRS = new Set(['assets', 'pagefind']);

/**
 * `genus-species`, loosely.
 *
 * Spaces and stray dots are admitted on purpose: the zone holds folders like
 * `plataea-n sp` and `caripeta -divisata` that `normalizeSlug` would never
 * mint, and naming them as a species folder with no row beats filing them
 * under "unknown" — the slug claim is checked against species.csv either way.
 */
const SLUG_SHAPE = /^[a-z0-9]+(?:[-. ]+[a-z0-9.]+)+$/;

// ---------------------------------------------------------------------------
// Path shapes — pure, and the part most likely to be wrong
// ---------------------------------------------------------------------------

/**
 * True for a directory holding tile-pyramid internals rather than named files.
 *
 * Two conventions, one rule: vips DZI writes `{pair}_files/{level}/`, and the
 * Zoomify plates from the legacy application write `TileGroup{n}/`.
 */
export function isPyramidDir(dirKey: string): boolean {
  const name = dirKey.replace(/\/$/, '').split('/').pop() ?? '';
  return name.endsWith('_files') || /^TileGroup\d+$/.test(name);
}

/**
 * The `species-tiles/{slug}/{specimen_id}-{view}` prefix a tile path belongs
 * to, or null.
 *
 * One photo scatters into three sibling names — `{pair}.dzi`,
 * `{pair}_files/…` and `{pair}_thumbnail.webp` — so the pair is a filename
 * prefix, not a directory, and cannot be recovered by splitting on `/`.
 */
export function tilePairOf(path: string): string | null {
  if (!path.startsWith('species-tiles/')) return null;
  const segments = path.split('/');
  if (segments.length < 3 || !segments[2]) return null;
  const stem = segments[2].replace(/(?:_files|_thumbnail\.webp|\.dzi)$/, '');
  return stem ? `species-tiles/${segments[1]}/${stem}` : null;
}

/** The `plates.json` slug a plate object belongs to, or null. */
export function plateSlugOf(path: string): string | null {
  if (!path.startsWith('plates/')) return null;
  return path.split('/')[1] || null;
}

/**
 * The species slug a path implies, by structure alone, or null.
 *
 * Structure alone is the point: a slug read off a path is a *claim* about what
 * the object is for, which the caller then checks against data/species.csv.
 * Deriving it from the file's own name would be the mistake CLAUDE.md names.
 */
export function speciesSlugOf(path: string): string | null {
  if (path.startsWith('derived/')) return speciesSlugOf(path.slice('derived/'.length));
  const segments = path.split('/');
  const [first, second] = segments;
  if (!first) return null;
  if ((first === 'species' || first === 'species-tiles') && segments.length > 2) return second ?? null;
  if (RESERVED_PREFIXES.has(first)) return null;
  // A bare top-level directory: a species photo folder, if it is shaped like one.
  if (segments.length > 1 && SLUG_SHAPE.test(first)) return first;
  return null;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** What accounts for a unit, and — when nothing does — what it looks like. */
export function classify(unit: Unit, sources: Sources): { accounting: Accounting; shape: string; detail: string } {
  const path = unit.path;
  const bare = path.replace(/\/$/, '');

  if (path === SITE_MANIFEST_KEY) return { accounting: 'deploy-manifest', shape: '', detail: '' };
  if (sources.site.has(path)) return { accounting: 'site', shape: '', detail: '' };
  if (sources.derivatives.has(path)) return { accounting: 'derivative', shape: '', detail: '' };
  if (sources.photos.has(path)) return { accounting: 'photo', shape: '', detail: '' };

  const supersededBy = sources.retired.get(path);
  if (supersededBy !== undefined) {
    return { accounting: 'retired-photo', shape: '', detail: `superseded by ${supersededBy}` };
  }

  if (sources.glossaryImages.has(path)) return { accounting: 'glossary-image', shape: '', detail: '' };
  if (sources.keyImages.has(path)) return { accounting: 'key-image', shape: '', detail: '' };

  const pair = tilePairOf(bare);
  if (pair !== null && sources.tilePairs.has(pair)) return { accounting: 'tiles', shape: '', detail: '' };

  const plate = plateSlugOf(bare);
  if (plate !== null && sources.plateSlugs.has(plate)) return { accounting: 'plate', shape: '', detail: '' };

  if (path.startsWith(ANALYTICS_PREFIX)) {
    return { accounting: 'analytics', shape: '', detail: 'written by scripts/upload-analytics.ts' };
  }
  if (BUILD_ASSET_DIRS.has(bare.split('/')[0] ?? '')) {
    return { accounting: 'superseded-build', shape: '', detail: 'content-addressed; replaced by a later deploy' };
  }

  return { accounting: 'unaccounted', ...describe(unit, sources) };
}

/**
 * What an unexplained unit appears to be, and what a maintainer needs to know
 * before touching it.
 *
 * The shapes are named after the cleanups that needed them: a site path absent
 * from the current manifest is a previous deploy's leftover (#268, #273, #275);
 * a `{slug}/` folder with no row in images.csv is what a genus rename leaves
 * behind (#266); tiles and derivatives outlive the photo they came from.
 */
function describe(unit: Unit, sources: Sources): { shape: string; detail: string } {
  const path = unit.path;
  const bare = path.replace(/\/$/, '');
  const slug = speciesSlugOf(bare);
  const slugNote = slugDetail(slug, sources);

  if (tilePairOf(bare) !== null) {
    return { shape: 'tiles-no-photo', detail: join('no uploaded row in data/species-photos-manifest.csv', slugNote) };
  }
  if (path.startsWith('derived/')) {
    return { shape: 'derivative-no-source', detail: join('not in data/image-derivatives.csv', slugNote) };
  }
  if (path.startsWith('plates/') && bare.split('/').length > 2) {
    return { shape: 'plate-no-manifest', detail: 'plate slug is not in data/plates.json' };
  }
  if (/^plate-/.test(bare.split('/')[0] ?? '')) {
    return {
      shape: 'plate-at-zone-root',
      detail: 'templates read plates/{slug}/ — see _instructions/ADDING_PLATE.md',
    };
  }
  if (path.startsWith('glossary/')) {
    return { shape: 'glossary-no-row', detail: 'no row in data/glossary.csv names this image' };
  }
  if (path.startsWith('key-images/')) {
    return { shape: 'key-image-no-row', detail: 'no row in data/key-character-images.csv names this image' };
  }
  if (sources.siteDirs.has(bare.split('/')[0] ?? '') || looksLikeBuildOutput(bare)) {
    return { shape: 'stale-site', detail: join('not in the current _site-manifest.json', slugNote) };
  }
  if (slug !== null) {
    return { shape: 'photo-no-row', detail: join('no row in data/images.csv', slugNote) };
  }
  return { shape: 'unknown', detail: '' };
}

/** What data/species.csv says about a slug a path claims — the actionable half. */
function slugDetail(slug: string | null, sources: Sources): string {
  if (slug === null) return '';
  if (!sources.speciesSlugs.has(slug)) return `${slug} is not in data/species.csv`;
  if (sources.gatedSlugs.has(slug)) return `${slug} is gated and gets no page`;
  return `${slug} is published`;
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join('; ');
}

/**
 * Build output at a stable URL, recognised without the manifest.
 *
 * The manifest names the current build, so anything matching here that is not
 * in it is reachable at a URL the site no longer generates — a published page
 * or its occurrence data, still being served (#268, #273, #275).
 */
function looksLikeBuildOutput(path: string): boolean {
  return path.endsWith('.html') || path.endsWith('.parquet');
}

/** The committed report: every unaccounted unit, in a stable order. */
export function buildReport(units: readonly Unit[], sources: Sources): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const unit of units) {
    const { accounting, shape, detail } = classify(unit, sources);
    if (accounting !== 'unaccounted') continue;
    rows.push({
      path: unit.path,
      unit: unit.kind,
      bytes: unit.bytes === null ? '' : String(unit.bytes),
      species_slug: speciesSlugOf(unit.path.replace(/\/$/, '')) ?? '',
      shape,
      detail,
    });
  }
  return rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * What the repo says is on the CDN but is not.
 *
 * The inventory's other direction, and cheap once the listing exists: every
 * check in this repo runs repo→zone on *derived* paths only, so a photo row
 * whose file was never uploaded is invisible until a page renders it broken.
 * That is #232 — 83 such rows sat unnoticed because Geometridae is withheld
 * and no page reached them.
 *
 * Tiles are matched by pyramid prefix rather than by object: the listing stops
 * at `_files/`, so "the pyramid exists" is the strongest claim available and
 * the right one — a half-uploaded pyramid is upload-tiles.ts's problem.
 */
export function findMissing(units: readonly Unit[], sources: Sources): ReportRow[] {
  const present = new Set(units.map((u) => u.path.replace(/\/$/, '')));
  const tilePairsPresent = new Set<string>();
  for (const path of present) {
    const pair = tilePairOf(path);
    if (pair !== null) tilePairsPresent.add(pair);
  }

  const rows: ReportRow[] = [];
  const absent = (path: string, shape: string, detail: string): void => {
    rows.push({ path, unit: 'object', bytes: '', species_slug: speciesSlugOf(path) ?? '', shape, detail });
  };

  for (const path of sources.photos) {
    if (!present.has(path)) absent(path, 'missing-photo', 'a row in data/images.csv with no object in the zone');
  }
  for (const path of sources.derivatives) {
    if (!present.has(path)) {
      absent(path, 'missing-derivative', 'data/image-derivatives.csv records an upload that is not there');
    }
  }
  for (const path of sources.glossaryImages) {
    if (!present.has(path)) absent(path, 'missing-glossary-image', 'named by data/glossary.csv');
  }
  for (const path of sources.keyImages) {
    if (!present.has(path)) absent(path, 'missing-key-image', 'named by data/key-character-images.csv');
  }
  for (const pair of sources.tilePairs) {
    if (!tilePairsPresent.has(pair)) {
      absent(pair, 'missing-tiles', 'data/species-photos-manifest.csv says uploaded; no pyramid in the zone');
    }
  }
  return rows;
}

/** Units and bytes per accounting category, for the run summary. */
export function summarize(units: readonly Unit[], sources: Sources): Map<Accounting, { units: number; bytes: number }> {
  const totals = new Map<Accounting, { units: number; bytes: number }>();
  for (const unit of units) {
    const { accounting } = classify(unit, sources);
    const entry = totals.get(accounting) ?? { units: 0, bytes: 0 };
    entry.units += 1;
    entry.bytes += unit.bytes ?? 0;
    totals.set(accounting, entry);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Loading the sources of truth
// ---------------------------------------------------------------------------

function readCsv<T>(path: string): T[] {
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true, bom: true }) as T[];
}

export function loadSources(dataDir: string, siteManifestPaths: ReadonlySet<string>): Sources {
  const images = readCsv<{ species_slug: string; filename: string }>(resolve(dataDir, 'images.csv'));
  const derivatives = readCsv<{ derived_path: string }>(resolve(dataDir, 'image-derivatives.csv'));
  const retiredRows = readCsv<{ old_path: string; superseded_by: string }>(resolve(dataDir, 'cdn-retired-images.csv'));
  const glossary = readCsv<{ image_filename?: string }>(resolve(dataDir, 'glossary.csv'));
  const keyImages = readCsv<{ image_filename?: string }>(resolve(dataDir, 'key-character-images.csv'));
  const photoManifest = readCsv<{ species_slug: string; specimen_id: string; view: string; status: string }>(
    resolve(dataDir, 'species-photos-manifest.csv'),
  );
  const plates = JSON.parse(readFileSync(resolve(dataDir, 'plates.json'), 'utf8')) as Array<{ slug?: string }>;
  const species = readCsv<{ genus: string; species: string; family: string | null }>(resolve(dataDir, 'species.csv'));

  const withheld = loadWithheldFamilies();
  const unpublished = loadUnpublishedSpecies();
  const speciesSlugs = new Set<string>();
  const gatedSlugs = new Set<string>();
  for (const row of species) {
    const slug = normalizeSlug(`${row.genus}-${row.species}`);
    speciesSlugs.add(slug);
    if (isWithheldOrUnclassified(row.family, withheld) || isUnpublished(slug, unpublished)) gatedSlugs.add(slug);
  }

  const siteDirs = new Set<string>();
  for (const path of siteManifestPaths) {
    const [first] = path.split('/');
    if (first && path.includes('/')) siteDirs.add(first);
  }

  return {
    site: siteManifestPaths,
    siteDirs,
    derivatives: new Set(derivatives.map((r) => r.derived_path)),
    photos: new Set(images.filter((r) => r.species_slug && r.filename).map((r) => `${r.species_slug}/${r.filename}`)),
    retired: new Map(retiredRows.filter((r) => r.old_path).map((r) => [r.old_path, r.superseded_by ?? ''])),
    glossaryImages: new Set(glossary.filter((r) => r.image_filename).map((r) => `glossary/${r.image_filename}`)),
    keyImages: new Set(keyImages.filter((r) => r.image_filename).map((r) => `key-images/${r.image_filename}`)),
    // Only rows whose tiles actually reached the zone: a `tiled` row's pyramid
    // is on the workstation, and a pyramid here for one is worth reporting.
    tilePairs: new Set(
      photoManifest
        .filter((r) => r.status === 'uploaded' && r.species_slug)
        .map((r) => `species-tiles/${r.species_slug}/${r.specimen_id}-${r.view}`),
    ),
    plateSlugs: new Set(plates.map((p) => p.slug).filter((s): s is string => Boolean(s))),
    speciesSlugs,
    gatedSlugs,
  };
}

// ---------------------------------------------------------------------------
// Listing the zone (and caching it, because it is the expensive half)
// ---------------------------------------------------------------------------

interface CachedListing {
  units: Unit[];
  siteManifest: Record<string, string>;
}

function writeCache(units: readonly Unit[], siteManifest: Record<string, string>): void {
  mkdirSync(resolve(ROOT, 'var'), { recursive: true });
  writeFileSync(
    resolve(ROOT, CACHE_LISTING),
    stringify(
      [...units].sort((a, b) => (a.path < b.path ? -1 : 1)).map((u) => ({
        path: u.path,
        unit: u.kind,
        bytes: u.bytes === null ? '' : String(u.bytes),
      })),
      { header: true, columns: ['path', 'unit', 'bytes'] },
    ),
  );
  writeFileSync(resolve(ROOT, CACHE_SITE_MANIFEST), JSON.stringify(siteManifest));
}

function readCache(): CachedListing {
  const rows = readCsv<{ path: string; unit: string; bytes: string }>(resolve(ROOT, CACHE_LISTING));
  return {
    units: rows.map((r) => ({
      path: r.path,
      kind: r.unit === 'tile-pyramid' ? 'tile-pyramid' : 'object',
      bytes: r.bytes === '' ? null : Number(r.bytes),
    })),
    siteManifest: JSON.parse(readFileSync(resolve(ROOT, CACHE_SITE_MANIFEST), 'utf8')) as Record<string, string>,
  };
}

async function listZone(): Promise<CachedListing> {
  const storage = createBunnyStorage({
    host: BUNNY_STORAGE_HOST,
    zone: BUNNY_ZONE,
    password: BUNNY_STORAGE_PASSWORD,
    tag: TAG,
  });

  // Fatal on failure, deliberately: without the site manifest every site object
  // reads as unaccounted, and the report would be a wall of false orphans.
  const res = await storage.withRetry(
    () =>
      fetch(storage.storageUrl(SITE_MANIFEST_KEY), {
        headers: { AccessKey: BUNNY_STORAGE_PASSWORD },
        signal: AbortSignal.timeout(60_000),
      }),
    `fetch ${SITE_MANIFEST_KEY}`,
  );
  if (!res.ok) {
    throw new Error(
      `${SITE_MANIFEST_KEY}: ${res.status} ${res.statusText} — the site half of the inventory cannot be trusted without it`,
    );
  }
  const siteManifest = (await res.json()) as Record<string, string>;

  console.log(`${TAG} site manifest: ${Object.keys(siteManifest).length} paths in the current deploy`);
  console.log(`${TAG} listing the zone (concurrency ${CONCURRENCY}${DEEP ? ', DEEP — descending into tile pyramids' : ''})…`);

  const { files, pruned } = await storage.survey(PREFIX, {
    concurrency: CONCURRENCY,
    descend: (dir) => DEEP || !isPyramidDir(dir),
  });

  const units: Unit[] = [
    ...[...files].map(([path, bytes]): Unit => ({ path, kind: 'object', bytes })),
    ...pruned.map((path): Unit => ({ path, kind: 'tile-pyramid', bytes: null })),
  ];
  return { units, siteManifest };
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: Accounting[] = [
  'site', 'superseded-build', 'deploy-manifest', 'photo', 'derivative', 'tiles', 'plate',
  'glossary-image', 'key-image', 'retired-photo', 'analytics', 'unaccounted',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  if (!USE_CACHE && !BUNNY_STORAGE_PASSWORD) {
    console.error(`${TAG} BUNNY_STORAGE_PASSWORD is required (bunny.net → pnwmoths zone → FTP & API Access → Password).`);
    console.error(`${TAG} Or re-classify the last listing offline with USE_CACHE=1.`);
    process.exit(1);
  }
  if (USE_CACHE && !existsSync(resolve(ROOT, CACHE_LISTING))) {
    console.error(`${TAG} USE_CACHE=1 but ${CACHE_LISTING} does not exist — run once with the zone password first.`);
    process.exit(1);
  }

  const { units, siteManifest } = USE_CACHE ? readCache() : await listZone();
  if (!USE_CACHE && !PREFIX) writeCache(units, siteManifest);

  const sources = loadSources(resolve(ROOT, DATA_DIR), new Set(Object.keys(siteManifest)));
  const totals = summarize(units, sources);
  const orphans = buildReport(units, sources);
  const missing = findMissing(units, sources);
  const report = [...orphans, ...missing].sort((a, b) =>
    a.shape === b.shape ? (a.path < b.path ? -1 : 1) : a.shape < b.shape ? -1 : 1,
  );

  // The full accounting stays in var/: it is ~30 MB and changes on every
  // deploy, so committing it would bury the report's signal in churn (ADR 0017).
  mkdirSync(resolve(ROOT, 'var'), { recursive: true });
  writeFileSync(
    resolve(ROOT, FULL_PATH),
    stringify(
      [...units]
        .map((u) => ({ ...u, ...classify(u, sources) }))
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((u) => ({
          path: u.path,
          unit: u.kind,
          bytes: u.bytes === null ? '' : String(u.bytes),
          accounted_by: u.accounting,
          detail: u.detail,
        })),
      { header: true, columns: ['path', 'unit', 'bytes', 'accounted_by', 'detail'] },
    ),
  );

  if (PREFIX) {
    console.log(`${TAG} PREFIX=${PREFIX} — partial listing, so ${REPORT_PATH} is left untouched.`);
  } else {
    writeFileSync(
      resolve(ROOT, REPORT_PATH),
      stringify(report, {
        header: true,
        columns: ['path', 'unit', 'bytes', 'species_slug', 'shape', 'detail'],
      }),
    );
  }

  console.log(`${TAG} ${units.length} units in the zone:`);
  for (const category of CATEGORY_ORDER) {
    const entry = totals.get(category);
    if (!entry) continue;
    console.log(`${TAG}   ${category.padEnd(16)} ${String(entry.units).padStart(7)}  ${formatBytes(entry.bytes)}`);
  }

  const byShape = new Map<string, number>();
  for (const row of report) byShape.set(row.shape, (byShape.get(row.shape) ?? 0) + 1);
  console.log(`${TAG} ${report.length} finding(s) — ${orphans.length} unaccounted for, ${missing.length} expected and absent:`);
  for (const [shape, count] of [...byShape].sort((a, b) => b[1] - a[1])) {
    console.log(`${TAG}   ${shape.padEnd(24)} ${String(count).padStart(7)}`);
  }

  console.log(
    PREFIX
      ? `${TAG} wrote ${FULL_PATH} (${orphans.length} unaccounted under ${PREFIX}).`
      : `${TAG} wrote ${REPORT_PATH} (${report.length} findings) and ${FULL_PATH} (full accounting).`,
  );
  console.log(`${TAG} Advisory only — nothing here deletes anything. Review before acting (ADR 0008).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
