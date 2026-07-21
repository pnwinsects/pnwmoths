import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestionGroups, computeMatching } from './key-filter.ts';
import type { KeyMatrix, Character, KeySpecies } from '../types/schemas.ts';

// ---------------------------------------------------------------------------
// Bitset encoding helper (same LSB-first scheme as scripts/build-key.ts buildBitset)
// bit i of species array → bit (i & 7) of byte (i >> 3)
// ---------------------------------------------------------------------------
function encodeBitset(nSpecies: number, ones: number[]): string {
  const nBytes = Math.ceil(nSpecies / 8);
  const bits = new Uint8Array(nBytes);
  for (const i of ones) {
    bits[i >> 3]! |= 1 << (i & 7);
  }
  return Buffer.from(bits).toString('base64');
}

// ---------------------------------------------------------------------------
// Fixture builder
//
// makeMatrix(speciesSlugs, questions):
//   questions: Array of { question, states: Array<{ state, ones: number[] }> }
//   ones: indices into speciesSlugs of species scored 1 for that state
// Returns a minimal KeyMatrix with stub meta (not used by computeMatching).
// ---------------------------------------------------------------------------
function makeMatrix(
  slugs: string[],
  questionDefs: Array<{
    question: string;
    states: Array<{ state: string; ones: number[] }>;
  }>,
): KeyMatrix {
  const species: KeySpecies[] = slugs.map(slug => ({
    slug,
    genus: 'Genus',
    epithet: 'species',
    common_name: null,
    nav_image: null,
  }));

  const characters: Character[] = [];
  const matrix: string[] = [];
  let charId = 0;

  for (const qDef of questionDefs) {
    for (const sDef of qDef.states) {
      characters.push({
        id: charId,
        category: 'Test',
        subcategory: null,
        question: qDef.question,
        state: sDef.state,
        image_filename: null,
        alt_text: null,
      });
      matrix.push(encodeBitset(slugs.length, sDef.ones));
      charId++;
    }
  }

  return {
    meta: {
      totalKeySpecies: slugs.length,
      matchedSpecies: slugs.length,
      unmatchedSpecies: 0,
    },
    species,
    characters,
    matrix,
  };
}

// ---------------------------------------------------------------------------
// TC-8: buildQuestionGroups
// ---------------------------------------------------------------------------
describe('buildQuestionGroups', () => {
  it('TC-8a: groups fixture characters by question string', () => {
    // 3 characters: 2 states under Q1, 1 state under Q2
    const chars: Character[] = [
      { id: 0, category: 'Cat', subcategory: null, question: 'Q1', state: 'S1', image_filename: null, alt_text: null },
      { id: 1, category: 'Cat', subcategory: null, question: 'Q1', state: 'S2', image_filename: null, alt_text: null },
      { id: 2, category: 'Cat', subcategory: null, question: 'Q2', state: 'S1', image_filename: null, alt_text: null },
    ];
    const groups = buildQuestionGroups(chars);
    assert.strictEqual(groups.size, 2, 'should have 2 question groups');
    assert.strictEqual(groups.get('Q1')?.length, 2, 'Q1 should have 2 states');
    assert.strictEqual(groups.get('Q2')?.length, 1, 'Q2 should have 1 state');
  });

  it('TC-8b: groups 237 characters into 55 question groups (real artifact)', async () => {
    // Integration: real data/key-matrix.json
    const { default: keyMatrix } = await import('../../data/key-matrix.json', { with: { type: 'json' } });
    const groups = buildQuestionGroups(keyMatrix.characters as Character[]);
    assert.strictEqual(groups.size, 55, 'all 55 unique question strings must produce 55 groups');
    // Total characters across all groups must equal 237
    let total = 0;
    for (const chars of groups.values()) total += chars.length;
    assert.strictEqual(total, 237, 'sum of group sizes must equal 237 characters');
  });
});

