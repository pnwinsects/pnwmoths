// src/_lib/key-dependencies.ts
// Contingent character reveal for the Identify key (issue #97).
//
// Several character questions are only meaningful once a parent character has a
// particular state selected. The Lucid source (data/key.data) carries an empty
// <filter_tree>, so these relationships do not exist in the data — they are
// authored here, keyed on the globally-unique question string (see key-filter.ts).
//
// Pure module: no DOM, no network. Importable by the browser component and the
// Node test runner alike.
import type { QuestionGroups, Selection } from './key-filter.ts';

// ---------------------------------------------------------------------------
// Dependency table
// ---------------------------------------------------------------------------

/**
 * One parent→child reveal rule. The child question is hidden until at least one
 * of `triggerStates` is selected in the parent question (OR semantics).
 */
export interface CharacterDependency {
  /** Dependent (child) question — hidden until the trigger is met. */
  childQuestion: string;
  /** Controlling (parent) question. */
  parentQuestion: string;
  /** Parent state labels that reveal the child. */
  triggerStates: string[];
}

/**
 * The 15 reveal rules from issue #97. Question and state strings are verbatim
 * from data/key-matrix.json; the real-data test guards against drift.
 */
export const CHARACTER_DEPENDENCIES: readonly CharacterDependency[] = [
  // Distribution: per-state ecoregion lists gated by the chosen state/province.
  { childQuestion: 'In which ecoregion in Washington?',       parentQuestion: 'In which State/Province was the moth found?', triggerStates: ['Washington'] },
  { childQuestion: 'In which ecoregion in Idaho?',            parentQuestion: 'In which State/Province was the moth found?', triggerStates: ['Idaho'] },
  { childQuestion: 'In which ecoregion in Oregon?',           parentQuestion: 'In which State/Province was the moth found?', triggerStates: ['Oregon'] },
  { childQuestion: 'In which ecoregion in Western Montana?',  parentQuestion: 'In which State/Province was the moth found?', triggerStates: ['Western Montana'] },
  { childQuestion: 'In which ecoregion in British Columbia?', parentQuestion: 'In which State/Province was the moth found?', triggerStates: ['British Columbia'] },

  // Size: precise-length lists gated by the approximate-size bucket.
  { childQuestion: 'Precise size (forewing length) of small moths',      parentQuestion: 'Approximate size (forewing length)', triggerStates: ['Small (4mm to 11mm)'] },
  { childQuestion: 'Precise size (forewing length) of medium moths',     parentQuestion: 'Approximate size (forewing length)', triggerStates: ['Medium (12mm to 19mm)'] },
  { childQuestion: 'Precise size (forewing length) of large moths',      parentQuestion: 'Approximate size (forewing length)', triggerStates: ['Large (20mm to 34mm)'] },
  { childQuestion: 'Precise size (forewing length) of very large moths', parentQuestion: 'Approximate size (forewing length)', triggerStates: ['Very Large - Greater than 34mm'] },

  // Forewing stigma: three follow-up questions gated by presence of a stigma.
  { childQuestion: 'Is the stigma very large?',                                                   parentQuestion: 'Does the forewing have a stigma?', triggerStates: ['Yes'] },
  { childQuestion: 'What type of stigma does it have?',                                            parentQuestion: 'Does the forewing have a stigma?', triggerStates: ['Yes'] },
  { childQuestion: 'Is the area behind the stigma much darker than the rest of the forewing?',    parentQuestion: 'Does the forewing have a stigma?', triggerStates: ['Yes'] },

  // Hindwing discal spot: strength gated by presence of the spot.
  { childQuestion: 'Is the discal spot on the hindwing strong or weak?', parentQuestion: 'Does the hindwing have a discal spot?', triggerStates: ['Yes'] },

  // Hindwing marginal band: darkness + spots gated by presence of the band.
  { childQuestion: 'Is the marginal band darker or lighter than the adjacent area?', parentQuestion: 'Does the hindwing have a wide, distinct, strongly-contrasting band on the outer margin?', triggerStates: ['Yes'] },
  { childQuestion: 'Does the marginal band contain one or more spots?',              parentQuestion: 'Does the hindwing have a wide, distinct, strongly-contrasting band on the outer margin?', triggerStates: ['Yes'] },
];

/** child question → its dependency rule. */
const BY_CHILD: ReadonlyMap<string, CharacterDependency> = new Map(
  CHARACTER_DEPENDENCIES.map(dep => [dep.childQuestion, dep]),
);

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Is `question` currently visible given the user's `selection`?
 *
 * Non-dependent questions are always visible. A dependent child is visible iff
 * its parent is itself visible AND ≥1 of the parent's trigger states is
 * selected. The parent-visibility recursion is defensive — the current rule set
 * is flat (no parent is also a child) — but keeps the predicate correct if a
 * chained dependency is ever added.
 *
 * @param question - question text to test
 * @param selection - Map<questionText, Set<characterId>> of user selections
 * @param groups - buildQuestionGroups(...) output, for state→id resolution
 */
export function isQuestionVisible(
  question: string,
  selection: Selection,
  groups: QuestionGroups,
): boolean {
  const dep = BY_CHILD.get(question);
  if (!dep) return true; // not a dependent question

  // Parent must itself be shown (chained-dependency safety).
  if (!isQuestionVisible(dep.parentQuestion, selection, groups)) return false;

  const selected = selection.get(dep.parentQuestion);
  if (!selected || selected.size === 0) return false;

  const parentStates = groups.get(dep.parentQuestion) ?? [];
  return parentStates.some(
    c => dep.triggerStates.includes(c.state) && selected.has(c.id),
  );
}

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

/**
 * Return a new Selection with every currently-hidden question's selections
 * removed. Called after each selection change so a child that becomes hidden
 * (e.g. its parent trigger was deselected) cannot silently constrain
 * computeMatching, and so a re-revealed child starts unchecked.
 *
 * Iterates to a fixpoint: dropping a parent's selection can hide a child, whose
 * removal is picked up on the next pass. Converges because each pass only ever
 * removes entries. Flat rule sets settle in a single pass.
 */
export function pruneHiddenSelections(
  selection: Selection,
  groups: QuestionGroups,
): Selection {
  let current = selection;
  for (;;) {
    let changed = false;
    const next: Selection = new Map();
    for (const [question, ids] of current) {
      if (ids.size > 0 && !isQuestionVisible(question, current, groups)) {
        changed = true; // drop hidden selection
        continue;
      }
      next.set(question, ids);
    }
    if (!changed) return next;
    current = next;
  }
}
