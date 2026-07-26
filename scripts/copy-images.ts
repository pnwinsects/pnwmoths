/**
 * Copy assets that don't survive the eleventy-plugin-vite build step.
 *
 * The eleventy-plugin-vite build renames _site -> .11ty-vite, runs Vite
 * into a new empty _site/, so binary passthrough-copied files don't survive.
 * This script runs after the full build to restore them.
 *
 * Copies:
 *   public/           -> _site/                  (banner image, partner logos, favicon)
 *   src/styles/           -> _site/styles/          (theme CSS)
 *   @picocss/pico         -> _site/css/             (Pico CSS)
 *   openseadragon images  -> _site/osd-images/      (OSD nav buttons)
 *
 * public/ is also Vite's publicDir, so a full `build:eleventy` already copies it
 * into _site/. Repeating it here is idempotent and keeps `--serve` and the standalone
 * `build:copy-images` step working.
 */
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

// Public assets (banner image, partner logos, favicon)
const publicSrc = resolve('public');
const publicDest = resolve('_site');
await cp(publicSrc, publicDest, { recursive: true });
console.log('Copied public assets: public/ -> _site/');

// Theme CSS
const stylesSrc = resolve('src/styles');
const stylesDest = resolve('_site/styles');
await cp(stylesSrc, stylesDest, { recursive: true });
console.log('Copied styles: src/styles/ -> _site/styles/');

// Pico CSS (passthrough copy does not survive eleventy-plugin-vite's _site wipe)
import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const picoSrc = require.resolve('@picocss/pico/css/pico.min.css') as string;
const picoDest = resolve('_site/css');
await mkdir(picoDest, { recursive: true });
await copyFile(picoSrc, resolve('_site/css/pico.min.css'));
console.log('Copied Pico CSS: @picocss/pico/css/pico.min.css -> _site/css/pico.min.css');

// OpenSeadragon nav button images
const osdImagesSrc = resolve('node_modules/openseadragon/build/openseadragon/images');
const osdImagesDest = resolve('_site/osd-images');
await cp(osdImagesSrc, osdImagesDest, { recursive: true });
console.log('Copied OpenSeadragon images: node_modules/openseadragon/.../images -> _site/osd-images');
