// src/_lib/photo-display.ts
//
// WHICH PHOTOGRAPH A SURFACE SHOWS. One module, so the answer is stated once (#338).
//
// Six surfaces render photographs out of data/images.csv, and before this module each
// implemented its own selection inline: two DuckDB ORDER BYs, two JS sorts, two Nunjucks
// expressions, in four files across three languages. Every one was locally sensible and
// none of them could be asked a question. Building the hidden-images report (#299) needed
// exactly that question answered and got it wrong three times running.
//
// TWO QUESTIONS, NOT ONE. This module answers the first; photo-display-index.ts derives
// the second from it.
//
//   1. SELECTION — given a surface and a scope, which row do I render?
//      Per (surface, species-or-genus) → one row, or an ordered list. Asked at build time
//      by a caller that already knows where it is. That is everything below.
//   2. LOCATION — given a photograph, where does it appear?
//      Per photograph → a set of surfaces. It is the transitive closure of (1): run every
//      picker across the catalogue and invert. A derived artifact, not a peer function —
//      see photo-display-index.ts.
//
// A SPECIES DOES NOT SHOW A PHOTOGRAPH; A SURFACE DOES. The genus strip is not keyed by
// species at all — it takes four images across a whole genus — so no per-species function
// can predict it, which is why `pickGenusStrip` takes the genus's slugs and not a slug.
//
// THE ORDERING IS ALSO A SQL FRAGMENT. src/_data/taxon.ts and scripts/build-key.ts select
// over the whole images table in DuckDB, so a per-species TypeScript function is the wrong
// signature for them. `WEIGHT_ORDER_SQL` and `NON_VENTRAL_SQL` are what they order and
// filter by; `compareByWeight` and `isVentral` are the same rules for callers holding rows
// in memory. Keeping the pair adjacent is what makes them stay in agreement — and
// scripts/check-display-index.ts checks the whole model against the emitted HTML on every
// build, because a model of a consumer that nothing verifies is how this got wrong before.
//
// Prose version, with the per-surface consequences: docs/reference/photo-display-rules.md.

/**
 * Anything the ordering applies to: a row that may carry a weight.
 *
 * Optional, because callers hand in rows of their own shape — a DuckDB projection, an
 * Eleventy data row, a synthetic tile stand-in with no weight at all — and every picker
 * is generic over that shape rather than forcing a conversion at each call site. A row
 * with no weight sorts last, and a stable sort over rows that all lack one preserves the
 * order it was handed.
 */
export interface Weighted {
  weight?: number | null;
}

/** A row that can be filtered by view. Only Browse does. */
export interface Viewed {
  view?: string | null;
}

/** The `data/images.csv` fields a display rule reads. Everything else is caption metadata. */
export interface DisplayRow {
  species_slug: string;
  filename: string;
  /** `TRY_CAST(weight AS INTEGER)` — null when the cell is blank or unparseable. */
  weight: number | null;
  /** `dorsal` | `ventral` | `lateral` | `head`, or null when unclassified. */
  view?: string | null;
}

/**
 * The six surfaces that render a catalogued photograph, and the seven rules between
 * them — Browse picks differently at the genus level than above it.
 */
export type Surface =
  | 'account'
  | 'browse-card'
  | 'browse-genus-strip'
  | 'browse-higher-strip'
  | 'identify'
  | 'similar'
  | 'share';

/**
 * What high-resolution tiles do to a surface's selection. Stated once here because it was
 * the asymmetry nobody could see: only the account knew tiles existed, so tiling a species
 * silently removed its catalogued photographs from its own page while leaving them on
 * `/browse/`, on Identify and on other species' pages (#338, #299).
 *
 *   replaces — tiles render INSTEAD OF the catalogued photographs; none of them appear
 *   prefers  — a tile is used when there is one, otherwise the catalogued photograph
 *   fallback — catalogued photographs win; a tile is used only when there are none
 *   ignores  — the surface never consults tile status at all
 */
export type TilePolicy = 'replaces' | 'prefers' | 'fallback' | 'ignores';

export const TILE_POLICY: Record<Surface, TilePolicy> = {
  'account': 'replaces',
  'browse-card': 'fallback',
  'browse-genus-strip': 'fallback',
  'browse-higher-strip': 'fallback',
  'identify': 'ignores',
  'similar': 'ignores',
  'share': 'prefers',
};

/** How many images a Browse strip holds, at every level of the tree. */
export const STRIP_SIZE = 4;

// ---------------------------------------------------------------------------
// Layer 1 — the ordering, in both dialects
// ---------------------------------------------------------------------------

/**
 * `weight` orders a species' photographs, low first, and therefore selects them: the
 * lowest-weight row is what every surface below that takes "the first" shows. It is the
 * only selector — a curator promotes a photograph by giving it the lowest weight for its
 * species. (A `navigational` flag once claimed that role; it was empty in all 4,034 rows
 * and was removed in ADR 0039.)
 */
export const WEIGHT_ORDER_SQL = 'TRY_CAST(weight AS INTEGER)';

/**
 * Browse excludes ventral (underside) shots; those belong on the account, not in the tree
 * (#107). A row with a BLANK view is kept — unclassified is not confirmed-ventral, and
 * `IS DISTINCT FROM` is what keeps NULL on the safe side of that. No other surface filters
 * by view.
 */
export const NON_VENTRAL_SQL = `view IS DISTINCT FROM 'ventral'`;

