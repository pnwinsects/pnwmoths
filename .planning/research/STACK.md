# Stack Research: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Researched:** 2026-04-11
**Mode:** Ecosystem — standard 2025 stack for data-heavy Eleventy static site

---

## Eleventy Core

**Recommendation:** Eleventy 3.1.x (current stable)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@11ty/eleventy` | 3.1.x | Static site generator | First-class ESM support, 11% perf improvement in 3.1, active maintenance |
| `@11ty/eleventy-img` | 5.x (beta on-demand) or 4.x stable | Build-time image optimization | Official plugin; 5.x adds on-demand processing for faster dev builds |

**Confidence:** HIGH — version confirmed from official release history and search results.

### Key Eleventy 3.x facts

Eleventy 3.0 (October 2024) dropped the CommonJS requirement and went ESM-first. Existing CJS configs still work but new projects should use `.eleventy.js` as ESM or rename to `eleventy.config.js`. Eleventy 3.1.0 added 11% build speed improvement and 22% smaller package. The canary track is at 4.0.0-alpha — do not use for production.

**For 700 pages:** Eleventy's pagination system is the correct mechanism. One template file + `pagination: { data: species, size: 1, alias: species }` generates all species pages from a data array. Documented build regressions at scale have been attributed to shortcode/filter cost, not pagination itself.

**eleventy-img:** Images are excluded from scope per PROJECT.md, but when referenced the plugin should still be used to emit graceful fallbacks for missing assets. Version 4.x is the stable ESM-compatible release; 5.x is in beta with on-demand processing. Use 4.x for now and note the upgrade path.

**Confidence for eleventy-img:** MEDIUM — beta status of 5.x unconfirmed via official docs, inferred from search results.

---

## Eleventy + Vite Integration

**Recommendation:** `@11ty/eleventy-plugin-vite` (official plugin, v7.0.0)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@11ty/eleventy-plugin-vite` | 7.0.0 | Vite dev server + production bundling | Official 11ty plugin; pairs Eleventy's HTML generation with Vite's JS bundling |
| `vite` | 5.x or 6.x (follow plugin peer dep) | Module bundler and dev server | Fast HMR during development; rollup-based production bundles |

