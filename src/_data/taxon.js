import { DuckDBInstance } from '@duckdb/node-api';

function pickNavImages(speciesSlugs, bySpeciesSlug) {
  const seen = new Set();
  const candidates = [];
  for (const slug of speciesSlugs) {
    for (const img of (bySpeciesSlug[slug] || [])) {
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

export default async function () {
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
        'subfamily': 'VARCHAR'
      }
    )
  `);

  await conn.run(`
    CREATE TABLE images AS
    SELECT * FROM read_csv('data/images.csv',
      header = true,
      nullstr = '',
      columns = {
        'species_slug': 'VARCHAR',
        'filename': 'VARCHAR',
        'photographer': 'VARCHAR',
        'weight': 'INTEGER',
        'license': 'VARCHAR',
        'view': 'VARCHAR',
        'specimen': 'VARCHAR',
        'navigational': 'VARCHAR'
      }
    )
  `);

  const speciesResult = await conn.runAndReadAll(`
    SELECT family, subfamily, genus, species, common_name,
      lower(genus || '-' || species) AS slug,
      lower(replace(genus, ' ', '-')) AS genus_slug
    FROM species
    ORDER BY family, subfamily NULLS LAST, genus, species
  `);

  const imagesResult = await conn.runAndReadAll(`
    SELECT species_slug, filename, photographer, weight, navigational
    FROM images
    ORDER BY species_slug, weight
  `);

  conn.closeSync();

  const speciesRows = speciesResult.getRowObjectsJS();
  const imageRows = imagesResult.getRowObjectsJS();

  // Build bySpeciesSlug image map
  const bySpeciesSlug = {};
  for (const img of imageRows) {
    const slug = img.species_slug;
    if (!bySpeciesSlug[slug]) bySpeciesSlug[slug] = [];
    bySpeciesSlug[slug].push(img);
  }

  // Build four-level tree: family → subfamily → genus → species
  const familyMap = {};

  for (const row of speciesRows) {
    const fam = row.family;
    if (!familyMap[fam]) familyMap[fam] = { name: fam, navImages: [], subfamilyMap: {} };

    const subfamKey = row.subfamily ?? '__none__';
    const subfamMap = familyMap[fam].subfamilyMap;
    if (!subfamMap[subfamKey]) {
      subfamMap[subfamKey] = { name: row.subfamily ?? null, navImages: [], genusMap: {} };
    }

    const gen = row.genus_slug;
    const genusMap = subfamMap[subfamKey].genusMap;
    if (!genusMap[gen]) {
      genusMap[gen] = { name: row.genus, genus_slug: row.genus_slug, navImages: [], species: [] };
    }

    genusMap[gen].species.push({ slug: row.slug, name: row.species, common_name: row.common_name, navImage: null });
  }

  // Convert maps to arrays, assign navImages at each level
  const families = Object.values(familyMap).map(fam => {
    const subfamilies = Object.values(fam.subfamilyMap).map(subfam => {
      const genera = Object.values(subfam.genusMap).map(genus => {
        const slugs = genus.species.map(s => s.slug);
        genus.navImages = pickNavImages(slugs, bySpeciesSlug);
        genus.species = genus.species.map(sp => {
          const imgs = (bySpeciesSlug[sp.slug] || []).slice();
          imgs.sort((a, b) => {
            const navA = a.navigational === 'true' ? 0 : 1;
            const navB = b.navigational === 'true' ? 0 : 1;
            if (navA !== navB) return navA - navB;
            return (a.weight ?? 999) - (b.weight ?? 999);
          });
          return { ...sp, navImage: imgs[0] ?? null };
        });
        return genus;
      });

      // Subfamily navImages: first image from each genus in order until 4 total
      const subfamImages = [];
      for (const genus of genera) {
        if (subfamImages.length >= 4) break;
        if (genus.navImages.length > 0) {
          subfamImages.push(genus.navImages[0]);
        }
      }
      subfam.navImages = subfamImages.slice(0, 4);
      subfam.genera = genera;
      delete subfam.genusMap;
      return subfam;
    });

    // Family navImages: first image from each genus across all subfamilies until 4 total
    const famImages = [];
    for (const subfam of subfamilies) {
      for (const genus of subfam.genera) {
        if (famImages.length >= 4) break;
        if (genus.navImages.length > 0) {
          famImages.push(genus.navImages[0]);
        }
      }
      if (famImages.length >= 4) break;
    }
    fam.navImages = famImages.slice(0, 4);
    fam.subfamilies = subfamilies;
    delete fam.subfamilyMap;
    return fam;
  });

  return families;
}
