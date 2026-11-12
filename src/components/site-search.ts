// Site search in the header: queries the Pagefind index as the reader types.
//
// Lives here, loaded through main.ts, rather than as an inline <script type="module">
// in base.njk. Every page uses base.njk, and an inline module is a Vite entry of its
// own, so the inline version made Vite build ~1,370 byte-identical chunks, one per page,
// and was enough on its own to push the vite 8.3 build past CI's 4 GB heap (#364).
//
// It follows the APG "combobox with listbox popup" pattern (#207): focus stays in the
// input, ArrowDown and ArrowUp move a highlight through the results by setting
// aria-activedescendant, Enter opens the highlighted result and Escape closes the list.
// The results are links with role="option", so a click or middle-click still works.
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

/**
 * Where the highlight goes when ArrowDown or ArrowUp is pressed. `current` is -1 when
 * nothing is highlighted; the highlight wraps at both ends, as in the APG examples.
 */
export function nextOptionIndex(current: number, count: number, key: 'ArrowDown' | 'ArrowUp'): number {
  if (count === 0) return -1;
  if (key === 'ArrowDown') return current < 0 || current >= count - 1 ? 0 : current + 1;
  return current <= 0 ? count - 1 : current - 1;
}

/**
 * The listbox's options for a set of results. Each is a link with role="option", so a
 * pointer still follows it, but tabindex="-1" keeps it out of the Tab order: in a
 * combobox the arrow keys move through the options and Tab leaves the widget. The
 * option's name is its title and its description the excerpt, so a screen reader reads
 * the title first instead of the whole excerpt as one name.
 *
 * `excerpt` is Pagefind's HTML (it marks the matched words with <mark>) and is inserted
 * as it comes; everything else is escaped.
 */
export function optionsHtml(results: PagefindResultData[], escape: (s: string) => string): string {
  return results
    .map((r, i) => `<a class="site-search-result" role="option" id="site-search-option-${i}"
        aria-selected="false" tabindex="-1" href="${escape(r.url)}"
        aria-labelledby="site-search-option-${i}-title" aria-describedby="site-search-option-${i}-excerpt">
        <span class="site-search-result-title" id="site-search-option-${i}-title">${escape(r.meta?.title || r.url)}</span>
        <span class="site-search-result-excerpt" id="site-search-option-${i}-excerpt">${r.excerpt}</span>
      </a>`)
    .join('');
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
  const listbox = root.querySelector<HTMLElement>('#site-search-listbox');
  const emptyEl = root.querySelector<HTMLElement>('.site-search-empty');
  const statusEl = root.querySelector<HTMLElement>('#site-search-status');
  if (!container || !input || !resultsEl || !listbox) return;

  // Announce the outcome through a permanently-visible-to-AT status element.
  // resultsEl itself cannot do this: it is display:none while being filled.
  const announce = (message: string) => {
    if (statusEl) statusEl.textContent = message;
  };

  const options = (): HTMLElement[] => [...listbox.querySelectorAll<HTMLElement>('[role="option"]')];
  let active = -1;

  /** Highlight option `index`, or nothing when it is -1. */
  const setActive = (index: number) => {
    const all = options();
    all.forEach((el, i) => el.setAttribute('aria-selected', String(i === index)));
    active = index;
    const el = all[index];
    if (el) {
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  /** Show or hide the drop-down. aria-expanded follows the listbox, not the "no results" note. */
  const setOpen = (open: boolean) => {
    resultsEl.hidden = !open;
    input.setAttribute('aria-expanded', String(open && options().length > 0));
    if (!open) setActive(-1);
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
  // Tells the browser smoke test that typing will now search.
  container.dataset['ready'] = 'true';

  // Searches can finish out of order. Only the latest may fill the list, or the
  // highlight could point into results for a query the reader has already changed.
  let latest = 0;
  // True from a keystroke until that query's results arrive. The list still shows the
  // previous query's results meanwhile, so the arrow keys and Enter must not act on them.
  let stale = false;
  // True once the reader closes the list (Escape, Tab, a click elsewhere), until they type
  // or return to the field. A search finishing after that must not reopen it.
  let dismissed = false;

  const close = () => {
    dismissed = true;
    setOpen(false);
  };

  const doSearch = async () => {
    const query = input.value.trim();
    const mine = ++latest;
    if (!query) {
      stale = false;
      listbox.innerHTML = '';
      setOpen(false);
      announce('');
      return;
    }
    const search = await pagefind.search(query);
    const results = await Promise.all(search.results.slice(0, MAX_RESULTS).map(r => r.data()));
    if (mine !== latest) return;
    stale = false;
    announce(searchStatus(query, results.length, search.results.length));
    listbox.innerHTML = optionsHtml(results, esc);
    listbox.hidden = results.length === 0;
    if (emptyEl) emptyEl.hidden = results.length > 0;
    setActive(-1);
    if (!dismissed && document.activeElement === input) setOpen(true);
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    latest++; // any search already running is now for an old query
    stale = true;
    dismissed = false;
    setActive(-1);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void doSearch(), 200);
  });

  input.addEventListener('keydown', e => {
    const count = options().length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (count === 0 || stale) return;
        e.preventDefault();
        if (resultsEl.hidden) setOpen(true);
        setActive(nextOptionIndex(active, count, e.key));
        return;
      case 'Enter': {
        const el = options()[active];
        if (!el || resultsEl.hidden || stale) return;
        e.preventDefault();
        el.click();
        return;
      }
      case 'Escape':
        // Open: close the list and keep the query. Already closed: let the browser
        // clear the field, as it does for any search input.
        if (resultsEl.hidden) return;
        e.preventDefault();
        close();
        return;
      case 'Tab':
        close();
        return;
    }
  });

  // Close results on click outside
  document.addEventListener('click', e => {
    if (!(e.target instanceof Element) || !e.target.closest('.site-search')) close();
  });

  // Reopen on focus if there's a query
  input.addEventListener('focus', () => {
    dismissed = false;
    if (input.value.trim() && (listbox.innerHTML || (emptyEl && !emptyEl.hidden))) setOpen(true);
  });
}
