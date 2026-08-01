/**
 * scripts/lib/derivatives.ts
 *
 * The derivative naming convention and variant matrix from docs/adr/0022, plus
 * the pure work-list and vips-command construction used by
 * scripts/generate-derivatives.ts.
 *
 * This is shared rather than copied (contrast the self-contained-helpers
 * convention in ADR 0013) because the naming convention is exactly the thing
 * that must NOT drift: the generator writes these paths, the uploader ships
 * them, the templates request them, and the build guard checks them. Four
 * copies of `@320h.webp` is how a variant silently stops existing.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { derivativePath, type VariantToken } from '../../src/_lib/derivative-url.ts';

/** Source families, which determine the variant set. */
export type SourceKind = 'legacy' | 'highres' | 'glossary';

/**
 * Mutual exclusion on the shared derivatives manifest.
 *
 * generate-derivatives.ts and upload-derivatives.ts both load the whole manifest
 * into memory and rewrite it wholesale. Run concurrently, the last writer wins
 * and silently discards the other's status changes — which is exactly what
 * happened during the #224 pilot: 20 rows were uploaded to the CDN, and the
 * still-running generator's next write reset them all to `generated`.
 *
 * A stale lock (holder died) is taken over rather than blocking forever, since
 * these are long interruptible runs on one workstation.
 */
export function acquireManifestLock(lockPath: string, pid: number = process.pid): void {
  if (existsSync(lockPath)) {
    const holder = Number(readFileSync(lockPath, 'utf8').trim());
    if (holder && holder !== pid && isProcessAlive(holder)) {
      throw new Error(
        `Manifest is locked by pid ${holder} (${lockPath}). `
        + 'generate-derivatives.ts and upload-derivatives.ts must not run at the same time — '
        + 'they share var/derivatives-manifest.csv and the last writer would discard the other\'s work.',
      );
    }
  }
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, String(pid));
}

