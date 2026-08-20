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

- **Vite's HTML scanner also sweeps `<meta>`, not just `<link>` and `<img>`.** It treats
  every `<link href>` as a copyable asset regardless of `rel`, and the `content` of a
  small allow-list of `<meta>` tags — `og:image`, `og:video`, `og:audio`,
  `twitter:image`, `msapplication-TileImage` — the same way. A root-relative,
  directory-style value there (`/species/{slug}/`) makes it `fs.readFile` a directory and
  throw `EISDIR` at build time. Two escapes: an absolute `https://` URL, which
  `isExternalUrl` skips (what the sharing metadata in `base.njk` relies on), or a
  `vite-ignore` attribute (what `src/species-redirect.njk` relies on, since its canonical
  link must stay `pathPrefix`-relative).

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

- **A hand-maintained mirror of a source-of-truth file will drift, silently.**
  `src/_data/speciesSlugs.json` looked generated (`redirect.njk` even said so) but nothing
  produced it, so adding a species to `data/species.csv` left the legacy-URL resolver
  unaware of it: real visitors following `/browse/…/{slug}/` were dumped on Browse, and the
  address was reported under "Unmapped Legacy Links" as a mapping nobody had written —
  while `/species/{slug}/` was published and returning 200. If a derived file can't be
  generated during the build, make a test assert the derivation
  (`src/_data/speciesSlugs.test.ts`); a comment claiming it is generated is not a guard.

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

- **Never declare a reactive property as a plain TypeScript class field — use `declare`.**
  Lit installs reactive properties as accessors on the *prototype*. A field declaration
  (`slug: string;`, or `_charts: Chart[] = [];`) compiles to a real class field whenever
  `useDefineForClassFields` is on, and a class field is defined on the *instance*, which
  shadows that accessor. The setter never runs, so `requestUpdate()` is never called: the
  component renders exactly once and is then frozen. Nothing throws, no console error
  appears, and the node-based component tests still pass, because Node's type stripping
  erases the annotation-only declaration that the bundler keeps. Write
  `declare slug: string;` — TypeScript is required to erase a `declare` field under every
  flag combination — and assign the initial value in the constructor.
  `src/components/reactive-fields.test.ts` guards the pattern statically, and
  `npm run smoke:browser` catches the general case by driving the built bundle
  ([ADR 0035](adr/0035-browser-smoke-gate.md)).

  This shipped: a Vite 8 bump (Aug 2026) changed the transform's default for
  `useDefineForClassFields`, and production silently lost every map, filter, accordion and
  lightbox for three days while the pages still rendered their first frame. Diagnosis
  shortcut: `Object.keys($0)` on a healthy Lit element shows the internal `__`-prefixed
  storage keys (`__slug`); a shadowed one shows the bare property names.

- **A green local build proves less than it looks like — the bundler version is part of the
  input.** Reproducing the freeze above needed the *installed* Vite, not the one in
  `package.json`: a `node_modules` still on 8.0.10 rebuilt the pre-fix sources perfectly
  happily, because that version resolved `useDefineForClassFields` the other way. `npm ci`
  first when a bug's suspect is anything the bundler decides, and check
  `node -e "console.log(require('vite/package.json').version)"` against `package.json`
  before concluding a defect does not reproduce.

- **A compiler option only applies where the bundler can find it.** `tsconfig.browser.json`
  has an `include` of `src/components/**`, but eleventy-plugin-vite hands Vite a *copy* of
  the tree (`.11ty-vite/`) as its root, so the files Vite actually compiles are not under
  that `include`. The nearest `tsconfig.json` to them is the root solution file, so
  browser-affecting options must be restated there — otherwise the bundler's own default
  wins, and changes when the bundler does.

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

- **Anything derived from factsheet prose inherits the legacy CMS's malformed Markdown.**
  The meta descriptions built from each account's opening paragraph exposed
  `euxoa-lineifrons.md`, whose emphasis markers straddled non-breaking spaces
  (`**Genus lineifrons* *is a pale…`) — which had also been italicising its entire
  opening paragraph on the page, unnoticed, since the migration. Derive defensively
  (`stripMarkdown` drops unbalanced markers) and scan *all* ~1,265 outputs for residue
  after any such change; a single bad file in a corpus that size is invisible in a sample.

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

