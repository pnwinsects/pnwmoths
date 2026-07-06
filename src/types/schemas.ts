// Source: profiled against production data 2026-06-09
// See DATA-PROFILE.md for the null-distribution tables that justify each nullable field
// Rule: use z.nullable(z.string()) (not z.optional()) — hyparquet writes null, not undefined
// Rule: no enum, no namespace, no parameter-properties (TS-03 / Node 24 type-stripping)
// Source: verified against node_modules/zod/v4/mini/schemas.js
import * as z from 'zod/mini';

// --- OccurrenceRecord ---
// Describes what hyparquet produces from records.parquet
// records.csv read WITHOUT nullstr='' in build-data.js — DuckDB treats blank cells as NULL
// county and district_id are populated for ~96%+ of records following the Phase 44
// legacy-county re-join (see data/legacy-rejoin-report.csv); the remainder is blank,
// pending Phase 46's coordinate-based fill
export const OccurrenceRecordSchema = z.object({
  species_slug:  z.string(),
  record_type:   z.string(),        // 'specimen' | 'photograph' | 'literature' | 'sight_field_notes'
  latitude:      z.number(),
  longitude:     z.number(),
  state:         z.string(),        // 'WA' | 'OR' | 'BC' | 'ID' | 'AB' | 'MT'
  county:        z.nullable(z.string()),   // ~96%+ filled following the Phase 44 legacy re-join
  locality:      z.nullable(z.string()),
  elevation_ft:  z.nullable(z.number()),   // int constraint dropped (not in zod/mini); enforced by DuckDB INT32
  year:          z.nullable(z.number()),   // int constraint dropped (not in zod/mini); enforced by DuckDB INT32
  month:         z.nullable(z.number()),   // int constraint dropped (not in zod/mini); enforced by DuckDB INT32
  day:           z.nullable(z.number()),   // int constraint dropped (not in zod/mini); enforced by DuckDB INT32
  collector:     z.nullable(z.string()),
  collection:    z.nullable(z.string()),
  notes:         z.nullable(z.string()),
  // Stable district ID (US Census GEOID / BC StatCan CDUID), prefixed "US:"/"CA:", zero-padded.
  // Never z.number() — leading zeros (e.g. US:05003) must survive intact (D-02/T-44-09).
  district_id:   z.nullable(z.string()),
});
export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;

// --- Species ---
// Describes a row from DuckDB read of species.csv (with nullstr='')
// id comes back as number from DuckDB INTEGER
export const SpeciesSchema = z.object({
  id:              z.number(),             // DuckDB INTEGER; int constraint dropped (not in zod/mini); enforced by DuckDB
  genus:           z.string(),
  species:         z.string(),
  common_name:     z.nullable(z.string()),  // 68% null
  noc_id:          z.nullable(z.string()),  // 1.8% null
  authority:       z.nullable(z.string()),  // 3.5% null
  family:          z.nullable(z.string()),  // 2.8% null (logically required but data has nulls)
  similar_species: z.nullable(z.string()),  // 26.9% null; pipe-delimited slugs when present
  subfamily:       z.nullable(z.string()),  // 12.4% null
});
export type Species = z.infer<typeof SpeciesSchema>;

