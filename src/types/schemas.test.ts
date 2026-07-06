// TDD RED: behavioral tests for schemas.ts zod/mini migration
// These tests verify OccurrenceRecordSchema and SpeciesStateSchema behavior
// is preserved after the zod/mini functional API migration (D-02).
// Phase 39: CharacterSchema, KeySpeciesSchema, KeyMatrixSchema added.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OccurrenceRecordSchema,
  SpeciesStateSchema,
  SpeciesDistrictSchema,
  CharacterSchema,
  KeySpeciesSchema,
  KeyMatrixSchema,
} from './schemas.ts';

describe('OccurrenceRecordSchema', () => {
  const validRecord = {
    species_slug: 'acronicta-americana',
    record_type: 'specimen',
    latitude: 47.6,
    longitude: -122.3,
    state: 'WA',
    county: null,
    locality: null,
    elevation_ft: null,
    year: null,
    month: null,
    day: null,
    collector: null,
    collection: null,
    notes: null,
    district_id: null,
  };

  it('accepts a valid record with all nullable fields null', () => {
    const result = OccurrenceRecordSchema.safeParse(validRecord);
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('accepts a record with non-null nullable fields', () => {
    const record = {
      ...validRecord,
      county: 'King',
      locality: 'Seattle',
      elevation_ft: 100,
      year: 2020,
      month: 6,
      day: 15,
      collector: 'J. Smith',
      collection: 'UWBM',
      notes: 'Some note',
      district_id: 'US:53033',
    };
    const result = OccurrenceRecordSchema.safeParse(record);
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects a record missing species_slug', () => {
    const { species_slug: _, ...withoutSlug } = validRecord;
    const result = OccurrenceRecordSchema.safeParse(withoutSlug);
    assert.ok(!result.success, 'Expected failure for missing species_slug');
  });

  it('safeParse error issues have readable message and path', () => {
    const result = OccurrenceRecordSchema.safeParse({});
    assert.ok(!result.success);
    assert.ok(Array.isArray(result.error.issues), 'Expected issues array');
    assert.ok(result.error.issues.length > 0, 'Expected at least one issue');
    const [firstIssue] = result.error.issues;
    assert.ok(firstIssue !== undefined, 'Expected at least one issue');
    assert.ok(typeof firstIssue.message === 'string', 'Expected string message');
  });
});

describe('SpeciesStateSchema', () => {
  it('accepts { species_slug, state }', () => {
    const result = SpeciesStateSchema.safeParse({ species_slug: 's', state: 'WA' });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects { species_slug } missing state', () => {
    const result = SpeciesStateSchema.safeParse({ species_slug: 's' });
    assert.ok(!result.success, 'Expected failure for missing state');
  });
});

describe('SpeciesDistrictSchema', () => {
  it('accepts { species_slug, state, county }', () => {
    const result = SpeciesDistrictSchema.safeParse({ species_slug: 's', state: 'WA', county: 'Lincoln' });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects { species_slug, state } missing county', () => {
    const result = SpeciesDistrictSchema.safeParse({ species_slug: 's', state: 'WA' });
    assert.ok(!result.success, 'Expected failure for missing county');
  });
});

describe('CharacterSchema', () => {
  const validCharacter = {
    id: 0,
    category: 'Distribution',
    subcategory: null,
    question: 'In which State/Province was the moth found?',
    state: 'Washington',
    image_filename: null,
    alt_text: null,
  };

  it('accepts a valid character with null subcategory and null image_filename', () => {
    const result = CharacterSchema.safeParse(validCharacter);
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('accepts a character with a subcategory string', () => {
    const result = CharacterSchema.safeParse({ ...validCharacter, subcategory: 'Wing pattern' });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('accepts a character with image_filename set', () => {
    const result = CharacterSchema.safeParse({ ...validCharacter, image_filename: 'wing_base.jpg' });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects when category is missing', () => {
    const { category: _, ...withoutCategory } = validCharacter;
    const result = CharacterSchema.safeParse(withoutCategory);
    assert.ok(!result.success, 'Expected failure for missing category');
  });

  it('rejects when question is missing', () => {
    const { question: _, ...withoutQuestion } = validCharacter;
    const result = CharacterSchema.safeParse(withoutQuestion);
    assert.ok(!result.success, 'Expected failure for missing question');
  });

  it('rejects when state is missing', () => {
    const { state: _, ...withoutState } = validCharacter;
    const result = CharacterSchema.safeParse(withoutState);
    assert.ok(!result.success, 'Expected failure for missing state field');
  });

  it('accepts a character with alt_text set to a non-empty string', () => {
    const result = CharacterSchema.safeParse({ ...validCharacter, alt_text: 'A black forewing' });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('accepts a character with alt_text: null', () => {
    const result = CharacterSchema.safeParse({ ...validCharacter, alt_text: null });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects a character missing alt_text', () => {
    const { alt_text: _, ...withoutAltText } = { ...validCharacter, alt_text: null };
    const result = CharacterSchema.safeParse(withoutAltText);
    assert.ok(!result.success, 'Expected failure for missing alt_text');
  });
});

describe('KeySpeciesSchema', () => {
  const validSpecies = {
    slug: 'tolype-laricis',
    genus: 'Tolype',
    epithet: 'laricis',
    common_name: null,
    nav_image: null,
  };

  it('accepts a valid species with null common_name and nav_image', () => {
    const result = KeySpeciesSchema.safeParse(validSpecies);
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('accepts species with common_name and nav_image set', () => {
    const result = KeySpeciesSchema.safeParse({
      ...validSpecies,
      common_name: 'Larch Tolype',
      nav_image: 'tolype-laricis-1.jpg',
    });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects when slug is missing', () => {
    const { slug: _, ...withoutSlug } = validSpecies;
    const result = KeySpeciesSchema.safeParse(withoutSlug);
    assert.ok(!result.success, 'Expected failure for missing slug');
  });

  it('rejects when genus is missing', () => {
    const { genus: _, ...withoutGenus } = validSpecies;
    const result = KeySpeciesSchema.safeParse(withoutGenus);
    assert.ok(!result.success, 'Expected failure for missing genus');
  });
});

describe('KeyMatrixSchema', () => {
  // meta field required since Phase 40 (KeyMatrixMetaSchema added in 40-01)
  const validMeta = {
    totalKeySpecies: 0,
    matchedSpecies: 0,
    unmatchedSpecies: 0,
    generatedAt: '2026-01-01T00:00:00.000Z',
  };
  const validArtifact = {
    meta: validMeta,
    characters: [],
    species: [],
    matrix: [],
  };

  it('accepts an empty artifact {characters:[], species:[], matrix:[]}', () => {
    const result = KeyMatrixSchema.safeParse(validArtifact);
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('accepts artifact with base64 strings in matrix', () => {
    const result = KeyMatrixSchema.safeParse({ ...validArtifact, matrix: ['AAAA', 'Ag=='] });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects when matrix is not an array', () => {
    const result = KeyMatrixSchema.safeParse({ ...validArtifact, matrix: 'notanarray' });
    assert.ok(!result.success, 'Expected failure for non-array matrix');
  });

  it('rejects when matrix contains non-string elements', () => {
    const result = KeyMatrixSchema.safeParse({ ...validArtifact, matrix: [1, 2] });
    assert.ok(!result.success, 'Expected failure for numeric matrix elements');
  });

  it('rejects when characters is missing', () => {
    const { characters: _, ...withoutChars } = validArtifact;
    const result = KeyMatrixSchema.safeParse(withoutChars);
    assert.ok(!result.success, 'Expected failure for missing characters');
  });
});
