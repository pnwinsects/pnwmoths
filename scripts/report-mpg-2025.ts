// scripts/report-mpg-2025.ts
// Maintainer-run advisory report: where the catalogue differs from MPG's 2025
// update of the North American checklist. Writes data/mpg-2025-differences.csv.
//
// Why this exists (#418, C-046): the curator ruled that MPG's 2025 update is
// the site's default authority for species names, checklist numbers, and
// genus, subfamily and tribe placement. Wherever the two differ we change ours,
// and bring him only the exceptions. This report is the list of differences
// that rule applies to. Nothing reads it back; the changes it prompts are made
// to data/species.csv one reviewed change at a time.
//
// One row per difference, not one row per species, so the file can be filtered
// by `field`: a genus move, a spelling, a placement and a renumbering are
// different kinds of work and go into different changes.
//
// How a species is found in the 2025 list, most literal first:
//
//   exact      genus and epithet match a valid species row (rank 8.0 or 8.1)
//   p-no-2023  the 2023 P-number data/checklist-order.csv already matched it
//              to appears, as "P-No. 2023", on exactly one valid species row.
//              This carries over every decision the 2023 matcher made (its
//              gender, MONA, synonymy and crosswalk tiers) without restating it.
//   unmatched  neither; provisional names land here and stay here
//
// When the two tiers disagree, the exact name wins: the 2023 number may have
// moved to another species when MPG split one.
//
// Tribe is not a column in the 2025 workbook. It is the most recent
// "4.0 tribe" row above the species within the same subfamily. MPG writes a
// placeholder in brackets where a genus has no tribe ("[Ennominae – unplaced
// to tribe]", "[Larentiinae – unnamed tribe 1]"); that counts as no tribe, and
// the bracketed text is kept in the `note` column.
//
// Run: npm run report:mpg-2025
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { mpgKey, normalizeEpithet, normalizeGenus, slugOf } from './build-checklist-order.ts';
import { loadWithheldFamilies } from '../src/_lib/withheld-families.ts';
import { loadUnpublishedSpecies } from '../src/_lib/unpublished-species.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'data/mpg-2025-differences.csv';

/** The columns of data/mpg-taxa-2025.csv this report reads. */
export interface Mpg2025Row {
  'SORT 2025': string;
  status: string;
  rank: string;
  Family: string;
  Subfamily: string;
  'P-No. 2025': string;
  'P-No. 2023': string;
  'Valid Genus': string;
  'valid species': string;
  NAME: string;
  brackets: string;
  author: string;
  date: string;
}

export interface SpeciesRow {
  genus: string;
  species: string;
  authority: string;
  family: string;
  subfamily: string;
  tribe: string;
}

/** A valid species in the 2025 list, with the tribe its position implies. */
export interface Mpg2025Species {
  genus: string;
  species: string;
  status: string;
  family: string;
  subfamily: string;
  /** Blank when MPG places the genus in no named tribe. */
  tribe: string;
  /** MPG's bracketed placeholder, when that is why `tribe` is blank. */
  tribePlaceholder: string;
  pNo2025: string;
  pNo2023: string;
  authority: string;
}

export type Field =
  | 'unmatched'
  | 'genus'
  | 'epithet'
  | 'family'
  | 'subfamily'
  | 'tribe'
  | 'authority'
  | 'p-number'
  | 'p-number-split';

export interface DifferenceRow {
  species_slug: string;
  shown: 'yes' | 'no';
  matched_via: 'exact' | 'p-no-2023' | 'unmatched';
  mpg_name: string;
  mpg_status: string;
  field: Field;
  ours: string;
  mpg: string;
  note: string;
}

const isValidSpecies = (rank: string): boolean => rank.startsWith('8.0') || rank.startsWith('8.1');

/** MPG's placeholders for "no tribe" are written in square brackets. */
const isPlaceholder = (name: string): boolean => name.trim().startsWith('[');

/** "(Walker, 1862)" from the brackets, author and date cells. */
export function formatAuthority(row: Pick<Mpg2025Row, 'brackets' | 'author' | 'date'>): string {
  const author = row.author.trim();
  const date = row.date.trim();
  if (!author) return '';
  const inner = date ? `${author}, ${date}` : author;
  return row.brackets.trim() === '(' ? `(${inner})` : inner;
}

/**
 * P-numbers are written "85-0003" in one column and "850003" in another; the
 * hyphen is formatting. Only a change in what is left is a renumbering.
 */
export const pNumberKey = (pNo: string): string => pNo.replace(/-/g, '').trim();

/**
 * What an authority says, without the differences of style: spacing around
 * commas, and the initials we write and MPG does not ("H. Edwards", "Hy.
 * Edwards", "W. Kirby"). A bracketed year, "[1874]", is kept: it says the
 * stated date is not the date of publication, which is a difference of fact.
 */
