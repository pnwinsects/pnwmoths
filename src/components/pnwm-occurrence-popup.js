import { LitElement, html, css } from 'lit';

/**
 * Popup body for a single occurrence marker on a species map.
 *
 * Usage (from JS — the popup is created and attached imperatively by
 * `pnwm-occurrence-map.js`, then handed to Leaflet via `marker.bindPopup(el)`):
 *
 *   const el = document.createElement('pnwm-occurrence-popup');
 *   el.record = r;
 *   marker.bindPopup(el);
 *
 * The component renders the same seven fields the map previously built
 * imperatively (Locality, State, County, Year, Month, Collector, Type),
 * preserving order and omitting falsy values. Values are interpolated
 * via Lit's `html` tagged template, which auto-escapes — this is the
 * T-03-01 XSS mitigation that the imperative `textContent` code used to
 * provide.
 *
 * Uses shadow DOM (Lit's default) so Pico CSS global `<p>` styles do not
 * fight Leaflet's popup chrome.
 */
class PnwmOccurrencePopup extends LitElement {
  static properties = {
    // record is a JS object set via property assignment, never as an HTML
    // attribute — `attribute: false` keeps Lit from trying to serialize it.
    record: { attribute: false },
  };

  static styles = css`
    :host {
      display: block;
    }
    p {
      margin: 0 0 0.25rem 0;
      line-height: 1.3;
    }
    p:last-child {
      margin-bottom: 0;
    }
  `;

  constructor() {
    super();
    this.record = null;
  }

  render() {
    const r = this.record;
    if (!r) return html``;

    const fields = [
      { label: 'Locality', value: r.locality },
      { label: 'State', value: r.state },
      { label: 'County', value: r.county },
      { label: 'Year', value: r.year },
      { label: 'Month', value: r.month },
      { label: 'Collector', value: r.collector },
      { label: 'Type', value: r.record_type },
    ].filter(({ value }) => value);

    return html`${fields.map(
      ({ label, value }) => html`<p>${label}: ${value}</p>`
    )}`;
  }
}

customElements.define('pnwm-occurrence-popup', PnwmOccurrencePopup);
