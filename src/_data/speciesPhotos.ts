// Eleventy 11ty-data loader for the high-resolution species photo manifest.
// Returns an object keyed by species slug; consumed by src/species/species.njk
// as `speciesPhotos[sp.slug]` to drive the OSD lightbox branch in
// pnwm-image-slideshow. The JSON is derived from the upload manifest by
// `npm run photos:materialize` and committed (see _instructions/UPLOADING_TILES.md).
//
// Imported rather than read, so the compiler checks it (#250). `resolveJsonModule`
// infers the type from the file's real contents, and the annotation below is what
// turns that into a verification: if a committed entry loses `specimens`, or
// `high_res_available` stops being a boolean, `tsc --noEmit` fails naming the slug
// instead of the site rendering a broken lightbox.
//
// This replaced an `existsSync` guard that warned and returned `{}`. The file is
// committed, so "missing" means someone deleted it, and a build that quietly
// produces every species page without its high-res photos is a worse outcome than
// one that stops. Note `photographer` and `license` are curator-entered directly
// into the JSON after generation, so the generator is not its only author —
// see docs/adr/0017-reproducible-committed-artifacts.md.

import photos from '../../data/species-photos.json' with { type: 'json' };
import type { SpeciesPhoto } from '../types/index.ts';

const MANIFEST: Record<string, SpeciesPhoto> = photos;

export default function (): Record<string, SpeciesPhoto> {
  return MANIFEST;
}
