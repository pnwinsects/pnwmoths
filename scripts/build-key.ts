// scripts/build-key.ts
// Pre-build: parse data/key-scores.csv → emit data/key-matrix.json + data/key-coverage-report.json
// Run via: npm run build:key
// Mirrors emit-species-states.ts (JSON emit pattern) + build-data.ts (DuckDB + validateCsv)
//
// data/key-scores.csv is the key's source of truth: one row per species (named by
// binomial, as the curator writes it), one column per character-state, `1` where the
// species has that state and blank where it is unscored (ADR 0048, issue #390). It
// was transposed from Lucid3's export, which had species as columns.
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { KeyMatrixSchema } from '../src/types/schemas.ts';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../src/_lib/withheld-families.ts';
import { loadUnpublishedSpecies, isUnpublished, normalizeSlug } from '../src/_lib/unpublished-species.ts';
import { formatEpithet, isEpithetQuoted } from '../src/_lib/format-epithet.ts';
import { WEIGHT_ORDER_SQL, pickIdentifyPhoto } from '../src/_lib/photo-display.ts';
import { pathToFileURL } from 'node:url';

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
  const parts = label.split(':');
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

/** The leading column of data/key-scores.csv. Every other column is a character-state. */
export const KEY_SCORES_NAME_COLUMN = 'binomial';

/**
 * Parse data/key-scores.csv: one row per species, one column per character-state.
 *
 * A cell is `1` (the species has the state), or blank or `0` (unscored — which the key
 * treats as "unknown", never "absent"; ADR 0012). Anything else is an error rather
 * than a guess: an `x` or a `Y` typed in Excel must not silently become unscored.
 * Binomials are whitespace-normalized and must be unique.
 *
 * Returns the character-state labels in column order (column order IS char_id, which
 * data/key-character-images.csv binds to), the binomials in row order, and
 * scores[speciesRow][charId].
 */
export function parseKeyScores(raw: Buffer | string): {
  labels: string[];
  binomials: string[];
  scores: boolean[][];
} {
  const rows = parse(raw, { columns: false, skip_empty_lines: true, bom: true }) as string[][];
  const [header, ...body] = rows;
  if (!header || header[0]?.trim() !== KEY_SCORES_NAME_COLUMN) {
    throw new Error(
      `data/key-scores.csv: the first column must be headed "${KEY_SCORES_NAME_COLUMN}", got ${JSON.stringify(header?.[0] ?? null)}`
    );
  }
  const labels = header.slice(1);
  const duplicateLabels = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (duplicateLabels.length > 0) {
    throw new Error(`data/key-scores.csv: duplicate character-state column(s): ${duplicateLabels.join(' | ')}`);
  }

  const problems: string[] = [];
  const firstLine = new Map<string, number>();
  const binomials: string[] = [];
  const scores: boolean[][] = [];
  body.forEach((row, i) => {
    const line = i + 2; // 1-based, after the header
    const binomial = normalizeBinomial(row[0] ?? '');
    if (binomial === '') problems.push(`line ${line}: blank ${KEY_SCORES_NAME_COLUMN}`);
    const earlier = firstLine.get(binomial);
    if (binomial !== '' && earlier !== undefined) {
      problems.push(`line ${line}: "${binomial}" is already scored on line ${earlier}`);
    } else {
      firstLine.set(binomial, line);
    }
    const scored = labels.map((label, c) => {
      const cell = (row[c + 1] ?? '').trim();
      if (cell === '1') return true;
      if (cell === '' || cell === '0') return false;
      problems.push(`line ${line} ("${binomial}"), column "${label}": ${JSON.stringify(cell)} — use 1, or leave blank`);
      return false;
    });
    binomials.push(binomial);
    scores.push(scored);
  });

  if (problems.length > 0) {
    const shown = problems.slice(0, 20);
    throw new Error(
      `data/key-scores.csv has ${problems.length} problem(s):\n  ${shown.join('\n  ')}` +
        (problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : '')
    );
  }
  return { labels, binomials, scores };
}

/**
 * Render data/key-template.csv: the header of data/key-scores.csv, then one blank row
 * per species we hold that no key row scores yet — the curator fills in `1`s and the
 * rows are appended with `npm run key:merge` (issue #390).
 *
 * `species` must already exclude unpublished species: a provisional name is not
 * something to key. Withheld species (the Geometridae embargo) ARE included, after
 * the published ones, because scoring them is how the embargo eventually lifts.
 * Within each group, rows follow checklist order (ADR 0030), so a family's species
 * sit together; any species the checklist lacks sorts last, by name.
 *
 * A species counts as scored when any key row resolves to it — directly or through
 * data/species-synonyms.csv — against ALL species, withheld included.
 */
