import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCoordinate,
  isAxisOrderSuspect,
  isWithinAssignmentBounds,
  parseCoordinate,
  FALLBACK_DEGREE_THRESHOLD,
  FALLBACK_KM,
  KM_PER_DEGREE_LAT,
} from './district-assignment.ts';

// ---------------------------------------------------------------------------
// parseCoordinate — strict numeric parsing (rejects parseFloat's trailing junk)
// ---------------------------------------------------------------------------

describe('parseCoordinate', () => {
  it('parses a clean numeric string', () => {
    assert.equal(parseCoordinate('47.6'), 47.6);
    assert.equal(parseCoordinate('-117.047'), -117.047);
  });

  it('trims surrounding whitespace', () => {
    assert.equal(parseCoordinate('  46.339  '), 46.339);
  });

  it('rejects trailing junk that parseFloat would accept', () => {
    // parseFloat('47.6xyz') === 47.6 — parseCoordinate must reject it
    assert.ok(Number.isNaN(parseCoordinate('47.6xyz')));
  });

  it('rejects blank / empty / whitespace-only cells', () => {
    assert.ok(Number.isNaN(parseCoordinate('')));
    assert.ok(Number.isNaN(parseCoordinate('   ')));
    assert.ok(Number.isNaN(parseCoordinate(null)));
    assert.ok(Number.isNaN(parseCoordinate(undefined)));
  });

  it('rejects non-finite values (Infinity, NaN text)', () => {
    assert.ok(Number.isNaN(parseCoordinate('Infinity')));
    assert.ok(Number.isNaN(parseCoordinate('NaN')));
  });

  it('accepts a number input directly', () => {
    assert.equal(parseCoordinate(46.339), 46.339);
  });
});

// ---------------------------------------------------------------------------
// classifyCoordinate — axis-order guard (DIST-04, SC#1)
// ---------------------------------------------------------------------------

describe('classifyCoordinate — axis-order guard', () => {
  it('flags the known-swapped Asotin Co., WA row from data/records-bad-coords.csv', () => {
    // latitude column holds -117.047 (a longitude value); longitude column
    // holds 46.339 (a latitude value) — a real swapped-axis record.
    assert.equal(classifyCoordinate(-117.047, 46.339), 'axis-order-suspect');
  });

  it('flags the known-swapped Harney Co., OR row from data/records-bad-coords.csv', () => {
    assert.equal(classifyCoordinate(-118.899, 42.889), 'axis-order-suspect');
  });

  it('does not flag a genuinely out-of-region point as a swap (Golden, CO — not a swap)', () => {
    // latitude=39.75 is outside the axis-order-plausible-lat range, so the
    // swap heuristic correctly does not fire; this falls through to
    // out-of-bounds instead.
    assert.equal(classifyCoordinate(39.75, -105.22), 'out-of-bounds');
  });
});

// ---------------------------------------------------------------------------
// classifyCoordinate — bounds sanity gate (PNW_BOUNDS, not DIST-04's -109)
// ---------------------------------------------------------------------------

describe('classifyCoordinate — bounds sanity gate', () => {
  it('accepts the three Phase 45 reference points', () => {
    assert.equal(classifyCoordinate(47.2529, -122.4443), 'ok'); // Tacoma, WA
    assert.equal(classifyCoordinate(48.4284, -123.3656), 'ok'); // Victoria, BC
    assert.equal(classifyCoordinate(51.424, -111.258), 'ok'); // Hanna, AB
  });

  it('accepts an eastern-MT-range longitude, proving PNW_BOUNDS (-103) governs, not DIST-04 literal -109', () => {
    assert.equal(classifyCoordinate(46.0, -105.0), 'ok');
  });

  it('rejects a longitude beyond PNW_BOUNDS.lonMax (-103)', () => {
    assert.equal(classifyCoordinate(46.0, -102.0), 'out-of-bounds');
  });
});

// ---------------------------------------------------------------------------
// isAxisOrderSuspect / isWithinAssignmentBounds — direct unit coverage
// ---------------------------------------------------------------------------

describe('isAxisOrderSuspect', () => {
  it('returns true for the Asotin swap pair', () => {
    assert.equal(isAxisOrderSuspect(-117.047, 46.339), true);
  });

  it('returns false for a valid PNW point', () => {
    assert.equal(isAxisOrderSuspect(47.2529, -122.4443), false);
  });
});

describe('isWithinAssignmentBounds', () => {
  it('returns true at the eastern-MT boundary case', () => {
    assert.equal(isWithinAssignmentBounds(46.0, -105.0), true);
  });

  it('returns false just beyond PNW_BOUNDS.lonMax', () => {
    assert.equal(isWithinAssignmentBounds(46.0, -102.0), false);
  });
});

// ---------------------------------------------------------------------------
// Fallback degree threshold (D-04)
// ---------------------------------------------------------------------------

describe('FALLBACK_DEGREE_THRESHOLD', () => {
  it('equals FALLBACK_KM / KM_PER_DEGREE_LAT', () => {
    assert.ok(Math.abs(FALLBACK_DEGREE_THRESHOLD - FALLBACK_KM / KM_PER_DEGREE_LAT) < 1e-12);
  });
});
