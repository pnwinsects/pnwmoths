# Phase 43: Character Illustration Images - Research

**Researched:** 2026-06-25
**Domain:** bunny.net Storage upload pipeline · WebP conversion · CSV-driven curator mapping · Lit Light-DOM `<details>` expanders
**Confidence:** HIGH (all key code paths read in-repo; source images, tooling, and matcher coverage verified by direct execution)

## Summary

Phase 43 is almost entirely a *clone-and-adapt* exercise against well-established in-repo patterns, plus one one-off matcher script and a small render addition. Three deliverables: (1) `scripts/upload-images.ts` (`npm run key:upload-images`) mirroring `scripts/upload-tiles.ts`'s curl-PUT / `DRY_RUN=1` / `withRetry` / idempotent-overwrite shape; (2) a one-off matcher that writes a committed draft `data/key-character-images.csv`; (3) a per-state `<details>/<summary>` expander in `pnwm-identify.ts` `_renderQuestion()`.

The repo is well-prepared: the `Character` Zod schema **already carries `image_filename: z.nullable(z.string())`** (src/types/schemas.ts:163, "null until Phase 43 curator pass"), so the data contract reaching the client is already in place — the work is to *populate* it from the CSV in `build-key.ts` rather than hardcoding `null`. The CDN base (`https://pnwmoths.b-cdn.net`) is an absolute URL **not** subject to `pathPrefix`, so help-image `<img src>` is `${CDN_BASE_URL}/key-images/${encodeURIComponent(filename)}` and the GITHUB_PAGES concern does *not* apply to CDN URLs (it applies only to site-relative links).

Direct verification: the source dir holds exactly **2,003 files; 197 are non-specimen** under the CONTEXT exclusion regex (matches the "~198" estimate). Both `cwebp` 1.6.0 and `vips` 8.18.3 (with WebP support) are installed; the project already shells out to libvips elsewhere (`tile-photos.ts`). A normalization-based matcher (strip `US_`/`Ecoprovince_` prefixes, lowercase, strip `copy`/punctuation) yields **77 exact normalized matches** today — meaningfully better than the 49 cited in CONTEXT, confirming the normalization rules carry real coverage weight.

