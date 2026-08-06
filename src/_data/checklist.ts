/**
 * The taxonomy in CHECKLIST order — the sequence professional users expect, rather
 * than the alphabetical one Browse uses.
 *
 * This deliberately REUSES `taxon.ts`'s builder instead of writing its own DuckDB
 * query. That builder applies both content gates (`isWithheldOrUnclassified`,
 * `isUnpublished`), and a second query would be a second place for those gates to be
 * forgotten. #275 is what that looks like when it happens: a build step that read
 * `data/` directly, published what the gates had excluded, and nothing noticed for a
 * year. Reordering a gated tree cannot leak; re-deriving one can.
 *
 * `taxon.ts` is not memoised, so this runs its query a second time — measured at
 * ~50 ms against a multi-minute build, which is a fair price for having exactly one
 * definition of what the site is allowed to show. The tree it returns is freshly
 * built and not shared with Browse; the non-mutation test below is defensive rather
 * than load-bearing, and would matter the day someone does memoise it.
 *
 * The order comes from `data/checklist-order.csv`, whose ROW ORDER is the data —
 * there is no ordinal column to sort on (see [ADR 0030]). Position in that file is
 * defined only for species, so the higher ranks take their position from their
 * first species, which is exactly what makes one sort key sufficient: every genus
 * we hold occupies an unbroken block of MPG rows, asserted by
 * `scripts/build-checklist-order.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import buildTaxon from './taxon.ts';
import type { TaxonFamily, TaxonGenus, TaxonSubfamily, TaxonTribe } from '../types/index.ts';

interface ChecklistOrderRow {
  species_slug: string;
  mpg_p_no: string;
  matched_via: string;
}

/**
 * Slug → position, from row order.
 *
 * Exported for the test that pins the page against the artifact.
 */
export function loadChecklistPositions(
  csvPath: string = resolve('data/checklist-order.csv'),
): Map<string, number> {
  const rows = parse(readFileSync(csvPath), {
    columns: true,
    skip_empty_lines: true,
  }) as ChecklistOrderRow[];

  const positions = new Map<string, number>();
  rows.forEach((row, index) => positions.set(row.species_slug, index));
  return positions;
}

/**
 * A node's position is its earliest species' position.
 *
 * A node whose species are all absent from the checklist sorts last rather than
 * first: `Infinity`, not `-1`. The distinction matters because the gates remove
 * species from the tree that `checklist-order.csv` still lists, and an unknown
 * genus jumping to the top of its family would look like a data error to the reader
 * while being invisible to a sort test.
 */
function positionOf(slugs: string[], positions: Map<string, number>): number {
  let min = Infinity;
  for (const slug of slugs) {
    const p = positions.get(slug);
    if (p !== undefined && p < min) min = p;
  }
  return min;
}

function genusSlugs(genus: TaxonGenus): string[] {
  return genus.species.map(s => s.slug);
}

/** Stable ascending sort by checklist position; ties keep their input order. */
function byPosition<T>(nodes: T[], slugsOf: (node: T) => string[], positions: Map<string, number>): T[] {
  return nodes
    .map((node, index) => ({ node, index, pos: positionOf(slugsOf(node), positions) }))
    .sort((a, b) => (a.pos - b.pos) || (a.index - b.index))
    .map(entry => entry.node);
}

/**
 * Reorder a gated taxon tree into checklist sequence, at every rank.
 *
 * Pure and exported so the ordering can be tested without a DuckDB build.
 */
export function toChecklistOrder(
  families: TaxonFamily[],
  positions: Map<string, number>,
): TaxonFamily[] {
  const orderedGenera = (genera: TaxonGenus[]): TaxonGenus[] =>
    byPosition(genera, genusSlugs, positions).map(genus => ({
      ...genus,
      species: byPosition(genus.species, sp => [sp.slug], positions),
    }));

  const orderedTribes = (tribes: TaxonTribe[]): TaxonTribe[] =>
    byPosition(
      tribes.map(tribe => ({ ...tribe, genera: orderedGenera(tribe.genera) })),
      tribe => tribe.genera.flatMap(genusSlugs),
      positions,
    );

  const orderedSubfamilies = (subfamilies: TaxonSubfamily[]): TaxonSubfamily[] =>
    byPosition(
      subfamilies.map(subfam => ({ ...subfam, tribes: orderedTribes(subfam.tribes) })),
      subfam => subfam.tribes.flatMap(t => t.genera.flatMap(genusSlugs)),
      positions,
    );

  return byPosition(
    families.map(family => ({ ...family, subfamilies: orderedSubfamilies(family.subfamilies) })),
    family => family.subfamilies.flatMap(s => s.tribes.flatMap(t => t.genera.flatMap(genusSlugs))),
    positions,
  );
}

export default async function (): Promise<TaxonFamily[]> {
  return toChecklistOrder(await buildTaxon(), loadChecklistPositions());
}
