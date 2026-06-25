// src/_lib/key-filter.ts
// Pure filter-logic functions for the Identify feature (IDENT-04).
// Implements D-01 (OR-within/AND-across), D-02 (polymorphic match),
// D-03 (canonical elimination predicate), D-04 (fully-unscored always kept).
// No DOM, no network — importable by both Node test runner and browser components.
import type { Character, KeyMatrix } from '../types/schemas.ts';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * Map<questionText, Character[]> — 55 entries for the real matrix.
 * Keyed by character.question string alone (all 55 are globally unique — verified).
 * Insertion order matches characters[] order, preserving character.id sequence.
 */
export type QuestionGroups = Map<string, Character[]>;

/**
 * Filter selection: maps each constrained question's text to the Set of
 * character IDs (character.id) the user has selected.
 * An empty Map (or an entry with an empty Set) imposes no constraint.
 */
export type Selection = Map<string, Set<number>>;

/**
 * Result of computeMatching: matched species slugs + convenience count.
 */
export interface MatchResult {
  matchedSlugs: string[];  // slugs of matching KeySpecies, in species[] order
  count: number;           // matchedSlugs.length — convenience for event detail + counter
}

// ---------------------------------------------------------------------------
// buildQuestionGroups
// ---------------------------------------------------------------------------

/**
 * Group the character-states from KeyMatrix.characters by their question string.
 *
 * Returns a Map<questionText, Character[]> with one entry per unique question.
 * For the real 237-character matrix this produces 55 entries.
 *
 * The question string is the correct grouping key — all 55 question strings are
 * globally unique in the matrix (verified against data/key-matrix.json).
 * Insertion order matches characters[] order, preserving character.id sequence
 * for correct bitset index lookup in computeMatching.
 */
export function buildQuestionGroups(characters: Character[]): QuestionGroups {
  const groups = new Map<string, Character[]>();
  for (const char of characters) {
    const existing = groups.get(char.question);
    if (existing !== undefined) {
      existing.push(char);
    } else {
      groups.set(char.question, [char]);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// computeMatching
// ---------------------------------------------------------------------------

/**
 * Apply D-03 filter semantics to produce the matching species set.
 *
 * @param matrix        - KeyMatrix loaded from data/key-matrix.json
 * @param selection     - Map<questionText, Set<characterId>> of user selections
 * @param questionGroups - Output of buildQuestionGroups(matrix.characters)
 * @returns MatchResult with matchedSlugs (in species[] order) and count
 *
 * Algorithm:
 *   Start with an all-ones result bitset (all species pass).
 *   For each constrained question Q (with ≥1 selected state):
 *     Compute selectedUnion = bitwise OR of all selected states' bitsets.
 *     Compute opposingUnion = bitwise OR of all opposing (unselected) states' bitsets.
 *     Apply D-03 keepMask per byte:
 *       result[i] &= (selectedUnion[i] | (~opposingUnion[i] & 0xff))
 *     This keeps a species iff it has ≥1 selected bit OR has no opposing bit.
 *     Eliminates ONLY species scored 0 on all selected AND 1 on ≥1 opposing (D-03).
 *   AND results across all constrained questions (each question further filters result).
 *
 * CRITICAL: Do NOT use result &= OR(selected bitsets) — that naive form wrongly
 * eliminates unscored (all-zero) species. Use the keepMask expression above.
 *
 * D-04 invariant: fully-unscored species (e.g. hypenodes-fractilinea, xestia-normanianus)
 * have all-zero bitsets. Their selectedUnion bit is 0 and opposingUnion bit is 0 for
 * every question, so ~opposingUnion bit is 1 and they always pass through (no special-casing).
 *
 * Empty selection: no constrained questions → all-ones result → all species returned (D-03 base).
 */
export function computeMatching(
  matrix: KeyMatrix,
  selection: Selection,
  questionGroups: QuestionGroups,
): MatchResult {
  const nSpecies = matrix.species.length;
  const nBytes = Math.ceil(nSpecies / 8);

  // Start with all 1s — all species pass until a constrained question eliminates them
  const result = new Uint8Array(nBytes).fill(0xff);

  for (const [question, selectedIds] of selection) {
    if (selectedIds.size === 0) continue;  // empty set for this question: no constraint

    const allStatesForQ = questionGroups.get(question) ?? [];
    const opposingIds = allStatesForQ
      .filter(c => !selectedIds.has(c.id))
      .map(c => c.id);

    // selectedUnion: byte-wise OR of bitsets for all selected states
    const selectedUnion = new Uint8Array(nBytes);
    for (const id of selectedIds) {
      const b64 = matrix.matrix[id];
      if (b64 === undefined) continue;
      const bits = Buffer.from(b64, 'base64');
      for (let i = 0; i < nBytes; i++) selectedUnion[i]! |= bits[i]!;
    }

    // opposingUnion: byte-wise OR of bitsets for all opposing (unselected) states
    const opposingUnion = new Uint8Array(nBytes);
    for (const id of opposingIds) {
      const b64 = matrix.matrix[id];
      if (b64 === undefined) continue;
      const bits = Buffer.from(b64, 'base64');
      for (let i = 0; i < nBytes; i++) opposingUnion[i]! |= bits[i]!;
    }

    // D-03 keepMask: keep species that have a selected hit OR have no opposing hit.
    // ~opposingUnion must be masked to 0xff per byte (no typed-array bitwise NOT).
    for (let i = 0; i < nBytes; i++) {
      result[i]! &= (selectedUnion[i]! | (~opposingUnion[i]! & 0xff));
    }
  }

  // Collect matching slugs: read bit i as (result[i>>3] >> (i&7)) & 1, LSB-first.
  // Bound loop at nSpecies (not nBytes*8) so trailing bits are never collected.
  const matchedSlugs: string[] = [];
  for (let i = 0; i < nSpecies; i++) {
    if ((result[i >> 3]! >> (i & 7)) & 1) {
      matchedSlugs.push(matrix.species[i]!.slug);
    }
  }

  return { matchedSlugs, count: matchedSlugs.length };
}
