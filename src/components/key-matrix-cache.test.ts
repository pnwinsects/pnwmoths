// src/components/key-matrix-cache.test.ts
// TDD tests for validateKeyMatrix — load-time structural guard for key-matrix.json.
// Covers the four behaviors specified in Task 3.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateKeyMatrix } from './key-matrix-cache.ts';

// Helper: build a valid KeyMatrix artifact for testing.
// species.length determines bitset encoding length.
function makeValidArtifact(
  numCharacters = 2,
  numSpecies = 8,
  overrides: Partial<Record<string, unknown>> = {}
) {
  // Each bitset must be exactly ceil(ceil(numSpecies/8)/3)*4 base64 chars
  const nBytes = Math.ceil(numSpecies / 8);
  const expectedB64Len = Math.ceil(nBytes / 3) * 4;
  const zeroBitset = Buffer.alloc(nBytes).toString('base64');
  assert.strictEqual(zeroBitset.length, expectedB64Len, 'test helper: bitset length mismatch');

  const character = {
    id: 0,
    category: 'Distribution',
    subcategory: null,
    question: 'In which State/Province?',
    state: 'Washington',
    image_filename: null,
    alt_text: null,
  };

  const speciesEntry = {
    slug: 'test-species',
    genus: 'Test',
    epithet: 'species',
    common_name: null,
    nav_image: null,
  };

  return {
    // meta field required by KeyMatrixMetaSchema (added Phase 40)
    meta: {
      totalKeySpecies: numSpecies,
      matchedSpecies: numSpecies,
      unmatchedSpecies: 0,
    },
    characters: Array.from({ length: numCharacters }, (_, i) => ({ ...character, id: i })),
    species: Array.from({ length: numSpecies }, (_, i) => ({
      ...speciesEntry,
      slug: `test-species-${i}`,
      epithet: `species${i}`,
    })),
    matrix: Array.from({ length: numCharacters }, () => zeroBitset),
    ...overrides,
  };
}

describe('validateKeyMatrix', () => {
  test('returns without throwing for a valid artifact', () => {
    const artifact = makeValidArtifact(2, 8);
    // Should not throw
    validateKeyMatrix(artifact);
  });

  test('returns without throwing for a 237-character artifact matching the real key', () => {
    const artifact = makeValidArtifact(237, 1192);
    validateKeyMatrix(artifact);
  });

  test('throws for null input', () => {
    assert.throws(
      () => validateKeyMatrix(null),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Expected Error instance');
        return true;
      }
    );
  });

  test('throws for {characters:[], species:[], matrix:[1,2]} (non-string matrix elements)', () => {
    assert.throws(
      () => validateKeyMatrix({ characters: [], species: [], matrix: [1, 2] }),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Expected Error instance');
        return true;
      }
    );
  });

  test('throws when matrix.length !== characters.length', () => {
    // 2 characters but only 1 matrix entry
    const nBytes = Math.ceil(8 / 8);
    const bitset = Buffer.alloc(nBytes).toString('base64');
    assert.throws(
      () =>
        validateKeyMatrix({
          meta: { totalKeySpecies: 1, matchedSpecies: 1, unmatchedSpecies: 0 },
          characters: [
            { id: 0, category: 'A', subcategory: null, question: 'Q', state: 'S', image_filename: null, alt_text: null },
            { id: 1, category: 'A', subcategory: null, question: 'Q', state: 'T', image_filename: null, alt_text: null },
          ],
          species: [{ slug: 's', genus: 'G', epithet: 'e', common_name: null, nav_image: null }],
          matrix: [bitset], // only 1 entry for 2 characters
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Expected Error instance');
        assert.match(err.message, /matrix\.length.*characters\.length/i);
        return true;
      }
    );
  });

  test('throws when a matrix bitset has the wrong base64 length', () => {
    // 2 characters, 16 species: nBytes=2, expectedB64Len=ceil(2/3)*4=4
    // Provide a too-long bitset ('AAAA' = 4 chars, but 'AAAAAAAA'=8 is also wrong; use 8 chars for 16 species then provide 4)
    // For 16 species: nBytes=2, expectedB64Len=ceil(ceil(16/8)/3)*4=ceil(2/3)*4=4
    // 'AA==' is 4 chars so it's actually CORRECT for 8 species.
    // Use 24 species: nBytes=3, expectedB64Len=ceil(3/3)*4=4 (still 4!)
    // Use 25 species: nBytes=4, expectedB64Len=ceil(4/3)*4=8
    // Provide 'AAAA' (4 chars) when expected 8 — that's wrong.
    assert.throws(
      () =>
        validateKeyMatrix({
          meta: { totalKeySpecies: 25, matchedSpecies: 25, unmatchedSpecies: 0 },
          characters: [
            { id: 0, category: 'A', subcategory: null, question: 'Q', state: 'S', image_filename: null, alt_text: null },
          ],
          species: Array.from({ length: 25 }, (_, i) => ({
            slug: `s-${i}`,
            genus: 'G',
            epithet: `e${i}`,
            common_name: null,
            nav_image: null,
          })),
          // For 25 species: nBytes=ceil(25/8)=4, expectedB64Len=ceil(4/3)*4=8
          // 'AAAA' is only 4 chars — wrong length
          matrix: ['AAAA'],
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Expected Error instance');
        assert.match(err.message, /schema mismatch/i);
        return true;
      }
    );
  });

  test('narrows type to KeyMatrix after passing validation (compile-time check)', () => {
    const data: unknown = makeValidArtifact(2, 8);
    validateKeyMatrix(data);
    // After the assertion guard, TypeScript narrows data to KeyMatrix.
    // This test verifies the function doesn't throw and that runtime behavior is correct.
    const artifact = data;
    assert.ok(Array.isArray(artifact.characters));
    assert.ok(Array.isArray(artifact.species));
    assert.ok(Array.isArray(artifact.matrix));
  });
});
