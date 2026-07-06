// scripts/emit-species-districts.test.ts
// Unit tests for the pure allow-list filter (filterToPnwAllowlist) and the
// committed-CSV loader (loadMtCountyAllowlist) that back the Browse district
// filter's build-time aggregate (BFILT-01, BFILT-03, D-05, D-06, D-07).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  filterToPnwAllowlist,
  loadMtCountyAllowlist,
  PNW_STATES,
  type SpeciesDistrictRow,
} from './emit-species-districts.ts';

describe('filterToPnwAllowlist', () => {
  it('drops AB rows regardless of county (D-05)', () => {
    const rows: SpeciesDistrictRow[] = [
      { species_slug: 'a', state: 'AB', county: 'Somewhere' },
    ];
    const result = filterToPnwAllowlist(rows, PNW_STATES, new Set());
    assert.deepEqual(result, []);
  });

  it('keeps MT rows only when county is allow-listed (D-06): Missoula kept, Custer dropped', () => {
    const rows: SpeciesDistrictRow[] = [
      { species_slug: 'a', state: 'MT', county: 'Missoula' },
      { species_slug: 'b', state: 'MT', county: 'Custer' }, // eastern MT, excluded
    ];
    const result = filterToPnwAllowlist(rows, new Set(['MT']), new Set(['Missoula']));
    assert.deepEqual(result, [rows[0]]);
  });

  it('passes non-MT PNW rows (BC/WA/OR/ID) through unchanged', () => {
    const rows: SpeciesDistrictRow[] = [
      { species_slug: 'a', state: 'BC', county: 'Okanagan-Similkameen' },
      { species_slug: 'b', state: 'WA', county: 'King' },
      { species_slug: 'c', state: 'OR', county: 'Lane' },
      { species_slug: 'd', state: 'ID', county: 'Latah' },
    ];
    const result = filterToPnwAllowlist(rows, PNW_STATES, new Set());
    assert.deepEqual(result, rows);
  });

  it('keeps an MT row whose records-side county has surrounding whitespace (WR-03 symmetric trim)', () => {
    // loadMtCountyAllowlist trims allow-list entries, so a records-side value
    // with leading/trailing whitespace must still match — otherwise a western-MT
    // county would be silently dropped from the aggregate.
    const rows: SpeciesDistrictRow[] = [
      { species_slug: 'a', state: 'MT', county: ' Missoula ' },
    ];
    const result = filterToPnwAllowlist(rows, new Set(['MT']), new Set(['Missoula']));
    assert.deepEqual(result, rows);
  });

  it('still respects case-sensitivity after trimming (D-07: no case-fold)', () => {
    // Whitespace is normalized but case is NOT — a casing mismatch must still drop.
    const rows: SpeciesDistrictRow[] = [
      { species_slug: 'a', state: 'MT', county: ' missoula ' },
    ];
    const result = filterToPnwAllowlist(rows, new Set(['MT']), new Set(['Missoula']));
    assert.deepEqual(result, []);
  });
});

describe('loadMtCountyAllowlist', () => {
  it('reads a fixture CSV into a Set preserving exact case (no toLowerCase)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mt-county-allowlist-'));
    const csvPath = join(dir, 'mt-county-allowlist.csv');
    writeFileSync(csvPath, 'county\nMissoula\nLake\n');
    try {
      const result = loadMtCountyAllowlist(csvPath);
      assert.equal(result.size, 2);
      assert.ok(result.has('Missoula'));
      assert.ok(result.has('Lake'));
      assert.ok(!result.has('missoula'), 'must not lowercase-fold county names');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty Set on a missing path (build continues)', () => {
    const result = loadMtCountyAllowlist('/nonexistent/path/mt-county-allowlist.csv');
    assert.equal(result.size, 0);
  });
});
