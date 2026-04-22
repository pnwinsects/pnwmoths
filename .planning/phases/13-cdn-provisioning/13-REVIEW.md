---
phase: 13-cdn-provisioning
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - eleventy.config.js
  - eleventy.config.test.js
  - scripts/build-data.js
  - scripts/build-data.test.js
  - scripts/migrate-images.js
  - package.json
  - _instructions/UPLOADING_IMAGES.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 13 adds a bunny.net CDN integration: a hard-coded public `CDN_BASE_URL` constant in `eleventy.config.js`, a one-time upload script (`migrate-images.js`), and contributor documentation. The build validation pipeline (`build-data.js`) was extended to accept spaces in image filenames (Django's original naming convention).

The implementation is well-structured and the security posture for the migration script is sound — the API key is read from the environment, never from source. The main concerns are two SQL-injection-equivalent patterns in `build-data.js` (string interpolation directly into DuckDB SQL), a mismatch between the dry-run URL preview and the real upload URL format (filenames are percent-encoded in real uploads but not in dry-run output), and a missing `CDN_BASE_URL` export that prevents Phase 14 from consuming the constant without re-reading the file.

`CDN_BASE_URL` is intentionally hard-coded as a public constant (documented decision D-01); that design choice is out of scope for this review.

---

## Warnings

### WR-01: SQL injection via string interpolation in DuckDB COPY statement

**File:** `scripts/build-data.js:213-217`

**Issue:** The `slug` and `outDir` values are interpolated directly into a DuckDB SQL string. `validateSlugComponent` guards the raw genus/species values, but the composed `slug` undergoes `.toLowerCase().replace(/\s+/g, '-')` after validation, which does not remove characters like `'` (single quote) if they were somehow introduced. More critically, `outDir` — which is built from `slug` — is also interpolated into the `TO '...'` path clause without any independent validation. A slug containing a single quote (e.g., from a genus like "O'Brien" if validation ever relaxes) would break the SQL string or allow injection.

The same pattern appears for `outDir` in the `TO` clause: the output path is controlled by the slug and injected verbatim into SQL, making the file-write destination injectable.

```js
// Current — both slug and outDir injected into SQL
await conn.run(`
  COPY (SELECT * FROM records WHERE species_slug = '${slug}')
  TO '${outDir}/records.parquet'
  (FORMAT parquet, COMPRESSION snappy)
`);
```

**Fix:** Use DuckDB prepared statements or parameterization. If the DuckDB Node API does not support parameters for `COPY … TO`, at minimum assert the slug matches the strict validated pattern before interpolation, and use the validated raw strings rather than the post-processed `slug`:

```js
// Defense-in-depth assertion immediately before interpolation
if (!/^[a-z0-9-]+$/.test(slug)) {
  throw new Error(`Unexpected slug format after normalization: "${slug}"`);
}
const outDir = `data/parquet/${slug}`;
// slug and outDir are now guaranteed safe to interpolate
```

This makes the safety guarantee explicit at the injection site rather than relying on the reader to trace back through `validateSlugComponent`.

---

### WR-02: Dry-run URL preview does not URL-encode filenames (diverges from actual upload)

**File:** `scripts/migrate-images.js:289, 294`

**Issue:** In the real upload path (lines 255–256, 272–273), filenames are passed through `encodeURIComponent` before being embedded in the PUT URL. In the dry-run preview (lines 289, 294), the raw `img.filename` is interpolated directly. For filenames containing spaces (e.g. `Acronicta americana-A-D.jpg`), the dry-run output shows an invalid URL with literal spaces, while the actual upload would use `%20`. This makes the dry-run preview misleading — the URLs shown cannot be copied and pasted to verify the upload manually.

```js
// Real upload path — correctly encoded
const encodedFilename = encodeURIComponent(img.filename);
const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${slug}/${encodedFilename}`;

// Dry-run — NOT encoded (line 289)
console.log(`  curl -X PUT ... ${BUNNY_ZONE}/${slug}/${img.filename}`);
```

**Fix:** Apply the same `encodeURIComponent` in the dry-run log:

```js
const encodedFilename = encodeURIComponent(img.filename);
console.log(`  curl -X PUT -H "AccessKey: ***" https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${slug}/${encodedFilename}`);
```

---

### WR-03: `CDN_BASE_URL` is declared but never exported or exposed to templates

**File:** `eleventy.config.js:14`

**Issue:** `CDN_BASE_URL` is declared as a module-level `const`, but it is never passed to `eleventyConfig.addGlobalData()` or otherwise exposed to Nunjucks templates. The planning documents (REQUIREMENTS.md TMPL-01, ARCHITECTURE.md) call for `addGlobalData('cdnBaseUrl', ...)`, and Phase 14's template migration will need to read the value at render time. As currently written, templates cannot access `CDN_BASE_URL` — any template that tries to use `{{ cdnBaseUrl }}` will get an empty string or undefined.

The constant is correctly scoped for Phase 14 to add `addGlobalData`, but the gap between the declaration and its future use is a latent integration failure: Phase 14 could ship with broken templates if it assumes the constant is already wired up.

**Fix:** Either add `addGlobalData` now (the full Phase 14 step), or add a code comment on the constant explicitly calling out that it must be wired before any template can use it:

```js
// CDN_BASE_URL is exposed to templates via addGlobalData in Phase 14.
// Until then, templates must not reference {{ cdnBaseUrl }}.
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
```

If Phase 14 is imminent, prefer wiring it now to avoid a silent blank:

```js
eleventyConfig.addGlobalData('cdnBaseUrl', CDN_BASE_URL);
```

---

## Info

### IN-01: `eleventy.config.test.js` tests file content with string matching rather than importing the module

**File:** `eleventy.config.test.js:11-53`

**Issue:** All five tests read `eleventy.config.js` as raw text and check for string literals (e.g., `configSource.includes('const CDN_BASE_URL = "https://pnwmoths.b-cdn.net"')`). This is intentional for some constraints (e.g., "no dotenv"), but it means the tests cannot verify that `CDN_BASE_URL` is actually the value used at runtime — only that the source text contains the string. A refactor that moved the URL into an imported constant from another module would break the contract silently if the test pattern changed.

**Fix:** This is acceptable for a hard-coded public constant with no runtime variation. Consider adding a comment to the test file explaining why text-matching is used here rather than importing:

```js
// Tests read source as text rather than importing the module
// because the constraints are source-level (no dotenv, no process.env) —
// not just runtime behavior.
```

---

### IN-02: `build-data.js` image-filename validation is not applied to the CDN URL path

**File:** `scripts/build-data.js:74-79`

**Issue:** `build-data.js` validates that image filenames in `images.csv` match `^[a-zA-Z0-9 ._-]+$`. This is good. However, there is no check that `species_slug` values in `images.csv` are safe. The slug is used indirectly (DuckDB reads it from the CSV), but if a future template or script constructs a CDN URL as `CDN_BASE_URL + '/' + row.species_slug + '/' + row.filename`, an adversarially crafted slug in `images.csv` could produce a broken or unexpected URL. The records table slug is validated via the species table join, but the images CSV slug is never independently validated.

**Fix:** Add a slug validation step after loading `imageRows`:

```js
for (const row of imageRows) {
  if (!/^[a-z0-9-]+$/.test(row.species_slug)) {
    throw new Error(`Invalid species_slug "${row.species_slug}" in images.csv`);
  }
}
```

---

### IN-03: `migrate-images.js` default source paths are developer-local absolute paths

**File:** `scripts/migrate-images.js:25-32`

**Issue:** The four `DEFAULT_*` constants contain absolute paths under `/Users/rainhead/dev/`. Since this is a one-time migration script (already run), this is not a production risk, but the hardcoded paths will cause confusing failures if another developer runs the script without setting the env vars. The comment at line 109 (`if (!existsSync(MOTHS_SOURCE)) { process.exit(0) }`) partially mitigates this for the moths source, but the other defaults will silently produce empty data for photographers, images CSV, and glossary without a clear error.

**Fix:** Since the migration is complete, consider adding a header comment noting that the script has already been run and is preserved for reference only, or replace the absolute defaults with empty strings and make the env var requirement explicit:

```js
// This script has completed its one-time migration (3880 images uploaded, Phase 13).
// It is preserved for reference. If re-running, set all four source env vars explicitly.
```

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
