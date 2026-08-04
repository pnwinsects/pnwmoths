// scripts/build-checklist-order.ts
// Materializes data/checklist-order.csv: every species in *checklist order* —
// the phylogenetic sequence a printed checklist uses (Drepanidae before
// Noctuidae, Habrosyne before Ceranemota), not alphabetical.
//
// Why the Moths Photographers Group list is the source (ADR 0029):
//
//   Nothing in data/ encodes sequence. `noc_id` is unusable as a sort key —
//   blanks, three incompatible formats, duplicate values — and says nothing
//   about the order of families, subfamilies, or tribes. The order was
//   previously reconstructed by walking the legacy django-cms nested set, but
//   that tree can only place taxa that existed when it was dumped: every
//   species added since needed a curator decision. MPG covers all of North
//   America, so a new PNW species arrives with a position already assigned.
//
// One sort key is enough. Restricted to the species we hold, every one of our
// genera occupies a single unbroken block of MPG rows (asserted by the tests),
// so ordering species by MPG row reproduces family, subfamily, tribe, and genus
// order for free. That is why this emits one file, not the four a rank-by-rank
// encoding would need.
//
// **Row order is the data.** There is deliberately no ordinal column — an
// integer would have to be renumbered downstream of every insertion. `mpg_p_no`
// is provenance, not the sort key: MPG renumbers between releases, so it exists
// to diff a future release against this one, not to re-sort by.
//
// Matching runs in tiers, most literal first, and each tier is either
// mechanical or an explicit committed decision — nothing is guessed:
//
//   exact        genus + epithet, after normalizing MPG's notation
//   gender       Latin gender-ending variant (californicum / californica)
//   mona         our `noc_id` as a MONA number (not the `93-` Poole numbers,
//                which MPG's MONA column does not carry)
//   synonymy     the full original combination appears in MPG's Synonymy cell
//                and names exactly one MPG row
//   crosswalk    data/mpg-crosswalk.csv — a curator decision, with its source
//
// Anything still unmatched falls to the end of its genus, alphabetically, and
// is REPORTED on every run so the fallback stays a visible decision rather than
// a silent one. Provisional names (`sp`, `n sp`, `aff x`, `nr x`) are expected
// to land here — being undescribed, they have no MPG row and never will.
//
// Run: node scripts/build-checklist-order.ts
//      DRY_RUN=1 node scripts/build-checklist-order.ts   # report only; no write
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface MpgRow {
  'P No': string;
  MONA: string;
  Genus: string;
  Species: string;
  Family: string;
  Synonymy: string;
}

export interface SpeciesRow {
  genus: string;
  species: string;
  noc_id: string;
  family: string;
}

export interface CrosswalkRow {
  species_slug: string;
  mpg_binomial: string;
  source: string;
}

export type MatchTier = 'exact' | 'gender' | 'mona' | 'synonymy' | 'crosswalk' | 'unplaced';

export interface PlacedSpecies {
  species_slug: string;
  mpg_p_no: string;
  matched_via: MatchTier;
}

export const slugOf = (row: { genus: string; species: string }): string =>
  `${row.genus}-${row.species}`.toLowerCase();

/**
 * MPG marks a genus whose placement it considers unresolved by quoting it
 * *inside the cell* — the Genus column literally reads `"Cryphia"` — and
 * disambiguates reused names with a parenthetical, `"Perizoma" (Group 2)`.
 * Both are notation about MPG's confidence, not part of the name.
 */
