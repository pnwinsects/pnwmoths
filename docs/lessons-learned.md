# Lessons Learned

Hard-won, reusable engineering knowledge for this repo — the "if you touch X, know Y"
constraints that outlive any one feature. Grouped by theme, not by history. When these
conflict with your intuition about how a tool "should" behave, trust the note: each one
cost a debugging cycle to discover.

## Build pipeline: Eleventy + Vite interaction

- **Vite wipes the Eleventy output directory (`_site/`) during its build.** Any file that
  isn't a Vite entry point (Parquet, CSS, images, JSON data) must be copied in *after*
  Vite runs, via `scripts/copy-images.js` / the `build:copy-parquet` step — Eleventy
  passthrough copy alone does not survive. The `emptyOutDir: false` comment in the Vite
  config is misleading; don't rely on it.

- **`| url` filter rule: static assets yes, Vite entry points no.** Assets copied in
  post-Vite (CSS, images) need `| url` to pick up `pathPrefix`. Assets Vite processes
  (JS bundle `<script src>` tags, and `/images/...` paths Vite rewrites) must *not* use
  `| url`, or the prefix gets applied twice and URLs 404. Same rule bites `fetch()` URLs
  and `tojson` output (`| safe` also required there).

- **`pathPrefix` must stay conditional on `process.env.GITHUB_PAGES`.** Never hardcode
  `/pnwmoths/`. Local/production builds serve from `/`; GitHub Pages staging serves from
  a subpath. Any Vite+Eleventy project is prone to double-prefix bugs — add a load test
  against a non-root `pathPrefix` to the smoke check before shipping.

- **Serve mode and build mode have different hook sequencing.** `npm run build` passing
  does not guarantee `eleventy --serve` works — build outputs (e.g. emitted JSON) can
  silently drop under serve. Test both explicitly.

## DuckDB at build time

- **`nullstr = ''` on every `read_csv` that reads nullable text.** Without it, a blank
  cell arrives as an empty string, not `null`, causing silent grouping/join failures
  (e.g. blank `subfamily`). Required on *every* such call.

- **The API is `.getRowObjectsJS()` + `conn.closeSync()`.** `@duckdb/node-api` does not
  expose a `.rows` property; verify the exact API in a one-file spike before building on
  it. Close connections to avoid resource leaks.

- **Export Parquet with Snappy, not ZSTD.** hyparquet (the client-side reader) needs
  `COMPRESSION snappy`; ZSTD-compressed files won't load in the browser.

- **Wrap `ST_DWithin` / `ST_Distance` operands in `ST_Boundary()`.** In this spatial
  build, raw Polygon-Polygon distance silently returns 0/true regardless of separation.
  Wrapping to the boundary linestring gives correct results. (`ST_Touches`, `ST_Contains`
  are unaffected.)

- **Join record-derived artifacts by positional `row_index`, not a content tuple.** The
  natural key `(species_slug, lat, lon, state, county)` is empirically non-unique across
  occurrence records; a content join silently fans out or drops rows.

## Lit web components

- **Use light DOM when Pico CSS (or any global element-selector CSS) must apply.** Set
  `createRenderRoot() { return this; }`. Pico's element selectors don't penetrate shadow
  DOM, and Leaflet needs light DOM too. Decide this at component creation — retrofitting is
  a rewrite. (Note: CSS custom properties are also unavailable inside a Canvas 2D context.)

- **Guard ResizeObserver callbacks against no-op writes.** Setting a reactive property
  unconditionally inside the callback triggers Lit's infinite re-render loop. Gate it:
  `if (next !== this._prop) this._prop = next`.

- **Focus trap = sibling-walk `inert` + high z-index, not `main.inert`.** Inerting the
  Lit host's own ancestor blocks the component itself. Instead, walk host → `<body>`,
  inert siblings at each level, leave the ancestor chain interactive. Also set the overlay
  to z-index 9000 to clear Leaflet controls (z-index 1000).

- **`min-width: 0` on every CSS grid `1fr` child.** Without it, `1fr` cells expand past
  their allocation to fit content and overflow into the adjacent column. Mandatory on any
  grid rule with overflow risk.

