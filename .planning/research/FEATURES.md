# Features Research

**Domain:** Natural history species catalog (regional moth guide)
**Researched:** 2026-04-11
**Sites surveyed:** PNW Moths (original), iNaturalist, eBird, BugGuide, BAMONA, Moth Photographers Group (MPG/MSState)

---

## Table Stakes

Features users expect. Absence causes immediate distrust or departure.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Species factsheet with photos | Core product unit; every comparable site has it | Low | At least one representative photo per species; multiple angles valued |
| Taxonomic name display (scientific + common) | Users arrive via both names; authority citation expected by specialists | Low | Need both on every page and in search index |
| Taxonomic hierarchy / browse path | Users navigate by family/genus, not just direct search | Low | Breadcrumb-style: Family → Subfamily → Genus → Species |
| Distribution map (occurrence dots or range) | BugGuide, BAMONA, iNaturalist, eBird all show this — users expect to see "where is it found" | Medium | Client-side rendering from embedded occurrence JSON is appropriate here |
| Phenology chart (seasonality) | eBird bar charts, BugGuide phenology table, original PNW Moths — shows "when is it flying" | Medium | Bar chart by week or month from occurrence records |
| Search by scientific and common name | Primary discovery path for users who know what they want | Low–Medium | Must index both name types; prefix/substring match preferred over pure full-text |
| Photo credit / attribution | Photographer rights; all comparable sites display this | Low | Mandatory for trust with contributing photographers |
| "Similar species" or related links | Identification sites always have this; users comparing two look-alike species | Low | Links to other species pages; the original model already has this |

**Evidence:**
- PNW Moths original: distribution map, phenology graph, multiple photos, taxonomy breadcrumb, similar species, data filters
- BugGuide: Info tab (description/range), Images tab (community photos), Data tab (map + phenology table by state/month)
- eBird species pages: abundance map, bar chart frequency by week, top media
- BAMONA: distribution maps, species life history, host plants, photographs

---

## Differentiators

Features that create genuine value above the baseline. Not expected, but clearly useful when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Data filters on occurrence records | Original PNW Moths USP: filter map/chart by record type (specimen/photo/literature), date range, collector — turns a display into a research tool | High | Requires client-side JS with embedded JSON; significant build-time data join |
| Photographic plates (multi-species comparison grid) | Unique to specialist moth guides; enables side-by-side identification of look-alike species at a glance — MPG Plates series and original PNW Moths both have this | Medium | See "Photographic Plates" section below |
| Record type differentiation (specimen vs. photograph vs. literature) | Scientifically meaningful: a pinned specimen carries different weight than a photo record | Low | Already in the data model; display it |
| Glossary with images | Domain-specific terminology (forewing, hindwing, discal spot, etc.) is opaque to newcomers; in-context definitions reduce exit rate | Low–Medium | Original site has `GlossaryWord` with optional images |
| NOC (Hodges) checklist number | Standard identifier used by collectors; connects to MPG plates series and published literature | Low | Display on factsheet; used for ordering in plates view |
| Collector / collection attribution | Scientifically meaningful provenance; valued by the entomology community | Low | Already modeled; display on occurrence records |
| Elevation data on records | Relevant for montane species; helps users understand habitat | Low | Already modeled; include in occurrence display |

**Evidence:**
- MPG Plates series: organized by Hodges number, pinned vs. live-moth series — active reference used by moth photographers
- Original PNW Moths: data filters are explicitly called out in the "About the Data" page as a core feature
- BugGuide: record type (photograph = community ID evidence) is core to their trust model

---

## Anti-Features

