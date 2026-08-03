// scripts/lib/inat.ts
// Pure iNaturalist -> occurrence-record mapping (#23). No network, no DuckDB,
// no filesystem — every function here takes its data as a parameter so the
// whole mapping is unit-testable without touching either.
//
// The network fetch, the point-in-polygon pass and the file writes live in
// scripts/sync-inat-records.ts; the curator-file migration lives in
// scripts/migrate-inat-records.ts. Both import from here.
//
// Mapping conventions are NOT invented here — they match what the curator has
// been doing by hand since 2020. data/records.csv already cites 145 iNaturalist
// observations, 29 of them tagged `collection = iNaturalist`, 142 of them with
// `record_type = photograph` and the URL in `notes`. This module automates an
// established practice rather than introducing a new one.
//
// The other three are specimens that cite an observation as DOCUMENTATION —
// see isPlainInatPhotograph() in scripts/migrate-inat-records.ts, which is why
// the handover refuses to touch them.
import { classifyCoordinate, parseCoordinate } from './district-assignment.ts';
import { isWithinRecordBounds } from './records-source.ts';
import type { InatRecordRow } from './records-source.ts';

/** iNaturalist project "PNWMoths" (https://www.inaturalist.org/projects/pnwmoths). */
export const INAT_PROJECT_ID = 298123;

/**
 * `collection` value marking a record as sourced from iNaturalist.
 *
 * Matches the 29 rows the curator entered by hand, so the species-page filter
 * bar (which builds its collection dropdown from the data) shows one option,
 * not two.
 */
export const INAT_COLLECTION = 'iNaturalist';

/**
 * `record_type` for an imported observation.
 *
 * `photograph` — an existing, already-valid value (build-data.ts rejects
 * anything else) and the one the curator already uses for iNaturalist rows.
 * A new `observation` type would be rendered raw in the map popup and would
 * split the filter dropdown for no gain; `collection = iNaturalist` already
 * separates these from specimen photography.
 */
export const INAT_RECORD_TYPE = 'photograph';

/**
 * What to do with observations whose coordinates iNaturalist has obscured.
 *
 * iNaturalist obscures a location at the observer's request (or automatically
 * for sensitive taxa) by publishing a random point inside a ~27 km box around
 * the true one. That is wider than many PNW counties, so an obscured record
 * cannot name a county — and a wrong county propagates into the range maps and
 * the Browse-by-county filters.
 *
 * It is also wider than the distance to a state line for a great many PNW
 * records, which is the subtler hazard. Deriving the STATE from the published
 * point is wrong about 1-4% of the time, concentrated exactly where you would
 * expect: sampling obscured PNW Lepidoptera observations turns up cases along
 * the Columbia River whose published point lands in Oregon while iNaturalist's
 * own place name says Washington, and vice versa. So an obscured record's
 * state is asserted only when EVERY district within its own published accuracy
 * radius agrees on one — the same unanimity rule {@link stateFromNearbyDistricts}
 * applies to unplaceable records. Near a border the neighbours disagree and the
 * record is rejected rather than filed under the wrong state.
 *
 *   'import-annotated' — import it when its state is unambiguous, annotate
 *                        `notes` with the accuracy, and leave `county` and
 *                        `district_id` BLANK so it never asserts a district.
 *                        Matches the curator's existing hand-entered practice
 *                        ("location accuracy: 26.94km; <url>").
 *   'skip'             — drop every obscured observation, and report it.
 *
 * DECIDED on #23: 'skip'. The collaborator's reasoning is a data-quality one
 * that outranks the recovery machinery below — "within 27 km of here"
 * compromises the integrity of an occurrence record whatever we do with the
 * state — plus a consent one: if an observer chose to obscure a location, we
 * respect that rather than working around it. Where an obscured record really
 * matters (a potential first state record, say), the project's coordinators
 * can ask the observer directly.
 *
 * The 'import-annotated' path is kept because it is the reversible half of the
 * decision: the unanimity and place-name machinery it depends on is also what
 * makes the state-only fallback safe for unplaceable non-obscured records, so
 * none of it is dead weight. Flip this constant to change the policy —
 * nothing else needs to change.
 */
export const OBSCURED_POLICY: 'import-annotated' | 'skip' = 'skip';

/**
 * Ranks that can be reduced to a binomial. Research grade normally implies
 * species-or-below, but the project's own rules admit `needs_id`, and an
 * identification can be rolled back to genus at any time — so this is checked,
 * not assumed.
 *
 * `hybrid` is deliberately absent. iNaturalist names a hybrid
 * `Genus species1 x species2`, whose first two words are a real site slug — so
 * accepting the rank would file a hybrid as an occurrence of the pure parent
 * species. Hybrids are reported, not imported.
 */