// --- GlossaryWord ---
// Describes a row from data/glossary.csv (with nullstr='')
export const GlossaryWordSchema = z.object({
  term:           z.string(),
  definition:     z.string(),
  image_filename: z.nullable(z.string()),   // 69.1% empty → null
  photographer:   z.nullable(z.string()),   // 100% empty → null
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
  view:          z.nullable(z.string()),
  specimen:      z.nullable(z.string()),
  navigational:  z.nullable(z.string()), // 100% empty; compared as string: navigational === 'true'
  locality:      z.nullable(z.string()),
  state:         z.nullable(z.string()),
  latitude:      z.nullable(z.string()), // VARCHAR, not DOUBLE (images.csv all-VARCHAR)
  longitude:     z.nullable(z.string()),
  elevation_ft:  z.nullable(z.string()),
  year:          z.nullable(z.string()),
  month:         z.nullable(z.string()),
  day:           z.nullable(z.string()),
  collector:     z.nullable(z.string()),
  subspecies:    z.nullable(z.string()), // 100% empty
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

// --- SpeciesDistrict ---
// One element of the species-districts.json flat array
// Validated at browser load time (Phase 48) as an array of these
export const SpeciesDistrictSchema = z.object({
  species_slug: z.string(),
  state:        z.string(),
  county:       z.string(),
});
export type SpeciesDistrict = z.infer<typeof SpeciesDistrictSchema>;

// --- TaxonNode ---
// Describes the taxon tree built by src/_data/taxon.js
// Four-level tree: family → subfamilies → genera → species
// NavImage columns from taxon.js images query:
//   species_slug, filename, photographer, TRY_CAST(weight AS INTEGER) AS weight, navigational
// weight comes back as number|null (TRY_CAST returns null on failure); navigational as string|null
export const NavImageSchema = z.object({
  filename:     z.string(),
  photographer: z.string(),
  weight:       z.nullable(z.number()),    // int constraint dropped (not in zod/mini); enforced by DuckDB INT32
  navigational: z.nullable(z.string()),
  species_slug: z.string(),
  // CDN-relative path (no leading slash, no query) to a prebuilt thumbnail, used
  // for species that have only high-res pipeline photos and no images.csv row.
  // When present, the browser uses it verbatim instead of `${species_slug}/${filename}`.
  thumb_url:    z.optional(z.string()),
});
export type NavImage = z.infer<typeof NavImageSchema>;

export const TaxonSpeciesSchema = z.object({
  slug:        z.string(),
  name:        z.string(),
  common_name: z.nullable(z.string()),
  navImage:    z.nullable(NavImageSchema),
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
  name:      z.nullable(z.string()),   // null when no subfamily grouping
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

// --- Key Matrix (Phase 39 + 40) ---
// Validated at build time by KeyMatrixSchema.parse(); guarded at browser load by validateKeyMatrix.
export const CharacterSchema = z.object({
  id:             z.number(),
  category:       z.string(),
  subcategory:    z.nullable(z.string()),   // null for 3-part (2-colon) labels
  question:       z.string(),
  state:          z.string(),
  image_filename: z.nullable(z.string()),   // null until Phase 43 curator pass
  alt_text:       z.nullable(z.string()),   // Phase 43; null → render derives alt from state
});
export type Character = z.infer<typeof CharacterSchema>;

export const KeySpeciesSchema = z.object({
  slug:        z.string(),
  genus:       z.string(),
  epithet:     z.string(),
  common_name: z.nullable(z.string()),
  nav_image:   z.nullable(z.string()),
});
export type KeySpecies = z.infer<typeof KeySpeciesSchema>;

// KeyMatrixMetaSchema (Phase 40) — build provenance; also enables "showing N of 1,228" UI affordance
export const KeyMatrixMetaSchema = z.object({
  totalKeySpecies:  z.number(),    // 1,228 — all species in key.csv including unmatched
  matchedSpecies:   z.number(),    // 1,193 — species resolved to site slugs (in matrix)
  unmatchedSpecies: z.number(),    // 35 = 1,228 − 1,193
  generatedAt:      z.string(),    // ISO 8601 timestamp from build-key.ts
});
export type KeyMatrixMeta = z.infer<typeof KeyMatrixMetaSchema>;

// matrix: 237 base64 strings, each encoding a Uint8Array bitset over matched species (LSB-first)
// length === characters.length; each string is base64; bit i set iff species[i] scores 1
export const KeyMatrixSchema = z.object({
  meta:       KeyMatrixMetaSchema,             // NEW Phase 40 — build provenance + species counts
  characters: z.array(CharacterSchema),
  species:    z.array(KeySpeciesSchema),
  matrix:     z.array(z.string()),    // 237 base64 strings; length === characters.length
});
export type KeyMatrix = z.infer<typeof KeyMatrixSchema>;
