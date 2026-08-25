/**
 * scripts/check-photo-determinations.ts
 *
 * Refuses a build in which a species account would publish a photograph of a
 * different species.
 *
 * THE FAILURE THIS EXISTS FOR
 *
 * `src/species/species.njk` renders a species' deep-zoom tiles *instead of* its
 * catalogued photographs when it has any. The tiles are keyed by the manifest's
 * `species_slug`, which `ingest-photos.ts` derives from the TIFF's **filename**.
 * `data/images.csv` is keyed by the curator's determination. The two agree until
 * a specimen is redetermined — at which point the catalogue moves and the
 * filename does not, and the tile set stays parked on the species the file is
 * *named* after.
 *
 * Nothing caught that. `check-derivatives.ts` proves the tiles exist;
 * `check-referential-integrity.ts` proves every slug resolves; both were green
 * while eleven accounts published another species' photographs at full
 * resolution (#330, #336). The gap was that no check ever compared *what the
 * catalogue says a photograph is* with *whose account its tiles sit on*.
 *
 * Four checks, three of them fatal:
 *
 *   A. Every determination resolves to a real photograph (fatal — a typo'd stem
 *      is a ruling that silently does nothing).
 *   B. Every determination agrees with data/images.csv about slug and specimen
 *      (fatal — otherwise this file decorates rather than governs).
 *   C. No tiled specimen slot holds a photograph the catalogue assigns to a
 *      different species (fatal — this is the bug itself). A recorded
 *      determination exempts the pair only once the tiles have actually landed
 *      where it says, so the half-finished runbook fails rather than passing.
 *   D. No two photographs of one species claim the same specimen letter and view
 *      (ADVISORY — 22 such pairs predate this check and each needs the curator,
 *      not an engineer; failing on them would block every build on a backlog of
 *      taxonomic questions).
 *
 * Check C is deliberately expressed over `data/images.csv` rather than the
 * manifest: images.csv is the curator-editable file, so the check speaks in
 * terms a curator can act on, and it keeps working for photographs that have no
 * TIFF at all.
 *
 * Usage:
 *   node scripts/check-photo-determinations.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { pathToFileURL } from 'node:url';
import { readPhotoDeterminations, toPhotoStem, identityFromFilename } from './lib/photo-determinations.ts';
import type { PhotoDetermination } from './lib/photo-determinations.ts';
import { readManifest } from './lib/manifest.ts';

const TAG = '[check-photo-determinations]';

const IMAGES_PATH: string = resolve('data/images.csv');
const SPECIES_PHOTOS_PATH: string = resolve('data/species-photos.json');
const MANIFEST_PATH: string = resolve('data/species-photos-manifest.csv');

interface ImageRow {
  species_slug: string;
  filename: string;
  specimen: string;
  view: string;
}

interface SpeciesPhotoEntry {
  high_res_available: boolean;
  specimens: { specimen_id: string; view: string }[];
}

/** `dorsal`/`ventral` in images.csv; `D`/`V` in the tile manifest. */
function viewCode(view: string): string {
  const v = view.trim().toLowerCase();
  if (v === 'dorsal') return 'D';
  if (v === 'ventral') return 'V';
  return '';
}

/**
 * The slug a photograph's filename *claims*, or null when it names no specimen.
 *
 * Delegates to the shared reader so this check and the ingest pipeline cannot
 * disagree about what a filename says — see identityFromFilename().
 */
export function slugClaimedByFilename(filename: string): string | null {
  return identityFromFilename(filename)?.slug ?? null;
}

export interface Violation {
  readonly check: 'A' | 'B' | 'C' | 'D';
  readonly message: string;
}

/**
 * Every violation, in check order. Pure — exported so the test can drive it with
 * fixtures instead of the repo's own data.
 */
