#!/usr/bin/env node
// Parse Dropbox filenames and classify against the project's species data.
// Reads outputs/filenames.json (produced by list-dropbox.mjs).
// Writes outputs/classifications.json and a summary to stdout suitable for REPORT.md.
//
// Classification buckets:
//   clean-match        — filename's binomial matches a current species exactly
//   slug-match         — filename's binomial matches a species_slug (genus-species)
//   genus-only         — only the genus matches a current species (multi-species in genus)
//   likely-synonym     — binomial doesn't match current data; needs synonym resolution
//   unparseable        — couldn't extract a binomial from the filename
//   non-image          — file is not an image extension (jpg/jpeg/tif/tiff/png/heic/raw)

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_PATH = join(__dirname, "outputs", "filenames.json");
const OUT_PATH = join(__dirname, "outputs", "classifications.json");
const SPECIES_CSV = join(__dirname, "..", "..", "..", "data", "species.csv");

const IMAGE_EXTS = new Set(["jpg", "jpeg", "tif", "tiff", "png", "heic", "heif", "cr2", "nef", "arw", "dng", "raw"]);

// Very simple CSV parser (sufficient for our well-formed species.csv).
// Handles quoted fields containing commas.
function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (field.length || row.length) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
      // skip \r\n
      if (ch === "\r" && text[i + 1] === "\n") i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ""])));
}

async function loadSpecies() {
  const text = await readFile(SPECIES_CSV, "utf8");
  const records = parseCsv(text);
  const byBinomial = new Map(); // "genus species" (lowercase) → record
  const bySlug = new Map(); // "genus-species" → record
  const genera = new Set();
  for (const r of records) {
    const genus = (r.genus || "").trim();
    const species = (r.species || "").trim();
    if (!genus || !species) continue;
    const binomial = `${genus} ${species}`.toLowerCase();
    const slug = `${genus}-${species}`.toLowerCase();
    byBinomial.set(binomial, r);
    bySlug.set(slug, r);
    genera.add(genus.toLowerCase());
  }
  return { records, byBinomial, bySlug, genera };
}

