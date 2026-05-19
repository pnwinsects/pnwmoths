import { readFileSync } from "fs";

function parseCSV(text) {
  const lines = text.trimEnd().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = [];
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
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""] ));
  });
}

function toInt(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function toFloat(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export default function () {
  const rows = parseCSV(readFileSync("data/images.csv", "utf8"));
  const bySpecies = {};
  for (const row of rows) {
    const slug = row.species_slug;
    if (!bySpecies[slug]) bySpecies[slug] = [];
    bySpecies[slug].push({
      species_slug: slug,
      filename: row.filename,
      photographer: row.photographer || null,
      weight: toInt(row.weight),
      license: row.license || null,
      view: row.view || null,
      specimen: row.specimen || null,
      navigational: row.navigational || null,
      locality: row.locality || null,
      state: row.state || null,
      latitude: toFloat(row.latitude),
      longitude: toFloat(row.longitude),
      elevation_ft: toInt(row.elevation_ft),
      year: toInt(row.year),
      month: toInt(row.month),
      day: toInt(row.day),
      collector: row.collector || null,
      subspecies: row.subspecies || null,
    });
  }
  // Sort each species' images by weight
  for (const slug of Object.keys(bySpecies)) {
    bySpecies[slug].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
  }
  return bySpecies;
}
