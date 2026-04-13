/**
 * Copy species images from images/{slug}/ to _site/images/{slug}/
 *
 * The eleventy-plugin-vite build renames _site -> .11ty-vite, runs Vite
 * into a new empty _site/, so binary passthrough-copied files don't survive.
 * This script runs after the full build to restore them.
 */
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

const src = resolve('images');
const dest = resolve('_site/images');

await cp(src, dest, { recursive: true });
console.log('Copied images: images/ -> _site/images/');