- **`String()`-coerce values bound to native inputs.** Binding a `Number` to a `.value`
  on a native range input makes Lit treat it as a property type and lose reactive sync;
  coerce to string.

- **Module-scope shared state is a silent failure mode — initialize per-invocation.** A
  module-level `Set`/`Map` used across pages/components leaks state (e.g. the second page
  processed gets no work done). Applies equally to build transforms and components.

- **Keep Chart.js instances mounted.** When a filter returns zero results, render
  zero-height bars rather than removing the canvas — destroying and re-inserting a canvas
  produces stale-renderer errors on a detached node. Axis titles in Chart.js v4 need no
  plugin (`scales.{x,y}.title`); `beginAtZero: true` over `min: 0`.

- **Reuse one OpenSeadragon instance across images** via `viewer.open()` to swap DZI
  sources — recreating the viewer per navigation flashes and re-initializes.

## Theming (Pico CSS overrides)

- **Override Pico color tokens under `:root:not([data-theme=dark])`, not a bare `:root`.**
  Pico scopes `--pico-primary` (and its other theme colors) to
  `:host(:not([data-theme=dark])), :root:not([data-theme=dark]), [data-theme=light]`
  — specificity (0,2,0). A `theme.css` override under plain `:root` (0,1,0) *loses
  regardless of load order*, silently, so the brand color never reaches links, nav, or
  stats and they fall back to Pico's default blue. This went unnoticed because the page
  background is set as a direct `html, body { background-color }` property (which does
  win) while the *token* override quietly did not. Verify color changes against
  `getComputedStyle`, not the value you typed in the stylesheet.

