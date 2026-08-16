// scripts/check-browser-smoke.ts
//
// Post-build gate: serve `_site/` over HTTP and drive it in a real headless
// browser, asserting that the interactive components reach their SECOND frame.
//
// Every other gate in this repo reads bytes. check-html.ts tokenizes markup,
// check-page-weight.ts weighs it, deploy-smoke.ts hashes what the CDN returns.
// A site whose every component rendered once and then froze passes all three,
// which is exactly what shipped for three days in issue #316 / PR #315: Vite 8
// flipped `useDefineForClassFields`, a plain TypeScript field declaration became
// a real class field, and that instance field shadowed the accessor Lit installs
// on the prototype. The setter never ran, so `requestUpdate()` never fired.
//
// `npm test` could not see it. Those tests import the TypeScript sources and
// call exported pure functions; node's type stripping erases an annotation-only
// declaration, so the suite exercised different code than the bundler emitted.
// Nothing threw. Nothing logged. Every map sat on "Loading occurrence data..."
//
// So this check runs the bundle. Each assertion is deliberately about a state
// change the component can only reach by re-rendering — not "did HTML appear"
// but "did the DOM change after the data arrived / after I clicked". Assertions
// read observable DOM (aria-labels, aria-expanded, visible text) rather than
// component internals, so they survive refactors.
//
// It is NOT part of `npm run build`. The build must stay runnable offline and
// without a browser (same reasoning as generate-range-map.ts and
// generate-social-card.ts); CI runs this as its own step after the build.
//
// Run via: npm run smoke:browser        (after `npm run build:site`)
//
// Environment variables:
//   SITE_DIR               — built site to serve (default: _site)
//   SMOKE_BROWSER_CHANNEL  — force one Playwright channel instead of probing
//   SMOKE_TIMEOUT_MS       — per-assertion timeout (default: 15000)
//   SMOKE_SPECIES          — species slug to check (default: the one with the
//                            largest records.parquet, i.e. the most records)

import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';

const SITE_DIR = resolve(process.env['SITE_DIR'] ?? '_site');

/**
 * Per-assertion timeout.
 *
 * Validated rather than passed straight through: a non-numeric value would
 * reach `setDefaultTimeout(NaN)`, which disables the timeout entirely, and the
 * job would then hang until the CI runner's own limit killed it — a typo
 * turning a gate into an outage.
 */
