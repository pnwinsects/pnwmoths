import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCountyOptions } from './pnwm-filter-bar.ts';
import type { OccurrenceRecord } from '../types/index.ts';

/** Minimal county/state fixture — buildCountyOptions only reads these two fields. */
function rec(county: string | null, state: string): Pick<OccurrenceRecord, 'county' | 'state'> {
  return { county, state };
}

describe('buildCountyOptions (ISSUE-133)', () => {
  it('returns empty array for no records', () => {
    assert.deepEqual(buildCountyOptions([]), []);
  });

  it('skips records with a null county', () => {
    const result = buildCountyOptions([rec(null, 'WA')]);
    assert.deepEqual(result, []);
  });

  it('gives an unambiguous county a bare value and label', () => {
    const result = buildCountyOptions([rec('Whatcom', 'WA'), rec('Whatcom', 'WA')]);
    assert.deepEqual(result, [{ value: 'Whatcom', label: 'Whatcom' }]);
  });

  it('disambiguates a county name shared by more than one state with compound state:county keys', () => {
    // Same-named county in two different states/provinces — the actual bug in ISSUE-133.
    const result = buildCountyOptions([rec('Lincoln', 'WA'), rec('Lincoln', 'MT')]);
    assert.deepEqual(result, [
      { value: 'MT:Lincoln', label: 'Lincoln (MT)' },
      { value: 'WA:Lincoln', label: 'Lincoln (WA)' },
    ]);
  });

  it('disambiguates a county shared by three states (e.g. Lincoln: MT, OR, WA)', () => {
    const result = buildCountyOptions([
      rec('Lincoln', 'WA'),
      rec('Lincoln', 'MT'),
      rec('Lincoln', 'OR'),
    ]);
    assert.deepEqual(result, [
      { value: 'MT:Lincoln', label: 'Lincoln (MT)' },
      { value: 'OR:Lincoln', label: 'Lincoln (OR)' },
      { value: 'WA:Lincoln', label: 'Lincoln (WA)' },
    ]);
  });

  it('keeps unambiguous and ambiguous counties independent in a mixed record set', () => {
    const result = buildCountyOptions([
      rec('Whatcom', 'WA'), // only ever WA — stays bare
      rec('Lincoln', 'WA'),
      rec('Lincoln', 'MT'), // ambiguous — gets compound keys
    ]);
    assert.deepEqual(result, [
      { value: 'MT:Lincoln', label: 'Lincoln (MT)' },
      { value: 'WA:Lincoln', label: 'Lincoln (WA)' },
      { value: 'Whatcom', label: 'Whatcom' },
    ]);
  });

  it('sorts options alphabetically by label', () => {
    const result = buildCountyOptions([rec('Yakima', 'WA'), rec('Adams', 'WA')]);
    assert.deepEqual(result.map(o => o.label), ['Adams', 'Yakima']);
  });

  it('a species whose records for a name all fall in one state stays unambiguous', () => {
    // Even though "Lincoln" is ambiguous *globally* (WA/MT/OR), a species with only
    // MT-Lincoln records in its own record set should not be annotated — there's no
    // other state's "Lincoln" to accidentally aggregate with in this record set.
    const result = buildCountyOptions([rec('Lincoln', 'MT'), rec('Lincoln', 'MT')]);
    assert.deepEqual(result, [{ value: 'Lincoln', label: 'Lincoln' }]);
  });
});