Things to deliberately not build. Complexity cost exceeds proportional value for this project.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Deep-zoom / Zoomify viewer | Complex legacy feature; requires server-side tile generation; already out of scope per PROJECT.md | Simple lightbox (e.g., GLightbox or native `<dialog>`) with hi-res linked image |
| User-submitted sighting records | Requires authentication, moderation, spam prevention — turns a static site into an app | Link to iNaturalist project or BAMONA for community reporting |
| Community ID / comment threads | Same infrastructure cost as user submissions; BugGuide and iNaturalist already do this well | Link out to BugGuide or iNaturalist for community discussion |
| Real-time range maps (GBIF API, iNaturalist API) | Network dependency defeats static guarantee; API rate limits and availability risk | Embed pre-computed occurrence JSON at build time; regenerate on data updates |
| Admin UI / CMS for editing | Scope explicitly excluded in PROJECT.md; adds infra complexity | Flat file editing with LLM instruction files |
| Lucid interactive key | Complex external integration; already excluded in PROJECT.md | Simple "Identify a moth" landing page linking to external key or browse |
| Full-text species descriptions (long prose) | Original site used django-cms placeholders; most species have no prose; low ROI for authoring cost | Short structured fields (host plant, flight season, habitat notes) in frontmatter; Markdown for species with actual write-ups |
| Taxonomy sync with external authorities (Catalogue of Life, ITIS) | Automated taxonomy management is a research-grade problem; adds pipeline complexity | Manual taxonomy in flat files; note authority and date in species records |

---

## Notes on Photographic Plates

Photographic plates — grids of multiple species photos organized for comparison — remain actively used and valued in moth identification specifically. This is distinct from most other insect groups.

**Why plates are still useful for moths:**
- Moths are identified primarily by wing pattern; side-by-side comparison is how experts work
- Printed field guides universally use plates; users familiar with print guides expect this format online
- MPG (Moth Photographers Group at MSState) maintains an active plates series organized by Hodges number — demonstrating ongoing demand
- Original PNW Moths has photographic plates credited to Merrill Peterson (2021)

**What supersedes plates in some contexts:**
- iNaturalist's taxon photo grid provides similar "browse visually" functionality but requires a live connection and is observation-based, not curated
- BugGuide's Images tab is unstructured (community uploads, variable quality)

**Recommendation:** Keep photographic plates as a feature. The format is appropriate for a curated expert resource. Implement as a simple static grid of images per plate, ordered by Hodges number, with links to individual species pages. This is low complexity once image assets are available. The main risk is that image assets are excluded from the initial PoC (per PROJECT.md constraints).

---

## What Users Expect on a Species Factsheet

Synthesized from BugGuide, BAMONA, iNaturalist, eBird, and original PNW Moths:

1. **Header:** Scientific name (with authority), common name(s), taxonomic breadcrumb (Family → Genus → Species)
2. **Photos:** Primary representative image with photographer credit; thumbnail strip for additional images; click-to-enlarge
3. **Distribution:** Interactive dot map showing occurrence records; filterable by record type at minimum
4. **Phenology:** Bar or histogram chart showing flight period by week or month
5. **Identification notes:** Brief text or structured fields (forewing length, diagnostic features, similar species links)
6. **Occurrence records:** Tabular list or filterable view of raw records (date, location, collector, record type, elevation)
7. **External links:** NOC number, links to MPG, BAMONA, iNaturalist taxon page

---

## Static Search for Species Names

**Pagefind is the right choice** for this project (already in PROJECT.md). Key considerations for species names:

- Scientific names must be indexed as complete strings, not just tokenized words — "Schizura ipomaeae" should match on "schizura", "ipomaeae", or the full binomial
- Common names must also be indexed — users search "sphinx moth" not "Sphingidae"
- Pagefind supports custom metadata fields, which allows boosting species name matches over body text matches
- Pagefind's fragmented index avoids shipping a large JS bundle; suitable for 700 species

**Implementation notes:**
- Add `data-pagefind-meta` attributes to scientific name, common name, and family fields on each species page
- Index the occurrence data page content to enable searching by collector or location
- Pagefind does not support fuzzy matching natively; prefix match works for well-typed scientific names; no workaround needed for the PoC

**Evidence:** Pagefind documentation confirms custom metadata, fragmented index (8kb initial load), multilingual support. Multiple Eleventy + Pagefind integrations documented.

---

## Content Authoring Patterns for Non-Technical Maintainers

