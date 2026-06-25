import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { norm, matchRows } from './match-character-images.ts';

// ---------------------------------------------------------------------------
// Suite 1: norm()
// ---------------------------------------------------------------------------

describe('norm', () => {
  it('strips ecoprovince_ prefix', () => {
    assert.equal(norm('Ecoprovince_Coast_and_Mts.jpg'), 'coast and mts');
  });

  it('strips us_ prefix', () => {
    assert.equal(norm('US_Washington.jpg'), 'washington');
  });

  it('drops the copy token', () => {
    assert.equal(norm('Black copy.jpg'), 'black');
  });

  it('lowercases', () => {
    assert.equal(norm('Black Forewing.jpg'), 'black forewing');
  });

  it('collapses underscores to spaces', () => {
    assert.equal(norm('some_file_name.jpg'), 'some file name');
  });

  it('replaces non-alphanumeric non-space chars with spaces and collapses', () => {
    // Comma becomes a space, then whitespace is collapsed — result has single spaces
    assert.equal(norm('forewing basal dash, no.jpg'), 'forewing basal dash no');
  });

  it('trims leading/trailing whitespace', () => {
    assert.equal(norm('  spaces  .jpg'), 'spaces');
  });

  it('strips .jpeg extension', () => {
    assert.equal(norm('photo.jpeg'), 'photo');
  });

  it('strips .webp extension', () => {
    assert.equal(norm('photo.webp'), 'photo');
  });

  it('strips .png extension', () => {
    assert.equal(norm('photo.png'), 'photo');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: matchRows()
// ---------------------------------------------------------------------------

describe('matchRows', () => {
  it('emits one row per exact normalized match with .webp image_filename', () => {
    const characters = [
      { id: 0, state: 'Black Forewing' },
      { id: 1, state: 'White Hindwing' },
    ];
    const filenames = [
      'Black Forewing.jpg',
      'White Hindwing.jpg',
    ];
    const rows = matchRows(characters, filenames);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { char_id: 0, image_filename: 'Black Forewing.webp', alt_text: '' });
    assert.deepEqual(rows[1], { char_id: 1, image_filename: 'White Hindwing.webp', alt_text: '' });
  });

  it('omits rows for characters with no matching filename (sparse CSV is fine)', () => {
    const characters = [
      { id: 0, state: 'Black Forewing' },
      { id: 1, state: 'No Match State' },
    ];
    const filenames = ['Black Forewing.jpg'];
    const rows = matchRows(characters, filenames);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.char_id, 0);
  });

  it('image_filename ends in .webp (toWebpName applied)', () => {
    const characters = [{ id: 0, state: 'Black Forewing' }];
    const filenames = ['Black Forewing.jpg'];
    const rows = matchRows(characters, filenames);
    assert.ok(rows[0]!.image_filename.endsWith('.webp'));
  });

  it('blank alt_text in emitted rows', () => {
    const characters = [{ id: 0, state: 'Black Forewing' }];
    const filenames = ['Black Forewing.jpg'];
    const rows = matchRows(characters, filenames);
    assert.equal(rows[0]!.alt_text, '');
  });

  it('returns empty array when no filenames provided', () => {
    const characters = [{ id: 0, state: 'Black Forewing' }];
    const rows = matchRows(characters, []);
    assert.equal(rows.length, 0);
  });

  it('char_id matches the character id field', () => {
    const characters = [
      { id: 42, state: 'forewing basal dash, no' },
    ];
    const filenames = ['forewing basal dash, no.jpg'];
    const rows = matchRows(characters, filenames);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.char_id, 42);
  });
});
