import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  columnIndex,
  decodeEntities,
  parseSharedStrings,
  parseSheet,
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
