// File: src/types/events.ts
// Module file: the export makes this a module, enabling declare global augmentation
// (verbatimModuleSyntax: true requires a module boundary — Pitfall 6 in RESEARCH.md)

export interface FilterChangeDetail {
  state: string;
  recordType: string;
  yearMin: number;
  yearMax: number;
  county: string;
  collection: string;
  elevationMin: number;
  elevationMax: number;
}

// KeyFilterChangeDetail (Phase 40) — distinct from FilterChangeDetail; no inheritance (event-bus isolation)
// Dispatched by pnwm-identify's filter panel; consumed by pnwm-identify's results grid.
// Do NOT extend FilterChangeDetail — key-filter events must not leak to occurrence-filter listeners.
export interface KeyFilterChangeDetail {
  matchedSlugs: string[];    // current matching species slugs (from computeMatching)
  count: number;             // matchedSlugs.length — convenience for counter component
  hasSelection: boolean;     // true iff selection.size > 0 (drives empty-state vs initial-state UX)
}

// Global HTMLElementEventMap augmentation — types addEventListener('pnwm-filter-change', ...)
// at all listener sites without a cast.
declare global {
  interface HTMLElementEventMap {
    'pnwm-filter-change':     CustomEvent<FilterChangeDetail>;
    'pnwm-key-filter-change': CustomEvent<KeyFilterChangeDetail>;  // NEW Phase 40
  }
}
