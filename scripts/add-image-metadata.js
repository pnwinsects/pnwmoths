#!/usr/bin/env node
// Merges specimen record metadata from MySQL export into images.csv.
// Adds: locality, state, latitude, longitude, elevation_ft, year, month, day, collector, subspecies
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

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
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function parseTSV(text) {
  const lines = text.trimEnd().split("\n");
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function toCSVValue(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

// Load MySQL export
const meta = parseTSV(readFileSync("/tmp/pnwmoths_image_meta.tsv", "utf8"));
const metaByFilename = new Map(meta.map((r) => [r.filename, r]));

// Load existing images.csv
const images = parseCSV(readFileSync(join(dataDir, "images.csv"), "utf8"));

const newHeaders = [
  "species_slug",
  "filename",
  "photographer",
  "weight",
  "license",
  "view",
  "specimen",
  "navigational",
  "locality",
  "state",
  "latitude",
  "longitude",
  "elevation_ft",
  "year",
  "month",
  "day",
  "collector",
  "subspecies",
];

let matched = 0;
let unmatched = 0;

const rows = images.map((img) => {
  const m = metaByFilename.get(img.filename);
  if (m) matched++;
  else unmatched++;
  return newHeaders.map((h) => {
    if (h in img) return toCSVValue(img[h]);
    return toCSVValue(m?.[h] ?? "");
  });
});

const output =
  newHeaders.join(",") +
  "\n" +
  rows.map((r) => r.join(",")).join("\n") +
  "\n";

writeFileSync(join(dataDir, "images.csv"), output);
console.log(`Done. Matched: ${matched}, unmatched: ${unmatched}`);
