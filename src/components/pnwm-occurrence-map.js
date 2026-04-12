import { LitElement, html } from 'lit';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadParquet, filterRecords } from './parquet-cache.js';

class PnwmOccurrenceMap extends LitElement {
  static get properties() {
    return {
      slug: { type: String },
      filters: { attribute: false },
      _records: { attribute: false, state: true },
      _loading: { type: Boolean, state: true },
      _error: { attribute: false, state: true },
    };
  }

  constructor() {
    super();
    this.slug = '';
    this.filters = null;
    this._records = [];
    this._loading = true;
    this._error = null;
    this._map = null;
    this._markerGroup = null;
  }

  /** Use light DOM so Leaflet can interact with the container directly */
  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
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

  render() {
    if (this._loading) {
      return html`<div style="min-height:320px;display:flex;align-items:center;justify-content:center"><p style="color:var(--pico-muted-color)">Loading occurrence data...</p></div>`;
    }
    if (this._error) {
      return html`<div style="min-height:320px;display:flex;align-items:center;justify-content:center"><p style="color:var(--pico-del-color)">Could not load occurrence data. Try reloading the page.</p></div>`;
    }
    return html`<div id="map-${this.slug}" style="min-height:320px" role="application" aria-label="Occurrence map for ${this.slug}"></div>`;
  }

  updated(changed) {
    if ((changed.has('_records') || changed.has('filters')) && !this._loading) {
      this._renderMap();
    }
  }

  _renderMap() {
    const visible = this.filters ? filterRecords(this._records, this.filters) : this._records;
    const container = this.querySelector('[id^="map-"]');
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
      this._markerGroup = L.featureGroup().addTo(this._map);
    }

    this._markerGroup.clearLayers();

    const markers = [];
    for (const r of visible) {
      if (r.latitude != null && r.longitude != null) {
        const marker = L.circleMarker([r.latitude, r.longitude], {
          radius: 6,
          color: '#0172ad',
          fillOpacity: 0.7,
        });
        // Use Lit html tag is not available here; build popup content manually
        // All values are rendered via Leaflet's popup (text only) — XSS safe via textContent approach
        const parts = [
          r.locality && `Locality: ${r.locality}`,
          r.state && `State: ${r.state}`,
          r.county && `County: ${r.county}`,
          r.year && `Year: ${r.year}`,
          r.month && `Month: ${r.month}`,
          r.collector && `Collector: ${r.collector}`,
          r.record_type && `Type: ${r.record_type}`,
        ].filter(Boolean);
        // Create popup element using DOM text nodes to prevent XSS (T-03-01 mitigation)
        const popupEl = document.createElement('div');
        for (const part of parts) {
          const p = document.createElement('p');
          p.textContent = part;
          popupEl.appendChild(p);
        }
        marker.bindPopup(popupEl);
        markers.push(marker);
        this._markerGroup.addLayer(marker);
      }
    }

    if (markers.length > 0) {
      this._map.fitBounds(this._markerGroup.getBounds().pad(0.1), { maxZoom: 10 });
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

    this._map.invalidateSize();
  }

  disconnectedCallback() {
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    super.disconnectedCallback();
  }
}

customElements.define('pnwm-occurrence-map', PnwmOccurrenceMap);
