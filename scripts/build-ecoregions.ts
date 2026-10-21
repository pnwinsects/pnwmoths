// scripts/build-ecoregions.ts
// Maintainer-run: download the ecoregion boundaries the identification key asks about
// and write data/boundaries/pnw-ecoregions.geojson (#397, ADR 0055). The key build
// places every record in one of these to derive its ecoregion answers.
//
// Sources (provenance and licences in docs/reference/ecoregions.md):
//   - EPA Level III ecoregions of the conterminous US, clipped to the region;
//   - EPA Level IV 77i "High Olympics", from Washington's Level IV file, cut out of
//     Level III North Cascades because the key asks about the Olympics separately;
//   - the BC ecoprovinces, from the BC Data Catalogue.
//
// Each feature is {name, country, source}: `name` as the source spells it (the key
// build maps the few that differ from the key's answers), `country` "US" or "CA".
// Downloads go to the gitignored .boundaries-scratch/, as build-boundaries.ts's do.
//
// Run: node scripts/build-ecoregions.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { featureWithinBounds, type GeoFeature } from './build-boundaries.ts';
import { parseKeyScores } from './build-key.ts';
import { derivedColumns, missingKeyEcoregions, ECOREGIONS_PATH } from './lib/key-derived-scores.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH_DIR = resolve(ROOT, '.boundaries-scratch/ecoregions');

const L3_ZIP_URL = 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/us/us_eco_l3.zip';
const WA_L4_ZIP_URL = 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/wa/wa_eco_l4.zip';
const BC_URL =
  'https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeName=pub:WHSE_TERRESTRIAL_ECOLOGY.ERC_ECOPROVINCES_SP&outputFormat=json&srsName=EPSG:4326';

const L3_ZIP = resolve(SCRATCH_DIR, 'us_eco_l3.zip');
const WA_L4_ZIP = resolve(SCRATCH_DIR, 'wa_eco_l4.zip');
const L3_SHP = resolve(SCRATCH_DIR, 'l3/us_eco_l3.shp');
const WA_L4_SHP = resolve(SCRATCH_DIR, 'l4/wa_eco_l4.shp');
const BC_JSON = resolve(SCRATCH_DIR, 'bc_ecoprovinces.json');

/**
 * The US states whose records are placed in an ecoregion (WA, OR, ID, MT), with a
 * margin for a point just over a border. The EPA file covers the whole country.
 */
const US_CLIP_BBOX = '-125,41.5,-103.5,49.5';

/** Simplification tolerance in metres: far finer than a record's stated accuracy. */
const SIMPLIFY_METRES = 500;

const OUTPUT_PATH = resolve(ROOT, ECOREGIONS_PATH);
/** mapshaper writes here; the file is copied to OUTPUT_PATH only once it passes every check. */
const STAGED_PATH = resolve(SCRATCH_DIR, 'pnw-ecoregions.geojson');

async function downloadIfMissing(url: string, destPath: string): Promise<void> {
  if (existsSync(destPath)) return;
  console.log(`[build-ecoregions] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[build-ecoregions] download failed: ${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  console.log(`[build-ecoregions] downloaded ${destPath} (${buf.byteLength} bytes)`);
}

function unzipIfMissing(zipPath: string, destDir: string, expectedShp: string): void {
  if (existsSync(expectedShp)) return;
  mkdirSync(destDir, { recursive: true });
  execFileSync('unzip', ['-o', zipPath, '-d', destDir], { encoding: 'utf8' });
}

export async function main(): Promise<void> {
  mkdirSync(SCRATCH_DIR, { recursive: true });
  await downloadIfMissing(L3_ZIP_URL, L3_ZIP);
  await downloadIfMissing(WA_L4_ZIP_URL, WA_L4_ZIP);
  await downloadIfMissing(BC_URL, BC_JSON);
  unzipIfMissing(L3_ZIP, dirname(L3_SHP), L3_SHP);
  unzipIfMissing(WA_L4_ZIP, dirname(WA_L4_SHP), WA_L4_SHP);

  console.log('[build-ecoregions] running mapshaper@0.7.37 pipeline...');
  // Array-form execFileSync: no shell string, as in build-boundaries.ts. Simplifying
  // after -merge-layers keeps the cut between North Cascades and the High Olympics
  // one shared edge, so simplification opens no gap or overlap along it.
  execFileSync(
    'npx',
    [
      'mapshaper@0.7.37',
      '-i', L3_SHP, 'name=l3',
      '-i', WA_L4_SHP, 'name=l4',
      '-i', BC_JSON, 'name=bc',
      '-proj', 'target=l3,l4', 'wgs84',
      '-clip', 'target=l3', `bbox=${US_CLIP_BBOX}`,
      '-dissolve', 'target=l3', 'US_L3CODE', 'copy-fields=US_L3NAME',
      '-filter', 'target=l4', 'US_L4CODE=="77i"',
      '-dissolve', 'target=l4', 'US_L4CODE', 'copy-fields=US_L4NAME',
      '-erase', 'l4', 'target=l3',
      '-each', 'target=l3', 'name=US_L3NAME, country="US", source="EPA Level III "+US_L3CODE',
      '-each', 'target=l4', 'name=US_L4NAME, country="US", source="EPA Level IV "+US_L4CODE',
      '-each', 'target=bc', 'name=ECOPROVINCE_NAME, country="CA", source="BC ecoprovince "+ECOPROVINCE_CODE',
      '-merge-layers', 'target=l3,l4,bc', 'force', 'name=ecoregions',
      '-filter-fields', 'name,country,source',
      '-simplify', `interval=${SIMPLIFY_METRES}`, 'keep-shapes',
      '-sort', 'source',
      '-o', 'format=geojson', 'precision=0.00001', 'force', STAGED_PATH,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );

  const raw = readFileSync(STAGED_PATH, 'utf8');
  const features = (JSON.parse(raw) as { features: GeoFeature[] }).features;
  const named = features.map(f => ({
    name: String(f.properties?.['name'] ?? ''),
    country: String(f.properties?.['country'] ?? ''),
  }));

  const outOfBounds = features.filter(f => !featureWithinBounds(f)).map(f => String(f.properties?.['name']));
  const cols = derivedColumns(parseKeyScores(readFileSync(resolve(ROOT, 'data/key-scores.csv'))).labels);
  const unreachable = missingKeyEcoregions(cols, named);
  if (outOfBounds.length > 0 || unreachable.length > 0) {
    console.error(`[build-ecoregions] FAIL: the new boundary file is unusable, so ${ECOREGIONS_PATH} is unchanged. It is in ${STAGED_PATH}.`);
    if (outOfBounds.length > 0) console.error('  features outside the region (failed reprojection?):', outOfBounds);
    if (unreachable.length > 0) console.error('  key answers no feature supplies:', unreachable);
    process.exit(1);
  }
  writeFileSync(OUTPUT_PATH, raw);

  const us = named.filter(f => f.country === 'US').length;
  console.log(`[build-ecoregions] features: ${features.length} (US: ${us}, BC: ${features.length - us})`);
  console.log(`[build-ecoregions] file size: ${(Buffer.byteLength(raw) / 1024).toFixed(1)} KB`);
  console.log(`[build-ecoregions] all ${cols.ecoregion.size} of the key's ecoregion answers are supplied`);
  console.log(`[build-ecoregions] wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
