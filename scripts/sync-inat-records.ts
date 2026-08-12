// scripts/sync-inat-records.ts
// Maintainer-run iNaturalist project sync (GitHub issue #23).
//
// Reconciles data/records-inat.csv against the "PNWMoths" iNaturalist project
// (https://www.inaturalist.org/projects/pnwmoths): research-grade observations
// in the project become occurrence records, observations that leave it — or
// that lose research grade, or whose identification moves to a taxon the site
// has no page for — are removed. That three-way reconcile is the collaborator's
// stated requirement on #23.
//
// The file is rewritten WHOLESALE every run and is machine-owned.
// data/records.csv is never written by this script; see
// scripts/lib/records-source.ts for why the two files are separate.
//
// This is an INTERACTIVE tool, not a cron job. The person who runs it is the
// person who curates the iNaturalist project, and the printed summary — not
// the git diff — is the review surface. Run it, read what changed, then
// `npm run build:site` and commit.
//
//   node scripts/sync-inat-records.ts [--dry-run] [--force]
//
//   --dry-run  print the summary, write nothing
//   --force    proceed even though the blast-radius guard tripped
//
// Run: npm run inat:sync
import { writeFileSync } from 'node:fs';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { DuckDBInstance } from '@duckdb/node-api';
import { resolveByCoordinates } from './fill-district-from-coords.ts';
import { KM_PER_DEGREE_LAT } from './lib/district-assignment.ts';
import {
  RECORDS_INAT_COLUMNS,
  RECORDS_INAT_CSV_PATH,
  readCuratorRecordRows,
  readInatRecordRows,
} from './lib/records-source.ts';
import type { InatRecordRow } from './lib/records-source.ts';
import {
  INAT_PROJECT_ID,
  NEARBY_STATE_KM,
  assertObservationShape,
  buildCrosswalkIndex,
  collectCitedObservationIds,
  finalizeRow,
  formatSummary,
  observationUrl,
  guardBlastRadius,
  reconcile,
  screenObservation,
  stateFromNearbyDistricts,
  stateFromPlaceGuess,
} from './lib/inat.ts';
import type {
  Candidate,
  CrosswalkEntry,
  InatObservation,
  Placement,
  RecordChange,
  SkipReason,
  Skipped,
} from './lib/inat.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPECIES_CSV = resolve(ROOT, 'data/species.csv');
const SYNONYMS_CSV = resolve(ROOT, 'data/species-synonyms.csv');
const CROSSWALK_CSV = resolve(ROOT, 'data/district-crosswalk.csv');
const BOUNDARIES_GEOJSON = resolve(ROOT, 'data/boundaries/pnw-districts.geojson');
const OUT_CSV = resolve(ROOT, RECORDS_INAT_CSV_PATH);
const REPORT_CSV = resolve(ROOT, 'data/inat-sync-report.csv');

const REPORT_COLUMNS = ['inat_id', 'url', 'outcome', 'detail'];

/** iNaturalist API v2. v2 returns ONLY `uuid` unless `fields` is given. */
const INAT_API = 'https://api.inaturalist.org/v2/observations';
const INAT_FIELDS = [
  'id',
  'quality_grade',
  'observed_on',
  'geojson',
  'obscured',
  'public_positional_accuracy',
  'place_guess',
  'taxon.id',
  'taxon.name',
  'taxon.rank',
  'user.id',
  'user.login',
  'user.name',
].join(',');

const PAGE_SIZE = 200;

/** Courtesy pacing. iNaturalist allows ~60 req/min sustained, 100 hard. */
const REQUEST_PACE_MS = 1100;

const USER_AGENT =
  'pnwmoths-record-sync/1.0 (+https://github.com/pnwinsects/pnwmoths; moths.pnwinsects.org)';

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/** Every slug with a row in species.csv (the site's species universe). */
export function loadSiteSlugs(csvPath: string = SPECIES_CSV): Set<string> {
  const rows = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true }) as Array<{
    genus: string;
    species: string;
  }>;
  return new Set(
    rows.map((r) =>
      `${r.genus.trim()}-${r.species.trim()}`.toLowerCase().replace(/\s+/g, '-'),
    ),
  );
}

