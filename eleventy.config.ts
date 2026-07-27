import { EleventyRenderPlugin } from "@11ty/eleventy";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { parse as parseCsv } from "csv-parse/sync";
import { applyGlossaryTerms, buildTermMap, type GlossaryRow } from "./src/_lib/glossary-transform.ts";
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

// On GitHub Pages the site lives under /pnwmoths/. actions/configure-pages sets
// GITHUB_PAGES=true so the build knows to apply the prefix. Locally the dev
// server serves at root, so we use "/" which makes | url a no-op.
const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/";

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
  // og:/canonical consumers, and it is also what keeps eleventy-plugin-vite's HTML
  // asset scanner away from these tags — it sweeps every <link href> and the
  // og:image <meta content>, but skips external URLs.
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

  // Expose CDN base URL to all Nunjucks templates as {{ cdnBaseUrl }}
  eleventyConfig.addGlobalData("cdnBaseUrl", CDN_BASE_URL);

  // Sharing-metadata defaults, used by src/_includes/base.njk for every page that
  // does not set its own `description` / `socialImage` / `socialImageAlt`.
  eleventyConfig.addGlobalData("siteName", SITE_NAME);
  eleventyConfig.addGlobalData("siteDescription", SITE_DESCRIPTION);
  eleventyConfig.addGlobalData("siteImageAlt", SITE_IMAGE_ALT);

  // Passthrough copy: per-species Parquet files from data/parquet/{slug}/ to _site/species/{slug}/
  // data/parquet/acronicta-americana/records.parquet -> _site/species/acronicta-americana/records.parquet
  eleventyConfig.addPassthroughCopy({ "data/parquet": "species" });

  // Pico CSS from node_modules
  eleventyConfig.addPassthroughCopy({
    "node_modules/@picocss/pico/css/pico.min.css": "css/pico.min.css"
  });

  // Passthrough copy for component source files so Vite can find them
  eleventyConfig.addPassthroughCopy({ "src/components": "components" });
  eleventyConfig.addPassthroughCopy({ "src/types": "types" });
  // _lib shared utilities needed by pnwm-identify (key-filter, computeMatching)
  eleventyConfig.addPassthroughCopy({ "src/_lib": "_lib" });

  // Theme CSS
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });

  // NOTE: public/ (banner image, partner logos, favicon) is deliberately NOT
  // passthrough-copied here — eleventy-plugin-vite adds that automatically for
  // Vite's publicDir. See the publicDir option below.

  // About page images (label examples, screenshots)
  eleventyConfig.addPassthroughCopy("src/about/data/images");
  eleventyConfig.addPassthroughCopy("src/about/images/images");

  // Vite plugin: bundles client-side JS components
  // The writeBundle hook fires after Vite finishes writing to _site/, so images copied here
  // are not wiped (unlike eleventy.after, which fires in parallel with Vite).
  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      appType: "mpa",
      base: pathPrefix,
      // Vite's public directory. Everything under it is copied verbatim into _site/
      // and — critically — root-absolute references to it in HTML are rewritten by
      // string substitution alone (checkPublicFile short-circuits before any read).
      //
      // Without this, vite:build-html calls fs.readFile for every asset referenced in
      // every page. The shared layout puts the favicon, the banner and 13 partner
      // logos on all ~1,300 pages, and Vite populates its asset cache only *after*
      // the read resolves, so the concurrent first wave all misses the cache: tens of
      // thousands of simultaneous open() calls and a hard EMFILE build failure that
      // gets worse with every species added. See docs/lessons-learned.md.
      //
      // Must stay a project-root-relative "public": eleventy-plugin-vite passthrough-
      // copies this path (project-relative) into _site/, which it then renames to
      // .11ty-vite/ and hands to Vite as `root` — and Vite resolves a relative
      // publicDir against that root. Only a top-level "public" makes both agree.
      publicDir: "public",
      server: {
        hmr: { port: 24679 },
      },
      build: {
        sourcemap: true,
      },
      plugins: [{
        name: "pnwm-copy-images",
        writeBundle: async () => {
          await new Promise<void>((res, rej) => execFile("node", ["scripts/copy-images.ts"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
          await new Promise<void>((res, rej) => execFile("node", ["scripts/emit-species-states.ts"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
        }
      }]
    }
  });

  // In --serve mode Vite runs as middleware (no build, no writeBundle), so copy on each
  // Eleventy rebuild instead. Images persist between watch rebuilds since Eleventy doesn't
  // wipe _site/ on partial rebuilds.
  eleventyConfig.on("eleventy.after", async ({ runMode }) => {
    if (runMode !== "serve") return;
    await new Promise<void>((res, rej) => execFile("node", ["scripts/copy-images.ts"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
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
