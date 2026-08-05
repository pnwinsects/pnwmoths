/**
 * scripts/migrate-renamed-species-photos.ts
 *
 * One-off migration for #266: copy every CDN object belonging to the eight
 * species renamed in #221 onto its new `species_slug` folder.
 *
 * `species_slug` is the CDN folder key, so a rename in `data/species.csv` leaves
 * `data/images.csv` and `data/image-derivatives.csv` pointing at paths that do
 * not exist in the storage zone. The repo is consistent; the CDN is not, and the
 * eight species' images 404 in production the moment #221 deploys. `build:site`
 * does not catch it — `check-derivatives.ts` reads the manifest, not the CDN.
 *
 * ONLY THE FOLDER CHANGES. Filenames are historical specimen labels and are
 * deliberately untouched: `protorthodes-rufula`'s photos are named
 * `Protorthodes perforata-*`, `furcula-furcula`'s are `Furcula occidentalis-*`.
 * Rewriting them would invent provenance rather than correct it. So the copy is
 *   protorthodes-rufula/Protorthodes perforata-A-D.jpg
 *   -> trichopolia-rufula/Protorthodes perforata-A-D.jpg
 *
 * FOUR PREFIXES, NOT ONE. #266 sized this job at 120 objects by counting the rows
 * in `data/cdn-retired-images.csv`, which enumerate the originals and the
 * pre-generated derivative *variants*. It does not enumerate the DeepZoom tile
 * pyramids under `species-tiles/<slug>/<view>_files/`, which are 1,586 of the
 * 1,730 objects actually involved. Those are walked recursively here. A migration
 * driven off the retirement CSV alone would silently leave every high-res viewer
 * broken — the pyramid is the thing OpenSeadragon fetches.
 *
 * The rename pairs are hard-coded rather than derived from
 * `data/cdn-retired-images.csv`, deliberately. That file also records retirements
 * that are NOT pure folder renames — `clostera-brucei` -> `clostera-multnoma` moved
 * only the A and B specimens, C stayed put (#156) — and a prefix walk driven off it
 * would copy objects that a human decided should not move.
 *
 * Additive and idempotent: an object already present at the target is skipped, and
 * the old objects are never deleted or modified. Retirement is recorded in
 * `data/cdn-retired-images.csv`, per ADR 0008 — the zone is shared with the photo
 * originals, so nothing here may ever grow a syncing delete.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/migrate-renamed-species-photos.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-renamed-species-photos.ts
 */
import { pathToFileURL } from 'node:url';

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

/** Parallel copies in flight. Modest on purpose — this is someone else's storage API. */
const CONCURRENCY = 8;

const TAG = '[migrate-renamed-species-photos]';

// ---------------------------------------------------------------------------
// The renames — #221, curator-confirmed on #218 and #259
// ---------------------------------------------------------------------------

export const RENAMES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'protorthodes-rufula', to: 'trichopolia-rufula' },
  { from: 'protorthodes-eureka', to: 'trichopolia-eureka' },
  { from: 'protorthodes-alfkenii', to: 'trichopolia-alfkenii' },
  { from: 'protorthodes-curtica', to: 'trichopolia-curtica' },
  { from: 'protorthodes-incincta', to: 'trichopolia-incincta' },
  { from: 'protorthodes-oviduca', to: 'trichopolia-oviduca' },
  { from: 'furcula-furcula', to: 'furcula-gigans' },
  { from: 'sympistis-chionanti', to: 'sympistis-chionanthi' },
];

/**
 * The four places a species' image objects live in the zone.
 *
 * `%s` is the slug. Kept as a list rather than a single walk of the zone root
 * because the zone also holds the built site, the key images and the analytics —
 * a rename must touch image folders only.
 */
