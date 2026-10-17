// src/_lib/photo-path.ts
//
// WHERE A PHOTOGRAPH LIVES ON THE CDN (ADR 0054).
//
// A photograph is stored at `<folder>/<filename>`, its derivatives under
// `derived/<folder>/…`, and a tiled specimen under `species-tiles/<folder>/…`. The
// folder starts out as the species slug and then stays put: a species rename changes
// `species_slug`, never the folder, so a rename moves nothing on the CDN.
//
// The folder is the `cdn_folder` column of `data/images.csv` (and of
// `data/species-photos-manifest.csv` for tiles). A blank cell means "the folder is
// named for the species slug", which is what every photograph had before this
// column existed and what a hand-added row should leave.
//
// THIS IS THE ONLY MODULE THAT JOINS A FOLDER AND A FILENAME. Templates, build scripts
// and browser components all call it. A test in `src/_lib/photo-path.test.ts`
// (`findHandBuiltPhotoPaths`, run by `npm test`) fails if another file builds
// `<slug>/<filename>` by hand, because the mistake it prevents shows up only after the
// first rename and then as a quiet wrong folder.
//
// Browser-safe: no Node imports, no DOM access (src/_lib is bundled for the browser).

/** What a path needs from a photograph row of `data/images.csv`. */
export interface PhotoFolderRow {
  species_slug: string;
  /** Blank or absent means the folder is named for `species_slug`. */
  cdn_folder?: string | null;
}

/** The folder a catalogued photograph is stored in. */
export function cdnFolder(row: PhotoFolderRow): string {
  return row.cdn_folder || row.species_slug;
}

/** Storage path of a catalogued photograph's original: `<folder>/<filename>`. */
export function photoPath(row: PhotoFolderRow & { filename: string }): string {
  return `${cdnFolder(row)}/${row.filename}`;
}

/**
 * The folder to record next to a species slug in data that goes to the browser, or
 * undefined when it is the slug itself. Keeping the common case out of the payload
 * leaves the built site unchanged until a species is actually renamed.
 */
export function folderIfRenamed(row: PhotoFolderRow): string | undefined {
  const folder = cdnFolder(row);
  return folder === row.species_slug ? undefined : folder;
}

/** What a tile path needs from a row of `data/species-photos-manifest.csv`. */
export interface TileFolderRow extends PhotoFolderRow {
  specimen_id: string;
  view: string;
}

/** The folder a specimen's tiles are stored in: lower-cased slug unless frozen. */
export function tileFolder(row: PhotoFolderRow): string {
  return row.cdn_folder || row.species_slug.toLowerCase();
}

/** `species-tiles/<folder>/<specimen>-<view>`, no trailing slash. */
export function tilesPath(row: TileFolderRow): string {
  return `species-tiles/${tileFolder(row)}/${row.specimen_id}-${row.view}`;
}
