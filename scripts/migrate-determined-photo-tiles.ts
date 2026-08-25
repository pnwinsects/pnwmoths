/**
 * scripts/migrate-determined-photo-tiles.ts
 *
 * One-off migration for #330 / #336: move every deep-zoom tile set onto the
 * species its photograph actually depicts.
 *
 * The tiles were keyed by the manifest's `species_slug`, which came from the
 * TIFF's filename; `data/photo-determinations.csv` now records what each of
 * those photographs really is. `generate-species-photos.ts` already applies the
 * determinations, so `data/species-photos.json` points at the *new* tile paths —
 * this script is what puts objects there. Until it runs, eleven accounts request
 * tiles that do not exist yet.
 *
 * WHAT MOVES. For one photograph the tile set is four kinds of object:
 *   species-tiles/<slug>/<spec>-<view>.dzi              the descriptor
 *   species-tiles/<slug>/<spec>-<view>_files/**         the pyramid (~200 objects)
 *   species-tiles/<slug>/<spec>-<view>_thumbnail.webp   the account thumbnail
 *   derived/species-tiles/<slug>/<spec>-<view>_thumbnail@*  its pre-generated variants
 * Miss the pyramid and the viewer opens to a blank canvas with every other check
 * still green — the lesson migrate-renamed-species-photos.ts paid for.
 *
 * BOTH THE FOLDER AND THE SPECIMEN LETTER CHANGE, which is what makes this
 * different from every earlier photo migration here. A redetermined photograph
 * often lands on a species that already uses its letter, and C-026 settles that
 * by giving the incoming photograph the next free one. So the retarget is
 * `<oldSlug>/<oldSpec>-<view>` -> `<newSlug>/<newSpec>-<view>`, both parts read
 * from the determination.
 *
 * MNIOTYPE IS A SWAP, NOT A MOVE. `mniotype-ducta/A-*` and `mniotype-tenera/A-*`
 * are each other's destinations ("filenames with ducta are actually tenera and
 * vice versa"). Copying them in sequence destroys both: the first write
 * overwrites the second's source, and the second copy then duplicates the moth
 * that just landed. Any key that is both a source and a target is therefore
 * buffered in memory before a single byte is written. BUFFER_LIMIT_BYTES caps
 * that so a future migration with a large cycle fails loudly instead of
 * swapping to death.
 *
 * Additive, per ADR 0008: nothing is deleted, and the vacated paths are recorded
 * in `data/cdn-retired-images.csv` rather than removed.
 *
 * Idempotent, including for the swap. Two mechanisms, because one is not enough:
 * an object already present at full length is skipped, which covers the moves
 * that write to a path that did not exist; and `data/cdn-retired-images.csv` is
 * read as a LEDGER of moves already carried out, which is the only thing that
 * can settle a swap. A swap's two sides exist at the same byte lengths before
 * and after, so length tells you nothing about which way round the zone is — but
 * the retirement row says which direction was applied. CONFIRM_SWAP=1 remains as
 * a backstop for a cycle that is genuinely un-ledgered.
 *
 * PURGE AFTER A SWAP. Ten of the eleven re-keys write to a path that did not
 * exist, so ADR 0009's "no manual purge" holds. The Mniotype swap does not: it
 * overwrites live paths, and tiles carry `cache-control: max-age=25600000`
 * (~296 days), so the edge keeps serving the old moth while the origin is
 * already right. Verify against the storage API rather than the pull zone — the
 * pull zone will lie to you — and then purge the overwritten prefixes:
 *
 *   curl -X POST -H "AccessKey: $BUNNY_ACCOUNT_API_KEY" -G \
 *     --data-urlencode 'url=https://moths.pnwinsects.org/species-tiles/mniotype-ducta/*' \
 *     --data async=false https://api.bunny.net/purge
 *
 * Usage:
 *   BUNNY_STORAGE_PASSWORD=... DRY_RUN=1 node scripts/migrate-determined-photo-tiles.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-determined-photo-tiles.ts
 *
 * The key is required even for DRY_RUN: the work list is a storage-API directory
 * listing, which the public pull zone cannot serve.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { readPhotoDeterminations, identityFromFilename } from './lib/photo-determinations.ts';

const BUNNY_STORAGE_HOST: string = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE: string = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const BUNNY_STORAGE_PASSWORD: string = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

const TAG = '[migrate-determined-photo-tiles]';
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 60_000;

/** Ceiling on the swap buffer. The #330 cycle is 4 tile sets, ~12 MB. */
const BUFFER_LIMIT_BYTES = 512 * 1024 * 1024;

