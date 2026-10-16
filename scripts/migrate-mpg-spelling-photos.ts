/**
 * scripts/migrate-mpg-spelling-photos.ts
 *
 * One-off migration for #369: copy every CDN object belonging to the six species
 * the curator agreed to rename to MPG's spelling (curation log C-039) onto the
 * folder of the new `species_slug`.
 *
 * `species_slug` is the CDN folder key, so renaming a species in `data/species.csv`
 * leaves nothing at the path `data/images.csv` and `data/image-derivatives.csv` now
 * name. The repo is consistent; the CDN is not, and the six species' photographs
 * 404 on the live site once this deploys. `build:site` does not catch it, because
 * `check-derivatives.ts` reads the manifest, not the CDN.
 *
 * ONLY THE FOLDER CHANGES. Filenames are historical specimen labels and are never
 * rewritten (ADR 0038): `heliothodes-diminutiva`'s photographs stay named
 * `Heliothodes diminutivus-A-D.jpg`.
 *
 * The work list is a prefix walk, not a table, for two reasons. The DeepZoom tile
 * pyramids under `species-tiles/<slug>/<view>_files/` are not enumerated anywhere
 * in the repo, so a list built from `data/cdn-retired-images.csv` would leave the
 * high-resolution viewer broken. And a pure folder rename has no per-object
 * decisions in it. `retargetSlugSegment` rewrites only a whole path segment.
 * The objects the repo tracks are checked against `data/cdn-retired-images.csv`
 * in the unit test.
 *
 * Additive and idempotent (size-checked skip, never deletes — ADR 0008). A target
 * that already exists at a different size is reported as a CONFLICT and left alone,
 * because it may be a different object rather than an aborted copy; once checked by
 * hand, REPAIR_MISMATCHED=1 overwrites it. Retirement of the old objects is recorded
 * in `data/cdn-retired-images.csv`.
 *
 * Usage:
 *   DRY_RUN=1 BUNNY_STORAGE_PASSWORD=... node scripts/migrate-mpg-spelling-photos.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-mpg-spelling-photos.ts
 *
 * The password is needed even for DRY_RUN=1 — the work list is a storage-API
 * directory listing.
 */
import { pathToFileURL } from 'node:url';
import { createBunnyStorage, pooled, retargetSlugSegment } from './lib/bunny-storage.ts';

const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
/** Opt-in: overwrite a target whose size differs from its source (an aborted copy, once checked by hand). */
const REPAIR_MISMATCHED: boolean = process.env['REPAIR_MISMATCHED'] === '1';
const TAG = '[migrate-mpg-spelling-photos]';

/** The six renames ruled in C-039 (#369). */
export const RENAMES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'macaria-notata', to: 'macaria-ulsterata' },
  { from: 'malacosoma-californicum', to: 'malacosoma-californica' },
  { from: 'malacosoma-constrictum', to: 'malacosoma-constricta' },
  { from: 'heliothodes-diminutivus', to: 'heliothodes-diminutiva' },
  { from: 'manduca-quinquemaculata', to: 'manduca-quinquemaculatus' },
  { from: 'paonias-excaecatus', to: 'paonias-excaecata' },
];

/**
 * The four places a species' image objects live in the zone. The zone also holds
 * the built site, the key images and the analytics, so a rename walks these
 * prefixes only.
 */
export const SLUG_PREFIXES: ReadonlyArray<(slug: string) => string> = [
  slug => `${slug}/`,
  slug => `derived/${slug}/`,
  slug => `species-tiles/${slug}/`,
  slug => `derived/species-tiles/${slug}/`,
];

/** Rewrite a source key onto the new slug, whichever of the six renames it belongs to. */
export function retarget(key: string): string {
  for (const { from, to } of RENAMES) {
    const out = retargetSlugSegment(key, from, to);
    if (out !== key) return out;
  }
  return key;
}