export function parseTimeout(raw: string | undefined, fallback = 15_000): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`SMOKE_TIMEOUT_MS must be a positive number of milliseconds, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

const TIMEOUT_MS = parseTimeout(process.env['SMOKE_TIMEOUT_MS']);

/**
 * Channels to try, in order, when the caller has not named one.
 *
 * `playwright-core` ships no browser of its own — that is why it is the
 * dependency here rather than `playwright` (see generate-social-card.ts, which
 * launches `channel: 'chrome'` for the same reason). Locally and on the GitHub
 * Actions ubuntu runner alike, `chrome` resolves to the installed Google Chrome
 * and needs no download.
 *
 * `msedge` is the real fallback. `chromium` is NOT a fallback to the runner's
 * system Chromium package: that channel resolves to Playwright's own bundled
 * build, which playwright-core never downloads by design, so it fails wherever
 * Chrome is absent too. It is kept only for a developer who happens to have run
 * `playwright install`, and must not be mistaken for redundancy in CI.
 */
const DEFAULT_CHANNELS = ['chrome', 'msedge', 'chromium'];

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing without a browser)
// ---------------------------------------------------------------------------

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  // hyparquet fetches the whole file and slices it in memory (see
  // parquet-cache.ts — no range requests), so the type only has to be one the
  // browser will not try to sniff or transform.
  '.parquet': 'application/octet-stream',
};

export function contentTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Map a request path onto a file inside `siteDir`, or null for 404.
 *
 * Directory requests resolve to `index.html`, matching how both Bunny and
 * GitHub Pages serve the built tree. Paths that escape `siteDir` resolve to
 * null rather than throwing: this server only ever faces our own pages, but a
 * traversal that silently succeeded would make the check's results meaningless.
 */
export function resolveRequestPath(urlPath: string, siteDir: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]!.split('#')[0]!);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0')) return null;

  const root = resolve(siteDir);
  const candidate = resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  if (!existsSync(candidate)) return null;
  if (statSync(candidate).isDirectory()) {
    const index = join(candidate, 'index.html');
    return existsSync(index) ? index : null;
  }
  return candidate;
}

/**
 * The species whose `records.parquet` is largest, i.e. the one with the most
 * occurrence records.
 *
 * Deliberately derived from the build rather than hard-coded. A pinned slug
 * would be a curation hostage — species get merged, renamed and gated — and
 * "most records" guarantees the map has markers to plot, so a zero count is a
 * real failure rather than an accident of which species we picked.
 */
export function pickSpeciesSlug(siteDir: string): string {
  const speciesDir = join(siteDir, 'species');
  if (!existsSync(speciesDir)) {
    throw new Error(`no species/ directory in ${siteDir} — run the build first`);
  }
  let best: { slug: string; size: number } | null = null;
  for (const entry of readdirSync(speciesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const parquet = join(speciesDir, entry.name, 'records.parquet');
    if (!existsSync(parquet)) continue;
    const { size } = statSync(parquet);
    // Ties break alphabetically so the choice is stable across machines.
    if (!best || size > best.size || (size === best.size && entry.name < best.slug)) {
      best = { slug: entry.name, size };
    }
  }
  if (!best) throw new Error(`no species/*/records.parquet found under ${siteDir}`);
  return best.slug;
}

/**
 * Pull the plotted-record count out of the occurrence map's aria-label.
 *
 * The label is the component's own summary of what it drew ("… : 42 records
 * plotted."), which makes it both the accessible name and the only place the
 * marker count is observable from outside. Returns null if the label is not of
 * that shape — the caller reports that as a failure rather than a zero.
 */
export function parsePlottedCount(ariaLabel: string): number | null {
  const match = /([\d,]+)\s+records?\s+plotted/.exec(ariaLabel);
  if (!match) return null;
  return Number(match[1]!.replace(/,/g, ''));
}

/**
 * Pull the species count out of the Identify results grid's count line.
 *
 * Both phrasings come from buildCountText() in key-results-grid.ts:
 * "Showing all 1,190 species" before any selection, "37 species match" after.
 */
export function parseResultCount(text: string): number | null {
  const match = /([\d,]+)\s+species/.exec(text);
  if (!match) return null;
  return Number(match[1]!.replace(/,/g, ''));
}

// ---------------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------------

interface Served {
  origin: string;
  close: () => Promise<void>;
}

/**
 * Serve `siteDir` on an ephemeral loopback port.
 *
 * This is a test fixture, not runtime infrastructure — the site itself stays
 * static with no server (ADR 0001). It exists because `file://` URLs cannot
 * fetch the Parquet and JSON the components load, so there is no way to
 * exercise them without an origin.
 */
