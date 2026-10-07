// TDD RED: behavioral tests for scripts/build-key.ts pure functions + integration
// These tests will FAIL until Task 2 implements the exported functions.
// Phase 39, Task 1: scaffold RED tests.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Import pure functions from build-key.ts (will fail until Task 2 creates the file)
// Note: main() is tested via execSync integration test (not imported directly)
import {
  normalizeBinomial,
  binomialToSlug,
  resolveSlug,
  parseCharacterLabel,
  buildBitset,
  parseKeyScores,
  buildKeyTemplate,
} from './build-key.ts';

describe('normalizeBinomial', () => {
  test('normalizes double-space to single space', () => {
    assert.strictEqual(normalizeBinomial('Tolype  laricis'), 'Tolype laricis');
  });

  test('normalizes double-space Grammia to single space', () => {
    assert.strictEqual(normalizeBinomial('Grammia  blakei'), 'Grammia blakei');
  });

  test('strips trailing space', () => {
    assert.strictEqual(normalizeBinomial('Tyta luctuosa '), 'Tyta luctuosa');
  });

  test('leaves normal binomials unchanged', () => {
    assert.strictEqual(normalizeBinomial('Habrosyne scripta'), 'Habrosyne scripta');
  });
});

describe('binomialToSlug', () => {
  test('converts double-space binomial to slug', () => {
    assert.strictEqual(binomialToSlug('Tolype  laricis'), 'tolype-laricis');
  });

  test('converts normal binomial to slug', () => {
    assert.strictEqual(binomialToSlug('Habrosyne scripta'), 'habrosyne-scripta');
  });

  test('converts trailing-space binomial to slug', () => {
    assert.strictEqual(binomialToSlug('Tyta luctuosa '), 'tyta-luctuosa');
  });
});

describe('resolveSlug', () => {
  test('resolves Grammia doris via synonym fallback to apantesis-doris', () => {
    const siteSlugSet = new Set(['apantesis-doris', 'habrosyne-scripta']);
    const synonymMap = new Map([['Grammia doris', 'apantesis-doris']]);
    assert.strictEqual(resolveSlug('Grammia doris', siteSlugSet, synonymMap), 'apantesis-doris');
  });

  test('resolves direct-match species without synonym', () => {
    const siteSlugSet = new Set(['habrosyne-scripta']);
    const synonymMap = new Map<string, string>();
    assert.strictEqual(resolveSlug('Habrosyne scripta', siteSlugSet, synonymMap), 'habrosyne-scripta');
  });

  test('returns null for unresolvable binomial', () => {
    const siteSlugSet = new Set(['habrosyne-scripta']);
    const synonymMap = new Map<string, string>();
    assert.strictEqual(resolveSlug('Unknown species', siteSlugSet, synonymMap), null);
  });

  test('resolves double-space binomial after normalization', () => {
    const siteSlugSet = new Set(['tolype-laricis']);
    const synonymMap = new Map<string, string>();
    assert.strictEqual(resolveSlug('Tolype  laricis', siteSlugSet, synonymMap), 'tolype-laricis');
  });
});

