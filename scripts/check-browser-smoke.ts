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
const TIMEOUT_MS = Number(process.env['SMOKE_TIMEOUT_MS'] ?? 15_000);

/**
 * Channels to try, in order, when the caller has not named one.
 *
 * `playwright-core` ships no browser of its own — that is why it is the
 * dependency here rather than `playwright` (see generate-social-card.ts, which
 * launches `channel: 'chrome'` for the same reason). Locally that resolves to
 * the developer's installed Google Chrome; the GitHub Actions ubuntu runner
 * image preinstalls both Chrome and Chromium, so no download step is needed
 * there either.
 */
const DEFAULT_CHANNELS = ['chrome', 'chromium', 'msedge'];

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
        const stuck = await page.locator('pnwm-occurrence-map').innerText().catch(() => '');
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
      // Leaflet only builds markers from `updated()`, so their presence proves
      // the second render actually ran rather than the label alone being right.
      const markers = await page.locator('pnwm-occurrence-map .leaflet-marker-pane, pnwm-occurrence-map path.leaflet-interactive').count();
      if (markers === 0) {
        fail(`aria-label claims ${plotted} records plotted but Leaflet drew no marker layer.`);
      }
    },
  },
  {
    // Browse is pure client-side reactivity: fetch two JSON files, build the
    // tree, then toggle a Set on click. Both halves re-render or nothing moves.
    name: 'browse: expanding a family reveals its children',
    async run({ page, origin }) {
      await page.goto(`${origin}/browse/`, { waitUntil: 'domcontentloaded' });

      const family = page.locator('pnwm-taxon-browser .pnwm-tb-family-row').first();
      const toggle = family.locator('h2 button').first();
      try {
        await toggle.waitFor({ state: 'visible' });
      } catch {
        fail(
          `the taxon browser rendered no family rows. It fetches species-states.json and\n` +
            `      species-districts.json and re-renders when they resolve — a frozen component\n` +
            `      shows an empty toolbar and nothing else.`,
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

      // Walk down the disclosure chain — category, then question — because the
      // checkboxes live inside `hidden` containers until both are open. Each
      // step is reported on its own: a frozen component leaves the NEXT
      // control present in the DOM but never visible, and Playwright's default
      // report for that is a page of retry log rather than the one fact that
      // matters.
      await clickDisclosure(
        page.locator('pnwm-identify .pnwm-kfp-category h2 button').first(),
        'a character category heading',
      );
      await clickDisclosure(
        page.locator('pnwm-identify fieldset legend button').first(),
        'a question heading inside the expanded category',
      );

      const checkbox = page.locator('pnwm-identify fieldset input[type="checkbox"]').first();
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
      if (after > before) {
        fail(`selecting a character widened the results, ${before} -> ${after}.`);
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

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
  let failed = 0;
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
      try {
        await check.run({ page, origin, slug });
        if (errors.length > 0) {
          // Reaching the assertions while throwing is still a defect — under
          // #315 nothing threw at all, so silence here is not reassurance.
          failed++;
          console.error(`[browser-smoke] FAIL ${check.name}`);
          console.error(`      passed its assertions but the page threw ${errors.length} uncaught error(s):`);
          for (const err of errors.slice(0, 3)) console.error(`        ${err.message.split('\n')[0]}`);
        } else {
          console.log(`[browser-smoke] ok   ${check.name}`);
        }
      } catch (err) {
        failed++;
        // Playwright's own errors carry a retry log dozens of lines long. Keep
        // the first few — the useful part is always at the top — so one failing
        // check cannot bury the others.
        const detail = err instanceof SmokeFailure
          ? err.message
          : `unexpected error: ${(err instanceof Error ? err.message : String(err)).split('\n').slice(0, 4).join('\n      ')}`;
        console.error(`[browser-smoke] FAIL ${check.name}`);
        console.error(`      ${detail}`);
        for (const pageErr of errors.slice(0, 3)) {
          console.error(`      page threw: ${pageErr.message.split('\n')[0]}`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await close();
  }

  if (failed > 0) {
    console.error(`[browser-smoke] ${failed} of ${CHECKS.length} check(s) failed.`);
    return 1;
  }
  console.log(`[browser-smoke] all ${CHECKS.length} checks passed.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runSmokeChecks());
}