const BINOMIAL_RANKS = new Set(['species', 'subspecies', 'variety', 'form']);

/**
 * Observation ids inside free text.
 *
 * Deliberately tolerant of what is actually in data/records.csv: `http` and
 * `https`, a trailing `#activity_comment_587056` fragment, and trailing
 * whitespace. `(\d+)` stops at the fragment on its own.
 */
const OBSERVATION_ID_RE = /inaturalist\.org\/observations\/(\d+)/gi;

/** The canonical https URL for an observation — what goes in `notes`. */
export function observationUrl(id: string | number): string {
  return `https://www.inaturalist.org/observations/${id}`;
}

/** Every observation id cited anywhere in a piece of free text, in order. */
export function extractObservationIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids: string[] = [];
  // Fresh lastIndex per call — the regex is module-level and /g is stateful.
  OBSERVATION_ID_RE.lastIndex = 0;
  let match: RegExpExecArray | null = OBSERVATION_ID_RE.exec(text);
  while (match !== null) {
    const id = match[1];
    if (id !== undefined) ids.push(id);
    match = OBSERVATION_ID_RE.exec(text);
  }
  return ids;
}

/**
 * Every observation id already cited by a set of records.
 *
 * This is what stops the import duplicating the curator's own work: 145
 * observations are already in data/records.csv by URL, and the curator is the
 * same person who curates the project, so overlap is expected to grow. An
 * observation cited here is never emitted into data/records-inat.csv.
 */
export function collectCitedObservationIds(rows: Array<{ notes: string }>): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of extractObservationIds(row.notes)) ids.add(id);
  }
  return ids;
}

/**
 * Reduce a taxon name to a site slug the same way species.csv slugs are
 * derived: lowercase, whitespace to hyphens. Only the first two words are
 * used, so `Smerinthus cerisyi ophthalmica` reduces to `smerinthus-cerisyi`.
 */
export function binomialToSlug(taxonName: string): string {
  return taxonName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .join('-');
}

/**
 * Slugs are "alphanumeric and hyphens only" (CONTEXT.md). iNaturalist names
 * that do not reduce to one — hybrid formulas (`Genus a x b`), subgenera
 * (`Papilio (Pterourus) rutulus`) — are rejected rather than coerced.
 */
function isWellFormedSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(slug);
}

/**
 * Resolve an iNaturalist taxon to a site species slug, or null when the site
 * has no page for it.
 *
 * The curated synonym table wins over the naive slug: data/species-synonyms.csv
 * is an explicit statement that a binomial belongs to a particular site
 * species (e.g. `Grammia doris` -> `apantesis-doris`), which is exactly the
 * taxonomic drift issue #23 wants to absorb.
 *
 * Returning null is a normal outcome, not an error: iNaturalist's taxonomy is
 * not ours, and it sometimes moves a record onto a name we have no page for
 * (`Pseudaletia unipuncta`, `Furcula gigans` both occur in the current data).
 * Those go to the report for a human decision — never silently dropped, and
 * never used to overwrite a curator's identification.
 */
export function resolveSpeciesSlug(
  taxonName: string,
  rank: string,
  siteSlugs: Set<string>,
  synonyms: Map<string, string>,
): string | null {
  if (!BINOMIAL_RANKS.has(rank)) return null;
  // A hybrid formula can reach here as rank `species` on some taxa; the
  // multiplication sign is the giveaway either way.
  if (/[x\u00d7]\s/i.test(taxonName) && taxonName.trim().split(/\s+/).length > 2) return null;
  const synonym = synonyms.get(taxonName.trim().toLowerCase());
  if (synonym !== undefined && siteSlugs.has(synonym)) return synonym;
  const slug = binomialToSlug(taxonName);
  if (!isWellFormedSlug(slug)) return null;
  return siteSlugs.has(slug) ? slug : null;
}

/**
 * State/province by district-id prefix — US Census state FIPS and StatCan
 * province codes.
 *
 * The district id is derived from the committed boundary geometry, so this is
 * an exact lookup with no ambiguity. It deliberately replaces a reverse lookup
 * through data/district-crosswalk.csv, which is NOT a function in that
 * direction: `US:41037` appears there as both `OR,Lake` and `WA,Lake` (a legacy
 * data-entry fix), so a crosswalk-keyed reverse map would put an Oregon
 * coordinate in Washington depending on row order.
 */
const STATE_BY_DISTRICT_PREFIX: Record<string, string> = {
  'US:16': 'ID',
  'US:30': 'MT',
  'US:41': 'OR',
  'US:53': 'WA',
  'CA:59': 'BC',
  'CA:48': 'AB',
};

