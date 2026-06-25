import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import type { Character, KeySpecies } from '../types/index.ts';

// KeySpeciesWithFamily extends KeySpecies with a family field joined from species.csv
export interface KeySpeciesWithFamily extends KeySpecies {
  family: string | null;
}

export interface KeyMatrixData {
  characters: Character[];
  species: KeySpeciesWithFamily[];
  familyGroups: Array<{
    family: string | null;
    genera: Array<{
      genus: string;
      species: KeySpeciesWithFamily[];
    }>;
  }>;
}

// Raw shape of data/key-matrix.json — only characters and species are used;
// matrix and meta are intentionally excluded from the return value (page-weight guard).
interface RawKeyMatrix {
  characters: Character[];
  species: KeySpecies[];
}

// CSV row shape from species.csv
interface SpeciesCsvRow {
  genus: string;
  species: string;
  family: string;
}

export default function (): KeyMatrixData {
  // Read and parse key-matrix.json — do NOT spread matrix/meta into return value
  const raw = JSON.parse(
    readFileSync(resolve('data/key-matrix.json'), 'utf-8')
  ) as RawKeyMatrix;

  // Read and parse species.csv to get family per species
  const speciesRows = parseCsv(
    readFileSync(resolve('data/species.csv')),
    { columns: true, skip_empty_lines: true }
  ) as SpeciesCsvRow[];

  // Build slug → family lookup: key is "${genus.toLowerCase()}-${species.toLowerCase()}"
  const familyBySlug = new Map<string, string | null>(
    speciesRows.map((r) => [
      `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`,
      r.family ?? null,
    ])
  );

  // Attach family to each KeySpecies
  const species: KeySpeciesWithFamily[] = raw.species.map((sp) => ({
    ...sp,
    family: familyBySlug.get(sp.slug) ?? null,
  }));

  // Build familyGroups: group by family (alphabetical, null family at end),
  // then within each family group by genus (alphabetical).
  const familyMap = new Map<string | null, Map<string, KeySpeciesWithFamily[]>>();

  for (const sp of species) {
    const familyKey = sp.family;
    if (!familyMap.has(familyKey)) {
      familyMap.set(familyKey, new Map());
    }
    const genusMap = familyMap.get(familyKey)!;
    if (!genusMap.has(sp.genus)) {
      genusMap.set(sp.genus, []);
    }
    genusMap.get(sp.genus)!.push(sp);
  }

  // Sort families: non-null families alphabetically, then null family group at end
  const nonNullFamilies = [...familyMap.keys()]
    .filter((f): f is string => f !== null)
    .sort((a, b) => a.localeCompare(b));
  const familyOrder: Array<string | null> = nonNullFamilies;
  if (familyMap.has(null)) {
    familyOrder.push(null);
  }

  const familyGroups = familyOrder.map((family) => {
    const genusMap = familyMap.get(family)!;
    const sortedGenera = [...genusMap.keys()].sort((a, b) => a.localeCompare(b));
    return {
      family,
      genera: sortedGenera.map((genus) => ({
        genus,
        species: genusMap.get(genus)!,
      })),
    };
  });

  return {
    characters: raw.characters,
    species,
    familyGroups,
  };
}
