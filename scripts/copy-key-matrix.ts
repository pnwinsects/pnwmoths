/**
 * Copy key-matrix.json from data/ to _site/ after Eleventy build.
 * (A build step of its own since the days eleventy-plugin-vite wiped _site/ mid-build;
 * that no longer happens — ADR 0049 — but the step is harmless and is what the
 * build:check-key-weight step after it expects.)
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir(resolve('_site'), { recursive: true });
await copyFile(resolve('data/key-matrix.json'), resolve('_site/key-matrix.json'));
console.log('Copied key matrix: data/key-matrix.json -> _site/key-matrix.json');