/**
 * The state/province a district id belongs to, or null when the prefix is not
 * one of the six the site covers.
 *
 * Null is a hard stop for the import, not a blank cell. The PNW coordinate
 * bounds build-data.ts enforces (lat 42-60, lon -139..-110) are much larger
 * than the six jurisdictions: they also contain northwest Wyoming, the Alaska
 * panhandle, the Yukon border and most of Alberta. A record from any of those
 * would pass validation with an empty state — build-data.ts exempts NULL and
 * empty from its state check — and land on a species map invisible to every
 * filter. Failing closed here is what prevents that.
 */
export function stateForDistrictId(districtId: string): string | null {
  return STATE_BY_DISTRICT_PREFIX[districtId.slice(0, 5)] ?? null;
}

/** One data/district-crosswalk.csv row. */
export interface CrosswalkEntry {
  state: string;
  legacy_name: string;
  stable_id: string;
}

/** Crosswalk rows indexed by stable_id. A stable_id may have several. */
export function buildCrosswalkIndex(entries: CrosswalkEntry[]): Map<string, CrosswalkEntry[]> {
  const index = new Map<string, CrosswalkEntry[]>();
  for (const entry of entries) {
    const list = index.get(entry.stable_id);
    if (list) list.push(entry);
    else index.set(entry.stable_id, [entry]);
  }
  return index;
}

/**
 * Compare district names across sources that spell them differently: the
 * boundary GeoJSON says `Lewis and Clark` and `Division No.  4` (two spaces);
 * the crosswalk and records.csv say `Lewis & Clark`.
 */
function normalizeDistrictName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

/**
 * The county/regional-district NAME to write, or '' when it cannot be
 * established unambiguously.
 *
 * Blank is a deliberate, safe outcome — it is already the state of thousands
 * of curator rows, and it costs the record only its Browse-by-county entry,
 * whereas a wrong name would put a species in a district it does not occur in.
 * Two known cases produce it:
 *
 *   - 21 eastern-Montana districts exist in the boundary file with no
 *     crosswalk row at all. All 21 are outside data/mt-county-allowlist.csv,
 *     so they are not Browse-selectable regardless.
 *   - Four stable_ids carry two names (`US:16029` Beaver/Caribou, `CA:5901`
 *     Cranbrook/East Kootenay, `CA:5915` Greater/Metro Vancouver). Where the
 *     boundary file's own name picks one, that wins — it is the authority the
 *     district id came from. Where it matches neither, blank.
 *
 * The curator's spelling is always preferred over the GeoJSON's when both
 * refer to the same district, so the import never introduces a second spelling
 * of a county that would split the Browse filter into two entries.
 */
export function countyForDistrict(
  districtId: string,
  state: string,
  districtName: string | null,
  crosswalk: Map<string, CrosswalkEntry[]>,
): string {
  const candidates = (crosswalk.get(districtId) ?? []).filter((e) => e.state === state);
  if (candidates.length === 1) return candidates[0]?.legacy_name ?? '';
  if (candidates.length === 0) return '';
  if (districtName === null) return '';
  const target = normalizeDistrictName(districtName);
  const matched = candidates.find((e) => normalizeDistrictName(e.legacy_name) === target);
  return matched?.legacy_name ?? '';
}

/** Why an observation in the project did not become (or stay) a record. */
export type SkipReason =
  | 'left-project'
  | 'not-research-grade'
  | 'rank-above-species'
  | 'unresolved-taxon'
  | 'no-coordinates'
  | 'axis-order-suspect'
  | 'out-of-bounds'
  | 'obscured'
  | 'no-district'
  | 'already-curated';

/** Human-readable gloss for each skip/removal reason, used in the report. */
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  'left-project': 'no longer in the iNaturalist project',
  'not-research-grade': 'in the project but no longer research grade',
  'rank-above-species': 'identified only to genus or above',
  'unresolved-taxon': 'identified as a taxon with no page on the site',
  'no-coordinates': 'no usable coordinates',
  'axis-order-suspect': 'latitude and longitude look swapped',
  'out-of-bounds': 'outside the Pacific Northwest',
  obscured: 'location obscured by the observer',
  'no-district': 'coordinates fall outside every known county or district',
  'already-curated': 'already entered by hand in records.csv',
};

/** The iNaturalist v2 fields this module needs. */
export interface InatObservation {
  id: number;
  quality_grade: string;
  observed_on: string | null;
  geojson: { coordinates: number[] } | null;
  obscured: boolean;
  public_positional_accuracy: number | null;
  place_guess: string | null;
  taxon: { id: number; name: string; rank: string } | null;
  user: { id: number; login: string; name: string | null } | null;
}

