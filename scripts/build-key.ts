// scripts/build-key.ts
// Pre-build: parse data/key-characters.csv → emit data/key-matrix.json + data/key-coverage-report.json
// Run via: npm run build:key
// Mirrors emit-species-states.ts (JSON emit pattern) + build-data.ts (DuckDB + validateCsv)
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
// Note: validateCsv from build-data.ts is not used here because key-characters.csv
// contains embedded unescaped double-quotes in character labels (Lucid export artifact)
// that trip csv-parse without relax_quotes. We do the UTF-8 + file-exists preflight inline.
import { KeyMatrixSchema } from '../src/types/schemas.ts';

/**
 * Normalize a species binomial: trim whitespace and collapse multiple spaces to one.
 * Handles anomalies like 'Tolype  laricis' (double-space) and 'Tyta luctuosa ' (trailing space).
 */
export function normalizeBinomial(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Convert a (possibly whitespace-anomalous) binomial to a site slug.
 * e.g. 'Tolype  laricis' → 'tolype-laricis'
 */
export function binomialToSlug(binomial: string): string {
  const normalized = normalizeBinomial(binomial);
  const parts = normalized.split(' ');
  const genus = parts[0] ?? '';
  const epithet = parts[1] ?? '';
  return `${genus.toLowerCase()}-${epithet.toLowerCase()}`;
}

/**
 * Resolve a key binomial to a site species slug.
 * First attempts direct lowercase-hyphen conversion; falls back to synonymMap.
 * Returns null if neither resolves.
 *
 * @param binomial - Raw binomial from key CSV (may have whitespace anomalies)
 * @param siteSlugSet - Set of all slug strings in data/species.csv
 * @param synonymMap - Map<from_binomial, to_species_slug> from data/species-synonyms.csv
 */
export function resolveSlug(
  binomial: string,
  siteSlugSet: Set<string>,
  synonymMap: Map<string, string>
): string | null {
  const normalized = normalizeBinomial(binomial);
  const directSlug = binomialToSlug(binomial);
  if (siteSlugSet.has(directSlug)) return directSlug;
  const synonymSlug = synonymMap.get(normalized) ?? null;
  if (synonymSlug !== null && siteSlugSet.has(synonymSlug)) return synonymSlug;
  return null;
}

/**
 * Parse a colon-delimited character label into its hierarchy components.
 * 3-part ('A:B:C') → { category, subcategory: null, question, state }
 * 4-part ('A:B:C:D') → { category, subcategory, question, state }
 * Throws on any other colon depth.
 */
export function parseCharacterLabel(label: string): {
  category: string;
  subcategory: string | null;
  question: string;
  state: string;
} {
  // Strip leading/trailing double-quotes produced by csv-parse relax_quotes on embedded-quote fields.
  // e.g. '"Abdomen and thorax:...:Yes"' → 'Abdomen and thorax:...:Yes'
  const cleaned = label.replace(/^"|"$/g, '');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const [category, question, state] = parts as [string, string, string];
    return {
      category: category.trim(),
      subcategory: null,
      question: question.trim(),
      state: state.trim(),
    };
  } else if (parts.length === 4) {
    const [category, subcategory, question, state] = parts as [string, string, string, string];
    return {
      category: category.trim(),
      subcategory: subcategory.trim(),
      question: question.trim(),
      state: state.trim(),
    };
  }
  throw new Error(`Unexpected character label depth: "${label}" (${parts.length} parts; expected 3 or 4)`);
}

/**
 * Build a base64-encoded Uint8Array bitset over speciesCount species.
 * Bit i (LSB-first) is set iff i is in matchingIndices.
 *
 * @param speciesCount - Total number of matched species (determines byte length)
 * @param matchingIndices - Indices of species that score 1 for this character-state
 */
export function buildBitset(speciesCount: number, matchingIndices: number[]): string {
  const nBytes = Math.ceil(speciesCount / 8);
  const bits = new Uint8Array(nBytes);
  for (const i of matchingIndices) {
    if (i < 0 || i >= speciesCount) {
      throw new RangeError(`buildBitset: index ${i} is out of range [0, ${speciesCount})`);
    }
    bits[i >> 3]! |= 1 << (i & 7); // LSB-first
  }
  return Buffer.from(bits).toString('base64');
}