// ---------------------------------------------------------------------------
// computeMatching
// ---------------------------------------------------------------------------
describe('computeMatching', () => {
  // Fixture: 4 species, 2 questions (Q1 has 2 states, Q2 has 1 state)
  //
  //          | Q1:S1 | Q1:S2 | Q2:S1 |
  // sp-a     |   1   |   0   |   1   |   scored on Q1:S1 and Q2:S1
  // sp-b     |   0   |   1   |   0   |   scored on Q1:S2 only
  // sp-c     |   0   |   0   |   0   |   UNSCORED for both questions (0,0 pair)
  // sp-d     |   1   |   1   |   0   |   polymorphic: scored on both Q1:S1 AND Q1:S2
  //
  //   Q1 character ids: 0 (S1), 1 (S2)
  //   Q2 character ids: 2 (S1)

  const slugs = ['sp-a', 'sp-b', 'sp-c', 'sp-d'];
  const fixture = makeMatrix(slugs, [
    {
      question: 'Q1',
      states: [
        { state: 'S1', ones: [0, 3] },  // sp-a, sp-d
        { state: 'S2', ones: [1, 3] },  // sp-b, sp-d
      ],
    },
    {
      question: 'Q2',
      states: [
        { state: 'S1', ones: [0] },     // sp-a only
      ],
    },
  ]);
  const groups = buildQuestionGroups(fixture.characters);

  it('TC-7: empty selection returns all species (D-03 base case)', () => {
    const selection = new Map<string, Set<number>>();
    const result = computeMatching(fixture, selection, groups);
    assert.strictEqual(result.count, 4, 'all 4 fixture species must be returned');
    assert.deepStrictEqual(
      [...result.matchedSlugs].sort(),
      ['sp-a', 'sp-b', 'sp-c', 'sp-d'],
    );
  });

  it('TC-1: single state narrows — selecting Q1:S1 eliminates sp-b (scored only on Q1:S2)', () => {
    // Q1:S1 selected (id=0); opposing = Q1:S2 (id=1)
    // sp-b: 0 on Q1:S1, 1 on Q1:S2 → eliminated
    // sp-a, sp-c, sp-d: either have Q1:S1=1 or are all-zero → kept
    const selection = new Map<string, Set<number>>([
      ['Q1', new Set([0])],  // Q1:S1 selected
    ]);
    const result = computeMatching(fixture, selection, groups);
    assert.ok(!result.matchedSlugs.includes('sp-b'), 'sp-b must be eliminated (scored only on opposing Q1:S2)');
    assert.ok(result.matchedSlugs.includes('sp-a'), 'sp-a must be kept (scored on selected Q1:S1)');
    assert.ok(result.matchedSlugs.includes('sp-c'), 'sp-c must be kept (all-zero, D-04)');
    assert.ok(result.matchedSlugs.includes('sp-d'), 'sp-d must be kept (scored on selected Q1:S1, polymorphic)');
    assert.strictEqual(result.count, 3);
  });

  it('TC-2: two states same question widen — Q1:S1 + Q1:S2 returns ≥ either alone (D-01 OR-within)', () => {
    // Selecting both states of Q1 means no opposing states → no elimination
    // All 4 species kept
    const selBoth = new Map<string, Set<number>>([
      ['Q1', new Set([0, 1])],  // both Q1:S1 and Q1:S2 selected
    ]);
    const selS1 = new Map<string, Set<number>>([['Q1', new Set([0])]]);
    const selS2 = new Map<string, Set<number>>([['Q1', new Set([1])]]);

    const resultBoth = computeMatching(fixture, selBoth, groups);
    const resultS1 = computeMatching(fixture, selS1, groups);
    const resultS2 = computeMatching(fixture, selS2, groups);

    assert.ok(
      resultBoth.count >= resultS1.count,
      `both-selected (${resultBoth.count}) must be >= S1-only (${resultS1.count})`,
    );
    assert.ok(
      resultBoth.count >= resultS2.count,
      `both-selected (${resultBoth.count}) must be >= S2-only (${resultS2.count})`,
    );
    // With both selected, no opposing states remain → all species kept
    assert.strictEqual(resultBoth.count, 4, 'selecting all states of Q1 keeps all species (no opposing)');
  });

  it('TC-3: two questions AND narrows — Q1:S1 AND Q2:S1 ≤ min(either alone) (D-01 AND-across)', () => {
    // Q1:S1 alone: sp-b eliminated → 3 remain
    // Q2:S1 alone: sp-b and sp-d have Q2:S1=0, but sp-c is also 0; sp-b has no opposing → kept?
    //   Q2 has only 1 state (S1), so opposing = empty → no elimination from Q2 alone
    //   Actually: Q2:S1 selected, opposing = [] (no other Q2 states) → no elimination → all 4 kept
    // Q1:S1 AND Q2:S1: Q1 eliminates sp-b; Q2 (only 1 state, no opposing) → sp-b eliminated; sp-c kept
    //   Combined: sp-a and sp-d have Q1:S1=1 AND Q2:S1={1,0} — sp-a has Q2:S1=1, sp-d has Q2:S1=0
    //   Q2 has no opposing states (only 1 state selected out of 1 total) → all that survived Q1 survive Q2
    //   Result after AND: {sp-a, sp-c, sp-d} = 3
    //
    // For a proper AND-narrows test we need a 2nd question with 2 states.
    // Use a different fixture for this case:
    const slugs2 = ['alpha', 'beta', 'gamma', 'delta'];
    const fix2 = makeMatrix(slugs2, [
      {
        question: 'Color',
        states: [
          { state: 'Red',  ones: [0, 2] },  // alpha, gamma
          { state: 'Blue', ones: [1, 3] },  // beta, delta
        ],
      },
      {
        question: 'Size',
        states: [
          { state: 'Small', ones: [0, 1] }, // alpha, beta
          { state: 'Large', ones: [2, 3] }, // gamma, delta
        ],
      },
    ]);
    const grp2 = buildQuestionGroups(fix2.characters);

    const selColor = new Map<string, Set<number>>([['Color', new Set([0])]]);   // Red only
    const selSize  = new Map<string, Set<number>>([['Size',  new Set([2])]]);   // Small only (char id=2)
    const selBoth  = new Map<string, Set<number>>([['Color', new Set([0])], ['Size', new Set([2])]]);

    const rColor = computeMatching(fix2, selColor, grp2);  // Red: alpha, gamma (2)
    const rSize  = computeMatching(fix2, selSize,  grp2);  // Small: alpha, beta (2)
    const rBoth  = computeMatching(fix2, selBoth,  grp2);  // Red AND Small: only alpha (1)

    assert.ok(
      rBoth.count <= Math.min(rColor.count, rSize.count),
      `AND result (${rBoth.count}) must be <= min(${rColor.count}, ${rSize.count})`,
    );
    assert.strictEqual(rBoth.count, 1, 'only alpha is both Red AND Small');
    assert.deepStrictEqual(rBoth.matchedSlugs, ['alpha']);
  });

  it('TC-4: 0,0 species (unscored for question) is NOT eliminated (D-03/D-04)', () => {
    // sp-c has 0 on Q1:S1 AND 0 on Q1:S2 (no opposing hit) → must be kept
    const selection = new Map<string, Set<number>>([
      ['Q1', new Set([0])],  // Q1:S1 selected
    ]);
    const result = computeMatching(fixture, selection, groups);
    assert.ok(result.matchedSlugs.includes('sp-c'), 'sp-c (0,0 species) must NOT be eliminated by D-03');
  });

  it('TC-5: polymorphic species kept when one of its scored states is selected (D-02)', () => {
    // sp-d scores 1 on BOTH Q1:S1 (selected) AND Q1:S2 (opposing).
    // D-02: the selected-state hit wins → sp-d must be kept.
    const selection = new Map<string, Set<number>>([
      ['Q1', new Set([0])],  // Q1:S1 selected; Q1:S2 is opposing
    ]);
    const result = computeMatching(fixture, selection, groups);
    assert.ok(
      result.matchedSlugs.includes('sp-d'),
      'sp-d (polymorphic: 1 on selected Q1:S1 AND opposing Q1:S2) must be KEPT (D-02)',
    );
  });

  it('TC-6: fully-unscored species appear in any non-empty selection result (D-04, integration)', async () => {
    // Real artifact: hypenodes-fractilinea and xestia-normanianus score 0 on all 237 characters.
    // They must appear in computeMatching results for any selection (no opposing 1s → D-03 never eliminates).
    //
    // Real-artifact regression counts (see RESEARCH.md "Concrete expected values"):
    //   WA state selected (char id=0):     862 matched (after unpublished deny-list gating #84)
    //   WA OR OR selected (ids 0+2):     1,008 matched
    //   WA AND eyespot=Yes (ids 0, eyespot): 7 matched
    //   eyespot=Yes only:                    9 matched
    //   forewing-yellow only:               75 matched
    //   yellow OR orange:                  172 matched
    //   empty selection:                 1,191 matched (after unpublished deny-list gating #84)
    //
    // oedemasia-salicis was un-gated and schizura-ipomaeae was newly gated (schizura-ipomaeae
    // was not itself a matched key species), a net +1 vs. the prior 861/1,190 baseline.
    const { default: realMatrix } = await import('../../data/key-matrix.json', { with: { type: 'json' } });
    const realGroups = buildQuestionGroups(realMatrix.characters as Character[]);

    // Select WA (character id=0) as a non-empty selection
    const waQuestion = 'In which State/Province was the moth found?';
    const selection = new Map<string, Set<number>>([
      [waQuestion, new Set([0])],  // WA = character id 0
    ]);

    const result = computeMatching(realMatrix as KeyMatrix, selection, realGroups);

    assert.ok(
      result.matchedSlugs.includes('hypenodes-fractilinea'),
      'hypenodes-fractilinea (all-zero) must appear in WA-filtered results (D-04)',
    );
    assert.ok(
      result.matchedSlugs.includes('xestia-normanianus'),
      'xestia-normanianus (all-zero) must appear in WA-filtered results (D-04)',
    );
    // Regression check: WA selection should yield 862 matched species after unpublished deny-list gating (#84).
    assert.strictEqual(result.count, 862, 'WA selection must match 862 species (real-artifact regression)');
  });

  it('TC-7b: empty selection returns all 1,191 species (real artifact)', async () => {
    // Empty selection → D-03 base case: no constrained questions → all species pass.
    // (euthyatira-lorata reclassified Geometridae→Drepanidae in #73, so it rejoins the key)
    const { default: realMatrix } = await import('../../data/key-matrix.json', { with: { type: 'json' } });
    const realGroups = buildQuestionGroups(realMatrix.characters as Character[]);
    const result = computeMatching(realMatrix as KeyMatrix, new Map(), realGroups);
    assert.strictEqual(result.count, 1191, 'empty selection must return all 1,191 species');
  });
});