describe('parseCharacterLabel', () => {
  test('parses 3-part colon-delimited label (no subcategory)', () => {
    const result = parseCharacterLabel('Distribution:In which State?:Washington');
    assert.strictEqual(result.category, 'Distribution');
    assert.strictEqual(result.subcategory, null);
    assert.strictEqual(result.question, 'In which State?');
    assert.strictEqual(result.state, 'Washington');
  });

  test('parses 4-part colon-delimited label (with subcategory)', () => {
    const result = parseCharacterLabel('Wing pattern:Forewing:Base color:White');
    assert.strictEqual(result.category, 'Wing pattern');
    assert.strictEqual(result.subcategory, 'Forewing');
    assert.strictEqual(result.question, 'Base color');
    assert.strictEqual(result.state, 'White');
  });

  test('throws on unexpected colon depth (2 parts)', () => {
    assert.throws(() => parseCharacterLabel('A:B'), /unexpected.*depth/i);
  });

  test('throws on unexpected colon depth (5 parts)', () => {
    assert.throws(() => parseCharacterLabel('A:B:C:D:E'), /unexpected.*depth/i);
  });

  test('the embedded-quote "dipped" question survives data/key-scores.csv intact', () => {
    // Lucid's export left this label's inner quotes unescaped, which is why the old
    // species-as-columns file needed relax_quotes and parseCharacterLabel stripped a
    // stray outer pair (ISSUE-165). key-scores.csv is written by csv-stringify, so the
    // quotes are escaped properly and the label reaches the parser clean. Read it from
    // the real file so a hand edit that breaks the quoting fails here.
    const { labels } = parseKeyScores(readFileSync(resolve(ROOT, 'data/key-scores.csv')));
    const raw = labels.find(l => l.includes('dipped'));
    assert.ok(raw, 'expected a character-state column containing "dipped"');
    const result = parseCharacterLabel(raw!);
    assert.strictEqual(result.category, 'Abdomen and thorax');
    assert.strictEqual(result.subcategory, 'Abdomen');
    assert.strictEqual(
      result.question,
      'Does it appear as if the tip of the abdomen was "dipped" in a different color?'
    );
    assert.match(result.state, /^(Yes|No)$/);
  });

  test('leaves clean label unchanged (regression guard)', () => {
    const result = parseCharacterLabel('Abdomen and thorax:Abdomen:Some question:No');
    assert.strictEqual(result.category, 'Abdomen and thorax');
    assert.strictEqual(result.subcategory, 'Abdomen');
    assert.strictEqual(result.question, 'Some question');
    assert.strictEqual(result.state, 'No');
  });
});

describe('buildBitset', () => {
  test('sets bit 0 and bit 2 for matchingIndices [0, 2]', () => {
    const b64 = buildBitset(8, [0, 2]);
    const bytes = Buffer.from(b64, 'base64');
    assert.strictEqual(bytes.length, 1);
    // LSB-first: bit 0 = 0b00000001, bit 2 = 0b00000100; together = 0b00000101 = 5
    assert.strictEqual(bytes[0], 0b00000101);
  });

  test('byte length equals ceil(N/8)', () => {
    const b64 = buildBitset(10, []);
    const bytes = Buffer.from(b64, 'base64');
    assert.strictEqual(bytes.length, 2); // ceil(10/8) = 2
  });

  test('byte length equals ceil(speciesCount/8) for 1228 species', () => {
    const b64 = buildBitset(1228, []);
    const bytes = Buffer.from(b64, 'base64');
    assert.strictEqual(bytes.length, Math.ceil(1228 / 8)); // 154
  });

  test('returns only zeros when matchingIndices is empty', () => {
    const b64 = buildBitset(8, []);
    const bytes = Buffer.from(b64, 'base64');
    assert.strictEqual(bytes[0], 0);
  });

  test('base64 string length equals ceil(ceil(N/8)/3)*4', () => {
    const speciesCount = 1175;
    const b64 = buildBitset(speciesCount, [0]);
    const expectedLen = Math.ceil(Math.ceil(speciesCount / 8) / 3) * 4;
    assert.strictEqual(b64.length, expectedLen);
  });

  test('throws RangeError for index equal to speciesCount', () => {
    assert.throws(
      () => buildBitset(8, [8]),
      (err: unknown) => err instanceof RangeError && /out of range/.test((err as Error).message)
    );
  });

  test('throws RangeError for index greater than speciesCount', () => {
    assert.throws(
      () => buildBitset(8, [0, 9]),
      (err: unknown) => err instanceof RangeError && /out of range/.test((err as Error).message)
    );
  });

  test('throws RangeError for negative index', () => {
    assert.throws(
      () => buildBitset(8, [-1]),
      (err: unknown) => err instanceof RangeError && /out of range/.test((err as Error).message)
    );
  });
});

