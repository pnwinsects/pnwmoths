/**
 * scripts/migrate-images.js
 *
 * One-time migration tool: reads Django species photos from moths/ and glossary images
 * from glossary-images/, derives CDN path slugs, uploads via bunny.net HTTP Storage API,
 * and writes data/images.csv with original Django filenames + photographer/license data.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/migrate-images.js                    # dry-run: no upload, writes images.csv
 *   BUNNY_API_KEY=xxx node scripts/migrate-images.js            # full run
 *
 * Override source paths or storage config via environment:
 *   MOTHS_SOURCE, GLOSSARY_SOURCE, SPECIESIMAGE_CSV, PHOTOGRAPHER_CSV
 *   BUNNY_API_KEY (required for upload), BUNNY_STORAGE_HOST, BUNNY_ZONE
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// --- Constants (overridable via env for testing) ---
const DEFAULT_MOTHS_SOURCE =
  '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/moths';
const DEFAULT_GLOSSARY_SOURCE =
  '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/glossary-images';
const DEFAULT_SPECIESIMAGE_CSV =
  '/Users/rainhead/dev/pnwinsects-app/species_speciesimage.csv';
const DEFAULT_PHOTOGRAPHER_CSV =
  '/Users/rainhead/dev/pnwinsects-app/species_photographer.csv';

const MOTHS_SOURCE = process.env.MOTHS_SOURCE ?? DEFAULT_MOTHS_SOURCE;
const GLOSSARY_SOURCE = process.env.GLOSSARY_SOURCE ?? DEFAULT_GLOSSARY_SOURCE;
const SPECIESIMAGE_CSV = process.env.SPECIESIMAGE_CSV ?? DEFAULT_SPECIESIMAGE_CSV;
const PHOTOGRAPHER_CSV = process.env.PHOTOGRAPHER_CSV ?? DEFAULT_PHOTOGRAPHER_CSV;
const LICENSE = 'CC BY-NC-SA 4.0'; // all content on source site is CC BY-NC-SA 4.0
// bunny.net HTTP Storage API — more reliable than FTP (rclone FTP uses temp-file rename
// which bunny.net FTP does not support). BUNNY_API_KEY is the Storage Zone password.
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const SKIP_SUBDIRS = new Set(['thumbnail', 'medium', 'cache']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

const VIEW_MAP = {
  D: 'dorsal',
  V: 'ventral',
  L: 'lateral',
  H: 'head',
};

/**
 * Parse a Django moth filename to extract genus and species.
 * Expected pattern: "{Genus} {species}-..." (e.g. "Acronicta americana-A-D.jpg")
 * Returns { genus, species } or null for non-matching filenames (e.g. numeric IDs).
 *
 * @param {string} fname - Bare filename (not a path)
 * @returns {{ genus: string, species: string } | null}
 */
function parseMotFilename(fname) {
  const match = fname.match(/^([A-Z][a-z]+) ([a-z]+)-/);
  if (!match) {
    console.warn(`[migrate-images] Skipping unparseable filename: ${fname}`);
    return null;
  }
  return { genus: match[1], species: match[2] };
}

/**
 * Derive CDN slug from genus and species.
 *
 * @param {string} genus
 * @param {string} species
 * @returns {string}
 */
function toSlug(genus, species) {
  return `${genus}-${species}`.toLowerCase();
}

/**
 * Extract view and specimen from a Django filename suffix.
 * Pattern: "-{Specimen}-{ViewCode}.ext" (e.g. "-A-D.jpg" → specimen=A, view=dorsal)
 *
 * @param {string} fname
 * @returns {{ view: string, specimen: string }}
 */
function parseViewSpecimen(fname) {
  const match = fname.match(/-([A-Z])-([A-Z])\.[^.]+$/);
  if (!match) return { view: '', specimen: '' };
  const specimen = match[1];
  const viewCode = match[2];
  const view = VIEW_MAP[viewCode] ?? viewCode;
  return { view, specimen };
}

/**
 * Main migration function.
 */
