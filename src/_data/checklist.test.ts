// src/_data/checklist.test.ts
// The Checklist page's ordering and gating (#218).
//
// Two things are worth pinning here and nothing else is:
//
//   1. The reorder is faithful: it moves species, never adds or drops one, and never
//      mutates the tree it was given — that tree is Browse's, shared by reference.
//
//   2. A node with no checklist position sorts LAST. The gates can remove a species
//      the order file still lists, and an unknown genus jumping to the top of its
//      family would read as a data error.
//
// The GATING assertion deliberately is not here. This module cannot leak a gated
// species because it reorders taxon.ts's already-gated tree rather than re-deriving
// one — and the claim that the emitted page contains no gated species is checked
// against the built HTML by scripts/check-withheld.ts, which runs in CI where a test
// reading _site/ could not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toChecklistOrder, loadChecklistPositions } from './checklist.ts';
import type { TaxonFamily } from '../types/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// toChecklistOrder — pure, no build required
// ---------------------------------------------------------------------------

const genus = (name: string, slugs: string[]) => ({
  name,
  genus_slug: name.toLowerCase(),
  navImages: [],
  species: slugs.map(slug => ({ slug, name: slug.split('-')[1] ?? slug, common_name: null, navImage: null })),
});
const tree = (families: Array<{ name: string; genera: ReturnType<typeof genus>[] }>): TaxonFamily[] =>
  families.map(f => ({
    name: f.name,
    navImages: [],
    subfamilies: [{ name: null, navImages: [], tribes: [{ name: null, navImages: [], genera: f.genera }] }],
  })) as TaxonFamily[];

test('toChecklistOrder: species inside a genus follow checklist position, not input order', () => {
  const positions = new Map([['aaa-third', 2], ['aaa-first', 0], ['aaa-second', 1]]);
  const out = toChecklistOrder(tree([{ name: 'F', genera: [genus('Aaa', ['aaa-third', 'aaa-first', 'aaa-second'])] }]), positions);
  assert.deepEqual(
    out[0]!.subfamilies[0]!.tribes[0]!.genera[0]!.species.map(s => s.slug),
    ['aaa-first', 'aaa-second', 'aaa-third'],
  );
});

test('toChecklistOrder: a genus takes its position from its earliest species', () => {
  const positions = new Map([['bbb-one', 0], ['aaa-one', 5]]);
  const out = toChecklistOrder(
    tree([{ name: 'F', genera: [genus('Aaa', ['aaa-one']), genus('Bbb', ['bbb-one'])] }]),
    positions,
  );
  assert.deepEqual(out[0]!.subfamilies[0]!.tribes[0]!.genera.map(g => g.name), ['Bbb', 'Aaa']);
});

test('toChecklistOrder: families are ordered too — Pohl sequence, not alphabetical', () => {
  const positions = new Map([['zzz-one', 0], ['aaa-one', 1]]);
  const out = toChecklistOrder(
    tree([{ name: 'Alpha', genera: [genus('Aaa', ['aaa-one'])] }, { name: 'Zeta', genera: [genus('Zzz', ['zzz-one'])] }]),
    positions,
  );
  assert.deepEqual(out.map(f => f.name), ['Zeta', 'Alpha']);
});

test('toChecklistOrder: a node with no position sorts LAST, not first', () => {
  // Infinity, not -1. The gates can remove a species the CSV still lists, and an
  // unknown genus jumping to the top of its family would read as a data error.
  const positions = new Map([['known-one', 0]]);
  const out = toChecklistOrder(
    tree([{ name: 'F', genera: [genus('Unknown', ['unknown-one']), genus('Known', ['known-one'])] }]),
    positions,
  );
  assert.deepEqual(out[0]!.subfamilies[0]!.tribes[0]!.genera.map(g => g.name), ['Known', 'Unknown']);
});

test('toChecklistOrder: does not mutate its input', () => {
  const positions = new Map([['aaa-two', 0], ['aaa-one', 1]]);
  const input = tree([{ name: 'F', genera: [genus('Aaa', ['aaa-one', 'aaa-two'])] }]);
  toChecklistOrder(input, positions);
  assert.deepEqual(
    input[0]!.subfamilies[0]!.tribes[0]!.genera[0]!.species.map(s => s.slug),
    ['aaa-one', 'aaa-two'],
    'taxon.ts is not memoised today, so nothing is shared — but the day it is, an ' +
      'in-place reorder here would silently reorder Browse as well',
  );
});

// ---------------------------------------------------------------------------
// Against the committed artifact
// ---------------------------------------------------------------------------

test('loadChecklistPositions: real data/checklist-order.csv is dense and unique', () => {
  const positions = loadChecklistPositions(resolve(ROOT, 'data/checklist-order.csv'));
  const values = [...positions.values()].sort((a, b) => a - b);
  assert.equal(new Set(values).size, values.length, 'duplicate slug in checklist-order.csv');
  assert.deepEqual(values, values.map((_, i) => i), 'positions must be 0..n-1 with no gaps');
});

test('toChecklistOrder: reordering neither adds nor drops a species', () => {
  // The reorder rebuilds every level with spread objects, so a mistake in the
  // rebuild would silently duplicate or lose species rather than throw. The page
  // renders whatever this returns, so the set has to be identical to the input's —
  // which is also what makes "the gates already ran upstream" a safe thing to rely on.
  const positions = loadChecklistPositions(resolve(ROOT, 'data/checklist-order.csv'));
  const input = tree([
    { name: 'F', genera: [genus('Aaa', ['abagrotis-apposita', 'abagrotis-baueri']), genus('Bbb', ['acopa-perpallida'])] },
    { name: 'G', genera: [genus('Ccc', ['not-in-the-order-file'])] },
  ]);
  const collect = (fams: TaxonFamily[]): string[] =>
    fams.flatMap(f => f.subfamilies.flatMap(s => s.tribes.flatMap(t => t.genera.flatMap(g => g.species.map(sp => sp.slug)))));
  assert.deepEqual(collect(toChecklistOrder(input, positions)).sort(), collect(input).sort());
});
