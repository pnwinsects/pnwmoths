// Source: profiled against production data 2026-06-09
// See DATA-PROFILE.md for the null-distribution tables that justify each .nullable()
// Rule: use z.nullable() (not z.optional()) — hyparquet writes null, not undefined
// Rule: no enum, no namespace, no parameter-properties (TS-03 / Node 24 type-stripping)
import { z } from 'zod';

// --- OccurrenceRecord ---
// Describes what hyparquet produces from records.parquet
// records.csv read WITHOUT nullstr='' in build-data.js — DuckDB treats blank cells as NULL
// county is 100% null in production data (county enrichment not yet present)
export const OccurrenceRecordSchema = z.object({
  species_slug:  z.string(),
  record_type:   z.string(),        // 'specimen' | 'photograph' | 'literature' | 'sight_field_notes'
  latitude:      z.number(),
  longitude:     z.number(),
  state:         z.string(),        // 'WA' | 'OR' | 'BC' | 'ID' | 'AB' | 'MT'
  county:        z.string().nullable(),   // 100% null in current production data
  locality:      z.string().nullable(),
  elevation_ft:  z.number().int().nullable(),
  year:          z.number().int().nullable(),
  month:         z.number().int().nullable(),
  day:           z.number().int().nullable(),
  collector:     z.string().nullable(),
  collection:    z.string().nullable(),
  notes:         z.string().nullable(),
});
export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;

// --- Species ---
// Describes a row from DuckDB read of species.csv (with nullstr='')
// id comes back as number from DuckDB INTEGER
export const SpeciesSchema = z.object({
  id:              z.number().int(),       // DuckDB INTEGER
  genus:           z.string(),
  species:         z.string(),
  common_name:     z.string().nullable(),  // 68% null
  noc_id:          z.string().nullable(),  // 1.8% null
  authority:       z.string().nullable(),  // 3.5% null
  family:          z.string().nullable(),  // 2.8% null (logically required but data has nulls)
  similar_species: z.string().nullable(),  // 26.9% null; pipe-delimited slugs when present
  subfamily:       z.string().nullable(),  // 12.4% null
});
export type Species = z.infer<typeof SpeciesSchema>;

// --- GlossaryWord ---
// Describes a row from data/glossary.csv (with nullstr='')
export const GlossaryWordSchema = z.object({
  term:           z.string(),
  definition:     z.string(),
  image_filename: z.string().nullable(),   // 69.1% empty → null
  photographer:   z.string().nullable(),   // 100% empty → null
});
export type GlossaryWord = z.infer<typeof GlossaryWordSchema>;

// --- SpeciesImage ---
// Images from images.csv — ALL columns are VARCHAR (no coercion at DuckDB read time)
// taxon.js reads with all-VARCHAR columns; weight coerced via TRY_CAST separately
// navigational and subspecies are 100% empty → null under nullstr=''
export const SpeciesImageSchema = z.object({
  species_slug:  z.string(),
  filename:      z.string(),
  photographer:  z.string(),
  weight:        z.string(),            // VARCHAR; coerced to number in taxon.js via TRY_CAST
  license:       z.string(),
  view:          z.string().nullable(),
  specimen:      z.string().nullable(),
  navigational:  z.string().nullable(), // 100% empty; compared as string: navigational === 'true'
  locality:      z.string().nullable(),
  state:         z.string().nullable(),
  latitude:      z.string().nullable(), // VARCHAR, not DOUBLE (images.csv all-VARCHAR)
  longitude:     z.string().nullable(),
  elevation_ft:  z.string().nullable(),
  year:          z.string().nullable(),
  month:         z.string().nullable(),
  day:           z.string().nullable(),
  collector:     z.string().nullable(),
  subspecies:    z.string().nullable(), // 100% empty
});
export type SpeciesImage = z.infer<typeof SpeciesImageSchema>;

// --- SpeciesPhoto / Specimen ---
// Describes one entry in data/species-photos.json (object keyed by slug)
// Built by scripts/generate-species-photos.js from the manifest
export const SpecimenSchema = z.object({
  specimen_id: z.string(),
  view:        z.string(),  // 'D' or 'V'
  tiles_path:  z.string(),
});
export type Specimen = z.infer<typeof SpecimenSchema>;

export const SpeciesPhotoSchema = z.object({
  high_res_available: z.boolean(),
  specimens:          z.array(SpecimenSchema),
  photographer:       z.string(),
  license:            z.string(),
});
export type SpeciesPhoto = z.infer<typeof SpeciesPhotoSchema>;

// --- SpeciesState ---
// One element of the species-states.json flat array
// Validated at browser load time (Phase 37) as an array of these
export const SpeciesStateSchema = z.object({
  species_slug: z.string(),
  state:        z.string(),
});
export type SpeciesState = z.infer<typeof SpeciesStateSchema>;

// --- TaxonNode ---
// Describes the taxon tree built by src/_data/taxon.js
// Four-level tree: family → subfamilies → genera → species
// NavImage columns from taxon.js images query:
//   species_slug, filename, photographer, TRY_CAST(weight AS INTEGER) AS weight, navigational
// weight comes back as number|null (TRY_CAST returns null on failure); navigational as string|null
export const NavImageSchema = z.object({
  filename:     z.string(),
  photographer: z.string(),
  weight:       z.number().int().nullable(),
  navigational: z.string().nullable(),
  species_slug: z.string(),
});
export type NavImage = z.infer<typeof NavImageSchema>;

export const TaxonSpeciesSchema = z.object({
  slug:        z.string(),
  name:        z.string(),
  common_name: z.string().nullable(),
  navImage:    NavImageSchema.nullable(),
});
export type TaxonSpecies = z.infer<typeof TaxonSpeciesSchema>;

export const TaxonGenusSchema = z.object({
  name:       z.string(),
  genus_slug: z.string(),
  navImages:  z.array(NavImageSchema),
  species:    z.array(TaxonSpeciesSchema),
});
export type TaxonGenus = z.infer<typeof TaxonGenusSchema>;

export const TaxonSubfamilySchema = z.object({
  name:      z.string().nullable(),   // null when no subfamily grouping
  navImages: z.array(NavImageSchema),
  genera:    z.array(TaxonGenusSchema),
});
export type TaxonSubfamily = z.infer<typeof TaxonSubfamilySchema>;

export const TaxonFamilySchema = z.object({
  name:        z.string(),
  navImages:   z.array(NavImageSchema),
  subfamilies: z.array(TaxonSubfamilySchema),
});
// TaxonFamily is the root node; the taxon tree is a TaxonFamily[]
export type TaxonFamily = z.infer<typeof TaxonFamilySchema>;
