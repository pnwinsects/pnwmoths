// scripts/convert-mpg-xlsx.ts
// Maintainer-run conversion: renders the Moths Photographers Group taxon
// workbook (MPG-Taxa_<YYYYMMDD>.xlsx) to data/mpg-taxa.csv, the committed
// source for checklist order.
//
// Why a converter instead of committing the workbook:
//
//   The .xlsx is a zip of XML — opaque to `git diff` and to review, and reading
//   it at build time would mean a spreadsheet dependency this project does not
//   have and does not want (data/ is flat, contributor-editable files). MPG
//   ships a new workbook every year or two; rendering it to CSV once, on
//   receipt, keeps the derivation reproducible and lets the next release be
//   diffed against this one line by line. See ADR 0030.
//
// All 17 columns are carried through verbatim, including the ones no code
// reads (Author with Year, Common Name, Taxonomic Note, MPG URL). Dropping
// them would save ~2 MB but make the committed file a lossy rendering of a
// source we do not otherwise keep — and the next curator question is exactly
// as likely to be about an authority or a taxonomic note as about sequence.
//
// Only the subset of SpreadsheetML this workbook actually uses is handled:
// one worksheet, shared strings, inline numbers. It is not a general reader.
//
// Run: node scripts/convert-mpg-xlsx.ts ~/Downloads/MPG-Taxa_20240311.xlsx
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'data/mpg-taxa.csv');

/**
 * XML entity decoding, `&amp;` last so `&amp;lt;` survives as the literal
 * `&lt;` rather than decoding twice into `<`.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * The shared-string table, in index order. A `<si>` holds either a single
 * `<t>` or a run of `<r><t>` fragments (mixed formatting inside one cell);
 * the fragments concatenate into one value.
 */
export function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let value = '';
    for (const t of (si[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) value += decodeEntities(t[1] ?? '');
    strings.push(value);
  }
  return strings;
}

/** `"C"` -> 2. Column letters are base-26 with A=1, so subtract one at the end. */
export function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0];
  if (!letters) throw new Error(`unparseable cell reference: ${cellRef}`);
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Worksheet rows as a dense string grid.
 *
 * Two cell forms appear: self-closing (`<c r="I2" s="24"/>`, a styled blank)
 * and one with a body. The self-closing alternative has to be matched FIRST or
 * the body branch runs past the blank cell and swallows the next cell's value —
 * which shifts every remaining column in the row by one and is silent.
 *
 * Cells are placed by their `r` reference, not by encounter order, because the
 * writer omits empty cells entirely; positional reading would close the gaps.
 */
export function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? '';
      const body = cell[2] ?? '';
      const reference = attributes.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attributes.match(/t="([^"]+)"/)?.[1];
      const index = reference ? columnIndex(reference) : cells.length;
      while (cells.length < index) cells.push('');
      let value = '';
      if (type === 'inlineStr') {
        for (const t of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) value += decodeEntities(t[1] ?? '');
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) {
          value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : decodeEntities(raw);
        }
      }
      cells[index] = value;
    }
    rows.push(cells);
  }
  // Ragged rows would make the CSV's column count vary by line.
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  for (const row of rows) while (row.length < width) row.push('');
  return rows;
}

/** Reads one member of the zip to a string. `unzip` is present on macOS and CI. */
function readZipMember(archive: string, member: string): string {
  return execFileSync('unzip', ['-p', archive, member], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function convertWorkbook(archive: string): string[][] {
  const sharedStrings = parseSharedStrings(readZipMember(archive, 'xl/sharedStrings.xml'));
  return parseSheet(readZipMember(archive, 'xl/worksheets/sheet1.xml'), sharedStrings);
}

function main(): void {
  const archive = process.argv[2];
  if (!archive) {
    console.error('usage: node scripts/convert-mpg-xlsx.ts <MPG-Taxa_YYYYMMDD.xlsx>');
    process.exit(1);
  }
  const rows = convertWorkbook(archive);
  writeFileSync(OUTPUT, stringify(rows));
  console.log(`[convert-mpg-xlsx] ${rows.length - 1} data rows, ${rows[0]?.length ?? 0} columns -> data/mpg-taxa.csv`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
