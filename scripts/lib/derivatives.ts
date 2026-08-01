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

/** Source families, which determine the variant set. */
export type SourceKind = 'legacy' | 'highres' | 'glossary';

/** A single image transform, expressed independently of the tool that runs it. */
export type Transform =
  | { op: 'width'; width: number }
  | { op: 'height'; height: number }
  | { op: 'fit'; width: number; height: number }
  | { op: 'passthrough' };

export interface Variant {
  /** Token that appears after `@` in the derived path. */
  token: string;
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
 * `derived/<source-path-without-extension>@<token>.<ext>`. The `@` separator is
 * deliberate: legacy Django-era filenames are already full of hyphens, so a
 * hyphen would be ambiguous to read and to undo.
 */
export function derivedPath(sourcePath: string, variant: Variant): string {
  const slash = sourcePath.lastIndexOf('/');
  const dot = sourcePath.lastIndexOf('.');
  const stem = dot > slash ? sourcePath.slice(0, dot) : sourcePath;
  return `derived/${stem}@${variant.token}.${variant.ext}`;
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
