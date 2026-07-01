import { DuckDBInstance } from '@duckdb/node-api';
import type { TaxonFamily, TaxonGenus, TaxonSubfamily, NavImage } from '../types/index.ts';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../_lib/withheld-families.ts';
import { loadUnpublishedSpecies, isUnpublished } from '../_lib/unpublished-species.ts';
import { formatEpithet, isEpithetQuoted } from '../_lib/format-epithet.ts';

// Narrow projection interfaces for the two DuckDB queries

// Species query projects: family, subfamily, genus, species, common_name, slug, genus_slug
interface TaxonSpeciesDbRow {
  family: string | null;  // null = unclassified; filtered out by isWithheldOrUnclassified before grouping
  subfamily: string | null;
  genus: string;
  species: string;
  epithet_quoted: string | null;
  common_name: string | null;
  slug: string;
  genus_slug: string;
}

function isTaxonSpeciesDbRow(obj: unknown): obj is TaxonSpeciesDbRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    (typeof r['family'] === 'string' || r['family'] === null) &&
    typeof r['genus'] === 'string' &&
    typeof r['species'] === 'string' &&
    typeof r['slug'] === 'string' &&
    typeof r['genus_slug'] === 'string'
  );
}

// Images query projects: species_slug, filename, photographer, weight (TRY_CAST INTEGER), navigational
interface NavImageDbRow {
  species_slug: string;
  filename: string;
  photographer: string;
  weight: number | null;
  navigational: string | null;
}

function isNavImageDbRow(obj: unknown): obj is NavImageDbRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r['species_slug'] === 'string' &&
    typeof r['filename'] === 'string' &&
    typeof r['photographer'] === 'string'
  );
}

// Intermediate build types that allow the map fields that will be deleted
// TaxonFamilyBuild allows name: string | null to handle the 2.8% of species with null family
// (the Zod schema says string but the data has nulls; runtime behavior preserved from taxon.js)
interface TaxonGenusBuild extends TaxonGenus {
  // no extra fields beyond TaxonGenus
}

interface TaxonSubfamilyBuild extends TaxonSubfamily {
  genera: TaxonGenusBuild[];
  genusMap?: Record<string, TaxonGenusBuild>;
}

interface TaxonFamilyBuild {
  name: string | null;
  navImages: NavImage[];
  subfamilies: TaxonSubfamilyBuild[];
  subfamilyMap?: Record<string, TaxonSubfamilyBuild>;
}

function pickNavImages(speciesSlugs: string[], bySpeciesSlug: Record<string, NavImageDbRow[]>): NavImage[] {
  const seen = new Set<string>();
  const candidates: NavImage[] = [];
  for (const slug of speciesSlugs) {
    for (const img of (bySpeciesSlug[slug] ?? [])) {
      if (!seen.has(img.filename)) {
        seen.add(img.filename);
        candidates.push({ ...img, species_slug: slug });
      }
    }
  }
  candidates.sort((a, b) => {
    const navA = a.navigational === 'true' ? 0 : 1;
    const navB = b.navigational === 'true' ? 0 : 1;
    if (navA !== navB) return navA - navB;
    return (a.weight ?? 999) - (b.weight ?? 999);
  });
  return candidates.slice(0, 4);
}

