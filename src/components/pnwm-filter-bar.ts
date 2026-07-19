import { LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult } from 'lit';
import { loadParquet } from './parquet-cache.ts';
import type { OccurrenceRecord, FilterChangeDetail } from '../types/index.ts';

const CURRENT_YEAR = new Date().getFullYear();

export interface CountyOption {
  value: string;
  label: string;
}

/**
 * Build the County dropdown options from a species' own occurrence records.
 *
 * ISSUE-133: same-named counties/regional districts in different states/provinces
 * (e.g. WA Lincoln vs MT Lincoln, OR/WA Benton, ID/OR Washington) would otherwise
 * collapse into one ambiguous entry whose filter silently aggregates records from
 * every matching state. When a raw county name maps to more than one state within
 * this species' records, each state's occurrence gets its own option keyed
 * `${state}:${county}` (the same compound-key convention pnwm-taxon-browser uses
 * for Browse's district filter) and labeled `${county} (${state})`. Unambiguous
 * names — the common case — keep a bare `county` value/label, matching the
 * legacy site's un-annotated county list and prior behavior here.
 *
 * Ambiguity is determined per-species (not globally across the whole database):
 * a species whose "Lincoln" records all fall in one state is never ambiguous for
 * its own dropdown, and filtering by the bare name can't mix in another state's
 * records because none exist in this record set.
 */
