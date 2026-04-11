# Pitfalls Research

**Project:** PNW Moths Static Site (pnwmoths.biol.wwu.edu rebuild)
**Researched:** 2026-04-11
**Scope:** Pitfalls dimension — migration from Django/django-cms to Eleventy static site

---

## CMS → Markdown Migration

### Pitfall: django-cms plugin markup has no Markdown equivalent

**What goes wrong:** django-cms stores content in "placeholder" blocks rendered by plugins (text, image, accordion, etc.). The HTML that comes out of djangocms-text (CKEditor) often includes plugin-generated wrapper divs, CSS classes applied inline, shortcode-like structures, and semantic elements (`<figure>`, `<aside>`, `<details>`) that have no Markdown equivalent. Automated HTML→Markdown converters (Turndown, Pandoc) silently drop these or emit raw HTML blocks, so the output looks fine in preview but the converted file is lossy.

**Likelihood for this project:** Likely. The existing site has CMS-managed rich text on species factsheets (the "similar species" descriptions and general prose). Even if the content is simple, spot-checking every converted page is mandatory.

**Mitigation:**
- Audit the actual CMS output HTML before writing conversion scripts. Inventory which HTML patterns exist (tables? figures? custom classes?).
- Use Pandoc with `--wrap=none` and `--markdown-headings=atx` for bulk conversion; it handles tables and most semantic elements better than Turndown for one-off migrations.
- After conversion, run a diff between rendered-from-Markdown and rendered-from-HTML to catch silent losses.
- Accept that some pages will need manual cleanup. Budget time for this, especially for any pages with embedded images or tables.
- Since the PoC explicitly says to replace CMS rich text with Markdown files per species, establish a schema: one file per species, defined front-matter fields, body = free prose only. This constrains scope.

---

### Pitfall: URL structure changes break incoming links and SEO

**What goes wrong:** The existing site has URLs like `/species/Acronicta-americana/`. If the static rebuild uses a different slug strategy (e.g., lowercase, genus-species joined differently), every inbound link from iNaturalist, BAMONA, or research papers breaks silently.

**Likelihood for this project:** Possible. The original Django URL patterns are deterministic from the model, but the static site's slug generation could diverge unless explicitly matched.

**Mitigation:**
- Extract the full URL list from the live site before migration (or from the nightly static snapshot).
- Generate slugs in Eleventy using the same algorithm as Django (typically `genus-species`, preserving case as Django does).
- Configure a `_redirects` file (Netlify) or GitHub Pages equivalent for any URLs that cannot be matched exactly.

---

## Flat Files at Scale

### Pitfall: Eleventy loads all data into memory before paginating — 10k occurrence records means a large in-memory dataset

**What goes wrong:** Eleventy's data cascade loads all global data files into Node.js memory at startup. A CSV or SQLite query returning 10,000 occurrence records joined to 700 species will be resident in memory for the entire build. This is fine at current scale but will become a build-time bottleneck if the dataset grows. More concretely: if the JS data file does a naive `db.prepare("SELECT * FROM occurrences").all()`, Node holds all ~10k rows plus all species metadata simultaneously.

**Likelihood for this project:** Possible now, likely if data grows. 10k rows is well within Node's comfort zone (~50MB), but the pattern matters for sustainability.

**Mitigation:**
- In the SQLite data file for species pages, query only the records for each species at page-generation time (use pagination + per-page data), not a full table load.
- Index `occurrences` on `species_id`. A per-species `WHERE species_id = ?` query costs microseconds.
- Keep the full occurrence dataset as a single query only if you need it for the map/search index; fetch it once, not per-page.
- Benchmark build time early in the PoC. Eleventy's `--dryrun` mode and `DEBUG=Eleventy:Benchmark` flag expose per-template timings.

---

### Pitfall: CSV files are not a reliable data interchange format

**What goes wrong:** CSV has no schema enforcement. Two contributors saving the same file in Excel on different OS versions will produce: different line endings (CRLF vs LF), different encodings (UTF-8 vs Windows-1252), inconsistent quoting of fields that contain commas, and silently mangled dates (Excel auto-converts "2023-08-15" to "8/15/2023" on save). For a natural history dataset, this is especially dangerous: species authorities often contain parentheses, accented characters (Hübner, Zetterstedt), and em dashes.

