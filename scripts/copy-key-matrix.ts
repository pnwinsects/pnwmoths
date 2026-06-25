/**
 * Copy key-matrix.json from data/ to _site/ after Eleventy build.
 * eleventy-plugin-vite wipes _site/ during build; post-build copy restores it.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir(resolve('_site'), { recursive: true });
await copyFile(resolve('data/key-matrix.json'), resolve('_site/key-matrix.json'));
console.log('Copied key matrix: data/key-matrix.json -> _site/key-matrix.json');
