/**
 * scripts/migrate-merged-species-photos.ts
 *
 * One-off migration for #265: copy the CDN objects of the five merged species
 * onto their surviving species' folders, under their newly assigned specimen
 * letters.
 *
 * Unlike the #266 folder renames (migrate-renamed-species-photos.ts), a merge
 * moves photos into a folder that already has occupants, so the specimen letter
 * changes too — `speranza-andersoni`'s specimen A becomes `speranza-occiduaria`'s
 * specimen B, because the survivor already has an A. The letter is a site-assigned
 * catalog key and is rewritten wherever it appears (filename suffix, tile paths);
 * the *binomial* in a legacy filename is a historical specimen label and is
 * deliberately untouched, per the #266 precedent — the copy is
 *   speranza-andersoni/Speranza andersoni-A-D.jpg
 *   -> speranza-occiduaria/Speranza andersoni-B-D.jpg
 *
 * Two kinds of work, matching how the objects are enumerable:
 *
 * - FILE_COPIES — the repo-tracked objects (originals in data/images.csv, legacy
 *   derivatives in data/image-derivatives.csv), as explicit pairs. Hard-coded
 *   rather than derived from data/cdn-retired-images.csv for the same reason
 *   #266 hard-codes its renames: that file also records moves that are not this
 *   migration's business. The pairs mirror the #265 rows added to it, and the
 *   unit test asserts the two stay consistent.
 *
 * - TILE_TREES — `speranza-andersoni`'s DeepZoom pyramids (the only merged
 *   species with high-res tiles). The pyramid under `<view>_files/` is not
 *   enumerated anywhere in the repo, so it is walked recursively from the
 *   storage API, and every found key is rewritten by retargetMergedTileKey
 *   (slug segment swapped, `A-` letter prefix of the following segment
 *   rewritten to `B-`). This also re-copies the thumbnails and .dzi
 *   descriptors, which overlap FILE_COPIES / already-present targets — the
 *   size-checked skip makes that harmless.
 *
 * Additive and idempotent: an object already present at the target with the
 * source's size is skipped, and the old objects are never deleted or modified
 * (ADR 0008 — the zone is shared with the photo originals; nothing here may
 * ever grow a syncing delete). Retirement is recorded in
 * data/cdn-retired-images.csv.
 *
 * Usage:
 *   DRY_RUN=1 BUNNY_STORAGE_PASSWORD=... node scripts/migrate-merged-species-photos.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-merged-species-photos.ts
 *
 * The password is needed even for DRY_RUN=1, because the pyramid work list is a
 * storage-API directory listing the public pull zone cannot serve.
 */
import { pathToFileURL } from 'node:url';

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

/** Parallel copies in flight. Modest on purpose — this is someone else's storage API. */
const CONCURRENCY = 8;

/** Per-request ceiling; `fetch` has no default timeout (see migrate-renamed-species-photos.ts). */
const REQUEST_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

const TAG = '[migrate-merged-species-photos]';

// ---------------------------------------------------------------------------
// The merges — #265, curator-confirmed
// ---------------------------------------------------------------------------

/**
 * Repo-tracked objects: every filename in data/images.csv and every legacy
 * derivative in data/image-derivatives.csv belonging to a merged species, paired
 * with its post-merge key. Mirrors the #265 rows in data/cdn-retired-images.csv.
 */