/**
 * Query data/images.csv for navigational-priority images per species slug.
 * Returns a Map<slug, filename> built entirely in TypeScript — no slug interpolation into SQL
 * (T-39-01 mitigation: avoids SQL injection from malformed slug values).
 */
async function queryNavImages(db: Awaited<ReturnType<typeof DuckDBInstance.create>>): Promise<Map<string, string>> {
  const conn = await db.connect();
  try {
    await conn.run(`
      CREATE TABLE images AS
      SELECT * FROM read_csv('data/images.csv',
        header = true,
        nullstr = '',
        delim = ',',
        quote = '"',
        escape = '"',
        auto_detect = false,
        columns = {
          'species_slug': 'VARCHAR',
          'filename': 'VARCHAR',
          'photographer': 'VARCHAR',
          'weight': 'VARCHAR',
          'license': 'VARCHAR',
          'view': 'VARCHAR',
          'specimen': 'VARCHAR',
          'navigational': 'VARCHAR',
          'locality': 'VARCHAR',
          'state': 'VARCHAR',
          'latitude': 'VARCHAR',
          'longitude': 'VARCHAR',
          'elevation_ft': 'VARCHAR',
          'year': 'VARCHAR',
          'month': 'VARCHAR',
          'day': 'VARCHAR',
          'collector': 'VARCHAR',
          'subspecies': 'VARCHAR'
        }
      )
    `);

    // Load ALL images — no slug interpolation into SQL (T-39-01)
    // Order by navigational priority first, then weight ascending
    const imagesResult = await conn.runAndReadAll(`
      SELECT species_slug, filename, navigational, TRY_CAST(weight AS INTEGER) AS weight_int
      FROM images
      ORDER BY species_slug,
        CASE WHEN navigational = 'true' THEN 0 ELSE 1 END,
        TRY_CAST(weight AS INTEGER)
    `);

    // Build Map<slug, filename> in TypeScript — first row per slug wins (lowest weight / navigational priority)
    const navImages = new Map<string, string>();
    type ImagesRow = { species_slug: unknown; filename: unknown };
    const rows = imagesResult.getRowObjectsJS() as ImagesRow[];
    for (const row of rows) {
      const slug = String(row.species_slug ?? '');
      const filename = String(row.filename ?? '');
      if (slug && filename && !navImages.has(slug)) {
        navImages.set(slug, filename);
      }
    }
    return navImages;
  } finally {
    conn.closeSync();
  }
}