export function serveSite(siteDir: string): Promise<Served> {
  const server: Server = createServer((req, res) => {
    const filePath = req.url ? resolveRequestPath(req.url, siteDir) : null;
    if (!filePath) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentTypeFor(filePath) });
    res.end(readFileSync(filePath));
  });

  return new Promise<Served>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolvePromise({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

async function launchBrowser(): Promise<Browser> {
  const forced = process.env['SMOKE_BROWSER_CHANNEL'];
  const channels = forced ? [forced] : DEFAULT_CHANNELS;
  // The sandbox needs user namespaces that CI containers routinely withhold;
  // on a developer machine it stays on.
  const args = process.env['CI'] ? ['--no-sandbox'] : [];
  const failures: string[] = [];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, args });
    } catch (err) {
      failures.push(`  ${channel}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }
  throw new Error(
    `no usable browser. playwright-core bundles none by design; it drives an ` +
      `already-installed one.\nTried:\n${failures.join('\n')}\n` +
      `Install Google Chrome, or set SMOKE_BROWSER_CHANNEL to a channel you have.`,
  );
}

/**
 * Open a page that can reach `origin` and nothing else.
 *
 * Everything off-origin is aborted: OpenStreetMap tiles, the Bunny CDN's
 * photos, Google Fonts. That keeps the check hermetic and fast, and it forces
 * the assertions onto what the components compute rather than what they
 * download — a map still reports the markers it plotted with no basemap under
 * them.
 */
async function openPage(browser: Browser, origin: string): Promise<{ page: Page; errors: Error[] }> {
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith(origin)) return route.continue();
    return route.abort();
  });
  return { page, errors };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

interface CheckContext {
  page: Page;
  origin: string;
  slug: string;
}

interface Check {
  name: string;
  run: (ctx: CheckContext) => Promise<void>;
}

/** Thrown by a check to report a specific, actionable failure. */
class SmokeFailure extends Error {}

// The predicates below are serialized and evaluated inside the page, so their
// argument is a real DOM element — but this file typechecks under
// tsconfig.node.json, which has no DOM lib and should not gain one for three
// callbacks. Structural types state exactly what each predicate touches.
interface HasAttributes {
  getAttribute(name: string): string | null;
}
interface HasTextContent {
  textContent: string | null;
}

function fail(message: string): never {
  throw new SmokeFailure(message);
}

/**
 * Click a disclosure button and require that it reports itself open.
 *
 * The two failure modes read very differently and both matter: the button never
 * became clickable (the disclosure ABOVE it never opened), or it was clicked and
 * `aria-expanded` stayed `false` (this component is not re-rendering).
 */
async function clickDisclosure(button: Locator, description: string): Promise<void> {
  try {
    await button.click();
  } catch {
    fail(
      `could not click ${description} — it is in the DOM but never became visible,\n` +
        `      which means the disclosure containing it never opened.`,
    );
  }
  try {
    await button.waitFor({ state: 'visible' });
    const handle = await button.elementHandle();
    await button.page().waitForFunction((el: HasAttributes) => el.getAttribute('aria-expanded') === 'true', handle);
  } catch {
    fail(`clicking ${description} did not flip its aria-expanded to "true"; it is not re-rendering.`);
  }
}

export const CHECKS: Check[] = [
  {
    // The direct PR #315 regression. Reaching this state requires the async
    // Parquet load to resolve AND `_loading = false` to go through Lit's
    // accessor: a shadowed field leaves the component on its loading frame
    // forever, with no error anywhere.
    name: 'species factsheet: occurrence map plots records',
    async run({ page, origin, slug }) {
      await page.goto(`${origin}/species/${slug}/`, { waitUntil: 'domcontentloaded' });

      const region = page.locator('pnwm-occurrence-map [role="region"]');
      try {
        await region.waitFor({ state: 'attached' });
      } catch {
        // Short timeout for the diagnostic read: if the component is missing
        // entirely (a bad SMOKE_SPECIES landing on the 404 page) the default
        // would burn a second full timeout before reporting an empty string.
        const stuck = await page
          .locator('pnwm-occurrence-map')
          .innerText({ timeout: 2_000 })
          .catch(() => '');
        fail(
          `the occurrence map never rendered its map region.\n` +
            `      It still reads: ${JSON.stringify(stuck.trim().slice(0, 80))}\n` +
            `      A component stuck on its first frame is the PR #315 signature — check that\n` +
            `      every Lit reactive field is declared with \`declare\` and that both tsconfigs\n` +
            `      still set "useDefineForClassFields": false.`,
        );
      }

      const label = (await region.getAttribute('aria-label')) ?? '';
      const plotted = parsePlottedCount(label);
      if (plotted === null) {
        fail(`occurrence map aria-label is not of the expected shape: ${JSON.stringify(label)}`);
      }
      if (plotted === 0) {
        fail(
          `occurrence map plotted 0 records for ${slug}, which was chosen for having the\n` +
            `      most records on the site. The Parquet load or the coordinate columns are broken.`,
        );
      }
      // Count the markers Leaflet actually drew and require the number to MATCH
      // the label, rather than merely being non-zero.
      //
      // Each record becomes an `L.circleMarker`, which Leaflet's SVG renderer
      // emits as `path.leaflet-interactive`. The region mask polygon is
      // `interactive: false`, so it carries no such class and is not counted.
      //
      // Do NOT reach for `.leaflet-marker-pane` here: Leaflet creates that pane
      // unconditionally at map init and circle markers do not live in it, so a
      // presence check on the pane is true whenever a map exists at all — an
      // assertion that cannot fail. Counting and comparing is what makes this
      // catch a renderer regression, or someone enabling `preferCanvas` (which
      // draws no path elements at all).
      const markers = await page.locator('pnwm-occurrence-map path.leaflet-interactive').count();
      if (markers !== plotted) {
        fail(
          `the map's aria-label claims ${plotted} records plotted, but Leaflet drew ${markers}\n` +
            `      marker path(s). The label and the rendered layer disagree.`,
        );
      }
    },
  },
  {
    // Browse's disclosure state is the purest re-render test on the site: the
    // click handler only mutates a Set and calls requestUpdate(), with no data
    // fetch anywhere in the path.
    //
    // Note what this does NOT prove. The taxonomy tree is parsed synchronously
    // from an inline `#taxon-data` script in connectedCallback, before the first
    // render, so a completely frozen component still shows every family row
    // collapsed. Only the toggle below can tell a frozen component from a
    // healthy one. (species-states.json / species-districts.json are fetched
    // too, but they feed the filter dropdowns, which this check never touches.)
    name: 'browse: expanding a family reveals its children',
    async run({ page, origin }) {
      await page.goto(`${origin}/browse/`, { waitUntil: 'domcontentloaded' });

      const family = page.locator('pnwm-taxon-browser .pnwm-tb-family-row').first();
      const toggle = family.locator('h2 button').first();
      try {
        await toggle.waitFor({ state: 'visible' });
      } catch {
        fail(
          `the taxon browser rendered no family rows at all. The tree is parsed from the\n` +
            `      inline #taxon-data script during connectedCallback, so this is a missing or\n` +
            `      malformed payload in the built page — not a reactivity failure.`,
        );
      }

      if ((await toggle.getAttribute('aria-expanded')) !== 'false') {
        fail(`the first family started expanded; this check needs a collapsed one to toggle.`);
      }

      const children = family.locator('div[hidden]').first();
      await children.waitFor({ state: 'attached' });

      await toggle.click();

      try {
        await page.waitForFunction(
          (el: HasAttributes) => el.getAttribute('aria-expanded') === 'true',
          await toggle.elementHandle(),
        );
      } catch {
        fail(
          `clicking a family heading did not flip aria-expanded to "true".\n` +
            `      The click handler mutates _expandedFamilies and calls requestUpdate(); if the\n` +
            `      DOM did not follow, the component is not re-rendering.`,
        );
      }

      // aria-expanded is what the component says; `hidden` coming off the child
      // container is the render actually happening.
      const revealed = await family.locator('.pnwm-tb-subfamily-row, .pnwm-tb-genus-row').first().isVisible().catch(() => false);
      if (!revealed) {
        fail(`aria-expanded flipped to "true" but no child taxon became visible.`);
      }
    },
  },
  {
    // The only path that crosses a component boundary: pnwm-identify recomputes
    // its matches and passes them down to <key-results-grid> as properties. A
    // shadowed field on EITHER component leaves the count line stuck.
    name: 'identify: selecting a character narrows the results',
    async run({ page, origin }) {
      await page.goto(`${origin}/identify/`, { waitUntil: 'domcontentloaded' });

      const count = page.locator('key-results-grid .pnwm-krg-count');
      try {
        await count.waitFor({ state: 'visible' });
      } catch {
        fail(
          `the Identify results grid never rendered its count line. pnwm-identify fetches\n` +
            `      key-matrix.json and re-renders on resolve.`,
        );
      }

      const before = parseResultCount((await count.innerText()).trim());
      if (before === null || before === 0) {
        fail(`Identify opened with an unusable species count: ${JSON.stringify(await count.innerText())}`);
      }

      // Tie the opening count to the matrix the server actually served.
      //
      // Without this the check passes with key-matrix.json DELETED, which was
      // verified, not theorised. The opening count line is rendered on the FIRST
      // frame from constructor fallbacks — `key-results-grid`'s `totalCount`
      // defaults to 1190 and `pnwm-identify` renders
      // `this._keyMatrix?.meta.matchedSpecies ?? 1190` — so "Showing all 1,190
      // species" appears whether or not the fetch ever resolved. pnwm-identify
      // soft-degrades on a failed or schema-invalid fetch (console.error only),
      // and then dispatches a placeholder `{count: 0, hasSelection: true}`,
      // which renders "0 species match" and satisfies a naive narrowing test.
      // Comparing against `meta.matchedSpecies` is what distinguishes loaded
      // data from the fallback — they are deliberately different numbers.
      const matrixRes = await page.request.get(`${origin}/key-matrix.json`);
      if (!matrixRes.ok()) {
        fail(`the build serves no key-matrix.json (${matrixRes.status()}); Identify has no data.`);
      }
      const expectedTotal = (await matrixRes.json())?.meta?.matchedSpecies;
      if (typeof expectedTotal !== 'number') {
        fail(`key-matrix.json has no numeric meta.matchedSpecies to check the page against.`);
      }
      if (before !== expectedTotal) {
        fail(
          `Identify opened showing ${before} species but key-matrix.json declares\n` +
            `      ${expectedTotal}. The page is rendering its hard-coded fallback. Either the matrix\n` +
            `      fetch failed or its schema was rejected (both only console.error), or the component\n` +
            `      is frozen and never re-rendered with the data it did receive.`,
        );
      }

      // Walk down the disclosure chain — category, then question — because the
      // checkboxes live inside `hidden` containers until both are open. Each
      // step is reported on its own: a frozen component leaves the NEXT
      // control present in the DOM but never visible, and Playwright's default
      // report for that is a page of retry log rather than the one fact that
      // matters.
      //
      // Everything below the category is scoped INSIDE it. Unscoped, a
      // `fieldset legend button` could resolve into a still-collapsed later
      // category if the first one's questions were all contingent-hidden — a
      // spurious failure the day curation reorders the key.
      const category = page.locator('pnwm-identify .pnwm-kfp-category').first();
      await clickDisclosure(category.locator('h2 button').first(), 'a character category heading');
      await clickDisclosure(
        category.locator('fieldset legend button').first(),
        'a question heading inside the expanded category',
      );

      const checkbox = category.locator('fieldset input[type="checkbox"]').first();
      try {
        await checkbox.waitFor({ state: 'visible' });
      } catch {
        fail(`expanding a category and a question revealed no character checkboxes.`);
      }
      await checkbox.check();

      try {
        await page.waitForFunction(
          (el: HasTextContent) => /species match/.test(el.textContent ?? ''),
          await count.elementHandle(),
        );
      } catch {
        fail(
          `selecting a character did not change the results count. It still reads\n` +
            `      ${JSON.stringify((await count.innerText()).trim())}.\n` +
            `      This is the cross-component path: pnwm-identify recomputes matches and sets\n` +
            `      them on <key-results-grid> as properties.`,
        );
      }

      const after = parseResultCount((await count.innerText()).trim());
      if (after === null) {
        fail(`results count became unparseable: ${JSON.stringify(await count.innerText())}`);
      }
      // Strictly fewer, and strictly more than none. `after === 0` is the exact
      // shape the placeholder dispatch produces when the matrix never loaded.
      if (after === 0) {
        fail(
          `selecting a character matched 0 species. Either computeMatching is broken or the\n` +
            `      key matrix never loaded and this is the placeholder {count: 0} dispatch.`,
        );
      }
      if (after >= before) {
        fail(`selecting a character did not narrow the results: ${before} -> ${after}.`);
      }

      // The count line is a string; the cards are the render. Requiring them to
      // agree means a grid that stopped re-rendering its results cannot hide
      // behind a correct-looking number.
      const cards = await page.locator('key-results-grid a.pnwm-krg-card').count();
      if (cards !== after) {
        fail(`the results count says ${after} species match but the grid rendered ${cards} card(s).`);
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** What one check produced: its failure text, if any, and anything the page threw. */
export interface CheckOutcome {
  name: string;
  /** Null when every assertion passed. */
  failure: string | null;
  /** First lines of any uncaught page exceptions, in order. */
  pageErrors: string[];
}

/**
 * Decide the process exit code from what the checks produced, and say so.
 *
 * Split out from the run loop so the rule can be tested without a browser. It
 * is a small rule, and it is the one place where getting it backwards would
 * make every other line in this file pointless: a gate that reports failures
 * and then exits 0 is worse than no gate, because CI goes green over it.
 *
 * A check that passed its assertions but left an uncaught exception on the page
 * counts as failed. Under #315 nothing threw at all, so silence is not
 * reassurance — but noise is definitely not health.
 */
export function summarize(outcomes: CheckOutcome[], log = console.log, logError = console.error): number {
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.failure === null && outcome.pageErrors.length === 0) {
      log(`[browser-smoke] ok   ${outcome.name}`);
      continue;
    }
    failed++;
    logError(`[browser-smoke] FAIL ${outcome.name}`);
    if (outcome.failure !== null) {
      logError(`      ${outcome.failure}`);
    } else {
      logError(`      passed its assertions but the page threw ${outcome.pageErrors.length} uncaught error(s):`);
    }
    for (const pageError of outcome.pageErrors.slice(0, 3)) {
      logError(`      page threw: ${pageError}`);
    }
  }
  // An empty outcome list is a failure, not a pass: it means the run checked
  // nothing, which is exactly the shape of "green while checking nothing".
  if (outcomes.length === 0) {
    logError('[browser-smoke] no checks ran.');
    return 1;
  }
  if (failed > 0) {
    logError(`[browser-smoke] ${failed} of ${outcomes.length} check(s) failed.`);
    return 1;
  }
  log(`[browser-smoke] all ${outcomes.length} checks passed.`);
  return 0;
}

export async function runSmokeChecks(): Promise<number> {
  if (!existsSync(SITE_DIR)) {
    console.error(`[browser-smoke] ERROR: SITE_DIR "${SITE_DIR}" does not exist. Run the build first.`);
    return 1;
  }

  const slug = process.env['SMOKE_SPECIES'] || pickSpeciesSlug(SITE_DIR);
  const { origin, close } = await serveSite(SITE_DIR);
  console.log(`[browser-smoke] serving ${SITE_DIR} at ${origin}`);
  console.log(`[browser-smoke] species under test: ${slug}`);

  let browser: Browser | null = null;
  const outcomes: CheckOutcome[] = [];
  try {
    try {
      browser = await launchBrowser();
    } catch (err) {
      // No browser is an environment problem, not a site defect. Say so in
      // words rather than a stack trace — but still exit non-zero, because a
      // gate that skips itself when it cannot run is the "green while checking
      // nothing" failure mode (ADR 0033).
      console.error(`[browser-smoke] ERROR: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    for (const check of CHECKS) {
      // A fresh page per check: no cross-check state, and each one's uncaught
      // exceptions belong to it alone.
      const { page, errors } = await openPage(browser, origin);
      let failure: string | null = null;
      try {
        await check.run({ page, origin, slug });
      } catch (err) {
        // Playwright's own errors carry a retry log dozens of lines long. Keep
        // the first few — the useful part is always at the top — so one failing
        // check cannot bury the others.
        failure = err instanceof SmokeFailure
          ? err.message
          : `unexpected error: ${(err instanceof Error ? err.message : String(err)).split('\n').slice(0, 4).join('\n      ')}`;
      } finally {
        await page.close();
      }
      outcomes.push({ name: check.name, failure, pageErrors: errors.map((e) => e.message.split('\n')[0] ?? '') });
    }
  } finally {
    if (browser) await browser.close();
    await close();
  }

  return summarize(outcomes);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runSmokeChecks());
}