export const SLUG_PREFIXES: ReadonlyArray<(slug: string) => string> = [
  slug => `${slug}/`,
  slug => `derived/${slug}/`,
  slug => `species-tiles/${slug}/`,
  slug => `derived/species-tiles/${slug}/`,
];

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Storage-zone URL for a key. Each path segment is encoded; the separators are not. */
export function storageUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${encoded}`;
}

/**
 * Rewrite a source key onto the destination slug.
 *
 * Only the first occurrence of the slug as a whole path segment is replaced, so a
 * filename that happens to contain the slug text survives untouched — which is the
 * entire point of this migration ("only the folder changes").
 */
export function retargetKey(key: string, from: string, to: string): string {
  const segments = key.split('/');
  const i = segments.indexOf(from);
  if (i === -1) return key;
  segments[i] = to;
  return segments.join('/');
}

/** Redact the storage password from anything on its way to a log. */
export function redact(msg: string): string {
  return BUNNY_STORAGE_PASSWORD
    ? msg.split(BUNNY_STORAGE_PASSWORD).join('[REDACTED]')
    : msg;
}

// ---------------------------------------------------------------------------
// Storage API
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
  const res = await fetch(storageUrl(dir), { headers: { AccessKey: BUNNY_STORAGE_PASSWORD } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`list ${dir}: ${res.status} ${res.statusText}`);
  return (await res.json()) as BunnyEntry[];
}

/** Every object key under a prefix, recursing into subdirectories (the tile pyramids). */
async function walk(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  for (const entry of await withRetry(() => listDir(prefix), `list ${prefix}`)) {
    if (entry.IsDirectory) {
      keys.push(...await walk(`${prefix}${entry.ObjectName}/`));
    } else {
      keys.push(`${prefix}${entry.ObjectName}`);
    }
  }
  return keys;
}

/**
 * Every object key that already exists under the destination prefixes.
 *
 * Deliberately a directory walk rather than a per-object probe. Bunny's storage
 * API answers **401** to a HEAD on an object — not 404, not 200 — so the obvious
 * `HEAD -> res.ok` test silently reports every target as absent, and the migration
 * re-copies its whole plan on every run. Verified: HEAD 401, GET 200 on the same
 * key. Listing is also one request per directory instead of one per object.
 */
async function existingTargets(slug: string): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const prefix of SLUG_PREFIXES) {
    for (const key of await walk(prefix(slug))) keys.add(key);
  }
  return keys;
}

async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const get = await fetch(storageUrl(fromKey), { headers: { AccessKey: BUNNY_STORAGE_PASSWORD } });
  if (!get.ok) throw new Error(`download ${fromKey}: ${get.status} ${get.statusText}`);
  const body = new Uint8Array(await get.arrayBuffer());

  const put = await fetch(storageUrl(toKey), {
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
    // Unlike the #156 precedent, even the READ side needs the key here: the work
    // list comes from a directory listing, which the public pull zone cannot serve.
    console.error(`${TAG} BUNNY_STORAGE_PASSWORD required (bunny.net → pnwmoths zone → FTP & API Access → Password).`);
    console.error(`${TAG} It is needed even for DRY_RUN=1, because the work list is a storage-API directory listing.`);
    process.exit(1);
  }

  console.log(`${TAG} ${RENAMES.length} rename(s), ${SLUG_PREFIXES.length} prefixes each${DRY_RUN ? ' — DRY RUN' : ''}`);

  const plan: Array<{ from: string; to: string }> = [];
  const stats = { copied: 0, skipped: 0, failed: 0 };

  for (const { from, to } of RENAMES) {
    const already = await existingTargets(to);
    let found = 0;
    let present = 0;
    for (const prefix of SLUG_PREFIXES) {
      for (const key of await walk(prefix(from))) {
        found++;
        const target = retargetKey(key, from, to);
        if (already.has(target)) {
          present++;
          stats.skipped++;
          continue;
        }
        plan.push({ from: key, to: target });
      }
    }
    console.log(`${TAG} ${from} -> ${to}: ${found} object(s), ${present} already present`);
  }

  console.log(`${TAG} ${plan.length} object(s) to copy, ${stats.skipped} already present`);

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

  if (stats.failed > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(redact((err as Error).message));
    process.exit(1);
  });
}
