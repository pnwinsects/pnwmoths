import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TaxonFamily, TaxonGenus, TaxonSubfamily, TaxonTribe, NavImage, SpeciesPhoto } from '../types/index.ts';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../_lib/withheld-families.ts';
import { loadUnpublishedSpecies, isUnpublished } from '../_lib/unpublished-species.ts';
import { formatEpithet, isEpithetQuoted } from '../_lib/format-epithet.ts';

// Narrow projection interfaces for the two DuckDB queries

// Species query projects: family, subfamily, tribe, genus, species, common_name, slug, genus_slug
interface TaxonSpeciesDbRow {
  family: string | null;  // null = unclassified; filtered out by isWithheldOrUnclassified before grouping
  subfamily: string | null;
  tribe: string | null;   // null when the subfamily has no tribal subdivision
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
  thumb_url?: string;
}

/**
 * Load data/species-photos.json (the high-res photo manifest) as a slug→entry
 * map. Missing file soft-fails to `{}`, mirroring src/_data/speciesPhotos.ts.
 */
function loadHighResPhotos(): Record<string, SpeciesPhoto> {
  const path = resolve('data/species-photos.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, SpeciesPhoto>;
}

/**
 * Build a synthetic navImage from a high-res manifest entry for a species that
 * has no images.csv row, so it still gets a browse thumbnail. Prefers a dorsal
 * ('D') specimen. Returns null if the entry has no usable specimen.
 */
function highResNavImage(slug: string, entry: SpeciesPhoto | undefined): NavImageDbRow | null {
  if (!entry?.high_res_available || !entry.specimens?.length) return null;
  const specimen = entry.specimens.find((s) => s.view === 'D') ?? entry.specimens[0]!;
  return {
    species_slug: slug,
    filename: '',
    photographer: entry.photographer ?? '',
    weight: null,
    navigational: null,
    thumb_url: `${specimen.tiles_path}_thumbnail.webp`,
  };
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

interface TaxonTribeBuild extends TaxonTribe {
  genera: TaxonGenusBuild[];
  genusMap?: Record<string, TaxonGenusBuild>;
}

interface TaxonSubfamilyBuild extends TaxonSubfamily {
  tribes: TaxonTribeBuild[];
  tribeMap?: Record<string, TaxonTribeBuild>;
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
      const key = img.thumb_url ?? img.filename;
      if (!seen.has(key)) {
        seen.add(key);
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
        'epithet_quoted': 'VARCHAR',
        'tribe': 'VARCHAR'
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
    SELECT family, subfamily, tribe, genus, species, epithet_quoted, common_name,
      replace(lower(genus || '-' || species), ' ', '-') AS slug,
      lower(replace(genus, ' ', '-')) AS genus_slug
    FROM species
    ORDER BY family, subfamily NULLS LAST, tribe NULLS LAST, genus, species
  `);

  // Browse shows navigational thumbnails only; ventral (underside) shots belong
  // on species-account pages, not in the tree (issue #107). Rows with a null view
  // are kept — they are unclassified, not confirmed ventral.
  const imagesResult = await conn.runAndReadAll(`
    SELECT species_slug, filename, photographer, TRY_CAST(weight AS INTEGER) AS weight, navigational
    FROM images
    WHERE view IS DISTINCT FROM 'ventral'
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

  // Fallback: species with only high-res pipeline photos (in species-photos.json)
  // and no images.csv row get a synthetic navImage so they still show a browse
  // thumbnail (issue #84). images.csv rows always win when both exist.
  const highResPhotos = loadHighResPhotos();
  for (const row of speciesRows) {
    if (bySpeciesSlug[row.slug]?.length) continue;
    const navImg = highResNavImage(row.slug, highResPhotos[row.slug]);
    if (navImg) bySpeciesSlug[row.slug] = [navImg];
  }

  // Build five-level tree: family → subfamily → tribe → genus → species.
  // The tribe level is conditional: species with no tribe are grouped under a
  // single name === null tribe node whose genera render directly under the
  // subfamily (mirrors the name === null "no subfamily" convention).
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
      subfamMap[subfamKey] = { name: row.subfamily ?? null, navImages: [], tribes: [], tribeMap: {} };
    }

    const tribeKey = row.tribe ?? '__none__';
    const tribeMap = subfamMap[subfamKey]!.tribeMap!;
    if (!tribeMap[tribeKey]) {
      tribeMap[tribeKey] = { name: row.tribe ?? null, navImages: [], genera: [], genusMap: {} };
    }

    const gen = row.genus_slug;
    const genusMap = tribeMap[tribeKey]!.genusMap!;
    if (!genusMap[gen]) {
      genusMap[gen] = { name: row.genus, genus_slug: row.genus_slug, navImages: [], species: [] };
    }

    // name is display-only (URLs use slug), so it carries the quoted epithet for
    // provisional names, e.g. Clostera "apicalis" (issue #85).
    const displayName = formatEpithet(row.species, isEpithetQuoted(row.epithet_quoted));
    genusMap[gen]!.species.push({ slug: row.slug, name: displayName, common_name: row.common_name, navImage: null });
  }

  // Collect the first navImage from each genus in order until 4 total. Shared by
  // the tribe, subfamily, and family aggregations (they differ only in the genus
  // stream they walk).
  function firstFourNavImages(genera: TaxonGenusBuild[]): NavImage[] {
    const images: NavImage[] = [];
    for (const genus of genera) {
      if (images.length >= 4) break;
      if (genus.navImages.length > 0) images.push(genus.navImages[0]!);
    }
    return images.slice(0, 4);
  }

  // Convert maps to arrays, assign navImages at each level
  const families = Object.values(familyMap).map(fam => {
    const subfamilies = Object.values(fam.subfamilyMap!).map(subfam => {
      const tribes = Object.values(subfam.tribeMap!).map(tribe => {
        const genera = Object.values(tribe.genusMap!).map(genus => {
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

        // Tribe navImages: first image from each genus in order until 4 total
        tribe.navImages = firstFourNavImages(genera);
        tribe.genera = genera;
        delete tribe.genusMap;
        return tribe;
      });

      // Subfamily navImages: first image from each genus (across all tribes) until 4 total
      subfam.navImages = firstFourNavImages(tribes.flatMap(t => t.genera));
      subfam.tribes = tribes;
      delete subfam.tribeMap;
      return subfam;
    });

    // Family navImages: first image from each genus across all subfamilies until 4 total
    fam.navImages = firstFourNavImages(subfamilies.flatMap(s => s.tribes.flatMap(t => t.genera)));
    fam.subfamilies = subfamilies;
    delete fam.subfamilyMap;
    return fam;
  });

  // TaxonFamilyBuild allows name: string|null (for null-family species groups);
  // TaxonFamily declares name: string — the mismatch is a known schema gap in the data.
  // The runtime shape is correct; this single narrowing cast bridges compile-time vs schema.
  return families as TaxonFamily[];
}
