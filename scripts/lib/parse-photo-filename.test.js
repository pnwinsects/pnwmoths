import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBinomial,
  parseSpecimenAndView,
  toSpeciesSlug,
} from './parse-photo-filename.js';

// ---------------------------------------------------------------------------
// extractBinomial — returns { binomial, bucketHint }
// Coverage matches the D-14 unit-test table in 26-PATTERNS.md plus the
// REPORT.md "Unparseable cases (20 files)" section.
// ---------------------------------------------------------------------------
describe('extractBinomial', () => {
  it('parses clean binomial Abagrotis apposita-A-D.tif', () => {
    const r = extractBinomial('Abagrotis apposita-A-D.tif');
    assert.equal(r.binomial, 'abagrotis apposita');
    assert.equal(r.bucketHint, null);
  });

  it('parses Paraseptis-adnixa-B-D.tif (Genus-species hyphen joined)', () => {
    const r = extractBinomial('Paraseptis-adnixa-B-D.tif');
    assert.equal(r.binomial, 'paraseptis adnixa');
    assert.equal(r.bucketHint, null);
  });

  it('parses Trichoplusia ni-A-D.tif (FIX #1: 2-char epithet)', () => {
    const r = extractBinomial('Trichoplusia ni-A-D.tif');
    assert.equal(r.binomial, 'trichoplusia ni');
    assert.equal(r.bucketHint, null);
  });

  it('parses Rachiplusia ou-A-D.tif (FIX #1: 2-char epithet)', () => {
    const r = extractBinomial('Rachiplusia ou-A-D.tif');
    assert.equal(r.binomial, 'rachiplusia ou');
    assert.equal(r.bucketHint, null);
  });

  it('parses Autographa v-alba-A-D.tif (FIX #2: hyphenated epithet)', () => {
    const r = extractBinomial('Autographa v-alba-A-D.tif');
    assert.equal(r.binomial, 'autographa v-alba');
    assert.equal(r.bucketHint, null);
  });

  it('parses Xestia c-nigrum-A-D.tif (FIX #2: hyphenated epithet)', () => {
    const r = extractBinomial('Xestia c-nigrum-A-D.tif');
    assert.equal(r.binomial, 'xestia c-nigrum');
    assert.equal(r.bucketHint, null);
  });

  it('routes Monostoecha n sp-A-D.tif to provisional (FIX #3)', () => {
    const r = extractBinomial('Monostoecha n sp-A-D.tif');
    assert.equal(r.binomial, null);
    assert.equal(r.bucketHint, 'provisional');
  });

  it('routes Plataea sp-A-D.tif to provisional (FIX #3)', () => {
    const r = extractBinomial('Plataea sp-A-D.tif');
    assert.equal(r.binomial, null);
    assert.equal(r.bucketHint, 'provisional');
  });

  it('routes Eupithecia nr harrisonata-OSAC_0001081322-D.tif to provisional (FIX #3)', () => {
    const r = extractBinomial('Eupithecia nr harrisonata-OSAC_0001081322-D.tif');
    assert.equal(r.binomial, null);
    assert.equal(r.bucketHint, 'provisional');
  });

  it('returns null binomial + null bucketHint for Lasionycta Carolynae-A-D.tif (no coercion)', () => {
    const r = extractBinomial('Lasionycta Carolynae-A-D.tif');
    assert.equal(r.binomial, null);
    assert.equal(r.bucketHint, null);
  });

  it('returns null binomial + null bucketHint for completely unparseable input "12345.tif"', () => {
    const r = extractBinomial('12345.tif');
    assert.equal(r.binomial, null);
    assert.equal(r.bucketHint, null);
  });
});

// ---------------------------------------------------------------------------
// parseSpecimenAndView — returns { specimen, view }
// ---------------------------------------------------------------------------
describe('parseSpecimenAndView', () => {
  it('returns { specimen: "A", view: "D" } for Abagrotis apposita-A-D.tif', () => {
    assert.deepStrictEqual(
      parseSpecimenAndView('Abagrotis apposita-A-D.tif'),
      { specimen: 'A', view: 'D' },
    );
  });

  it('returns { specimen: "B", view: "D" } for Paraseptis-adnixa-B-D.tif', () => {
    assert.deepStrictEqual(
      parseSpecimenAndView('Paraseptis-adnixa-B-D.tif'),
      { specimen: 'B', view: 'D' },
    );
  });

  it('returns { specimen: "WWUC000000083", view: "D" } for Hyalophora euryalus-WWUC000000083-D.tif', () => {
    assert.deepStrictEqual(
      parseSpecimenAndView('Hyalophora euryalus-WWUC000000083-D.tif'),
      { specimen: 'WWUC000000083', view: 'D' },
    );
  });

  it('returns { specimen: "OSAC_0001081322", view: "D" } for Eupithecia nr harrisonata-OSAC_0001081322-D.tif', () => {
    assert.deepStrictEqual(
      parseSpecimenAndView('Eupithecia nr harrisonata-OSAC_0001081322-D.tif'),
      { specimen: 'OSAC_0001081322', view: 'D' },
    );
  });

  it('returns { specimen: "A", view: "V" } for Sympistis perscripta-A-V.tif (ventral view)', () => {
    assert.deepStrictEqual(
      parseSpecimenAndView('Sympistis perscripta-A-V.tif'),
      { specimen: 'A', view: 'V' },
    );
  });

  it('returns { specimen: "", view: "" } for novalid.tif (no view tail)', () => {
    assert.deepStrictEqual(
      parseSpecimenAndView('novalid.tif'),
      { specimen: '', view: '' },
    );
  });
});

// ---------------------------------------------------------------------------
// toSpeciesSlug — returns string ('genus-species', lowercase, hyphen-joined)
// ---------------------------------------------------------------------------
describe('toSpeciesSlug', () => {
  it('joins "abagrotis apposita" → "abagrotis-apposita"', () => {
    assert.equal(toSpeciesSlug('abagrotis apposita'), 'abagrotis-apposita');
  });

  it('lowercases AUTOGRAPHA V-ALBA → "autographa-v-alba"', () => {
    assert.equal(toSpeciesSlug('AUTOGRAPHA V-ALBA'), 'autographa-v-alba');
  });

  it('returns "" for empty string (defensive default)', () => {
    assert.equal(toSpeciesSlug(''), '');
  });

  it('returns "" for null (defensive default; no throw)', () => {
    assert.equal(toSpeciesSlug(null), '');
  });

  it('returns "" for undefined (defensive default; no throw)', () => {
    assert.equal(toSpeciesSlug(undefined), '');
  });
});