- **A genus rename has to be all-or-nothing.** Renaming two of our six *Protorthodes* to
  *Trichopolia* (#259) split one genus into two interleaved blocks in checklist order, because
  MPG holds all six under *Trichopolia* — so our display genus alternated down the page. If an
  external list moves a genus, either follow it for every species we hold in that genus or for
  none; a partial move is worse than either ([ADR 0030](adr/0030-checklist-order-from-mpg.md)).

- **Two consumers, two case conventions, one column.** `data/species-synonyms.csv`'s
  `from_binomial` is lowercased by `ingest-photos.ts` before matching but compared
  **case-sensitively** by `build-key.ts` against the frozen Lucid source. A lowercase row is
  therefore silently invisible to the key: no error, just `build-key: 1188 matched` where it had
  been 1191. Write it capitalised. When a shared column has no single normalizer, the looser
  consumer hides the stricter one's failure.

- **Re-keying a slug means re-keying every path that embeds it.** A rename touches
  `image-derivatives.csv` in two path shapes — `<slug>/<file>` for legacy photos and
  `species-tiles/<slug>/…` for high-res tiles. Fixing only the first passes `npm test` and fails
  `check-derivatives.ts` at build time; fixing both makes the ledger assert CDN objects that do
  not exist until a maintainer runs the copy. Grep for the bare slug, not for one prefix.

- **A generated artifact must not carry hand-added fields it does not preserve.** For a year of
  its life, `data/species-photos.json` held curator-entered `photographer`/`license` that
  `generate-species-photos.ts` never produced, so `npm run photos:materialize` silently stripped
  every credit ([#267](https://github.com/pnwinsects/pnwmoths/issues/267)) — and the warning lived
  in a generator comment, exactly where a runbook step ("regenerate it") never looks. **Resolved by
  the third option** the original dilemma ("generator emits the field, or the field lives in its
  own file") missed: the generator now merges into the committed artifact, carrying curator fields
  forward and naming every slug that takes a default
  ([ADR 0034](adr/0034-generated-artifacts-merge-curator-fields.md); see the merge-rule lesson
  below). Two residues worth keeping: types did not save us — `speciesPhotos.ts` required both
  fields, but the error fired only *after* the damage was staged, reading as a JSON shape problem
  rather than lost attribution — and any generator that overwrites rather than merges its committed
  output should be treated as this bug waiting to recur.

- **`parse` + `stringify` round-tripping a CSV rewrites quoting you did not touch.**
  `csv-stringify` quotes only where required, so rows whose fields carried unnecessary quotes
  come back unquoted and land in the diff as unrelated churn. After a scripted edit, diff for
  changed lines that do not mention your target and restore them.

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

- **A "done" status the idempotency guard doesn't know about re-does the whole corpus.**
  `tile-photos.ts` skipped `status=tiled` and nothing else, so every one of the 3,811
  rows already at `uploaded` came back as eligible: `upload-tiles.ts` deletes the local
  tile directory once a row is on the CDN, so the filesystem check that would have caught
  it finds no `.dzi` and reports "not tiled". A routine `npm run photos:tile` would have
  re-downloaded ~250 GB from Dropbox and walked finished rows *backwards* out of
  `uploaded`, handing them all back for re-upload — and its first log line would have said
  `3,826 eligible` where the true backlog was 15 (#214). When a status machine grows a
  stage, re-read every `!== 'someStatus'` guard written before it existed; the guard that
  needs updating is the one that names a single status where it means "not finished".

- **Committed artifacts written by a script usually have a second author.** Both
  `data/species-photos.json` (curator-entered `photographer`/`license`) and
  `data/image-derivatives.csv` (the durable record of a CDN whose scratch state lives in
  `var/`) were emitted from scratch by their generator, so a run silently deleted whatever
  it hadn't computed — one of them failing `tsc --noEmit` on every single run, the other
  reachable from the runbook's own advice to scope a run. Before a generator writes a
  committed file, ask what is in that file that its inputs cannot reproduce, and merge
  rather than replace ([ADR 0034](adr/0034-generated-artifacts-merge-curator-fields.md)).

- **Loosening a parser does not fix the rows already parsed under the strict version.**
  Filenames using a space rather than a hyphen before the specimen tail
  (`Euxoa absona A-D.tif`) ingested with an empty `specimen_id`/`view`, which made them
  untileable even where the binomial was a clean match. Fixing the regex changed nothing
  on its own: a re-ingest skips rows already present by `content_hash`, and `RESORT_ONLY`
  deliberately re-classifies from the stored `binomial_raw` rather than re-parsing. A
  grammar change needs a backfill path for the existing manifest — put it in the
  re-classification pass, where it stays available for the next such change, and write
  only into empty fields so it can never clobber a correction.

- **Write-back scripts must be additive-only and idempotent.** Scripts that mutate
  committed data (`records.csv` district fill, CDN migration) must never overwrite
  curator-entered values, and a re-run must be byte-identical. Flag disagreements in an
  advisory report; never silently replace. Advance a durable status *before* any
  destructive step (e.g. file deletion) so an interrupted run is always recoverable.
  Guard credential-free pre-flight with a `DRY_RUN` check placed *before* the API-key check.

- **Whole-file read-modify-write state needs a lock the moment two long runs can overlap —
  and the lock goes before the *read*.** A pipeline stage that loads a manifest, mutates rows
  and rewrites the file in full does not corrupt anything when run concurrently; the last
  writer just emits a valid file missing the other's changes. That is what makes it lethal.
  During the #224 pilot an uploader put 20 files on the CDN and the still-running generator
  reset all 20 rows to the previous status: the uploader reported `20 uploaded, 0 failed`, the
  objects were on the CDN, and all 20 fetched byte-identical. The only symptom was a status
  line whose buckets summed to the row total with no `uploaded` bucket in it. Locking before
  the first write is *not enough* — the stale in-memory copy is the bug, so the lock belongs
  before `readManifest` ([#234](https://github.com/pnwinsects/pnwmoths/issues/234),
  [ADR 0025](adr/0025-manifest-locks.md)). Take over a lock whose holder is dead rather than
  waiting, or one `kill -9` wedges a multi-hour resumable run; leave `DRY_RUN` unlocked so a
  peek during a long run still works. Scope it to *long-running scripts sharing whole-file
  state a human would plausibly overlap* — not the `&&`-sequential build chain, not one-shot
  migrations.

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

- **A "broken link" that reproduces nowhere is a CI-identity problem, not link rot.** lychee
  resolves `github.com` URLs through the GitHub API rather than fetching the page, so on the
  shared Actions runner IPs it exhausts the anonymous rate limit and the API answers **404** —
  which the report renders as `[404] … | Rejected status code: 404 Not Found`, indistinguishable
  from a genuinely dead link. Two PR checks failed on a single such error against
  `github.com/pnwinsects/pnwmoths/issues`, a public URL serving 200 to anyone who tried it by
  hand, while `main` stayed green. The fix is `GITHUB_TOKEN` in the env of every step that runs
  lychee — not a `lychee.toml` exclude, which would blind the check to real rot on the one host
  we link to most deliberately. Before excluding a host, check whether the failure is *the
  runner's identity* rather than the target: intermittent, unreproducible off-runner, and
  confined to one host is the signature.

- **A post-build gate must run downstream of every step that writes into the output.**
  `check-withheld` and `check-unpublished` ran straight after `build:eleventy`, and
  `build:copy-parquet` ran *after* them — so the gates read `_site/species/` before the step
  that filled it. Both passed for a year while occurrence records for 126 embargoed Geometridae
  and 45 provisional species were published at `/species/{slug}/records.parquet`, pages 404ing
  above them ([#275](https://github.com/pnwinsects/pnwmoths/issues/275)). Neither gate was
  wrong; both were early. Two habits fall out: order gates last in `build:site`, and write them
  against the *directory*, not the artifact you happen to be thinking of — "a gated slug has
  nothing under `_site/species/<slug>/`" survives a new build step, "no `index.html`" does not.
  The corollary for the data side: a display deny-list is only a deny-list at the choke points
  that consult it, so adding a step that copies out of `data/` means adding a fifth caller of
  `loadUnpublishedSpecies`, not just a new npm script.

- **A green build gate says nothing about what the CDN is serving.** Deploy is additive — no
  purge, no deletes ([0008](adr/0008-deploy-bunny-additive.md)) — so a page that stops being
  emitted stays live at its last build, forever. `check-unpublished` passes because the gate
  works: no deny-listed species is *emitted*. Meanwhile 32 of the 45 deny-listed slugs were
  still returning 200 in production, alongside a species deleted outright in
  [#268](https://github.com/pnwinsects/pnwmoths/issues/268)
  ([#273](https://github.com/pnwinsects/pnwmoths/issues/273)). Nothing linked to them and they
  were out of the sitemap, which is exactly why nobody noticed. "The build doesn't emit it" and
  "it isn't on the internet" are different claims: verify the second with `curl -sI` against the
  live host, not by reading `_site/`. Any *removal* — of a page, a route, an asset — needs that
  second check written into its runbook.

- **Compare entry points with `pathToFileURL(process.argv[1]).href`, never
  `` `file://${process.argv[1]}` ``.** `import.meta.url` is a normalized file URL
  (`file:///C:/a/b.ts`); `process.argv[1]` on Windows is a backslash path (`C:\a\b.ts`).
  String-concatenating `file://` onto it produces neither, so the guard is *always* false
  on Windows: the script loads, defines everything, calls nothing, and exits 0. Silent
  no-op, success exit code — indistinguishable from a clean run, including the `DRY_RUN=1`
  sanity check the runbooks tell maintainers to do first. 27 scripts shipped this way and
  CI never caught it, because on POSIX the two forms coincide
  ([#189](https://github.com/pnwinsects/pnwmoths/issues/189)).
  `scripts/entry-point-guards.test.ts` is a source-level invariant test that keeps it from
  coming back. General rule: a cross-platform bug that fails *silently* on the platform CI
  doesn't run needs a source-level guard, not a runtime one.

- **A non-blocking check must not write state a blocking check reads.** `production.yml`'s link
  check is `continue-on-error: true`, but it saved its lychee cache to the same
  `lychee-cache-` namespace the blocking PR check restored from — and `max_cache_age = "7d"`
  kept a cached *error* fresh for a week. One transient outage on an external site red-flagged
  every PR until someone found and deleted the poisoned cache entry, with a message naming a
  page the contributor had never touched
  ([#261](https://github.com/pnwinsects/pnwmoths/issues/261)). Removed in
  [0027](adr/0027-no-link-check-cache.md). The general shape: shared mutable CI state inherits
  the *weakest* writer's failure semantics, so check which workflows can write a cache before
  trusting one.

- **Measure a cache before hardening it.** The lychee cache looked essential — a stale local
  `.lycheecache` held 11,806 entries. Against a current build it covered **35** URLs: internal
  links resolve to `file://`, which lychee never caches (`ignore_cache()` returns true for any
  file URI), and the 17,000 CDN images left the workload when
  [0022](adr/0022-pregenerated-image-derivatives.md) retired the Bunny Optimizer and their
  `?width=` query strings with it. `lychee --dump` answers this in one command; a cache file is
  a record of a past configuration, not the current one. Two of the three fixes proposed for the
  bug above were more machinery than the thing they protected.

- **`npm test` names its files explicitly, so a new `*.test.ts` runs only if you add it there.**
  Forgetting is silent — the suite stays green and the new file looks like coverage while running
  zero times. Four files had drifted out this way (`upload-derivatives`, `audit-optimizer-usage`,
  `backfill-tribe`, and the new `report-link-rot`): 39 passing tests nothing ever ran. The list is
  deliberate — ordering matters for the data-pipeline tests — so the fix is
  `scripts/test-registration.test.ts`, which fails when a test file on disk is unregistered or a
  registered pattern matches nothing.

- **A green check that skipped the work is not evidence.** Removing that cache turned the first run
  red on two Government of Canada hosts that refuse GitHub's runners. The 18 preceding production
  runs were "clean" because a 7-day window meant they never probed those hosts — failures appeared
  only in runs where an entry had aged out, which is the opposite of a low failure rate. Before
  reading a passing history as coverage, check whether the passing runs actually asked. The same
  trap sits in any skip-if-unchanged gate.

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

- **Scanning the built output is only half a guard when components build URLs in the
  browser.** `check-derivatives.ts` started as "every `derived/` URL in `_site/*.html` must
  be in the manifest", which passed 13,107/13,107 — and would still have missed a whole
  class of breakage, because `pnwm-taxon-browser` and `key-results-grid` assemble their
  thumbnail URLs at runtime from JSON. Those URLs are never in the HTML. The complement is
  a gate over the *inputs*: every source image a built page can reach must have its full
  variant set. Ask of any output-scanning check: what does this artifact not contain
  because a client assembles it later? ([#226](https://github.com/pnwinsects/pnwmoths/issues/226))

- **Turning off an edge transform does not un-transform what is already cached — purge, then
  measure.** Immediately after the Optimizer was disabled, production served a plate thumbnail
  at 14,243 B where storage held 44,425 B, and a legacy JPEG at 126,651 B against a stored
  147,961 B. Nothing was broken (the cached copies were *smaller*), which is exactly what makes
  it dangerous: every measurement taken in that window silently describes a mix of pre- and
  post-toggle responses. **A query string is not a cache key on Bunny** — `?bust=<random>`
  returned `cdn-cache: HIT` — so selective busting is not available; purge the zone or wait out
  the long image TTL ([0009](adr/0009-bunny-cache-policy.md)). After the purge every sampled
  object matched its stored bytes exactly.

- **To prove an edge transform is off, ask it to transform.** Comparing byte sizes could not
  distinguish "Optimizer disabled" from "serving a stale optimized copy" — both give a number
  that differs from storage. Requesting `?width=100` and getting the full-size original settles
  it in one call, because only a live transform could honour it. Pick the test whose two
  outcomes have different *causes*, not merely different values.

- **A bulk network check needs a serial re-check pass, not just per-request retries.** The
  cutover sweep reported 6 consecutive `fetch failed` errors on one species out of 26,927
  objects; every one served 200 when asked again calmly. Under concurrency a local hiccup
  does not arrive as one scattered failure, it arrives as a burst, and a per-request retry
  ladder rides the same congestion it is retrying into. Re-check anything non-ok serially
  at the end, outside the concurrency limit, before reporting. A false "do NOT disable the
  Optimizer" is the exact failure mode [0017](adr/0017-reproducible-committed-artifacts.md)
  keeps the *build* offline to avoid — a one-off verification script does not get to
  reintroduce it. ([#227](https://github.com/pnwinsects/pnwmoths/issues/227))

- **Measure the thing you are about to turn off; do not reason about it.** Every prediction
  going into the Optimizer cutover was about missing objects, and all 26,927 were present.
  The actual regression was a *format* change nobody had modelled: plate thumbnails stored
  at ~1 byte/pixel, which auto-WebP had been quietly rescuing, so one page went 1,283 KB →
  5,327 KB. Meanwhile the biggest predicted unknown — runtime DZI tile fetches — was a
  non-event (already `.webp`, byte-identical). Both facts came from HEADing real URLs
  against a disposable staging pull zone, which cost nothing and took minutes.

- **Scope a data gate to what actually builds, and derive that scope from data, not from
  `_site/`.** An unscoped source check failed immediately on 83 rows for withheld
  Geometridae — real missing files, but for pages nobody can reach, so the gate would have
  been noise from day one. Scoping it through the same withheld/unpublished predicates
  `src/_data/species.ts` uses makes it silent today and loud at exactly the right moment:
  lifting the embargo now fails the build rather than publishing broken `<img>` tags.
  Deriving the scope from `_site/species/` instead would have been subtly wrong — Eleventy
  does not clean between builds, so a stale directory silently widens it.

- **Settle a major-version bump by parsing real data with both versions, not by reading the
  changelog.** Dependabot surfaced six breaking changes for csv-parse 7.0.0; all six actually
  landed in 6.0.0, which we were already past, and upstream's own changelog says 7.0.0 "was
  published by mistake, there is no breaking changes" and that its notes wrongly included
  6.0.0's commits. Release notes are prose written by humans and can be wrong in either
  direction. Installing both versions side by side (`npm install pkg@X --prefix ./vX`) and
  diffing the parsed output of every project CSV took minutes and answered the question
  definitively — 101,287 rows, byte-identical. Check the *patch* line too: 7.0.0 shipped a
  broken CJS export fixed in 7.0.1, so the "obvious" `^7.0.0` was the wrong pin.

- **`@types/node`'s major follows `.nvmrc`, not "latest" — a green typecheck doesn't clear
  it.** Dependabot offered `@types/node` 26 while `.nvmrc` (and therefore CI's
  `node-version-file`) pins Node 24 LTS. It typechecked clean and all 1581 tests passed,
  because the bump breaks nothing that *exists* — it widens what the compiler will vouch
  for, so a Node 26-only API would sail through the one gate meant to catch it and fail at
  runtime instead. Green is the expected result here, not evidence. The major is ignored in
  `.github/dependabot.yml`; lift the ignore in the same PR that moves `.nvmrc`.

- **A test that hardcodes a library's output can't detect that library changing.** The sole
  guard on csv-parse's `relax_quotes` behavior asserted against a hand-written string that
  didn't match what csv-parse actually returned, and checked only the two fields that were
  identical either way — so it could not fail for the reason it existed (ISSUE-165). If a test
  exists to catch upstream drift, it must round-trip real input through the real library.
  Mutation-test the guard afterwards: reintroduce the bug and confirm it goes red. A guard you
  haven't watched fail is a guess.

- **A committed JSON file can be checked by the compiler, not just cast.** `resolveJsonModule`
  is on, so `import data from '../../data/x.json' with { type: 'json' }` gives a type inferred from
  the file's real contents — and assigning that to a declared interface verifies the committed bytes
  at compile time. Measured cost: 0.08s of `tsc` for a 660 KB file. This is strictly stronger than
  `as`, which only asserts, and it caught a cast in `src/_data/plates.ts` that claimed `title` and
  `description` on manifest entries that have never had either (#250). It works only for files with
  a fixed path that ship in the repo; anything read at runtime, or discovered by listing a
  directory, still needs zod at the boundary.

- **Reproducible is not the same as current.** A committed artifact can be perfectly
  deterministic and still disagree with its inputs, because nothing forces whoever changed the
  inputs to regenerate it. `data/key-matrix.json` stayed stale for months after a photo was added
  to `data/images.csv` (#197), which meant `/identify/` showed a grey placeholder for a species
  whose image was live, and `npm run build:site && npm test` — the flow CLAUDE.md documents —
  failed on a clean checkout because the build refreshed the artifact and a test still pinned the
  old value. If an artifact is committed, test that it equals a fresh build, not just that two
  builds agree. Rebuild into a temp dir via the script's output override, never in place
  ([ADR 0017](adr/0017-reproducible-committed-artifacts.md)).

- **A lenient parser is the wrong tool for judging output.** `/plates/` shipped 98 cards as
  `<imgsrc="…">` for months — a Nunjucks comment inside an open tag, written `{#- … -#}`, closed the
  whitespace on *both* sides and welded the tag name to its first attribute (either marker alone is
  harmless, which is part of why it survived review), and the HTML tokenizer read the result as an element named
  `imgsrc`, which renders as nothing. Every existing check missed it for the same underlying
  reason: they read the output *as a document*. `node-html-parser` (already a dependency) hands
  back an ordinary `img`; lychee checks `src` attributes and this markup has none; the derivative
  guard proved the CDN file existed; the weight check saw the page get *smaller*. Vite does emit
  `parse5 error code unexpected-character-in-attribute-name` — as a warning, and the build exits 0.
  A defect that destroys the document while emitting valid-looking bytes is invisible to anything
  that starts by parsing it. `scripts/check-html.ts` checks the bytes instead
  ([ADR 0024](adr/0024-html-validity-gate.md)).

- **A wider reference set can make a guard weaker, not stronger.** The runbook column guard
  resolves a column name in prose against the CSVs *that document names*, not against every
  header in `data/`. The wider version reads as the stricter one and isn't: `species_id` — the
  exact bug the guard exists to catch (#240) — is a real column of `data/records-bad-coords.csv`,
  so a repo-wide union would have passed it. Before widening a matcher's reference set, check
  whether the known bug still fails against it ([ADR 0023](adr/0023-runbook-schema-guard.md)).

- **Never let a script write outputs to a fixed path when its inputs are redirectable.**
  `build-key.ts` honored `KEY_CHAR_IMAGES_CSV` for input but hardcoded its `data/` output
  paths, so tests pointing at fixtures overwrote the committed artifacts on every `npm test`
  (ISSUE-163). Input and output overrides come in pairs. See
  [ADR 0017](adr/0017-reproducible-committed-artifacts.md) for the related rule that committed
  artifacts embed no timestamp — the churn from that timestamp is what hid this bug for
  months, and "the file always shows as modified" is a warning sign, not a fact of life.
