---
phase: 02-species-factsheet-static
verified: 2026-04-11T00:00:00Z
status: verified
score: 5/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Every page has site-wide navigation linking to browse, search, glossary, and home"
    status: partial
    reason: "Navigation HTML is present and correct on all pages, but the Pico CSS stylesheet is referenced in every page's <link> tag yet the file does not exist in _site/css/. @picocss/pico is declared in package.json but not installed (npm ls shows empty). The passthrough copy silently no-ops. Pages are navigable but unstyled."
    artifacts:
      - path: "node_modules/@picocss/pico/css/pico.min.css"
        issue: "File missing — @picocss/pico not installed despite being in package.json"
      - path: "_site/css/pico.min.css"
        issue: "Not generated — passthrough copy source does not exist"
    missing:
      - "Run `npm install` to install @picocss/pico or run `npm install @picocss/pico` explicitly"
      - "Verify `_site/css/pico.min.css` exists after reinstall"
---

# Phase 2: Species Factsheet (Static) Verification Report

**Phase Goal:** Every species page is complete as a static document — readable, navigable, and correct without any JavaScript.
**Verified:** 2026-04-11
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Species page displays scientific name, common name, NOC ID, authority, and prose description (when a Markdown file exists) | VERIFIED | `_site/species/acronicta-americana/index.html` contains `<dl>` with Common name/NOC ID/Authority/Family dt-dd pairs and a prose `<p>` rendered from `src/content/species/acronicta-americana.md`; autographa-californica has no prose file and shows no broken content |
| 2 | Species page shows photos with photographer credit; pages with no images show graceful placeholder | VERIFIED | `_site/species/acronicta-americana/index.html` contains two `<figure>` blocks with `<figcaption>Jane Doe</figcaption>` and `<figcaption>John Smith</figcaption>`; `_site/species/autographa-californica/index.html` contains `<div aria-label="No images available for this species">No photos on file</div>` with no `<img>` tag |
| 3 | Species page lists similar species as working links to their respective pages | VERIFIED | `_site/species/acronicta-americana/index.html` contains `<a href="/species/autographa-californica/">autographa-californica</a>`; `_site/species/hyles-lineata/index.html` has links to manduca-sexta and smerinthus-cerisyi, both of which exist as built pages |
| 4 | Browse page lists all species grouped by family then genus, and each genus has its own listing page | VERIFIED | `_site/browse/index.html` renders two `<h2>` family headings (Noctuidae, Sphingidae) with genus `<h3>` links; all five genus pages exist (`acronicta`, `autographa`, `hyles`, `manduca`, `smerinthus`); each genus page links to its species factsheet (e.g., `_site/browse/acronicta/index.html` links to `/species/acronicta-americana/`) |
| 5 | Every page has site-wide navigation linking to browse, search, glossary, and home | PARTIAL | Navigation HTML (`<nav><ul><li><a>`) with all four links is present in every page; `_site/search/index.html` and `_site/glossary/index.html` exist and are reachable. However, `@picocss/pico` is declared in `package.json` but is not installed — `node_modules/@picocss/pico/` does not exist. The Eleventy passthrough copy silently skips the missing source, so `_site/css/pico.min.css` is absent. Every page references `/css/pico.min.css` with a `<link>` tag that resolves to a 404. Pages are navigable but completely unstyled. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/species.csv` | Extended schema with family and similar_species | VERIFIED | Header: `id,genus,species,common_name,noc_id,authority,family,similar_species` |
| `data/images.csv` | Image metadata CSV | VERIFIED | Header: `species_id,filename,photographer,weight,license`; 3 rows |
| `src/_data/species.js` | DuckDB query with family, similar_slugs, string id | VERIFIED | SELECT includes `family`, `similar_slugs` via CASE/string_split, `row.id = String(row.id)` normalization |
| `src/_data/images.js` | DuckDB images grouped by string species_id | VERIFIED | Groups rows into `bySpecies` object keyed by `String(row.species_id)` |
| `src/_data/families.js` | DuckDB genus/family tree for browse pages | VERIFIED | Returns `{ genera, genusArray }` from two queries; `genusArray` groups species by genus_slug |
| `src/_includes/base.njk` | Shared layout with nav and Pico CSS link | VERIFIED | Contains `{{ content | safe }}` (correct Eleventy layout pattern), nav with all four links, `<link rel="stylesheet" href="/css/pico.min.css">` |
| `src/species/species.njk` | Complete species factsheet template | VERIFIED | `layout: base.njk`, `<dl>` taxonomy, `renderFile` for prose, image loop with placeholder, similar_slugs links |
| `src/browse/index.njk` | All-species browse grouped by family/genus | VERIFIED | Iterates `families.genera` with family `<h2>` breaks and genus `<h3>` links |
| `src/browse/genus.njk` | Per-genus listing via Eleventy pagination | VERIFIED | Paginates `families.genusArray`, links to `/species/{slug}/` |
| `src/search/index.njk` | Reachable search stub | VERIFIED | "Search coming soon" in built `_site/search/index.html` |
| `src/glossary/index.njk` | Reachable glossary stub | VERIFIED | "Glossary coming soon" in built `_site/glossary/index.html` |
| `src/content/species/acronicta-americana.md` | Sample prose for smoke test | VERIFIED | Rendered as `<p>` in species page via `renderFile` |
| `eleventy.config.js` | Passthrough copies + fileExists filter + RenderPlugin | PARTIAL | Plugin and filter wired correctly; passthrough copy for Pico CSS configured but source package not installed |
| `node_modules/@picocss/pico/css/pico.min.css` | Pico CSS stylesheet | MISSING | `@picocss/pico` in package.json dependencies but not installed |
| `_site/css/pico.min.css` | Built CSS asset | MISSING | Passthrough copy source does not exist; Eleventy silently skips it |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/species/species.njk` | `src/_data/images.js` | `images[sp.id]` template lookup | WIRED | Template line 25: `{% set spImages = images[sp.id] %}`; images.js keyed by string species_id; species.js normalizes id to string |
| `src/species/species.njk` | `src/_includes/base.njk` | `layout: base.njk` front matter | WIRED | Front matter line 1: `layout: base.njk`; base.njk uses `{{ content | safe }}` for injection |
| `src/_includes/base.njk` | `/css/pico.min.css` | `<link rel="stylesheet">` | BROKEN | Tag exists in base.njk; `_site/css/pico.min.css` does not exist |
| `src/browse/index.njk` | `src/_data/families.js` | `families.genera` data reference | WIRED | Template iterates `families.genera`; built page renders Noctuidae and Sphingidae headings |
| `src/browse/genus.njk` | `src/_data/families.js` | `families.genusArray` pagination data | WIRED | Pagination `data: families.genusArray`; 5 genus pages built |
| `src/browse/genus.njk` | `src/species/species.njk` | `href="/species/{slug}/"` | WIRED | `_site/browse/acronicta/index.html` links to `/species/acronicta-americana/`; target page exists |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/species/species.njk` | `sp` (species object) | `src/_data/species.js` → DuckDB → `data/species.csv` | Yes | FLOWING — DuckDB query reads CSV, returns 5 real rows; rendered pages show real names/IDs |
| `src/species/species.njk` | `spImages` | `src/_data/images.js` → DuckDB → `data/images.csv` | Yes | FLOWING — images grouped by string species_id; acronicta-americana shows 2 photographer-credited figures |
| `src/browse/index.njk` | `families.genera` | `src/_data/families.js` → DuckDB | Yes | FLOWING — `_site/browse/index.html` has real family and genus names from CSV |
| `src/browse/genus.njk` | `genusData` | `src/_data/families.js` → DuckDB | Yes | FLOWING — each genus page lists real species with links |

### Behavioral Spot-Checks

| Behavior | Result | Status |
|----------|--------|--------|
| `npm run build` exits 0 | Exit 0; 14 HTML + 8 passthroughs written | PASS |
| `npm test` — all 6 tests pass | 6/6 pass, 0 fail | PASS |
| Species page for species-with-images shows `<figcaption>` | `_site/species/acronicta-americana/index.html` contains `<figcaption>Jane Doe</figcaption>` | PASS |
| Species page for species-without-images shows "No photos on file", no `<img>` | `_site/species/autographa-californica/index.html` matches | PASS |
| Species page with prose renders Markdown as HTML `<p>`, not raw text | `<p>The American Dagger Moth...` found in built HTML | PASS |
| Browse index has family-then-genus grouping | Noctuidae before Sphingidae; genus links under each | PASS |
| Each genus page links to species factsheets | `/browse/acronicta/index.html` → `/species/acronicta-americana/` | PASS |
| `_site/css/pico.min.css` exists | File absent; `_site/css/` directory does not exist | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|------------|--------|----------|
| SPEC-02 (prose description when Markdown file present) | 02-01 | SATISFIED | `renderFile` with `fileExists` guard; rendered in acronicta-americana page |
| SPEC-03 (photos with photographer credit, graceful placeholder) | 02-01 | SATISFIED | `<figcaption>` on image pages; "No photos on file" `<div>` on imageless pages |
| SPEC-04 (similar species as working links) | 02-01 | SATISFIED | `similar_slugs` array linked to existing pages |
| BRWS-01 (browse page grouped by family then genus) | 02-02 | SATISFIED | `_site/browse/index.html` has family `<h2>` + genus `<h3>` structure |
| BRWS-02 (per-genus listing page) | 02-02 | SATISFIED | 5 genus pages built at `/browse/{genus}/` |
| BRWS-03 (site-wide nav on every page) | 02-01 | PARTIAL | Nav HTML present; Pico CSS missing means pages are functionally navigable but visually unstyled |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `_site/content/species/acronicta-americana/index.html` | Eleventy published prose .md as standalone page at unintended URL | Warning | Unintended page at `/content/species/acronicta-americana/`; page contains only the prose paragraph without any layout or navigation. Not user-facing in current PoC (no links to it), but pollutes the site output and would be indexed by search engines. Fix: add `permalink: false` or `eleventyExcludeFromCollections: true` front matter to the prose .md file. |

### Human Verification Required

None — all structural checks were automatable.

### Gaps Summary

**One gap blocking full goal achievement:**

Pico CSS (`@picocss/pico`) is listed as a dependency in `package.json` but is not installed in `node_modules`. The Eleventy passthrough copy is correctly configured in `eleventy.config.js`, but since the source file does not exist, Eleventy silently skips the copy. As a result, `_site/css/pico.min.css` is absent and every page's `<link rel="stylesheet" href="/css/pico.min.css">` resolves to a 404.

The pages are readable and navigable without the stylesheet (plain browser defaults apply), but the success criterion "every page has site-wide navigation" implies a functional, styled page — not a deliberately unstyled one. More practically, the SUMMARY explicitly claims "Pico CSS installed" and the build was verified at the time as having 8 passthroughs, one of which should have been `pico.min.css`. That passthrough count suggests the CSS was present when the SUMMARY was written but was lost (e.g., `node_modules` wiped without reinstall).

**Fix:** Run `npm install` (or `npm install @picocss/pico`) in the project root, then verify `_site/css/pico.min.css` exists after the next `npm run build`.

**Secondary observation (warning, not a blocker):**

`src/content/species/acronicta-americana.md` has no front matter, so Eleventy publishes it as a standalone page at `_site/content/species/acronicta-americana/index.html`. That page has no layout, no nav, and is just a bare `<p>` tag. This is not a goal blocker for Phase 2 (no nav link points to it), but it should be suppressed before Phase 4's link checker runs, or the link checker will flag it as an orphan.

---

_Verified: 2026-04-11_
_Verifier: Claude (gsd-verifier)_
