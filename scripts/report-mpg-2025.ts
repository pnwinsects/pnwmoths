// scripts/report-mpg-2025.ts
// Maintainer-run advisory report: where the catalogue differs from MPG's 2025
// update of the North American checklist. Writes data/mpg-2025-differences.csv.
//
// Why this exists (#418, C-046): the curator ruled that MPG's 2025 update is
// the site's default authority for species names, checklist numbers, and
// genus, subfamily and tribe placement. Wherever the two differ we change ours,
// and bring him only the exceptions. This report is the list of differences
// that rule applies to. Nothing in the build reads it back.
//
// One row per difference, not one row per species, so the file can be filtered
// by `field`: a genus move, a spelling, a placement and a renumbering are
// different kinds of work and go into different changes. A difference the
// curator has already ruled on keeps its row, with the ruling in `ruling`, so
// the rows with a blank `ruling` are the work still to do.
//
// A species is found in the 2025 list by the same matcher that builds checklist
// order (scripts/build-checklist-order.ts), so the report and the checklist
// cannot disagree about which MPG species a species of ours is.
//
// Tribe is not a column in the 2025 workbook. It is the most recent
// "4.0 tribe" row above the species within the same subfamily. MPG writes a
// placeholder in brackets where it has no name for a group ("[Ennominae –
// unplaced to tribe]", "[Noctuidae – group 1 unplaced to subfamily]"); that
// counts as a blank, and the bracketed text is kept in the `note` column.
//
// Checklist numbers (`noc_id`) are compared only where ours is a P-number
// (`93-0274`) or blank and MPG's is one; our MONA numbers are a different
// series, which the ruling did not touch. MPG writes a status letter after some
// numbers (E for a species excluded from the fauna, X for an extinct one); the
// letter is status, not number, and is left off.
//
// The `number` and `number-of-another-species` rows disappear once the
// numbers are applied; curation-log entry C-047 keeps the list of what changed.
//
// Run: npm run report:mpg-2025
//      npm run report:mpg-2025 -- --apply-numbers   # also writes the numbers into data/species.csv
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  buildMpgIndex,
  isValidSpecies,
  matchSpecies,
  normalizeEpithet,
  normalizeGenus,
  slugOf,
  type MatchTier,
  type MpgRow,
} from './build-checklist-order.ts';
import { editCsv } from './rename-species.ts';
import { isWithheldOrUnclassified, loadWithheldFamilies } from '../src/_lib/withheld-families.ts';
import { loadUnpublishedSpecies } from '../src/_lib/unpublished-species.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'data/mpg-2025-differences.csv';

/** The columns of data/mpg-taxa-2025.csv this report reads. */
export interface Mpg2025Row extends MpgRow {
  status: string;
  Family: string;
  Subfamily: string;
  'P-No. 2023': string;
  'CDN P-No. 2018': string;
  'P3 No. 2016': string;
  brackets: string;
  author: string;
  date: string;
}