/** Lowercased binomial -> site slug, from data/species-synonyms.csv. */
export function loadSynonyms(csvPath: string = SYNONYMS_CSV): Map<string, string> {
  if (!existsSync(csvPath)) return new Map();
  const rows = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true }) as Array<{
    from_binomial: string;
    to_species_slug: string;
  }>;
  return new Map(rows.map((r) => [r.from_binomial.trim().toLowerCase(), r.to_species_slug.trim()]));
}

/** data/district-crosswalk.csv rows. */
export function loadCrosswalk(csvPath: string = CROSSWALK_CSV): CrosswalkEntry[] {
  return parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true }) as CrosswalkEntry[];
}

/**
 * district_id -> district name from the committed boundary file.
 *
 * Used only to disambiguate the four stable_ids that carry two names in the
 * crosswalk; the crosswalk's spelling is always what gets written, so the
 * GeoJSON's `Lewis and Clark` never displaces the curator's `Lewis & Clark`.
 */
export function loadDistrictNames(geojsonPath: string = BOUNDARIES_GEOJSON): Map<string, string> {
  const geo = JSON.parse(readFileSync(geojsonPath, 'utf-8')) as {
    features: Array<{ properties: { district_id?: string; name?: string } }>;
  };
  const names = new Map<string, string>();
  for (const feature of geo.features) {
    const id = feature.properties.district_id;
    const name = feature.properties.name;
    if (id && name) names.set(id, name);
  }
  return names;
}

/**
 * The committed contents of data/records-inat.csv — the baseline the summary
 * is computed against.
 *
 * Deliberately `git show HEAD:`, not the working tree. The maintainer running
 * this is not a git user: if he runs the sync, dislikes what he sees and runs
 * it again, a working-tree baseline would report "no changes" the second time
 * while the change sat uncommitted. Against HEAD the summary says the same
 * thing every time until he commits.
 *
 * Falls back to the working tree when the file is untracked (the very first
 * run), and to empty when there is neither.
 */