/**
 * Where a photograph's tiles were built, read from its filename.
 *
 * Derived from the filename rather than the manifest's current `species_slug`:
 * the manifest has already been re-filed by the determinations at materialize
 * time, so its slug is the *destination*. The filename is what the tiles were
 * keyed by and the one thing that never changed.
 *
 * Delegates to the shared reader so this and the gate cannot disagree — a
 * private regex here was blind to the space-separated names ingest admits, and
 * would have dropped their moves silently.
 */
export function sourcePathParts(
  stem: string,
): { slug: string; specimen: string; view: string } | null {
  return identityFromFilename(stem);
}

/**
 * Moves already carried out, from `data/cdn-retired-images.csv`.
 *
 * THE LEDGER THAT MAKES A SWAP IDEMPOTENT. Every other move writes to a path
 * that did not exist, so "already there at the right length" means done. A swap
 * has no such tell — both sides exist at the same lengths before and after — so
 * without a record, a re-run reads the already-swapped source and puts it back.
 *
 * The retirement CSV is that record: applying a move writes a row retiring
 * `<from>_thumbnail.webp` in favour of `<to>_thumbnail.webp`. It is committed,
 * it is written for every move anyway, and it says *which direction* the zone
 * was left in — which is exactly the fact a length comparison cannot recover.
 */
export function appliedMoves(path: string = resolve('data/cdn-retired-images.csv')): Set<string> {
  if (!existsSync(path)) return new Set();
  const rows = parse(readFileSync(path), { columns: true, skip_empty_lines: true }) as {
    old_path?: string;
    superseded_by?: string;
  }[];
  const applied = new Set<string>();
  for (const row of rows) {
    const from = (row.old_path ?? '').trim();
    const to = (row.superseded_by ?? '').trim();
    if (!from.endsWith('_thumbnail.webp') || !to.endsWith('_thumbnail.webp')) continue;
    applied.add(`${from.replace(/_thumbnail\.webp$/, '')} -> ${to.replace(/_thumbnail\.webp$/, '')}`);
  }
  return applied;
}

export interface TileMove {
  readonly fromPrefixKey: string; // species-tiles/<slug>/<spec>-<view>
  readonly toPrefixKey: string;
  readonly stem: string;
  readonly source: string;
}

/** The tile sets a determination implies, source and destination. */
export function planMoves(
  determinations: ReturnType<typeof readPhotoDeterminations>,
  applied: ReadonlySet<string> = new Set(),
): TileMove[] {
  const moves: TileMove[] = [];
  for (const [stem, ruling] of determinations) {
    const from = sourcePathParts(stem);
    if (!from) {
      // Never `continue`. A determination whose stem will not parse produces no
      // move here, while generate-species-photos.ts — which looks the stem up
      // directly and needs no parse — happily re-files species-photos.json to a
      // tile path this script then never creates. The page would ask for tiles
      // that do not exist and the viewer would open blank, with nothing logged.
      throw new Error(
        `cannot read a specimen and view from "${stem}" (${ruling.source}), so its tiles cannot be located. ` +
          `data/species-photos.json WILL be re-filed for it, leaving the account pointing at tiles that do not exist. ` +
          `Fix the photo_stem in data/photo-determinations.csv, or move this photograph by hand and record it in data/cdn-retired-images.csv.`,
      );
    }
    const fromPrefixKey = `species-tiles/${from.slug}/${from.specimen}-${from.view}`;
    const toPrefixKey = `species-tiles/${ruling.species_slug}/${ruling.specimen}-${from.view}`;
    if (fromPrefixKey === toPrefixKey) continue; // determination confirms where it already sits
    if (applied.has(`${fromPrefixKey} -> ${toPrefixKey}`)) continue; // done in an earlier run
    moves.push({ fromPrefixKey, toPrefixKey, stem, source: ruling.source });
  }
  return moves;
}

/**
 * Rewrite one object key from a tile-set prefix onto its destination prefix.
 *
 * Prefix substitution rather than segment substitution: the specimen letter is
 * part of a filename (`A-D.dzi`, `A-D_files/`, `A-D_thumbnail.webp`), not its
 * own path segment, so `retargetKey`-style segment swapping cannot express it.
 */
export function retarget(key: string, fromPrefixKey: string, toPrefixKey: string): string {
  for (const base of ['', 'derived/']) {
    const from = `${base}${fromPrefixKey}`;
    if (key.startsWith(from)) return `${base}${toPrefixKey}${key.slice(from.length)}`;
  }
  return key;
}

/**
 * The tile set an object belongs to: `species-tiles/<slug>/<spec>-<view>`.
 *
 * Trims the `derived/` prefix and everything the leaf accretes — `.dzi`,
 * `_files/12/3_4.webp`, `_thumbnail@530.webp` — so ~230 objects collapse to the
 * one name a human recognises.
 */
