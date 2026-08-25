import { readFileSync } from "fs";

// Local interface for the emitted image row shape.
// Note: photographer is string|null here (emitted via `row.photographer || null`),
// which diverges from the non-null SpeciesImage.photographer schema field.
// Numeric fields (weight, latitude, etc.) are number|null via toInt/toFloat.
interface ImageRow {
  species_slug: string;
  filename: string;
  photographer: string | null;
  weight: number | null;
  license: string | null;
  view: string | null;
  specimen: string | null;
  locality: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_ft: number | null;
  year: number | null;
  month: number | null;
  day: number | null;
  collector: string | null;
  subspecies: string | null;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trimEnd().split("\n");
  const headers = lines[0]?.split(",") ?? [];
  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    values.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function toInt(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function toFloat(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export default function (): Record<string, ImageRow[]> {
  const rows: Record<string, string>[] = parseCSV(readFileSync("data/images.csv", "utf8"));
  const bySpecies: Record<string, ImageRow[]> = {};
  for (const row of rows) {
    const slug = row['species_slug'] ?? '';
    if (!bySpecies[slug]) bySpecies[slug] = [];
    bySpecies[slug].push({
      species_slug: slug,
      filename: row['filename'] ?? '',
      photographer: row['photographer'] || null,
      weight: toInt(row['weight'] ?? ''),
      license: row['license'] || null,
      view: row['view'] || null,
      specimen: row['specimen'] || null,
      locality: row['locality'] || null,
      state: row['state'] || null,
      latitude: toFloat(row['latitude'] ?? ''),
      longitude: toFloat(row['longitude'] ?? ''),
      elevation_ft: toInt(row['elevation_ft'] ?? ''),
      year: toInt(row['year'] ?? ''),
      month: toInt(row['month'] ?? ''),
      day: toInt(row['day'] ?? ''),
      collector: row['collector'] || null,
      subspecies: row['subspecies'] || null,
    });
  }
  // Sort each species' images by weight. This ordering IS the account carousel, the
  // similar-species thumbnail ([0]) and the share-image fallback ([0]) — see
  // docs/reference/photo-display-rules.md.
  for (const slug of Object.keys(bySpecies)) {
    bySpecies[slug]?.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
  }
  return bySpecies;
}
