import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HyperLogLog } from './hyperloglog.ts';

describe('HyperLogLog', () => {
  it('estimates cardinality within expected error range', () => {
    const hll = new HyperLogLog(14);
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      hll.add(`192.168.${Math.floor(i / 256)}.${i % 256}`);
    }
    const estimate = hll.count();
    // With p=14, expect ~0.8% error, allow 5% for test stability
    assert.ok(estimate > n * 0.95, `Estimate ${estimate} too low (expected ~${n})`);
    assert.ok(estimate < n * 1.05, `Estimate ${estimate} too high (expected ~${n})`);
  });

  it('returns 0 for empty sketch', () => {
    const hll = new HyperLogLog(14);
    assert.equal(hll.count(), 0);
  });

  it('handles duplicate values correctly', () => {
    const hll = new HyperLogLog(14);
    for (let i = 0; i < 1000; i++) {
      hll.add('same-ip');
    }
    assert.equal(hll.count(), 1);
  });

  it('serializes and deserializes correctly', () => {
    const hll = new HyperLogLog(14);
    for (let i = 0; i < 500; i++) {
      hll.add(`10.0.${Math.floor(i / 256)}.${i % 256}`);
    }
    const serialized = hll.serialize();
    const restored = HyperLogLog.deserialize(serialized, 14);
    assert.equal(restored.count(), hll.count());
  });

  it('merges sketches to produce union cardinality', () => {
    const hll1 = new HyperLogLog(14);
    const hll2 = new HyperLogLog(14);

    // Add 500 unique IPs to each, with 200 overlapping
    for (let i = 0; i < 500; i++) {
      hll1.add(`visitor-${i}`);
    }
    for (let i = 300; i < 800; i++) {
      hll2.add(`visitor-${i}`);
    }

    // Union should be ~800 unique
    const merged = HyperLogLog.union([hll1.serialize(), hll2.serialize()], 14);
    const estimate = merged.count();
    assert.ok(estimate > 750, `Union estimate ${estimate} too low (expected ~800)`);
    assert.ok(estimate < 850, `Union estimate ${estimate} too high (expected ~800)`);
  });

  it('union of single sketch equals the sketch itself', () => {
    const hll = new HyperLogLog(14);
    for (let i = 0; i < 100; i++) {
      hll.add(`ip-${i}`);
    }
    const merged = HyperLogLog.union([hll.serialize()], 14);
    assert.equal(merged.count(), hll.count());
  });

  it('serialized size is correct for p=14', () => {
    const hll = new HyperLogLog(14);
    hll.add('test');
    const serialized = hll.serialize();
    // base64 of 16384 bytes
    const decoded = Buffer.from(serialized, 'base64');
    assert.equal(decoded.length, 16384);
  });
});
