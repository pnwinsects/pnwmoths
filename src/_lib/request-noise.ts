// Classification of requests that are not a person looking for a moth.
//
// Two consumers, for two different jobs:
//   * scripts/fetch-analytics.ts — decides what is admitted into a day's capped
//     top-N lists, so noise cannot crowd real URLs out before they are ever stored.
//   * src/_data/analytics.ts — filters the rolling window, so days already stored
//     under the old behaviour display correctly.
//
// Why this exists: the /analytics/ "Unmapped Legacy Links" queue (#181) is meant to
// show a maintainer which old URLs still need a mapping. In the 30 days to 2026-10-09
// every one of the 25 rows it displayed was a vulnerability scan or a browser's
// automatic request — `/robots.txt/`, `/.env.production/`, `/wp-admin/admin-ajax.php/`
// — and those 25 rows were only 18% of the 47,911 misses. A real legacy URL had no
// way to reach the visible list. The queue reported a large number and named nothing
// a maintainer could act on.
//
// This is the same harm `stripUnexpandedPlaceholder` in legacy-redirects.ts already
// guards against, arriving from a different direction.
//
// Browser-safe: no Node imports, like everything else in src/_lib.

/** Normalize for matching: lowercase, no query/fragment, no trailing slash. */
function canonical(path: string): string {
  let p = path.toLowerCase();
  const cut = Math.min(
    p.indexOf('?') === -1 ? p.length : p.indexOf('?'),
    p.indexOf('#') === -1 ? p.length : p.indexOf('#'),
  );
  p = p.slice(0, cut);
  // normalizeLegacyPath() appends a trailing slash to every miss key, so "/.env"
  // arrives as "/.env/". Matching without accounting for that silently misses
  // every single entry in the queue this module exists to clean.
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * A request probing for software we do not run.
 *
 * Safe to assert for this site specifically: the legacy WWU site was Django and the
 * current one is static. Neither has ever served PHP, WordPress, or a `.env`, and
 * `STATIC_MAP` in legacy-redirects.ts records the whole legacy URL vocabulary —
 * `/about-moths/`, `/about-us/`, `/explore-data/`, `/browse/`, `/gsearch/`,
 * `/identify/`, `/photographic-plates/`. None of these patterns can collide with it.
 */
export function isScannerProbe(path: string): boolean {
  const p = canonical(path);
  return (
    p.endsWith('.php')
    || /(^|\/)\.env(\.|$)/.test(p)
    || /(^|\/)\.(git|svn|hg|aws|ssh|vscode|idea)(\/|$)/.test(p)
    || /(^|\/)(wp|wordpress|blog)(\/|$)/.test(p)
    || /(^|\/)wp-(admin|content|includes|json|login)(\/|$)/.test(p)
    || /(^|\/)(phpmyadmin|pma|mysql|adminer)(\/|$)/.test(p)
    || /(^|\/)(cgi-bin|vendor|server-status|actuator|telescope)(\/|$)/.test(p)
    || /(^|\/)(config|configuration|credentials|secrets?|backup|dump)\.(json|ya?ml|xml|sql|bak|old)$/.test(p)
    || p === '/.ds_store'
  );
}

/**
 * A file a browser, crawler, or platform fetches on its own, without a link.
 *
 * Deliberately NOT treated the same as a scanner probe. A flood of these against a
 * 404 is real information — it is how the missing /robots.txt was found, at 6,222
 * requests in 30 days. They are only meaningless in the *legacy mapping* queue,
 * because no amount of `/favicon.ico` will ever need a redirect to a species page.
 */
export function isBrowserDefault(path: string): boolean {
  const p = canonical(path);
  return (
    p.startsWith('/.well-known')
    || /^\/(robots\.txt|sitemap[\w.-]*\.xml|ads\.txt|security\.txt|humans\.txt)$/.test(p)
    // Icons match at any depth: a page controls where its icon lives via
    // <link rel="icon">, so browsers request them from arbitrary paths. The legacy
    // Django site served its own from /media/images/favicon.ico, and pages elsewhere
    // on the web still point at it.
    || /(^|\/)favicon\.[\w]+$/.test(p)
    || /(^|\/)apple-touch-icon(-\w+)*\.png$/.test(p)
    || /^\/(browserconfig\.xml|manifest\.json|site\.webmanifest)$/.test(p)
  );
}

/** One of our own build outputs, requested directly rather than via a page. */
export function isBuildAsset(path: string): boolean {
  const p = canonical(path);
  return p.startsWith('/assets/') || p.startsWith('/_lib/') || p.startsWith('/pagefind/');
}

/**
 * Could this miss plausibly be an old PNW Moths URL that still needs a mapping?
 *
 * This is the admission test for the #181 queue. It is strict on purpose: the queue
 * is a work list, and an entry a maintainer cannot act on costs more than it adds.
 */
export function isLegacyMappingCandidate(path: string): boolean {
  return !isScannerProbe(path) && !isBrowserDefault(path) && !isBuildAsset(path);
}

/**
 * Should this 404 be hidden from the 404 list?
 *
 * Only scanner probes. Browser defaults stay visible precisely because a 404 on one
 * of them is a gap in what the site serves, which is actionable.
 */
export function isNoise404(path: string): boolean {
  return isScannerProbe(path);
}
