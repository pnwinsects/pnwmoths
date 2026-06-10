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

// Global HTMLElementEventMap augmentation — types addEventListener('pnwm-filter-change', ...)
// at all listener sites without a cast.
declare global {
  interface HTMLElementEventMap {
    'pnwm-filter-change': CustomEvent<FilterChangeDetail>;
  }
}
