import { EleventyRenderPlugin } from "@11ty/eleventy";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

  // Species images are copied post-Vite by scripts/copy-images.js

  // Passthrough copy for component source files so Vite can find them
  eleventyConfig.addPassthroughCopy({ "src/components": "components" });

  // Theme CSS and banner image assets
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });

  // Vite plugin: bundles client-side JS components
  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      appType: "mpa",
      base: "/pnwmoths/",
    }
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