export default async function (): Promise<TaxonFamily[]> {
  const withheld = loadWithheldFamilies();
  const unpublished = loadUnpublishedSpecies();
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv',
      header = true,
      nullstr = '',
      columns = {
        'id': 'INTEGER',
        'genus': 'VARCHAR',
        'species': 'VARCHAR',
        'common_name': 'VARCHAR',
        'noc_id': 'VARCHAR',
        'authority': 'VARCHAR',
        'family': 'VARCHAR',
        'similar_species': 'VARCHAR',
        'subfamily': 'VARCHAR',
        'epithet_quoted': 'VARCHAR'
      }
    )
  `);

  await conn.run(`
    CREATE TABLE images AS
    SELECT * FROM read_csv('data/images.csv',
      header = true,
      nullstr = '',
      delim = ',',
      quote = '"',
      escape = '"',
      auto_detect = false,
      columns = {
        'species_slug': 'VARCHAR',
        'filename': 'VARCHAR',
        'photographer': 'VARCHAR',
        'weight': 'VARCHAR',
        'license': 'VARCHAR',
        'view': 'VARCHAR',
        'specimen': 'VARCHAR',
        'navigational': 'VARCHAR',
        'locality': 'VARCHAR',
        'state': 'VARCHAR',
        'latitude': 'VARCHAR',
        'longitude': 'VARCHAR',
        'elevation_ft': 'VARCHAR',
        'year': 'VARCHAR',
        'month': 'VARCHAR',
        'day': 'VARCHAR',
        'collector': 'VARCHAR',
        'subspecies': 'VARCHAR'
      }
    )
  `);

  const speciesResult = await conn.runAndReadAll(`
    SELECT family, subfamily, genus, species, epithet_quoted, common_name,
      lower(genus || '-' || species) AS slug,
      lower(replace(genus, ' ', '-')) AS genus_slug
    FROM species
    ORDER BY family, subfamily NULLS LAST, genus, species
  `);

  const imagesResult = await conn.runAndReadAll(`
    SELECT species_slug, filename, photographer, TRY_CAST(weight AS INTEGER) AS weight, navigational
    FROM images
    ORDER BY species_slug, TRY_CAST(weight AS INTEGER)
  `);

  conn.closeSync();

  const speciesRowsRaw = speciesResult.getRowObjectsJS();
  const speciesRows: TaxonSpeciesDbRow[] = [];
  for (const row of speciesRowsRaw) {
    if (
      isTaxonSpeciesDbRow(row) &&
      !isWithheldOrUnclassified(row.family, withheld) &&
      !isUnpublished(row.slug, unpublished)
    ) speciesRows.push(row);
  }

  const imageRowsRaw = imagesResult.getRowObjectsJS();
  const imageRows: NavImageDbRow[] = [];
  for (const row of imageRowsRaw) {
    if (isNavImageDbRow(row)) imageRows.push(row);
  }

  // Build bySpeciesSlug image map
  const bySpeciesSlug: Record<string, NavImageDbRow[]> = {};
  for (const img of imageRows) {
    const slug = img.species_slug;
    if (!bySpeciesSlug[slug]) bySpeciesSlug[slug] = [];
    bySpeciesSlug[slug]!.push(img);
  }

  // Build four-level tree: family → subfamily → genus → species
  const familyMap: Record<string, TaxonFamilyBuild> = {};

  for (const row of speciesRows) {
    // Unclassified (blank-family) species are filtered out upstream by
    // isWithheldOrUnclassified, so row.family should be non-null here. The
    // ?? 'Unclassified' coalesce is defense-in-depth: if the embargo gate is
    // ever lifted, a blank family renders as a labelled "Unclassified" group
    // rather than an empty heading (ISSUE-62).
    const famKey = row.family ?? 'Unclassified';
    if (!familyMap[famKey]) {
      familyMap[famKey] = { name: famKey, navImages: [], subfamilies: [], subfamilyMap: {} };
    }

    const subfamKey = row.subfamily ?? '__none__';
    const subfamMap = familyMap[famKey]!.subfamilyMap!;
    if (!subfamMap[subfamKey]) {
      subfamMap[subfamKey] = { name: row.subfamily ?? null, navImages: [], genera: [], genusMap: {} };
    }

    const gen = row.genus_slug;
    const genusMap = subfamMap[subfamKey]!.genusMap!;
    if (!genusMap[gen]) {
      genusMap[gen] = { name: row.genus, genus_slug: row.genus_slug, navImages: [], species: [] };
    }

    // name is display-only (URLs use slug), so it carries the quoted epithet for
    // provisional names, e.g. Clostera "apicalis" (issue #85).
    const displayName = formatEpithet(row.species, isEpithetQuoted(row.epithet_quoted));
    genusMap[gen]!.species.push({ slug: row.slug, name: displayName, common_name: row.common_name, navImage: null });
  }

  // Convert maps to arrays, assign navImages at each level
  const families = Object.values(familyMap).map(fam => {
    const subfamilies = Object.values(fam.subfamilyMap!).map(subfam => {
      const genera = Object.values(subfam.genusMap!).map(genus => {
        const slugs = genus.species.map(s => s.slug);
        genus.navImages = pickNavImages(slugs, bySpeciesSlug);
        genus.species = genus.species.map(sp => {
          const imgs = (bySpeciesSlug[sp.slug] ?? []).slice();
          imgs.sort((a, b) => {
            const navA = a.navigational === 'true' ? 0 : 1;
            const navB = b.navigational === 'true' ? 0 : 1;
            if (navA !== navB) return navA - navB;
            return (a.weight ?? 999) - (b.weight ?? 999);
          });
          const navImage = imgs[0] ?? null;
          return { ...sp, navImage };
        });
        return genus;
      });

      // Subfamily navImages: first image from each genus in order until 4 total
      const subfamImages: NavImage[] = [];
      for (const genus of genera) {
        if (subfamImages.length >= 4) break;
        if (genus.navImages.length > 0) {
          subfamImages.push(genus.navImages[0]!);
        }
      }
      subfam.navImages = subfamImages.slice(0, 4);
      subfam.genera = genera;
      delete subfam.genusMap;
      return subfam;
    });

    // Family navImages: first image from each genus across all subfamilies until 4 total
    const famImages: NavImage[] = [];
    for (const subfam of subfamilies) {
      for (const genus of subfam.genera) {
        if (famImages.length >= 4) break;
        if (genus.navImages.length > 0) {
          famImages.push(genus.navImages[0]!);
        }
      }
      if (famImages.length >= 4) break;
    }
    fam.navImages = famImages.slice(0, 4);
    fam.subfamilies = subfamilies;
    delete fam.subfamilyMap;
    return fam;
  });

  // TaxonFamilyBuild allows name: string|null (for null-family species groups);
  // TaxonFamily declares name: string — the mismatch is a known schema gap in the data.
  // The runtime shape is correct; this single narrowing cast bridges compile-time vs schema.
  return families as TaxonFamily[];
}
