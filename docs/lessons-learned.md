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

- **`| url` filter rule: static assets yes, Vite entry points and `public/` no.** Assets
  copied in post-Vite (CSS) need `| url` to pick up `pathPrefix`. Assets Vite processes
  (JS bundle `<script src>` tags) and anything under `public/` must *not* use `| url` —
  Vite applies `base` (which is `pathPrefix`) to them itself, so the prefix would get
  applied twice and URLs 404. Same rule bites `fetch()` URLs and `tojson` output
  (`| safe` also required there).

- **Site-wide images must live in `public/` (Vite's `publicDir`), never be Vite assets.**
  `vite:build-html` resolves every `<img src>` / `<link href>` in every page through
  `fileToBuiltUrl`, which does `await fs.readFile(...)` and only *then* populates its
  asset cache — so a shared layout produces one concurrent read per page per asset, all
  missing the cache. With ~1,300 species pages and 15 assets in `base.njk` (favicon,
  banner, 13 partner logos) that is ~20,000 simultaneous `open()` calls: `EMFILE: too
  many open files`, first on Windows (512-descriptor CRT default) and eventually
  everywhere, growing with every species added (issue #187). Files under `publicDir` are
  short-circuited by `checkPublicFile` before any read and rewritten by string
  substitution, so the cost is zero regardless of page count. Two constraints keep this
  working: the directory must be top-level `public/` (eleventy-plugin-vite
  passthrough-copies `publicDir` as a *project-relative* path, while Vite resolves it
  against `root` = the `.11ty-vite/` copy of the output — only `"public"` satisfies
  both), and references to it must be plain root-absolute paths with no `| url`.

- **`pathPrefix` must stay conditional on `process.env.GITHUB_PAGES`.** Never hardcode
  `/pnwmoths/`. Local/production builds serve from `/`; GitHub Pages staging serves from
  a subpath. Any Vite+Eleventy project is prone to double-prefix bugs — add a load test
  against a non-root `pathPrefix` to the smoke check before shipping.

- **Serve mode and build mode have different hook sequencing.** `npm run build` passing
  does not guarantee `eleventy --serve` works — build outputs (e.g. emitted JSON) can
  silently drop under serve. Test both explicitly.

- **An inline `<script type="module">` in a page is a Vite entry.** That's the supported
  way for a standalone page (e.g. `src/redirect.njk`) to import from `src/_lib` — the
  passthrough copy of `_lib` is what makes the relative import resolve in `_site/`. The
  cost is one hashed chunk per such page, which is why per-species inline modules are
  banned in favour of `components/main.ts` (see the comment there). Guard the arrangement
  with a test that runs a real `vite.build()` over just that page and asserts the imported
  code lands in the bundle: a broken import leaves a page that renders and does nothing.

## Analytics from CDN logs

- **The Bunny access log already contains query strings.** `entry.path` is the full
  request target, which is why `stripQueryString()` exists in
  `scripts/fetch-analytics.ts`. Anything a static page can encode into a URL it requests
  is therefore recoverable server-side with no endpoint, no beacon and no third party —
  that is how missed legacy redirects are counted ([ADR 0019](adr/0019-legacy-link-telemetry-from-logs.md)).
  Before reaching for client-side telemetry on this site, check whether the URL already
  carries the answer.

- **Logs expire in 72 hours.** Anything the nightly job doesn't aggregate is gone for
  good. Aggregation code must soft-fail (missing input file → empty set, not a throw):
  crashing the job to protect data quality costs an entire irrecoverable day of logs.

- **Daily analytics JSON is inlined into `/analytics/index.html`.** Every new per-day array
  multiplies by the number of days retained, so cap list lengths in both the producer
  (`scripts/fetch-analytics.ts`) and the loader (`src/_data/analytics.ts`).

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
  to z-index 9000 to clear Leaflet controls (z-index 1000). Two corrections learned the
  hard way ([0020](adr/0020-inert-modal-focus-containment.md)): the walk must include
  **`<body>`'s own children** — stopping at `parentElement.tagName !== 'BODY'` leaves the
  header, footer and any body-level banner fully tabbable behind the overlay — and because
  the walk skips the host, **anything else inside the host must be inerted separately**
  (`?inert=${this._open}` on the underlying content), or Tab reaches the controls sitting
  behind the modal.

- **`focus()` is silently ignored inside an `inert` subtree.** Restoring focus to the
  element that opened a modal fails if the un-inerting re-render hasn't flushed yet — no
  error, focus just falls back to `<body>` and the keyboard user lands at the top of the
  page. Defer the restore: `void this.updateComplete.then(() => opener.focus())`. Note the
  ordering trap — *adding* containment is what breaks restore, so the two changes have to
  be tested together.

- **A backtick inside a comment in a `` css`` `` block terminates the template literal.**
  Writing ``/* labels with no `for` */`` inside Lit's tagged CSS ends the string mid-rule
  and yields confusing downstream parse errors (`TS1005: ';' expected`) pointing at lines
  far from the comment. Use plain quotes in CSS comments.

- **Lit `` html`` `` templates have no JSX-style comments.** `{/* … */}` is not syntax
  here; it renders as literal text in the page. Use `<!-- … -->`.

- **Global utility classes do not cross a shadow boundary.** A `.sr-only` (or any helper)
  defined in `theme.css` has no effect inside a component's shadow root — the class silently
  does nothing and "visually hidden" labels render as ordinary visible text. Shadow-DOM
  components need their own copy in `static styles`. This sat unnoticed in the filter bar
  because unstyled labels look plausible rather than broken.

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

## Accessibility

- **`aria-label` *replaces* an element's accessible name — it never supplements it.** Using
  it to attach explanatory text destroys the thing it was attached to: moving each glossary
  definition onto its `<abbr>` meant a screen reader announced a 267-character definition
  where the word "thorax" belongs, mid-sentence, on every species account. Supplementary
  text is `aria-describedby` pointing at an element that holds it. Reach for `aria-label`
  only when an element has *no* usable text of its own (icon buttons).

- **A live region must already be in the accessibility tree when it changes.** Filling a
  `[hidden]` / `display:none` container and *then* revealing it announces nothing — the
  mutation happened while the region was out of the tree, and revealing populated content
  is not an update. Keep a small, always-rendered `.sr-only` `role="status"` element and
  write the message into that. The header search carried an `aria-live="polite"` that had
  never once fired for this reason.

- **An image inside a link or label that already names the target must be `alt=""`.**
  Descriptive alt on a card thumbnail duplicates the card's own text, so every result is
  announced twice — 866 such nodes across `/identify/` and `/plates/`. Decorative-by-context
  is the common case in a grid of labelled cards.

- **`role="application"` suppresses screen-reader browse mode.** It tells AT to stop
  interpreting content and forward every keystroke, which is only correct for a widget that
  implements a complete keyboard model of its own. A Leaflet map whose controls are ordinary
  focusable buttons is not that; `role="region"` with a real label is.

- **Audit in a real browser, not by reading source.** Source review and automated scanning
  each caught things the other missed here. axe found the ~1,050 unnamed buttons and the
  4.01:1 nav contrast; only scripted keyboard probing showed that focus escaped the modal
  and that focus restore silently failed. Neither substitutes for assistive-technology
  testing, which remains the largest untested surface
  ([#208](https://github.com/pnwinsects/pnwmoths/issues/208)).

- **State conveyed only by a visual property is invisible to AT.** Dimming non-matching
  taxa to `opacity:0.35` communicates nothing programmatically (334 of 417 rows, zero ARIA
  signal) and also drops the text below contrast minimums. Pair any such affordance with
  `aria-disabled`, visually-hidden text, or a live result count.

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

- **`applyGlossaryTerms` only sees *direct-child* text nodes of `main p, li, h2, h3`.**
  It filters `el.childNodes` for `nodeType === 3`, so any term nested inside another
  element — most often a link — is invisible to it. Two consequences: prose that hand-links
  a term gets no tooltip (two species accounts shipped dead links to the old WWU site for
  exactly this reason, [#202](https://github.com/pnwinsects/pnwmoths/issues/202)), and
  **changing heading levels changes tooltip coverage**, because `h4`/`h5` are not in the
  selector list. Re-check a rendered account after any bulk edit to prose structure.

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

- **If `npm run build:site` dirties `data/`, the committed artifact is stale — that's a
  bug, not churn.** Since [0017](adr/0017-reproducible-committed-artifacts.md) these files
  are byte-reproducible, so a non-empty `git status` after a build means the artifact no
  longer matches its inputs. Do not commit the regenerated file as a side effect of
  unrelated work, and do not dismiss it: a stale `key-matrix.json` was serving a placeholder
  for a species that had a photo, and pinned the drift into a test expectation
  ([#197](https://github.com/pnwinsects/pnwmoths/issues/197)). Revert it, and file it.

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

- **Settle a major-version bump by parsing real data with both versions, not by reading the
  changelog.** Dependabot surfaced six breaking changes for csv-parse 7.0.0; all six actually
  landed in 6.0.0, which we were already past, and upstream's own changelog says 7.0.0 "was
  published by mistake, there is no breaking changes" and that its notes wrongly included
  6.0.0's commits. Release notes are prose written by humans and can be wrong in either
  direction. Installing both versions side by side (`npm install pkg@X --prefix ./vX`) and
  diffing the parsed output of every project CSV took minutes and answered the question
  definitively — 101,287 rows, byte-identical. Check the *patch* line too: 7.0.0 shipped a
  broken CJS export fixed in 7.0.1, so the "obvious" `^7.0.0` was the wrong pin.

- **A test that hardcodes a library's output can't detect that library changing.** The sole
  guard on csv-parse's `relax_quotes` behavior asserted against a hand-written string that
  didn't match what csv-parse actually returned, and checked only the two fields that were
  identical either way — so it could not fail for the reason it existed (ISSUE-165). If a test
  exists to catch upstream drift, it must round-trip real input through the real library.
  Mutation-test the guard afterwards: reintroduce the bug and confirm it goes red. A guard you
  haven't watched fail is a guess.

- **Never let a script write outputs to a fixed path when its inputs are redirectable.**
  `build-key.ts` honored `KEY_CHAR_IMAGES_CSV` for input but hardcoded its `data/` output
  paths, so tests pointing at fixtures overwrote the committed artifacts on every `npm test`
  (ISSUE-163). Input and output overrides come in pairs. See
  [ADR 0017](adr/0017-reproducible-committed-artifacts.md) for the related rule that committed
  artifacts embed no timestamp — the churn from that timestamp is what hid this bug for
  months, and "the file always shows as modified" is a warning sign, not a fact of life.