export function tileSetPrefixOf(key: string): string {
  const [bucket, slug, leaf] = key.replace(/^derived\//, '').split('/');
  const stem = (leaf ?? '').replace(/(\.[^.]*|_files|_thumbnail.*)$/, '');
  return `${bucket}/${slug}/${stem}`;
}

export function storageUrl(key: string): string {
  return `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export function redact(msg: string): string {
  return BUNNY_STORAGE_PASSWORD ? msg.split(BUNNY_STORAGE_PASSWORD).join('[REDACTED]') : msg;
}

interface BunnyEntry {
  ObjectName: string;
  IsDirectory: boolean;
  Length: number;
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

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
  const res = await fetchWithTimeout(storageUrl(dir), {
    headers: { AccessKey: BUNNY_STORAGE_PASSWORD },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`list ${dir}: ${res.status} ${res.statusText}`);
  return (await res.json()) as BunnyEntry[];
}

/**
 * Every object under a prefix, with its length.
 *
 * A directory walk, never a per-object HEAD: Bunny's storage API answers 401 to
 * a HEAD on an object, so `HEAD -> res.ok` reports every key as absent and the
 * migration re-copies its whole plan on every run (verified, and documented the
 * same way in migrate-renamed-species-photos.ts).
 */
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

/** Everything belonging to one tile set: the pyramid, the descriptor, the thumbnails. */
async function tileSetObjects(prefixKey: string): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  const [, slug] = prefixKey.split('/');
  const leaf = prefixKey.split('/')[2]!;
  for (const dir of [`species-tiles/${slug}/`, `derived/species-tiles/${slug}/`]) {
    for (const [key, size] of await walk(dir)) {
      // `A-D` must not match `A-D2`; the only legal continuations are the
      // extension, the pyramid directory, and the thumbnail suffix.
      const rest = key.slice(key.indexOf(leaf) + leaf.length);
      if (!key.includes(`/${leaf}`)) continue;
      if (rest.startsWith('.') || rest.startsWith('_files/') || rest.startsWith('_thumbnail')) {
        found.set(key, size);
      }
    }
  }
  return found;
}

async function getObject(key: string): Promise<{ body: Uint8Array; contentType: string }> {
  const res = await fetchWithTimeout(storageUrl(key), {
    headers: { AccessKey: BUNNY_STORAGE_PASSWORD },
  });
  if (!res.ok) throw new Error(`download ${key}: ${res.status} ${res.statusText}`);
  return {
    body: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  };
}

async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const res = await fetchWithTimeout(storageUrl(key), {
    method: 'PUT',
    headers: { AccessKey: BUNNY_STORAGE_PASSWORD, 'Content-Type': contentType },
    body,
  });
  if (!res.ok) throw new Error(`upload ${key}: ${res.status} ${res.statusText}`);
}

async function pooled<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

async function main(): Promise<void> {
  if (!BUNNY_STORAGE_PASSWORD) {
    console.error(`${TAG} BUNNY_STORAGE_PASSWORD required (bunny.net -> pnwmoths zone -> FTP & API Access -> Password).`);
    console.error(`${TAG} Needed even for DRY_RUN=1: the work list is a storage-API directory listing.`);
    process.exit(1);
  }

  const moves = planMoves(readPhotoDeterminations(), appliedMoves());
  console.log(`${TAG} ${moves.length} tile sets to re-key`);

  // --- build the full copy plan before writing anything ---------------------
  const plan: { from: string; to: string; size: number }[] = [];
  const targetsPresent = new Map<string, number>();
  for (const move of moves) {
    const objects = await tileSetObjects(move.fromPrefixKey);
    if (objects.size === 0) {
      console.log(`${TAG}   ${move.fromPrefixKey} -> ${move.toPrefixKey}: no objects (never tiled) — skipping`);
      continue;
    }
    for (const [, size] of await tileSetObjects(move.toPrefixKey)) void size;
    for (const [key, size] of objects) {
      plan.push({ from: key, to: retarget(key, move.fromPrefixKey, move.toPrefixKey), size });
    }
    console.log(`${TAG}   ${move.fromPrefixKey} -> ${move.toPrefixKey}: ${objects.size} objects (${move.source})`);
  }

  // --- already done? (length-compare, so a truncated PUT self-heals) --------
  const destPrefixes = new Set(plan.map(p => p.to.split('/').slice(0, -1).join('/') + '/'));
  for (const prefix of destPrefixes) {
    for (const [key, size] of await walk(prefix)) targetsPresent.set(key, size);
  }
  // "Already present at the right length" means done — EXCEPT where the
  // destination is also somebody's source. In a swap both sides are tiles of
  // similar moths at identical dimensions, so equal byte length is entirely
  // possible while the content is the *other* species; trusting the length
  // there would skip the copy and leave the swap half-applied, which is exactly
  // the bug being fixed. Those pairs are always copied.
  const sourceKeys = new Set(plan.map(p => p.from));
  const todo = plan.filter(p => sourceKeys.has(p.to) || targetsPresent.get(p.to) !== p.size);
  console.log(`${TAG} ${plan.length} objects in plan; ${plan.length - todo.length} already present; ${todo.length} to copy`);

  // --- the swap: any key that is both a source and a target must be buffered -
  const targetKeys = new Set(todo.map(p => p.to));
  const cyclic = todo.filter(p => targetKeys.has(p.from));
  const cyclicBytes = cyclic.reduce((n, p) => n + p.size, 0);
  if (cyclic.length > 0) {
    if (cyclicBytes > BUFFER_LIMIT_BYTES) {
      throw new Error(
        `${cyclic.length} objects are both a source and a destination (${(cyclicBytes / 1e6).toFixed(1)} MB), ` +
          `over the ${(BUFFER_LIMIT_BYTES / 1e6).toFixed(0)} MB buffer limit. Split the migration rather than raising it.`,
      );
    }

    // A SWAP IS ONE-SHOT, AND THE SCRIPT CANNOT TELL WHETHER IT HAS RUN.
    //
    // Every other move here is idempotent: the destination is a path that did
    // not exist, so "already there at the right length" means done. A swap has
    // no such tell. Both sides exist before and after, at the same lengths,
    // because they are tiles of two similar moths at identical dimensions — and
    // re-running reads the already-swapped source and puts it back, silently
    // reverting the fix in production.
    //
    // So refuse, and make a human assert it. Verify which way round the zone
    // currently is by comparing a tile against the catalogued photograph rather
    // than by trusting a length:
    //
    //   curl -so t.webp https://moths.pnwinsects.org/species-tiles/mniotype-ducta/A-D_files/8/0_0.webp
    //   magick compare -metric RMSE t.webp <the JPEG images.csv files under mniotype-ducta> null:
    //
    // ~0.01–0.03 is the same photograph re-encoded; ~0.1 is a different moth.
    // Fetch from the storage API, not the pull zone: tiles carry
    // max-age=25600000 and the edge will show you the pre-migration bytes.
    if (process.env['CONFIRM_SWAP'] !== '1') {
      console.error(`${TAG} ${cyclic.length} objects form a swap (${(cyclicBytes / 1e6).toFixed(1)} MB):`);
      // Derived from the cyclic OBJECTS, not from `moves`: a move whose source
      // tile set does not exist contributes no objects and is not part of any
      // cycle, but its prefix can still appear as another move's destination.
      // Listing those would name innocent species in a warning about a swap.
      const cyclicPairs = new Set(
        cyclic.map(p => [p.from, p.to].map(tileSetPrefixOf).sort().join(' <-> ')),
      );
      for (const pair of [...cyclicPairs].sort()) console.error(`${TAG}   ${pair}`);
      console.error(`${TAG} A swap cannot be detected as already-applied — re-running REVERTS it.`);
      console.error(`${TAG} Verify the zone's current state first (see the comment at this check), then:`);
      console.error(`${TAG}   CONFIRM_SWAP=1 node scripts/migrate-determined-photo-tiles.ts`);
      process.exit(1);
    }
    console.log(`${TAG} ${cyclic.length} objects form a swap (${(cyclicBytes / 1e6).toFixed(1)} MB) — buffering before any write`);
  }

  if (DRY_RUN) {
    console.log(`${TAG} DRY_RUN=1 — nothing written. First 10 of ${todo.length}:`);
    for (const p of todo.slice(0, 10)) console.log(`    ${p.from}\n      -> ${p.to}`);
    return;
  }

  const buffered = new Map<string, { body: Uint8Array; contentType: string }>();
  await pooled(cyclic, CONCURRENCY, async p => {
    buffered.set(p.from, await withRetry(() => getObject(p.from), `buffer ${p.from}`));
  });

  let done = 0;
  await pooled(todo, CONCURRENCY, async p => {
    const obj = buffered.get(p.from) ?? (await withRetry(() => getObject(p.from), `download ${p.from}`));
    await withRetry(() => putObject(p.to, obj.body, obj.contentType), `upload ${p.to}`);
    done++;
    if (done % 100 === 0) console.log(`${TAG}   ${done}/${todo.length}`);
  });

  console.log(`${TAG} copied ${done} objects. Old paths left in place; record them in data/cdn-retired-images.csv.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(`${TAG} ${redact((err as Error).message)}`);
    process.exit(1);
  });
}
