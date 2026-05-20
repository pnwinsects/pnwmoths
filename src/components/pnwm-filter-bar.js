import { LitElement, html, css } from 'lit';
import { loadParquet } from './parquet-cache.js';

const CURRENT_YEAR = new Date().getFullYear();

class PnwmFilterBar extends LitElement {
  static get properties() {
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

  static get styles() {
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

  async connectedCallback() {
    super.connectedCallback();
    if (this.slug) {
      try {
        const records = await loadParquet(this.slug);
        const statesSet = new Set();
        const typesSet = new Set();
        const countiesSet = new Set();
        const collectionsSet = new Set();
        for (const r of records) {
          if (r.state) statesSet.add(r.state);
          if (r.record_type) typesSet.add(r.record_type);
          if (r.county) countiesSet.add(r.county);
          if (r.collection) collectionsSet.add(r.collection);
        }
        this._states = [...statesSet].sort();
        this._recordTypes = [...typesSet].sort();
        this._counties = [...countiesSet].sort();
        this._collections = [...collectionsSet].sort();
      } catch (err) {
        // Leave empty on error — controls still render with "All" options
      }
    }
  }

  _dispatchFilterChange() {
    this.dispatchEvent(new CustomEvent('pnwm-filter-change', {
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

  _onStateChange(e) {
    this._state = e.target.value;
    this._dispatchFilterChange();
  }

  _onRecordTypeChange(e) {
    this._recordType = e.target.value;
    this._dispatchFilterChange();
  }

  _onYearMinChange(e) {
    const val = Number(e.target.value);
    this._yearMin = Math.min(val, this._yearMax);
    this._dispatchFilterChange();
  }

  _onYearMaxChange(e) {
    const val = Number(e.target.value);
    this._yearMax = Math.max(val, this._yearMin);
    this._dispatchFilterChange();
  }

  _onCountyChange(e) {
    this._county = e.target.value;
    this._dispatchFilterChange();
  }

  _onCollectionChange(e) {
    this._collection = e.target.value;
    this._dispatchFilterChange();
  }

  _onElevationMinChange(e) {
    const val = Number(e.target.value);
    this._elevationMin = Math.min(val, this._elevationMax);
    this._dispatchFilterChange();
  }

  _onElevationMaxChange(e) {
    const val = Number(e.target.value);
    this._elevationMax = Math.max(val, this._elevationMin);
    this._dispatchFilterChange();
  }

  _onClearFilters(e) {
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

  render() {
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
            ${this._counties.map(c => html`<option value=${c} ?selected=${this._county === c}>${c}</option>`)}
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