/**
 * Reject a response that is not shaped the way this module assumes.
 *
 * Every CSV in this pipeline is validated before use; the network response was
 * the one input that was not. It matters most for `obscured`, which fails OPEN:
 * if iNaturalist renamed or dropped that field, `obs.obscured` would be
 * `undefined`, every obscured observation would be treated as precise, and each
 * would be published with a county and district derived from a deliberately
 * randomised point — silently, and in exactly the way OBSCURED_POLICY exists to
 * prevent. A missing `quality_grade` would instead reject everything, which the
 * blast-radius guard catches; nothing catches a missing `obscured`.
 *
 * Checked per observation so the error names the first bad one.
 *
 * @throws {Error} If a required field is absent.
 */
export function assertObservationShape(obs: InatObservation): void {
  const missing: string[] = [];
  if (typeof obs.id !== 'number') missing.push('id');
  if (typeof obs.quality_grade !== 'string') missing.push('quality_grade');
  if (typeof obs.obscured !== 'boolean') missing.push('obscured');
  if (!('observed_on' in obs)) missing.push('observed_on');
  if (!('geojson' in obs)) missing.push('geojson');
  if (!('place_guess' in obs)) missing.push('place_guess');
  if (!('taxon' in obs)) missing.push('taxon');
  if (!('user' in obs)) missing.push('user');
  if (missing.length === 0) return;
  throw new Error(
    `iNaturalist observation ${String(obs.id ?? '?')} is missing expected field(s): ` +
      `${missing.join(', ')}. The v2 API's response shape has changed, or the fields= list is ` +
      'out of date. Nothing was written — importing under a changed shape can publish records ' +
      'with wrong locations.',
  );
}

/** An observation that passed screening, awaiting its district assignment. */
export interface Candidate {
  inatId: string;
  speciesSlug: string;
  latitude: number;
  longitude: number;
  locality: string;
  year: string;
  month: string;
  day: string;
  collector: string;
  /** True when iNaturalist published a deliberately imprecise location. */
  obscured: boolean;
  /** Accuracy annotation for `notes`, e.g. `location accuracy: 26.94km`. */
  accuracyNote: string;
  /** Published accuracy radius in km, when known — the obscuration box size. */
  accuracyKm: number | null;
}

export interface Skipped {
  inatId: string;
  reason: SkipReason;
  detail: string;
}

export type ScreenResult =
  | { ok: true; candidate: Candidate }
  | { ok: false; skipped: Skipped };

export interface ScreenContext {
  /** Every slug with a row in species.csv. */
  siteSlugs: Set<string>;
  /** Lowercased binomial -> site slug, from data/species-synonyms.csv. */
  synonyms: Map<string, string>;
  /**
   * Overrides {@link OBSCURED_POLICY}. Production never sets it — the constant
   * is the single switch. It exists so both branches stay under test: the
   * alternative is documented as one constant away, and a claim like that is
   * worth only as much as the test behind it.
   */
  obscuredPolicy?: 'import-annotated' | 'skip';
}

/** `observed_on` is a local calendar date (`YYYY-MM-DD`); split it as text.
 *
 * Never parse it as a Date: `time_observed_at` is a UTC instant, and running
 * either through the timezone machinery shifts an evening observation to the
 * following day. Most moth records are made at night. */
function splitObservedOn(observedOn: string | null): { year: string; month: string; day: string } {
  const parts = (observedOn ?? '').split('-');
  const [year, month, day] = parts;
  if (parts.length !== 3 || !year || !month || !day) return { year: '', month: '', day: '' };
  return { year, month: String(Number(month)), day: String(Number(day)) };
}

/**
 * Decide whether one observation should become a record, and map the fields
 * that do not depend on geography.
 *
 * Every rejection is reported, never silent. The district-dependent fields
 * (state, county, district_id) are filled afterwards by {@link finalizeRow},
 * once the point-in-polygon pass has run.
 */