export const FILE_COPIES: ReadonlyArray<{ from: string; to: string }> = [
  // speranza-andersoni -> speranza-occiduaria, specimen A -> B
  { from: 'speranza-andersoni/Speranza andersoni-A-D.jpg', to: 'speranza-occiduaria/Speranza andersoni-B-D.jpg' },
  { from: 'speranza-andersoni/Speranza andersoni-A-V.jpg', to: 'speranza-occiduaria/Speranza andersoni-B-V.jpg' },
  { from: 'derived/speranza-andersoni/Speranza andersoni-A-D@320h.webp', to: 'derived/speranza-occiduaria/Speranza andersoni-B-D@320h.webp' },
  { from: 'derived/speranza-andersoni/Speranza andersoni-A-D@full.webp', to: 'derived/speranza-occiduaria/Speranza andersoni-B-D@full.webp' },
  { from: 'derived/speranza-andersoni/Speranza andersoni-A-V@320h.webp', to: 'derived/speranza-occiduaria/Speranza andersoni-B-V@320h.webp' },
  { from: 'derived/speranza-andersoni/Speranza andersoni-A-V@full.webp', to: 'derived/speranza-occiduaria/Speranza andersoni-B-V@full.webp' },
  // macaria-unipunctaria -> macaria-signaria, specimens B -> C and A -> D
  // (the survivor's own filenames already use A and B; original display order kept)
  { from: 'macaria-unipunctaria/Macaria unipunctaria - B-D.jpg', to: 'macaria-signaria/Macaria unipunctaria - C-D.jpg' },
  { from: 'macaria-unipunctaria/Macaria unipunctaria - B-V.jpg', to: 'macaria-signaria/Macaria unipunctaria - C-V.jpg' },
  { from: 'macaria-unipunctaria/Macaria unipunctaria -A-D.jpg', to: 'macaria-signaria/Macaria unipunctaria -D-D.jpg' },
  { from: 'macaria-unipunctaria/Macaria unipunctaria -A-V.jpg', to: 'macaria-signaria/Macaria unipunctaria -D-V.jpg' },
  // macaria-submarmorata -> macaria-signaria, specimen A -> E
  { from: 'macaria-submarmorata/Macaria submarmorata -A-D.jpg', to: 'macaria-signaria/Macaria submarmorata -E-D.jpg' },
  { from: 'macaria-submarmorata/Macaria submarmorata -A-V.jpg', to: 'macaria-signaria/Macaria submarmorata -E-V.jpg' },
  // phyllodesma-coturnix -> phyllodesma-americana, specimen A -> C
  { from: 'phyllodesma-coturnix/Phyllodesma coturnix-A-D.jpg', to: 'phyllodesma-americana/Phyllodesma coturnix-C-D.jpg' },
  { from: 'phyllodesma-coturnix/Phyllodesma coturnix-A-V.jpg', to: 'phyllodesma-americana/Phyllodesma coturnix-C-V.jpg' },
  { from: 'derived/phyllodesma-coturnix/Phyllodesma coturnix-A-D@320h.webp', to: 'derived/phyllodesma-americana/Phyllodesma coturnix-C-D@320h.webp' },
  { from: 'derived/phyllodesma-coturnix/Phyllodesma coturnix-A-D@full.webp', to: 'derived/phyllodesma-americana/Phyllodesma coturnix-C-D@full.webp' },
  { from: 'derived/phyllodesma-coturnix/Phyllodesma coturnix-A-V@320h.webp', to: 'derived/phyllodesma-americana/Phyllodesma coturnix-C-V@320h.webp' },
  { from: 'derived/phyllodesma-coturnix/Phyllodesma coturnix-A-V@full.webp', to: 'derived/phyllodesma-americana/Phyllodesma coturnix-C-V@full.webp' },
];

/**
 * The high-res tile trees to walk. Only speranza-andersoni carries tiles among
 * the merged species; both its storage prefixes are walked and every key found
 * is rewritten by retargetMergedTileKey.
 */
export const TILE_TREES: ReadonlyArray<string> = [
  'species-tiles/speranza-andersoni/',
  'derived/species-tiles/speranza-andersoni/',
];