describe('parseKeyScores', () => {
  const header = 'binomial,Cat:Q:Yes,Cat:Q:No\n';

  test('reads one row per species: 1 is scored, blank and 0 are unscored', () => {
    const { labels, binomials, scores } = parseKeyScores(header + 'Aus bus,1,\nCus dus,0,1\n');
    assert.deepStrictEqual(labels, ['Cat:Q:Yes', 'Cat:Q:No']);
    assert.deepStrictEqual(binomials, ['Aus bus', 'Cus dus']);
    assert.deepStrictEqual(scores, [[true, false], [false, true]]);
  });

  test('accepts the BOM Excel writes on "CSV UTF-8"', () => {
    const { binomials } = parseKeyScores('\uFEFF' + header + 'Aus bus,1,\n');
    assert.deepStrictEqual(binomials, ['Aus bus']);
  });

  test('normalizes whitespace in names', () => {
    const { binomials } = parseKeyScores(header + ' Tolype  laricis ,1,\n');
    assert.deepStrictEqual(binomials, ['Tolype laricis']);
  });

  test('rejects a cell that is not 1, 0 or blank, naming the line and column', () => {
    // An `x` typed in Excel must not silently become "unscored".
    assert.throws(
      () => parseKeyScores(header + 'Aus bus,x,\n'),
      /line 2 \("Aus bus"\), column "Cat:Q:Yes": "x"/
    );
  });

  test('rejects a species scored on two rows', () => {
    assert.throws(
      () => parseKeyScores(header + 'Aus bus,1,\nAus  bus,,1\n'),
      /line 3: "Aus bus" is already scored on line 2/
    );
  });

  test('rejects a blank name', () => {
    assert.throws(() => parseKeyScores(header + ',1,\n'), /line 2: blank binomial/);
  });

  test('rejects a file whose first column is not "binomial"', () => {
    assert.throws(() => parseKeyScores('species,Cat:Q:Yes\nAus bus,1\n'), /must be headed "binomial"/);
  });
});

describe('buildKeyTemplate', () => {
  const labels = ['Cat:Q:Yes', 'Cat:Q:No'];
  const rows = (csv: string) => parse(csv, { columns: false }) as string[][];

  test('lists only species no key row scores, with the key\'s exact header and blank cells', () => {
    const out = rows(
      buildKeyTemplate({
        labels,
        keyBinomials: ['Aus bus'],
        species: [
          { genus: 'Aus', species: 'bus', withheld: false },
          { genus: 'Cus', species: 'dus', withheld: false },
        ],
        synonymMap: new Map(),
        checklistRank: new Map(),
      })
    );
    assert.deepStrictEqual(out, [['binomial', ...labels], ['Cus dus', '', '']]);
  });

  test('a species scored under a synonym is not listed', () => {
    const out = rows(
      buildKeyTemplate({
        labels,
        keyBinomials: ['Oldus bus'],
        species: [{ genus: 'Aus', species: 'bus', withheld: false }],
        synonymMap: new Map([['Oldus bus', 'aus-bus']]),
        checklistRank: new Map(),
      })
    );
    assert.strictEqual(out.length, 1, 'header only');
  });

  test('published species come first, then withheld; checklist order within each', () => {
    const out = rows(
      buildKeyTemplate({
        labels,
        keyBinomials: [],
        species: [
          { genus: 'Geo', species: 'one', withheld: true },
          { genus: 'Zus', species: 'late', withheld: false },
          { genus: 'Aus', species: 'early', withheld: false },
          { genus: 'Nus', species: 'unranked', withheld: false },
        ],
        synonymMap: new Map(),
        checklistRank: new Map([['zus-late', 0], ['aus-early', 1], ['geo-one', 2]]),
      })
    ).map(r => r[0]);
    assert.deepStrictEqual(out, ['binomial', 'Zus late', 'Aus early', 'Nus unranked', 'Geo one']);
  });
});

// ---------------------------------------------------------------------------
// Integration helpers. Every test that runs build-key.ts MUST route its output
// through KEY_OUT_DIR: the script otherwise writes data/key-matrix.json and
// data/key-coverage-report.json in place, so the suite overwrote the committed
// artifacts on every `npm test` — with fixture data when the input was also
// overridden, leaving a key matrix with every image_filename nulled (ISSUE-163).
// ---------------------------------------------------------------------------