/** The in-memory twin of `WEIGHT_ORDER_SQL`. An absent weight sorts last, never first. */
export function compareByWeight(a: Weighted, b: Weighted): number {
  return (a.weight ?? Number.MAX_SAFE_INTEGER) - (b.weight ?? Number.MAX_SAFE_INTEGER);
}

/** The in-memory twin of `NON_VENTRAL_SQL`. */
export function isVentral(view: string | null | undefined): boolean {
  return view === 'ventral';
}

/** A stable copy in display order. Never sorts the caller's array in place. */
export function orderByWeight<T extends Weighted>(rows: readonly T[]): T[] {
  return rows.slice().sort(compareByWeight);
}

// ---------------------------------------------------------------------------
// Layer 2 — one picker per surface
// ---------------------------------------------------------------------------

/**
 * What a species account displays. The one surface that knows tiles exist, and it shows
 * them INSTEAD OF the catalogued photographs, not alongside — `mode` is that branch, and
 * naming it is how the rest of the site can stop guessing at it.
 */
export type AccountDisplay<T> =
  | { mode: 'tiles'; photos: readonly [] }
  | { mode: 'photos'; photos: readonly T[] }
  | { mode: 'none'; photos: readonly [] };

export function pickAccountPhotos<T extends Weighted>(
  rows: readonly T[],
  tiled: boolean,
): AccountDisplay<T> {
  if (tiled) return { mode: 'tiles', photos: [] };
  if (rows.length === 0) return { mode: 'none', photos: [] };
  return { mode: 'photos', photos: orderByWeight(rows) };
}

/**
 * The Browse species card: the lowest-weight non-ventral photograph.
 *
 * Tiles are a FALLBACK here, the opposite of the account — a species with no images.csv
 * row at all still gets a thumbnail from the high-res manifest (#84), and `images.csv`
 * rows win whenever both exist. The fallback row is supplied by the caller because only
 * it can build one; this function just declines to look past what it was given.
 */
export function pickCardPhoto<T extends Weighted & Viewed>(rows: readonly T[]): T | null {
  return orderByWeight(rows.filter((r) => !isVentral(r.view)))[0] ?? null;
}

/**
 * The Browse genus strip: up to four photographs taken across the WHOLE genus by weight —
 * not one per species.
 *
 * This is the rule that no per-species model predicts, and the one that made three
 * attempts at the hidden-images report wrong: a species can put a second photograph on
 * `/browse/` that nothing keyed by species accounts for (the *Phyllodesma coturnix*
 * dorsal, the case the curator asked about by name).
 *
 * `key` identifies a candidate for de-duplication — a filename, or a tile thumbnail path
 * for the synthetic high-res fallback rows, which have no filename.
 */
export function pickGenusStrip<T extends Weighted>(
  speciesSlugs: readonly string[],
  bySpeciesSlug: Readonly<Record<string, readonly T[]>>,
  key: (row: T) => string,
  limit: number = STRIP_SIZE,
): T[] {
  const seen = new Set<string>();
  const candidates: T[] = [];
  for (const slug of speciesSlugs) {
    for (const row of bySpeciesSlug[slug] ?? []) {
      const k = key(row);
      if (seen.has(k)) continue;
      seen.add(k);
      candidates.push(row);
    }
  }
  return orderByWeight(candidates).slice(0, limit);
}

/**
 * The Browse tribe / subfamily / family strips: the FIRST image of each genus strip below
 * them, in tree order, until four. A different rule from the genus strip one level down,
 * which is why this repo has six surfaces and seven rules.
 */
export function pickHigherStrip<T>(genusStrips: readonly (readonly T[])[], limit: number = STRIP_SIZE): T[] {
  const images: T[] = [];
  for (const strip of genusStrips) {
    if (images.length >= limit) break;
    if (strip.length > 0) images.push(strip[0]!);
  }
  return images.slice(0, limit);
}

/**
 * An Identify card: the lowest-weight photograph, ventral INCLUDED.
 *
 * Identify reaches only the species the Lucid key matrix carries, so a species with a
 * page and no key entry has no card here at all — a fact no rule about `images.csv` can
 * express, and the caller's business.
 */
export function pickIdentifyPhoto<T extends Weighted>(rows: readonly T[]): T | null {
  return orderByWeight(rows)[0] ?? null;
}

/**
 * A similar-species thumbnail: the lowest-weight photograph, ventral included, tiles
 * ignored. Rendered on OTHER species' pages — the ones naming this species in
 * `similar_species` — which is why a photograph can be invisible on its own account and
 * still be on the site.
 */
export function pickSimilarPhoto<T extends Weighted>(rows: readonly T[]): T | null {
  return orderByWeight(rows)[0] ?? null;
}

/**
 * The share / Open Graph image: a tile thumbnail when the species is tiled, else the
 * lowest-weight catalogued photograph, else the site share card (ADR 0021).
 *
 * `prefers`, not `replaces`: unlike the account, a tiled species with no usable tile still
 * falls back to its photographs rather than showing nothing.
 */
export function pickSharePhoto<T extends Weighted>(
  rows: readonly T[],
  tileThumbnail: string | null,
): { kind: 'tile'; tile: string } | { kind: 'photo'; photo: T } | { kind: 'none' } {
  if (tileThumbnail) return { kind: 'tile', tile: tileThumbnail };
  const photo = orderByWeight(rows)[0];
  return photo ? { kind: 'photo', photo } : { kind: 'none' };
}
