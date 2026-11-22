import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  columnIndex,
  decodeEntities,
  detectLayout,
  LAYOUTS,
  parseSharedStrings,
  parseSheet,
  toTable,
} from './convert-mpg-xlsx.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('decodeEntities', () => {
  it('decodes the five predefined entities', () => {
    assert.equal(decodeEntities('a &lt;b&gt; &quot;c&quot; &apos;d&apos; &amp; e'), `a <b> "c" 'd' & e`);
  });

  it('decodes numeric and hex character references', () => {
    assert.equal(decodeEntities('Hübner &#8212; &#x5B;1809&#x5D;'), 'Hübner — [1809]');
  });

  it('does not double-decode an escaped ampersand', () => {
    // &amp;lt; is the literal text "&lt;", not "<".
    assert.equal(decodeEntities('&amp;lt;'), '&lt;');
  });
});

describe('columnIndex', () => {
  it('maps single letters', () => {
    assert.equal(columnIndex('A1'), 0);
    assert.equal(columnIndex('Q13245'), 16);
  });

  it('maps the two-letter range', () => {
    assert.equal(columnIndex('AA1'), 26);
    assert.equal(columnIndex('AB7'), 27);
  });

  it('rejects a reference with no column letters', () => {
    assert.throws(() => columnIndex('12'), /unparseable cell reference/);
  });
});

describe('parseSharedStrings', () => {
  it('reads plain and run-formatted entries in index order', () => {
    const xml =
      '<sst><si><t>Macaria</t></si>' +
      '<si><r><t>Hübner, </t></r><r><t>[1809]</t></r></si>' +
      '<si><t xml:space="preserve">trailing </t></si></sst>';
    assert.deepEqual(parseSharedStrings(xml), ['Macaria', 'Hübner, [1809]', 'trailing ']);
  });
});

describe('parseSheet', () => {
  const shared = ['Macaria', 'occiduaria', 'Geometridae'];

  it('resolves shared-string and numeric cells', () => {
    const xml =
      '<sheetData><row r="1">' +
      '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>6279</v></c>' +
      '</row></sheetData>';
    assert.deepEqual(parseSheet(xml, shared), [['Macaria', 'occiduaria', '6279']]);
  });

  // The bug this guards is silent: a self-closing blank cell matched by the
  // body branch consumes the NEXT cell's <v>, shifting every later column left.
  it('keeps columns aligned across a self-closing blank cell', () => {
    const xml =
      '<sheetData><row r="1">' +
      '<c r="A1" t="s"><v>0</v></c>' +
      '<c r="B1" s="24"/>' +
      '<c r="C1" t="s"><v>2</v></c>' +
      '</row></sheetData>';
    assert.deepEqual(parseSheet(xml, shared), [['Macaria', '', 'Geometridae']]);
  });

  it('places cells by reference, so omitted empty cells leave gaps', () => {
    const xml = '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="D1"><v>7</v></c></row></sheetData>';
    assert.deepEqual(parseSheet(xml, shared), [['Macaria', '', '', '7']]);
  });

  it('pads short rows so every row has the same width', () => {
    const xml =
      '<sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>1</v></c></row>' +
      '</sheetData>';
    assert.deepEqual(parseSheet(xml, shared), [
      ['Macaria', '', '1'],
      ['occiduaria', '', ''],
    ]);
  });

  it('reads inline strings', () => {
    const xml = '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nolidae</t></is></c></row></sheetData>';
    assert.deepEqual(parseSheet(xml, shared), [['Nolidae']]);
  });
});

// The committed artifact is what everything downstream reads, so assert its
// shape here rather than only the parser that produced it.
describe('data/mpg-taxa.csv', () => {
  const rows: Record<string, string>[] = parse(readFileSync(resolve(ROOT, 'data/mpg-taxa.csv')), {
    columns: true,
    skip_empty_lines: true,
  });

  it('carries all 17 workbook columns', () => {
    assert.deepEqual(Object.keys(rows[0] ?? {}), [
      'P No', 'New P No', 'MONA', 'Genus_Species', 'Author with Year', 'Common Name',
      'Superfamily', 'Family', 'Subfamily', 'Tribe', 'Subtribe', 'Genus', 'Species',
      'MPG URL', 'Taxonomic Note', 'Synonymy', 'P No 2016',
    ]);
  });

  it('holds the full North American list', () => {
    assert.equal(rows.length, 13245);
  });

  it('is in MPG sequence — P No ascends monotonically', () => {
    const outOfOrder = rows.filter(
      (row, i) => i > 0 && (row['P No'] ?? '') <= (rows[i - 1]?.['P No'] ?? ''),
    );
    assert.deepEqual(outOfOrder.map((r) => r['P No']), []);
  });

  it('never lost the Genus/Species split that the join depends on', () => {
    const missing = rows.filter((row) => !row.Genus || !row.Species);
    assert.deepEqual(missing.map((r) => r['P No']), []);
  });
});

