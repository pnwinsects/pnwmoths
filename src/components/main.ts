import './pnwm-occurrence-map.ts';
import './pnwm-occurrence-popup.ts';
import './pnwm-phenology-chart.ts';
import './pnwm-filter-bar.ts';
import './pnwm-image-slideshow.ts';
import './pnwm-taxon-browser.ts';
import './pnwm-plate-viewer.ts';
import './glossary-tooltip.ts';
import './pnwm-identify.ts';
import './key-results-grid.ts';
import type { FilterChangeDetail } from '../types/index.ts';

// Species-page wiring: forward filter-bar changes to the map and phenology chart.
// Lives here (loaded on every page via base.njk) rather than as a per-page inline
// module — an inline <script type="module"> would make each species page its own
// Vite/Rollup entry, emitting one hashed chunk per species. The querySelector guards
// make this a no-op on pages without those elements.
type FilterTarget = HTMLElement & { filters: Partial<FilterChangeDetail> | null };
const occurrenceMap = document.querySelector<FilterTarget>('pnwm-occurrence-map');
const phenologyChart = document.querySelector<FilterTarget>('pnwm-phenology-chart');
if (occurrenceMap || phenologyChart) {
  document.addEventListener('pnwm-filter-change', (e) => {
    const detail = (e as CustomEvent<FilterChangeDetail>).detail;
    if (occurrenceMap) occurrenceMap.filters = detail;
    if (phenologyChart) phenologyChart.filters = detail;
  });
}
