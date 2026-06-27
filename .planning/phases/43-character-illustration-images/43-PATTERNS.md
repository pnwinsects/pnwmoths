# Phase 43: Character Illustration Images - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 9 (4 new, 5 modified)
**Analogs found:** 9 / 9 (all strong in-repo analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/upload-images.ts` (NEW) | script/uploader | file-I/O + request-response | `scripts/upload-tiles.ts` | exact (clone) |
| `scripts/upload-images.test.ts` (NEW) | test | unit | `scripts/upload-tiles.test.ts` | exact |
| `scripts/match-character-images.ts` (NEW, one-off) | script/transform | batch transform | `scripts/build-key.ts` (CSV emit) + `emit-species-states.ts` | role-match |
| `data/key-character-images.csv` (NEW, committed) | data/config | n/a (committed source) | `data/key-characters.csv` (committed key source) | role-match |
| `scripts/build-key.ts` (MODIFY) | script/build | batch transform | self (lines 234-238) | self |
| `scripts/build-key.test.ts` (MODIFY) | test | unit + integration | self | self |
| `src/components/pnwm-identify.ts` (MODIFY) | component (Lit) | render | self (`_renderQuestion` 201-217) + `key-results-grid.ts` (CDN URL) | self + role-match |
| `src/components/pnwm-identify.test.ts` (MODIFY) | test | unit | self | self |
| `src/types/schemas.ts` (MODIFY) | schema | validation | self (`CharacterSchema` 157-165) | self |
| `src/styles/theme.css` (MODIFY) | styles | n/a | self (`.pnwm-kfp-*` block, line 345+) | self |
| `package.json` (MODIFY) | config | n/a | self (`photos:upload` 24; `test` 28) | self |

> The `vips` conversion idiom for `upload-images.ts` is a partial-match analog: `scripts/tile-photos.ts` `runVipsThumbnail()` (lines 275-282).

---

## Pattern Assignments

### `scripts/upload-images.ts` (NEW — clone of `upload-tiles.ts`)

**Analog:** `scripts/upload-tiles.ts` (read in full). Copy these verbatim, adapting only paths/CDN prefix:

**Module env constants** (`upload-tiles.ts:48-55`): keep `BUNNY_STORAGE_HOST` (`la.storage.bunnycdn.com`), `BUNNY_ZONE` (`pnwmoths`), `BUNNY_API_KEY`, `DRY_RUN`, `CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'`. Drop `MANIFEST_PATH`/`TILE_*` (no manifest this phase — RESEARCH Pitfall 3).

**Copy verbatim (do NOT re-implement):**
- `redact()` (`upload-tiles.ts:73-77`) — handles the empty-key edge case; apply to every log/error path.
- `withRetry()` (`upload-tiles.ts:84-105`) — 5-attempt 2-32s backoff, non-retriable bailout.
- `sleep` (`:62`), `walk()` async dir-walk (`:124-136`).
- Self-invocation guard (`:417-419`): `if (import.meta.url === \`file://${process.argv[1]}\`) { main().catch(...) }`.

**curl-PUT pattern** (adapt from `upload-tiles.ts:354-366`, the `.dzi` block):
```typescript
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

**DRY_RUN guard placement** (`upload-tiles.ts:267-283`): the `if (DRY_RUN) { ...print plan...; return; }` block MUST come **before** the `if (!BUNNY_API_KEY)` guard (`:285-291`) so DRY_RUN works with no key (SC1 — zero API calls).

**WebP conversion** (mirror `tile-photos.ts:275-282` `runVipsThumbnail` argv idiom — NO width arg, keep dimensions, D-03):
```typescript
execFileSync('vips', ['webpsave', sourceJpg, tmpWebpPath, '--Q', '82'], { stdio: ['pipe','pipe','pipe'] });
```
> argv-array form (not shell string) handles filenames with spaces correctly — exactly the reason cited in `tile-photos.ts:250-253`. Source filenames here contain spaces (`Black Forewing.jpg`).

**Idempotency (no manifest):** before each PUT, do a single bunny Storage directory-list `GET .../key-images/` at startup OR per-file HEAD; skip vips+PUT when the `.webp` already exists (RESEARCH Pitfall 3; A1 — verify bunny list endpoint shape in planning).

**Exported helpers for tests** (mirror `upload-tiles.ts` exporting `tileUploadPath`/`isUploadable` at module level — RESEARCH "Code Examples"):
```typescript
const SPECIMEN_RE = /^[A-Z][a-z]+[ -][a-z]+.*-[A-Z]-[A-Z]\.jpe?g$/i;
const EXTRA_EXCLUDES = new Set([
  'Annaphila miona-A D.jpg', 'Drasteria parallela-D.jpg', 'Euxoa absona A-D.jpg',
  'Euxoa lucida A-D.jpg', 'Euxoa lucida B-D.jpg', 'Grammia yukona-A-D.JPG',
]);
export function isCharacterIllustration(filename: string): boolean { /* ext check + !SPECIMEN_RE + !EXTRA_EXCLUDES */ }
export function toWebpName(jpg: string): string { return jpg.replace(/\.jpe?g$/i, '.webp'); }
```
> Single canonical `toWebpName` used by BOTH uploader and matcher (RESEARCH Pitfall 6 — filename↔webp drift).

---

### `scripts/upload-images.test.ts` (NEW — mirror `upload-tiles.test.ts`)

**Analog:** `scripts/upload-tiles.test.ts` (read in full).

Same structure: `import { describe, it } from 'node:test'; import assert from 'node:assert/strict';` then `import { isCharacterIllustration, toWebpName, ... } from './upload-images.ts';`. One `describe` per exported helper. Cover (RESEARCH Test Map CIMG-01): exclusion filter keeps the genuine illustrations and rejects the 6 leaks; `toWebpName('X.JPG') === 'X.webp'` (case-insensitive ext); storage URL builder → `https://{host}/{zone}/key-images/<enc>.webp`.

**Wave 0:** register this file in `package.json` `test` (see package.json below) — `node --test` here lists files explicitly, no glob for `scripts/*.test.ts`.

---

### `scripts/match-character-images.ts` (NEW, one-off matcher → committed CSV)

**Analog:** `scripts/build-key.ts` for CSV read of `key-matrix.json` characters + `csv-stringify` write idiom (precedent: `scripts/lib/manifest.ts` uses `csv-stringify`; `csv-stringify` is a project dep). Self-invocation guard from `upload-tiles.ts:417-419`.

**Core (RESEARCH "Normalized matcher core", verified 77 matches):**
```typescript
function norm(s: string): string {
  return s.toLowerCase()
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/^ecoprovince_/, '').replace(/^us_/, '')
    .replace(/_/g, ' ').replace(/\bcopy\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
```
Build `Map<norm(filename), originalFilename>` (first wins), iterate `keyMatrix.characters`, match on `norm(state)`. Emit one row `{ char_id, image_filename: toWebpName(matchedFile), alt_text: '' }`. No-match → omit row (sparse CSV is fine, D-08). Import `toWebpName` from `upload-images.ts` (single canonical rule).

---

### `data/key-character-images.csv` (NEW, committed)

**Analog:** `data/key-characters.csv` (committed key source). Columns: `char_id,image_filename,alt_text` (D-06). Generated by the matcher, then curator hand-edits. `image_filename` values end in `.webp` (Pitfall 6).

---

### `scripts/build-key.ts` (MODIFY — populate `image_filename` + `alt_text`)

**Analog:** self. Two changes:

1. **CSV read with soft-skip** — mirror the existing `parse(readFileSync(resolve('data/...')), { columns: true, ... })` idiom already used at `build-key.ts:206-217` (species + synonyms). Add `import { existsSync } from 'node:fs'` (currently only `readFileSync, writeFileSync` imported at line 6). Pattern (RESEARCH Pattern 3):
```typescript
const csvPath = resolve('data/key-character-images.csv');
const imageMap = new Map<number, { image_filename: string; alt_text: string }>();
if (existsSync(csvPath)) {
  const rows = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true, bom: true }) as
    Array<{ char_id: string; image_filename: string; alt_text: string }>;
  for (const r of rows) {
    const id = Number(r.char_id);
    if (!Number.isInteger(id) || id < 0 || id >= dataRows.length) {
      console.warn(`build-key: key-character-images.csv char_id ${r.char_id} out of range [0, ${dataRows.length}) — skipping`);
      continue;
    }
    if (r.image_filename) imageMap.set(id, { image_filename: r.image_filename, alt_text: r.alt_text ?? '' });
  }
} else {
  console.warn('build-key: data/key-character-images.csv absent — no character help images (soft-skip)');
}
```

2. **Replace the hardcoded `image_filename: null`** at `build-key.ts:234-238`:
```typescript
const characters = dataRows.map((row, idx) => {
  const m = imageMap.get(idx);
  return {
    id: idx,
    ...parseCharacterLabel(row[0] ?? ''),
    image_filename: m?.image_filename ?? null,
    alt_text: m?.alt_text || null,   // only if alt_text added to schema (see schemas.ts below)
  };
});
```
> Warning uses `console.warn`, non-fatal (D-08). Existing build-key logging style is `console.log('build-key: ...')` (`:324`).

---

### `scripts/build-key.test.ts` (MODIFY)

**Analog:** self. Pure-function tests use `import`; `main()` is tested via `execSync` integration (see `:7,15`). Add coverage (RESEARCH Test Map CIMG-02): absent-CSV soft-skip, out-of-range `char_id` warn+skip, valid row sets `image_filename` (+`alt_text`). Follow the existing `describe`/`test` + `assert.strictEqual` structure.

---

### `src/components/pnwm-identify.ts` (MODIFY — `_renderQuestion` expander)

**Analog:** self (`_renderQuestion` 201-217) + `key-results-grid.ts:9,21` (CDN URL constant + `encodeURIComponent`).

**Add CDN constant** near the top (this file does NOT currently define `CDN_BASE_URL`; its existing `_prefix` getter at `:89` is for the SITE-relative `key-matrix.json` fetch only — do NOT reuse `_prefix` for the image src). Copy the constant verbatim from `key-results-grid.ts:9`:
```typescript
const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';
```

**Modify `_renderQuestion` `.map` body** (`:205-214`) to emit the `<details>` as a SIBLING of `<label>` (UI-SPEC §1 — must be OUTSIDE the label or it captures checkbox clicks):
```typescript
${chars.map(char => {
  const selected = this._selection.get(question)?.has(char.id) ?? false;
  const img = char.image_filename;
  return html`<label>
      <input type="checkbox" .checked=${selected}
        @change=${(e: Event) => this._onCheckboxChange(question, char.id, (e.target as HTMLInputElement).checked)}>
      ${char.state}
    </label>
    ${img ? html`<details class="pnwm-kfp-help">
        <summary>ⓘ illustration</summary>
        <img src="${CDN_BASE_URL}/key-images/${encodeURIComponent(img)}"
             alt="${char.alt_text || char.state}" loading="lazy" decoding="async">
      </details>` : ''}`;
})}
```
> **CDN URL rule (RESEARCH Pitfall 1, UI-SPEC §3):** host-absolute; MUST NOT be wrapped in `this._prefix` (would yield `/pnwmoths/https://...`). Mirrors `key-results-grid.ts:21` (`${CDN_BASE_URL}/${slug}/...`). Summary copy `ⓘ illustration`, `loading="lazy"`, `class="pnwm-kfp-help"` are UI-SPEC locked.
> If `alt_text` is NOT added to the schema, drop `char.alt_text ||` and use `alt="${char.state}"`.

---

### `src/components/pnwm-identify.test.ts` (MODIFY)

**Analog:** self. Fixture factory `makeChar` (`:24-30`) already defaults `image_filename: null` — add `image_filename`/`alt_text` overrides per case. Cover (RESEARCH Test Map CIMG-03): `<details>` rendered iff `char.image_filename` truthy; no mapping → no `<details>`; `<img src>` is CDN-absolute (NOT `/pnwmoths/https`). Existing `node:test` + `assert/strict` structure.

---

### `src/types/schemas.ts` (MODIFY — recommended: add `alt_text`)

**Analog:** self (`CharacterSchema` 157-165). RESEARCH recommends (A5, Pitfall 5) extending so curator `alt_text` reaches the client:
```typescript
export const CharacterSchema = z.object({
  id:             z.number(),
  category:       z.string(),
  subcategory:    z.nullable(z.string()),
  question:       z.string(),
  state:          z.string(),
  image_filename: z.nullable(z.string()),
  alt_text:       z.nullable(z.string()),   // Phase 43; null → render derives from state
});
```
> If added, extend `src/types/schemas.test.ts` and set `alt_text` in `build-key.ts`. Planner may instead choose render-side-only alt (derive from `state`) and skip this — then `pnwm-identify` uses `alt="${char.state}"` and no schema change. Recommend adding the field.

---

### `src/styles/theme.css` (MODIFY — `.pnwm-kfp-help` rules)

**Analog:** self (`.pnwm-kfp-*` block at line 345+; focus-outline pattern mirrors `.pnwm-krg-card:focus-visible`). Append the UI-SPEC §5 CSS verbatim (UI-SPEC lines 230-265): `.pnwm-kfp-help` (indent `margin: 4px 0 8px 1.5em`), `> summary` (muted `var(--pico-muted-color)`, `0.875rem`, `list-style: none`), hover/focus → `var(--pico-primary)`, `outline: 2px solid var(--pico-primary)`, and `img` (`max-width:100%; max-height:320px; object-fit:contain; background:#f0ece0; border-radius:2px`).

---

### `package.json` (MODIFY)

**Analog:** self. Two edits:
1. Add script next to `photos:upload` (`:24`), NOT in `build` (upload is a manual operator task — RESEARCH Anti-Pattern):
   ```json
   "key:upload-images": "node scripts/upload-images.ts",
   ```
2. Append `scripts/upload-images.test.ts` to the explicit `test` file list (`:28`). `build-key.test.ts`, `pnwm-identify.test.ts` (via `src/components/*.test.ts`), and `schemas.test.ts` are already covered.

---

## Shared Patterns

### Secret redaction + retry (uploader)
**Source:** `scripts/upload-tiles.ts:73-77` (`redact`), `:84-105` (`withRetry`).
**Apply to:** `upload-images.ts` — copy verbatim; wrap every curl call in `withRetry`, pass all error/log strings through `redact`. `BUNNY_API_KEY` from env only, never logged (Security Domain).

### curl-PUT to bunny Storage
**Source:** `scripts/upload-tiles.ts:354-366` / `tile-photos.ts:294-296`.
**Apply to:** `upload-images.ts`. `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/key-images/<enc>.webp`, `AccessKey` header, `Content-Type: image/webp`, `--data-binary @file`.

### CDN absolute URL (NOT pathPrefixed)
**Source:** `src/components/key-results-grid.ts:9,21`.
**Apply to:** `pnwm-identify.ts` `<img src>`. `${CDN_BASE_URL}/key-images/${encodeURIComponent(file)}`. Never prepend `this._prefix` (Pitfall 1). `_prefix` is reserved for site-relative `key-matrix.json` fetch.

### CSV read with columns:true + bom + soft existence guard
**Source:** `scripts/build-key.ts:206-217` (read), `existsSync` guard pattern.
**Apply to:** `build-key.ts` CSV read, `match-character-images.ts`. Use `csv-parse/sync` `parse`; `csv-stringify/sync` for the matcher write (auto-quotes commas in `alt_text` — Pitfall 7 / CSV-injection mitigation).

### Self-invocation guard
**Source:** `scripts/upload-tiles.ts:417-419` (`import.meta.url === \`file://${process.argv[1]}\``).
**Apply to:** `upload-images.ts`, `match-character-images.ts` — keeps `main()` from running when test imports the exported helpers.

### vips shell-out (argv array, no resize)
**Source:** `scripts/tile-photos.ts:275-282`.
**Apply to:** `upload-images.ts` WebP conversion. `execFileSync('vips', ['webpsave', src, out, '--Q', '82'])` — argv form for space-containing filenames.

## No Analog Found

None. Every file has a strong in-repo analog; the only genuinely new concept is HEAD/list-based idempotency without a manifest (RESEARCH Pitfall 3, A1) — derived from `upload-tiles.ts` minus the manifest, pending bunny list-endpoint verification in planning.

## Metadata

**Analog search scope:** `scripts/`, `src/components/`, `src/types/`, `src/styles/`, `data/`, `package.json`
**Files scanned:** upload-tiles.ts, upload-tiles.test.ts, build-key.ts, build-key.test.ts, pnwm-identify.ts, pnwm-identify.test.ts, schemas.ts, tile-photos.ts, key-results-grid.ts, theme.css, package.json
**Pattern extraction date:** 2026-06-25