export async function main(): Promise<void> {
  // 1. Pre-flight validation (UTF-8 + file-exists check)
  // key-characters.csv has embedded unescaped quotes in some labels (Lucid export artifact);
  // validateCsv from build-data.ts would fail on csv-parse without relax_quotes, so we inline
  // the UTF-8 + existence check here.
  let raw: Buffer;
  try {
    raw = readFileSync(resolve('data/key-characters.csv'));
  } catch (e) {
    throw new Error(`Cannot read data/key-characters.csv: ${(e as Error).message}`);
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new Error(
      'data/key-characters.csv contains non-UTF-8 bytes. If edited in Excel on Windows, re-save as CSV UTF-8.'
    );
  }

  // 2. CSV parse — columns: false (MANDATORY: row 0 is species data, not field names — Pitfall 1)
  // relax_quotes: true — some character labels contain embedded unescaped double-quotes
  // (Lucid export artifact, e.g. 'dipped" in a different color?'); relax_quotes allows parsing
  // these without error. columns: false is still MANDATORY (row 0 is species data, not headers).
  const allRows: string[][] = parse(raw, { columns: false, skip_empty_lines: true, relax_quotes: true });
  const [headerRow, ...dataRows] = allRows;
  const speciesBinomials = (headerRow ?? []).slice(1); // 1,228 entries (col 0 is the label column)

  // 3. Load slug resolution resources
  const speciesRows = parse(
    readFileSync(resolve('data/species.csv')),
    { columns: true, skip_empty_lines: true }
  ) as Array<{ genus: string; species: string }>;
  const siteSlugSet = new Set(
    speciesRows.map(r => `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`)
  );

  const synonymRows = parse(
    readFileSync(resolve('data/species-synonyms.csv')),
    { columns: true, skip_empty_lines: true, bom: true }
  ) as Array<{ from_binomial: string; to_species_slug: string }>;
  const synonymMap = new Map(
    synonymRows.map(r => [normalizeBinomial(r.from_binomial), r.to_species_slug])
  );

  // 4. Resolve species slugs
  const resolvedSlugs: Array<string | null> = speciesBinomials.map(b =>
    resolveSlug(b, siteSlugSet, synonymMap)
  );
  const matchedIndices: number[] = resolvedSlugs.flatMap((s, i) => (s !== null ? [i] : []));
  const unmatchedBinomials = speciesBinomials.filter((_, i) => resolvedSlugs[i] === null);

  // 5. DuckDB nav-image join — query ALL images, resolve per slug in TypeScript (no SQL interpolation)
  const db = await DuckDBInstance.create(':memory:');
  const navImages = await queryNavImages(db);

  // 6. Build characters[], species[], matrix[]
  const characters = dataRows.map((row, idx) => ({
    id: idx,
    ...parseCharacterLabel(row[0] ?? ''),
    image_filename: null,
    alt_text: null,
  }));

  // Build slug → accepted-name lookup so synonym-resolved species display the accepted name
  const slugToName = new Map(
    speciesRows.map(r => [
      `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`,
      { genus: r.genus, epithet: r.species },
    ])
  );

  const matchedSlugs = matchedIndices.map(i => resolvedSlugs[i]!);
  const species = matchedSlugs.map((slug, spIdx) => {
    const origIdx = matchedIndices[spIdx]!;
    const binomial = speciesBinomials[origIdx] ?? '';
    const normalized = normalizeBinomial(binomial);
    const parts = normalized.split(' ');
    // Use accepted name from species.csv when available (covers synonym-resolved species);
    // fall back to key-CSV binomial parts only when slug has no species row (should not
    // occur for matched slugs, but avoids a crash if data drifts).
    const accepted = slugToName.get(slug);
    return {
      slug,
      genus: accepted?.genus ?? parts[0] ?? '',
      epithet: accepted?.epithet ?? parts[1] ?? '',
      common_name: null,
      nav_image: navImages.get(slug) ?? null,
    };
  });

  const nMatchedSpecies = matchedSlugs.length;
  const matrix = dataRows.map(row => {
    // Build list of matched-species-rank positions that score '1' in this row
    const matchingRanks: number[] = [];
    for (const [rank, origIdx] of matchedIndices.entries()) {
      if (row[origIdx + 1] === '1') {
        matchingRanks.push(rank);
      }
    }
    return buildBitset(nMatchedSpecies, matchingRanks);
  });

  // 7. Zod build-time validation (KEY-03)
  const artifact = KeyMatrixSchema.parse({
    meta: {
      totalKeySpecies:  speciesBinomials.length,    // 1,228 (all key.csv binomials incl. unmatched)
      matchedSpecies:   matchedSlugs.length,         // 1,192 (resolved to site slugs)
      unmatchedSpecies: unmatchedBinomials.length,   // 36
      generatedAt:      new Date().toISOString(),
    },
    characters,
    species,
    matrix,
  });

  // 8. Post-Zod structural invariants (T-39-02 mitigation)
  const nBytes = Math.ceil(artifact.species.length / 8);
  const expectedB64Len = Math.ceil(nBytes / 3) * 4;
  if (artifact.matrix.length !== 237) {
    throw new Error(
      `matrix.length invariant failed: expected 237, got ${artifact.matrix.length}`
    );
  }
  for (let i = 0; i < artifact.matrix.length; i++) {
    const b64 = artifact.matrix[i]!;
    if (b64.length !== expectedB64Len) {
      throw new Error(
        `bitset length mismatch at index ${i}: expected ${expectedB64Len}, got ${b64.length}`
      );
    }
  }

  // 9. Write artifacts (D-07: commit both)
  writeFileSync(resolve('data/key-matrix.json'), JSON.stringify(artifact));

  const coverageReport = {
    generated: new Date().toISOString(),
    matched: matchedSlugs.length,
    unmatched: unmatchedBinomials.length,
    unmatched_binomials: unmatchedBinomials.map(b => ({
      binomial: normalizeBinomial(b),
      direct_slug: binomialToSlug(b),
      reason: 'no direct match, no synonym' as const,
    })),
  };
  writeFileSync(resolve('data/key-coverage-report.json'), JSON.stringify(coverageReport));

  console.log(
    `build-key: ${matchedSlugs.length} matched, ${unmatchedBinomials.length} unmatched of ${speciesBinomials.length} total`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
