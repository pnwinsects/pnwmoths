/**
 * Copy assets that don't survive the eleventy-plugin-vite build step.
 *
 * The eleventy-plugin-vite build renames _site -> .11ty-vite, runs Vite
 * into a new empty _site/, so binary passthrough-copied files don't survive.
 * This script runs after the full build to restore them.
 *
 * Copies:
 *   src/images/           -> _site/images/          (banner image)
 *   src/styles/           -> _site/styles/          (theme CSS)
 *   @picocss/pico         -> _site/css/             (Pico CSS)
 *   openseadragon images  -> _site/osd-images/      (OSD nav buttons)
 */
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

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

// Pico CSS (passthrough copy does not survive eleventy-plugin-vite's _site wipe)
import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const picoSrc = require.resolve('@picocss/pico/css/pico.min.css');
const picoDest = resolve('_site/css');
await mkdir(picoDest, { recursive: true });
await copyFile(picoSrc, resolve('_site/css/pico.min.css'));
console.log('Copied Pico CSS: @picocss/pico/css/pico.min.css -> _site/css/pico.min.css');

// OpenSeadragon nav button images
const osdImagesSrc = resolve('node_modules/openseadragon/build/openseadragon/images');
const osdImagesDest = resolve('_site/osd-images');
await cp(osdImagesSrc, osdImagesDest, { recursive: true });
console.log('Copied OpenSeadragon images: node_modules/openseadragon/.../images -> _site/osd-images');