export function loadCommittedRows(): InatRecordRow[] {
  try {
    const text = execFileSync('git', ['show', `HEAD:${RECORDS_INAT_CSV_PATH}`], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parse(text, { columns: true, skip_empty_lines: true }) as InatRecordRow[];
  } catch {
    // Not in HEAD (first run, or the file is new and untracked).
    return readInatRecordRows(OUT_CSV);
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Every observation the project currently holds, via an id-keyset sweep.
 *
 * Keyset rather than page numbers so the sweep is a consistent snapshot: page
 * offsets are non-atomic, and an observation added or removed mid-sweep slides
 * rows across a page boundary, silently dropping or duplicating them. The
 * cursor is an immutable id, so it cannot drift.
 *
 * Fetches the project's whole eligible set (`research,needs_id` — the
 * project's own rule) rather than filtering to research grade server-side.
 * That is what lets a removal say WHY: an observation that is still in the
 * project but no longer research grade is a different event, needing a
 * different response, from one that left the project altogether.
 *
 * Everything is buffered and returned only on complete success. A partial
 * sweep interrupted by an HTTP error is indistinguishable from "the project
 * shrank", and writing it out would delete real records.
 */
export async function fetchProjectObservations(
  projectId: number = INAT_PROJECT_ID,
): Promise<InatObservation[]> {
  const all: InatObservation[] = [];
  let idAbove = 0;
  let expectedTotal: number | null = null;

  for (;;) {
    const url =
      `${INAT_API}?project_id=${projectId}&quality_grade=research,needs_id` +
      `&order_by=id&order=asc&id_above=${idAbove}&per_page=${PAGE_SIZE}` +
      `&fields=${encodeURIComponent(INAT_FIELDS)}`;

    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      throw new Error(
        `iNaturalist returned HTTP ${response.status} ${response.statusText}. ` +
          'Nothing was written — re-run when the API is reachable.',
      );
    }
    const body = (await response.json()) as {
      results?: InatObservation[];
      total_results?: number;
    };
    const results = body.results ?? [];
    if (expectedTotal === null) expectedTotal = body.total_results ?? null;
    all.push(...results);

    // A short page is terminal: iNaturalist returns exactly per_page rows for
    // every page but the last.
    if (results.length < PAGE_SIZE) break;

    // Advance by the max RAW id, before any local filtering — deriving the
    // cursor from kept rows would stall the sweep on a trailing dropped row.
    // Max, not the last element: the comment above is the whole point — the
    // cursor must not depend on the server honouring order_by. A skipped
    // observation is not merely missing, it is reconciled as a REMOVAL.
    idAbove = Math.max(...results.map((r) => r.id));
    await sleep(REQUEST_PACE_MS);
  }

  // A truncated sweep is the dangerous kind of success: every observation it
  // failed to return is reconciled as a removal, with the entirely plausible
  // reason "no longer in the iNaturalist project". Compare against the count
  // the API itself reported. Only a SHORTFALL is fatal — an observation added
  // to the project mid-sweep legitimately puts the total above the first
  // page's figure.
  if (expectedTotal !== null && all.length < expectedTotal) {
    throw new Error(
      `iNaturalist reported ${expectedTotal} observations but the sweep returned ` +
        `${all.length}. Nothing was written — a truncated fetch is indistinguishable ` +
        'from records having been removed from the project. Re-run.',
    );
  }

  return all;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface BuildResult {
  rows: InatRecordRow[];
  skipped: Skipped[];
}

/**
 * For each unplaced candidate, the state every district within
 * NEARBY_STATE_KM agrees on — or nothing, when they disagree or there are
 * none.
 *
 * A separate, wider pass than resolveByCoordinates deliberately: that function
 * answers "which district is this in?" with a ~2 km tolerance and must stay
 * strict, because a wrong district shows up as a species in a county it does
 * not occur in. This one answers only "which state is this in?", where a
 * several-km miss is harmless as long as the neighbours are unanimous.
 *
 * Planar ST_Distance in degrees, matching the [lon, lat] convention used by
 * ST_Point/ST_Contains throughout this codebase — never ST_Distance_Sphere or
 * _Spheroid, which take [lat, lon] and are POINT-only.
 */
export async function resolveNearbyStates(
  candidates: Array<{ index: number; lat: number; lon: number; radiusKm: number }>,
  geojsonPath: string = BOUNDARIES_GEOJSON,
): Promise<Map<number, string>> {
  const states = new Map<number, string>();
  if (candidates.length === 0) return states;

  // A degree of LONGITUDE is much shorter than a degree of latitude at these
  // latitudes (~74 km vs ~111 km at 48N), and ST_Distance below is planar in
  // degrees. Dividing by the latitude constant would therefore search an
  // ellipse only ~17 km wide east-west — and the unanimity rule this feeds is
  // only safe if the neighbourhood is complete: a neighbour that is missed is
  // a neighbour that cannot disagree. Scaling by cos(latitude) uses the
  // SHORTEST degree, so the search region always CONTAINS the intended circle.
  // Over-selecting north-south is the safe direction: it can only add
  // districts, and an extra district can only cause a rejection, never a wrong
  // state.
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  try {
    await conn.run("SET custom_extension_repository='https://extensions.duckdb.org';");
    await conn.run('INSTALL spatial;');
    await conn.run('LOAD spatial;');
    await conn.run(`CREATE TABLE districts AS SELECT * FROM ST_Read('${geojsonPath}');`);
    await conn.run(
      'CREATE TABLE candidates (row_id INTEGER, lon DOUBLE, lat DOUBLE, radius_km DOUBLE);',
    );
    // Only numeric, already-parsed coordinates are interpolated — never a raw
    // string from the API response.
    const values = candidates
      .map((c) => `(${c.index}, ${c.lon}, ${c.lat}, ${c.radiusKm})`)
      .join(', ');
    await conn.run(`INSERT INTO candidates VALUES ${values};`);

    const reader = await conn.runAndReadAll(`
      SELECT c.row_id AS row_id, list(DISTINCT d.district_id) AS district_ids
      FROM candidates c
      JOIN districts d
        ON ST_Distance(d.geom, ST_Point(c.lon, c.lat))
           < c.radius_km / (${KM_PER_DEGREE_LAT} * cos(radians(c.lat)))
      GROUP BY c.row_id
    `);
    const rows = reader.getRowObjectsJS() as Array<{ row_id: number; district_ids: string[] }>;
    for (const row of rows) {
      const state = stateFromNearbyDistricts(row.district_ids);
      if (state !== null) states.set(Number(row.row_id), state);
    }
  } finally {
    conn.closeSync();
  }
  return states;
}

/**
 * Turn a project snapshot into the rows data/records-inat.csv should hold.
 *
 * Two passes with the point-in-polygon assignment between them: screening is
 * pure and rejects everything it can before any coordinate reaches DuckDB,
 * then surviving candidates get a district, then finalisation derives state
 * and county from it.
 *
 * Output is sorted by observation id so the committed file is stable given the
 * same project contents, and the diff shows only real changes. (This is
 * stability, not the reproducibility of ADR 0017 — the content depends on a
 * live remote and cannot be regenerated from repo inputs alone.)
 */
export async function buildRows(
  observations: InatObservation[],
  ctx: {
    siteSlugs: Set<string>;
    synonyms: Map<string, string>;
    citedIds: Set<string>;
    crosswalk: Map<string, CrosswalkEntry[]>;
    districtNames: Map<string, string>;
  },
  geojsonPath: string = BOUNDARIES_GEOJSON,
): Promise<BuildResult> {
  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];

  for (const obs of observations) {
    assertObservationShape(obs);
    const result = screenObservation(obs, { siteSlugs: ctx.siteSlugs, synonyms: ctx.synonyms });
    if (result.ok) candidates.push(result.candidate);
    else skipped.push(result.skipped);
  }

  const resolutions = await resolveByCoordinates(
    candidates.map((c, index) => ({ index, lat: c.latitude, lon: c.longitude })),
    geojsonPath,
  );

  // Anything the district pass could not place gets a second, wider look —
  // not to guess a district, but to ask whether the surrounding districts all
  // agree on a state. Coastal, island and on-the-water records land here.
  // Note resolveByCoordinates records an UNMATCHED candidate too, as
  // `outcome: 'unassigned'` with an empty districtId — so "unplaced" is an
  // empty district_id, not an absent map entry.
  // Two populations go through the wider unanimity pass, for the same reason:
  // their position is known less precisely than a district.
  //   - unplaced records, searched at NEARBY_STATE_KM
  //   - OBSCURED records, searched at their own published accuracy radius,
  //     because the true location is somewhere in that box and any state it
  //     could reach must get a vote
  const needStateVote = candidates
    .map((c, index) => ({ index, candidate: c }))
    .filter(({ index, candidate }) =>
      candidate.obscured || !resolutions.get(index)?.districtId,
    )
    .map(({ index, candidate }) => ({
      index,
      lat: candidate.latitude,
      lon: candidate.longitude,
      radiusKm: candidate.obscured
        ? candidate.accuracyKm ?? NEARBY_STATE_KM
        : NEARBY_STATE_KM,
    }));
  const nearbyStates = await resolveNearbyStates(needStateVote, geojsonPath);

  const rows: InatRecordRow[] = [];
  candidates.forEach((candidate, index) => {
    const districtId = resolutions.get(index)?.districtId;
    let placement: Placement;
    if (candidate.obscured) {
      // Never the containing district: the point it contains is randomised.
      // A state every reachable district agrees on — failing that,
      // iNaturalist's own place name, which for an obscured observation names
      // a place that genuinely CONTAINS the true location. That fallback is
      // what keeps a San Juan Islands record (whose 27km box reaches British
      // Columbia, so the districts cannot be unanimous) filed correctly under
      // Washington instead of being thrown away.
      const state = nearbyStates.get(index) ?? stateFromPlaceGuess(candidate.locality);
      placement = state ? { kind: 'state-only', state } : { kind: 'none' };
    } else if (districtId) {
      placement = {
        kind: 'district',
        districtId,
        districtName: ctx.districtNames.get(districtId) ?? null,
      };
    } else {
      const state = nearbyStates.get(index);
      placement = state ? { kind: 'state-only', state } : { kind: 'none' };
    }
    const finalized = finalizeRow(candidate, placement, ctx.crosswalk);
    if (!finalized.ok) {
      skipped.push(finalized.skipped);
      return;
    }
    // The dedup check is deliberately LAST, once the row is fully built and
    // every gate has passed. `already-curated` is the handover worklist
    // scripts/migrate-inat-records.ts deletes curator rows from, so it has to
    // mean "this would otherwise be a record" — anything weaker turns the
    // handover into silent data loss for an observation the sync would go on
    // to reject. See the note in screenObservation.
    if (ctx.citedIds.has(finalized.row.inat_id)) {
      skipped.push({
        inatId: finalized.row.inat_id,
        reason: 'already-curated',
        detail: observationUrl(finalized.row.inat_id),
      });
      return;
    }
    rows.push(finalized.row);
  });

  rows.sort((a, b) => Number(a.inat_id) - Number(b.inat_id));
  return { rows, skipped };
}

/**
 * Why each previously-imported record is going away.
 *
 * An id the project no longer returns at all left the project; an id still
 * present but absent from the new rows was rejected for a reason screening
 * already recorded.
 */
export function buildRemovalReasons(
  previous: InatRecordRow[],
  nextRows: InatRecordRow[],
  skipped: Skipped[],
  fetchedIds: Set<string>,
): Map<string, SkipReason> {
  const next = new Set(nextRows.map((r) => r.inat_id));
  const skipReasons = new Map(skipped.map((s) => [s.inatId, s.reason]));
  const reasons = new Map<string, SkipReason>();
  for (const row of previous) {
    if (next.has(row.inat_id)) continue;
    if (!fetchedIds.has(row.inat_id)) reasons.set(row.inat_id, 'left-project');
    else reasons.set(row.inat_id, skipReasons.get(row.inat_id) ?? 'left-project');
  }
  return reasons;
}

/** data/inat-sync-report.csv — every observation that did not become a record. */
export function buildReportCsv(skipped: Skipped[]): string {
  const rows = [...skipped]
    .sort((a, b) => a.reason.localeCompare(b.reason) || Number(a.inatId) - Number(b.inatId))
    .map((s) => ({
      inat_id: s.inatId,
      url: `https://www.inaturalist.org/observations/${s.inatId}`,
      outcome: s.reason,
      detail: s.detail,
    }));
  return stringify(rows, { header: true, columns: REPORT_COLUMNS });
}

/** data/records-inat.csv, with the pinned 16-column header. */
export function buildRecordsCsv(rows: InatRecordRow[]): string {
  return stringify(rows, { header: true, columns: [...RECORDS_INAT_COLUMNS] });
}

/**
 * Observation ids that are in the project, eligible, AND already entered by
 * hand in records.csv — the handover worklist, computed from a LIVE fetch.
 *
 * scripts/migrate-inat-records.ts calls this rather than reading
 * data/inat-sync-report.csv. The report is committed, so its filesystem mtime
 * is the checkout time, not the sync time: a fresh clone or a `git switch`
 * stamps it with "now" and any staleness check on it passes on a report that
 * describes the project as it was months ago. Deleting curator rows on that
 * basis is unrecoverable. Fetching makes the question unambiguous — the
 * handover list is by definition a statement about the project right now.
 */
export async function computeHandoverIds(): Promise<Set<string>> {
  const citedIds = collectCitedObservationIds(
    readCuratorRecordRows(resolve(ROOT, 'data/records.csv')),
  );
  const observations = await fetchProjectObservations();
  const { skipped } = await buildRows(observations, {
    siteSlugs: loadSiteSlugs(),
    synonyms: loadSynonyms(),
    citedIds,
    crosswalk: buildCrosswalkIndex(loadCrosswalk()),
    districtNames: loadDistrictNames(),
  });
  return new Set(
    skipped.filter((s) => s.reason === 'already-curated').map((s) => s.inatId),
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function countRemoved(changes: RecordChange[]): number {
  return changes.filter((c) => c.kind === 'removed').length;
}

/** Accepted flags. An unrecognised one is an error, never a silent no-op. */
const SYNC_FLAGS = new Set(['--dry-run', '--force']);

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  // A typo must not perform a destructive write. `--dryrun` silently ignored
  // would rewrite the file while the maintainer believed he was previewing —
  // and previewing first is the whole safety story in the runbook.
  const unknown = argv.filter((a) => !SYNC_FLAGS.has(a));
  if (unknown.length > 0) {
    console.error(`Unrecognised option${unknown.length === 1 ? '' : 's'}: ${unknown.join(' ')}`);
    console.error('Usage: npm run inat:sync [-- --dry-run] [-- --force]');
    process.exit(2);
  }
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');

  const siteSlugs = loadSiteSlugs();
  const synonyms = loadSynonyms();
  const crosswalk = buildCrosswalkIndex(loadCrosswalk());
  const districtNames = loadDistrictNames();
  const citedIds = collectCitedObservationIds(readCuratorRecordRows(resolve(ROOT, 'data/records.csv')));

  console.log(`Fetching observations from iNaturalist project ${INAT_PROJECT_ID}...`);
  const observations = await fetchProjectObservations();
  console.log(`  ${observations.length} observations in the project`);

  const { rows, skipped } = await buildRows(
    observations,
    { siteSlugs, synonyms, citedIds, crosswalk, districtNames },
  );

  const previous = loadCommittedRows();
  const fetchedIds = new Set(observations.map((o) => String(o.id)));
  const removalReasons = buildRemovalReasons(previous, rows, skipped, fetchedIds);
  const changes = reconcile(previous, rows, removalReasons);

  console.log('');
  console.log(formatSummary(changes, skipped));

  // Counted over DISTINCT ids, matching reconcile's de-duplicated view — a
  // repeated id would otherwise inflate the denominator and make the guard
  // less likely to fire, which is the wrong direction for a safety check.
  const previousCount = new Set(previous.map((r) => r.inat_id)).size;
  const guard = guardBlastRadius(previousCount, countRemoved(changes));
  if (guard.tripped && !force) {
    console.error(`REFUSING TO WRITE: ${guard.message}.`);
    console.error(
      'That usually means iNaturalist was unreachable or the project changed unexpectedly, ' +
        'not that this many records really went away. Check the project, then re-run with ' +
        '--force if the removals above are genuinely what you want.',
    );
    process.exit(1);
  }
  if (guard.tripped && force) {
    console.warn(`Proceeding despite the guard (--force): ${guard.message}.`);
  }

  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }

  // Report first: it is the diagnostic for what follows, and if the process
  // dies between the two writes a stale report alongside a fresh records file
  // is the more misleading pair.
  writeFileSync(REPORT_CSV, buildReportCsv(skipped));
  writeFileSync(OUT_CSV, buildRecordsCsv(rows));
  console.log(`Wrote ${rows.length} records to ${RECORDS_INAT_CSV_PATH}`);
  console.log(`Wrote ${skipped.length} report rows to data/inat-sync-report.csv`);
  console.log('');
  console.log('Next: npm run build:site, then commit data/records-inat.csv.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