**Likelihood for this project:** Likely. Scientists use Excel. This will happen.

**Mitigation:**
- Prefer SQLite as the authoritative store. CSV is an export/import format, not the source of truth.
- If CSV is used as source of truth (simpler for maintainers), write a validation script (`validate-csv.js`) that runs at build time and fails loudly on: non-UTF-8 bytes, unexpected column count, empty required fields, date fields that don't parse as ISO 8601, lat/long outside valid ranges.
- Document the correct workflow for maintainers: "Download → edit in LibreOffice or Google Sheets → export as CSV UTF-8 → commit." Not Excel on Windows.
- Add a CI check that runs the validation script before any deploy.

---

### Pitfall: SQLite file checked into git can cause merge conflicts

**What goes wrong:** SQLite is a binary format. Two contributors editing the database independently and merging in git will produce a corrupt file or a confusing merge conflict. git's merge strategies cannot resolve binary conflicts.

**Likelihood for this project:** Possible, especially once non-technical maintainers are involved.

**Mitigation:**
- If SQLite is the authoritative store, make it write-once from a canonical CSV or scripts, not hand-edited. The database is regenerated from CSVs at build time via a seed script — git stores CSVs, not the `.db` file.
- Add `*.db` to `.gitignore` if the DB is derived; commit only the seed data.
- Alternatively, use SQLite only as a read-only build artifact, with CSV as the committed source.

---

## Static Search Limitations

### Pitfall: Pagefind does not support fuzzy matching on prefix typos

**What goes wrong:** Pagefind indexes by word fragments, but its fuzzy matching only works when the correct characters appear in the correct order. If the user types "Acrnoicta" (transposition), Pagefind returns nothing. Pagefind also does not support wildcard searches or regex. Users from a server-side search (Sphinx, Elasticsearch, even basic SQL `LIKE`) will expect typo tolerance.

**Likelihood for this project:** Possible. The species names are long and technical (e.g., "Acronicta americana", "Catocala neogama") — easy to misspell, and the user population includes people looking up names they half-remember.

**Mitigation:**
- Accept this limitation for the PoC. The goal is to validate static search, not achieve parity with server-side.
- Mitigate UX impact by ensuring common names are indexed alongside scientific names, so users can search "sweetheart moth" and find "Catocala amatrix."
- If fuzzy matching is a hard requirement post-PoC, evaluate Fuse.js (client-side fuzzy, higher memory) or a hosted service like Algolia.
- Document this limitation explicitly in the PoC validation findings.

---

### Pitfall: Pagefind index size grows with occurrence data embedded in pages

**What goes wrong:** If each species page embeds its full occurrence JSON (lat/long, date, collector, location for hundreds of records), Pagefind will index that structured data as searchable text. Collector names, location strings, and counties will bloat the index and pollute search results (searching "Lane County" returns every species with a Lane County record, not a useful result).

**Likelihood for this project:** Likely. The PoC requirement explicitly embeds occurrence JSON at build time for the map/chart. Pagefind will index it unless excluded.

**Mitigation:**
- Use `data-pagefind-ignore` attribute on the `<script>` block or element containing the occurrence JSON, or place it in a script tag (which Pagefind skips by default).
- Alternatively, keep occurrence data out of the HTML entirely: load it from a separate JSON file via client-side fetch. This also reduces page size.
- Test Pagefind index size with a representative sample before committing to the approach.

---

### Pitfall: Pagefind search cannot filter by faceted attributes without custom UI work

**What goes wrong:** The existing site presumably supports filtering by state, county, or family. Pagefind supports filters (metadata fields) but they require intentional markup (`data-pagefind-filter="state:Oregon"` on each element) and a custom UI — the default Pagefind UI widget has no faceted navigation.

**Likelihood for this project:** Possible for PoC, likely for production. Browse-by-family is a stated feature.