export const TILE_FROM_SLUG = 'speranza-andersoni';
export const TILE_TO_SLUG = 'speranza-occiduaria';
export const TILE_FROM_LETTER = 'A-';
export const TILE_TO_LETTER = 'B-';

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Storage-zone URL for a key. Each path segment is encoded; the separators are not. */
export function storageUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${encoded}`;
}

/**
 * Rewrite a speranza-andersoni tile key onto speranza-occiduaria's specimen B.
 *
 * The slug is replaced only as a whole path segment, and the letter prefix only
 * on the segment immediately after it — `A-D.dzi`, `A-D_files/9/1_2.webp` and
 * `A-D_thumbnail@530.webp` all rewrite; a deeper segment or filename that merely
 * starts with `A-` does not. A key not under the slug is returned unchanged.
 */
export function retargetMergedTileKey(key: string): string {
  const segments = key.split('/');
  const i = segments.indexOf(TILE_FROM_SLUG);
  if (i === -1) return key;
  segments[i] = TILE_TO_SLUG;
  const next = segments[i + 1];
  if (next !== undefined && next.startsWith(TILE_FROM_LETTER)) {
    segments[i + 1] = TILE_TO_LETTER + next.slice(TILE_FROM_LETTER.length);
  }
  return segments.join('/');
}

/** Redact the storage password from anything on its way to a log. */
export function redact(msg: string): string {
  return BUNNY_STORAGE_PASSWORD
    ? msg.split(BUNNY_STORAGE_PASSWORD).join('[REDACTED]')
    : msg;
}

// ---------------------------------------------------------------------------
// Storage API (verbatim patterns from migrate-renamed-species-photos.ts)
// ---------------------------------------------------------------------------

interface BunnyEntry {
  ObjectName: string;
  IsDirectory: boolean;
  Length: number;
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** Five-attempt exponential backoff, matching upload-site.ts / upload-images.ts. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safe = redact((err as Error).message ?? String(err));
      if (attempt === delays.length - 1) {
        throw new Error(`${label} failed after ${delays.length} attempts: ${safe}`);
      }
      console.log(`${TAG} transient error on ${label} (${attempt + 1}/${delays.length}) — retrying in ${delays[attempt]! / 1000}s: ${safe}`);
      await sleep(delays[attempt]!);
    }
  }
  throw new Error(`${label}: unreachable`);
}

async function listDir(dir: string): Promise<BunnyEntry[]> {
  const res = await fetchWithTimeout(storageUrl(dir), { headers: { AccessKey: BUNNY_STORAGE_PASSWORD } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`list ${dir}: ${res.status} ${res.statusText}`);
  return (await res.json()) as BunnyEntry[];
}

/** Every object under a prefix with its size, recursing into subdirectories (the tile pyramids). */
async function walk(prefix: string): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  for (const entry of await withRetry(() => listDir(prefix), `list ${prefix}`)) {
    if (entry.IsDirectory) {
      for (const [k, v] of await walk(`${prefix}${entry.ObjectName}/`)) found.set(k, v);
    } else {
      found.set(`${prefix}${entry.ObjectName}`, entry.Length);
    }
  }
  return found;
}

/**
 * Every object already under the destination prefixes, keyed to its size.
 * A directory walk, not per-object HEADs — Bunny's storage API answers 401 to a
 * HEAD; sizes rather than bare keys so a truncated PUT self-heals next run
 * (both hard-won in migrate-renamed-species-photos.ts).
 */
async function existingTargets(prefixes: Iterable<string>): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  for (const prefix of prefixes) {
    for (const [key, size] of await walk(prefix)) found.set(key, size);
  }
  return found;
}

async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const get = await fetchWithTimeout(storageUrl(fromKey), { headers: { AccessKey: BUNNY_STORAGE_PASSWORD } });
  if (!get.ok) throw new Error(`download ${fromKey}: ${get.status} ${get.statusText}`);
  const body = new Uint8Array(await get.arrayBuffer());

  const put = await fetchWithTimeout(storageUrl(toKey), {
    method: 'PUT',
    headers: {
      AccessKey: BUNNY_STORAGE_PASSWORD,
      // The storage API stores what it is given; Bunny serves the stored type.
      'Content-Type': get.headers.get('content-type') ?? 'application/octet-stream',
    },
    body,
  });
  if (!put.ok) throw new Error(`upload ${toKey}: ${put.status} ${put.statusText}`);
}

/** Run tasks with a fixed number in flight, preserving nothing but the count. */
async function pooled<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]!);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!BUNNY_STORAGE_PASSWORD) {
    console.error(`${TAG} BUNNY_STORAGE_PASSWORD required (bunny.net → pnwmoths zone → FTP & API Access → Password).`);
    console.error(`${TAG} It is needed even for DRY_RUN=1, because the tile work list is a storage-API directory listing.`);
    process.exit(1);
  }

  console.log(`${TAG} ${FILE_COPIES.length} tracked object(s) + ${TILE_TREES.length} tile tree(s)${DRY_RUN ? ' — DRY RUN' : ''}`);

  // Destination prefixes: the four survivor folders plus the tile targets.
  const destPrefixes = new Set<string>();
  for (const { to } of FILE_COPIES) destPrefixes.add(`${to.split('/').slice(0, -1).join('/')}/`);
  for (const tree of TILE_TREES) destPrefixes.add(tree.replace(`${TILE_FROM_SLUG}/`, `${TILE_TO_SLUG}/`));
  const already = await existingTargets(destPrefixes);

  const plan: Array<{ from: string; to: string }> = [];
  const stats = { copied: 0, skipped: 0, failed: 0 };
  let truncated = 0;

  const sources = new Map<string, number>();
  for (const tree of TILE_TREES) {
    for (const [k, v] of await walk(tree)) sources.set(k, v);
  }
  for (const { from } of FILE_COPIES) {
    if (!sources.has(from)) {
      // Not under a walked tree — probe its own directory listing once.
      const dir = `${from.split('/').slice(0, -1).join('/')}/`;
      for (const [k, v] of await walk(dir)) if (!sources.has(k)) sources.set(k, v);
    }
  }

  const pairFor = new Map<string, string>(FILE_COPIES.map(({ from, to }) => [from, to]));
  for (const [key, size] of sources) {
    const target = pairFor.get(key) ?? retargetMergedTileKey(key);
    if (target === key) continue; // an unrelated occupant of a probed directory
    const existing = already.get(target);
    if (existing === size) {
      stats.skipped++;
      continue;
    }
    if (existing !== undefined) {
      truncated++;
      console.log(`${TAG} re-copying ${target}: ${existing} bytes present, source is ${size}`);
    }
    plan.push({ from: key, to: target });
  }

  const missing = FILE_COPIES.filter(({ from, to }) => !sources.has(from) && already.get(to) === undefined);
  for (const { from, to } of missing) {
    console.error(`${TAG} MISSING SOURCE ${from} (target ${to} also absent)`);
  }

  console.log(
    `${TAG} ${plan.length} object(s) to copy, ${stats.skipped} already present` +
      (truncated > 0 ? `, ${truncated} present but the wrong size (re-copying)` : ''),
  );

  await pooled(plan, CONCURRENCY, async ({ from, to }) => {
    try {
      if (DRY_RUN) {
        stats.copied++;
        console.log(`  would COPY ${from} -> ${to}`);
        return;
      }
      await withRetry(() => copyObject(from, to), `copy ${from}`);
      stats.copied++;
      if (stats.copied % 100 === 0) console.log(`${TAG} ${stats.copied} copied…`);
    } catch (err) {
      stats.failed++;
      console.error(`${TAG} FAILED ${from} -> ${to}: ${redact((err as Error).message)}`);
    }
  });

  console.log('');
  console.log(`${TAG} summary:`);
  console.log(`  ${DRY_RUN ? 'would copy' : 'copied'}: ${stats.copied}`);
  console.log(`  skipped (already present): ${stats.skipped}`);
  console.log(`  failed: ${stats.failed}`);
  if (missing.length > 0) console.log(`  missing sources: ${missing.length}`);

  if (stats.failed > 0 || missing.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(redact((err as Error).message));
    process.exit(1);
  });
}
