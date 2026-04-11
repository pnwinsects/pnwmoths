export default function (eleventyConfig) {
  // Passthrough copy: per-species Parquet files from data/parquet/{slug}/ to _site/species/{slug}/
  // data/parquet/acronicta-americana/records.parquet -> _site/species/acronicta-americana/records.parquet
  eleventyConfig.addPassthroughCopy({ "data/parquet": "species" });

  return {
    dir: {
      input: "src",
      output: "_site",
      data: "_data"
    }
  };
}
