/**
 * scripts/extract-character-images.ts
 *
 * Phase 43 (v4.1): AUTHORITATIVE character→image extractor.
 *
 * Reads the original Lucid3 Builder key data (data/key.data — the XML extracted
 * from `PNW Moths.data` inside the pnwmoths_https backup) and emits the committed
 * data/key-character-images.csv with EXACT state→image bindings.
 *
 * This supersedes scripts/match-character-images.ts (the normalized fuzzy matcher),
 * which only recovered 77/237 characters and mis-bound ~38 of them (e.g. attached
 * the generic "Black copy.jpg" swatch where Lucid bound "Black Forewing.jpg").
 * The Lucid key.data carries the curator's real bindings, so no guessing is needed.
 *
 * How the binding works (key.data XML):
 *   <feature_tree> … <state_item item_id='1224' item_name='Washington'/> …
 *   <media_data>
 *     <media_item media_path='Images/US_Washington.jpg' media_type='image' …>
 *       <media_details item_id='1224' media_index='1' …/>
 *     </media_item>
 *   The 237 <state_item>s appear in document order, which is identical to
 *   data/key-characters.csv row order — i.e. build-key.ts's char_id (verified:
 *   0 position mismatches against data/key-matrix.json). So char_id = the index
 *   of each state_item in document order; we join to images via media_details@item_id.
 *
 * Output: data/key-character-images.csv (char_id,image_filename,alt_text).
 * alt_text is left blank (Lucid stores no caption); the render derives alt from
 * the state name (helpImageAlt). Run once; output is committed.
 *
 * Usage: npm run key:extract-images   (or: node scripts/extract-character-images.ts)
 */

import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { stringify } from 'csv-stringify/sync';
import { toWebpName } from './upload-images.ts';

const KEY_DATA_PATH: string = process.env['KEY_DATA'] ?? resolve('data/key.data');
const OUTPUT_CSV_PATH: string = resolve('data/key-character-images.csv');

export interface ImageRow {
  char_id: number;
  image_filename: string;
  alt_text: string;
}

/** Decode the XML entities Lucid escapes in attribute values (e.g. doesn&apos;t → doesn't). */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // last: avoid double-decoding (&amp;apos; → &apos;)
}

/**
 * Parse the Lucid key.data XML into authoritative image rows.
 *
 * @param xml - contents of key.data
 * @returns one row per state that has a bound image, char_id ascending.
 * Exported for unit tests (pure; no filesystem I/O).
 */
export function extractRows(xml: string): ImageRow[] {
  // 1. state_item item_ids in document order → char_id = index.
  //    (Document order == feature-tree depth-first order == key-characters.csv order.)
  const stateIds: string[] = [];
  const stateRe = /<state_item\b[^>]*\bitem_id='([^']*)'/g;
  for (let m; (m = stateRe.exec(xml)); ) stateIds.push(m[1]!);

  // 2. item_id → primary image basename, from <media_item> blocks.
  //    Keep the lowest media_index when a state has several images.
  const imageByItem = new Map<string, { name: string; index: number }>();
  const itemRe = /<media_item\b([^>]*)>([\s\S]*?)<\/media_item>/g;
  for (let mi; (mi = itemRe.exec(xml)); ) {
    const attrs = mi[1]!;
    if (!/\bmedia_type='image'/.test(attrs)) continue;
    const pathM = /\bmedia_path='([^']*)'/.exec(attrs);
    if (!pathM) continue;
    const basename = decodeXmlEntities(pathM[1]!.split('/').pop()!); // 'Images/Black Forewing.jpg' → 'Black Forewing.jpg'
    // Parse each <media_details/>; pull item_id and media_index independently so
    // attribute order doesn't matter (media_index may precede or follow item_id).
    const detailRe = /<media_details\b([^>]*)\/>/g;
    for (let d; (d = detailRe.exec(mi[2]!)); ) {
      const da = d[1]!;
      const idM = /\bitem_id='([^']*)'/.exec(da);
      if (!idM) continue;
      const itemId = idM[1]!;
      const index = Number(/\bmedia_index='([^']*)'/.exec(da)?.[1] ?? 0);
      const prev = imageByItem.get(itemId);
      if (!prev || index < prev.index) imageByItem.set(itemId, { name: basename, index });
    }
  }

  // 3. Join: emit a row per state that has a bound image.
  const rows: ImageRow[] = [];
  stateIds.forEach((itemId, charId) => {
    const hit = imageByItem.get(itemId);
    if (hit) rows.push({ char_id: charId, image_filename: toWebpName(hit.name), alt_text: '' });
  });
  return rows;
}

async function main(): Promise<void> {
  const xml = readFileSync(KEY_DATA_PATH, 'utf8');
  const stateCount = (xml.match(/<state_item\b/g) ?? []).length;
  if (stateCount === 0) {
    console.error(`[extract-character-images] no <state_item> found in ${KEY_DATA_PATH} — wrong file?`);
    process.exit(1);
  }

  const rows = extractRows(xml);
  console.log(`[extract-character-images] ${stateCount} characters; ${rows.length} have an authoritative image binding`);

  const csv = stringify(rows, { header: true, columns: ['char_id', 'image_filename', 'alt_text'] });
  writeFileSync(OUTPUT_CSV_PATH, csv);
  console.log(`[extract-character-images] wrote ${OUTPUT_CSV_PATH} (${rows.length} rows)`);
}

// Self-invocation guard — verbatim from upload-tiles.ts:417-419.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error((err as Error).message); process.exit(1); });
}
