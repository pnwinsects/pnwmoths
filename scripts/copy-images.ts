/**
 * Copy the OpenSeadragon nav-button images from node_modules into _site/osd-images/,
 * where the deep-zoom viewers' `prefix-url` points.
 *
 * This script used to restore everything eleventy-plugin-vite's mid-build _site/ wipe
 * destroyed (public/, the theme CSS, Pico). Since ADR 0049 nothing is wiped: public/ is
 * an Eleventy passthrough, and the CSS is a Vite entry, hashed under /assets/.
 */
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

// OpenSeadragon nav button images
const osdImagesSrc = resolve('node_modules/openseadragon/build/openseadragon/images');
const osdImagesDest = resolve('_site/osd-images');
await cp(osdImagesSrc, osdImagesDest, { recursive: true });
console.log('Copied OpenSeadragon images: node_modules/openseadragon/.../images -> _site/osd-images');