**Mitigation:**
- For the PoC, treat search as full-text only. Browse-by-family is a separate feature implemented as static index pages, not search filters.
- If filter search is needed post-PoC, plan for custom Pagefind JavaScript API integration.

---

## Hosting Gotchas

### Pitfall: GitHub Pages 1 GB published site limit

**What goes wrong:** GitHub Pages enforces a recommended 1 GB limit on the published site. For 700 species pages plus occurrence JSON, a search index, and bundled JS, this is unlikely to be hit with text alone — but the moment any image assets are included (even thumbnails), it becomes a real constraint. The limit is described as "soft" but GitHub has been known to disable sites that consistently exceed it.

**Likelihood for this project:** Unlikely while images are excluded, possible if images are ever included.

**Mitigation:**
- Keep images out of the repo (already the stated approach). Reference them by path only.
- Monitor repo + published site size as part of CI. Add a build check that warns if output exceeds 800 MB.
- If the site outgrows GitHub Pages, Netlify (free tier: 100 GB bandwidth/month) is the natural fallback with no published site size limit.

---

### Pitfall: GitHub Pages has no server-side redirect support; redirect files must be pre-generated

**What goes wrong:** GitHub Pages serves static files only. There is no `_redirects` file support (that's Netlify). To implement redirects on GitHub Pages, you must either: (a) generate HTML redirect stub files at build time, or (b) use a JavaScript meta-refresh trick. Neither is clean. If the original site's URLs need to be preserved, this requires generating stub files for every old URL at build time.

**Likelihood for this project:** Possible. The nightly static snapshot is the current live site, so its URL structure is the baseline. If the static rebuild changes any URL pattern, some form of redirect is needed.

**Mitigation:**
- Match the original URL structure exactly to avoid needing redirects at all.
- If redirects are needed, prefer Netlify over GitHub Pages — `_redirects` file is simple and well-documented.
- For the PoC, declare URL stability a goal and test against the scraped URL list.

---

### Pitfall: Linux filesystem case sensitivity vs. macOS development

**What goes wrong:** macOS filesystems are case-insensitive by default. A file named `Acronicta-Americana.html` and a link to `acronicta-americana.html` work fine locally but produce 404s on GitHub Pages (Linux, case-sensitive). This is a particularly sharp edge for species names because genus names are capitalized and species epithets are lowercase — inconsistent slug generation creates hard-to-find bugs.

**Likelihood for this project:** Likely during development. Species slugs involve capitalized genus names; it's easy to generate `Acronicta-americana` in one place and `acronicta-americana` in another.

**Mitigation:**
- Standardize all slugs to lowercase at generation time in Eleventy (`.toLowerCase()`).
- Add a CI linting step that checks for inconsistent case in internal links.
- Test every deploy on a Linux environment (GitHub Actions, Netlify preview), not just locally.

---

## Non-technical Maintainers + Flat Files

### Pitfall: Excel silently corrupts species authority names and dates on save

**What goes wrong:** Excel on Windows auto-formats cells it recognizes as dates. "1923" (a publication year) becomes a date serial. An authority like "(Smith, 1908)" may be left alone, but a cell starting with a number followed by text may be auto-converted. More critically: Excel saves CSV in Windows-1252 encoding by default (not UTF-8) on older versions. Characters like the degree symbol in elevation fields (°), accented authority names (Hübner → HŸbner), and em dashes in locality strings are silently corrupted. This corruption is invisible until build time or user-facing display.

**Likelihood for this project:** Likely. The dataset contains authority names with accented characters (common in Lepidoptera taxonomy), elevation data, and locality strings. Scientists use Excel.

**Mitigation:**
- Write a `validate-data.js` script that checks for non-UTF-8 bytes and known-bad character sequences before every build.
- Provide a template CSV with locked headers and data validation rules (date format, lat/long range) that maintainers use when adding records.
- Prefer Google Sheets for collaborative editing — it handles UTF-8 natively and exports clean UTF-8 CSV.
- Document in the LLM instruction files: "Always export as CSV UTF-8, not CSV (Windows)."
- Add a git pre-commit hook that runs the validation script.

---

### Pitfall: Maintainers introduce extra columns, rename headers, or reorder columns

**What goes wrong:** CSV files have no enforced schema. A maintainer adding a new "notes" column, renaming "collector" to "Collector", or inserting a blank column for visual spacing will silently break the build data pipeline. The JavaScript data loader assumes column names and order; unexpected changes cause records to be silently dropped or mapped to wrong fields.

**Likelihood for this project:** Likely over time. Non-technical maintainers treat spreadsheets as flexible.

**Mitigation:**
- Parse CSVs by column name, not column index. Use a library like `csv-parse` with `columns: true`.
- The validation script should check that required columns exist with exact names, and warn on unexpected columns (don't fail — the extra column is benign, but the warning surfaces the change).
- Document column names and their meaning in the LLM instruction file (the maintainer-facing docs).

---

### Pitfall: Bare species names trigger merge conflicts in CSV when two maintainers add records

**What goes wrong:** If two contributors add occurrence records to the same CSV file in separate branches, git will attempt a line-level merge. CSVs are text files, so git can merge them — but it produces duplicate header rows, incorrect line orderings, or conflict markers inserted mid-file if the same region was edited. The merge conflict markers break the CSV parser.

**Likelihood for this project:** Possible once more than one person is actively adding records.

**Mitigation:**
- Use a single-record-per-line format with a stable sort key (species_id + date + collector) to make merges more deterministic.
- Alternatively, split occurrence records into per-species CSV files (one file per species). Concurrent edits to different species never conflict. This matches the Markdown-per-species pattern already in use for prose.
- Document the "one record per line, never reorder" norm for contributors.

---

## Eleventy + Vite Integration

### Pitfall: eleventy-plugin-vite requires ESM; CommonJS Eleventy configs need a dynamic import workaround

**What goes wrong:** `@11ty/eleventy-plugin-vite` is written as ESM-only. If the project's `.eleventy.js` uses CommonJS (`require()`), adding the plugin requires converting the config to use `async` + `await import()`. This is a non-obvious step that the error message does not explain clearly: the build fails with a `require is not a function` or similar ESM error.

**Likelihood for this project:** Likely if starting from a CommonJS Eleventy config template, which is still common in tutorials.

**Mitigation:**
- Start with `.eleventy.cjs` or use `"type": "module"` in `package.json` from the start.
- If converting an existing CommonJS config, the pattern is: `module.exports = async function(eleventyConfig) { const { EleventyVite } = await import("@11ty/eleventy-plugin-vite"); ... }`.
- Pin to a specific version of the plugin and test before upgrading — the plugin has had breaking changes across Eleventy 2.x versions.

---

### Pitfall: Eleventy output directory conflicts with Vite's input/output expectations

**What goes wrong:** The plugin runs Vite over Eleventy's output directory. If Vite's build output and Eleventy's output directory are not carefully aligned, the final deploy directory can contain double-processed files, missing files, or Vite manifest files that shouldn't be served. A specific known issue: files written to a non-standard output path (e.g., locale-prefixed paths like `_site/en/`) cause "was not in output directory" errors during Vite post-processing.

**Likelihood for this project:** Possible. The PoC has a straightforward URL structure, but if locale or subdirectory paths are introduced later, this bites.

**Mitigation:**
- Use the default `_site` output directory and don't customize Vite's `outDir` unless necessary.
- Keep the output directory structure flat: all species pages at `/species/[slug]/`, no locale prefixes for the PoC.
- Test a production build (`eleventy --serve=false` + Vite build) in CI, not just the dev server. Dev server hides some output directory issues.

---

### Pitfall: Vite dev server and Eleventy dev server can interfere on port conflicts and HMR

**What goes wrong:** When running both Eleventy's dev server and Vite in watch mode, port assignments and HMR (Hot Module Replacement) websocket connections can conflict or cause double-refresh cycles. The official plugin handles this by running Vite as middleware inside Eleventy's server, but custom configurations that split them can cause confusing behavior where changes don't reflect, or the page reloads twice per save.

**Likelihood for this project:** Possible during development. Using the plugin's integrated mode avoids this.

**Mitigation:**
- Use `@11ty/eleventy-plugin-vite` in its default integrated mode (Vite as middleware), not as a separate process.
- Do not run `vite dev` and `eleventy --serve` simultaneously as separate processes.
- Document the correct dev command in the project README.

---

## Image Handling Without a CDN

### Pitfall: Build generates pages with broken `<img>` tags that cause layout shift and accessibility failures

**What goes wrong:** Images are excluded from the repo and referenced by path. When a species page renders with an `<img src="/images/species/12345.jpg">` pointing to a file that does not exist in the build output, the browser shows a broken image icon. On a species page with a slideshow (the PoC requirement), this breaks the entire image component's layout and may cause JS errors in the slideshow initialization code.

**Likelihood for this project:** Certain. Images are explicitly out of scope for the repo. Every species page will have broken image references in the development environment.

**Mitigation:**
- In the Eleventy data pipeline, distinguish between "image path exists in local checkout" and "image path is known." Render `<img>` tags with the expected path regardless, but wrap the image component in logic that handles a load error gracefully (CSS `img { object-fit: contain; }` + an `onerror` handler that shows a placeholder).
- Write a validation script that checks which image paths in the data are present in a configured image directory (which may be empty or a local mount), and reports counts. This is not a build failure — it's a warning.
- In the PoC, stub the image slideshow: if no images are present, show a "no images available" placeholder without throwing errors.
- Document the expected image directory structure so that anyone with access to the image assets can mount them locally and get a fully-rendered build.

---

### Pitfall: Image path references in data diverge from filesystem paths over time

**What goes wrong:** The existing Django site stores image paths relative to `MEDIA_ROOT`. If the static site uses a different base path or directory structure for images, every image reference in the data is wrong. This is a silent failure — the build succeeds, but every `<img>` is broken in production.

**Likelihood for this project:** Likely during initial migration. The Django `SpeciesImage` model stores paths that assume Django's media serving. A static site will use a different path convention (e.g., `/images/species/` vs. `/media/pnwmoths/species/`).

**Mitigation:**
- During data extraction from Django, normalize all image paths to the static site's convention and store normalized paths in the flat file data.
- Write a path normalization function used consistently everywhere an image path is referenced.
- The validation script should report path prefixes found in image data, making divergence obvious.

---

### Pitfall: Git LFS or large file storage for images creates deployment complexity

**What goes wrong:** If the decision is ever made to include images in the repo (e.g., thumbnails only), Git LFS requires specific setup on every contributor's machine and in CI. GitHub Pages does not serve Git LFS files — it only serves the LFS pointer files, resulting in broken images in production.

**Likelihood for this project:** Unlikely as long as the "images excluded" decision holds, but worth flagging if it's reconsidered.

**Mitigation:**
- Do not use Git LFS for anything that needs to be served directly by GitHub Pages.
- If thumbnails must be in the repo, store them as regular git objects (< 5 MB total is safe; 100 thumbnails at ~30KB each = ~3 MB).
- Prefer an external image host (even a simple S3 bucket or the university's web server) over Git LFS for GitHub Pages deployments.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Data extraction from Django | SpeciesImage path normalization wrong | Extract + normalize paths in same script; validate immediately |
| CSV data pipeline | Excel encoding corruption | Validate UTF-8 at build time before any other processing |
| Species page build | Occurrence JSON bloating Pagefind index | Use `data-pagefind-ignore` or load JSON via fetch |
| Search implementation | No fuzzy matching on scientific names | Document limitation; mitigate with common name indexing |
| Eleventy + Vite setup | ESM/CommonJS mismatch | Start ESM-first |
| Image slideshow | All images missing in dev | Implement graceful `onerror` fallback before testing slideshow |
| GitHub Pages deployment | Case sensitivity on species slugs | Normalize all slugs to lowercase; test on Linux CI |
| Non-technical editor workflow | CSV corruption from Excel | Prefer Google Sheets; validate on every commit |
