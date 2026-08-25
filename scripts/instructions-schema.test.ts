import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

// Source-level invariant guard for the maintainer runbooks (same spirit as
// check-ts-only.sh and entry-point-guards.test.ts).
//
// _instructions/ is written for a collaborator who does not use these tools and
// for whoever the repo changes hands to. A runbook that is confidently wrong is
// worse than an absent one: it costs a full failed attempt before the reader
// suspects the instructions rather than themselves.
//
// That is not hypothetical. Four runbooks spent months telling maintainers to
// key data/images.csv and data/records.csv by `species_id` — a column that
// exists in neither file; both are keyed by `species_slug` (#240). Nothing
// caught it, because prose is not compiled.
//
// Four checks, in the order a runbook meets them (#243):
//
//   1. Every `data/*.csv` a runbook names exists on disk.
//   2. A `## Schema: data/<file>.csv` heading must be followed by a markdown
//      table naming EVERY column of that file, in header order. Completeness
//      matters as much as correctness: ADDING_PHOTO.md tells the reader to
//      "count the commas", which is only safe advice if the table it counts
//      against is the whole header in the real order.
//   3. A runbook that shows a literal CSV row in a ```csv fence must declare a
//      schema for the file that row belongs to — matched by field count. This
//      is what makes check 2 apply by construction to any runbook that edits a
//      CSV, rather than only to the ones that remembered to add a table.
//   4. Column names in *prose* are resolved too, against the CSVs that same
//      runbook names. This is what would have caught #240 in
//      ADDING_NEW_SPECIES_COMPLETE.md, which names columns only in prose.
//
// Check 4 is deliberately scoped per-document rather than to every CSV in
// data/. Resolving against the union of all headers looks stricter and is in
// fact weaker: `species_id` — the exact #240 bug — IS a column of
// data/records-bad-coords.csv, so a repo-wide union would have waved it
// through. A doc is checked only against the files it actually talks about.

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INSTRUCTIONS_DIR = join(PROJECT_ROOT, '_instructions');

/** `## Schema: data/<something>.csv`, capturing the path. */
const SCHEMA_HEADING = /^#{1,6}\s+Schema:\s+(\S+\.csv)\s*$/gm;

/** A `data/…csv` path named anywhere in a doc. */
const CSV_PATH = /\bdata\/[A-Za-z0-9_.-]+\.csv\b/g;

/**
 * A backticked bare snake_case identifier — `species_slug`, `district_id`.
 *
 * The underscore is doing the work: it is what separates a column reference
 * from the backticked file paths, npm scripts, CLI flags and slugs these docs
 * are otherwise full of. Single words (`status`, `view`, `filename`) are left
 * alone because they read as ordinary English as often as they name a column,
 * and a guard that cries wolf gets deleted.
 */
const COLUMN_TOKEN = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;

/** Body of a ```csv fenced block. */
const CSV_FENCE = /^```csv\r?\n([\s\S]*?)^```/gm;

/**
 * Backticked snake_case tokens that are legitimately not column names.
 *
 * Every entry is a standing exception, so each one carries its reason. Keep
 * this list short: if it starts growing, the matcher above is wrong, not the
 * docs.
 */
const NOT_COLUMNS = new Set([
  'sight_field_notes', // a *value* of records.csv's record_type, not a column
  'shared_link',       // Dropbox API terminology (the `shared_link` listing mode)
]);

export interface SchemaTable {
  doc: string;
  csvPath: string;
  fields: string[];
}

/** Cells of a markdown table row, trimmed, without the leading/trailing pipes. */
function tableCells(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line);
}

/**
 * Field names listed in the schema tables of one runbook.
 *
 * Reads the table that follows each `## Schema: <file>.csv` heading, stopping at
 * the first non-table line so trailing prose is not mistaken for rows.
 */
