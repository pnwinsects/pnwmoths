import { LitElement, html } from 'lit';

/**
 * Popup body for a single occurrence marker on a species map.
 *
 * Renders into light DOM so Leaflet can measure the <p> children directly
 * when auto-sizing the popup — a shadow-host with no intrinsic width
 * collapses to its narrowest non-breakable word.
 */
class PnwmOccurrencePopup extends LitElement {
  static properties = {
    record: { attribute: false },
  };

  createRenderRoot() { return this; }

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
