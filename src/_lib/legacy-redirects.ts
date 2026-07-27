// Legacy pnwmoths.biol.wwu.edu URL -> new site URL resolution.
//
// Deliberately shared by two very different callers:
//   * src/redirect.njk (browser, bundled by Vite) — performs the actual redirect.
//   * scripts/fetch-analytics.ts (Node) — replays the same resolution over CDN access
//     logs so that "/redirect.html?from=…" hits which found no match are surfaced on
//     /analytics/ as a maintainer work queue (#181).
//
// One implementation is the whole point. A second copy would drift, and the reported
// misses would stop describing what visitors actually experienced.
//
// Browser-safe: no Node imports, no DOM access — src/_lib is passthrough-copied to
// _site/_lib and bundled by Vite, exactly like key-filter.ts is for pnwm-identify.

/** The static page that fields inbound legacy URLs, as "/redirect.html?from=/old/path". */
export const REDIRECT_PAGE_PATH = '/redirect.html';

/** Query-string parameter carrying the original legacy path. */
export const REDIRECT_FROM_PARAM = 'from';

export interface RedirectResolution {
  /** Site-relative target, e.g. "species/acronicta-americana/index.html" (no leading slash). */
  target: string;
  /** False when we fell back to browse/home because nothing matched. */
  matched: boolean;
}

/** Static page mappings (old WWU path -> site-relative target). */
export const STATIC_MAP: Record<string, string> = {
  '/about-moths/glossary/': 'glossary/index.html',
  '/about-moths/faqs/': 'faqs/index.html',
  '/about-moths/moth-facts/': 'index.html',
  '/about-moths/moth-collecting-photography/': 'index.html',
  '/about-moths/references/': 'index.html',
  '/about-us/the-project/': 'index.html',
  '/about-us/related-sites/': 'about/related-sites/index.html',
  '/about-us/site-credits/': 'about/credits/index.html',
  '/about-us/contact/': 'contact/index.html',
  '/explore-data/about-data/': 'index.html',
  '/explore-data/about-key/': 'index.html',
  '/explore-data/about-images/': 'index.html',
  '/gsearch/': 'search/index.html',
  '/identify/': 'identify/index.html',
  '/browse/': 'browse/index.html',
  '/browse-all/': 'browse/index.html',
  '/photographic-plates/': 'plates/index.html',
};

// Synonym map for reclassified species (old WWU slug -> new site slug).
// Globia (subflava/oblonga/alameda) is the current genus and now matches the new site
// slug directly, so no synonym mapping is needed for it (#146). Retired-slug redirects
// that have their own static stub pages live in data/species-redirects.csv instead.
export const SYNONYMS: Record<string, string> = {};

/** Drop a query string and/or fragment from a path. */
export function stripQueryAndHash(path: string): string {
  const qIndex = path.indexOf('?');
  const hIndex = path.indexOf('#');
  let end = path.length;
  if (qIndex !== -1 && qIndex < end) end = qIndex;
  if (hIndex !== -1 && hIndex < end) end = hIndex;
  return path.slice(0, end);
}

/**
 * Server-config placeholders that can arrive verbatim when the legacy host's rewrite rule
 * fails to interpolate, e.g. "?from={REQUEST_URI}browse/…" (Apache/nginx/IIS variants, and
 * the percent-encoded "%7BREQUEST_URI%7D" spelling that survives when nothing decoded it).
 * We strip them instead of asking the legacy site's operators to redeploy a fix: the real
 * path is right there after the placeholder, and treating these as misses would both strand
 * visitors and flood the /analytics/ miss queue with one bogus entry per legacy page.
 */
const UNEXPANDED_PLACEHOLDER = /^[$%]?(?:\{|%7[Bb])[A-Za-z0-9_]+(?:\}|%7[Dd])/;

/** Remove a leading unexpanded server variable such as "{REQUEST_URI}" or "${REQUEST_URI}". */
export function stripUnexpandedPlaceholder(path: string): string {
  let out = path;
  let previous: string;
  do {
    previous = out;
    out = out.replace(UNEXPANDED_PLACEHOLDER, '').trimStart();
  } while (out !== previous);
  return out;
}

/**
 * Normalize a legacy path to the "/a/b/" shape used as the STATIC_MAP key: leading and
 * trailing slash, no query string or fragment.
 *
 * Query strings are dropped before matching so that legacy links carrying tracking or
 * Django filter params (e.g. "/gsearch/?q=moth") still resolve, and so the analytics
 * miss list groups by page rather than by every unique parameter combination.
 */
export function normalizeLegacyPath(fromPath: string): string {
  let path = stripUnexpandedPlaceholder(fromPath.trim());
  path = stripQueryAndHash(path);
  if (path === '') return '/';
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.endsWith('/')) path += '/';
  return path;
}

/**
 * Resolve an old WWU path to a new site path.
 *
 * `matched: false` means the visitor is being dumped on a generic page (browse or home)
 * rather than the page they asked for — those are the hits worth reporting.
 */
export function resolveLegacyPath(
  fromPath: string,
  speciesSlugs: ReadonlySet<string>,
): RedirectResolution {
  const path = normalizeLegacyPath(fromPath);

  // 1. Static map
  const staticTarget = STATIC_MAP[path];
  if (staticTarget) {
    return { target: staticTarget, matched: true };
  }

  // 2. /browse/ paths — extract species slug from last segment
  if (path.startsWith('/browse/')) {
    const segments = path.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';

    // Structural segments (family-*, subfamily-*, tribe-*) have no new-site equivalent
    if (last.startsWith('family-') || last.startsWith('subfamily-') || last.startsWith('tribe-')) {
      return { target: 'browse/index.html', matched: true };
    }

    if (speciesSlugs.has(last)) {
      return { target: 'species/' + last + '/index.html', matched: true };
    }

    // Normalize spaces/underscores and try again
    const normalized = last.replace(/[_\s]+/g, '-').toLowerCase();
    if (speciesSlugs.has(normalized)) {
      return { target: 'species/' + normalized + '/index.html', matched: true };
    }

    // Synonym map (reclassified species)
    const synonym = SYNONYMS[last] ?? SYNONYMS[normalized];
    if (synonym && speciesSlugs.has(synonym)) {
      return { target: 'species/' + synonym + '/index.html', matched: true };
    }

    // Bare genus name (no hyphen) — send to browse
    if (!last.includes('-')) {
      return { target: 'browse/index.html', matched: true };
    }

    // Looks like a species slug we don't publish — report it
    return { target: 'browse/index.html', matched: false };
  }

  // 3. /photographic-plates/{id}/ -> /plates/
  if (path.startsWith('/photographic-plates/')) {
    return { target: 'plates/index.html', matched: true };
  }

  // 4. Homepage
  if (path === '/') {
    return { target: 'index.html', matched: true };
  }

  // 5. Backstop
  return { target: 'index.html', matched: false };
}
