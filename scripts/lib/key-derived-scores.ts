// scripts/lib/key-derived-scores.ts
// The identification key's Distribution and Seasonality answers, derived from the
// occurrence records (#397, ADR 0055).
//
// A species recorded in Idaho in July scores 1 on "Idaho", on the Idaho ecoregion its
// record falls in, and on "July". build-key.ts ORs these into the hand-entered scores
// from data/key-scores.csv: a record can add a 1, never remove one, and a species with
// no record anywhere stays unscored on these questions rather than ruled out.
//
// Records are the ones the site serves (createAllRecordsTable), so the key agrees with
// the species page's map. Months skip reared and immature records, as the species
// page's flight chart does (#59).
import { resolve } from 'node:path';
import { parseCharacterLabel } from '../build-key.ts';
import { isRearedRecord } from '../../src/_lib/reared-records.ts';
import { createAllRecordsTable } from './records-source.ts';
import { FALLBACK_DEGREE_THRESHOLD } from './district-assignment.ts';

/** Ecoregion boundaries, built by scripts/build-ecoregions.ts. */
export const ECOREGIONS_PATH = 'data/boundaries/pnw-ecoregions.geojson';

const STATE_QUESTION = 'In which State/Province was the moth found?';
const MONTH_QUESTION = 'In which month was the moth found?';
const ecoregionQuestion = (keyState: string) => `In which ecoregion in ${keyState}?`;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A record's `state` and the key's answer to "In which State/Province was the moth
 * found?". Alberta and California records have no answer. The key's only Montana
 * answer is "Western Montana", but its Montana ecoregions include the Great Plains,
 * so every Montana record counts (ADR 0055).
 */
export const KEY_STATE_BY_RECORD_STATE: Readonly<Record<string, string>> = {
  WA: 'Washington',
  ID: 'Idaho',
  OR: 'Oregon',
  MT: 'Western Montana',
  BC: 'British Columbia',
};

/**
 * Ecoregions that the boundary file and the key spell differently, keyed by the
 * boundary file's name in lower case. Every other name matches its key answer
 * ignoring case (the BC file writes its names in capitals).
 */
export const KEY_ECOREGION_BY_BOUNDARY_NAME: ReadonlyMap<string, string> = new Map([
  // EPA files the High Olympics (Level IV 77i) under North Cascades; the key asks
  // about them separately, and the build cuts them out of North Cascades.
  ['high olympics', 'Olympic Highlands'],
  // EPA Level III 4. The key says "Central" because North Cascades is its own answer.
  ['cascades', 'Central Cascades'],
  ['northwestern glaciated plains', 'Northwest Glaciated Plains'],
  ['northwestern great plains', 'Northwest Great Plains'],
  ['klamath mountains/california high north coast range', 'Klamath Mts/California High North Coast Range'],
]);

/** The key's answer for an ecoregion named in the boundary file. */
export function keyEcoregionName(boundaryName: string): string {
  return KEY_ECOREGION_BY_BOUNDARY_NAME.get(boundaryName.toLowerCase()) ?? boundaryName;
}

/** Where the derived answers sit among the key's character-states (char ids). */
export interface DerivedColumns {
  /** Key state answer, e.g. "Idaho", to its char id. */
  state: Map<string, number>;
  /** `${keyState}|${answer in lower case}` to its char id. */
  ecoregion: Map<string, number>;
  /** Month number, 1–12, to its char id. */
  month: Map<number, number>;
  /** Every char id above: the columns the scoring template leaves out. */
  all: Set<number>;
}

const ecoregionKey = (keyState: string, answer: string) => `${keyState}|${answer.toLowerCase()}`;

/**
 * Find the derived questions among the key's character-state labels. Throws when a
 * state, month or ecoregion question is missing, because a renamed column would
 * otherwise quietly stop receiving records; `requireAll: false` only finds them, for
 * a caller that needs to know which columns are derived and nothing more.
 */
export function derivedColumns(
  labels: readonly string[],
  { requireAll = true }: { requireAll?: boolean } = {}
): DerivedColumns {
  const cols: DerivedColumns = { state: new Map(), ecoregion: new Map(), month: new Map(), all: new Set() };
  const keyStates = new Set(Object.values(KEY_STATE_BY_RECORD_STATE));
  labels.forEach((label, id) => {
    const { question, state } = parseCharacterLabel(label);
    if (question === STATE_QUESTION) {
      cols.state.set(state, id);
    } else if (question === MONTH_QUESTION) {
      const month = MONTHS.indexOf(state) + 1;
      if (month === 0) throw new Error(`key-derived-scores: unknown month "${state}" in column "${label}"`);
      cols.month.set(month, id);
    } else {
      const keyState = [...keyStates].find(s => question === ecoregionQuestion(s));
      if (keyState === undefined) return;
      cols.ecoregion.set(ecoregionKey(keyState, state), id);
    }
    cols.all.add(id);
  });

  if (!requireAll) return cols;
  const missing = [
    ...[...keyStates].filter(s => !cols.state.has(s)).map(s => `"${STATE_QUESTION}: ${s}"`),
    ...MONTHS.filter((_, i) => !cols.month.has(i + 1)).map(m => `"${MONTH_QUESTION}: ${m}"`),
    ...[...keyStates].filter(s => ![...cols.ecoregion.keys()].some(k => k.startsWith(`${s}|`)))
      .map(s => `"${ecoregionQuestion(s)}"`),
  ];
  if (missing.length > 0) {
    throw new Error(
      `key-derived-scores: data/key-scores.csv has no column for ${missing.join(', ')}. ` +
        'The key derives these answers from the records, so a renamed column must be renamed here too.'
    );
  }
  return cols;
}