**What comparable sites do:**
- BugGuide: community-submitted images with editor moderation (requires accounts, not applicable)
- BAMONA: web form for sighting submissions with photo verification (requires app infrastructure)
- iNaturalist: full mobile/web app (out of scope)
- MPG: curator-managed static HTML pages

**What works for a flat-file static site:**
- Species taxonomy and base data: CSV or JSON, edited directly or via spreadsheet; maintainable without coding knowledge
- Occurrence records: CSV append-only workflow; new records added by appending rows
- Species narrative text: Markdown files per species, one file per species slug; LLM can generate stubs from structured data
- Images: referenced by path in metadata; maintainers add image files and update a manifest CSV
- GitHub web UI: enables editing CSV and Markdown files directly in browser for non-technical contributors without local tooling

**Key constraint:** Maintainers should not need to run a build locally to make content changes. GitHub Actions triggered on push handles the build. This is achievable and is standard practice for Eleventy sites.

**LLM instruction files** (per PROJECT.md) document "how to add a species", "how to add an occurrence record", etc. as plain-English procedures. This is the primary non-technical authoring interface.

---

## Notes on the Original Site

The original pnwmoths.biol.wwu.edu has these features worth preserving in the PoC:

- Data filters on the factsheet (record type, date, collector) — this is the site's distinctive research utility; it should not be downgraded to a simple list
- Photographic plates section with curatorial credit (Merrill Peterson)
- Glossary with optional images — low-hanging fruit, easy to implement as Markdown files
- "About the Key" and "About the Data" explanation pages — users of specialist sites read these; include as Markdown content pages
- The URL structure `browse/family-{family}/subfamily-{subfamily}/{genus}/{species}/` — preserving this aids SEO continuity and avoids breaking any existing external links

**What is broken or lower priority:**
- Zoomify deep-zoom: broken JS, already out of scope
- Lucid key integration: external dependency, out of scope
- Some taxonomy hierarchy pages may have been CMS-managed rich text; replace with auto-generated index pages from flat-file data

---

## Feature Dependencies

```
Occurrence records (CSV) → Distribution map
Occurrence records (CSV) → Phenology chart
Occurrence records (CSV) → Data filters on factsheet
Species images (path refs) → Photo gallery
Species images → Photographic plates
Taxonomy hierarchy → Browse navigation
Taxonomy hierarchy → Breadcrumb on factsheet
Glossary terms → Glossary page (standalone, no cross-linking needed in PoC)
Static search index → Search page (built by Pagefind post-build)
```

## MVP Recommendation

Prioritize:
1. Species factsheet with photos, taxonomy breadcrumb, distribution map, phenology chart — the core product
2. Static search indexing scientific and common names
3. Browse by family/genus
4. Occurrence records display (tabular, minimal filtering in PoC)

Defer to later phases:
- Data filters on map/chart (high complexity; validate basic factsheet first)
- Photographic plates (image assets excluded from PoC)
- Glossary (useful but not factsheet-critical)
- "About" content pages (can be stubs in PoC)

---

## Sources

- [PNW Moths — original site](https://pnwmoths.biol.wwu.edu/)
- [PNW Moths — About the Data](https://pnwmoths.biol.wwu.edu/explore-data/about-data/)
- [BugGuide — Wikipedia overview](https://en.wikipedia.org/wiki/BugGuide)
- [BugGuide orientation guide](https://www.pheasantbranch.org/fauna/bugguideIntro.html)
- [BAMONA — butterfliesandmoths.org](https://www.butterfliesandmoths.org/)
- [Moth Photographers Group — Plates Series](https://mothphotographersgroup.msstate.edu/Plates.shtml)
- [eBird — Announcing Explore Species](https://ebird.org/news/announcing-explore-species)
- [eBird — Bar Charts Help](https://support.ebird.org/en/support/solutions/articles/48001255130-ebird-bar-charts-and-graphs)
- [Pagefind — Static Search](https://pagefind.app/)
- [Pagefind — Multilingual docs](https://pagefind.app/docs/multilingual/)
- [Axis Maps — Should a map be interactive?](https://www.axismaps.com/guide/should-a-map-be-interactive)
