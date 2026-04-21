/**
 * Copy Zoomify tile directories from the legacy app into _site/plates/.
 *
 * Source: plates_z/{dirName}/  (ImageProperties.xml + TileGroup0/)
 * Dest:   _site/plates/{slug}/ (same structure, URL-safe directory name)
 *
 * Reads plate slugs from the same logic as src/_data/plates.js.
 * Override source with PLATES_Z_SOURCE env var.
 */

import { cp, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_SOURCE = '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/plates_z';
const DEFAULT_CACHE = '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/plates/cache';
const PLATES_Z_SOURCE = process.env.PLATES_Z_SOURCE ?? DEFAULT_SOURCE;
const PLATES_CACHE = process.env.PLATES_CACHE ?? DEFAULT_CACHE;
const DEST = resolve('plates');

function parseDirName(dirName) {
  let name = dirName.replace(/^2021\s+/i, '');
  name = name.replace(/\s*new\s*$/i, '').trim();
  const match = name.match(/^PLATE\s+(\d+)\s+(.+)$/i);
  if (!match) return null;
  return { number: match[1], family: match[2].trim() };
}

function toSlug(number, family) {
  const familySlug = family
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `plate-${number}-${familySlug}`;
}

if (!existsSync(PLATES_Z_SOURCE)) {
  console.warn(`[copy-plates] Source not found: ${PLATES_Z_SOURCE} — skipping`);
  process.exit(0);
}

await mkdir(DEST, { recursive: true });

const entries = await readdir(PLATES_Z_SOURCE, { withFileTypes: true });
const dirs = entries.filter(e => e.isDirectory());

// When two dirs produce the same slug, prefer the "NEW" one (it supersedes the original).
const toProcess = new Map(); // slug -> { dirName, number }
for (const dir of dirs) {
  const parsed = parseDirName(dir.name);
  if (!parsed) {
    console.warn(`[copy-plates] Skipping unparseable directory: ${dir.name}`);
    continue;
  }
  const slug = toSlug(parsed.number, parsed.family);
  const isNew = /new\s*$/i.test(dir.name);
  if (!toProcess.has(slug) || isNew) {
    toProcess.set(slug, { dirName: dir.name, number: parsed.number });
  }
}

// Build thumbnail map: plate number -> best cache filename.
// Prefer: has 2021 prefix AND no NEW → any without NEW → any (including NEW).
let thumbnailMap = new Map();
if (existsSync(PLATES_CACHE)) {
  const cacheFiles = await readdir(PLATES_CACHE);
  for (const fname of cacheFiles) {
    if (!fname.endsWith('.240x300_q95.jpg')) continue;
    // Strip the double extension to get a base name, then extract plate number.
    const base = fname.replace(/\.240x300_q95\.jpg$/, '').replace(/\.jpg$/, '');
    const normalized = base.replace(/_/g, ' ').replace(/^2021\s+/i, '');
    const m = normalized.match(/^PLATE\s+(\d+)\b/i);
    if (!m) continue;
    const num = m[1];
    const isNew = /new/i.test(base);
    const has2021 = /^2021/i.test(fname);
    const hasVersionSuffix = /_\d+$/.test(base);
    const existing = thumbnailMap.get(num);
    // Score: prefer 2021+noNEW+noVersion (highest) down to anything (lowest)
    const score = (has2021 ? 4 : 0) + (!isNew ? 2 : 0) + (!hasVersionSuffix ? 1 : 0);
    if (!existing || score > existing.score) {
      thumbnailMap.set(num, { fname, score });
    }
  }
} else {
  console.warn(`[copy-plates] Cache not found: ${PLATES_CACHE} — thumbnails will use level-0 tile`);
}

async function readDimensions(dirPath) {
  const xml = await readFile(join(dirPath, 'ImageProperties.xml'), 'utf8');
  const wMatch = xml.match(/WIDTH="(\d+)"/);
  const hMatch = xml.match(/HEIGHT="(\d+)"/);
  return {
    width: wMatch ? parseInt(wMatch[1], 10) : 2400,
    height: hMatch ? parseInt(hMatch[1], 10) : 3000,
  };
}

let copied = 0;
let thumbsCopied = 0;
const manifest = [];
for (const [slug, { dirName, number }] of toProcess) {
  const src = join(PLATES_Z_SOURCE, dirName);
  const dest = join(DEST, slug);
  await cp(src, dest, { recursive: true });
  copied++;

  const thumb = thumbnailMap.get(number);
  if (thumb) {
    await copyFile(join(PLATES_CACHE, thumb.fname), join(dest, 'thumbnail.jpg'));
    thumbsCopied++;
  }

  const parsed = parseDirName(dirName);
  const { width, height } = await readDimensions(src);
  manifest.push({ number, family: parsed.family, slug, width, height });
}

manifest.sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));
await writeFile(join(DEST, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Copied ${copied} plate tile sets: ${PLATES_Z_SOURCE} -> ${DEST}`);
console.log(`Copied ${thumbsCopied} thumbnails: ${PLATES_CACHE} -> ${DEST}/**/thumbnail.jpg`);
console.log(`Wrote manifest: ${DEST}/manifest.json`);