export const authorityKey = (authority: string): string =>
  authority
    .replace(/\b[A-Z][a-z]{0,2}\.\s*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();

/** The valid species of the 2025 list in sequence, each with its implied tribe. */
export function readSpecies(rows: Mpg2025Row[]): Mpg2025Species[] {
  const out: Mpg2025Species[] = [];
  let tribe = '';
  for (const row of rows) {
    const rank = row.rank.trim();
    // A new family or subfamily ends the tribe above it.
    if (rank.startsWith('2.0') || rank.startsWith('3.0') || rank.startsWith('1.')) tribe = '';
    else if (rank.startsWith('4.0')) tribe = row.NAME.trim();
    else if (isValidSpecies(rank)) {
      const placeholder = isPlaceholder(tribe);
      out.push({
        genus: row['Valid Genus'].trim(),
        species: row['valid species'].trim(),
        status: row.status.trim(),
        family: row.Family.trim(),
        subfamily: row.Subfamily.trim(),
        tribe: placeholder ? '' : tribe.replace(/"/g, ''),
        tribePlaceholder: placeholder ? tribe : '',
        pNo2025: row['P-No. 2025'].trim(),
        pNo2023: row['P-No. 2023'].trim(),
        authority: formatAuthority(row),
      });
    }
  }
  return out;
}

export interface Inputs {
  species: SpeciesRow[];
  /** species_slug -> the 2023 "P No" data/checklist-order.csv matched it to. */
  pNo2023BySlug: Map<string, string>;
  mpg: Mpg2025Species[];
  /** Slugs of species the site shows: family not withheld, slug not unpublished. */
  shown: Set<string>;
}

export function findDifferences({ species, pNo2023BySlug, mpg, shown }: Inputs): DifferenceRow[] {
  const byName = new Map<string, Mpg2025Species>();
  for (const entry of mpg) byName.set(mpgKey(entry.genus, entry.species), entry);
  const byOldNumber = new Map<string, Mpg2025Species[]>();
  for (const entry of mpg) {
    const key = pNumberKey(entry.pNo2023);
    if (!key) continue;
    byOldNumber.set(key, [...(byOldNumber.get(key) ?? []), entry]);
  }
  const ourSlugs = new Set(species.map(slugOf));

  const rows: DifferenceRow[] = [];
  for (const ours of species) {
    const slug = slugOf(ours);
    const oldNumber = pNumberKey(pNo2023BySlug.get(slug) ?? '');
    const sharers = oldNumber ? (byOldNumber.get(oldNumber) ?? []) : [];
    let match = byName.get(mpgKey(ours.genus, ours.species));
    let via: DifferenceRow['matched_via'] = 'exact';
    if (!match && sharers.length === 1) {
      match = sharers[0];
      via = 'p-no-2023';
    }
    const base = {
      species_slug: slug,
      shown: shown.has(slug) ? 'yes' : 'no',
      matched_via: match ? via : 'unmatched',
      mpg_name: match ? `${match.genus} ${match.species}` : '',
      mpg_status: match?.status ?? '',
    } as const;
    const add = (field: Field, oursValue: string, mpgValue: string, note = ''): void => {
      rows.push({ ...base, field, ours: oursValue, mpg: mpgValue, note });
    };

    if (!match) {
      const note =
        sharers.length > 1
          ? `its 2023 number ${oldNumber} is now on ${sharers.length} species: ${sharers.map((s) => `${s.genus} ${s.species}`).join(', ')}`
          : '';
      add('unmatched', `${ours.genus} ${ours.species}`, '', note);
      continue;
    }

    // MPG's quotes and "(group 2)" are notation about its confidence, not part
    // of the name; C-042 ruled that we carry the plain genus.
    if (ours.genus !== normalizeGenus(match.genus)) add('genus', ours.genus, match.genus);
    if (ours.species !== normalizeEpithet(match.species)) add('epithet', ours.species, match.species);
    if (ours.family !== match.family) add('family', ours.family, match.family);
    if (ours.subfamily !== match.subfamily) add('subfamily', ours.subfamily, match.subfamily);
    if (ours.tribe !== match.tribe) add('tribe', ours.tribe, match.tribe, match.tribePlaceholder);
    if (match.authority && authorityKey(ours.authority) !== authorityKey(match.authority)) {
      add('authority', ours.authority, match.authority);
    }
    if (oldNumber && pNumberKey(match.pNo2025) !== oldNumber) {
      add('p-number', pNo2023BySlug.get(slug) ?? '', match.pNo2025, 'ours is the 2023 number in data/checklist-order.csv');
    }
    // One old number now carried by several species: MPG split a species, and
    // we may hold the old concept under one name, or both halves.
    if (sharers.length > 1) {
      const held = sharers.filter((s) => ourSlugs.has(slugOf(s)));
      add(
        'p-number-split',
        pNo2023BySlug.get(slug) ?? '',
        sharers.map((s) => `${s.genus} ${s.species} ${s.pNo2025}`).join('; '),
        `we hold ${held.length} of the ${sharers.length}`,
      );
    }
  }
  return rows;
}

function readCsv<T>(path: string): T[] {
  return parse(readFileSync(resolve(ROOT, path)), { columns: true, skip_empty_lines: true }) as T[];
}

export function loadInputs(): Inputs {
  const species = readCsv<SpeciesRow>('data/species.csv');
  const order = readCsv<{ species_slug: string; mpg_p_no: string }>('data/checklist-order.csv');
  const mpg = readSpecies(readCsv<Mpg2025Row>('data/mpg-taxa-2025.csv'));
  const withheld = loadWithheldFamilies();
  const unpublished = loadUnpublishedSpecies();
  const shown = new Set(
    species
      .filter((s) => s.family && !withheld.has(s.family) && !unpublished.has(slugOf(s)))
      .map(slugOf),
  );
  return {
    species,
    pNo2023BySlug: new Map(order.filter((o) => o.mpg_p_no).map((o) => [o.species_slug, o.mpg_p_no])),
    mpg,
    shown,
  };
}

function main(): void {
  const inputs = loadInputs();
  const rows = findDifferences(inputs);
  writeFileSync(resolve(ROOT, OUTPUT), stringify(rows, { header: true }));
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.field, (counts.get(row.field) ?? 0) + 1);
  console.log(`[report-mpg-2025] ${inputs.species.length} species, ${rows.length} differences -> ${OUTPUT}`);
  for (const [field, n] of [...counts].sort()) console.log(`  ${field.padEnd(16)} ${n}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