**Primary recommendation:** Clone `upload-tiles.ts` → `upload-images.ts` (directory-walk over the 197 filtered files, WebP-convert via `vips`, curl-PUT to `key-images/`, idempotency via HEAD-check since there's no manifest). Add a one-off `scripts/match-character-images.ts` that writes the committed draft CSV. Populate `Character.image_filename` in `build-key.ts` from the CSV (with out-of-range warning + soft-skip). Render a per-state `<details>` in `_renderQuestion()` when `char.image_filename` is non-null, sourcing `${CDN_BASE_URL}/key-images/<file>.webp`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WebP conversion + CDN upload | Local build script (Node CLI) | — | One-off/idempotent operator task; no server (project memory: "No datacenter server") |
| Curator mapping (draft generation) | Local one-off script | Curator (manual hand-edit) | D-07: machine draft, human refine |
| CSV validation + inline into page data | Build (`build-key.ts` → `key-matrix.json`) | Eleventy `_data/keyMatrix.ts` | Existing pipeline already emits `Character.image_filename`; validation belongs where the matrix is built |
| `<details>` expander render | Browser (Lit Light-DOM `pnwm-identify`) | Eleventy `noscript` fallback (discretion) | Panel is client-rendered; `image_filename` already inlined via `#key-char-data` |
| Help image delivery | bunny.net CDN (absolute URL) | — | `CDN_BASE_URL` is host-absolute, NOT pathPrefix-scoped |

## Standard Stack

### Core (all already in repo — no new dependencies)
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vips` (libvips CLI) | 8.18.3 (verified `vips --version`) | JPEG→WebP conversion keeping original dimensions | Already the project's image tool (`tile-photos.ts` shells `vips dzsave`); WebP load/save support confirmed (`vips -l \| grep webp`) |
| `curl` CLI | system | bunny.net Storage PUT | Exact pattern used by `upload-tiles.ts` (curl PUT with `AccessKey` header) |
| `csv-parse` / `csv-stringify` (sync) | 6.x (in package.json) | read/write `key-character-images.csv` | Same libs used by `scripts/lib/manifest.ts` and `build-key.ts` |
| `lit` | 3.3.2 | `<details>` render in `pnwm-identify.ts` | Existing panel component |
| `zod` | 4.4.3 | `Character.image_filename` already in `CharacterSchema` | Build-time validation already wired |

### WebP conversion: recommend `vips` over `cwebp`/`sips`
| Option | Verdict | Rationale |
|--------|---------|-----------|
| **`vips` (recommend)** | ✅ | Already a project dependency-by-convention; `vips copy in.jpg out.webp` or `vips webpsave in.jpg out.webp[Q=82]` keeps original dimensions by default (no resize). Consistent shell-out idiom with `tile-photos.ts`. [VERIFIED: `vips --version` → 8.18.3; WebP loader present] |
| `cwebp` (1.6.0 installed) | ✅ viable | `cwebp -q 82 in.jpg -o out.webp`. Also fine, but adds a second image tool to the mental model. [VERIFIED: `cwebp -version` → 1.6.0] |
| `sips` (macOS builtin) | ⚠️ avoid | macOS-only; WebP support is version-dependent and non-portable. Don't use — breaks the "runs anywhere" posture. |
| `sharp` (npm) | ❌ not installed | Would add a native-binary dependency for no benefit over the already-present `vips`. [VERIFIED: `ls node_modules/sharp` → absent] |

**Recommended invocation (no resize, D-03):**
```bash
# vips: keep original dimensions, encode WebP at quality ~82
vips webpsave "input.jpg" "output.webp" --Q 82
```
> `[ASSUMED]` quality factor 82 — pick during planning; not a locked decision. Lossless (`--lossless`) would bloat these line-art/photo illustrations; Q≈80 is the standard web tradeoff.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HEAD-check idempotency | local state file (manifest CSV) | upload-tiles uses a manifest because tiling is a multi-stage pipeline; this phase has no prior stage, so a manifest is overkill. HEAD-check is simpler and stateless (see Pitfall 3). |
| Convert-then-upload from temp dir | bunny CDN optimizer auto-WebP | **Rejected** — STATE.md records "WebP not yet active on bunny.net Optimizer (serving JPEG)". Must convert to `.webp` at upload time, not rely on the CDN. |

**Installation:** No new npm packages. Tooling (`vips`, `curl`) already present. If reproducing on a fresh machine: `brew install vips` (already documented in `tile-photos.ts` header).

**Version verification performed:**
- `vips --version` → `vips-8.18.3` [VERIFIED: local CLI]
- `cwebp -version` → `1.6.0` [VERIFIED: local CLI]
- `node_modules/sharp` → absent [VERIFIED: filesystem]

## Package Legitimacy Audit

No external packages are installed by this phase. All tooling (`vips`, `cwebp`, `curl`) is system-level and already in use by the existing tile pipeline; all npm libs (`csv-parse`, `csv-stringify`, `lit`, `zod`) are pre-existing project dependencies. **slopcheck not applicable — zero new package installs.**

## Architecture Patterns

### System Architecture Diagram

```
SOURCE (local, not in repo)
  /Users/rainhead/Downloads/may 6 2015 key files/.../Images/  (2,003 .jpg)
         │
         │  exclusion regex (D-02) → keep 197 character-state illustrations
         ▼
┌─────────────────────────────────────────────┐
│ scripts/upload-images.ts  (key:upload-images)│
│  DRY_RUN=1 → print plan, 0 API calls         │
│  for each kept file:                         │
│    1. vips → temp .webp (keep dimensions)    │
│    2. HEAD key-images/<file>.webp → exists?  │──skip if present (idempotent)
│    3. curl PUT → bunny Storage key-images/   │
└─────────────────────────────────────────────┘
         │ (writes to CDN; nothing committed here)
         ▼
   bunny.net Storage Zone pnwmoths /key-images/<name>.webp
   served at https://pnwmoths.b-cdn.net/key-images/<name>.webp

ONE-OFF (run once, output committed)
┌─────────────────────────────────────────────┐
│ scripts/match-character-images.ts            │
│  key-matrix.json characters[] × kept filenames│
│  normalized match → draft rows               │
│  → data/key-character-images.csv (COMMITTED) │
└─────────────────────────────────────────────┘
         │ curator hand-edits ↺
         ▼
   data/key-character-images.csv  (char_id, image_filename, alt_text)

BUILD (every build)
  data/key-character-images.csv ─┐
  data/key-characters.csv ───────┤
                                 ▼
        scripts/build-key.ts  (build:key)
          - warn on out-of-range char_id (D-08)
          - soft-skip if CSV absent (D-08)
          - set Character.image_filename per row
                                 ▼
        data/key-matrix.json  (characters[].image_filename populated)
                                 ▼
        src/_data/keyMatrix.ts → src/identify/index.njk
          inlines {characters, species} into <script id="key-char-data">
                                 ▼
RENDER (browser)
  pnwm-identify.ts connectedCallback reads #key-char-data
   _renderQuestion(): per state, if char.image_filename →
     <details><summary>…</summary>
       <img src="https://pnwmoths.b-cdn.net/key-images/<file>.webp"
            alt="<alt_text or derived from state>">
     </details>
```

### Component Responsibilities
| File | Change | Detail |
|------|--------|--------|
| `scripts/upload-images.ts` (NEW) | clone of `upload-tiles.ts` | walk filtered source files → vips→webp→curl PUT to `key-images/`; HEAD-check idempotency; `DRY_RUN=1` preflight |
| `scripts/upload-images.test.ts` (NEW) | mirror `upload-tiles.test.ts` | unit-test pure helpers: exclusion filter, storage URL builder, webp-name mapper |
| `scripts/match-character-images.ts` (NEW, one-off) | normalized matcher | reads `key-matrix.json` + filtered filenames → writes draft CSV |
| `data/key-character-images.csv` (NEW, committed) | curator draft | columns `char_id,image_filename,alt_text` |
| `scripts/build-key.ts` (EDIT) | populate `image_filename` | read CSV (if present), join on `char_id`, warn out-of-range, set per character |
| `scripts/build-key.test.ts` (EDIT) | add coverage | absent-CSV soft-skip, out-of-range warning, valid join |
| `src/components/pnwm-identify.ts` (EDIT) | `_renderQuestion()` | per-state `<details>` when `char.image_filename` truthy |
| `src/components/pnwm-identify.test.ts` (EDIT) | render assertions | expander present iff mapping; absent renders no `<details>` |
| `package.json` (EDIT) | add `key:upload-images` script | next to `photos:upload`; NOT added to `build` (upload is a manual operator task) |

### Pattern 1: Idempotent curl-PUT upload (clone from upload-tiles.ts)
**What:** Build storage URL `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/key-images/<name>.webp`, PUT via `execFileSync('curl', [...])` wrapped in `withRetry`. Redact `BUNNY_API_KEY` from all logs/errors via the `redact()` idiom.
**When to use:** the upload script.
**Example (adapted from scripts/upload-tiles.ts:313-366):**
```typescript
// Source: scripts/upload-tiles.ts (in-repo, read 2026-06-25)
const BUNNY_STORAGE_HOST = process.env['BUNNY_STORAGE_HOST'] ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env['BUNNY_ZONE'] ?? 'pnwmoths';
const storageBase = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/key-images`;
const url = `${storageBase}/${encodeURIComponent(webpName)}`;
const args = [
  '-s', '-S', '-f', '-X', 'PUT',
  '-H', `AccessKey: ${BUNNY_API_KEY}`,
  '-H', 'Content-Type: image/webp',
  '--data-binary', `@${tmpWebpPath}`,
  url,
];
await withRetry(() => execFileSync('curl', args, { stdio: ['pipe','pipe','inherit'] }), `upload ${webpName}`);
```
> NOTE: copy `withRetry`, `redact`, `sleep`, and the `import.meta.url === ...` self-invocation guard verbatim from `upload-tiles.ts`. Keep the `DRY_RUN` branch **before** the `!BUNNY_API_KEY` guard (upload-tiles.ts:268 — DRY_RUN must work without a key).

### Pattern 2: DRY_RUN pre-flight (SC1)
SC1 requires `DRY_RUN=1` to print the upload list with **zero API calls**. Mirror upload-tiles.ts:269-283: enumerate the planned files + their CDN read URLs and `return` before any curl. For idempotency in DRY_RUN, you can optionally print "would skip (already on CDN)" only if you do HEAD checks — but to keep DRY_RUN truly call-free, print the *full* plan and note that a real run skips existing files.

### Pattern 3: Populate Character.image_filename in build-key.ts (D-08)
**What:** After building `characters[]` (build-key.ts:234-238, currently hardcodes `image_filename: null`), read `data/key-character-images.csv` if it exists, build `Map<number, {image_filename, alt_text}>`, and assign. Warn (don't throw) on `char_id` ≥ `characters.length` or `< 0`.
**Example:**
```typescript
// Adapted from build-key.ts:234-238 + manifest.ts readManifest soft-skip pattern
const csvPath = resolve('data/key-character-images.csv');
const imageMap = new Map<number, string>();
if (existsSync(csvPath)) {
  const rows = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true, bom: true }) as
    Array<{ char_id: string; image_filename: string; alt_text: string }>;
  for (const r of rows) {
    const id = Number(r.char_id);
    if (!Number.isInteger(id) || id < 0 || id >= dataRows.length) {
      console.warn(`build-key: key-character-images.csv char_id ${r.char_id} out of range [0, ${dataRows.length}) — skipping`);
      continue;
    }
    if (r.image_filename) imageMap.set(id, r.image_filename);
  }
} else {
  console.warn('build-key: data/key-character-images.csv absent — no character help images (soft-skip)');
}
const characters = dataRows.map((row, idx) => ({
  id: idx,
  ...parseCharacterLabel(row[0] ?? ''),
  image_filename: imageMap.get(idx) ?? null,
}));
```
> `alt_text` is **not** part of `CharacterSchema` today. Decision for planner: either (a) extend `CharacterSchema` with `alt_text: z.nullable(z.string())` and inline it (cleanest — matches the "derive at render if blank" rule), or (b) keep alt derivation entirely client-side from `state` and ignore curator alt_text in the inline path. **Recommend (a)** so curator alt_text actually reaches the client; the page-weight impact is trivial (≤77 short strings).

### Pattern 4: Per-state `<details>` expander (CIMG-03)
**What:** In `pnwm-identify.ts` `_renderQuestion()` (lines 201-217), inside the per-`char` `.map`, emit a `<details>` after the `<label>` when `char.image_filename` is truthy.
**Example:**
```typescript
// Source: src/components/pnwm-identify.ts:205-215 (the existing per-char render block)
${chars.map(char => {
  const selected = this._selection.get(question)?.has(char.id) ?? false;
  const img = char.image_filename;            // string | null (already on Character)
  return html`<label>
      <input type="checkbox" .checked=${selected}
        @change=${(e: Event) => this._onCheckboxChange(question, char.id, (e.target as HTMLInputElement).checked)}>
      ${char.state}
    </label>
    ${img ? html`<details class="pnwm-kfp-help">
        <summary>Show illustration</summary>
        <img src="${CDN_BASE_URL}/key-images/${encodeURIComponent(img)}"
             alt="${char.alt_text || char.state}" loading="lazy">
      </details>` : ''}`;
})}
```
**CDN URL rule (verified):** `CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'` is host-absolute and is the same constant already used in `key-results-grid.ts:9` and `eleventy.config.ts:16`. It is **NOT** wrapped in `pathPrefix` / `this._prefix` — `pathPrefix` (`/pnwmoths/` on GitHub Pages) only applies to *site-relative* links, never to absolute CDN hosts. Do NOT prepend `this._prefix`. (This directly answers the project memory "Never hardcode /pnwmoths/" — for CDN URLs the prefix simply doesn't apply.)
> `[ASSUMED]` `<summary>` wording ("Show illustration"), `class="pnwm-kfp-help"`, `loading="lazy"`, and image sizing are Claude's-discretion / UI-spec calls per CONTEXT — flag for the UI-spec / planner.

### Anti-Patterns to Avoid
- **Prepending `this._prefix` to the CDN image URL** — would produce `/pnwmoths/https://...` on GitHub Pages. CDN URLs are absolute. (See Pitfall 1.)
- **Relying on bunny's optimizer to serve WebP from a `.jpg`** — STATE.md: optimizer WebP is *not active*. Convert at upload time.
- **Adding `key:upload-images` to the `build` script** — upload is a manual, credentialed, network operator task (like `photos:upload`, which is NOT in `build`). Keep it standalone.
- **Build-time auto-matching of filenames** — explicitly rejected by D-07 (brittle). The matcher is a one-off; the CSV is the committed source of truth.
- **Filtering source files with the exclusion regex alone** — it leaks 58 binomial-prefixed + edge-case files (see Pitfall 4). Use an *allow*-oriented or layered filter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry/backoff on upload | custom retry loop | copy `withRetry` from upload-tiles.ts | already battle-tested (5 attempts 2-32s, non-retriable bailout) |
| Secret redaction in logs | ad-hoc string masking | copy `redact()` from upload-tiles.ts | handles empty-key edge case (empty regex corrupts text) |
| CSV read/write | manual split on `,` | `csv-parse`/`csv-stringify` (already deps) | auto-quotes commas in alt_text; manifest.ts precedent |
| JPEG→WebP | image lib in Node | `vips` CLI shell-out | already the project image tool; no new native dep |
| Idempotency state | reinvent manifest | HEAD-check or overwrite-always | bunny PUT is idempotent; no multi-stage pipeline here |

**Key insight:** This phase introduces **zero new dependencies and one new conceptual pattern** (HEAD-check idempotency without a manifest). Everything else is a direct clone of `upload-tiles.ts` + a render tweak. Over-engineering (a status manifest, a new image lib, a build-time matcher) actively contradicts locked decisions.

## Runtime State Inventory

> Rename/migration-style inventory. This phase *adds* CDN objects + a CSV; it does not rename existing state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | bunny.net Storage Zone `pnwmoths` gains `key-images/*.webp` (≈77–197 objects). No existing object renamed. | New uploads only; idempotent re-runs |
| Live service config | None — no service config embeds these names. (Verified: `CDN_BASE_URL` is a code constant in 3 files, unchanged.) | None |
| OS-registered state | None — no scheduled tasks/daemons. (Project memory: all pipeline ops run locally on demand.) | None |
| Secrets/env vars | Reuses existing `BUNNY_API_KEY`, `BUNNY_STORAGE_HOST`, `BUNNY_ZONE` (same as upload-tiles). No new secret. | None — operator supplies `BUNNY_API_KEY` at run time |
| Build artifacts | `data/key-matrix.json` regenerates with populated `image_filename`; `data/key-character-images.csv` is new committed source. `_site/key-matrix.json` copied by `copy-key-matrix.ts` (unchanged). | `npm run build:key` regenerates; commit both |

## Common Pitfalls

### Pitfall 1: pathPrefix applied to the CDN image URL
**What goes wrong:** Help images 404 on GitHub Pages because the URL becomes `/pnwmoths/https://pnwmoths.b-cdn.net/...`.
**Why it happens:** Phase memory says "never hardcode /pnwmoths/" and developers reflexively wrap every URL in `this._prefix`. But that rule is about *site-relative* links; CDN hosts are absolute.
**How to avoid:** Use `${CDN_BASE_URL}/key-images/...` exactly like `key-results-grid.ts:21` does for species thumbnails (`${CDN_BASE_URL}/${slug}/...`). No `_prefix`.
**Warning signs:** image `src` starting with `/pnwmoths/https`.

### Pitfall 2: WebP not served unless converted at upload
**What goes wrong:** Upload `.jpg`, expect WebP delivery, get JPEG (larger).
**Why it happens:** STATE.md: "WebP not yet active on bunny.net Optimizer (serving JPEG)".
**How to avoid:** Convert each source JPEG to a real `.webp` file with `vips` and PUT the `.webp` (D-03). The CSV `image_filename` and the `<img src>` must reference the `.webp` name, not the source `.jpg`.
**Warning signs:** CSV rows ending `.jpg`; `<img>` 200-OK but Content-Type `image/jpeg`.

### Pitfall 3: Idempotency without a manifest (SC1)
**What goes wrong:** A naive re-run re-uploads all 197 files, violating SC1 ("rerunning with all images already uploaded produces zero new API calls").
**Why it happens:** upload-tiles.ts gets idempotency from manifest `status=uploaded`; this script has no manifest.
**How to avoid:** Before each PUT, issue a bunny Storage **HEAD/GET existence check** for `key-images/<name>.webp`; skip the PUT (and the vips conversion) if it already exists. SC1 says "zero **new** API calls" — a HEAD that returns 304/exists is acceptable as a check, but to be strictly conservative you may cache existing-object listing via a single bunny "list directory" call at startup (`GET https://{host}/{zone}/key-images/`) and skip locally. **Recommend the single list-at-startup approach**: one GET, then zero PUTs when fully uploaded — cleanly satisfies "zero new uploads."
> `[ASSUMED]` exact bunny Storage list/HEAD semantics — verify against bunny Storage API docs during planning. The list endpoint `GET https://{storage_host}/{zone}/{path}/` returning a JSON array of objects is the documented bunny Edge Storage behavior, but confirm before relying on it.

### Pitfall 4: Exclusion regex leaks specimen photos and misses `.JPG`
**What goes wrong:** The CONTEXT regex `^[A-Z][a-z]+[ -][a-z]+.*-[A-Z]-[A-Z]\.jpg$` lets through real specimen photos like `Annaphila miona-A D.jpg` (space before `D`, not `-A-D`), `Drasteria parallela-D.jpg` (single view code), `Euxoa lucida A-D.jpg`, and `Grammia yukona-A-D.JPG` (uppercase `.JPG`). Direct test found **6 binomial-prefixed specimen files** slipping through into the "197."
**Why it happens:** the regex assumes a strict `-A-D.jpg` suffix; the Lucid export is inconsistent.
**How to avoid:** Layer the filter: (a) make extension match case-insensitive; (b) add a secondary "looks like a binomial" guard `^[A-Z][a-z]+ [a-z]+[ -][A-Z]?\b.*-[A-Z]\b` OR maintain a tiny explicit exclude-list for the ~6 known stragglers. **Recommend** combining the regex with a hardcoded exclude set of the handful of binomial-prefixed files (they're easy to enumerate: `Annaphila miona-A D.jpg`, `Drasteria parallela-D.jpg`, `Euxoa absona A-D.jpg`, `Euxoa lucida A-D.jpg`, `Euxoa lucida B-D.jpg`, `Grammia yukona-A-D.JPG`) so the upload set is exactly the genuine illustrations.
**Warning signs:** uploaded `key-images/Annaphila miona-A D.webp` — a specimen photo masquerading as a character illustration.

### Pitfall 5: `alt_text` has no home in the Character schema
**What goes wrong:** Curator writes alt_text, build silently drops it because `CharacterSchema` has no `alt_text` field.
**Why it happens:** Only `image_filename` was pre-provisioned (schemas.ts:163).
**How to avoid:** Extend `CharacterSchema` with `alt_text: z.nullable(z.string())` and set it in build-key.ts alongside `image_filename`; client falls back to `char.state` when null (D-06). Update `schemas.test.ts` accordingly.

### Pitfall 6: Filename ↔ webp-name drift
**What goes wrong:** CSV references `Black Forewing.jpg` but the CDN object is `Black Forewing.webp`; `<img>` 404s.
**How to avoid:** Pick ONE canonical rule: **the CSV stores the `.webp` filename** (the matcher emits `.webp`, the uploader writes `.webp`). Define a single `toWebpName(srcJpg)` helper, export it, unit-test it, and use it in both the uploader and the matcher.
**Warning signs:** mismatched extensions between CSV, CDN listing, and `<img src>`.

### Pitfall 7: Filenames with spaces/commas/`#` in URLs and CSV
**What goes wrong:** `forewing apical dash, no.webp` breaks the `<img src>` (comma) or the CSV row (comma).
**How to avoid:** `encodeURIComponent(image_filename)` in the `<img src>` (already shown). `csv-stringify` auto-quotes commas (manifest.ts precedent). bunny Storage accepts spaces in keys but URL-encode on read.

## Code Examples

### Exclusion filter + webp-name mapping (uploader + matcher shared helper)
```typescript
// Exported for unit tests (mirrors upload-tiles.ts exporting tileUploadPath/isUploadable)
const SPECIMEN_RE = /^[A-Z][a-z]+[ -][a-z]+.*-[A-Z]-[A-Z]\.jpe?g$/i;
const EXTRA_EXCLUDES = new Set([
  'Annaphila miona-A D.jpg', 'Drasteria parallela-D.jpg',
  'Euxoa absona A-D.jpg', 'Euxoa lucida A-D.jpg',
  'Euxoa lucida B-D.jpg', 'Grammia yukona-A-D.JPG',
]);
export function isCharacterIllustration(filename: string): boolean {
  if (!/\.jpe?g$/i.test(filename)) return false;
  if (SPECIMEN_RE.test(filename)) return false;
  if (EXTRA_EXCLUDES.has(filename)) return false;
  return true;
}
export function toWebpName(jpg: string): string {
  return jpg.replace(/\.jpe?g$/i, '.webp');
}
```

### Normalized matcher core (one-off, D-07)
```typescript
// Yields 77 exact normalized matches against the 237 states (verified by direct run 2026-06-25).
function norm(s: string): string {
  return s.toLowerCase()
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/^ecoprovince_/, '').replace(/^us_/, '')
    .replace(/_/g, ' ')
    .replace(/\bcopy\b/g, '')          // 'Black copy.jpg' → 'black'
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
// Build Map<normalizedFilename, originalFilename> (first wins on collision),
// iterate characters, match on norm(state). Emit one row per match:
//   char_id, toWebpName(matchedFile), ''   (blank alt_text → curator/render fills)
// Multi-match: log a warning, take the first; no-match: omit the row (sparse CSV is fine, D-08).
```
> Verified per-category coverage (exact normalized): Distribution 29/52, Forewing color/pattern 24/65, Hindwing color/pattern 24/45; Seasonality/Size/Wing-shape/Abdomen/Eyes ≈ 0 (no matching illustrations exist — expected per CONTEXT "Specifics"). Total 77/237. Fuzzy matching (token-subset) could raise morphological coverage but risks false positives; the draft+curator model (D-07) absorbs that — keep the matcher conservative (exact-normalized) and let the curator extend.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Character.image_filename` hardcoded `null` in build-key.ts:238 | populate from `key-character-images.csv` | this phase | data contract already in schema; only the populate-step is new |
| Tile uploads use a multi-stage status manifest | HEAD/list-check idempotency, no manifest | this phase | simpler — no prior pipeline stage to track |

**Deprecated/outdated:**
- Do not rely on bunny.net optimizer auto-WebP (inactive per STATE.md). Convert explicitly.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | bunny Storage list endpoint `GET .../key-images/` returns JSON object array for idempotency check | Pitfall 3 | If wrong, fall back to per-file HEAD; SC1 ("zero new API calls") still met since HEADs aren't uploads. Verify against bunny docs in planning. |
| A2 | WebP quality factor ~82 is appropriate | Standard Stack | Cosmetic; tune visually. Not a correctness risk. |
| A3 | The 6 enumerated binomial-prefixed files are the complete set of specimen-photo leaks | Pitfall 4 | A planner task should re-run the binomial-prefix check to confirm the exclude set before upload. |
| A4 | `<summary>` wording, expander placement, image sizing, no-JS fallback inclusion | Pattern 4 | Explicitly Claude's-discretion/UI-spec per CONTEXT — not a research claim, defer to UI-spec. |
| A5 | Extending `CharacterSchema` with `alt_text` is acceptable (vs render-side-only alt) | Pattern 3 / Pitfall 5 | Low — trivial page-weight; planner may choose render-side-only if preferred. |

## Open Questions

1. **bunny Storage idempotency API shape**
   - What we know: bunny Edge Storage supports PUT (idempotent overwrite, proven by upload-tiles) and a directory-list GET; per-object existence is checkable.
   - What's unclear: exact response shape of the list/HEAD call; whether the project's `BUNNY_STORAGE_HOST` (`la.storage.bunnycdn.com`) serves listing.
   - Recommendation: planner adds a small spike task or a `checkpoint:human-verify` to confirm the list/HEAD call before locking the idempotency mechanism. Worst case: overwrite-always (still safe, but technically issues PUTs — would need the list-check to satisfy SC1's "zero new API calls" literally).

2. **Coverage acceptance for the committed draft CSV**
   - What we know: 77 exact-normalized matches today; morphological categories cover best; Seasonality/Size/Wing-shape have no matching illustrations at all.
   - What's unclear: whether 77/237 is "good enough" to commit as the draft, or whether the planner wants a fuzzy pass first.
   - Recommendation: commit the conservative exact-normalized draft (77 rows); curator extends. This is exactly D-07's intent.

3. **Should help images appear in the `<noscript>` fallback?**
   - What we know: index.njk has a separate plain-text no-JS hierarchy (Phase 41 D-08); `<details>` is native HTML and would work there too.
   - What's unclear: product call.
   - Recommendation: defer to UI-spec (CONTEXT marks this discretion); default to JS-panel-only to keep the no-JS page lightweight.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `vips` (libvips CLI) | WebP conversion (D-03) | ✓ | 8.18.3 (WebP loader confirmed) | `cwebp` 1.6.0 |
| `cwebp` | alt WebP conversion | ✓ | 1.6.0 | `vips` |
| `curl` | bunny Storage PUT | ✓ | system (used by upload-tiles) | — |
| Source images dir | upload input | ✓ | 2,003 files; 197 non-specimen; 39.1 MB total | — |
| `BUNNY_API_KEY` (env) | real upload run | operator-supplied | — | DRY_RUN works without it |
| `node_modules/sharp` | (not used) | ✗ | — | not needed — vips present |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `sharp` absent — not required (vips/cwebp both present).

## Validation Architecture

> `workflow.nyquist_validation: true` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (built-in) + `node:assert/strict` |
| Config file | none — test files listed explicitly in package.json `test` script |
| Quick run command | `node --test scripts/upload-images.test.ts` (per-file) |
| Full suite command | `npm test` |

> **Wave 0 note:** new test files (`scripts/upload-images.test.ts`) must be **added to the `package.json` `test` script's explicit file list** — `node --test` here does not glob `scripts/*.test.ts` (it lists each file). `build-key.test.ts`, `pnwm-identify.test.ts`, and `src/types/schemas.test.ts` are already in the list.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CIMG-01 | exclusion filter keeps exactly the 197 illustrations (excludes 6 leaks) | unit | `node --test scripts/upload-images.test.ts` | ❌ Wave 0 |
| CIMG-01 | `toWebpName('X.jpg') === 'X.webp'` (case-insensitive ext) | unit | `node --test scripts/upload-images.test.ts` | ❌ Wave 0 |
| CIMG-01 | storage URL builder → `https://{host}/{zone}/key-images/<enc>.webp` | unit | `node --test scripts/upload-images.test.ts` | ❌ Wave 0 |
| CIMG-01 | DRY_RUN=1 makes zero curl calls (manual/integration) | manual | `DRY_RUN=1 npm run key:upload-images` (inspect output) | ❌ Wave 0 |
| CIMG-02 | build-key soft-skips when CSV absent | unit | `node --test scripts/build-key.test.ts` | ✏️ extend |
| CIMG-02 | build-key warns + skips out-of-range char_id | unit | `node --test scripts/build-key.test.ts` | ✏️ extend |
| CIMG-02 | valid CSV row sets `Character.image_filename` (+ `alt_text`) | unit | `node --test scripts/build-key.test.ts` | ✏️ extend |
| CIMG-03 | `<details>` rendered iff `char.image_filename` truthy | unit | `node --test src/components/pnwm-identify.test.ts` | ✏️ extend |
| CIMG-03 | no mapping → no `<details>`, panel still functional | unit | `node --test src/components/pnwm-identify.test.ts` | ✏️ extend |
| CIMG-03 | `<img src>` is CDN-absolute, NOT pathPrefixed | unit | `node --test src/components/pnwm-identify.test.ts` | ✏️ extend |

### Sampling Rate
- **Per task commit:** the single relevant `node --test <file>.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green + `npm run typecheck` clean before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `scripts/upload-images.test.ts` — covers CIMG-01 (filter, webp-name, URL builder)
- [ ] Register `scripts/upload-images.test.ts` in package.json `test` script
- [ ] Extend `scripts/build-key.test.ts` — covers CIMG-02 (absent/out-of-range/valid)
- [ ] Extend `src/components/pnwm-identify.test.ts` — covers CIMG-03 (expander presence/absence, CDN URL)
- [ ] Extend `src/types/schemas.test.ts` if `alt_text` added to `CharacterSchema`

## Security Domain

> `security_enforcement` not set to false → included (lightweight; this phase is local tooling + static render).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | static site |
| V5 Input Validation | yes | curator CSV is trusted-but-validated: `char_id` range check (D-08); `encodeURIComponent` on image filename in `<img src>`; csv-stringify auto-quoting |
| V6 Cryptography | no (uses existing secret handling) | `BUNNY_API_KEY` via env only; never committed/logged (reuse `redact()`) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leak via logs/errors | Information Disclosure | copy `redact(BUNNY_API_KEY)` from upload-tiles.ts; apply to all error/log paths |
| CSV injection (curator-authored alt_text with `=`,`+`,`@`,`,`) | Tampering | `csv-stringify` auto-quotes (manifest.ts T-26.02-02 precedent); alt_text is rendered as text content / attribute (Lit escapes), not formula-evaluated |
| Broken/attacker-controlled `<img src>` via filename | Tampering | filenames originate from the local trusted media set + curator CSV; `encodeURIComponent` prevents path/query injection; CDN host is fixed constant |
| XSS via image_filename/alt_text into DOM | Tampering/Elevation | Lit `html` template auto-escapes interpolated text and attributes — no `unsafeHTML` |

## Sources

### Primary (HIGH confidence — read directly in-repo 2026-06-25)
- `scripts/upload-tiles.ts`, `scripts/upload-tiles.test.ts`, `scripts/lib/manifest.ts` — upload/idempotency/retry/redact pattern
- `scripts/build-key.ts` — character build, where `image_filename` is set (line 238)
- `scripts/copy-key-matrix.ts`, `scripts/tile-photos.ts` — pipeline + vips precedent
- `src/components/pnwm-identify.ts` (`_renderQuestion` 201-217), `src/components/key-results-grid.ts` (CDN URL 9/21)
- `src/types/schemas.ts` (CharacterSchema 157-165 — `image_filename` already present)
- `src/_data/keyMatrix.ts`, `src/identify/index.njk` (#key-char-data inline 10-14, noscript 16-42)
- `eleventy.config.ts` (pathPrefix 12, CDN_BASE_URL 16, cdnBaseUrl global 73)
- `package.json` (scripts block, deps)
- `.planning/STATE.md` ("WebP not active on optimizer"), `.planning/REQUIREMENTS.md` (CIMG-01/02/03)
- **Direct execution:** source dir = 2,003 files / 197 non-specimen / 39.1 MB; matcher = 77 exact-normalized matches; `vips` 8.18.3 + `cwebp` 1.6.0 present; 6 specimen-photo leaks through the exclusion regex

### Secondary (MEDIUM)
- bunny.net Edge Storage PUT idempotency — inferred from upload-tiles.ts in-repo usage (proven in prior phases)

### Tertiary (LOW — flagged in Assumptions)
- bunny Edge Storage list/HEAD endpoint shape (A1) — needs doc confirmation in planning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling verified present by execution; zero new deps
- Architecture: HIGH — direct clone of proven in-repo patterns; data contract pre-provisioned
- Pitfalls: HIGH — pathPrefix/WebP/filter-leak pitfalls confirmed by reading code + STATE.md + direct file enumeration
- Idempotency API detail: MEDIUM — mechanism clear, exact bunny endpoint shape needs confirmation (A1)

**Research date:** 2026-06-25
**Valid until:** ~2026-07-25 (stable; in-repo patterns, no fast-moving external deps)
