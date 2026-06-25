// TDD RED: behavioral tests for scripts/build-key.ts pure functions + integration
// These tests will FAIL until Task 2 implements the exported functions.
// Phase 39, Task 1: scaffold RED tests.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  test('strips leading double-quote from stray-quote label (csv-parse relax_quotes artifact)', () => {
    // The raw label csv-parse returns for the "dipped" embedded-quote field:
    // '"Abdomen and thorax:Abdomen:Does it appear as if the tip of the abdomen was '
    // (leading " is the relax_quotes artifact; trailing " on the state is stripped too)
    const raw = '"Abdomen and thorax:Abdomen:Does it appear as if the tip of the abdomen was dipped in a different color?:Yes"';
    const result = parseCharacterLabel(raw);
    assert.strictEqual(result.category, 'Abdomen and thorax');
    assert.strictEqual(result.state, 'Yes');
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

describe('main (integration)', () => {
  test('emits data/key-matrix.json and data/key-coverage-report.json', () => {
    execSync('node scripts/build-key.ts', { cwd: ROOT, stdio: 'pipe' });
    assert.ok(existsSync(resolve(ROOT, 'data/key-matrix.json')), 'key-matrix.json must exist');
    assert.ok(
      existsSync(resolve(ROOT, 'data/key-coverage-report.json')),
      'key-coverage-report.json must exist'
    );
  });

  test('emits exactly 8 distinct categories with no stray-quote artifact', () => {
    execSync('node scripts/build-key.ts', { cwd: ROOT, stdio: 'pipe' });
    const matrix = JSON.parse(readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')) as {
      characters: Array<{ category: string }>;
    };
    const cats = new Set(matrix.characters.map(c => c.category));
    assert.strictEqual(cats.size, 8, `expected 8 distinct categories, got ${cats.size}: ${[...cats].join(', ')}`);
    assert.ok(
      [...cats].every(c => !c.startsWith('"')),
      `some category strings begin with a stray double-quote: ${[...cats].filter(c => c.startsWith('"')).join(', ')}`
    );
  });
});
