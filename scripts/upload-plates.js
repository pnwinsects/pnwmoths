/**
 * scripts/upload-plates.js
 *
 * One-time upload: reads Zoomify tile directories from local plates/ and uploads
 * to bunny.net Storage Zone via HTTP PUT. Identical pattern to migrate-images.js.
 *
 * Uploads per plate:
 *   plates/{slug}/TileGroup0/{level}-{x}-{y}.jpg  (~164 tiles)
 *   plates/{slug}/ImageProperties.xml
 *   plates/{slug}/thumbnail.jpg
 *
 * Usage:
 *   BUNNY_API_KEY=xxx node scripts/upload-plates.js
 *   DRY_RUN=1 node scripts/upload-plates.js        # dry-run: prints URLs, no upload
 *
 * Resume after failure: re-run the same command. Already-uploaded files listed in
 * .upload-plates-progress are skipped. Delete that file to force a full re-upload.
 *
 * BUNNY_API_KEY: Storage Zone password from bunny.net dashboard -> pnwmoths Storage Zone.
 * Never commit, log, or hardcode the API key.
 */

import { readdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const PROGRESS_FILE = resolve('.upload-plates-progress');

const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const PLATES_LOCAL = resolve('plates');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  if (!existsSync(PLATES_LOCAL)) {
    console.error(`[upload-plates] Local plates/ directory not found: ${PLATES_LOCAL}`);
    process.exit(1);
  }

  if (!DRY_RUN && !BUNNY_API_KEY) {
    console.error('[upload-plates] BUNNY_API_KEY is required for uploads. Set it to your Storage Zone password.');
    process.exit(1);
  }

  // Collect all files recursively under plates/
  const allFiles = await walk(PLATES_LOCAL);
  const total = allFiles.length;
  console.log(`[upload-plates] Found ${total} files to upload`);

  if (DRY_RUN) {
    console.log('[upload-plates] DRY_RUN=1 -- printing first 5 URLs, not uploading');
    for (const f of allFiles.slice(0, 5)) {
      const rel = relative(PLATES_LOCAL, f);
      console.log(`  -> https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/plates/${rel}`);
    }
    console.log('  ...');
    return;
  }

  // Load progress so interrupted uploads can resume
  const done = new Set();
  if (existsSync(PROGRESS_FILE)) {
    const lines = (await readFile(PROGRESS_FILE, 'utf8')).split('\n').filter(Boolean);
    for (const l of lines) done.add(l);
    console.log(`[upload-plates] Resuming — ${done.size} files already uploaded, skipping`);
  } else {
    await writeFile(PROGRESS_FILE, '');
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let uploaded = 0;
  let skipped = 0;
  for (const localPath of allFiles) {
    const rel = relative(PLATES_LOCAL, localPath);  // e.g. "plate-1-drepanidae/TileGroup0/0-0-0.jpg"
    if (done.has(rel)) { skipped++; continue; }
    const cdnPath = `plates/${rel}`;
    const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${cdnPath}`;
    const args = [
      '-s', '-S', '-f',
      '-X', 'PUT',
      '-H', `AccessKey: ${BUNNY_API_KEY}`,
      '-H', 'Content-Type: application/octet-stream',
      '--data-binary', `@${localPath}`,
      url,
    ];
    let attempts = 0;
    while (true) {
      try {
        execFileSync('curl', args, { stdio: ['pipe', 'pipe', 'inherit'] });
        break;
      } catch (err) {
        attempts++;
        if (attempts >= 5) throw err;
        const delay = attempts * 2000;
        console.log(`[upload-plates] transient error on ${rel} (attempt ${attempts}/5) — retrying in ${delay / 1000}s`);
        await sleep(delay);
      }
    }
    await appendFile(PROGRESS_FILE, rel + '\n');
    uploaded++;
    if (uploaded % 100 === 0) console.log(`[upload-plates] ${uploaded + skipped}/${total} (${uploaded} new, ${skipped} skipped)`);
  }

  console.log(`[upload-plates] Done: ${uploaded} uploaded, ${skipped} skipped — ${BUNNY_ZONE}/plates/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
