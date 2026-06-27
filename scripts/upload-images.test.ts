import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCharacterIllustration, toWebpName, keyImageStorageUrl } from './upload-images.ts';

// ---------------------------------------------------------------------------
// Suite 1: isCharacterIllustration
// ---------------------------------------------------------------------------

describe('isCharacterIllustration', () => {
  it('returns true for a genuine character illustration', () => {
    assert.equal(isCharacterIllustration('Black Forewing.jpg'), true);
  });

  it('returns true for a lowercase-extension illustration', () => {
    assert.equal(isCharacterIllustration('forewing basal dash, yes.jpg'), true);
  });

  it('returns false for a specimen photo matching SPECIMEN_RE (binomial -A-D pattern)', () => {
    assert.equal(isCharacterIllustration('Habrosyne scripta-A-D.jpg'), false);
  });

  it('returns false for Annaphila miona-A D.jpg (space before D, EXTRA_EXCLUDES)', () => {
    assert.equal(isCharacterIllustration('Annaphila miona-A D.jpg'), false);
  });

  it('returns false for Drasteria parallela-D.jpg (single view code, EXTRA_EXCLUDES)', () => {
    assert.equal(isCharacterIllustration('Drasteria parallela-D.jpg'), false);
  });

  it('returns false for Euxoa absona A-D.jpg (space before A-D, EXTRA_EXCLUDES)', () => {
    assert.equal(isCharacterIllustration('Euxoa absona A-D.jpg'), false);
  });

  it('returns false for Euxoa lucida A-D.jpg (EXTRA_EXCLUDES)', () => {
    assert.equal(isCharacterIllustration('Euxoa lucida A-D.jpg'), false);
  });

  it('returns false for Euxoa lucida B-D.jpg (EXTRA_EXCLUDES)', () => {
    assert.equal(isCharacterIllustration('Euxoa lucida B-D.jpg'), false);
  });

  it('returns false for Grammia yukona-A-D.JPG (uppercase .JPG, EXTRA_EXCLUDES)', () => {
    assert.equal(isCharacterIllustration('Grammia yukona-A-D.JPG'), false);
  });

  it('returns false for non-image extension', () => {
    assert.equal(isCharacterIllustration('readme.txt'), false);
  });

  it('returns false for .png extension', () => {
    assert.equal(isCharacterIllustration('forewing.png'), false);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: toWebpName
// ---------------------------------------------------------------------------

describe('toWebpName', () => {
  it('converts .jpg to .webp', () => {
    assert.equal(toWebpName('Black Forewing.jpg'), 'Black Forewing.webp');
  });

  it('converts .JPG (uppercase) to .webp case-insensitively', () => {
    assert.equal(toWebpName('Grammia yukona-A-D.JPG'), 'Grammia yukona-A-D.webp');
  });

  it('converts .jpeg to .webp', () => {
    assert.equal(toWebpName('x.jpeg'), 'x.webp');
  });

  it('converts mixed-case .Jpg to .webp', () => {
    assert.equal(toWebpName('photo.Jpg'), 'photo.webp');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: keyImageStorageUrl
// ---------------------------------------------------------------------------

describe('keyImageStorageUrl', () => {
  it('returns the correct storage URL for a simple webp name', () => {
    const url = keyImageStorageUrl('Black Forewing.webp');
    assert.equal(url, 'https://la.storage.bunnycdn.com/pnwmoths/key-images/Black%20Forewing.webp');
  });

  it('URL-encodes special characters in the filename', () => {
    const url = keyImageStorageUrl('forewing basal dash, yes.webp');
    assert.match(url, /key-images\//);
    assert.ok(url.startsWith('https://la.storage.bunnycdn.com/pnwmoths/key-images/'));
    assert.ok(url.includes('forewing'));
  });
});