/**
 * The key's ecoregion answers that no feature in the boundary file supplies, as
 * "<question>: <answer>". Empty when every answer can be reached; build-ecoregions.ts
 * refuses to write a file that leaves one out, and a test checks the committed one.
 */
export function missingKeyEcoregions(
  cols: DerivedColumns,
  features: ReadonlyArray<{ name: string; country: string }>
): string[] {
  const supplied = new Set<string>();
  for (const f of features) {
    for (const [recordState, keyState] of Object.entries(KEY_STATE_BY_RECORD_STATE)) {
      if ((recordState === 'BC') === (f.country === 'CA')) {
        supplied.add(ecoregionKey(keyState, keyEcoregionName(f.name)));
      }
    }
  }
  return [...cols.ecoregion.keys()]
    .filter(k => !supplied.has(k))
    .map(k => {
      const [keyState, answer] = k.split('|') as [string, string];
      return `${ecoregionQuestion(keyState)}: ${answer}`;
    });
}

/** The parts of an occurrence record the derivation reads. */
export interface DerivableRecord {
  species_slug: string;
  state: string | null;
  month: number | null;
  notes: string | null;
  /** The boundary file's name for the ecoregion the record falls in, or null. */
  ecoregion: string | null;
}

/**
 * The char ids each species scores 1 on, from its records. A record whose ecoregion
 * is not among its state's answers (a Washington record in the Northern Basin and
 * Range, say) adds its state and month but no ecoregion.
 */
export function deriveKeyScores(
  records: Iterable<DerivableRecord>,
  cols: DerivedColumns
): Map<string, Set<number>> {
  const scores = new Map<string, Set<number>>();
  const add = (slug: string, id: number | undefined) => {
    if (id === undefined) return;
    const ids = scores.get(slug);
    if (ids) ids.add(id);
    else scores.set(slug, new Set([id]));
  };
  for (const r of records) {
    const keyState = r.state === null ? undefined : KEY_STATE_BY_RECORD_STATE[r.state];
    if (keyState !== undefined) {
      add(r.species_slug, cols.state.get(keyState));
      if (r.ecoregion !== null) {
        add(r.species_slug, cols.ecoregion.get(ecoregionKey(keyState, keyEcoregionName(r.ecoregion))));
      }
    }
    if (r.month !== null && !isRearedRecord(r)) add(r.species_slug, cols.month.get(r.month));
  }
  return scores;
}

/** Minimal structural type for the DuckDB connection methods used here. */
interface QueryableConnection {
  run(sql: string): Promise<unknown>;
  runAndReadAll(sql: string): Promise<{ getRowObjectsJS(): unknown[] }>;
}

/**
 * Every record the site serves, with the ecoregion it falls in.
 *
 * A record looks only at its own country's ecoregions, because the US and BC
 * boundaries come from different sources and overlap along the border. A point
 * outside every polygon (most often on a shoreline the simplified boundary cuts
 * across) takes the nearest one within the district assignment's 2 km tolerance,
 * and otherwise has no ecoregion.
 */
export async function readDerivableRecords(
  conn: QueryableConnection,
  ecoregionsPath: string = resolve(ECOREGIONS_PATH)
): Promise<DerivableRecord[]> {
  if (ecoregionsPath.includes("'")) {
    throw new Error(`Refusing to build SQL for a path containing a quote: ${ecoregionsPath}`);
  }
  await conn.run('INSTALL spatial;');
  await conn.run('LOAD spatial;');
  await createAllRecordsTable(conn, 'key_records');
  await conn.run(`
    CREATE TABLE key_ecoregions AS
    SELECT name, country, geom, ST_Boundary(geom) AS edge FROM ST_Read('${ecoregionsPath}')
  `);
  // ST_Boundary on the distance side: this spatial build's ST_Distance misreports
  // polygon operands (see scripts/build-district-adjacency.ts).
  const result = await conn.runAndReadAll(`
    WITH pts AS (
      SELECT species_slug, state, month, notes,
             CASE WHEN state = 'BC' THEN 'CA' ELSE 'US' END AS country,
             ST_Point(longitude, latitude) AS p
      FROM key_records
    )
    SELECT species_slug, state, month, notes,
      coalesce(
        (SELECT min(e.name) FROM key_ecoregions e
          WHERE e.country = pts.country AND ST_Contains(e.geom, pts.p)),
        (SELECT e.name FROM key_ecoregions e
          WHERE e.country = pts.country AND ST_DWithin(e.edge, pts.p, ${FALLBACK_DEGREE_THRESHOLD})
          ORDER BY ST_Distance(e.edge, pts.p), e.name LIMIT 1)
      ) AS ecoregion
    FROM pts
  `);
  return (result.getRowObjectsJS() as Array<Record<string, unknown>>).map(r => ({
    species_slug: String(r['species_slug']),
    state: typeof r['state'] === 'string' ? r['state'] : null,
    month: typeof r['month'] === 'number' ? r['month'] : null,
    notes: typeof r['notes'] === 'string' ? r['notes'] : null,
    ecoregion: typeof r['ecoregion'] === 'string' ? r['ecoregion'] : null,
  }));
}
