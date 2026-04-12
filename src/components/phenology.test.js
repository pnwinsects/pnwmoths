import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateByMonth } from './parquet-cache.js';

describe('aggregateByMonth edge cases', () => {
  it('handles all 12 months populated', () => {
    const records = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => ({ month }));
    const result = aggregateByMonth(records);
    assert.deepEqual(result, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('handles single record per month with multiple records in each', () => {
    const records = [
      { month: 6 },
      { month: 6 },
      { month: 6 },
    ];
    const result = aggregateByMonth(records);
    assert.equal(result[5], 3);
    assert.equal(result.reduce((a, b) => a + b, 0), 3);
  });

  it('ignores records with month=undefined', () => {
    const records = [{ month: undefined }, { month: 5 }];
    const result = aggregateByMonth(records);
    assert.equal(result[4], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 1);
  });

  it('handles boundary months correctly (1 and 12)', () => {
    const records = [{ month: 1 }, { month: 12 }];
    const result = aggregateByMonth(records);
    assert.equal(result[0], 1);
    assert.equal(result[11], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 2);
  });

  it('handles month values at boundaries that should be excluded (0 and 13)', () => {
    const records = [{ month: 0 }, { month: 13 }, { month: 7 }];
    const result = aggregateByMonth(records);
    assert.equal(result[6], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 1);
  });
});
