// scripts/merge-key-scores.ts
// Append a curator's filled-in key template to data/key-scores.csv (issue #390).
// Run via: npm run key:merge -- <path/to/filled-template.csv>
//
// The curator downloads data/key-template.csv (published at /curation/), puts `1`s in
// the cells that apply, and sends it back. This appends his scored rows to
// data/key-scores.csv; `npm run build:key` then rebuilds the matrix.
//
// Additive only, like every other curator-data write in this repo: a row for a species
// the key already scores is reported and left alone, never overwritten. Correcting an
// existing species' scores is an edit to its row in data/key-scores.csv, made on purpose.
//
// Refuses (writing nothing) when:
//   - the columns differ from data/key-scores.csv — a template from before a column
//     change would put every score under the wrong question;
//   - a cell holds anything but 1, 0 or blank (parseKeyScores);
//   - a name resolves to no species we hold, directly or through
//     data/species-synonyms.csv — almost always a typo, and a typo'd row would sit in
//     the key scoring nothing.
// Skips, with a count, the rows with no `1` at all: those are template rows nobody got
// to, and an unscored species would appear in every Identify result.
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { parseKeyScores, resolveSlug, normalizeBinomial, KEY_SCORES_NAME_COLUMN } from './build-key.ts';

export interface MergePlan {
  /** Rows to append, as CSV records (binomial first). */
  append: string[][];
  /** Binomials the key already scores; left untouched. */
  alreadyScored: string[];
  /** Rows with no `1`; dropped. */
  unscored: string[];
  /** Binomials that resolve to no species; fatal. */
  unknown: string[];
}

/**
 * Decide what merging `incoming` into `existing` would do, without writing anything.
 * Both are the raw bytes of a key-scores-shaped CSV.
 */
export function planMerge(
  existing: Buffer | string,
  incoming: Buffer | string,
  siteSlugSet: Set<string>,
  synonymMap: Map<string, string>
): MergePlan {
  const base = parseKeyScores(existing);
  const add = parseKeyScores(incoming);

  if (add.labels.length !== base.labels.length || add.labels.some((l, i) => l !== base.labels[i])) {
    const i = add.labels.findIndex((l, j) => l !== base.labels[j]);
    throw new Error(
      `The template's columns do not match data/key-scores.csv ` +
        `(${add.labels.length} vs ${base.labels.length} character-states; first difference at column ${i + 2}: ` +
        `${JSON.stringify(add.labels[i] ?? null)} vs ${JSON.stringify(base.labels[i] ?? null)}). ` +
        `Download a fresh template — the key's columns have changed since this one was made.`
    );
  }

  const have = new Set(base.binomials);
  const plan: MergePlan = { append: [], alreadyScored: [], unscored: [], unknown: [] };
  add.binomials.forEach((binomial, i) => {
    const row = add.scores[i]!;
    if (!row.some(Boolean)) {
      plan.unscored.push(binomial);
      return;
    }
    if (have.has(binomial)) {
      plan.alreadyScored.push(binomial);
      return;
    }
    if (resolveSlug(binomial, siteSlugSet, synonymMap) === null) {
      plan.unknown.push(binomial);
      return;
    }
    plan.append.push([binomial, ...row.map(v => (v ? '1' : ''))]);
  });
  return plan;
}

export function main(argv: string[]): void {
  const source = argv[0];
  if (!source) throw new Error('Usage: npm run key:merge -- <path/to/filled-template.csv>');

  const scoresPath = resolve('data/key-scores.csv');
  const existing = readFileSync(scoresPath);
  const incoming = readFileSync(resolve(source));
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(incoming);
  } catch {
    throw new Error(`${source} is not UTF-8. In Excel, save it as "CSV UTF-8 (Comma delimited)".`);
  }

  // Resolve against every species we hold, withheld included: scoring the Geometridae
  // is how their embargo lifts, so their rows must merge before they are published.
  const species = parse(readFileSync(resolve('data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ genus: string; species: string }>;
  const siteSlugSet = new Set(species.map(r => `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`));
  const synonyms = parse(readFileSync(resolve('data/species-synonyms.csv')), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Array<{ from_binomial: string; to_species_slug: string }>;
  const synonymMap = new Map(synonyms.map(r => [normalizeBinomial(r.from_binomial), r.to_species_slug]));

  const plan = planMerge(existing, incoming, siteSlugSet, synonymMap);

  if (plan.unknown.length > 0) {
    throw new Error(
      `Nothing written: ${plan.unknown.length} name(s) match no species in data/species.csv ` +
        `or data/species-synonyms.csv — check the spelling in the "${KEY_SCORES_NAME_COLUMN}" column:\n  ` +
        plan.unknown.join('\n  ')
    );
  }

  if (plan.append.length > 0) {
    // The committed file always ends with a newline (csv-stringify writes one per record).
    appendFileSync(scoresPath, stringify(plan.append, { record_delimiter: '\n' }));
  }

  console.log(`key:merge: appended ${plan.append.length} species to data/key-scores.csv`);
  if (plan.unscored.length > 0) {
    console.log(`  skipped ${plan.unscored.length} row(s) with no scores (template rows not filled in)`);
  }
  if (plan.alreadyScored.length > 0) {
    console.log(
      `  left ${plan.alreadyScored.length} already-scored species untouched — edit their rows in ` +
        `data/key-scores.csv directly if the new scores are corrections:\n    ${plan.alreadyScored.join('\n    ')}`
    );
  }
  if (plan.append.length > 0) console.log('Next: npm run build:key, then commit data/.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
