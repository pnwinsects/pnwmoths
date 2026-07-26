/**
 * Generate the static home-page range map (public/images/pnw-range.svg).
 *
 * Renders US state + Canadian province outlines as a light basemap with the
 * site's target range (PNW_REGION_RING) highlighted on top. The output is a
 * plain inline-able SVG — no JavaScript, no map tiles, no network at runtime.
 *
 * Single source of truth: the highlighted region is read from
 * src/components/pnw-region.ts (the same ring the species occurrence maps use),
 * so re-running this script keeps the home map in sync if the range ever changes.
 *
 * Outline geometry comes from Natural Earth 1:50m admin-1 states/provinces. This
 * script is run MANUALLY (not part of `npm run build`) so the site build stays
 * offline and deterministic; it fetches the dataset over the network or reads a
 * local copy passed as argv[2].
 *
 *   node scripts/generate-range-map.ts [path/to/ne_50m_admin_1_states_provinces.geojson]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNW_REGION_RING } from '../src/components/pnw-region.ts';

const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson';
const OUT_PATH = 'public/images/pnw-range.svg';
const HEIGHT = 400; // px; width is derived to preserve geographic aspect ratio

type Lon = number;
type Lat = number;
type Point = [Lon, Lat];
type Ring = Point[];

interface Feature {
  properties: { admin?: string };
  bbox?: [number, number, number, number];
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

// --- Load outline data (local file arg, or fetch Natural Earth) ---
async function loadFeatures(): Promise<Feature[]> {
  const localPath = process.argv[2];
  if (localPath) {
    return JSON.parse(readFileSync(localPath, 'utf8')).features;
  }
  const res = await fetch(NE_URL);
  if (!res.ok) throw new Error(`Failed to fetch outlines: ${res.status}`);
  return ((await res.json()) as { features: Feature[] }).features;
}

// --- Region (PNW_REGION_RING is [lat, lon]; flip to [lon, lat]) ---
const region: Ring = PNW_REGION_RING.map(([lat, lon]) => [lon, lat]);
const regionLons = region.map((p) => p[0]);
const regionLats = region.map((p) => p[1]);
const padLon = (Math.max(...regionLons) - Math.min(...regionLons)) * 0.06;
const padLat = (Math.max(...regionLats) - Math.min(...regionLats)) * 0.06;
const minLon = Math.min(...regionLons) - padLon;
const maxLon = Math.max(...regionLons) + padLon;
const minLat = Math.min(...regionLats) - padLat;
const maxLat = Math.max(...regionLats) + padLat;

// --- Projection: equirectangular with cos(lat0) longitude correction ---
const lat0 = (minLat + maxLat) / 2;
const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
const k = HEIGHT / (maxLat - minLat);
const WIDTH = (maxLon - minLon) * cosLat0 * k;
const projX = (lon: number): number => (lon - minLon) * cosLat0 * k;
const projY = (lat: number): number => (maxLat - lat) * k;

// --- Sutherland–Hodgman clip of a ring against the region bbox rectangle ---
interface Clipper {
  inside: (p: Point) => boolean;
  cut: (a: Point, b: Point) => Point;
}

const cutX = (a: Point, b: Point, x: number): Point => {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
};
const cutY = (a: Point, b: Point, y: number): Point => {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
};

const clippers: Clipper[] = [
  { inside: (p) => p[0] >= minLon, cut: (a, b) => cutX(a, b, minLon) },
  { inside: (p) => p[0] <= maxLon, cut: (a, b) => cutX(a, b, maxLon) },
  { inside: (p) => p[1] >= minLat, cut: (a, b) => cutY(a, b, minLat) },
  { inside: (p) => p[1] <= maxLat, cut: (a, b) => cutY(a, b, maxLat) },
];

function clip(ring: Ring): Ring {
  let pts = ring;
  for (const { inside, cut } of clippers) {
    if (pts.length === 0) break;
    const out: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]!;
      const prev = pts[(i + pts.length - 1) % pts.length]!;
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(cut(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(cut(prev, cur));
      }
    }
    pts = out;
  }
  return pts;
}

function bboxIntersects(b?: [number, number, number, number]): boolean {
  if (!b) return true;
  return !(b[2] < minLon || b[0] > maxLon || b[3] < minLat || b[1] > maxLat);
}

function ringToPath(ring: Ring): string {
  const clipped = clip(ring);
  if (clipped.length < 3) return '';
  return (
    'M' +
    clipped
      .map((p) => `${projX(p[0]).toFixed(1)} ${projY(p[1]).toFixed(1)}`)
      .join('L') +
    'Z'
  );
}

function polygonsOf(geom: Feature['geometry']): Ring[][] {
  return geom.type === 'Polygon'
    ? [geom.coordinates as Ring[]]
    : (geom.coordinates as Ring[][]);
}

// --- Build paths ---
const features = await loadFeatures();
const landPaths: string[] = [];
for (const f of features) {
  const admin = f.properties.admin;
  if (admin !== 'United States of America' && admin !== 'Canada') continue;
  if (!bboxIntersects(f.bbox)) continue;
  for (const poly of polygonsOf(f.geometry)) {
    for (const ring of poly) {
      const d = ringToPath(ring as Ring);
      if (d) landPaths.push(d);
    }
  }
}

const regionPath =
  'M' + region.map((p) => `${projX(p[0]).toFixed(1)} ${projY(p[1]).toFixed(1)}`).join('L') + 'Z';

const w = WIDTH.toFixed(1);
const h = HEIGHT.toFixed(1);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Map of the Pacific Northwest region covered by this site">
  <title>The Pacific Northwest region covered by this site</title>
  <rect width="${w}" height="${h}" fill="#e8eef2"/>
  <g fill="#f6f4ee" stroke="#c4bfb2" stroke-width="0.8" stroke-linejoin="round">
${landPaths.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
  <path d="${regionPath}" fill="#0172ad" fill-opacity="0.18" stroke="#0172ad" stroke-width="1.8" stroke-linejoin="round"/>
</svg>
`;

writeFileSync(OUT_PATH, svg);
console.log(
  `[range-map] wrote ${OUT_PATH} — ${landPaths.length} outline paths, ${(svg.length / 1024).toFixed(1)}KB, viewBox ${w}×${h}`,
);