export function buildKeyTemplate(opts: {
  labels: string[];
  keyBinomials: string[];
  species: Array<{ genus: string; species: string; withheld: boolean }>;
  synonymMap: Map<string, string>;
  checklistRank: Map<string, number>;
}): string {
  const slugOf = (r: { genus: string; species: string }) =>
    `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`;
  const allSlugs = new Set(opts.species.map(slugOf));
  const scored = new Set(
    opts.keyBinomials.map(b => resolveSlug(b, allSlugs, opts.synonymMap)).filter(s => s !== null)
  );
  const rank = (r: { genus: string; species: string }) =>
    opts.checklistRank.get(normalizeSlug(`${r.genus}-${r.species}`)) ?? Number.POSITIVE_INFINITY;
  const missing = opts.species
    .filter(r => !scored.has(slugOf(r)))
    .map(r => ({ ...r, binomial: normalizeBinomial(`${r.genus} ${r.species}`), rank: rank(r) }))
    .sort(
      (a, b) =>
        Number(a.withheld) - Number(b.withheld) ||
        a.rank - b.rank ||
        a.binomial.localeCompare(b.binomial)
    );
  const blank = opts.labels.map(() => '');
  return stringify(
    [[KEY_SCORES_NAME_COLUMN, ...opts.labels], ...missing.map(r => [r.binomial, ...blank])],
    { record_delimiter: '\n' }
  );
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
 * Query data/images.csv for the navigation image (lowest weight) per species slug.
 * Unlike Browse this does NOT exclude ventral views, and it only reaches species the
 * key matrix carries — see docs/reference/photo-display-rules.md.
 *
 * Returns:
 *   - navImages:  Map<slug, filename> — the lowest-weight image per slug
 *   - imagePairs: Set<`${slug} ${filename}`> — EVERY (slug, filename) pair in
 *                 images.csv. Used by the post-emit guard to assert each emitted
 *                 nav_image is a real catalogued image (so it resolves on the CDN
 *                 at https://moths.pnwinsects.org/<slug>/<filename>) rather than a
 *                 synthesized key filename (ISSUE-43 regression guard).
 *
 * Both are built entirely in TypeScript — no slug interpolation into SQL
 * (T-39-01 mitigation: avoids SQL injection from malformed slug values).
 */
async function queryNavImages(
  db: Awaited<ReturnType<typeof DuckDBInstance.create>>
): Promise<{ navImages: Map<string, string>; imagePairs: Set<string> }> {
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

    // Load ALL images — no slug interpolation into SQL (T-39-01). The ordering is the
    // shared one from src/_lib/photo-display.ts: a constant fragment, not user input.
    // Identify does NOT exclude ventral views; only Browse does.
    const imagesResult = await conn.runAndReadAll(`
      SELECT species_slug, filename, ${WEIGHT_ORDER_SQL} AS weight_int
      FROM images
      ORDER BY species_slug, ${WEIGHT_ORDER_SQL}
    `);

    // Group in TypeScript, then let pickIdentifyPhoto choose — rather than trusting the
    // ORDER BY and taking the first row per slug. The two agree today (the fragment above
    // IS the picker's ordering), and going through the picker is what keeps them agreeing.
    // Collect the full set of valid (slug, filename) pairs for the ISSUE-43 guard as we go.
    const imagePairs = new Set<string>();
    const bySlug = new Map<string, { filename: string; weight: number | null }[]>();
    type ImagesRow = { species_slug: unknown; filename: unknown; weight_int: unknown };
    const rows = imagesResult.getRowObjectsJS() as ImagesRow[];
    for (const row of rows) {
      const slug = String(row.species_slug ?? '');
      const filename = String(row.filename ?? '');
      if (!slug || !filename) continue;
      imagePairs.add(`${slug} ${filename}`);
      const weight = typeof row.weight_int === 'number' ? row.weight_int : null;
      const bucket = bySlug.get(slug);
      if (bucket) bucket.push({ filename, weight });
      else bySlug.set(slug, [{ filename, weight }]);
    }

    const navImages = new Map<string, string>();
    for (const [slug, candidates] of bySlug) {
      const chosen = pickIdentifyPhoto(candidates);
      if (chosen) navImages.set(slug, chosen.filename);
    }
    return { navImages, imagePairs };
  } finally {
    conn.closeSync();
  }
}

export async function main(): Promise<void> {
  // 1. Pre-flight validation (UTF-8 + file-exists check)
  const scoresPath = process.env['KEY_SCORES_CSV'] ?? resolve('data/key-scores.csv');
  let raw: Buffer;
  try {
    raw = readFileSync(scoresPath);
  } catch (e) {
    throw new Error(`Cannot read data/key-scores.csv: ${(e as Error).message}`);
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new Error(
      'data/key-scores.csv contains non-UTF-8 bytes. If edited in Excel, re-save as "CSV UTF-8".'
    );
  }

  // 2. One row per species, one column per character-state (issue #390).
  const { labels, binomials: speciesBinomials, scores } = parseKeyScores(raw);

  // 3. Load slug resolution resources
  const withheld = loadWithheldFamilies();
  const unpublished = loadUnpublishedSpecies();
  const allSpeciesRows = parse(
    readFileSync(resolve('data/species.csv')),
    { columns: true, skip_empty_lines: true }
  ) as Array<{ genus: string; species: string; family: string; epithet_quoted: string }>;
  // Filter withheld families and unpublished provisional species so their binomials
  // resolve to null in resolveSlug and land in unmatchedBinomials → excluded from
  // key-matrix.json (ISSUE-48 / ISSUE-80).
  const speciesRows = allSpeciesRows.filter(
    r => !isWithheldOrUnclassified(r.family, withheld) &&
         !isUnpublished(`${r.genus.toLowerCase()}-${r.species.toLowerCase()}`, unpublished)
  );
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

  // A merged species (#265) can be scored under two key rows — its own binomial
  // and a synonym-resolved retired one. species[] must carry each slug once, so
  // group the matched rows by slug; the matrix ORs a slug's rows together,
  // because a specimen keyed under either historical name is still this species.
  const slugColumns = new Map<string, number[]>();
  for (const i of matchedIndices) {
    const slug = resolvedSlugs[i]!;
    const cols = slugColumns.get(slug);
    if (cols) cols.push(i);
    else slugColumns.set(slug, [i]);
  }

  // 5. DuckDB nav-image join — query ALL images, resolve per slug in TypeScript (no SQL interpolation)
  const db = await DuckDBInstance.create(':memory:');
  const { navImages, imagePairs } = await queryNavImages(db);

  // 6. Build characters[], species[], matrix[]
  // 6a. Load character image map from CSV (CIMG-02, D-08 soft-skip)
  // Allow KEY_CHAR_IMAGES_CSV env var to redirect path for testing.
  const csvPath = process.env['KEY_CHAR_IMAGES_CSV'] ?? resolve('data/key-character-images.csv');
  const imageMap = new Map<number, { image_filename: string; alt_text: string | null }>();
  if (existsSync(csvPath)) {
    const imageRows = parse(
      readFileSync(csvPath),
      // relax_quotes: curator alt_text is free text and may contain an unescaped
      // double-quote.
      // Without it a single stray quote aborts the whole key build (defeats D-08 soft-skip).
      { columns: true, skip_empty_lines: true, bom: true, relax_quotes: true }
    ) as Array<{ char_id: string; image_filename: string; alt_text: string }>;
    for (const r of imageRows) {
      const raw = (r.char_id ?? '').trim();
      const id = Number(raw);
      // Require an explicit non-negative integer. `/^\d+$/` rejects blank/whitespace
      // (Number('') === 0 would otherwise silently attach the image to character 0).
      if (!/^\d+$/.test(raw) || id >= labels.length) {
        console.warn(
          `build-key: key-character-images.csv char_id ${JSON.stringify(r.char_id)} invalid or out of range [0, ${labels.length}) — skipping`
        );
        continue;
      }
      if (r.image_filename) {
        if (imageMap.has(id)) {
          console.warn(
            `build-key: key-character-images.csv duplicate char_id ${id} — overwriting previous row (last-wins)`
          );
        }
        imageMap.set(id, { image_filename: r.image_filename, alt_text: r.alt_text || null });
      }
    }
  } else {
    console.warn('build-key: data/key-character-images.csv absent — no character help images (soft-skip)');
  }

  const characters = labels.map((label, idx) => {
    const m = imageMap.get(idx);
    return {
      id: idx,
      ...parseCharacterLabel(label),
      image_filename: m?.image_filename ?? null,
      alt_text: m?.alt_text ?? null,
    };
  });

  // Build slug → accepted-name lookup so synonym-resolved species display the accepted name.
  // epithet is the display form — quoted for provisional names, e.g. Clostera "apicalis"
  // (issue #85). The slug is derived separately, so quotes never leak into identity.
  const slugToName = new Map(
    speciesRows.map(r => [
      `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`,
      { genus: r.genus, epithet: formatEpithet(r.species, isEpithetQuoted(r.epithet_quoted)) },
    ])
  );

  const matchedSlugs = [...slugColumns.keys()];
  const species = matchedSlugs.map(slug => {
    const origIdx = slugColumns.get(slug)![0]!;
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
  const matrix = labels.map((_, charIdx) => {
    // Build list of matched-species-rank positions that score this character-state.
    // A slug with several source rows matches if ANY of them scores it.
    const matchingRanks: number[] = [];
    for (const [rank, slug] of matchedSlugs.entries()) {
      if (slugColumns.get(slug)!.some(origIdx => scores[origIdx]![charIdx])) {
        matchingRanks.push(rank);
      }
    }
    return buildBitset(nMatchedSpecies, matchingRanks);
  });

  // 7. Zod build-time validation (KEY-03)
  const artifact = KeyMatrixSchema.parse({
    meta: {
      totalKeySpecies:  speciesBinomials.length,    // every key-scores.csv row, incl. unmatched
      matchedSpecies:   matchedSlugs.length,         // 1,189 (resolved to site slugs)
      unmatchedSpecies: unmatchedBinomials.length,   // 39
    },
    characters,
    species,
    matrix,
  });

  // 8. Post-Zod structural invariants (T-39-02 mitigation)
  const nBytes = Math.ceil(artifact.species.length / 8);
  const expectedB64Len = Math.ceil(nBytes / 3) * 4;
  // The column count is pinned because char_id is the column position, and
  // data/key-character-images.csv binds help images by char_id. A character-state
  // column added, removed or moved shifts every image after it onto the wrong
  // question — so changing the columns means re-binding those images, then this number.
  if (artifact.matrix.length !== 237) {
    throw new Error(
      `matrix.length invariant failed: expected 237 character-state columns in data/key-scores.csv, ` +
        `got ${artifact.matrix.length}. If a column was added on purpose, re-check ` +
        `data/key-character-images.csv (it binds images by column position) before updating this.`
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

  // 8b. ISSUE-43 regression guard: every emitted nav_image must be a real
  // catalogued image in data/images.csv for that slug, so it resolves on the CDN
  // (https://moths.pnwinsects.org/<slug>/<nav_image>). The original bug emitted
  // key-derived underscore filenames (e.g. 'Sphinx_luscitiosa-A-D.jpg') that had
  // no images.csv row and 404'd. A null nav_image is allowed (the /identify grid
  // degrades it to the gray placeholder); only non-null values are checked.
  const unbackedNavImages = artifact.species
    .filter(s => s.nav_image !== null && !imagePairs.has(`${s.slug} ${s.nav_image}`))
    .map(s => `${s.slug} → ${s.nav_image}`);
  if (unbackedNavImages.length > 0) {
    throw new Error(
      `build-key: ${unbackedNavImages.length} emitted nav_image(s) are not backed by a ` +
        `data/images.csv row and would 404 on the CDN (ISSUE-43):\n  ` +
        unbackedNavImages.join('\n  ')
    );
  }

  // 9. Write artifacts (D-07: commit all three)
  // KEY_OUT_DIR redirects output for testing, mirroring KEY_CHAR_IMAGES_CSV for input.
  // Tests that override the input MUST also override the output: without this the
  // suite writes fixture-derived data over the committed artifacts, and a later
  // `git commit -a` ships a key matrix with every image_filename nulled (ISSUE-163).
  const outDir = process.env['KEY_OUT_DIR'] ?? resolve('data');
  writeFileSync(join(outDir, 'key-matrix.json'), JSON.stringify(artifact));

  // No timestamp: both artifacts are committed, so they must be byte-reproducible
  // from the same inputs (ADR 0017). `git log` already records when they changed.
  const coverageReport = {
    matched: matchedSlugs.length,
    unmatched: unmatchedBinomials.length,
    unmatched_binomials: unmatchedBinomials.map(b => ({
      binomial: normalizeBinomial(b),
      direct_slug: binomialToSlug(b),
      reason: 'no direct match, no synonym' as const,
    })),
  };
  writeFileSync(join(outDir, 'key-coverage-report.json'), JSON.stringify(coverageReport));

  // 10. The scoring template: every species we hold that the key does not (issue #390).
  const checklistRank = new Map(
    (parse(readFileSync(resolve('data/checklist-order.csv')), {
      columns: true,
      skip_empty_lines: true,
    }) as Array<{ species_slug: string }>).map((r, i) => [r.species_slug, i])
  );
  const template = buildKeyTemplate({
    labels,
    keyBinomials: speciesBinomials,
    species: allSpeciesRows
      .filter(r => !isUnpublished(normalizeSlug(`${r.genus}-${r.species}`), unpublished))
      .map(r => ({ genus: r.genus, species: r.species, withheld: isWithheldOrUnclassified(r.family, withheld) })),
    synonymMap,
    checklistRank,
  });
  writeFileSync(join(outDir, 'key-template.csv'), template);

  console.log(
    `build-key: ${matchedSlugs.length} matched, ${unmatchedBinomials.length} unmatched of ${speciesBinomials.length} total`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
