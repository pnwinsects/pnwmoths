// Pre-generated image derivative URLs (docs/adr/0022).
//
// Deliberately shared by four very different callers:
//   * src/species/species.njk and src/glossary/index.njk (Eleventy, via the
//     `derivative` filter) — render <img src>/srcset.
//   * src/components/*.ts (browser, bundled by Vite) — build thumbnail URLs.
//   * src/_lib/social-meta.ts — builds the og:image URL.
//   * scripts/lib/derivatives.ts (Node) — decides what to generate and upload.
//
// One implementation is the whole point. The generator writes these paths, the
// uploader ships them, the templates request them, and the build guard checks
// them; four copies of `@320h.webp` is how a variant silently stops existing.
//
// Browser-safe: no Node imports, no DOM access — src/_lib is passthrough-copied
// to the bundle, as with legacy-redirects.ts (ADR 0019).

/** Variant tokens from the ADR 0022 matrix. */
export type VariantToken = '320h' | 'full' | '530' | '1060' | '1200' | '188x225' | '376x450';

/**
 * Output extension per variant.
 *
 * `1200` is the only JPEG, and that is load-bearing rather than cosmetic: it is
 * the share-card variant, and WebP `og:image` is a coin flip off the major
 * platforms (ADR 0021).
 */
export const VARIANT_EXT: Readonly<Record<VariantToken, 'webp' | 'jpg'>> = {
  '320h': 'webp',
  'full': 'webp',
  '530': 'webp',
  '1060': 'webp',
  '1200': 'jpg',
  '188x225': 'webp',
  '376x450': 'webp',
};

/**
 * Storage path of a derivative: `derived/<source-stem>@<token>.<ext>`.
 *
 * Takes an UNENCODED source path — encoding happens in derivativeUrl, so callers
 * cannot double-encode. The `@` separator is deliberate: Django-era filenames are
 * already full of hyphens, so a hyphen would be ambiguous to read and to undo.
 */
export function derivativePath(sourcePath: string, token: VariantToken): string {
  const slash = sourcePath.lastIndexOf('/');
  const dot = sourcePath.lastIndexOf('.');
  const stem = dot > slash ? sourcePath.slice(0, dot) : sourcePath;
  return `derived/${stem}@${token}.${VARIANT_EXT[token]}`;
}

/** Percent-encode each path segment, preserving separators. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Full CDN URL for a derivative.
 *
 * `encodeURIComponent` escapes the `@` to `%40`; verified against the live CDN
 * that Bunny fully percent-decodes path segments, so `%40` and `@` address one
 * object.
 */
export function derivativeUrl(cdnBaseUrl: string, sourcePath: string, token: VariantToken): string {
  return `${cdnBaseUrl}/${encodePath(derivativePath(sourcePath, token))}`;
}

/**
 * CDN URL for an un-derived source image.
 *
 * Still needed in two places: the 1500px hero slot, which *is* the stored
 * `_thumbnail.webp` rather than a derivative, and the legacy `og:image` fallback,
 * which must stay JPEG for crawlers.
 */
export function sourceUrl(cdnBaseUrl: string, sourcePath: string): string {
  return `${cdnBaseUrl}/${encodePath(sourcePath)}`;
}