export interface SpeciesRow {
  genus: string;
  species: string;
  noc_id: string;
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
  /** Blank when MPG places the genus in no named subfamily. */
  subfamily: string;
  subfamilyPlaceholder: string;
  /** Blank when MPG places the genus in no named tribe. */
  tribe: string;
  tribePlaceholder: string;
  /** `P-No. 2025` as MPG writes it, status letter included. */
  pNo2025: string;
  /** Every number this species has carried: 2025, 2023, 2018 and 2016, without hyphens or letters. */
  numbers: string[];
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
  | 'number'
  | 'number-of-another-species';

export interface DifferenceRow {
  species_slug: string;
  shown: 'yes' | 'no';
  matched_via: MatchTier;
  mpg_name: string;
  mpg_status: string;
  field: Field;
  ours: string;
  mpg: string;
  /** The curation-log entry that keeps ours, when there is one. */
  ruling: string;
  note: string;
}

/**
 * Differences the curator has ruled on, so they stay as they are. Keyed by
 * field and then by slug, or by genus for a ruling about a whole genus.
 */
export const RULINGS: Record<string, { slugs?: Record<string, string>; genera?: Record<string, string> }> = {
  epithet: { slugs: { 'catocala-cleopatra': 'C-025' } },
  tribe: { genera: { Perizoma: 'C-043' }, slugs: { 'lampropteryx-suffumata': 'C-041' } },
};

function rulingFor(field: Field, slug: string, genus: string): string {
  const rule = RULINGS[field];
  return rule?.slugs?.[slug] ?? rule?.genera?.[genus] ?? '';
}

/** MPG's placeholders for an unnamed group are written in square brackets. */
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
 * MPG's number without the status letter it puts after some numbers: E for a
 * species excluded from the fauna, X for an extinct one (`93-0172E`,
 * `93-0274X`). The `n` that marks a number added in 2025 is part of how MPG
 * writes the number and is kept.
 */
export const withoutStatusLetter = (pNo: string): string => pNo.trim().replace(/[EX](n?)$/, '$1');

/**
 * A number reduced to what identifies it: no hyphen, no status letter, no
 * trailing zeros after a decimal point (`93-2924.50` and `932924.5` are one
 * number), and no binary floating-point digits the spreadsheet saved in place
 * of a short decimal (`932249.59999999998` is `932249.6`).
 */
export const numberKey = (pNo: string): string => {
  const plain = withoutStatusLetter(pNo).replace(/-/g, '');
  const rounded = /^\d+\.\d{7,}$/.test(plain) ? String(Number(Number(plain).toFixed(6))) : plain;
  return rounded.replace(/(\.\d*?)0+(n?)$/, '$1$2').replace(/\.(n?)$/, '$1');
};

/** A checklist number of the P-number series: two digits, a hyphen, a number. */
export const isPNumber = (value: string): boolean => /^\d\d-\d/.test(value.trim());

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

/**
 * The valid species of the 2025 list in sequence, each with its implied tribe.
 * Index `i` here is index `i` of `buildMpgIndex(rows).rows`: both keep the
 * valid species in file order.
 */
export function readSpecies(rows: Mpg2025Row[]): Mpg2025Species[] {
  const out: Mpg2025Species[] = [];
  let tribe = '';
  for (const row of rows) {
    const rank = row.rank.trim();
    // A new family or subfamily ends the tribe above it.
    if (rank.startsWith('2.0') || rank.startsWith('3.0') || rank.startsWith('1.')) tribe = '';
    else if (rank.startsWith('4.0')) tribe = row.NAME.trim();
    else if (isValidSpecies(row)) {
      const subfamily = row.Subfamily.trim();
      out.push({
        genus: row['Valid Genus'].trim(),
        species: row['valid species'].trim(),
        status: row.status.trim(),
        family: row.Family.trim(),
        subfamily: isPlaceholder(subfamily) ? '' : subfamily,
        subfamilyPlaceholder: isPlaceholder(subfamily) ? subfamily : '',
        tribe: isPlaceholder(tribe) ? '' : tribe.replace(/"/g, ''),
        tribePlaceholder: isPlaceholder(tribe) ? tribe : '',
        pNo2025: row['P-No. 2025'].trim(),
        numbers: [row['P-No. 2025'], row['P-No. 2023'], row['CDN P-No. 2018'], row['P3 No. 2016']]
          .map(numberKey)
          .filter((n) => n !== ''),
        authority: formatAuthority(row),
      });
    }
  }
  return out;
}

export interface Inputs {
  species: SpeciesRow[];
  mpgRows: Mpg2025Row[];
  crosswalk: Map<string, string>;
  /** Slugs of species the site shows: family not withheld, slug not unpublished. */
  shown: Set<string>;
}

export function findDifferences({ species, mpgRows, crosswalk, shown }: Inputs): DifferenceRow[] {
  const index = buildMpgIndex(mpgRows);
  const mpg = readSpecies(mpgRows);
  // Which valid species has carried each number, in any edition.
  const carriers = new Map<string, number[]>();
  mpg.forEach((entry, i) => {
    for (const n of new Set(entry.numbers)) carriers.set(n, [...(carriers.get(n) ?? []), i]);
  });

  const rows: DifferenceRow[] = [];
  for (const ours of species) {
    const slug = slugOf(ours);
    const hit = matchSpecies({ ...ours }, index, crosswalk);
    const match = hit ? mpg[hit.index] : undefined;
    const base = {
      species_slug: slug,
      shown: shown.has(slug) ? 'yes' : 'no',
      matched_via: hit?.via ?? 'unplaced',
      mpg_name: match ? `${match.genus} ${match.species}` : '',
      mpg_status: match?.status ?? '',
    } as const;
    const add = (field: Field, oursValue: string, mpgValue: string, note = ''): void => {
      rows.push({ ...base, field, ours: oursValue, mpg: mpgValue, ruling: rulingFor(field, slug, ours.genus), note });
    };

    if (!hit || !match) {
      add('unmatched', `${ours.genus} ${ours.species}`, '');
      continue;
    }

    // MPG's quotes and "(group 2)" are notation about its confidence, not part
    // of the name; C-042 ruled that we carry the plain genus.
    if (ours.genus !== normalizeGenus(match.genus)) add('genus', ours.genus, match.genus);
    if (ours.species !== normalizeEpithet(match.species)) add('epithet', ours.species, match.species);
    if (ours.family !== match.family) add('family', ours.family, match.family);
    if (ours.subfamily !== match.subfamily) add('subfamily', ours.subfamily, match.subfamily, match.subfamilyPlaceholder);
    if (ours.tribe !== match.tribe) add('tribe', ours.tribe, match.tribe, match.tribePlaceholder);
    if (match.authority && authorityKey(ours.authority) !== authorityKey(match.authority)) {
      add('authority', ours.authority, match.authority);
    }

    const nocId = ours.noc_id.trim();
    const theirs = withoutStatusLetter(match.pNo2025);
    const comparable = isPNumber(nocId) || (nocId === '' && isPNumber(theirs));
    if (comparable && theirs && nocId !== theirs) {
      // Was ours this species' own number in an earlier edition, and does
      // another species carry it in any edition?
      const others = (carriers.get(numberKey(nocId)) ?? []).filter((i) => i !== hit.index);
      const own = match.numbers.includes(numberKey(nocId));
      const note =
        nocId === ''
          ? 'ours is blank'
          : own
            ? 'MPG renumbered it'
            : others.length > 0
              ? 'ours is not a number MPG has given this species'
              : 'ours is in no edition of MPG';
      add('number', nocId, theirs, note);
      // The curator's concern on #290: a number we hold may belong to another
      // species, after a split or a renumbering, even when it was once ours.
      if (others.length > 0) {
        add(
          'number-of-another-species',
          nocId,
          others.map((i) => `${mpg[i]?.genus} ${mpg[i]?.species} (2025: ${mpg[i]?.pNo2025})`).join('; '),
          'another species carries our number in some edition of MPG; check that the species on our page is the one the name says',
        );
      }
    }
  }
  return rows;
}

/**
 * Writes MPG's number into `noc_id` for each `number` row with no ruling.
 * Only a species matched by its own name (exact, or a gender ending) takes a
 * number: one matched through a synonym or subspecies (*Catocala cleopatra*,
 * which MPG holds under *C. faustina*) would take the number of a species we
 * may also hold. Returns the edited species.csv text and the rows it applied.
 */
export function applyNumbers(speciesText: string, differences: DifferenceRow[]): { text: string; applied: DifferenceRow[] } {
  const bySlug = new Map(
    differences
      .filter((d) => d.field === 'number' && !d.ruling && (d.matched_via === 'exact' || d.matched_via === 'gender'))
      .map((d) => [d.species_slug, d]),
  );
  const applied: DifferenceRow[] = [];
  const { text } = editCsv(speciesText, 'data/species.csv', (record) => {
    const row = bySlug.get(slugOf({ genus: record.genus ?? '', species: record.species ?? '' }));
    if (!row || (record.noc_id ?? '').trim() !== row.ours) return;
    record.noc_id = row.mpg;
    applied.push(row);
  });
  return { text, applied };
}

function readCsv<T>(path: string): T[] {
  return parse(readFileSync(resolve(ROOT, path)), { columns: true, skip_empty_lines: true }) as T[];
}

export function loadInputs(): Inputs {
  const species = readCsv<SpeciesRow>('data/species.csv');
  const mpgRows = readCsv<Mpg2025Row>('data/mpg-taxa-2025.csv');
  const crosswalk = new Map(
    readCsv<{ species_slug: string; mpg_binomial: string }>('data/mpg-crosswalk.csv').map((r) => [r.species_slug, r.mpg_binomial]),
  );
  const withheld = loadWithheldFamilies();
  const unpublished = loadUnpublishedSpecies();
  const shown = new Set(
    species.filter((s) => !isWithheldOrUnclassified(s.family, withheld) && !unpublished.has(slugOf(s))).map(slugOf),
  );
  return { species, mpgRows, crosswalk, shown };
}

function main(): void {
  if (process.argv.includes('--apply-numbers')) {
    const speciesPath = resolve(ROOT, 'data/species.csv');
    const { text, applied } = applyNumbers(readFileSync(speciesPath, 'utf8'), findDifferences(loadInputs()));
    writeFileSync(speciesPath, text);
    console.log(`[report-mpg-2025] wrote ${applied.length} checklist numbers into data/species.csv`);
    for (const row of applied) console.log(`  ${row.species_slug.padEnd(36)} ${(row.ours || '(blank)').padEnd(12)} -> ${row.mpg}  ${row.note}`);
  }
  const inputs = loadInputs();
  const rows = findDifferences(inputs);
  writeFileSync(resolve(ROOT, OUTPUT), stringify(rows, { header: true }));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.ruling ? `${row.field} (ruled)` : row.field;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(`[report-mpg-2025] ${inputs.species.length} species, ${rows.length} differences -> ${OUTPUT}`);
  for (const [field, n] of [...counts].sort()) console.log(`  ${field.padEnd(28)} ${n}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
