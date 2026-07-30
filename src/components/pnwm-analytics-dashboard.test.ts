import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import './pnwm-analytics-dashboard.ts';

interface CountryDay {
  countries: Array<{ code: string; count: number }>;
}

interface AnalyticsDashboardConstructor {
  prototype: {
    _getTopCountries(days: CountryDay[], limit?: number): Array<[string, number]>;
  };
}

const Dashboard = customElements.get('pnwm-analytics-dashboard') as AnalyticsDashboardConstructor | undefined;
assert.ok(Dashboard);

function getTopCountries(days: CountryDay[], limit?: number): Array<[string, number]> {
  if (!Dashboard) throw new Error('pnwm-analytics-dashboard was not registered');
  return Dashboard.prototype._getTopCountries(days, limit);
}

describe('_getTopCountries', () => {
  it('aggregates matching country codes across days and sorts by descending count', () => {
    const result = getTopCountries([
      { countries: [{ code: 'US', count: 5 }, { code: 'CA', count: 4 }] },
      { countries: [{ code: 'US', count: 7 }, { code: 'MX', count: 20 }] },
    ]);

    assert.deepEqual(result, [
      ['MX', 20],
      ['US', 12],
      ['CA', 4],
    ]);
  });

  it('applies the default 15-country limit and drops the lowest-count countries', () => {
    const countries = Array.from({ length: 18 }, (_, i) => ({
      code: `C${String(i + 1).padStart(2, '0')}`,
      count: i + 1,
    }));

    const result = getTopCountries([{ countries }]);

    assert.equal(result.length, 15);
    assert.equal(result[0]?.[0], 'C18');
    assert.equal(result.at(-1)?.[0], 'C04');
    assert.ok(!result.some(([code]) => ['C01', 'C02', 'C03'].includes(code)));
  });

  it('honors an explicit non-default limit', () => {
    const result = getTopCountries([
      {
        countries: [
          { code: 'US', count: 10 },
          { code: 'CA', count: 8 },
          { code: 'MX', count: 6 },
          { code: 'GB', count: 4 },
        ],
      },
    ], 2);

    assert.deepEqual(result, [
      ['US', 10],
      ['CA', 8],
    ]);
  });

  it('aggregates only the filtered days passed in', () => {
    const allDays = [
      { countries: [{ code: 'US', count: 10 }, { code: 'CA', count: 2 }] },
      { countries: [{ code: 'CA', count: 9 }, { code: 'GB', count: 4 }] },
      { countries: [{ code: 'US', count: 5 }, { code: 'GB', count: 1 }] },
    ];

    const result = getTopCountries([allDays[1]!]);

    assert.deepEqual(result, [
      ['CA', 9],
      ['GB', 4],
    ]);
  });

  it('returns an empty array for no days', () => {
    assert.deepEqual(getTopCountries([]), []);
  });

  it('returns an empty array when every day has no countries', () => {
    assert.deepEqual(getTopCountries([{ countries: [] }, { countries: [] }]), []);
  });
});
