/**
 * Copy assets that don't survive the eleventy-plugin-vite build step.
 *
 * The eleventy-plugin-vite build renames _site -> .11ty-vite, runs Vite
 * into a new empty _site/, so binary passthrough-copied files don't survive.
 * This script runs after the full build to restore them.
 *
 * Copies:
 *   images/{slug}/        -> _site/images/{slug}/   (species photos)
 *   src/images/           -> _site/images/          (banner image)
 *   src/styles/           -> _site/styles/          (theme CSS)
 */
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

// Species photos (managed via Git LFS, stored in repo root images/)
const speciesSrc = resolve('images');
const speciesDest = resolve('_site/images');
await cp(speciesSrc, speciesDest, { recursive: true });
console.log('Copied images: images/ -> _site/images/');

// Banner image asset
const bannerSrc = resolve('src/images');
const bannerDest = resolve('_site/images');
await cp(bannerSrc, bannerDest, { recursive: true });
console.log('Copied banner: src/images/ -> _site/images/');

// Theme CSS
const stylesSrc = resolve('src/styles');
const stylesDest = resolve('_site/styles');
await cp(stylesSrc, stylesDest, { recursive: true });
console.log('Copied styles: src/styles/ -> _site/styles/');