- **Pico links inherit `--pico-primary` via `:where(a)` (specificity 0,0,0).** Any
  element-level color you set (`.footer a { color: … }`, ≥0,0,3) wins over it — so
  per-context link colors are easy, but the global link color must be changed through the
  token at winning specificity (above). Ensure the chosen olive clears WCAG AA on *both*
  white content (#fff, ≥4.5:1) and the cream nav (#f3e8ba, ≥4.5:1); the legacy light olive
  `#a4ab78` is only ~2.4:1 and is safe for decorative fills/borders only, never text.

## Build-time HTML transforms

- **Initialize the `seen` Set per transform invocation, never at module scope.** Module
  scope means the second page Eleventy processes has already "seen" every term and gets no
  annotations — a silent, page-order-dependent bug that unit tests on a single input miss.

- **Multi-term text-node substitution needs a `while`-loop with a position cursor.** A
  single-substitution-per-call approach silently drops positionally-earlier shorter terms
  in the same text node. One `exchangeChild` pass should wrap all unseen terms.

- **Store injected metadata in `data-*` attributes, not DOM text.** Definition text in
  `data-definition` (materialized into a popover only at runtime) keeps it out of the
  Pagefind index for free — no special exclusion config needed.

- **Spot-check real build output for transforms.** The single-substitution bug above
  passed the existing unit tests and was only caught by inspecting an actual generated
  species page. Load and verify a real page, don't trust green units alone.

## Data migration & integrity

- **Add a uniqueness pre-flight before the full build.** A `GROUP BY slug HAVING count(*)
  > 1` assertion in the migration test scaffold catches duplicate-key collisions (which
  become Eleventy permalink clashes) from the CSV alone — cheaper than discovering them
  mid-build.

- **Stream huge dumps with `createReadStream(path, { encoding }) + readline`.** A 634 MB
  SQL dump exceeds Node's ~512 MB string-length limit; never `readFileSync` it. Streaming
  also handles latin1 encoding and multi-INSERT concatenation cleanly.

- **Slug is the foreign key for flat files** — `(genus + '-' + species).toLowerCase()`,
  alphanumeric + hyphens only, lowercased *unconditionally* (mixed case is a latent path/
  join collision). Numeric IDs are opaque to contributors; slugs match the URL structure.
  Derive join slugs from the DB genus+species, not from image filenames (they diverge for
  reclassified species).

- **Write-back scripts must be additive-only and idempotent.** Scripts that mutate
  committed data (`records.csv` district fill, CDN migration) must never overwrite
  curator-entered values, and a re-run must be byte-identical. Flag disagreements in an
  advisory report; never silently replace. Advance a durable status *before* any
  destructive step (e.g. file deletion) so an interrupted run is always recoverable.
  Guard credential-free pre-flight with a `DRY_RUN` check placed *before* the API-key check.

- **Prefer an authoritative source over a heuristic when one is recoverable.** Extracting
  bindings from the original tool's own data (the Lucid3 `key.data`) beat a fuzzy filename
  matcher decisively (180/237 vs 77/237, no mis-bindings). Look for the source of truth
  before tuning a matcher.

- **Preserve namespaced/zero-padded IDs as strings.** `district_id` is `US:<GEOID>` /
  `CA:<CDUID>` VARCHAR, never INTEGER — a numeric type drops leading zeros and can't
  disambiguate jurisdictions. Compound-key aggregates by `${state}:${county}` since county
  names collide across states.

- **Use a name→stable-ID crosswalk for legacy joins, not raw name matching.** Committed
  crosswalks absorb real-world renames (Skeena-Queen Charlotte → North Coast) and stay
  deterministic and curator-reviewable, instead of failing on string drift at join time.

- **Match acquisition scope to the requirement's measurement basis.** A per-state ≥99%
  coverage target needs per-state source data; acquiring one region partially (Alberta:
  1 of ~19 divisions) tanked the *overall* headline metric even though every acquired
  state passed. Scope the inputs to how the metric is measured.

- **Validate generated report artifacts against their format spec.** A `#`-commented
  count preamble broke RFC-4180 (the header must be line 1). Move summary counts to a JSON
  sidecar; keep the CSV valid. Format-check as part of the human-legibility pass, not just
  by eye.

## Verification & process

- **A byte-identical baseline is the strongest safety net for behavior-preserving work.**
  For migrations/refactors (e.g. the TS conversion), commit a pre-change `_site/` baseline
  and diff against it — data byte-for-byte, HTML modulo content-hashed asset names. It
  catches output drift that unit tests can't, and is cheap to produce once. Fail closed
  (`if ! diff … exit 1`), never `diff … && echo ok` under `set -e`.

- **Verify UI behavior through the data/event layer, not a headless viewport.** The
  preview browser reports a 0×0 viewport, so nothing is ever "visible" to an
  IntersectionObserver — hit-tests and hydration checks come back empty. Assert via the JS
  API (Pagefind results) and dispatched events (lightbox), and reserve screenshots for
  layout only.

- **TDD-lock semantics before building the UI.** Encode the behavioral contract as failing
  tests first — filter logic (OR-within / AND-across, "0 = unscored"), null passthrough
  (`null < N === false` in JS), county/collection/elevation dimensions. Locking the
  contract before a line of UI prevents downstream ambiguity and misimplementation. Extract
  pure helpers (`buildStateMap`, `deriveStatesAvailable`) so logic is unit-testable apart
  from the component.

- **Centralize invariants in one shared, tested module.** The geospatial axis-order →
  bounds → classify guard lives in `scripts/lib/district-assignment.ts` and is reused by
  both the fill and audit scripts, so the invariant is defined once, not re-derived per
  consumer. Shared type modules (`src/types/`) do the same for cross-layer contracts.

- **Enforce completed migrations as standing CI invariants.** `scripts/check-ts-only.sh`
  turns "the TS migration is done" into a continuously-enforced guard (bans `.js` sources,
  `allowJs`, `@ts-ignore`, unguarded double-casts — even in comments) rather than a
  one-time state that can silently regress.

- **Pilot a vertical slice before any bulk/expensive pipeline run.** One hand-picked
  example end-to-end surfaces cross-stage convention mismatches (URL/CORS/CDN, token
  scopes, slug casing) at zero bulk cost — invaluable when a re-run means hours of compute.
  Prefer simpler options first (direct CDN query params over named Image Classes); don't
  add speculative complexity you then have to debug out.

- **Close a data-coverage or "additive-only skipped it" gap at the phase that discovers
  it**, as a tracked follow-up — not vague deferred debt. And when images 404, distinguish
  "wrong filename" from "never uploaded" early: the fix differs (catalog edit vs migration).
