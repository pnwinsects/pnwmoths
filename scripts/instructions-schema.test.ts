import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
// So: every schema table in a runbook is checked against the real CSV header.
// The convention a runbook must follow is a heading naming the file —
//
//     ## Schema: data/images.csv
//
// — followed by a markdown table whose first column is the field name. Any doc
// without such a heading is simply not checked, so this imposes nothing on
// prose-only guides.

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INSTRUCTIONS_DIR = join(PROJECT_ROOT, '_instructions');

/** `## Schema: data/<something>.csv`, capturing the path. */
const SCHEMA_HEADING = /^#{1,6}\s+Schema:\s+(\S+\.csv)\s*$/gm;

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
const tables = docs.flatMap((doc) =>
  schemaTablesIn(doc, readFileSync(join(INSTRUCTIONS_DIR, doc), 'utf8')),
);

describe('_instructions schema tables match the real CSV headers', () => {
  it('finds schema tables to check', () => {
    assert.ok(tables.length >= 3, `expected several schema tables, found ${tables.length}`);
  });

  for (const table of tables) {
    it(`${table.doc} → ${table.csvPath}`, () => {
      const header = new Set(csvHeader(resolve(PROJECT_ROOT, table.csvPath)));
      const unknown = table.fields.filter((f) => !header.has(f));
      assert.deepEqual(
        unknown,
        [],
        `${table.doc} documents column(s) that do not exist in ${table.csvPath}. ` +
          `Actual columns: ${[...header].join(', ')}`,
      );
    });
  }
});

describe('the guard actually fails on the bug it exists to catch', () => {
  // docs/lessons-learned.md: "Mutation-test the guard afterwards: reintroduce the
  // bug and confirm it goes red. A guard you haven't watched fail is a guess."
  // Doing that by hand proves it once; this proves it on every run, and is the
  // only test here that exercises the assertion path rather than the parser.
  const unknownColumns = (doc: string, csvPath: string): string[] => {
    const table = schemaTablesIn(doc, `## Schema: ${csvPath}\n| Field |\n|---|\n| species_id |\n`)[0];
    assert.ok(table, 'fixture should produce a table');
    const header = new Set(csvHeader(resolve(PROJECT_ROOT, csvPath)));
    return table.fields.filter((f) => !header.has(f));
  };

  it('reports species_id against data/records.csv — the exact #240 bug', () => {
    assert.deepEqual(unknownColumns('fixture.md', 'data/records.csv'), ['species_id']);
  });

  it('reports species_id against data/images.csv too', () => {
    assert.deepEqual(unknownColumns('fixture.md', 'data/images.csv'), ['species_id']);
  });

  it('accepts the column those files really use', () => {
    const table = schemaTablesIn('f.md', '## Schema: data/records.csv\n| Field |\n|---|\n| species_slug |\n')[0];
    const header = new Set(csvHeader(resolve(PROJECT_ROOT, 'data/records.csv')));
    assert.deepEqual(table!.fields.filter((f) => !header.has(f)), []);
  });
});

describe('csvHeader', () => {
  it('reads the declared header, not the keys of the first data row', () => {
    // data/images.csv has 18 columns; inferring from a row would still give 18,
    // but would collapse duplicates and choke on a header-only file.
    assert.equal(csvHeader(resolve(PROJECT_ROOT, 'data/images.csv'))[0], 'species_slug');
    assert.equal(csvHeader(resolve(PROJECT_ROOT, 'data/images.csv')).length, 18);
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