export function screenObservation(obs: InatObservation, ctx: ScreenContext): ScreenResult {
  const inatId = String(obs.id);
  const skip = (reason: SkipReason, detail: string): ScreenResult => ({
    ok: false,
    skipped: { inatId, reason, detail },
  });

  if (obs.quality_grade !== 'research') {
    return skip('not-research-grade', obs.quality_grade);
  }

  // NOTE: whether this observation is already cited in records.csv is
  // deliberately NOT checked here. `already-curated` is the handover worklist
  // that scripts/migrate-inat-records.ts deletes curator rows from, so it must
  // mean "this WOULD have been imported" — a claim that cannot be made until
  // every other gate, including the district gates in finalizeRow, has passed.
  // Checking it early made it a claim the code had not verified: observations
  // 62265205 (Pseudaletia unipuncta) and 47673376 (Furcula gigans) are both
  // research grade, both cited in records.csv, and both resolve to taxa with
  // no page here — so an early check would list them as handover candidates,
  // migrate would delete the curator rows, and the next sync would reject them
  // as unresolved-taxon. The records would be gone. See buildRows().
  const taxon = obs.taxon;
  if (!taxon) return skip('rank-above-species', 'no identification');
  if (!BINOMIAL_RANKS.has(taxon.rank)) return skip('rank-above-species', `${taxon.name} (${taxon.rank})`);

  const speciesSlug = resolveSpeciesSlug(taxon.name, taxon.rank, ctx.siteSlugs, ctx.synonyms);
  if (speciesSlug === null) return skip('unresolved-taxon', taxon.name);

  const coords = obs.geojson?.coordinates;
  const longitude = parseCoordinate(coords?.[0]);
  const latitude = parseCoordinate(coords?.[1]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return skip('no-coordinates', obs.place_guess ?? '');
  }

  // Two gates, both required. classifyCoordinate runs the mandatory
  // axis-order guard and the DISTRICT-ASSIGNMENT bounds (sized to the boundary
  // geometry); isWithinRecordBounds applies the narrower PUBLISHING bounds
  // build-data.ts enforces. A coordinate can pass the first and fail the
  // second — eastern Montana at lon -105, say — and importing it would write a
  // row that hard-fails the next build.
  const outcome = classifyCoordinate(latitude, longitude);
  if (outcome === 'axis-order-suspect') return skip('axis-order-suspect', `${latitude}, ${longitude}`);
  if (outcome === 'out-of-bounds') return skip('out-of-bounds', `${latitude}, ${longitude}`);
  if (!isWithinRecordBounds(latitude, longitude)) {
    return skip('out-of-bounds', `${latitude}, ${longitude}`);
  }

  if (obs.obscured && (ctx.obscuredPolicy ?? OBSCURED_POLICY) === 'skip') {
    return skip('obscured', `${accuracyKm(obs) ?? 'unknown'} km`);
  }

  const user = obs.user;
  const { year, month, day } = splitObservedOn(obs.observed_on);

  return {
    ok: true,
    candidate: {
      inatId,
      speciesSlug,
      latitude,
      longitude,
      locality: (obs.place_guess ?? '').trim(),
      year,
      month,
      day,
      // user.name is a free-text profile field the observer can edit at any
      // time; login is stable. Preferring the display name matches the
      // curator's hand-entered rows, at the cost of an occasional "changed"
      // line in the summary when someone fills in their profile.
      collector: (user?.name || user?.login || '').trim(),
      obscured: obs.obscured,
      // No annotation when the accuracy is unknown — "location accuracy: ?km"
      // would be published to the site as-is.
      accuracyNote:
        obs.obscured && accuracyKm(obs) !== null ? `location accuracy: ${accuracyKm(obs)}km` : '',
      accuracyKm:
        obs.public_positional_accuracy !== null &&
        Number.isFinite(obs.public_positional_accuracy)
          ? obs.public_positional_accuracy / 1000
          : null,
    },
  };
}

/** Published accuracy in km to 2dp, or null when unknown. */
function accuracyKm(obs: InatObservation): string | null {
  const metres = obs.public_positional_accuracy;
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return null;
  return (metres / 1000).toFixed(2);
}

/**
 * How far from a district a coordinate may sit and still have its STATE
 * inferred from the districts around it.
 *
 * Distinct from the ~2 km district-assignment fallback, and doing a different
 * job: that tolerance decides which district a point is in, this one only asks
 * whether everything nearby agrees on the state. A coastal or on-the-water
 * record can be several km from any polygon — observation 90573451 sits in the
 * Strait of Georgia, 5.7 km from Nanaimo and 5.9 km from Cowichan Valley —
 * and is a perfectly good record that simply cannot be pinned to a district.
 */
export const NEARBY_STATE_KM = 25;

/**
 * The state every nearby district agrees on, or null if they disagree (or
 * there are none).
 *
 * Unanimity is what makes this safe, not the distance. Near an international
 * or state line the candidates disagree and this returns null, so the record
 * is rejected rather than assigned to the wrong side. In open water well
 * inside one jurisdiction they all agree, and the state is certain even though
 * the district is not.
 */
