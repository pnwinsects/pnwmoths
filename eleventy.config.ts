import { EleventyRenderPlugin } from "@11ty/eleventy";
import { existsSync, readFileSync, statSync } from "node:fs";
import { cp } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { parse as parseCsv } from "csv-parse/sync";
import { applyGlossaryTerms, buildTermMap, type GlossaryRow } from "./src/_lib/glossary-transform.ts";
import { derivativeUrl, sourceUrl, type VariantToken } from "./src/_lib/derivative-url.ts";
import { entryTags, pathPrefix, VITE_MANIFEST, VITE_OUT_DIR, type ViteManifest } from "./src/_lib/vite-entries.ts";
import {
  pickAccountPhotos,
  pickSimilarPhoto,
  type SpecimenView,
  type TileSpecimenLike,
} from "./src/_lib/photo-display.ts";
import {
  proseDescription,
  speciesDescription,
  speciesSocialImage,
  speciesSocialImageAlt,
  SITE_DESCRIPTION,
  SITE_IMAGE_ALT,
  SITE_NAME,
  type HighResPhotoLike,
  type SpeciesImageLike,
  type SpeciesLike,
} from "./src/_lib/social-meta.ts";

// pathPrefix — "/pnwmoths/" on GitHub Pages, "/" everywhere else — is imported from
// src/_lib/vite-entries.ts, because vite.config.ts must apply the same one.

// Origin this build will be served from. Sharing metadata (og:url, og:image,
// rel=canonical) must be absolute, and pathPrefix alone cannot supply an origin —
// so this mirrors the same GITHUB_PAGES switch, and staging never advertises
// itself with production URLs. See docs/adr/0021-sharing-metadata.md.
const SITE_ORIGIN = process.env.GITHUB_PAGES
  ? "https://pnwinsects.github.io"
  : "https://moths.pnwinsects.org";

// bunny.net Pull Zone — public CDN base URL. Not a secret; hard-coded here.
// To update: log in to bunny.net dashboard, find the Pull Zone hostname, paste here.
const CDN_BASE_URL = "https://moths.pnwinsects.org";

// Public source repository, linked from the footer and the Contact page (issue #199)
// so visitors can read the code, file bugs, or contribute.
const REPO_URL = "https://github.com/pnwinsects/pnwmoths";

// Load glossary terms once at startup. termMap is sorted longest-first and
// has pre-compiled regexes — shared across all addTransform invocations via closure.
// csv-parse/sync is synchronous; no async needed here.
const glossaryRows = parseCsv(readFileSync("data/glossary.csv"), {
  columns: true,
  skip_empty_lines: true,
}) as GlossaryRow[];
const termMap = buildTermMap(glossaryRows, CDN_BASE_URL);