async function main(): Promise<void> {
  const password = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
  if (!password) {
    console.error(`${TAG} BUNNY_STORAGE_PASSWORD required (bunny.net → pnwmoths zone → FTP & API Access → Password).`);
    console.error(`${TAG} It is needed even for DRY_RUN=1, because the work list is a storage-API directory listing.`);
    process.exit(1);
  }
  const storage = createBunnyStorage({
    host: process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com',
    zone: process.env['BUNNY_ZONE'] ?? 'pnwmoths',
    password,
    tag: TAG,
  });

  const sources = new Map<string, number>();
  const already = new Map<string, number>();
  const empty: string[] = [];
  for (const { from, to } of RENAMES) {
    let found = 0;
    for (const prefix of SLUG_PREFIXES) {
      for (const [k, v] of await storage.walk(prefix(from))) { sources.set(k, v); found++; }
      for (const [k, v] of await storage.walk(prefix(to))) { already.set(k, v); found++; }
    }
    // Every renamed species has photographs, so one with nothing at either name is a typo or a wrong zone.
    if (found === 0) empty.push(`${from} -> ${to}`);
  }
  for (const pair of empty) console.error(`${TAG} NO OBJECTS under either name: ${pair}`);

  console.log(`${TAG} ${sources.size} source object(s) across ${RENAMES.length} renamed species${DRY_RUN ? ' — DRY RUN' : ''}`);
  if (sources.size === 0) {
    console.error(`${TAG} nothing to copy — the source prefixes are empty. Has this already run and been cleaned up?`);
    process.exit(1);
  }

  const plan: Array<{ from: string; to: string }> = [];
  const stats = { copied: 0, skipped: 0, failed: 0 };
  const conflicts: string[] = [];

  for (const [key, size] of sources) {
    const target = retarget(key);
    if (target === key) continue;
    const existing = already.get(target);
    if (existing === size) {
      stats.skipped++;
      continue;
    }
    if (existing !== undefined) {
      // A different size is either an aborted copy or a different object that already
      // lives at the new path. Only a person can tell which, so it is reported, not overwritten.
      conflicts.push(target);
      console.log(`${TAG} CONFLICT ${target}: ${existing} bytes present, source is ${size}`);
      if (!REPAIR_MISMATCHED) continue;
    }
    plan.push({ from: key, to: target });
  }

  console.log(
    `${TAG} ${plan.length} object(s) to copy, ${stats.skipped} already present` +
      (conflicts.length > 0 ? `, ${conflicts.length} present at a different size (${REPAIR_MISMATCHED ? 're-copying' : 'left alone — see CONFLICT lines'})` : ''),
  );

  await pooled(plan, 8, async ({ from, to }) => {
    try {
      if (DRY_RUN) {
        stats.copied++;
        console.log(`  would COPY ${from} -> ${to}`);
        return;
      }
      await storage.withRetry(() => storage.copyObject(from, to), `copy ${from}`);
      stats.copied++;
      if (stats.copied % 100 === 0) console.log(`${TAG} ${stats.copied} copied…`);
    } catch (err) {
      stats.failed++;
      console.error(`${TAG} FAILED ${from} -> ${to}: ${storage.redact((err as Error).message)}`);
    }
  });

  console.log('');
  console.log(`${TAG} summary:`);
  console.log(`  ${DRY_RUN ? 'would copy' : 'copied'}: ${stats.copied}`);
  console.log(`  skipped (already present): ${stats.skipped}`);
  console.log(`  conflicts: ${conflicts.length}`);
  console.log(`  failed: ${stats.failed}`);
  if (empty.length > 0) console.log(`  species with no objects at either name: ${empty.length}`);
  if (stats.failed > 0 || empty.length > 0 || (conflicts.length > 0 && !REPAIR_MISMATCHED)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    const pw = process.env['BUNNY_STORAGE_PASSWORD'];
    const msg = (err as Error).message ?? String(err);
    console.error(pw ? msg.split(pw).join('[REDACTED]') : msg);
    process.exit(1);
  });
}
