/**
 * PNW Moths redirect handler, loaded only by /redirect.html.
 *
 * Accepts: /redirect.html?from=/old/path/on/wwu/site
 * Maps old pnwmoths.biol.wwu.edu URL patterns to new site URLs.
 *
 * The resolution table and algorithm live in src/_lib/legacy-redirects.ts, which
 * scripts/fetch-analytics.ts imports as well: the nightly CDN-log job replays this
 * exact resolution over "/redirect.html?from=…" requests so unmatched legacy URLs
 * show up on /analytics/ as a list of mappings still to be written (#181). Keeping
 * one implementation is what makes that report trustworthy — a copy pasted in here
 * would drift and the report would describe a resolver nobody is running.
 *
 * Its own Vite entry (src/_lib/vite-entries.ts) rather than part of main.ts: it runs
 * on one page, which loads nothing else. The page supplies the two values that used
 * to be templated into the script: the pathPrefix-aware base URL as data-base-url on
 * <body>, and the species slugs as a JSON block (#species-slugs).
 */
import { resolveLegacyPath, REDIRECT_FROM_PARAM } from '../_lib/legacy-redirects.ts';

declare const gtag: ((...args: unknown[]) => void) | undefined;

// pathPrefix-aware base: "/" locally, "/pnwmoths/" on GitHub Pages.
// Targets from resolveLegacyPath are site-relative and name index.html explicitly (no
// reliance on the host's implicit directory-index resolution); BASE is prepended at
// navigation time so every redirect resolves correctly in prod.
const BASE = document.body.dataset['baseUrl'] ?? '/';

// Species slug lookup (src/_data/speciesSlugs.json — hand-maintained alongside
// data/species.csv, with src/_data/speciesSlugs.test.ts failing the build on drift:
// a species missing here is silently unreachable from every legacy /browse/ link).
const SPECIES_SLUGS = new Set<string>(
  JSON.parse(document.getElementById('species-slugs')?.textContent ?? '[]') as string[]
);

/**
 * Log a redirect event for debugging. Misses are *not* beaconed anywhere: the request
 * for this page already carries ?from= into the Bunny access log, and the nightly
 * analytics job classifies it there. No endpoint means nothing to keep running.
 */
function logRedirect(fromPath: string, target: string, matched: boolean): void {
  if (!matched) {
    console.warn('[pnwmoths-redirect] No exact match:', {
      ts: new Date().toISOString(),
      from: fromPath,
      to: target,
      matched: matched,
      referrer: document.referrer || null,
    });
  }

  // Google Analytics event (if gtag is loaded)
  if (typeof gtag === 'function') {
    gtag('event', 'redirect', {
      event_category: matched ? 'redirect_matched' : 'redirect_missed',
      event_label: fromPath,
      value: matched ? 1 : 0,
    });
  }
}

// --- Main ---
const params = new URLSearchParams(window.location.search);
const fromPath = params.get(REDIRECT_FROM_PARAM);

if (!fromPath) {
  // No ?from= parameter — redirect home
  window.location.replace(BASE + 'index.html');
} else {
  const { target, matched } = resolveLegacyPath(fromPath, SPECIES_SLUGS);
  logRedirect(fromPath, BASE + target, matched);

  if (!matched) {
    // Show fallback message briefly before redirecting
    const spinner = document.getElementById('spinner');
    const message = document.getElementById('message');
    const fallback = document.getElementById('fallback');
    if (spinner) spinner.style.display = 'none';
    if (message) message.textContent = 'This page has moved. Redirecting to the best match…';
    if (fallback) fallback.style.display = 'block';
    setTimeout(function () {
      window.location.replace(BASE + target);
    }, 3000);
  } else {
    window.location.replace(BASE + target);
  }
}
