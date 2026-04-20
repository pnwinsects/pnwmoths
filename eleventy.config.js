import { EleventyRenderPlugin } from "@11ty/eleventy";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";

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
      base: "/pnwmoths/",
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
  });

  return {
    pathPrefix: "/pnwmoths/",
    dir: {
      input: "src",
      output: "_site",
      data: "_data"
    }
  };
}
