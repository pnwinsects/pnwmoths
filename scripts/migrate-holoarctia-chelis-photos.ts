/**
 * scripts/migrate-holoarctia-chelis-photos.ts
 *
 * One-off migration for #278: move the two `Holoarctia` sp. photographs — and
 * their four derivative variants — onto the `chelis-sp` folder the curator's
 * ruling gives them (curation log C-031).
 *
 * `species_slug` is the CDN folder key, so renaming the species in
 * `data/species.csv` leaves `data/images.csv` and `data/image-derivatives.csv`
 * naming six objects that do not exist in the storage zone. Nothing renders
 * today — `chelis-sp` is on the unpublished deny-list, which is the other half
 * of the same ruling — so this breaks no page. It is run now anyway, because
 * the day someone writes the account is the day the miss would surface, and by
 * then nothing would connect it to this rename.
 *
 * ONLY THE FOLDER CHANGES. The filenames stay `Holoarctia sp-A-*.jpg`: a
 * filename is a permanent opaque identifier and a photograph's species is data,
 * not its name (ADR 0038). `chelis-sordida` already carries its photographs
 * under `Holoarctia sordida-*.jpg` for exactly this reason.
 *
 * The work list is a prefix walk rather than a hard-coded table, because a pure
 * folder rename has no per-object decisions in it — every object under the two
 * prefixes moves, and `retargetSlugSegment` rewrites only the whole path
 * segment. The six objects the repo tracks are asserted against
 * `data/cdn-retired-images.csv` in the unit test.
 *
 * Additive and idempotent (size-checked skip, never deletes — ADR 0008).
 *
 * Usage:
 *   DRY_RUN=1 BUNNY_STORAGE_PASSWORD=... node scripts/migrate-holoarctia-chelis-photos.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-holoarctia-chelis-photos.ts
 *
 * The password is needed even for DRY_RUN=1 — the work list is a storage-API
 * directory listing.
 */
import { pathToFileURL } from 'node:url';
import { createBunnyStorage, pooled, retargetSlugSegment } from './lib/bunny-storage.ts';

const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const TAG = '[migrate-holoarctia-chelis-photos]';

export const OLD_SLUG = 'holoarctia-sp';
export const NEW_SLUG = 'chelis-sp';

/** The originals and their derivative variants live under separate prefixes. */
export const SOURCE_PREFIXES: ReadonlyArray<string> = [
  `${OLD_SLUG}/`,
  `derived/${OLD_SLUG}/`,
];

/** Rewrite one source key onto its `chelis-sp` target. */
export function retarget(key: string): string {
  return retargetSlugSegment(key, OLD_SLUG, NEW_SLUG);
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
  for (const prefix of SOURCE_PREFIXES) {
    for (const [k, v] of await storage.walk(prefix)) sources.set(k, v);
  }
  const already = new Map<string, number>();
  for (const prefix of SOURCE_PREFIXES) {
    for (const [k, v] of await storage.walk(retarget(prefix))) already.set(k, v);
  }

  console.log(`${TAG} ${sources.size} source object(s) under ${SOURCE_PREFIXES.join(', ')}${DRY_RUN ? ' — DRY RUN' : ''}`);
  if (sources.size === 0) {
    console.error(`${TAG} nothing to copy — the source prefixes are empty. Has this already run and been cleaned up?`);
    process.exit(1);
  }

  const plan: Array<{ from: string; to: string }> = [];
  const stats = { copied: 0, skipped: 0, failed: 0 };
  let truncated = 0;

  for (const [key, size] of sources) {
    const target = retarget(key);
    if (target === key) continue; // not under the renamed folder after all
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

  console.log(
    `${TAG} ${plan.length} object(s) to copy, ${stats.skipped} already present` +
      (truncated > 0 ? `, ${truncated} present but the wrong size (re-copying)` : ''),
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
    } catch (err) {
      stats.failed++;
      console.error(`${TAG} FAILED ${from} -> ${to}: ${storage.redact((err as Error).message)}`);
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
    const pw = process.env['BUNNY_STORAGE_PASSWORD'];
    const msg = (err as Error).message ?? String(err);
    console.error(pw ? msg.split(pw).join('[REDACTED]') : msg);
    process.exit(1);
  });
}
