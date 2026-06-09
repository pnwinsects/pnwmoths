import { LitElement, html } from 'lit';

/**
 * Popup body for a single occurrence marker on a species map.
 *
 * Renders into light DOM so Leaflet's popup auto-sizing measures the
 * <p> children directly. Two layout fixes are needed:
 *
 *   1. display:block on the host. Unknown elements default to inline; an
 *      inline parent with block <p> children contributes ~zero inline width.
 *   2. Synchronous first render in connectedCallback via performUpdate().
 *      Lit's first render is normally scheduled in a microtask, but Leaflet
 *      runs _updateLayout synchronously after inserting the element and
 *      pins .leaflet-popup-content at minWidth + 1px (51px) before Lit has
 *      populated the host.
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

  connectedCallback() {
    super.connectedCallback();
    this.style.display = 'block';
    this.performUpdate();
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