export function releaseManifestLock(lockPath: string): void {
  if (existsSync(lockPath)) unlinkSync(lockPath);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but belongs to another user — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** A single image transform, expressed independently of the tool that runs it. */
export type Transform =
  | { op: 'width'; width: number }
  | { op: 'height'; height: number }
  | { op: 'fit'; width: number; height: number }
  | { op: 'passthrough' };

export interface Variant {
  /** Token that appears after `@` in the derived path. */
  token: VariantToken;
  /** Output extension, without the dot. */
  ext: 'webp' | 'jpg';
  transform: Transform;
}

/** WebP quality for generated derivatives; matches tile-config.json's Q=80. */
export const WEBP_QUALITY = 80;
/** JPEG quality for the share-card derivative. */
export const JPEG_QUALITY = 82;

/**
 * The ADR 0022 variant matrix.
 *
 * A single `320h` thumbnail serves the 93px, 186px and 320px slots — traffic is
 * ~$0.11/month, so over-sending a few KB is free while halving the object count
 * is not. The 1500px hero slot is absent deliberately: it is the stored
 * `_thumbnail.webp` itself, so it needs no derivative.
 */
export const VARIANTS: Readonly<Record<SourceKind, readonly Variant[]>> = {
  legacy: [
    { token: '320h', ext: 'webp', transform: { op: 'height', height: 320 } },
    { token: 'full', ext: 'webp', transform: { op: 'passthrough' } },
  ],
  highres: [
    { token: '530', ext: 'webp', transform: { op: 'width', width: 530 } },
    { token: '1060', ext: 'webp', transform: { op: 'width', width: 1060 } },
    { token: '320h', ext: 'webp', transform: { op: 'height', height: 320 } },
    { token: '1200', ext: 'jpg', transform: { op: 'width', width: 1200 } },
  ],
  // `crop_gravity=north` in the glossary template is dead: on this pull zone
  // Bunny returns byte-identical output for gravity north, south and absent
  // (verified by MD5). With both dimensions given it fits within the box and
  // never upscales — plain `contain`, no cropping. Reproducing a crop here would
  // diverge from the live site the first time a glossary image arrives with a
  // different aspect ratio. The token is a label, not a promise: `376x450`
  // actually yields 375×450, matching what Bunny serves today.
  glossary: [
    { token: '188x225', ext: 'webp', transform: { op: 'fit', width: 188, height: 225 } },
    { token: '376x450', ext: 'webp', transform: { op: 'fit', width: 376, height: 450 } },
  ],
};

export interface DerivativeSpec {
  /** Storage path of the source, e.g. `habrosyne-scripta/Habrosyne scripta-A-D.jpg`. */
  sourcePath: string;
  kind: SourceKind;
  variant: Variant;
  /** Storage path of the output, e.g. `derived/habrosyne-scripta/Habrosyne scripta-A-D@320h.webp`. */
  derivedPath: string;
}

/**
 * Build the derived storage path for a source + variant.
 *
 * Delegates to src/_lib/derivative-url.ts, which the templates and the build
 * guard also use. The convention must not have two implementations: this script
 * decides what to upload, and the templates decide what to request, and a
 * divergence between those two is 23,172 broken images.
 */
export function derivedPath(sourcePath: string, variant: Variant): string {
  return derivativePath(sourcePath, variant.token);
}

/** Every derivative required for one source image. */
export function specsForSource(sourcePath: string, kind: SourceKind): DerivativeSpec[] {
  return VARIANTS[kind].map((variant) => ({
    sourcePath,
    kind,
    variant,
    derivedPath: derivedPath(sourcePath, variant),
  }));
}

/**
 * Build the full work list from the three source inventories.
 *
 * Inputs are plain path lists so this stays pure and testable; the caller reads
 * them from data/images.csv, data/species-photos.json and data/glossary.csv.
 * Duplicates are collapsed — many glossary terms share one illustration.
 */
export function buildWorkList(sources: {
  legacy: readonly string[];
  highres: readonly string[];
  glossary: readonly string[];
}): DerivativeSpec[] {
  const specs: DerivativeSpec[] = [];
  const seen = new Set<string>();
  const kinds: readonly [SourceKind, readonly string[]][] = [
    ['legacy', sources.legacy],
    ['highres', sources.highres],
    ['glossary', sources.glossary],
  ];

  for (const [kind, paths] of kinds) {
    for (const path of [...new Set(paths)].sort()) {
      for (const spec of specsForSource(path, kind)) {
        if (seen.has(spec.derivedPath)) continue;
        seen.add(spec.derivedPath);
        specs.push(spec);
      }
    }
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Source inventories
// ---------------------------------------------------------------------------

/** One source image, plus the species it belongs to (null for glossary art). */
export interface SourceEntry {
  /** Storage path of the source, e.g. `abagrotis-apposita/Abagrotis apposita-A-D.jpg`. */
  path: string;
  /**
   * Owning species slug, or null when the image is not species-scoped.
   *
   * Present so callers can ask whether the species actually builds. The legacy
   * slug comes from the `species_slug` column and the high-res one from the
   * species-photos.json key — never from the filename, which is the ADR 0001
   * join rule.
   */
  speciesSlug: string | null;
}

export type SourceInventory = Readonly<Record<SourceKind, SourceEntry[]>>;

/**
 * The three source inventories, read from the committed flat files.
 *
 * Shared by the generator (which produces a derivative for every entry) and the
 * build guard (which checks only the entries a built page can reach). The
 * generator is deliberately unscoped: withholding a family is reversible, and a
 * derivative already on the CDN costs nothing but makes lifting the embargo a
 * template change rather than a regeneration run.
 */
export function readSources(dataDir: string): SourceInventory {
  const images = parse(readFileSync(join(dataDir, 'images.csv')), {
    columns: true, skip_empty_lines: true,
  }) as Array<{ species_slug: string; filename: string }>;
  const legacy = images
    .filter((r) => r.species_slug && r.filename)
    .map((r) => ({ path: `${r.species_slug}/${r.filename}`, speciesSlug: r.species_slug }));

  const photos = JSON.parse(readFileSync(join(dataDir, 'species-photos.json'), 'utf8')) as
    Record<string, { specimens?: Array<{ tiles_path: string }> }>;
  const highres: SourceEntry[] = [];
  for (const [speciesSlug, entry] of Object.entries(photos)) {
    for (const specimen of entry.specimens ?? []) {
      if (specimen.tiles_path) {
        highres.push({ path: `${specimen.tiles_path}_thumbnail.webp`, speciesSlug });
      }
    }
  }

  const glossaryRows = parse(readFileSync(join(dataDir, 'glossary.csv')), {
    columns: true, skip_empty_lines: true,
  }) as Array<{ image_filename?: string }>;
  const glossary = glossaryRows
    .map((r) => r.image_filename)
    .filter((f): f is string => Boolean(f))
    .map((f) => ({ path: `glossary/${f}`, speciesSlug: null }));

  return { legacy, highres, glossary };
}

/** Just the paths, in the shape buildWorkList takes. */
export function sourcePaths(sources: SourceInventory): {
  legacy: string[]; highres: string[]; glossary: string[];
} {
  return {
    legacy: sources.legacy.map((e) => e.path),
    highres: sources.highres.map((e) => e.path),
    glossary: sources.glossary.map((e) => e.path),
  };
}

/** Output-format suffix vips appends to the target filename. */
export function vipsTarget(outFile: string, ext: 'webp' | 'jpg'): string {
  return ext === 'webp' ? `${outFile}[Q=${WEBP_QUALITY}]` : `${outFile}[Q=${JPEG_QUALITY}]`;
}

/**
 * vips argv for a transform, given the source's pixel dimensions.
 *
 * Every case is a single `vips thumbnail`, because that is all Bunny is doing:
 * fit within the given bounds, never upscale. `--size down` is what pins the
 * no-upscale half, and it matters — the optimizer refuses to upscale too, which
 * is why ADR 0021's plate previews come out undersized rather than blown up.
 */
export function vipsCommands(
  transform: Transform,
  inFile: string,
  outFile: string,
  ext: 'webp' | 'jpg',
  source: { width: number; height: number },
): string[][] {
  const target = vipsTarget(outFile, ext);

  switch (transform.op) {
    case 'passthrough':
      // Re-encode at the source's own size; `--size down` never upscales.
      return [['thumbnail', inFile, target, String(source.width), '--size', 'down']];

    case 'width':
      return [['thumbnail', inFile, target, String(transform.width), '--size', 'down']];

    case 'height':
      // vips thumbnail sizes by width, so constrain height and give width a
      // ceiling large enough never to bind.
      return [[
        'thumbnail', inFile, target, String(1 << 20),
        '--height', String(transform.height), '--size', 'down',
      ]];

    case 'fit':
      return [[
        'thumbnail', inFile, target, String(transform.width),
        '--height', String(transform.height), '--size', 'down',
      ]];
  }
}