export default function (eleventyConfig: EleventyConfig): { pathPrefix: string; dir: { input: string; output: string; data: string } } {
  // Register .ts data extension so Eleventy discovers src/_data/*.ts files.
  // Eleventy does not auto-discover .ts files (getGlobalDataExtensionPriorities returns
  // only ["json","mjs","cjs","js"]). With read:false, Eleventy calls parser(filePath)
  // instead of reading file content. The parser must invoke the default export function
  // itself — Eleventy only does that automatically for built-in .js data files.
  eleventyConfig.addDataExtension("ts", {
    read: false,
    parser: async (filePath: string) => {
      // Skip test files (*.test.ts) — they have no default export and would run
      // test assertions as a side effect if imported during the Eleventy build.
      if (filePath.endsWith(".test.ts")) return undefined;
      // Defensive: ensure absolute path for import() — Eleventy may pass project-relative
      const absolutePath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
      const m = await import(pathToFileURL(absolutePath).href) as { default: unknown };
      const exported = m.default;
      return typeof exported === "function" ? exported() : exported;
    },
  });

  // Render plugin: enables {% renderFile %} shortcode for rendering .md files in templates
  eleventyConfig.addPlugin(EleventyRenderPlugin);

  // Filter to check if a file exists relative to the project root
  eleventyConfig.addFilter("fileExists", function (relativePath) {
    return existsSync(resolve(relativePath as string));
  });

  // JSON serialization filter for embedding data into script elements
  eleventyConfig.addFilter("tojson", function (value) {
    return JSON.stringify(value);
  });

  // URL-encode filter: handles all reserved URL characters in Django filenames
  // (spaces, parentheses, +, #, etc.). Used in CDN URL construction.
  eleventyConfig.addFilter("urlencode", v => encodeURIComponent(v as string));

  // Thousands-separated integer, e.g. 92446 -> "92,446". Used for home-page stats.
  eleventyConfig.addFilter("number", v => Number(v).toLocaleString("en-US"));

  // --- Sharing metadata (issue #198) ---------------------------------------

  // Site-root-relative path -> absolute URL. Chain it after `| url`, which supplies
  // pathPrefix: {{ page.url | url | absoluteUrl }}. Absoluteness is required by
  // og:/canonical consumers.
  eleventyConfig.addFilter("absoluteUrl", p => new URL(p as string, SITE_ORIGIN).href);

  // First prose paragraph of each factsheet, derived on demand and memoised.
  // Loading all ~1,265 up front would stall config startup for pages that are
  // never built (e.g. the single-template Eleventy runs in the test suite).
  const proseSummaries = new Map<string, string | null>();
  function proseSummaryFor(slug: string): string | null {
    const cached = proseSummaries.get(slug);
    if (cached !== undefined) return cached;
    const path = resolve("src/content/species", `${slug}.md`);
    const summary = existsSync(path) ? proseDescription(readFileSync(path, "utf8")) : null;
    proseSummaries.set(slug, summary);
    return summary;
  }

  // {{ sp | speciesDescription }} — factsheet prose if we have any, else taxonomy.
  eleventyConfig.addFilter("speciesDescription", sp => {
    const species = sp as SpeciesLike & { slug: string };
    return speciesDescription(species, proseSummaryFor(species.slug));
  });

  // {{ sp.slug | speciesSocialImage(speciesPhotos[sp.slug], images[sp.slug]) }}
  // Returns "" for species with no photos, so the layout falls back to the site card.
  eleventyConfig.addFilter("speciesSocialImage", (slug, highRes, images) =>
    speciesSocialImage(
      slug as string,
      highRes as HighResPhotoLike | undefined,
      images as SpeciesImageLike[] | undefined,
      CDN_BASE_URL,
    ));

  // {{ images[sp.slug] | accountPhotos(speciesPhotos[sp.slug]) }} — what the species
  // account displays: { mode: 'tiles' | 'photos' | 'none', photos }. In 'tiles' mode
  // `photos` is the catalogued rows no tile covers — TILE_POLICY 'supplements'
  // (src/_lib/photo-display.ts), stated there and not in the template — and `tiles`
  // pairs each tile with the one row whose label data captions it (ADR 0046).
  eleventyConfig.addFilter("accountPhotos", (images, highRes) => {
    const entry = highRes as { high_res_available?: boolean; specimens?: TileSpecimenLike[] } | undefined;
    return pickAccountPhotos(
      (images as (SpeciesImageLike & SpecimenView)[] | undefined) ?? [],
      entry?.high_res_available === true ? (entry.specimens ?? []) : null,
    );
  });

  // {{ images[slug] | similarThumbnail }} — the similar-species thumbnail, or null.
  eleventyConfig.addFilter("similarThumbnail", images =>
    pickSimilarPhoto((images as SpeciesImageLike[] | undefined) ?? []));

  // {{ sp | speciesSocialImageAlt }}
  eleventyConfig.addFilter("speciesSocialImageAlt", sp => speciesSocialImageAlt(sp as SpeciesLike));

  // Annotate species prose pages at build time: wrap first occurrences of glossary
  // terms in <abbr class="glossary-term"> elements.
  // Guard 1: skip non-HTML outputs (outputPath is false for permalink:false pages)
  // Guard 2: skip non-species pages (glossary, browse, home, etc.)
  eleventyConfig.addTransform("glossary-terms", function (content) {
    const outputPath = this.page.outputPath;
    if (!outputPath || !outputPath.endsWith(".html")) return content;
    if (!outputPath.includes("/species/")) return content;
    return applyGlossaryTerms(content, termMap);
  });

  // {{ "slug/Photo A-D.jpg" | derivative("320h") } — URL of a pre-generated image
  // variant (ADR 0022). Takes the UNENCODED source path; the helper encodes it, so
  // templates must NOT pipe through `urlencode` as well or the path double-encodes.
  eleventyConfig.addFilter("derivative", (sourcePath, token) =>
    derivativeUrl(CDN_BASE_URL, sourcePath as string, token as VariantToken));

  // {{ "slug/Photo A-D.jpg" | cdnSource }} — URL of a stored object with no
  // derivative. Only two callers: the 1500px hero slot, which *is* the stored
  // _thumbnail.webp, and the legacy og:image fallback, which stays JPEG for crawlers.
  eleventyConfig.addFilter("cdnSource", sourcePath =>
    sourceUrl(CDN_BASE_URL, sourcePath as string));

  // Expose CDN base URL to all Nunjucks templates as {{ cdnBaseUrl }}
  eleventyConfig.addGlobalData("cdnBaseUrl", CDN_BASE_URL);

  // Source repository, linked from base.njk's footer and src/contact/index.njk.
  eleventyConfig.addGlobalData("repoUrl", REPO_URL);

  // Sharing-metadata defaults, used by src/_includes/base.njk for every page that
  // does not set its own `description` / `socialImage` / `socialImageAlt`.
  eleventyConfig.addGlobalData("siteName", SITE_NAME);
  eleventyConfig.addGlobalData("siteDescription", SITE_DESCRIPTION);
  eleventyConfig.addGlobalData("siteImageAlt", SITE_IMAGE_ALT);

  // Per-species Parquet is NOT passthrough-copied: scripts/copy-parquet.ts publishes it,
  // gated on withheld and unpublished species (#275). An ungated copy of data/parquet/
  // stood here for as long as eleventy-plugin-vite silently discarded passthrough copies;
  // without the plugin it would publish embargoed occurrence data (ADR 0049).

  // Site chrome (banner, partner logos, range map, favicon, share card) at the site root.
  eleventyConfig.addPassthroughCopy({ public: "/" });

  // The client bundle (ADR 0049). `npm run build:vite` writes it to VITE_OUT_DIR before
  // Eleventy runs; its hashed assets/ are copied as-is, and each page loads its entries
  // through the viteEntry shortcode below. Vite never sees the HTML.
  eleventyConfig.addPassthroughCopy({ [`${VITE_OUT_DIR}/assets`]: "assets" });
  const manifestPath = resolve(VITE_OUT_DIR, VITE_MANIFEST);
  eleventyConfig.addWatchTarget(manifestPath);
  let manifest: { mtimeMs: number; value: ViteManifest } | null = null;
  eleventyConfig.addShortcode("viteEntry", (entry: string) => {
    if (!existsSync(manifestPath)) {
      throw new Error(`viteEntry: ${manifestPath} does not exist. Run \`npm run build:vite\` first.`);
    }
    // Re-read when `vite build --watch` rewrites it during `npm run dev`.
    const { mtimeMs } = statSync(manifestPath);
    if (manifest?.mtimeMs !== mtimeMs) {
      manifest = { mtimeMs, value: JSON.parse(readFileSync(manifestPath, "utf8")) as ViteManifest };
    }
    return entryTags(manifest.value, entry, pathPrefix);
  });

  // About page images (label examples, screenshots)
  eleventyConfig.addPassthroughCopy("src/about/data/images");
  eleventyConfig.addPassthroughCopy("src/about/images/images");

  // `npm run build:site` runs these as build steps of their own. Under --serve there are
  // no build steps, so run them after each Eleventy rebuild instead.
  eleventyConfig.on("eleventy.after", async ({ runMode }) => {
    if (runMode !== "serve") return;
    // The bundle too. A rebuild by `vite build --watch` rewrites the manifest, which
    // triggers this Eleventy rebuild, but an incremental rebuild does not redo the
    // .vite-build/ passthrough, so the pages would name a bundle _site/ does not have.
    await cp(resolve(VITE_OUT_DIR, "assets"), resolve("_site/assets"), { recursive: true });
    await new Promise<void>((res, rej) => execFile("node", ["scripts/copy-images.ts"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
    await new Promise<void>((res, rej) => execFile("node", ["scripts/copy-parquet.ts"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
    await new Promise<void>((res, rej) => execFile("node", ["scripts/emit-species-states.ts"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
    if (!existsSync("_site/pagefind")) {
      await new Promise<void>((res, rej) => execFile("./node_modules/.bin/pagefind", ["--site", "_site"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
    }
  });

  return {
    pathPrefix,
    dir: {
      input: "src",
      output: "_site",
      data: "_data"
    }
  };
}
