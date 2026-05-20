import { EleventyRenderPlugin } from "@11ty/eleventy";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { parse as parseCsv } from "csv-parse/sync";
import { applyGlossaryTerms, buildTermMap } from "./src/_lib/glossary-transform.js";

// On GitHub Pages the site lives under /pnwmoths/. actions/configure-pages sets
// GITHUB_PAGES=true so the build knows to apply the prefix. Locally the dev
// server serves at root, so we use "/" which makes | url a no-op.
const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/";

// bunny.net Pull Zone — public CDN base URL. Not a secret; hard-coded here.
// To update: log in to bunny.net dashboard, find the Pull Zone hostname, paste here.
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";

// Load glossary terms once at startup. termMap is sorted longest-first and
// has pre-compiled regexes — shared across all addTransform invocations via closure.
// csv-parse/sync is synchronous; no async needed here.
const glossaryRows = parseCsv(readFileSync("data/glossary.csv"), {
  columns: true,
  skip_empty_lines: true,
});
const termMap = buildTermMap(glossaryRows, CDN_BASE_URL);

export default function (eleventyConfig) {
  // Render plugin: enables {% renderFile %} shortcode for rendering .md files in templates
  eleventyConfig.addPlugin(EleventyRenderPlugin);

  // Filter to check if a file exists relative to the project root
  eleventyConfig.addFilter("fileExists", function (relativePath) {
    return existsSync(resolve(relativePath));
  });

  // JSON serialization filter for embedding data into script elements
  eleventyConfig.addFilter("tojson", function (value) {
    return JSON.stringify(value);
  });

  // URL-encode filter: handles all reserved URL characters in Django filenames
  // (spaces, parentheses, +, #, etc.). Used in CDN URL construction.
  eleventyConfig.addFilter("urlencode", v => encodeURIComponent(v));

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

  // Passthrough copy: per-species Parquet files from data/parquet/{slug}/ to _site/species/{slug}/
  // data/parquet/acronicta-americana/records.parquet -> _site/species/acronicta-americana/records.parquet
  eleventyConfig.addPassthroughCopy({ "data/parquet": "species" });

  // Pico CSS from node_modules
  eleventyConfig.addPassthroughCopy({
    "node_modules/@picocss/pico/css/pico.min.css": "css/pico.min.css"
  });

  // Passthrough copy for component source files so Vite can find them
  eleventyConfig.addPassthroughCopy({ "src/components": "components" });

  // Theme CSS and banner image assets
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });

  // Vite plugin: bundles client-side JS components
  // The writeBundle hook fires after Vite finishes writing to _site/, so images copied here
  // are not wiped (unlike eleventy.after, which fires in parallel with Vite).
  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      appType: "mpa",
      base: pathPrefix,
      server: {
        hmr: { port: 24679 },
      },
      plugins: [{
        name: "pnwm-copy-images",
        writeBundle: async () => {
          await new Promise((res, rej) => execFile("node", ["scripts/copy-images.js"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
          await new Promise((res, rej) => execFile("node", ["scripts/emit-species-states.js"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
        }
      }]
    }
  });

  // In --serve mode Vite runs as middleware (no build, no writeBundle), so copy on each
  // Eleventy rebuild instead. Images persist between watch rebuilds since Eleventy doesn't
  // wipe _site/ on partial rebuilds.
  eleventyConfig.on("eleventy.after", async ({ runMode }) => {
    if (runMode !== "serve") return;
    await new Promise((res, rej) => execFile("node", ["scripts/copy-images.js"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
    await new Promise((res, rej) => execFile("node", ["scripts/emit-species-states.js"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
    if (!existsSync("_site/pagefind")) {
      await new Promise((res, rej) => execFile("./node_modules/.bin/pagefind", ["--site", "_site"], (err, stdout) => { if (stdout) process.stdout.write(stdout); if (err) rej(err); else res(); }));
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