**Confidence:** HIGH for plugin existence and version (confirmed via npm). MEDIUM for Vite version compatibility (check plugin's peer deps at install time — Vite 6 released late 2024).

### How it works

`@11ty/eleventy-plugin-vite` runs Eleventy to produce HTML, then serves it through Vite's dev server with HMR for JS/CSS. On production build, Vite processes scripts referenced in the HTML and emits hashed bundles. The plugin uses Eleventy's `eleventy.after` event to trigger Vite's build step, so there is one `npm run build` command for the full pipeline.

### What NOT to use here

- **`vite-plugin-eleventy`** (by Snugug): This inverts control — Vite is primary, Eleventy is secondary. Less mature, fewer users, and awkward for Eleventy-heavy workflows. The official plugin is better.
- **Slinkity:** Abandoned. Archived repository. Do not use.
- **Manual process scripting:** Running `eleventy && vite build` as two sequential scripts works but gives up HMR integration. Use the plugin.

---

## Data Sources (CSV / SQLite at Build Time)

**Recommendation:** JavaScript data files (`_data/*.js`) with `better-sqlite3` for SQLite and `csv-parse` for CSV.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `better-sqlite3` | 12.x (current ~12.8.0) | Query SQLite at build time | Synchronous API; no async/await plumbing needed in Eleventy data files; fastest Node SQLite binding |
| `csv-parse` | 5.x | Parse CSV files at build time | Most downloaded Node CSV library (1.4M weekly), well-maintained, flexible API |

**Confidence:** HIGH for both libraries — versions confirmed via npm search results.

### Pattern for SQLite in Eleventy

Place a JS file in `_data/` that uses `better-sqlite3` synchronously. Eleventy executes it at build time:

```js
// _data/species.js
import Database from 'better-sqlite3';
const db = new Database('./data/pnwmoths.db', { readonly: true });

export default function() {
  return db.prepare('SELECT * FROM species ORDER BY genus, species').all();
}
```

Because `better-sqlite3` is synchronous, no async boilerplate is needed. This is a key advantage over `node-sqlite3` (async/callback) or Drizzle/Kysely (ORM overhead unnecessary for a read-only build pipeline).

### Pattern for CSV in Eleventy

```js
// _data/records.js
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

export default function() {
  const raw = fs.readFileSync('./data/occurrence_records.csv');
  return parse(raw, { columns: true, skip_empty_lines: true });
}
```

`csv-parse/sync` is the synchronous API for the `csv-parse` package — same package, different import path.

### Joining at build time

The per-species occurrence join (PROJECT.md's "critical build-time data join") should happen in a computed data file or template. One approach: load `records.js` as an array, then in `species.js` do a `Map` lookup by species ID. Embed the filtered records as JSON in each page's front matter for the client-side map.

### What NOT to use

- **`csv-parser`:** Officially deprecated as of 2023. Do not use.
- **`papaparse`:** Fine for browser use; `csv-parse` is more idiomatic for Node pipelines and has 3x the weekly downloads.
- **`node-sqlite3`:** Async API adds complexity with no benefit for a build-time context. `better-sqlite3` is faster and simpler.
- **`drizzle-orm`, `prisma`, `knex`:** ORM overhead is inappropriate for a read-only static build pipeline against a flat SQLite file.

---

## Static Search

**Recommendation:** Pagefind 1.4.0

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pagefind` | 1.4.0 | Build-time index, runtime chunked search | Ships index as static files; BM25 ranking; loads only needed index chunks on demand |

**Confidence:** HIGH — version confirmed via npm, active maintenance confirmed, strong community adoption on Eleventy sites.

### Why Pagefind wins for this project

- **Index size scales well:** Pagefind shards its index and only loads relevant chunks per query. Lunr loads the entire index into memory upfront — at 700 pages with rich occurrence data embedded, the Lunr index would be large and slow to load on mobile.
- **BM25 ranking:** Better relevance than Lunr's TF-IDF for title-weighted search (species names, common names).
- **Lunr is unmaintained:** Last release 2020. Pagefind is actively maintained (most recent release ~7 months ago as of April 2026).
- **Zero backend:** Index is a set of static files in `/pagefind/` in the output directory — hosts on GitHub Pages with no configuration.
- **Eleventy integration pattern:** Run the Pagefind CLI in Eleventy's `eleventy.after` event, same as it works for Vite. Or use the Node.js API.

### What to exclude from the index

Occurrence records are embedded as JSON in `<script>` tags for the map. Mark that element `data-pagefind-ignore` to prevent Pagefind from indexing raw JSON strings. Use `data-pagefind-body` on the main content area so only the factsheet text (description, similar species, glossary) is indexed.

### What NOT to use

- **Lunr:** Unmaintained since 2020. Bundle-loads full index. Do not use.
- **Fuse.js:** In-memory fuzzy search. Must ship all indexed content to the browser on first load. Fine for tiny sites, wrong tool for 700 pages with JSON payloads.
- **Algolia / Typesense:** Require a server. Out of scope per PROJECT.md constraints.
- **Orama (formerly Lyra):** Actively maintained alternative to Fuse.js but still in-memory. Same drawback at this scale.

---

## Client-side Maps

**Recommendation:** Leaflet 1.9.x

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `leaflet` | 1.9.x | Client-side occurrence map | 42KB gzipped; zero server dependency; renders raster tile basemap + GeoJSON/marker layers from embedded JSON |
| OpenStreetMap tiles (or Stamen Toner) | — | Basemap tiles | Free, no API key, no rate limits for low-traffic natural history sites |

**Confidence:** HIGH for Leaflet version and bundle size. MEDIUM for tile provider recommendation (verify OSM tile policy for production traffic; Stamen/Stadia requires account for high volume).

### Why Leaflet over MapLibre GL JS

This site's map requirement is: show ~N occurrence points (lat/long) per species, colored by record type (specimen/photograph/etc.), on a background map. That is a simple marker cluster map — exactly what Leaflet was designed for.

- **Bundle size:** Leaflet is ~42KB gzipped vs MapLibre GL at ~220KB+ gzipped. For a natural history site where the map is one of several components on a page, the smaller bundle matters.
- **No WebGL dependency:** Leaflet works on older browsers and devices. Occurrence data maps for scientific sites have heterogeneous audiences.
- **Raster tiles are fine here:** The project does not need vector tile styling, 3D terrain, or sub-pixel smooth zooming. Raster tiles at OpenStreetMap zoom levels are sufficient.
- **Simpler data pipeline:** Occurrence records are embedded as JSON; Leaflet's `L.geoJSON()` or manual `L.marker()` loop consumes this directly without tile layer configuration complexity.

### When to reconsider MapLibre

If a future requirement emerges for choropleth county-level range maps, vector styling, or very large point datasets (>10,000 points per species) requiring WebGL clustering, revisit MapLibre then. At PoC stage: Leaflet.

### What NOT to use

- **Google Maps:** API key required, usage limits, GDPR complications, not appropriate for an open-source natural history project.
- **Mapbox GL JS:** Proprietary license, API key required, billed at traffic thresholds. MapLibre is the open fork — use that if WebGL is ever needed.
- **OpenLayers:** Large bundle, complex API, appropriate for GIS applications not natural history factsheets.

---

## Deployment

**Recommendation:** Cloudflare Pages (primary) or GitHub Pages (simpler/sufficient)

| Platform | Free Tier | Build Integration | Notes |
|----------|-----------|-------------------|-------|
| **Cloudflare Pages** | Unlimited bandwidth, 500 builds/month | Connects to GitHub repo, runs build command | Best CDN performance; free tier is generous; `wrangler pages deploy` CLI option |
| **GitHub Pages** | Unlimited for public repos | GitHub Actions workflow | Simplest for a GitHub-native project; adequate for low-traffic academic site |
| **Netlify** | 100GB bandwidth/month | Native Git integration | Feature-rich but bandwidth cap more constraining than Cloudflare |

**Confidence:** HIGH — all three platforms verified via multiple 2025 comparison sources.

### Recommendation rationale

For this project (academic/non-commercial, pure static, GitHub-hosted source), **GitHub Pages is sufficient** and the simplest first deployment target — zero configuration beyond a GitHub Actions workflow running `npm run build`. Use Cloudflare Pages if the site needs a custom domain with free SSL or if build minutes from GitHub Actions become a concern.

### Deployment build command

```bash
npm run build  # runs eleventy + pagefind index
```

Both GitHub Pages and Cloudflare Pages support this pattern with a single `publish directory` pointing to Eleventy's output folder (default `_site`).

### What NOT to use

- **Vercel:** Optimized for Next.js/React server deployments; fine for static but no advantage over GitHub Pages or Cloudflare for this use case.
- **Any platform requiring Node.js server at runtime:** The constraint is pure static files — no server, no serverless functions needed.
- **AWS S3/CloudFront:** Operationally heavier than needed for a PoC. Revisit if traffic grows significantly.

---

## What NOT to Use (Summary)

| Category | Avoid | Reason |
|----------|-------|--------|
| Search | Lunr | Unmaintained since 2020; full-index memory load |
| Search | Fuse.js | In-memory; wrong at 700 pages with JSON payloads |
| Maps | Google Maps | API key, billing, GDPR |
| Maps | MapLibre GL JS | 220KB bundle; WebGL overkill for simple point markers |
| Maps | Mapbox GL JS | Proprietary; paid at traffic thresholds |
| CSV parsing | `csv-parser` | Deprecated 2023 |
| SQLite | `node-sqlite3` | Async API; `better-sqlite3` is simpler and faster |
| Eleventy/Vite | `vite-plugin-eleventy` (Snugug) | Inverts control; use official plugin |
| Eleventy/Vite | Slinkity | Archived/abandoned |
| Eleventy | v4.x canary | Alpha; not production-ready |
| ORM | Drizzle, Prisma, Knex | Overkill for read-only build-time SQLite access |
| Hosting | Vercel, AWS | No advantage over GitHub Pages/Cloudflare for pure static |

---

## Installation

```bash
# Core SSG
npm install @11ty/eleventy

# Vite integration
npm install @11ty/eleventy-plugin-vite vite

# Data sources
npm install better-sqlite3 csv-parse

# Static search (run at build time; also installs CLI)
npm install pagefind

# Maps (client-side, bundled via Vite)
npm install leaflet

# Image optimization (when images are in scope)
npm install @11ty/eleventy-img
```

---

## Sources

- Eleventy versions: https://www.11ty.dev/docs/versions/ and https://github.com/11ty/eleventy/releases
- Eleventy 3.1 release notes: https://github.com/11ty/11ty-website/blob/main/src/blog/2025-05-13-eleventy-v3-1.md
- eleventy-plugin-vite: https://github.com/11ty/eleventy-plugin-vite and https://www.npmjs.com/package/@11ty/eleventy-plugin-vite
- eleventy-img: https://www.11ty.dev/docs/plugins/image/ and https://github.com/11ty/eleventy-img
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3 and https://www.npmjs.com/package/better-sqlite3
- csv-parse: https://www.npmjs.com/package/csv-parse
- Pagefind: https://pagefind.app/ and https://www.npmjs.com/package/pagefind
- Pagefind Eleventy integration: https://rknight.me/blog/using-pagefind-with-eleventy-for-search/
- Pagefind vs Lunr analysis: https://www.allaboutken.com/posts/20260228-replacing-lunr-with-pagefind/
- Leaflet vs MapLibre: https://blog.jawg.io/maplibre-gl-vs-leaflet-choosing-the-right-tool-for-your-interactive-map/
- Map library popularity 2025: https://www.geoapify.com/map-libraries-comparison-leaflet-vs-maplibre-gl-vs-openlayers-trends-and-statistics/
- Static hosting comparison: https://www.freetiers.com/blog/github-pages-vs-cloudflare-pages-comparison and https://www.digitalapplied.com/blog/vercel-vs-netlify-vs-cloudflare-pages-comparison
- Eleventy CSV guide: https://www.maxkohler.com/posts/eleventy-csv/
- Eleventy JS data files: https://www.11ty.dev/docs/data-js/