export function buildCountyOptions(
  records: Pick<OccurrenceRecord, 'county' | 'state'>[]
): CountyOption[] {
  const statesByCounty = new Map<string, Set<string>>();
  for (const r of records) {
    if (!r.county) continue;
    if (!statesByCounty.has(r.county)) statesByCounty.set(r.county, new Set());
    if (r.state) statesByCounty.get(r.county)!.add(r.state);
  }
  const options: CountyOption[] = [];
  for (const [county, states] of statesByCounty) {
    if (states.size > 1) {
      for (const state of [...states].sort()) {
        options.push({ value: `${state}:${county}`, label: `${county} (${state})` });
      }
    } else {
      options.push({ value: county, label: county });
    }
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

class PnwmFilterBar extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      slug: { type: String },
      _state: { type: String, state: true },
      _recordType: { type: String, state: true },
      _yearMin: { type: Number, state: true },
      _yearMax: { type: Number, state: true },
      _states: { attribute: false, state: true },
      _recordTypes: { attribute: false, state: true },
      _county: { type: String, state: true },
      _collection: { type: String, state: true },
      _elevationMin: { type: Number, state: true },
      _elevationMax: { type: Number, state: true },
      _counties: { attribute: false, state: true },
      _collections: { attribute: false, state: true },
    };
  }

  static get styles(): CSSResult {
    return css`
      :host {
        display: block;
      }
      .filter-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: flex-end;
      }
      .filter-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      select,
      input[type="range"] {
        min-height: 44px;
      }
      .year-range {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .year-range-inputs {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      a.clear-filters {
        cursor: pointer;
      }
    `;
  }

  // Instance fields — declared above constructor, assigned in constructor
  // (useDefineForClassFields: false means these become constructor assignments,
  // which is compatible with Lit reactive property descriptors — D-08 / Pitfall 1)
  slug: string;
  _state: string;
  _recordType: string;
  _yearMin: number;
  _yearMax: number;
  _states: string[];
  _recordTypes: string[];
  _county: string;
  _collection: string;
  _elevationMin: number;
  _elevationMax: number;
  _counties: CountyOption[];
  _collections: string[];

  constructor() {
    super();
    this.slug = '';
    this._state = 'all';
    this._recordType = 'all';
    this._yearMin = 1900;
    this._yearMax = CURRENT_YEAR;
    this._states = [];
    this._recordTypes = [];
    this._county = 'all';
    this._collection = 'all';
    this._elevationMin = 0;
    this._elevationMax = 15000;
    this._counties = [];
    this._collections = [];
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    if (this.slug) {
      try {
        const records: OccurrenceRecord[] = await loadParquet(this.slug);
        const statesSet = new Set<string>();
        const typesSet = new Set<string>();
        const collectionsSet = new Set<string>();
        for (const r of records) {
          if (r.state) statesSet.add(r.state);
          if (r.record_type) typesSet.add(r.record_type);
          if (r.collection) collectionsSet.add(r.collection);
        }
        this._states = [...statesSet].sort();
        this._recordTypes = [...typesSet].sort();
        this._counties = buildCountyOptions(records);
        this._collections = [...collectionsSet].sort();
      } catch (_err) {
        // Leave empty on error — controls still render with "All" options
      }
    }
  }

  _dispatchFilterChange(): void {
    this.dispatchEvent(new CustomEvent<FilterChangeDetail>('pnwm-filter-change', {
      bubbles: true,
      composed: true,
      detail: {
        state: this._state,
        recordType: this._recordType,
        yearMin: this._yearMin,
        yearMax: this._yearMax,
        county: this._county,
        collection: this._collection,
        elevationMin: this._elevationMin,
        elevationMax: this._elevationMax,
      },
    }));
  }

  _onStateChange(e: Event): void {
    this._state = (e.target as HTMLSelectElement).value;
    this._dispatchFilterChange();
  }

  _onRecordTypeChange(e: Event): void {
    this._recordType = (e.target as HTMLSelectElement).value;
    this._dispatchFilterChange();
  }

  _onYearMinChange(e: Event): void {
    const val = Number((e.target as HTMLInputElement).value);
    this._yearMin = Math.min(val, this._yearMax);
    this._dispatchFilterChange();
  }

  _onYearMaxChange(e: Event): void {
    const val = Number((e.target as HTMLInputElement).value);
    this._yearMax = Math.max(val, this._yearMin);
    this._dispatchFilterChange();
  }

  _onCountyChange(e: Event): void {
    this._county = (e.target as HTMLSelectElement).value;
    this._dispatchFilterChange();
  }

  _onCollectionChange(e: Event): void {
    this._collection = (e.target as HTMLSelectElement).value;
    this._dispatchFilterChange();
  }

  _onElevationMinChange(e: Event): void {
    const val = Number((e.target as HTMLInputElement).value);
    this._elevationMin = Math.min(val, this._elevationMax);
    this._dispatchFilterChange();
  }

  _onElevationMaxChange(e: Event): void {
    const val = Number((e.target as HTMLInputElement).value);
    this._elevationMax = Math.max(val, this._elevationMin);
    this._dispatchFilterChange();
  }

  _onClearFilters(e: Event): void {
    e.preventDefault();
    this._state = 'all';
    this._recordType = 'all';
    this._yearMin = 1900;
    this._yearMax = CURRENT_YEAR;
    this._county = 'all';
    this._collection = 'all';
    this._elevationMin = 0;
    this._elevationMax = 15000;
    this._dispatchFilterChange();
  }

  render(): TemplateResult {
    return html`
      <div class="filter-controls">
        <div class="filter-group">
          <label for="filter-state-${this.slug}">State</label>
          <select
            id="filter-state-${this.slug}"
            .value=${this._state}
            @change=${this._onStateChange}
          >
            <option value="all">All states</option>
            ${this._states.map(s => html`<option value=${s} ?selected=${this._state === s}>${s}</option>`)}
          </select>
        </div>

        <div class="filter-group">
          <label for="filter-type-${this.slug}">Record type</label>
          <select
            id="filter-type-${this.slug}"
            .value=${this._recordType}
            @change=${this._onRecordTypeChange}
          >
            <option value="all">All types</option>
            ${this._recordTypes.map(t => html`<option value=${t} ?selected=${this._recordType === t}>${t}</option>`)}
          </select>
        </div>

        <div class="filter-group">
          <label for="filter-county-${this.slug}">County</label>
          <select
            id="filter-county-${this.slug}"
            .value=${this._county}
            @change=${this._onCountyChange}
          >
            <option value="all">All counties</option>
            ${this._counties.map(c => html`<option value=${c.value} ?selected=${this._county === c.value}>${c.label}</option>`)}
          </select>
        </div>

        <div class="filter-group">
          <label for="filter-collection-${this.slug}">Collection</label>
          <select
            id="filter-collection-${this.slug}"
            .value=${this._collection}
            @change=${this._onCollectionChange}
          >
            <option value="all">All collections</option>
            ${this._collections.map(c => html`<option value=${c} ?selected=${this._collection === c}>${c}</option>`)}
          </select>
        </div>

        <div class="filter-group year-range">
          <label>Year range: ${this._yearMin} &ndash; ${this._yearMax}</label>
          <div class="year-range-inputs">
            <label for="filter-year-min-${this.slug}" class="sr-only">Minimum year</label>
            <input
              type="range"
              id="filter-year-min-${this.slug}"
              min="1900"
              max=${CURRENT_YEAR}
              step="1"
              .value=${String(this._yearMin)}
              @input=${this._onYearMinChange}
            >
            <label for="filter-year-max-${this.slug}" class="sr-only">Maximum year</label>
            <input
              type="range"
              id="filter-year-max-${this.slug}"
              min="1900"
              max=${CURRENT_YEAR}
              step="1"
              .value=${String(this._yearMax)}
              @input=${this._onYearMaxChange}
            >
          </div>
        </div>

        <div class="filter-group year-range">
          <label>Elevation: ${this._elevationMin} &ndash; ${this._elevationMax} ft</label>
          <div class="year-range-inputs">
            <label for="filter-elevation-min-${this.slug}" class="sr-only">Minimum elevation in feet</label>
            <input
              type="range"
              id="filter-elevation-min-${this.slug}"
              min="0"
              max="15000"
              step="100"
              .value=${String(this._elevationMin)}
              @input=${this._onElevationMinChange}
            >
            <label for="filter-elevation-max-${this.slug}" class="sr-only">Maximum elevation in feet</label>
            <input
              type="range"
              id="filter-elevation-max-${this.slug}"
              min="0"
              max="15000"
              step="100"
              .value=${String(this._elevationMax)}
              @input=${this._onElevationMaxChange}
            >
          </div>
        </div>

        <div class="filter-group">
          <a href="#" class="clear-filters" @click=${this._onClearFilters}>Clear filters</a>
        </div>
      </div>
    `;
  }
}

customElements.define('pnwm-filter-bar', PnwmFilterBar);