export function schemaTablesIn(doc: string, markdown: string): SchemaTable[] {
  const tables: SchemaTable[] = [];
  const lines = markdown.split('\n');

  for (const match of markdown.matchAll(SCHEMA_HEADING)) {
    const csvPath = match[1]!;
    const headingLine = markdown.slice(0, match.index).split('\n').length - 1;
    const fields: string[] = [];

    for (let i = headingLine + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === '') continue;
      if (!line.includes('|')) break;          // table ended
      if (isSeparatorRow(line)) continue;
      const cells = tableCells(line);
      const name = cells[0] ?? '';
      // Skip the header row ("Field"/"Column") and any blank first cell.
      if (name === '' || /^(field|column|name)$/i.test(name)) continue;
      // Field names are bare identifiers; a cell with spaces or markup is prose.
      if (!/^`?[a-z_][a-z0-9_]*`?$/i.test(name)) continue;
      fields.push(name.replace(/`/g, ''));
    }

    if (fields.length > 0) tables.push({ doc, csvPath, fields });
  }
  return tables;
}

/** Distinct `data/*.csv` paths a doc names, in first-mention order. */
export function csvPathsIn(markdown: string): string[] {
  return [...new Set(markdown.match(CSV_PATH) ?? [])];
}

/** Distinct backticked snake_case tokens in a doc, in first-mention order. */
export function columnTokensIn(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(COLUMN_TOKEN)].map((m) => m[1]!))];
}

/**
 * Field counts of every row shown in a ```csv fence.
 *
 * Parsed rather than split on commas so a quoted value containing a comma
 * counts as one field, the same way the build reads it. An ellipsis line
 * standing in for omitted rows is not a row.
 */
export function csvSampleWidthsIn(markdown: string): number[] {
  const widths: number[] = [];
  for (const fence of markdown.matchAll(CSV_FENCE)) {
    const body = fence[1]!
      .split('\n')
      .filter((line) => line.trim() !== '' && !/^[.…]{1,3}$/.test(line.trim()))
      .join('\n');
    if (body.trim() === '') continue;
    const rows = parse(body, { columns: false, relax_column_count: true }) as string[][];
    for (const row of rows) widths.push(row.length);
  }
  return widths;
}

/**
 * Column names in a CSV's header row.
 *
 * `columns: false` reads the header as a plain row rather than inferring it from
 * the first data row. Doing it the other way collapses duplicate headers and
 * fails a header-only file as "no data rows" — neither of which should look like
 * a documentation problem.
 */
export function csvHeader(path: string): string[] {
  const rows = parse(readFileSync(path), { columns: false, skip_empty_lines: true, to: 1 }) as
    string[][];
  const header = rows[0];
  assert.ok(header && header.length > 0, `${path} has no header row`);
  return header;
}

const docs = readdirSync(INSTRUCTIONS_DIR).filter((f) => f.endsWith('.md'));
const markdown = new Map(docs.map((doc) => [doc, readFileSync(join(INSTRUCTIONS_DIR, doc), 'utf8')]));
const tables = docs.flatMap((doc) => schemaTablesIn(doc, markdown.get(doc)!));

describe('_instructions names data files that exist', () => {
  for (const doc of docs) {
    const paths = csvPathsIn(markdown.get(doc)!);
    if (paths.length === 0) continue;
    it(`${doc} → ${paths.length} CSV path(s)`, () => {
      const missing = paths.filter((p) => !existsSync(resolve(PROJECT_ROOT, p)));
      assert.deepEqual(missing, [], `${doc} names data file(s) that do not exist`);
    });
  }
});

describe('_instructions schema tables match the real CSV headers', () => {
  it('finds schema tables to check', () => {
    assert.ok(tables.length >= 3, `expected several schema tables, found ${tables.length}`);
  });

  for (const table of tables) {
    it(`${table.doc} → ${table.csvPath}`, () => {
      const header = csvHeader(resolve(PROJECT_ROOT, table.csvPath));
      // Whole header, in order — not a subset. A runbook that silently omits a
      // column, or lists them in the wrong order, misleads anyone typing a row
      // by hand just as badly as one that invents a column.
      assert.deepEqual(
        table.fields,
        header,
        `${table.doc}'s schema table does not match ${table.csvPath}'s header exactly ` +
          `(every column, in header order). Actual header: ${header.join(', ')}`,
      );
    });
  }
});

describe('a runbook showing a CSV row declares that file\'s schema', () => {
  for (const doc of docs) {
    const widths = csvSampleWidthsIn(markdown.get(doc)!);
    if (widths.length === 0) continue;
    it(`${doc} → ${widths.length} sample row(s)`, () => {
      const declared = schemaTablesIn(doc, markdown.get(doc)!);
      assert.ok(
        declared.length > 0,
        `${doc} shows a literal CSV row but declares no "## Schema: data/<file>.csv" ` +
          `table, so nothing checks the columns it is telling the reader to type.`,
      );
      const sizes = new Map(declared.map((t) => [t.fields.length, t.csvPath]));
      const orphans = widths.filter((w) => !sizes.has(w));
      assert.deepEqual(
        orphans,
        [],
        `${doc} shows CSV row(s) with a field count matching none of its declared ` +
          `schemas (${[...sizes].map(([n, p]) => `${p}: ${n}`).join(', ')}). ` +
          `Either a comma is missing from the sample row or the schema is undeclared.`,
      );
    });
  }
});

describe('column names in prose resolve against the CSVs the doc names', () => {
  for (const doc of docs) {
    const tokens = columnTokensIn(markdown.get(doc)!).filter((t) => !NOT_COLUMNS.has(t));
    const paths = csvPathsIn(markdown.get(doc)!);
    if (tokens.length === 0 || paths.length === 0) continue;
    it(`${doc} → ${tokens.length} token(s) against ${paths.length} file(s)`, () => {
      const known = new Set(paths.flatMap((p) => csvHeader(resolve(PROJECT_ROOT, p))));
      const unknown = tokens.filter((t) => !known.has(t));
      assert.deepEqual(
        unknown,
        [],
        `${doc} names column(s) that exist in none of the CSVs it mentions ` +
          `(${paths.join(', ')}). Fix the name, name the file the column really ` +
          `belongs to, or — if it is not a column at all — add it to NOT_COLUMNS ` +
          `in ${'scripts/instructions-schema.test.ts'} with a reason.`,
      );
    });
  }
});

describe('the guard actually fails on the bug it exists to catch', () => {
  // docs/lessons-learned.md: "Mutation-test the guard afterwards: reintroduce the
  // bug and confirm it goes red. A guard you haven't watched fail is a guess."
  // Doing that by hand proves it once; this proves it on every run, and is the
  // only place here that exercises the assertion paths rather than the parsers.
  const proseUnknowns = (markdownText: string): string[] => {
    const known = new Set(
      csvPathsIn(markdownText).flatMap((p) => csvHeader(resolve(PROJECT_ROOT, p))),
    );
    return columnTokensIn(markdownText).filter((t) => !NOT_COLUMNS.has(t) && !known.has(t));
  };

  it('rejects species_id in a data/records.csv schema table — the exact #240 bug', () => {
    const table = schemaTablesIn('fixture.md', '## Schema: data/records.csv\n| Field |\n|---|\n| species_id |\n')[0];
    assert.ok(table, 'fixture should produce a table');
    const header = csvHeader(resolve(PROJECT_ROOT, 'data/records.csv'));
    assert.notDeepEqual(table.fields, header);
    assert.ok(!header.includes('species_id'));
  });

  it('rejects species_id in prose — the form #240 took in ADDING_NEW_SPECIES_COMPLETE.md', () => {
    // Note the two files named here: prose resolution is scoped to them.
    const md = 'Photos in `data/images.csv` and records in `data/records.csv` key off `species_id`.';
    assert.deepEqual(proseUnknowns(md), ['species_id']);
  });

  it('would NOT have caught it against every CSV in data/ — why scoping is the point', () => {
    const everyColumn = new Set(
      readdirSync(join(PROJECT_ROOT, 'data'))
        .filter((f) => f.endsWith('.csv'))
        .flatMap((f) => csvHeader(join(PROJECT_ROOT, 'data', f))),
    );
    assert.ok(
      everyColumn.has('species_id'),
      'data/records-bad-coords.csv is expected to carry a species_id column; if that ' +
        'stops being true the repo-wide-union warning in this file can be revisited.',
    );
  });

  it('accepts the column those files really use', () => {
    const md = 'Records in `data/records.csv` key off `species_slug`.';
    assert.deepEqual(proseUnknowns(md), []);
  });

  it('rejects a sample row whose field count matches no declared schema', () => {
    const md = '## Schema: data/species-plates.csv\n| Field |\n|---|\n| species_slug |\n| plate_slug |\n\n```csv\na,b,c\n```\n';
    const declared = schemaTablesIn('f.md', md).map((t) => t.fields.length);
    assert.deepEqual(csvSampleWidthsIn(md).filter((w) => !declared.includes(w)), [3]);
  });
});

describe('csvHeader', () => {
  it('reads the declared header, not the keys of the first data row', () => {
    // data/images.csv has 17 columns; inferring from a row would still give 17,
    // but would collapse duplicates and choke on a header-only file.
    assert.equal(csvHeader(resolve(PROJECT_ROOT, 'data/images.csv'))[0], 'species_slug');
    assert.equal(csvHeader(resolve(PROJECT_ROOT, 'data/images.csv')).length, 17);
  });
});

describe('schemaTablesIn', () => {
  it('reads the field names out of the table under the heading', () => {
    const md = [
      '## Schema: data/images.csv',
      '',
      '| Field | Type | Required |',
      '|-------|------|----------|',
      '| species_slug | string | yes |',
      '| filename | string | yes |',
      '',
      'Some prose that follows.',
    ].join('\n');
    assert.deepEqual(schemaTablesIn('d.md', md), [
      { doc: 'd.md', csvPath: 'data/images.csv', fields: ['species_slug', 'filename'] },
    ]);
  });

  it('stops at the end of the table rather than swallowing later tables', () => {
    const md = [
      '## Schema: data/images.csv',
      '| Field | Type |',
      '|---|---|',
      '| species_slug | string |',
      '',
      '### License conventions',
      '| Situation | value |',
      '|---|---|',
      '| Creative Commons | CC BY |',
    ].join('\n');
    assert.deepEqual(schemaTablesIn('d.md', md)[0]?.fields, ['species_slug']);
  });

  it('ignores prose cells, so a "Situation" table is never read as columns', () => {
    const md = '## Schema: data/x.csv\n| Field |\n|---|\n| Creative Commons |\n';
    assert.deepEqual(schemaTablesIn('d.md', md), []);
  });

  it('tolerates backticked field names', () => {
    const md = '## Schema: data/x.csv\n| Field |\n|---|\n| `species_slug` |\n';
    assert.deepEqual(schemaTablesIn('d.md', md)[0]?.fields, ['species_slug']);
  });

  it('returns nothing for a doc with no schema heading', () => {
    assert.deepEqual(schemaTablesIn('d.md', '# Just prose\n\nNo tables here.\n'), []);
  });
});

describe('columnTokensIn', () => {
  it('reads backticked snake_case identifiers', () => {
    assert.deepEqual(columnTokensIn('key off `species_slug`, not `species_id`'), [
      'species_slug',
      'species_id',
    ]);
  });

  it('leaves single words alone — they read as English as often as columns', () => {
    assert.deepEqual(columnTokensIn('the `status` column and the `view`'), []);
  });

  it('ignores paths, npm scripts, flags and slugs', () => {
    const md = 'run `npm run build:site`, read `records.parquet` in `var/tiles`, ' +
      'set `DRY_RUN=1`, see `abagrotis-apposita`';
    assert.deepEqual(columnTokensIn(md), []);
  });
});

describe('csvSampleWidthsIn', () => {
  it('counts fields per row, honouring quoted commas', () => {
    assert.deepEqual(csvSampleWidthsIn('```csv\na,b,"c,d"\n```\n'), [3]);
  });

  it('counts every row in the fence, header rows included', () => {
    assert.deepEqual(csvSampleWidthsIn('```csv\nold_slug,new_slug\na,b\n```\n'), [2, 2]);
  });

  it('does not count an ellipsis standing in for omitted rows', () => {
    assert.deepEqual(csvSampleWidthsIn('```csv\na,b\n...\n```\n'), [2]);
  });

  it('ignores fences of other languages', () => {
    assert.deepEqual(csvSampleWidthsIn('```bash\nnpm run build:site\n```\n'), []);
  });
});
