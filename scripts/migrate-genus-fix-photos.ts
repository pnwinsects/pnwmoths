/**
 * scripts/migrate-genus-fix-photos.ts
 *
 * One-off migration for #303: copy the CDN objects of the four species the
 * curator's #279 ruling re-genused (curation log C-026) onto their ruled slugs
 * and letters. The fifth species in the ruling, the `macaria-decorata` tile
 * set, is deliberately absent — which species it depicts is still an open
 * question on #303 and nothing moves until the curator answers.
 *
 * Two shapes of work in one migration:
 *
 * - FILE_COPIES — the repo-tracked legacy JPGs, their derivatives, and
 *   bitactata's tile thumbnails, as explicit pairs mirroring the #303 rows in
 *   data/cdn-retired-images.csv (the unit test asserts the two stay
 *   consistent). Letters change only where the curator's "if necessary" rule
 *   required: colata legacy A→D/B→E, plumosata legacy A→D, bitactata tiles
 *   A→D/B→E; lorquinaria moves folder-only. Filenames keep their historical
 *   binomials — including lorquinaria's "lorguinaria" typo, which is the
 *   specimen label as it exists, not ours to fix.
 *
 * - TILE_TREES — bitactata's six DeepZoom pyramids, walked from the storage
 *   API (enumerated nowhere in the repo) and re-keyed by retargetBitactataKey:
 *   slug macaria-bitactata → speranza-bitactata, view-directory letter A→D,
 *   B→E, C kept. colata/lorquinaria/plumosata's pyramids do NOT move — their
 *   species renamed to match the key the tiles already sit under.
 *
 * Additive and idempotent (size-checked skip, never deletes — ADR 0008).
 *
 * Usage:
 *   DRY_RUN=1 BUNNY_STORAGE_PASSWORD=... node scripts/migrate-genus-fix-photos.ts
 *   BUNNY_STORAGE_PASSWORD=... node scripts/migrate-genus-fix-photos.ts
 *
 * The password is needed even for DRY_RUN=1 — the pyramid work list is a
 * storage-API directory listing.
 */
import { pathToFileURL } from 'node:url';
import { createBunnyStorage, pooled } from './lib/bunny-storage.ts';

const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const TAG = '[migrate-genus-fix-photos]';

/** bitactata's tile letter map: the view directory is the site's catalog key. */
export const BITACTATA_LETTERS: ReadonlyMap<string, string> = new Map([
  ['A', 'D'],
  ['B', 'E'],
  ['C', 'C'],
]);

/**
 * Rewrite a macaria-bitactata tile key onto speranza-bitactata's ruled letters.
 * The slug is replaced only as a whole path segment and the letter prefix only
 * on the segment immediately after it; a key not under the slug is unchanged.
 */
export function retargetBitactataKey(key: string): string {
  const segments = key.split('/');
  const i = segments.indexOf('macaria-bitactata');
  if (i === -1) return key;
  segments[i] = 'speranza-bitactata';
  const next = segments[i + 1];
  if (next !== undefined && next.length >= 2 && next[1] === '-') {
    const mapped = BITACTATA_LETTERS.get(next[0]!);
    if (mapped !== undefined) segments[i + 1] = mapped + next.slice(1);
  }
  return segments.join('/');
}

export const TILE_TREES: ReadonlyArray<string> = [
  'species-tiles/macaria-bitactata/',
  'derived/species-tiles/macaria-bitactata/',
];

function legacyPairs(): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  const legacy = (
    fromSlug: string, toSlug: string, binomial: string,
    letters: ReadonlyArray<readonly [string, string]>,
  ): void => {
    for (const [ol, nl] of letters) {
      for (const v of ['D', 'V']) {
        out.push({ from: `${fromSlug}/${binomial}-${ol}-${v}.jpg`, to: `${toSlug}/${binomial}-${nl}-${v}.jpg` });
        for (const variant of ['320h', 'full']) {
          out.push({
            from: `derived/${fromSlug}/${binomial}-${ol}-${v}@${variant}.webp`,
            to: `derived/${toSlug}/${binomial}-${nl}-${v}@${variant}.webp`,
          });
        }
      }
    }
  };
  legacy('speranza-colata', 'macaria-colata', 'Speranza colata', [['A', 'D'], ['B', 'E']]);
  legacy('speranza-lorquinaria', 'macaria-lorquinaria', 'Speranza lorguinaria', [['A', 'A']]);
  legacy('speranza-plumosata', 'macaria-plumosata', 'Speranza plumosata', [['A', 'D'], ['B', 'B']]);
  return out;
}

export const FILE_COPIES: ReadonlyArray<{ from: string; to: string }> = legacyPairs();

async function main(): Promise<void> {
  const password = process.env['BUNNY_STORAGE_PASSWORD'] ?? '';
  if (!password) {
    console.error(`${TAG} BUNNY_STORAGE_PASSWORD required (bunny.net → pnwmoths zone → FTP & API Access → Password).`);
    console.error(`${TAG} It is needed even for DRY_RUN=1, because the tile work list is a storage-API directory listing.`);
    process.exit(1);
  }
  const storage = createBunnyStorage({
    host: process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com',
    zone: process.env['BUNNY_ZONE'] ?? 'pnwmoths',
    password,
    tag: TAG,
  });

  console.log(`${TAG} ${FILE_COPIES.length} tracked object(s) + ${TILE_TREES.length} tile tree(s)${DRY_RUN ? ' — DRY RUN' : ''}`);

  const destPrefixes = new Set<string>();
  for (const { to } of FILE_COPIES) destPrefixes.add(`${to.split('/').slice(0, -1).join('/')}/`);
  for (const tree of TILE_TREES) destPrefixes.add(tree.replace('macaria-bitactata/', 'speranza-bitactata/'));
  const already = new Map<string, number>();
  for (const prefix of destPrefixes) {
    for (const [k, v] of await storage.walk(prefix)) already.set(k, v);
  }

  const sources = new Map<string, number>();
  for (const tree of TILE_TREES) {
    for (const [k, v] of await storage.walk(tree)) sources.set(k, v);
  }
  for (const { from } of FILE_COPIES) {
    if (!sources.has(from)) {
      const dir = `${from.split('/').slice(0, -1).join('/')}/`;
      for (const [k, v] of await storage.walk(dir)) if (!sources.has(k)) sources.set(k, v);
    }
  }

  const pairFor = new Map<string, string>(FILE_COPIES.map(({ from, to }) => [from, to]));
  const plan: Array<{ from: string; to: string }> = [];
  const stats = { copied: 0, skipped: 0, failed: 0 };
  let truncated = 0;

  for (const [key, size] of sources) {
    const target = pairFor.get(key) ?? retargetBitactataKey(key);
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
  console.log(`  failed: ${stats.failed}`);
  if (missing.length > 0) console.log(`  missing sources: ${missing.length}`);
  if (stats.failed > 0 || missing.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    const pw = process.env['BUNNY_STORAGE_PASSWORD'];
    const msg = (err as Error).message ?? String(err);
    console.error(pw ? msg.split(pw).join('[REDACTED]') : msg);
    process.exit(1);
  });
}