export const normalizeGenus = (genus: string): string =>
  genus.replace(/"/g, '').replace(/\s*\([^)]*\)/g, '').trim();

/**
 * `concisa of authors` flags an epithet applied to a North American taxon that
 * probably is not the Old World species of that name. Same idea: notation.
 * Trinomials (`laticapitana heinrichi`, a subspecies) are deliberately left
 * whole — truncating them to the first word would collide with the nominate
 * species and silently steal its position.
 */
export const normalizeEpithet = (epithet: string): string =>
  epithet.replace(/"/g, '').replace(/\s+of authors$/i, '').trim();

export const mpgKey = (genus: string, epithet: string): string =>
  `${normalizeGenus(genus)}-${normalizeEpithet(epithet)}`.toLowerCase();

/**
 * MONA numbers are zero-padded in MPG (`0001`) and prefixed in our data
 * (`MONA 7731`). A `93-` value is a Poole 1989 Noctuoidea number, a different
 * series that MPG's MONA column does not carry — treating it as a MONA number
 * would match an unrelated moth, so it yields null.
 */
export function monaKey(nocId: string): string | null {
  const trimmed = nocId.replace(/^MONA\s*/i, '').trim();
  if (!trimmed || trimmed.startsWith('93-')) return null;
  const normalized = trimmed.replace(/^0+/, '');
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

/**
 * Latin epithets agree in gender with their genus, so a species moved between
 * genera changes ending (`californicum` -> `californica`). Only the endings
 * that actually vary are tried, and the stem must be non-trivial.
 */
export function genderVariants(epithet: string): string[] {
  const stem = epithet.replace(/(us|um|a|is|e|ii|i)$/, '');
  if (stem.length < 3) return [];
  return ['us', 'um', 'a', 'is', 'e', 'ii', 'i']
    .map((ending) => stem + ending)
    .filter((variant) => variant !== epithet);
}

export interface MpgIndex {
  byBinomial: Map<string, number>;
  byMona: Map<string, number>;
  bySynonym: Map<string, number[]>;
  rows: MpgRow[];
}

/** All lookups resolve to a row *index*, which is MPG sequence — the sort key. */
export function buildMpgIndex(rows: MpgRow[]): MpgIndex {
  const byBinomial = new Map<string, number>();
  const byMona = new Map<string, number>();
  const bySynonym = new Map<string, number[]>();
  rows.forEach((row, index) => {
    // First row wins: MPG lists a name once, and a later duplicate would be the
    // subspecies or homonym, never the species we want.
    const binomial = mpgKey(row.Genus, row.Species);
    if (!byBinomial.has(binomial)) byBinomial.set(binomial, index);
    const mona = row.MONA.replace(/^0+/, '');
    if (mona && !byMona.has(mona)) byMona.set(mona, index);
    // Synonymy cells list original combinations ("Syneda nubicola Behr, 1870"),
    // so the genus there is usually NOT the current one. Collect every
    // binomial mentioned; a name naming two rows is ambiguous and unusable.
    for (const match of (row.Synonymy ?? '').matchAll(/\b([A-Z][a-z]+)\s+([a-z][a-z-]+)\b/g)) {
      const key = `${match[1]}-${match[2]}`.toLowerCase();
      const seen = bySynonym.get(key);
      if (!seen) bySynonym.set(key, [index]);
      else if (!seen.includes(index)) seen.push(index);
    }
  });
  return { byBinomial, byMona, bySynonym, rows };
}

export interface Match {
  index: number;
  via: MatchTier;
}

export function matchSpecies(
  species: SpeciesRow,
  index: MpgIndex,
  crosswalk: Map<string, string>,
): Match | null {
  const slug = slugOf(species);

  const exact = index.byBinomial.get(slug);
  if (exact !== undefined) return { index: exact, via: 'exact' };

  for (const variant of genderVariants(species.species)) {
    const hit = index.byBinomial.get(`${species.genus}-${variant}`.toLowerCase());
    if (hit !== undefined) return { index: hit, via: 'gender' };
  }

  const mona = monaKey(species.noc_id);
  if (mona !== null) {
    const hit = index.byMona.get(mona);
    if (hit !== undefined) return { index: hit, via: 'mona' };
  }

  const synonyms = index.bySynonym.get(slug);
  const onlySynonym = synonyms?.length === 1 ? synonyms[0] : undefined;
  if (onlySynonym !== undefined) return { index: onlySynonym, via: 'synonymy' };

  const target = crosswalk.get(slug);
  if (target !== undefined) {
    const [genus = '', ...rest] = target.split(' ');
    const hit = index.byBinomial.get(mpgKey(genus, rest.join(' ')));
    if (hit === undefined) {
      throw new Error(`crosswalk target not in MPG: ${slug} -> ${target}`);
    }
    return { index: hit, via: 'crosswalk' };
  }

  return null;
}

export interface OrderResult {
  ordered: PlacedSpecies[];
  unplaced: string[];
  /** Genera with no placed species at all — their whole block is guesswork. */
  unplacedGenera: string[];
  tierCounts: Map<MatchTier, number>;
}

/**
 * Orders every species, then splices the unmatched ones in.
 *
 * An unmatched species goes at the END of its own genus, alphabetically among
 * its unmatched siblings. It cannot go anywhere better: we know its genus (from
 * species.csv) but nothing about where it sits inside it.
 *
 * A genus with no placed species at all has no anchor inside any genus, so it
 * goes at the end of its FAMILY — the narrowest block we can still identify
 * from species.csv. Appending it to the end of the file instead would split
 * that family in two, and a checklist page renders families as blocks.
 */
export function orderSpecies(
  speciesRows: SpeciesRow[],
  index: MpgIndex,
  crosswalk: Map<string, string>,
): OrderResult {
  const tierCounts = new Map<MatchTier, number>();
  const placed: Array<{ slug: string; mpgIndex: number; via: MatchTier }> = [];
  const unmatchedByGenus = new Map<string, string[]>();
  const unplaced: string[] = [];

  for (const species of speciesRows) {
    const slug = slugOf(species);
    const match = matchSpecies(species, index, crosswalk);
    if (match) {
      tierCounts.set(match.via, (tierCounts.get(match.via) ?? 0) + 1);
      placed.push({ slug, mpgIndex: match.index, via: match.via });
    } else {
      tierCounts.set('unplaced', (tierCounts.get('unplaced') ?? 0) + 1);
      const genus = species.genus.toLowerCase();
      const siblings = unmatchedByGenus.get(genus);
      if (siblings) siblings.push(slug);
      else unmatchedByGenus.set(genus, [slug]);
      unplaced.push(slug);
    }
  }

  // Ties happen where two of our species resolve to one MPG row (a synonymy we
  // have not merged yet); slug keeps the output deterministic.
  placed.sort((a, b) => a.mpgIndex - b.mpgIndex || a.slug.localeCompare(b.slug));

  const genusOf = (slug: string): string => slug.slice(0, slug.indexOf('-'));
  const ordered: PlacedSpecies[] = [];
  for (let i = 0; i < placed.length; i += 1) {
    const entry = placed[i];
    if (!entry) continue;
    ordered.push({
      species_slug: entry.slug,
      mpg_p_no: index.rows[entry.mpgIndex]?.['P No'] ?? '',
      matched_via: entry.via,
    });
    // Last placed species of this genus: flush its unmatched siblings here.
    const genus = genusOf(entry.slug);
    const next = placed[i + 1];
    const isLastOfGenus = !next || genusOf(next.slug) !== genus;
    if (!isLastOfGenus) continue;
    const stragglers = unmatchedByGenus.get(genus);
    if (!stragglers) continue;
    for (const slug of [...stragglers].sort()) {
      ordered.push({ species_slug: slug, mpg_p_no: '', matched_via: 'unplaced' });
    }
    unmatchedByGenus.delete(genus);
  }

  // Genera with no anchor at all: splice each after the last row of its family.
  const unplacedGenera = [...unmatchedByGenus.keys()].sort();
  const familyOf = new Map(speciesRows.map((row) => [slugOf(row), row.family]));
  for (const genus of unplacedGenera) {
    const stragglers = [...(unmatchedByGenus.get(genus) ?? [])].sort();
    const rows = stragglers.map(
      (slug): PlacedSpecies => ({ species_slug: slug, mpg_p_no: '', matched_via: 'unplaced' }),
    );
    const family = familyOf.get(stragglers[0] ?? '');
    let insertAt = ordered.length;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (familyOf.get(ordered[i]?.species_slug ?? '') === family) {
        insertAt = i + 1;
        break;
      }
    }
    ordered.splice(insertAt, 0, ...rows);
  }

  return { ordered, unplaced, unplacedGenera, tierCounts };
}

export function loadInputs(root: string = ROOT): {
  mpg: MpgRow[];
  species: SpeciesRow[];
  crosswalk: Map<string, string>;
} {
  const mpg: MpgRow[] = parse(readFileSync(resolve(root, 'data/mpg-taxa.csv')), {
    columns: true,
    skip_empty_lines: true,
  });
  const species: SpeciesRow[] = parse(readFileSync(resolve(root, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  });
  const crosswalkRows: CrosswalkRow[] = parse(readFileSync(resolve(root, 'data/mpg-crosswalk.csv')), {
    columns: true,
    skip_empty_lines: true,
  });
  return {
    mpg,
    species,
    crosswalk: new Map(crosswalkRows.map((row) => [row.species_slug, row.mpg_binomial])),
  };
}

function main(): void {
  const { mpg, species, crosswalk } = loadInputs();
  const index = buildMpgIndex(mpg);
  const { ordered, unplaced, unplacedGenera, tierCounts } = orderSpecies(species, index, crosswalk);

  const tag = '[build-checklist-order]';
  console.log(`${tag} ${species.length} species, ${mpg.length} MPG rows`);
  for (const tier of ['exact', 'gender', 'mona', 'synonymy', 'crosswalk', 'unplaced'] as const) {
    console.log(`${tag}   ${String(tierCounts.get(tier) ?? 0).padStart(5)}  ${tier}`);
  }
  if (unplaced.length) {
    console.log(`${tag} unplaced — these fall to the end of their genus, alphabetically:`);
    for (const slug of unplaced.sort()) console.log(`${tag}   ${slug}`);
  }
  if (unplacedGenera.length) {
    console.log(`${tag} GENERA WITH NO POSITION AT ALL (placed at the end of their family):`);
    for (const genus of unplacedGenera) console.log(`${tag}   ${genus}`);
  }

  if (process.env.DRY_RUN) {
    console.log(`${tag} DRY_RUN — not written`);
    return;
  }
  writeFileSync(
    resolve(ROOT, 'data/checklist-order.csv'),
    stringify(ordered, { header: true, columns: ['species_slug', 'mpg_p_no', 'matched_via'] }),
  );
  console.log(`${tag} wrote ${ordered.length} rows -> data/checklist-order.csv`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
