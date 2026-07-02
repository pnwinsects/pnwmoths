/**
 * Minimal HyperLogLog implementation for privacy-preserving unique visitor counting.
 *
 * Properties:
 * - ~0.8% standard error with p=14 (16384 registers)
 * - Serializes to ~12KB base64 string
 * - Sketches are mergeable: union daily sketches for any time range
 * - Impossible to recover original values (IPs) from the sketch
 *
 * Uses Node's built-in crypto for hashing — no external dependencies.
 */

import { createHash } from 'node:crypto';

const DEFAULT_P = 14; // 2^14 = 16384 registers, ~0.8% error
const HASH_BITS = 32; // We use 32-bit hash values

/**
 * HyperLogLog sketch for cardinality estimation.
 */
export class HyperLogLog {
  readonly p: number;
  readonly m: number; // number of registers (2^p)
  readonly registers: Uint8Array;

  constructor(p: number = DEFAULT_P) {
    this.p = p;
    this.m = 1 << p;
    this.registers = new Uint8Array(this.m);
  }

  /**
   * Add a value to the sketch. The value is hashed internally.
   */
  add(value: string): void {
    const hash = this._hash(value);
    const index = hash >>> (HASH_BITS - this.p); // first p bits → register index
    const w = hash << this.p | (1 << (this.p - 1)); // remaining bits (ensure non-zero)
    const rho = this._countLeadingZeros(w) + 1;
    if (rho > this.registers[index]!) {
      this.registers[index] = rho;
    }
  }

  /**
   * Estimate the cardinality (number of unique values added).
   */
  count(): number {
    const alpha = this._alpha();
    let sum = 0;
    let zeros = 0;

    for (let i = 0; i < this.m; i++) {
      const val = this.registers[i]!;
      sum += 2 ** (-val);
      if (val === 0) zeros++;
    }

    let estimate = alpha * this.m * this.m / sum;

    // Small range correction (linear counting)
    if (estimate <= 2.5 * this.m && zeros > 0) {
      estimate = this.m * Math.log(this.m / zeros);
    }

    return Math.round(estimate);
  }

  /**
   * Merge another HLL sketch into this one (set union).
   * Both sketches must have the same precision p.
   */
  merge(other: HyperLogLog): void {
    if (this.p !== other.p) {
      throw new Error(`Cannot merge HLL sketches with different precision: ${this.p} vs ${other.p}`);
    }
    for (let i = 0; i < this.m; i++) {
      if (other.registers[i]! > this.registers[i]!) {
        this.registers[i] = other.registers[i]!;
      }
    }
  }

  /**
   * Serialize the sketch to a base64 string for storage.
   */
  serialize(): string {
    return Buffer.from(this.registers).toString('base64');
  }

  /**
   * Deserialize a sketch from a base64 string.
   */
  static deserialize(data: string, p: number = DEFAULT_P): HyperLogLog {
    const hll = new HyperLogLog(p);
    const buf = Buffer.from(data, 'base64');
    if (buf.length !== hll.m) {
      throw new Error(`Invalid HLL data: expected ${hll.m} bytes, got ${buf.length}`);
    }
    hll.registers.set(buf);
    return hll;
  }

  /**
   * Create a merged sketch from multiple serialized sketches.
   */
  static union(sketches: string[], p: number = DEFAULT_P): HyperLogLog {
    const merged = new HyperLogLog(p);
    for (const sketch of sketches) {
      merged.merge(HyperLogLog.deserialize(sketch, p));
    }
    return merged;
  }

  /** Hash a string to a 32-bit unsigned integer. */
  private _hash(value: string): number {
    const digest = createHash('md5').update(value).digest();
    // Read first 4 bytes as unsigned 32-bit int
    return digest.readUInt32LE(0);
  }

  /** Count leading zeros of a 32-bit integer. */
  private _countLeadingZeros(x: number): number {
    if (x === 0) return 32;
    let n = 0;
    if ((x & 0xFFFF0000) === 0) { n += 16; x <<= 16; }
    if ((x & 0xFF000000) === 0) { n += 8; x <<= 8; }
    if ((x & 0xF0000000) === 0) { n += 4; x <<= 4; }
    if ((x & 0xC0000000) === 0) { n += 2; x <<= 2; }
    if ((x & 0x80000000) === 0) { n += 1; }
    return n;
  }

  /** Bias correction constant alpha_m. */
  private _alpha(): number {
    if (this.m === 16) return 0.673;
    if (this.m === 32) return 0.697;
    if (this.m === 64) return 0.709;
    return 0.7213 / (1 + 1.079 / this.m);
  }
}
