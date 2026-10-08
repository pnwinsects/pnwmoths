// Site search in the header: queries the Pagefind index as the reader types.
//
// Lives here, loaded through main.ts, rather than as an inline <script type="module">
// in base.njk. Every page uses base.njk, and an inline module is a Vite entry of its
// own, so the inline version made Vite build ~1,370 byte-identical chunks, one per page,
// and was enough on its own to push the vite 8.3 build past CI's 4 GB heap (#364).
//
// The Pagefind URL and base URL carry pathPrefix, so base.njk renders them through
// `| url` into data attributes on #site-search. Vite rewrites script src, not data
// attributes, so the prefix is applied exactly once.

/** The slice of Pagefind's browser API this module uses. */
interface PagefindResultData {
  url: string;
  excerpt: string;
  meta?: { title?: string };
}
interface Pagefind {
  options(opts: { baseUrl: string }): Promise<void>;
  search(query: string): Promise<{ results: { data(): Promise<PagefindResultData> }[] }>;
}

/** The most results shown; the status line says when a query matched more. */
const MAX_RESULTS = 8;

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** The status-line text for a completed search. */
export function searchStatus(query: string, shown: number, total: number): string {
  if (total === 0) return 'No results found.';
  // The list is capped, so report the cap explicitly rather than announcing
  // "8 results" when the query actually matched far more.
  return total > shown
    ? `Showing ${shown} of ${total} results for ${query}.`
    : `${total} result${total === 1 ? '' : 's'} for ${query}.`;
}

export async function initSiteSearch(root: ParentNode = document): Promise<void> {
  const container = root.querySelector<HTMLElement>('#site-search');
  const input = root.querySelector<HTMLInputElement>('.site-search-input');
  const resultsEl = root.querySelector<HTMLElement>('#site-search-results');
  const statusEl = root.querySelector<HTMLElement>('#site-search-status');
  if (!container || !input || !resultsEl) return;

  // Announce the outcome through a permanently-visible-to-AT status element.
  // resultsEl itself cannot do this: it is display:none while being filled.
  const announce = (message: string) => {
    if (statusEl) statusEl.textContent = message;
  };

  let pagefind: Pagefind;
  try {
    const pagefindUrl = container.dataset['pagefindUrl'];
    if (!pagefindUrl) return;
    pagefind = (await import(/* @vite-ignore */ pagefindUrl)) as Pagefind;
    await pagefind.options({ baseUrl: container.dataset['baseUrl'] ?? '/' });
  } catch {
    return; // Pagefind not available (dev mode)
  }

  const doSearch = async () => {
    const query = input.value.trim();
    if (!query) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      announce('');
      return;
    }
    const search = await pagefind.search(query);
    const results = await Promise.all(search.results.slice(0, MAX_RESULTS).map(r => r.data()));
    announce(searchStatus(query, results.length, search.results.length));
    resultsEl.innerHTML = results.length
      ? results
          .map(
            r => `<a class="site-search-result" href="${esc(r.url)}">
              <span class="site-search-result-title">${esc(r.meta?.title || r.url)}</span>
              <span class="site-search-result-excerpt">${r.excerpt}</span>
            </a>`
          )
          .join('')
      : '<p class="site-search-empty">No results found.</p>';
    resultsEl.hidden = false;
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void doSearch(), 200);
  });

  // Close results on click outside
  document.addEventListener('click', e => {
    if (!(e.target instanceof Element) || !e.target.closest('.site-search')) {
      resultsEl.hidden = true;
    }
  });

  // Reopen on focus if there's a query
  input.addEventListener('focus', () => {
    if (input.value.trim() && resultsEl.innerHTML) resultsEl.hidden = false;
  });
}
