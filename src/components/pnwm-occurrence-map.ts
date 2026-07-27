import { LitElement, html, type PropertyDeclarations, type TemplateResult, type PropertyValues } from 'lit';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadParquet, filterRecords } from './parquet-cache.ts';
import { PNW_REGION_RING } from './pnw-region.ts';
import type { OccurrenceRecord, FilterChangeDetail } from '../types/index.ts';

class PnwmOccurrenceMap extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      slug: { type: String },
      speciesName: { type: String, attribute: 'species-name' },
      filters: { attribute: false },
      _records: { attribute: false, state: true },
      _loading: { type: Boolean, state: true },
      _error: { attribute: false, state: true },
    };
  }

  slug: string;
  speciesName: string;
  filters: Partial<FilterChangeDetail> | null;
  _records: OccurrenceRecord[];
  _loading: boolean;
  _error: unknown;
  _map: L.Map | null;
  _markerGroup: L.FeatureGroup | null;

  constructor() {
    super();
    this.slug = '';
    this.speciesName = '';
    this.filters = null;
    this._records = [];
    this._loading = true;
    this._error = null;
    this._map = null;
    this._markerGroup = null;
  }

  /** Use light DOM so Leaflet can interact with the container directly */
  createRenderRoot(): this {
    return this;
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    if (this.slug) {
      try {
        const records = await loadParquet(this.slug);
        this._records = records;
        this._loading = false;
      } catch (err) {
        this._error = err;
        this._loading = false;
      }
    } else {
      this._loading = false;
    }
  }

  render(): TemplateResult {
    if (this._loading) {
      return html`<div style="min-height:320px;display:flex;align-items:center;justify-content:center"><p style="color:var(--pico-muted-color)">Loading occurrence data...</p></div>`;
    }
    if (this._error) {
      return html`<div style="min-height:320px;display:flex;align-items:center;justify-content:center"><p style="color:var(--pico-del-color)">Could not load occurrence data. Try reloading the page.</p></div>`;
    }
    // role="region", not role="application": the latter tells screen readers to
    // stop intercepting keys and hand everything to the widget, which is only
    // right for something that implements its own full keyboard model. Leaflet's
    // controls are ordinary focusable buttons, so browse mode should stay on.
    // The label carries the species name (the attribute) rather than the slug,
    // plus the record count, since the markers themselves convey nothing to AT.
    const name = this.speciesName || this.slug;
    const visible = this.filters ? filterRecords(this._records, this.filters) : this._records;
    // Count what _renderMap() actually plots, not every matching record: markers
    // are skipped for records with no coordinates, so counting `visible` would
    // announce more points than the map shows.
    const plotted = visible.filter(r => r.latitude != null && r.longitude != null).length;
    return html`<div
      id="map-${this.slug}"
      style="min-height:320px"
      role="region"
      aria-label="Occurrence map for ${name}: ${plotted} record${plotted === 1 ? '' : 's'} plotted."
    ></div>`;
  }

  updated(changed: PropertyValues): void {
    if ((changed.has('_records') || changed.has('filters')) && !this._loading) {
      this._renderMap();
    }
  }

  _renderMap(): void {
    const visible = this.filters ? filterRecords(this._records, this.filters) : this._records;
    const container = this.querySelector('[id^="map-"]') as HTMLElement | null;
    if (!container) return;

    if (this._map) {
      // Clear existing layers but keep the map instance
      if (this._markerGroup) {
        this._markerGroup.clearLayers();
      }
    } else {
      this._map = L.map(container).setView([46.5, -120.5], 5);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(this._map);
      // Shade outside the PNW region boundary (PNW_REGION_RING is the shared source of truth)
      L.polygon([
        [[90, -180], [90, 0], [-90, 0], [-90, -180]], // world mask
        PNW_REGION_RING, // PNW hole
      ], {
        color: '#444',
        weight: 1.5,
        fillColor: '#000',
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(this._map);
      this._markerGroup = L.featureGroup().addTo(this._map);
    }

    this._markerGroup!.clearLayers();

    const markers: L.CircleMarker[] = [];
    for (const r of visible) {
      if (r.latitude != null && r.longitude != null) {
        const marker = L.circleMarker([r.latitude, r.longitude], {
          radius: 3,
          color: '#0172ad',
          fillOpacity: 0.7,
        });
        // Delegate popup rendering to <pnwm-occurrence-popup> — Lit's html template handles XSS escaping (T-03-01 mitigation preserved)
        const popupEl = document.createElement('pnwm-occurrence-popup') as HTMLElement & { record: OccurrenceRecord };
        popupEl.record = r;
        marker.bindPopup(popupEl);
        markers.push(marker);
        this._markerGroup!.addLayer(marker);
      }
    }

    if (markers.length > 0) {
      this._map!.fitBounds(this._markerGroup!.getBounds().pad(0.1), { maxZoom: 5 });
    } else {
      // Show empty state
      const emptyMsg = container.querySelector('.pnwm-map-empty');
      if (!emptyMsg) {
        const msg = document.createElement('p');
        msg.className = 'pnwm-map-empty';
        msg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--pico-muted-color)';
        msg.textContent = 'No occurrence records match the current filters.';
        container.style.position = 'relative';
        container.appendChild(msg);
      }
    }

    this._map!.invalidateSize();
  }

  disconnectedCallback(): void {
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    super.disconnectedCallback();
  }
}

customElements.define('pnwm-occurrence-map', PnwmOccurrenceMap);