export function stateFromNearbyDistricts(districtIds: string[]): string | null {
  const states = new Set<string>();
  for (const id of districtIds) {
    const state = stateForDistrictId(id);
    if (state === null) return null;
    states.add(state);
  }
  if (states.size !== 1) return null;
  const [only] = [...states];
  return only ?? null;
}

/** ISO-3166-2 subdivision codes as iNaturalist writes them in a place name. */
const STATE_BY_SUBDIVISION_CODE: Record<string, string> = {
  'us-wa': 'WA',
  'us-or': 'OR',
  'us-id': 'ID',
  'us-mt': 'MT',
  'ca-bc': 'BC',
  'ca-ab': 'AB',
};

/** Full names, for place names that carry no subdivision code. */
const STATE_BY_FULL_NAME: Record<string, string> = {
  washington: 'WA',
  oregon: 'OR',
  idaho: 'ID',
  montana: 'MT',
  'british columbia': 'BC',
  alberta: 'AB',
};

/**
 * The state named by an iNaturalist place description, or null if it names
 * none or more than one.
 *
 * For an OBSCURED observation this is authoritative in a way the coordinates
 * are not: iNaturalist replaces the displayed place with a standard
 * administrative place that CONTAINS the true location, while the published
 * point is randomised within a ~27 km box. So where the coordinates say
 * "somewhere within 27 km of here", this says "in this county".
 *
 * The subdivision code wins over the full name, and the reason is a real trap:
 * `Washington County, US-OR, US` is in OREGON. Matching on full names first
 * would see "washington" and file an Oregon record under Washington.
 *
 * Only used for obscured records. For everything else the coordinates are
 * better evidence than a free-text field the observer can edit.
 */
export function stateFromPlaceGuess(placeGuess: string | null): string | null {
  if (!placeGuess) return null;
  const text = placeGuess.toLowerCase();

  const byCode = new Set<string>();
  for (const [code, state] of Object.entries(STATE_BY_SUBDIVISION_CODE)) {
    if (new RegExp(`\\b${code}\\b`).test(text)) byCode.add(state);
  }
  if (byCode.size === 1) {
    const [only] = [...byCode];
    return only ?? null;
  }
  if (byCode.size > 1) return null;

  const byName = new Set<string>();
  for (const [name, state] of Object.entries(STATE_BY_FULL_NAME)) {
    if (text.includes(name)) byName.add(state);
  }
  if (byName.size !== 1) return null;
  const [only] = [...byName];
  return only ?? null;
}

/**
 * Where a screened candidate ended up geographically.
 *
 *   'district'   — inside (or within the ~2 km fallback of) exactly one
 *                  district. The normal case; county and district_id are set.
 *   'state-only' — no district, but every district within
 *                  {@link NEARBY_STATE_KM} agrees on the state. The record is
 *                  kept with a state and BLANK county/district_id, the same
 *                  shape an obscured record takes.
 *   'none'       — unplaceable. Rejected to the report.
 */
export type Placement =
  | { kind: 'district'; districtId: string; districtName: string | null }
  | { kind: 'state-only'; state: string }
  | { kind: 'none' };

export type FinalizeResult =
  | { ok: true; row: InatRecordRow }
  | { ok: false; skipped: Skipped };

/**
 * Complete a screened candidate into a records-inat.csv row, given where it
 * ended up geographically.
 *
 * Fails closed: a candidate that could not be placed at all, and one whose
 * district belongs to no covered state, are rejected rather than written with
 * blank geography. A record with no state would pass build-data.ts (which
 * exempts NULL and empty from its state allow-list) and then be invisible to
 * every filter on the species page.
 *
 * Two cases keep a state but assert NO district — an obscured candidate, and
 * one placed only to a state. Both are records whose position is known less
 * precisely than a district, and blanking county/district_id is what stops
 * them contributing a district they may not actually be in.
 */
