/**
 * Copy Parquet files from data/parquet/{slug}/ to _site/species/{slug}/
 *
 * The eleventy-plugin-vite build renames _site -> .11ty-vite, runs Vite
 * into a new empty _site/, so binary passthrough-copied files don't survive.
 * This script runs after the full build to restore them.
 */
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

const src = resolve('data/parquet');
const dest = resolve('_site/species');

await cp(src, dest, { recursive: true });
console.log('Copied Parquet files: data/parquet/ -> _site/species/');