export function findViolations(
  images: ImageRow[],
  determinations: Map<string, PhotoDetermination>,
  speciesPhotos: Record<string, SpeciesPhotoEntry>,
  manifestStems: ReadonlySet<string>,
): Violation[] {
  const violations: Violation[] = [];
  const imagesByStem = new Map(images.map(r => [toPhotoStem(r.filename), r]));

  // --- A. every determination names a photograph that exists somewhere -------
  for (const [stem, ruling] of determinations) {
    if (!imagesByStem.has(stem) && !manifestStems.has(stem)) {
      violations.push({
        check: 'A',
        message:
          `determination for "${stem}" (${ruling.source}) matches no row in data/images.csv ` +
          `and no photograph in the manifest — check the spelling of photo_stem`,
      });
    }
  }

  // --- B. determinations and images.csv agree -------------------------------
  for (const [stem, ruling] of determinations) {
    const row = imagesByStem.get(stem);
    if (!row) continue; // manifest-only photograph; nothing in images.csv to disagree
    if (row.species_slug !== ruling.species_slug) {
      violations.push({
        check: 'B',
        message:
          `"${stem}": data/photo-determinations.csv says ${ruling.species_slug}, ` +
          `data/images.csv says ${row.species_slug} — one of them is stale`,
      });
    } else if (row.specimen !== ruling.specimen) {
      violations.push({
        check: 'B',
        message:
          `"${stem}": determination assigns specimen ${ruling.specimen}, ` +
          `data/images.csv row says ${row.specimen} — the letters must match or the tile pairs with the wrong caption`,
      });
    }
  }

  // --- C. no tiled slot holds another species' photograph -------------------
  const tiled = new Map<string, Set<string>>();
  for (const [slug, entry] of Object.entries(speciesPhotos)) {
    if (!entry.high_res_available) continue;
    tiled.set(slug, new Set(entry.specimens.map(s => `${s.specimen_id}|${s.view}`)));
  }
  for (const row of images) {
    const claimed = slugClaimedByFilename(row.filename);
    if (!claimed || claimed === row.species_slug) continue;
    const slot = `${row.specimen}|${viewCode(row.view)}`;
    if (!tiled.get(claimed)?.has(slot)) continue;
    // A determination exempts this pair ONLY once the tiles have actually
    // landed where it says. Exempting on the mere existence of a row reopens the
    // bug for a half-finished workflow: `photos:materialize` is not part of
    // `build:site` and `data/species-photos.json` is committed, so a maintainer
    // who edits images.csv and records the ruling — exactly what ADDING_PHOTO.md
    // prescribes — but does not re-materialise leaves the tiles keyed to the old
    // species with every gate green and the wrong moth public.
    const ruling = determinations.get(toPhotoStem(row.filename));
    if (ruling && tiled.get(ruling.species_slug)?.has(`${ruling.specimen}|${viewCode(row.view)}`)) {
      continue;
    }
    violations.push({
      check: 'C',
      message:
        `${claimed} publishes tiles for specimen ${slot.replace('|', '-')}, but data/images.csv ` +
        `files "${row.filename}" under ${row.species_slug} — the account is showing another ` +
        `species' photograph. Record the determination in data/photo-determinations.csv and ` +
        `re-key the tiles, or correct data/images.csv`,
    });
  }

  // --- D. one specimen letter, one specimen (advisory) ----------------------
  const slots = new Map<string, string[]>();
  for (const row of images) {
    const code = viewCode(row.view);
    if (!row.specimen || !code) continue;
    const key = `${row.species_slug}|${row.specimen}|${code}`;
    const list = slots.get(key) ?? [];
    list.push(row.filename);
    slots.set(key, list);
  }
  for (const [key, filenames] of slots) {
    if (filenames.length < 2) continue;
    const [slug, specimen, code] = key.split('|');
    violations.push({
      check: 'D',
      message: `${slug} specimen ${specimen}-${code} is claimed by ${filenames.length} photographs: ${filenames.join(', ')}`,
    });
  }

  return violations;
}

async function main(): Promise<void> {
  const images = parse(readFileSync(IMAGES_PATH), {
    columns: true,
    skip_empty_lines: true,
  }) as ImageRow[];
  const determinations = readPhotoDeterminations();
  const speciesPhotos = JSON.parse(readFileSync(SPECIES_PHOTOS_PATH, 'utf8')) as Record<
    string,
    SpeciesPhotoEntry
  >;
  const manifestStems = new Set(
    (await readManifest(MANIFEST_PATH)).map(r => toPhotoStem(r.filename_raw)),
  );

  const violations = findViolations(images, determinations, speciesPhotos, manifestStems);
  const fatal = violations.filter(v => v.check !== 'D');
  const advisory = violations.filter(v => v.check === 'D');

  console.log(
    `${TAG} ${images.length} catalogued photographs, ${determinations.size} determinations, ` +
      `${Object.keys(speciesPhotos).length} species with tiles`,
  );

  if (advisory.length > 0) {
    console.log(
      `${TAG} ADVISORY — ${advisory.length} specimen letters claimed by more than one photograph (#341):`,
    );
    for (const v of advisory) console.log(`    ${v.message}`);
  }

  if (fatal.length > 0) {
    console.error(`${TAG} ${fatal.length} violation(s):`);
    for (const v of fatal) console.error(`  [${v.check}] ${v.message}`);
    process.exit(1);
  }

  console.log(`${TAG} OK — no account publishes another species' photograph.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(`${TAG} ${(err as Error).message}`);
    process.exit(1);
  });
}