export function finalizeRow(
  candidate: Candidate,
  placement: Placement,
  crosswalk: Map<string, CrosswalkEntry[]>,
): FinalizeResult {
  const skip = (reason: SkipReason, detail: string): FinalizeResult => ({
    ok: false,
    skipped: { inatId: candidate.inatId, reason, detail },
  });

  if (placement.kind === 'none') {
    return skip('no-district', `${candidate.latitude}, ${candidate.longitude}`);
  }

  let state: string;
  let county = '';
  let districtId = '';

  if (placement.kind === 'state-only') {
    state = placement.state;
  } else {
    const resolved = stateForDistrictId(placement.districtId);
    if (resolved === null) {
      return skip('no-district', `district ${placement.districtId} is outside the covered states`);
    }
    state = resolved;
    if (!candidate.obscured) {
      county = countyForDistrict(placement.districtId, state, placement.districtName, crosswalk);
      districtId = placement.districtId;
    }
  }

  const url = observationUrl(candidate.inatId);
  const notes = candidate.accuracyNote ? `${candidate.accuracyNote}; ${url}` : url;

  return {
    ok: true,
    row: {
      species_slug: candidate.speciesSlug,
      record_type: INAT_RECORD_TYPE,
      latitude: String(candidate.latitude),
      longitude: String(candidate.longitude),
      state,
      county,
      locality: candidate.locality,
      elevation_ft: '',
      year: candidate.year,
      month: candidate.month,
      day: candidate.day,
      collector: candidate.collector,
      collection: INAT_COLLECTION,
      notes,
      district_id: districtId,
      inat_id: candidate.inatId,
    },
  };
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface FieldChange {
  column: string;
  before: string;
  after: string;
}

export interface RecordChange {
  kind: 'added' | 'updated' | 'removed';
  inatId: string;
  row: InatRecordRow;
  /** Populated for 'updated'. */
  fields: FieldChange[];
  /** Populated for 'removed' — why it is going away. */
  reason: SkipReason | null;
}

/**
 * Compare the previously committed rows against the freshly built ones.
 *
 * Keyed on `inat_id` throughout — never on content. The one observation
 * currently in both the project and records.csv shows why: the curator wrote
 * the observer as `M. Patterson` where iNaturalist says `Mike Patterson`, so
 * content matching would call the same record two different records.
 *
 * `removalReasons` distinguishes outcomes the collaborator asked to tell
 * apart: an observation removed from the project is not the same event as one
 * whose identification was overturned, and they call for different responses.
 */
export function reconcile(
  previous: InatRecordRow[],
  next: InatRecordRow[],
  removalReasons: Map<string, SkipReason>,
): RecordChange[] {
  const before = new Map(previous.map((r) => [r.inat_id, r]));
  const after = new Map(next.map((r) => [r.inat_id, r]));
  const changes: RecordChange[] = [];

  for (const row of next) {
    const prior = before.get(row.inat_id);
    if (!prior) {
      changes.push({ kind: 'added', inatId: row.inat_id, row, fields: [], reason: null });
      continue;
    }
    const fields: FieldChange[] = [];
    for (const column of Object.keys(row) as Array<keyof InatRecordRow>) {
      const a = prior[column];
      const b = row[column];
      if (a !== b) fields.push({ column, before: a, after: b });
    }
    if (fields.length > 0) {
      changes.push({ kind: 'updated', inatId: row.inat_id, row, fields, reason: null });
    }
  }

  // Iterated over the de-duplicated map, not the raw array: a repeated
  // inat_id (only reachable by a hand-edit of a machine-owned file, or a
  // partial write) would otherwise emit two removals for one record and
  // inflate the count the blast-radius guard reads.
  for (const row of before.values()) {
    if (after.has(row.inat_id)) continue;
    changes.push({
      kind: 'removed',
      inatId: row.inat_id,
      row,
      fields: [],
      reason: removalReasons.get(row.inat_id) ?? null,
    });
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Blast-radius guard
// ---------------------------------------------------------------------------

/** Fraction of existing rows whose removal in one run is treated as suspect. */
export const BLAST_RADIUS_FRACTION = 0.2;

/**
 * Ceiling on the absolute floor below which the fraction is ignored.
 *
 * A fixed floor of 25 would be worse than none on a small file: at 62 imported
 * records it makes the fraction rule unreachable (25 rows is already 40%), so
 * every removal up to 25 — nearly half the corpus — passes unremarked. The
 * effective floor is therefore min(this, a quarter of the file), which keeps
 * the guard meaningful as the file grows without making it fire on every
 * ordinary prune while it is small.
 */
export const BLAST_RADIUS_MAX_FLOOR = 25;

/** The floor actually applied for a file of `previousCount` rows. */
export function blastRadiusFloor(previousCount: number): number {
  return Math.min(BLAST_RADIUS_MAX_FLOOR, Math.ceil(previousCount / 4));
}

export interface GuardResult {
  tripped: boolean;
  message: string;
}

/**
 * Refuse a run that would delete an implausible share of the imported records.
 *
 * The failure this exists for is an iNaturalist outage or a project rename
 * returning few or no observations, which is indistinguishable from "the
 * project legitimately shrank" without a human looking. Emptying a non-empty
 * file always trips, whatever the counts.
 */
export function guardBlastRadius(previousCount: number, removedCount: number): GuardResult {
  if (previousCount === 0 || removedCount === 0) return { tripped: false, message: '' };
  const remaining = previousCount - removedCount;
  if (remaining === 0) {
    return {
      tripped: true,
      message: `all ${previousCount} imported records would be removed`,
    };
  }
  const share = removedCount / previousCount;
  if (removedCount > blastRadiusFloor(previousCount) && share > BLAST_RADIUS_FRACTION) {
    return {
      tripped: true,
      message:
        `${removedCount} of ${previousCount} imported records ` +
        `(${(share * 100).toFixed(0)}%) would be removed`,
    };
  }
  return { tripped: false, message: '' };
}

// ---------------------------------------------------------------------------
// Reviewable summary
// ---------------------------------------------------------------------------

/** `2016-08-02` from the year/month/day columns, or as much as is known. */
function formatRecordDate(row: InatRecordRow): string {
  if (!row.year) return 'undated';
  const pad = (v: string): string => (v.length === 1 ? `0${v}` : v);
  if (!row.month) return row.year;
  if (!row.day) return `${row.year}-${pad(row.month)}`;
  return `${row.year}-${pad(row.month)}-${pad(row.day)}`;
}

/** One record, identified the way a person would recognise it. */
function describeRecord(row: InatRecordRow): string {
  const place = [row.locality, row.county && `${row.county} Co.`, row.state]
    .filter(Boolean)
    .join(', ');
  return [row.species_slug, formatRecordDate(row), row.collector || 'unknown observer', place]
    .filter(Boolean)
    .join('  |  ');
}

/**
 * The human-readable run summary — the thing the maintainer actually reviews.
 *
 * This is the review surface, not the git diff: the person running the sync
 * curates the iNaturalist project and needs to see the result in the terms he
 * curated it in (which species, whose observation, from where), not as CSV
 * line noise. Removals carry their reason, because "you took it out of the
 * project" and "someone overturned the identification" call for different
 * responses from him.
 */
export function formatSummary(changes: RecordChange[], skipped: Skipped[]): string {
  const lines: string[] = [];
  const byKind = (kind: RecordChange['kind']): RecordChange[] =>
    changes.filter((c) => c.kind === kind);

  const added = byKind('added');
  const updated = byKind('updated');
  const removed = byKind('removed');

  if (changes.length === 0) {
    lines.push('No changes — the imported records already match the iNaturalist project.');
  }

  if (added.length > 0) {
    lines.push(`Added (${added.length}):`);
    for (const change of added) lines.push(`  + ${describeRecord(change.row)}`);
    lines.push('');
  }

  if (updated.length > 0) {
    lines.push(`Updated (${updated.length}):`);
    for (const change of updated) {
      lines.push(`  ~ ${describeRecord(change.row)}`);
      for (const field of change.fields) {
        lines.push(`      ${field.column}: ${field.before || '(blank)'} -> ${field.after || '(blank)'}`);
      }
    }
    lines.push('');
  }

  if (removed.length > 0) {
    lines.push(`Removed (${removed.length}):`);
    for (const change of removed) {
      const why = change.reason ? SKIP_REASON_LABEL[change.reason] : 'no longer in the project';
      lines.push(`  - ${describeRecord(change.row)}`);
      lines.push(`      reason: ${why}`);
    }
    lines.push('');
  }

  // 'already-curated' is not really a rejection — it is the migration
  // worklist. Each one is an observation that is BOTH in the project and
  // already hand-entered in records.csv, i.e. a record that can now be handed
  // over to the sync and become self-updating. Listing them individually is
  // what makes the "one file, eventually" convergence actionable rather than
  // aspirational; folding them into a count would bury it.
  const alreadyCurated = skipped.filter((s) => s.reason === 'already-curated');
  const rejected = skipped.filter((s) => s.reason !== 'already-curated');

  if (rejected.length > 0) {
    const counts = new Map<SkipReason, number>();
    for (const s of rejected) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
    lines.push('Not imported:');
    for (const [reason, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${count} ${SKIP_REASON_LABEL[reason]}`);
    }
    lines.push('  (full detail in data/inat-sync-report.csv)');
    lines.push('');
  }

  if (alreadyCurated.length > 0) {
    lines.push(`Already in records.csv by hand (${alreadyCurated.length}):`);
    for (const s of alreadyCurated) lines.push(`  ${s.detail}`);
    lines.push('  These are in the project AND entered by hand, so they are not');
    lines.push('  imported twice. Some can be handed over to the sync so they stay');
    lines.push('  up to date automatically — run "npm run inat:migrate" to see which');
    lines.push('  (it refuses any whose hand-entered detail it cannot reproduce).');
    lines.push('');
  }

  return lines.join('\n');
}