// Try to extract a binomial from a filename like:
//   "Genus species-A-D.jpg"  → "genus species"
//   "Genus_species_001.tif"
//   "Genus species 001.jpg"
//   "Genus species ssp authority.jpg"
// Strategy: strip extension, replace separators with space, take first two
// alpha tokens where the first is Capitalized and the second is all-lowercase.
function extractBinomial(name) {
  const stem = name.replace(/\.[^.]+$/, "");
  // Replace common separators with spaces, then collapse
  const cleaned = stem
    .replace(/[_\-\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ");
  // Walk tokens looking for [Capitalized, all-lowercase] adjacent pair
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (/^[A-Z][a-z]+$/.test(a) && /^[a-z]+$/.test(b) && b.length >= 3) {
      return `${a.toLowerCase()} ${b.toLowerCase()}`;
    }
  }
  return null;
}

function fileExt(name) {
  const m = (name || "").match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "";
}

async function main() {
  const raw = JSON.parse(await readFile(IN_PATH, "utf8"));
  const species = await loadSpecies();

  const buckets = {
    "clean-match": [],
    "slug-match": [],
    "genus-only": [],
    "likely-synonym": [],
    "unparseable": [],
    "non-image": [],
    "folder": [],
  };

  const perSpeciesCount = new Map(); // binomial → file count
  const unknownGeneraCount = new Map();
  const unmatchedBinomialCount = new Map();
  const totalBytes = { total: 0 };

  for (const e of raw.entries) {
    if (e.tag !== "file") {
      buckets.folder.push({ name: e.name });
      continue;
    }
    if (e.size) totalBytes.total += e.size;
    const ext = fileExt(e.name);
    if (!IMAGE_EXTS.has(ext)) {
      buckets["non-image"].push({ name: e.name, ext });
      continue;
    }
    const binomial = extractBinomial(e.name);
    if (!binomial) {
      buckets.unparseable.push({ name: e.name });
      continue;
    }
    if (species.byBinomial.has(binomial)) {
      buckets["clean-match"].push({ name: e.name, binomial });
      perSpeciesCount.set(binomial, (perSpeciesCount.get(binomial) || 0) + 1);
      continue;
    }
    const slug = binomial.replace(" ", "-");
    if (species.bySlug.has(slug)) {
      buckets["slug-match"].push({ name: e.name, binomial });
      perSpeciesCount.set(binomial, (perSpeciesCount.get(binomial) || 0) + 1);
      continue;
    }
    const genus = binomial.split(" ")[0];
    if (species.genera.has(genus)) {
      buckets["genus-only"].push({ name: e.name, binomial });
      unmatchedBinomialCount.set(binomial, (unmatchedBinomialCount.get(binomial) || 0) + 1);
      continue;
    }
    buckets["likely-synonym"].push({ name: e.name, binomial });
    unknownGeneraCount.set(genus, (unknownGeneraCount.get(genus) || 0) + 1);
    unmatchedBinomialCount.set(binomial, (unmatchedBinomialCount.get(binomial) || 0) + 1);
  }

  // Photos-per-species distribution (only for matched species)
  const photosPerSpecies = [...perSpeciesCount.values()];
  photosPerSpecies.sort((a, b) => a - b);
  const sum = photosPerSpecies.reduce((a, b) => a + b, 0);
  const mean = photosPerSpecies.length ? sum / photosPerSpecies.length : 0;
  const median = photosPerSpecies.length
    ? photosPerSpecies[Math.floor(photosPerSpecies.length / 2)]
    : 0;
  const max = photosPerSpecies.length ? photosPerSpecies[photosPerSpecies.length - 1] : 0;
  const min = photosPerSpecies.length ? photosPerSpecies[0] : 0;

  // Top species by photo count
  const topSpecies = [...perSpeciesCount.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  // Top unmatched binomials (synonym candidates)
  const topUnmatched = [...unmatchedBinomialCount.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30);

  // Top unknown genera
  const topUnknownGenera = [...unknownGeneraCount.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30);

  // Sample 10 from each bucket for the report
  const sample = (arr, n = 10) => {
    if (arr.length <= n) return arr;
    const step = Math.floor(arr.length / n);
    const out = [];
    for (let i = 0; i < n; i++) out.push(arr[i * step]);
    return out;
  };

  const summary = {
    listed_at: raw.listed_at,
    total_entries: raw.total_entries,
    folders: buckets.folder.length,
    files: raw.total_entries - buckets.folder.length,
    total_bytes: totalBytes.total,
    total_bytes_gb: (totalBytes.total / 1024 / 1024 / 1024).toFixed(2),
    by_extension: raw.by_extension,
    bucket_counts: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, v.length]),
    ),
    bucket_pct: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [
        k,
        ((v.length / (raw.total_entries || 1)) * 100).toFixed(1) + "%",
      ]),
    ),
    species_data: {
      total_records: species.records.length,
      matched: perSpeciesCount.size,
      unmatched: unmatchedBinomialCount.size,
      match_rate_pct: species.records.length
        ? ((perSpeciesCount.size / species.records.length) * 100).toFixed(1)
        : "0",
    },
    photos_per_species: {
      n_species: photosPerSpecies.length,
      min,
      median,
      mean: mean.toFixed(2),
      max,
      sum,
    },
    top_species_by_photos: topSpecies,
    top_unmatched_binomials: topUnmatched,
    top_unknown_genera: topUnknownGenera,
    samples: {
      "clean-match": sample(buckets["clean-match"]),
      "slug-match": sample(buckets["slug-match"]),
      "genus-only": sample(buckets["genus-only"]),
      "likely-synonym": sample(buckets["likely-synonym"]),
      "unparseable": sample(buckets.unparseable),
      "non-image": sample(buckets["non-image"]),
      "folder": sample(buckets.folder, 5),
    },
  };

  await writeFile(OUT_PATH, JSON.stringify(summary, null, 2));

  // Pretty-print summary to stdout for REPORT.md
  console.log("\n=== Dropbox photo audit summary ===\n");
  console.log(`Total entries:      ${summary.total_entries}`);
  console.log(`Files:              ${summary.files}`);
  console.log(`Folders:            ${summary.folders}`);
  console.log(`Total bytes:        ${summary.total_bytes_gb} GB`);
  console.log("\nBy extension:", summary.by_extension);
  console.log("\nBucket counts:");
  for (const [k, v] of Object.entries(summary.bucket_counts)) {
    console.log(`  ${k.padEnd(20)} ${v.toString().padStart(6)}  (${summary.bucket_pct[k]})`);
  }
  console.log("\nSpecies data match:");
  console.log(`  current species:  ${summary.species_data.total_records}`);
  console.log(`  matched:          ${summary.species_data.matched} (${summary.species_data.match_rate_pct}%)`);
  console.log(`  unmatched (need investigation): ${summary.species_data.unmatched}`);
  console.log("\nPhotos per matched species:");
  console.log(`  min/median/mean/max: ${min} / ${median} / ${mean.toFixed(2)} / ${max}`);
  console.log(`  total matched photos: ${sum}`);
  console.log(`\nWrote detailed JSON → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