describe('detectLayout and toTable', () => {
  const header2023 = LAYOUTS[0]?.header ?? [];
  const header2025 = LAYOUTS[1]?.header ?? [];

  it('recognises the 2023 workbook by its header row', () => {
    assert.equal(detectLayout([[...header2023]]).output, 'data/mpg-taxa.csv');
  });

  it('recognises the 2025 workbook by the header under its title line, ignoring a blank last cell', () => {
    const rows = [['Pohl & Nanz 2023 NA Checklist plus corrections…'], [...header2025, '']];
    assert.equal(detectLayout(rows).output, 'data/mpg-taxa-2025.csv');
  });

  // A third layout written over one of these files would shift every column silently.
  it('refuses a workbook it does not recognise', () => {
    assert.throws(() => detectLayout([['Genus', 'Species']]), /unrecognised MPG workbook/);
  });

  it('refuses a known first cell followed by a changed header', () => {
    const renamed = [...header2025];
    renamed[2] = 'Rank';
    assert.throws(() => detectLayout([['title'], renamed]), /unrecognised MPG workbook/);
    assert.throws(() => detectLayout([['title'], [...header2025, 'extra']]), /unrecognised MPG workbook/);
  });

  it('drops the title line, a trailing column blank in every row, and blank rows at the end', () => {
    // parseSheet pads every row to the widest, so the fixture does too.
    const pad = (row: string[]): string[] => [...row, ...Array<string>(header2025.length + 1 - row.length).fill('')];
    const rows = [pad(['title']), pad([...header2025]), pad(['5', 'P&N23']), pad([])];
    const table = toTable(rows, detectLayout(rows));
    assert.equal(table.length, 2);
    assert.deepEqual(table[0], [...header2025]);
    assert.equal(table[1]?.length, header2025.length);
  });

  it('keeps a blank-headed column that holds a value', () => {
    const rows = [[...header2023, ''], ['010001', ...Array<string>(header2023.length - 1).fill(''), 'x']];
    assert.equal(toTable(rows, detectLayout(rows))[0]?.length, header2023.length + 1);
  });
});

describe('data/mpg-taxa-2025.csv', () => {
  const rows: Record<string, string>[] = parse(readFileSync(resolve(ROOT, 'data/mpg-taxa-2025.csv')), {
    columns: true,
    skip_empty_lines: true,
  });

  it('carries the 28 named columns of the 2025 workbook', () => {
    assert.deepEqual(Object.keys(rows[0] ?? {}), [
      'SORT 2025', 'status', 'rank', 'Family', 'Subfamily', 'P-No. 2025', 'P-No. 2023',
      'Valid Genus', 'valid species', 'ssp letter', 'valid ssp', 'NAME', 'semicolon', 'brackets',
      'author', 'date', 'original genus', 'descriptor(s)', 'origin', 'P-No. 2023 (sort)',
      'CDN P-No. 2018', 'P3 No. 2016', 'MONA 1983', 'ID INFO', 'NOTE', 'post-2023 edit notes',
      'post-2023 edit log date, editor', 'P-No change history',
    ]);
  });

  it('holds the whole list, synonyms and higher taxa included', () => {
    assert.equal(rows.length, 37118);
  });

  // report-mpg-2025.ts reads tribe from the order of the rows, so the order must survive.
  it('is in MPG sequence: SORT 2025 ascends', () => {
    const outOfOrder = rows.filter((row, i) => i > 0 && Number(row['SORT 2025']) <= Number(rows[i - 1]?.['SORT 2025']));
    assert.deepEqual(outOfOrder.map((r) => r['SORT 2025']), []);
  });
});