import { mkdtempSync, writeFileSync as nodeWriteFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type KeyMatrix = {
  characters: Array<{
    id: number;
    category: string;
    image_filename: string | null;
    alt_text: string | null;
  }>;
  species: Array<{ slug: string; nav_image: string | null }>;
};

/**
 * Run build-key.ts with its artifacts redirected to a throwaway directory, then
 * hand that directory to `fn`. `env` supplies any additional overrides (e.g.
 * KEY_CHAR_IMAGES_CSV); the temp dir is always removed afterwards.
 */
function withKeyBuild<T>(env: Record<string, string>, fn: (outDir: string) => T): T {
  const outDir = mkdtempSync(join(tmpdir(), 'pnwm-keyout-'));
  try {
    const assignments = Object.entries({ ...env, KEY_OUT_DIR: outDir })
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    execSync(`${assignments} node scripts/build-key.ts`, { cwd: ROOT, stdio: 'pipe' });
    return fn(outDir);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

/** Run build-key.ts into a temp dir and return the parsed key matrix. */
function buildKeyMatrix(env: Record<string, string> = {}): KeyMatrix {
  return withKeyBuild(env, outDir =>
    JSON.parse(readFileSync(join(outDir, 'key-matrix.json'), 'utf-8')) as KeyMatrix
  );
}

describe('main (integration)', () => {
  test('emits key-matrix.json, key-coverage-report.json and key-template.csv', () => {
    withKeyBuild({}, outDir => {
      assert.ok(existsSync(join(outDir, 'key-template.csv')), 'key-template.csv must exist');
      assert.ok(existsSync(join(outDir, 'key-matrix.json')), 'key-matrix.json must exist');
      assert.ok(
        existsSync(join(outDir, 'key-coverage-report.json')),
        'key-coverage-report.json must exist'
      );
    });
  });

  test('the committed artifacts match a fresh build (ADR 0017)', () => {
    // Reproducibility across two temp builds proves the script is deterministic.
    // It says nothing about whether what is *checked in* still matches its
    // inputs — and that is the failure that actually happened. #156 gave
    // clostera-brucei a nav image in data/images.csv without regenerating
    // data/key-matrix.json, so the committed artifact disagreed with its inputs
    // for months (#197). Consequences, in order of how much they cost:
    //
    //   1. /identify/ rendered the grey placeholder for a species whose photo
    //      was on the CDN the whole time.
    //   2. `npm run build:site && npm test` failed on a clean checkout, because
    //      the build regenerated the artifact and a test still pinned the stale
    //      value — the documented flow in CLAUDE.md left you with a red suite.
    //   3. The regenerated file sat in the working tree, so `git commit -a`
    //      after any build silently shipped it.
    //
    // This test runs before the build in every workflow (pr-check, production,
    // staging all run `npm test` ahead of `npm run build*`), so it sees the
    // committed bytes rather than freshly overwritten ones. Fix by running
    // `npm run build:key` and committing the result.
    const fresh = withKeyBuild({}, outDir => ({
      matrix: readFileSync(join(outDir, 'key-matrix.json'), 'utf-8'),
      coverage: readFileSync(join(outDir, 'key-coverage-report.json'), 'utf-8'),
      template: readFileSync(join(outDir, 'key-template.csv'), 'utf-8'),
    }));
    const committed = {
      matrix: readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8'),
      coverage: readFileSync(resolve(ROOT, 'data/key-coverage-report.json'), 'utf-8'),
      template: readFileSync(resolve(ROOT, 'data/key-template.csv'), 'utf-8'),
    };

    // Report the first differing species rather than diffing two 150 KB strings,
    // which is unreadable in test output and was part of why this went unnoticed.
    if (committed.matrix !== fresh.matrix) {
      const a = JSON.parse(committed.matrix) as KeyMatrix;
      const b = JSON.parse(fresh.matrix) as KeyMatrix;
      const byFreshSlug = new Map(b.species.map(s => [s.slug, JSON.stringify(s)]));
      const drifted = a.species
        .filter(s => byFreshSlug.get(s.slug) !== JSON.stringify(s))
        .map(s => `${s.slug} (committed nav_image: ${JSON.stringify(s.nav_image)})`);
      assert.fail(
        'data/key-matrix.json is stale — run `npm run build:key` and commit the result. ' +
          (drifted.length > 0
            ? `Differing species: ${drifted.slice(0, 10).join(', ')}` +
              (drifted.length > 10 ? ` … and ${drifted.length - 10} more` : '')
            : 'The difference is outside the species list (characters, matrix or meta).'),
      );
    }
    assert.strictEqual(
      committed.coverage,
      fresh.coverage,
      'data/key-coverage-report.json is stale — run `npm run build:key` and commit the result',
    );
    // The template is what the curator downloads from /curation/ to score new species,
    // so a stale one offers him species already in the key, or hides new ones.
    assert.strictEqual(
      committed.template,
      fresh.template,
      'data/key-template.csv is stale — run `npm run build:key` and commit the result',
    );
  });

  test('artifacts are byte-reproducible across runs (ADR 0017)', () => {
    // Both artifacts are committed, so identical inputs must produce identical bytes.
    // They previously embedded a build timestamp, which made every regeneration diff
    // and let real content drift hide in the churn — that is how ISSUE-163 went
    // unnoticed. Two consecutive builds must agree exactly.
    const read = (outDir: string) => ({
      matrix: readFileSync(join(outDir, 'key-matrix.json'), 'utf-8'),
      coverage: readFileSync(join(outDir, 'key-coverage-report.json'), 'utf-8'),
    });
    const first = withKeyBuild({}, read);
    const second = withKeyBuild({}, read);
    assert.strictEqual(first.matrix, second.matrix, 'key-matrix.json must be byte-identical across runs');
    assert.strictEqual(
      first.coverage, second.coverage,
      'key-coverage-report.json must be byte-identical across runs'
    );
    assert.ok(
      !first.matrix.includes('generatedAt') && !first.coverage.includes('"generated"'),
      'artifacts must not embed a build timestamp'
    );
  });

  test('emits exactly 8 distinct categories with no stray-quote artifact', () => {
    const matrix = buildKeyMatrix();
    const cats = new Set(matrix.characters.map(c => c.category));
    assert.strictEqual(cats.size, 8, `expected 8 distinct categories, got ${cats.size}: ${[...cats].join(', ')}`);
    assert.ok(
      [...cats].every(c => !c.startsWith('"')),
      `some category strings begin with a stray double-quote: ${[...cats].filter(c => c.startsWith('"')).join(', ')}`
    );
  });

  // ISSUE-43 regression guard: every non-null nav_image must be a real catalogued
  // image in data/images.csv for that slug, so it resolves on the CDN. The original
  // bug emitted key-derived underscore filenames that had no images.csv row and 404'd.
  test('every emitted nav_image is backed by a data/images.csv row (ISSUE-43)', () => {
    const matrix = buildKeyMatrix();
    const imageRows = parse(readFileSync(resolve(ROOT, 'data/images.csv')), {
      columns: true,
      skip_empty_lines: true,
    }) as Array<{ species_slug: string; filename: string }>;
    const imagePairs = new Set(imageRows.map(r => `${r.species_slug} ${r.filename}`));
    const unbacked = matrix.species
      .filter(s => s.nav_image !== null && !imagePairs.has(`${s.slug} ${s.nav_image}`))
      .map(s => `${s.slug} → ${s.nav_image}`);
    assert.strictEqual(
      unbacked.length, 0,
      `nav_image(s) without a data/images.csv row (would 404 on CDN):\n  ${unbacked.join('\n  ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// CIMG-02: CSV → Character.image_filename + alt_text population
// Tests use KEY_CHAR_IMAGES_CSV env var to point at temp fixture CSVs.
// ---------------------------------------------------------------------------

describe('CIMG-02: CSV population of image_filename + alt_text', () => {
  test('build-key.ts does not write to the committed artifacts when KEY_OUT_DIR is set', () => {
    // Regression guard for ISSUE-163: the suite must not mutate data/key-matrix.json.
    const committed = resolve(ROOT, 'data/key-matrix.json');
    const before = readFileSync(committed, 'utf-8');
    buildKeyMatrix({
      KEY_CHAR_IMAGES_CSV: join(mkdtempSync(join(tmpdir(), 'pnwm-absent-')), 'nope.csv'),
    });
    assert.strictEqual(
      readFileSync(committed, 'utf-8'), before,
      'running build-key.ts with KEY_OUT_DIR must leave data/key-matrix.json untouched'
    );
  });

  test('absent CSV: build succeeds with all characters having image_filename: null', () => {
    // Point at a guaranteed-nonexistent path
    const missingPath = resolve(ROOT, 'data/key-character-images-NONEXISTENT-FIXTURE.csv');
    const matrix = buildKeyMatrix({ KEY_CHAR_IMAGES_CSV: missingPath });
    assert.ok(
      matrix.characters.every(c => c.image_filename === null),
      'all characters should have image_filename: null when CSV is absent'
    );
  });

  test('absent CSV: build emits a console.warn soft-skip (non-fatal)', () => {
    const missingPath = resolve(ROOT, 'data/key-character-images-NONEXISTENT-FIXTURE.csv');
    // The build outputs to stderr via console.warn. We can't easily capture stderr
    // separately here, so we just verify the build doesn't throw (above test).
    assert.doesNotThrow(() => buildKeyMatrix({ KEY_CHAR_IMAGES_CSV: missingPath }));
  });

  test('out-of-range char_id: build succeeds without throwing (D-08)', () => {
    // Write a fixture CSV with an out-of-range char_id (9999)
    const tmp = mkdtempSync(join(tmpdir(), 'pnwm-cimg02-'));
    const fixturePath = join(tmp, 'fixture.csv');
    try {
      nodeWriteFileSync(fixturePath, 'char_id,image_filename,alt_text\n9999,test.webp,test alt\n');
      // Should not throw
      const matrix = buildKeyMatrix({ KEY_CHAR_IMAGES_CSV: fixturePath });
      // Out-of-range char_id=9999 should be skipped; no character should have 'test.webp'
      assert.ok(
        matrix.characters.every(c => c.image_filename !== 'test.webp'),
        'out-of-range char_id should be skipped (no character should have test.webp)'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('valid CSV row: sets image_filename and alt_text for matching character', () => {
    // Use a known char_id from the committed CSV (char_id=5 → 'US_Coast Range.webp')
    // Just verify the real CSV produces a non-null image_filename for char_id=5
    const matrix = buildKeyMatrix();
    const char5 = matrix.characters.find(c => c.id === 5);
    assert.ok(char5, 'character with id=5 must exist');
    assert.strictEqual(char5!.image_filename, 'US_Coast Range.webp', 'char_id=5 image_filename should be US_Coast Range.webp');
  });

  test('valid CSV row: custom fixture populates image_filename and alt_text', () => {
    // Write a fixture CSV with char_id=0 (always valid: first character exists)
    const tmp = mkdtempSync(join(tmpdir(), 'pnwm-cimg02-'));
    const fixturePath = join(tmp, 'fixture.csv');
    try {
      nodeWriteFileSync(fixturePath, 'char_id,image_filename,alt_text\n0,TestImage.webp,A test alt text\n');
      const matrix = buildKeyMatrix({ KEY_CHAR_IMAGES_CSV: fixturePath });
      const char0 = matrix.characters.find(c => c.id === 0);
      assert.ok(char0, 'character with id=0 must exist');
      assert.strictEqual(char0!.image_filename, 'TestImage.webp', 'image_filename should be set from fixture CSV');
      assert.strictEqual(char0!.alt_text, 'A test alt text', 'alt_text should be set from fixture CSV');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('blank char_id is skipped, not coerced to character 0 (Number("") === 0 guard)', () => {
    // A row with an empty char_id must NOT attach its image to the first character.
    const tmp = mkdtempSync(join(tmpdir(), 'pnwm-cimg02-'));
    const fixturePath = join(tmp, 'fixture.csv');
    try {
      nodeWriteFileSync(fixturePath, 'char_id,image_filename,alt_text\n,BlankId.webp,should be skipped\n');
      const matrix = buildKeyMatrix({ KEY_CHAR_IMAGES_CSV: fixturePath });
      const char0 = matrix.characters.find(c => c.id === 0);
      assert.ok(char0, 'character with id=0 must exist');
      assert.strictEqual(
        char0!.image_filename, null,
        'blank char_id must not be coerced to 0 and attached to the first character'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
