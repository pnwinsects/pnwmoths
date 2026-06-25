/**
 * scripts/match-character-images.ts
 *
 * Phase 43 (v4.0): one-off normalized matcher that reads key-matrix.json
 * characters[] and the filtered source-image filenames, normalizes both sides,
 * finds exact-normalized matches, and writes the committed draft
 * data/key-character-images.csv.
 *
 * This script is a one-off (run once; output committed to the repo — D-07).
 * The curator refines the resulting CSV by hand. The machine draft is a
 * starting point; DO NOT re-run this to update the CSV after the curator pass.
 *
 * Normalization (verified 77 exact matches against 237 states — RESEARCH
 * "Normalized matcher core"):
 *   - Lowercase
 *   - Strip file extension (.jpg/.jpeg/.png/.webp)
 *   - Strip leading ecoprovince_/us_ prefixes
 *   - Underscores → spaces
 *   - Drop \bcopy\b token
 *   - Non-[a-z0-9 ] → space
 *   - Collapse whitespace + trim
 *
 * Multi-match: first-wins; logs a warning and takes the first candidate.
 * No-match: omits the row (sparse CSV is fine — D-08).
 *
 * Usage:
 *   node scripts/match-character-images.ts
 *
 * Output: data/key-character-images.csv (columns: char_id,image_filename,alt_text)
 */

import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { stringify } from 'csv-stringify/sync';
import { isCharacterIllustration, toWebpName } from './upload-images.ts';

// ---------------------------------------------------------------------------
// Source constants
// ---------------------------------------------------------------------------

const KEY_MATRIX_PATH: string = resolve('data/key-matrix.json');
const SOURCE_DIR: string =
  process.env['KEY_IMAGES_SRC'] ??
  '/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key media/Images';
const OUTPUT_CSV_PATH: string = resolve('data/key-character-images.csv');

// ---------------------------------------------------------------------------
// Exported helpers (exported for unit tests — self-invocation guard prevents
// main() from running on import).
// ---------------------------------------------------------------------------

/**
 * Normalize a filename or character state string for matching.
 *
 * Exactly as RESEARCH "Normalized matcher core" / PATTERNS.md lines 95-101:
 *   1. Lowercase
 *   2. Strip file extension (.jpg/.jpeg/.png/.webp) case-insensitively
 *   3. Strip leading ecoprovince_ prefix
 *   4. Strip leading us_ prefix
 *   5. Underscores → spaces
 *   6. Drop \bcopy\b token
 *   7. Non-[a-z0-9 ] → space (handles commas, parentheses, etc.)
 *   8. Collapse whitespace + trim
 *
 * Exported for unit tests.
 */
export function norm(s: string): string {
  return s.toLowerCase()
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/^ecoprovince_/, '')
    .replace(/^us_/, '')
    .replace(/_/g, ' ')
    .replace(/\bcopy\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Row type for the output CSV.
 */
export interface ImageRow {
  char_id: number;
  image_filename: string;
  alt_text: string;
}

/**
 * Minimal character shape needed for matching (subset of CharacterSchema).
 */
interface Character {
  id: number;
  state: string;
}

/**
 * Pure matching function — matches characters against filenames and returns
 * one row per exact-normalized match.
 *
 * Exported for unit tests so the test exercises matching without filesystem I/O.
 *
 * @param characters - Array of character objects with id and state.
 * @param filenames  - Array of source filenames (already filtered by isCharacterIllustration).
 * @returns Array of rows suitable for CSV emission.
 */
export function matchRows(characters: Character[], filenames: string[]): ImageRow[] {
  // Build Map<normalizedFilename, originalFilename> (first-wins on collision).
  const normToOriginal = new Map<string, string>();
  const collisions = new Map<string, string[]>();

  for (const filename of filenames) {
    const key = norm(filename);
    if (normToOriginal.has(key)) {
      // Track collision for warning.
      const existing = collisions.get(key) ?? [normToOriginal.get(key)!];
      existing.push(filename);
      collisions.set(key, existing);
    } else {
      normToOriginal.set(key, filename);
    }
  }

  // Log any collisions (first-wins is the policy).
  for (const [key, candidates] of collisions) {
    console.warn(
      `[match-character-images] collision on normalized key "${key}": ` +
      `${candidates.join(', ')} — taking first (${normToOriginal.get(key)})`
    );
  }

  // Match each character against the normalized filename map.
  const rows: ImageRow[] = [];
  for (const char of characters) {
    const key = norm(char.state);
    const matchedFile = normToOriginal.get(key);
    if (matchedFile !== undefined) {
      rows.push({
        char_id: char.id,
        image_filename: toWebpName(matchedFile),
        alt_text: '',
      });
    }
    // No match → omit row (sparse CSV is fine — D-08).
  }

  return rows;
}

// ---------------------------------------------------------------------------
// main() — writes data/key-character-images.csv
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Read key-matrix.json characters[]. ---
  if (!existsSync(KEY_MATRIX_PATH)) {
    console.error(`[match-character-images] key-matrix.json not found: ${KEY_MATRIX_PATH}`);
    console.error('[match-character-images] Run npm run build:key first.');
    process.exit(1);
  }

  const keyMatrix = JSON.parse(readFileSync(KEY_MATRIX_PATH, 'utf8')) as {
    characters: Array<{ id: number; state: string }>;
  };
  const characters = keyMatrix.characters;
  console.log(`[match-character-images] loaded ${characters.length} characters from key-matrix.json`);

  // --- Read source filenames filtered through isCharacterIllustration. ---
  const { readdirSync } = await import('node:fs');
  const allFiles = readdirSync(SOURCE_DIR);
  const keptFiles = allFiles.filter(isCharacterIllustration);
  console.log(
    `[match-character-images] source dir: ${keptFiles.length} character illustrations from ${SOURCE_DIR}`
  );

  // --- Match and emit rows. ---
  const rows = matchRows(characters, keptFiles);
  console.log(`[match-character-images] ${rows.length} exact-normalized matches found`);

  // Log per-category coverage for visibility.
  const categoryCounts = new Map<string, number>();
  for (const row of rows) {
    const char = characters.find(c => c.id === row.char_id);
    const cat = (char as { category?: string } | undefined)?.category ?? 'unknown';
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  for (const [cat, count] of categoryCounts) {
    console.log(`  ${cat}: ${count} matches`);
  }

  // --- Write CSV via csv-stringify (auto-quotes commas in alt_text — RESEARCH Pitfall 7). ---
  const csv = stringify(rows, {
    header: true,
    columns: ['char_id', 'image_filename', 'alt_text'],
  });
  writeFileSync(OUTPUT_CSV_PATH, csv);
  console.log(`[match-character-images] wrote ${OUTPUT_CSV_PATH} (${rows.length} rows)`);
  console.log('[match-character-images] done. Curator: refine by hand and commit the updated CSV.');
}

// ---------------------------------------------------------------------------
// Self-invocation guard — verbatim from upload-tiles.ts:417-419.
// Prevents main() from running when the test file imports norm/matchRows.
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error((err as Error).message); process.exit(1); });
}
