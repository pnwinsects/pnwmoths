// key-results-grid — pure helper stubs for Wave 0 unit tests.
// Plan 42-01 exports only the two Node-testable pure helpers (no LitElement).
// Plan 42-02 completes this file with the full Lit component.

const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';

/**
 * Construct a CDN thumbnail URL for a species image.
 * Mirrors the pattern from pnwm-taxon-browser.ts (D-07).
 *
 * @param slug - species slug (e.g. 'habrosyne-scripta')
 * @param navImage - bare filename string (e.g. 'Habrosyne scripta-A-D.jpg')
 * @param height - CDN resize height (e.g. 320 for 2x at 160px display height)
 * @returns CDN URL with encodeURIComponent-encoded filename and ?height= query param
 */
export function buildCardUrl(slug: string, navImage: string, height: number): string {
  return `${CDN_BASE_URL}/${slug}/${encodeURIComponent(navImage)}?height=${height}`;
}

/**
 * Construct the count-line text for the results grid.
 * Exact copy strings locked by D-01/D-03 (UI-SPEC Copywriting Contract).
 *
 * @param hasSelection - true when any character state is selected
 * @param count - number of matched species (ignored when hasSelection is false)
 * @param total - total number of key species (e.g. 1192)
 * @returns e.g. "47 species match" or "Showing all 1,192 species"
 */
export function buildCountText(hasSelection: boolean, count: number, total: number): string {
  if (hasSelection) {
    return `${count.toLocaleString('en-US')} species match`;
  }
  return `Showing all ${total.toLocaleString('en-US')} species`;
}