async function main() {
  // --- Graceful exit if moths source missing ---
  if (!existsSync(MOTHS_SOURCE)) {
    console.warn('[migrate-images] Moths source not found — skipping');
    process.exit(0);
  }

  // --- Step 1: (no species ID lookup needed) ---
  // Slug is derived directly from the image filename in speciesimage CSV,
  // so data/species.csv is not used for the upload path.

  // --- Step 2: Load photographer lookup ---
  let photographerById = new Map();
  if (existsSync(PHOTOGRAPHER_CSV)) {
    const photographerRaw = await readFile(PHOTOGRAPHER_CSV);
    // Use relax_column_count to handle photographer names containing literal commas
    // (e.g. "Canadian National Collection (Jocelyn Gill, photographer)").
    // Extra fields beyond column 1 are rejoined with a comma.
    const photographerRows = parse(photographerRaw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
    for (const row of photographerRows) {
      // When relax_column_count is set, extra fields arrive as numeric string keys ("2", "3", ...).
      // Rejoin them with the `photographer` field to reconstruct the full name.
      let name = row.photographer ?? '';
      let i = 2;
      while (row[String(i)] !== undefined) {
        name += ',' + row[String(i)];
        i++;
      }
      photographerById.set(String(row.id), name.trim());
    }
    console.log(`[migrate-images] Loaded ${photographerById.size} photographers`);
  } else {
    console.warn(`[migrate-images] Photographer CSV not found (${PHOTOGRAPHER_CSV}) — photographer names will be empty`);
  }

  // --- Step 3: Load species image records from Django DB export ---
  /** @type {Map<string, Array>} slug → image rows */
  const slugToImages = new Map();

  if (existsSync(SPECIESIMAGE_CSV)) {
    const speciesImageRaw = await readFile(SPECIESIMAGE_CSV);
    const speciesImageRows = parse(speciesImageRaw, { columns: true, skip_empty_lines: true });
    console.log(`[migrate-images] Loaded ${speciesImageRows.length} species image records`);

    // Group rows by slug — derive slug directly from the image filename,
    // no species_id lookup needed (data/species.csv only has test stubs).
    for (const row of speciesImageRows) {
      // Strip "moths/" prefix from image column to get bare filename
      const rawImage = row.image ?? '';
      const fname = rawImage.startsWith('moths/') ? rawImage.slice('moths/'.length) : rawImage;
      if (!fname) continue;

      const parsed = parseMotFilename(fname);
      if (!parsed) continue; // already warned inside parseMotFilename

      const slug = toSlug(parsed.genus, parsed.species);

      const photographer = photographerById.get(String(row.photographer_id)) ?? '';
      const { view, specimen } = parseViewSpecimen(fname);

      if (!slugToImages.has(slug)) slugToImages.set(slug, []);
      slugToImages.get(slug).push({
        slug,
        filename: fname,
        photographer,
        license: LICENSE,
        view,
        specimen,
      });
    }

    // Sort each slug's images alphabetically by filename and assign sequential weights
    for (const [slug, imgs] of slugToImages) {
      imgs.sort((a, b) => a.filename.localeCompare(b.filename));
      imgs.forEach((img, i) => { img.weight = i + 1; });
    }
    console.log(`[migrate-images] Grouped images into ${slugToImages.size} species slugs`);
  } else {
    console.warn(`[migrate-images] Species image CSV not found (${SPECIESIMAGE_CSV}) — falling back to filesystem scan`);

    // Fallback: scan moths/ directory directly (no photographer/license data)
    const entries = await readdir(MOTHS_SOURCE, { withFileTypes: true });
    const files = entries.filter(e => e.isFile() && !SKIP_SUBDIRS.has(e.name));

    for (const entry of files) {
      const ext = extname(entry.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;

      const parsed = parseMotFilename(entry.name);
      if (!parsed) continue;

      const slug = toSlug(parsed.genus, parsed.species);
      const { view, specimen } = parseViewSpecimen(entry.name);

      if (!slugToImages.has(slug)) slugToImages.set(slug, []);
      slugToImages.get(slug).push({
        slug,
        filename: entry.name,
        photographer: '',
        license: LICENSE,
        view,
        specimen,
      });
    }

    // Sort and assign weights
    for (const [slug, imgs] of slugToImages) {
      imgs.sort((a, b) => a.filename.localeCompare(b.filename));
      imgs.forEach((img, i) => { img.weight = i + 1; });
    }
    console.log(`[migrate-images] Filesystem scan: found ${slugToImages.size} species slugs`);
  }

  // --- Step 4: Scan glossary-images/ ---
  const glossaryImages = [];
  if (existsSync(GLOSSARY_SOURCE)) {
    const glossaryEntries = await readdir(GLOSSARY_SOURCE, { withFileTypes: true });
    for (const entry of glossaryEntries) {
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      glossaryImages.push({
        slug: 'glossary',
        filename: entry.name,
        photographer: '',
        license: LICENSE,
        view: '',
        specimen: '',
        weight: 1,
      });
    }
    console.log(`[migrate-images] Found ${glossaryImages.length} glossary images`);
  } else {
    console.warn(`[migrate-images] Glossary source not found (${GLOSSARY_SOURCE}) — skipping glossary images`);
  }

  // --- Step 5: Upload via bunny.net HTTP Storage API ---
  // rclone FTP cannot be used: bunny.net FTP does not support RNFR/RNTO rename,
  // which rclone requires for its temp-file upload pattern (no config flag disables this).
  // The HTTP Storage API is a plain PUT — no rename, no partial files.
  if (!DRY_RUN) {
    if (!BUNNY_API_KEY) {
      console.error('[migrate-images] BUNNY_API_KEY is required for uploads. Set it to your Storage Zone password.');
      process.exit(1);
    }

    let uploaded = 0;
    const total = Array.from(slugToImages.values()).reduce((n, imgs) => n + imgs.length, 0) + glossaryImages.length;

    console.log(`[migrate-images] Uploading ${total} files via bunny.net HTTP API...`);

    for (const [slug, imgs] of slugToImages) {
      for (const img of imgs) {
        const encodedFilename = encodeURIComponent(img.filename);
        const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${slug}/${encodedFilename}`;
        execFileSync('curl', [
          '-s', '-S', '-f',
          '-X', 'PUT',
          '-H', `AccessKey: ${BUNNY_API_KEY}`,
          '-H', 'Content-Type: application/octet-stream',
          '--data-binary', `@${join(MOTHS_SOURCE, img.filename)}`,
          url,
        ], { stdio: ['pipe', 'pipe', 'inherit'] });
        uploaded++;
        if (uploaded % 100 === 0) console.log(`[migrate-images] ${uploaded}/${total} uploaded`);
      }
    }

    for (const img of glossaryImages) {
      const encodedFilename = encodeURIComponent(img.filename);
      const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/glossary/${encodedFilename}`;
      execFileSync('curl', [
        '-s', '-S', '-f',
        '-X', 'PUT',
        '-H', `AccessKey: ${BUNNY_API_KEY}`,
        '-H', 'Content-Type: application/octet-stream',
        '--data-binary', `@${join(GLOSSARY_SOURCE, img.filename)}`,
        url,
      ], { stdio: ['pipe', 'pipe', 'inherit'] });
      uploaded++;
    }

    console.log(`[migrate-images] Done: ${uploaded} uploaded`);
  } else {
    console.log('[migrate-images] DRY_RUN=1 — curl commands that would run:');
    for (const [slug, imgs] of slugToImages) {
      for (const img of imgs) {
        console.log(`  curl -X PUT -H "AccessKey: ***" https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${slug}/${img.filename}`);
      }
    }
    if (glossaryImages.length > 0) {
      for (const img of glossaryImages) {
        console.log(`  curl -X PUT -H "AccessKey: ***" https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/glossary/${img.filename}`);
      }
    }
  }

  // --- Step 6: Write images.csv ---
  const COLUMNS = ['species_slug', 'filename', 'photographer', 'weight', 'license', 'view', 'specimen', 'navigational'];

  const outputRows = [];

  // Species images in slug-alphabetical order, then by weight within slug
  const sortedSlugs = Array.from(slugToImages.keys()).sort();
  for (const slug of sortedSlugs) {
    for (const img of slugToImages.get(slug)) {
      outputRows.push({
        species_slug: img.slug,
        filename: img.filename,
        photographer: img.photographer,
        weight: img.weight,
        license: img.license,
        view: img.view,
        specimen: img.specimen,
        navigational: '',
      });
    }
  }

  // Glossary images after species
  for (const img of glossaryImages) {
    outputRows.push({
      species_slug: img.slug,
      filename: img.filename,
      photographer: img.photographer,
      weight: img.weight,
      license: img.license,
      view: img.view,
      specimen: img.specimen,
      navigational: '',
    });
  }

  const csvOut = stringify(outputRows, { header: true, columns: COLUMNS });
  await writeFile('data/images.csv', csvOut);
  console.log(`[migrate-images] Wrote ${outputRows.length} rows to data/images.csv`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
