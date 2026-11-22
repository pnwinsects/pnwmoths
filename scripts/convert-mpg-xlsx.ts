// scripts/convert-mpg-xlsx.ts
// Maintainer-run conversion: renders a Moths Photographers Group taxon
// workbook to a committed CSV in data/. Two workbooks are known, and they are
// different spreadsheets, not two copies of one (#418):
//
//   MPG-Taxa_20240311.xlsx — the 2023 checklist, 17 columns, header on the
//     first row -> data/mpg-taxa.csv, the source for checklist order today.
//   Pohl_&_Nanz_2026_APPEND1x-NA_checklist_2025_update.xlsx — the 2025
//     update, 28 columns under a one-line title -> data/mpg-taxa-2025.csv.
//
// The converter recognises which one it was given by its header row and
// refuses a workbook it does not recognise, because a third layout would
// otherwise be written over one of these files with its columns shifted.
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
// Every column is carried through verbatim, including the ones no code
// reads (Author with Year, Common Name, Taxonomic Note, MPG URL). Dropping
// them would save ~2 MB but make the committed file a lossy rendering of a
// source we do not otherwise keep — and the next curator question is exactly
// as likely to be about an authority or a taxonomic note as about sequence.
//
// Only the subset of SpreadsheetML this workbook actually uses is handled:
// one worksheet, shared strings, inline numbers. It is not a general reader.
//
// Three things are dropped, and only these: the 2025 workbook's title line
// above its header (recorded in data/README.md instead, because a CSV has one
// header row), a trailing column that has neither a header nor a value in any
// row, and blank rows at the end, where a styled but empty row was saved.
// Cell values are not rewritten: SORT 2025 keeps the binary floating-point
// digits the workbook stores (`24394.080000000002`), since it is read as row
// order, never as a number.
//
// Run: node scripts/convert-mpg-xlsx.ts ~/Downloads/<workbook>.xlsx
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A workbook layout this converter knows, and the file it is rendered to. */
export interface Layout {
  /** Repo-relative output path. */
  output: string;
  /** Zero-based index of the header row; rows above it are a title, not data. */
  headerRow: number;
  /** The first header cell, which is how the layout is recognised. */
  firstHeader: string;
}

export const LAYOUTS: Layout[] = [
  { output: 'data/mpg-taxa.csv', headerRow: 0, firstHeader: 'P No' },
  { output: 'data/mpg-taxa-2025.csv', headerRow: 1, firstHeader: 'SORT 2025' },
];

/** Which known layout these worksheet rows are in, or an error naming what was found. */
export function detectLayout(rows: string[][]): Layout {
  const layout = LAYOUTS.find((candidate) => rows[candidate.headerRow]?.[0] === candidate.firstHeader);
  if (!layout) {
    const seen = rows.slice(0, 2).map((row) => JSON.stringify(row[0] ?? '')).join(', ');
    throw new Error(`unrecognised MPG workbook: the first cells of its first two rows are ${seen}`);
  }
  return layout;
}

/**
 * The rows from the header down, without blank rows at the end and without a
 * trailing column that is blank in every row including the header. A
 * blank-headed column that holds any value is kept, because dropping it would
 * lose data.
 */
export function toTable(rows: string[][], layout: Layout): string[][] {
  const table = rows.slice(layout.headerRow).map((row) => [...row]);
  while (table.length > 1 && (table[table.length - 1] ?? []).every((cell) => cell === '')) table.pop();
  const width = table[0]?.length ?? 0;
  let keep = width;
  while (keep > 0 && table.every((row) => (row[keep - 1] ?? '') === '')) keep--;
  return table.map((row) => row.slice(0, keep));
}

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
    console.error('usage: node scripts/convert-mpg-xlsx.ts <MPG workbook .xlsx>');
    process.exit(1);
  }
  const sheet = convertWorkbook(archive);
  const layout = detectLayout(sheet);
  const rows = toTable(sheet, layout);
  writeFileSync(resolve(ROOT, layout.output), stringify(rows));
  console.log(`[convert-mpg-xlsx] ${rows.length - 1} data rows, ${rows[0]?.length ?? 0} columns -> ${layout.output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
