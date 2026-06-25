// src/components/key-matrix-cache.ts
// Load-time structural guard for data/key-matrix.json at the client boundary.
// Mirrors assertParquetColumns (parquet-cache.ts) and validateSpeciesStates (pnwm-taxon-browser.ts).
// No fetch/load/Lit code — this file is only the guard function and associated types.
// Phase 39: defined here; will be imported by pnwm-identify (Phase 41).
import { KeyMatrixSchema } from '../types/schemas.ts';
import type { KeyMatrix } from '../types/schemas.ts';

/**
 * Assert that `data` conforms to the KeyMatrix shape at the client boundary.
 *
 * Performs two validation layers (mirrors the assertParquetColumns / validateSpeciesStates pattern):
 *   1. `KeyMatrixSchema.parse(data)` — zod/mini structural parse (O(characters + species))
 *   2. Post-parse structural invariants Zod cannot express:
 *      - matrix.length === characters.length (237)
 *      - every matrix[i] base64 string has length === ceil(ceil(species.length/8)/3)*4
 *
 * Throws an Error with a descriptive message on any violation.
 *
 * @param data - Unknown value loaded from key-matrix.json (e.g. via res.json())
 * @throws Error if data does not conform to KeyMatrix schema or structural invariants
 */
export function validateKeyMatrix(data: unknown): asserts data is KeyMatrix {
  // Layer 1: zod/mini parse (throws ZodError on schema mismatch)
  const artifact = KeyMatrixSchema.parse(data);

  // Layer 2: structural invariants (mirrors post-Zod checks in build-key.ts)
  if (artifact.matrix.length !== artifact.characters.length) {
    throw new Error(
      `key-matrix.json schema mismatch: matrix.length (${artifact.matrix.length}) !== characters.length (${artifact.characters.length})`
    );
  }

  const nBytes = Math.ceil(artifact.species.length / 8);
  const expectedB64Len = Math.ceil(nBytes / 3) * 4;
  for (let i = 0; i < artifact.matrix.length; i++) {
    const b64 = artifact.matrix[i]!;
    if (b64.length !== expectedB64Len) {
      throw new Error(
        `key-matrix.json schema mismatch: matrix[${i}] base64 length ${b64.length} !== expected ${expectedB64Len}`
      );
    }
  }
}
