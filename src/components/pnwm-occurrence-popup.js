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

    const place = formatPlace(r);
    const dateLine = formatDateLine(r);
    const attribution = formatAttribution(r);
    const noteItems = formatNotes(r.notes);

    return html`
      ${place ? html`<p>${place}</p>` : null}
      ${dateLine ? html`<p>${dateLine}</p>` : null}
      ${attribution ? html`<p>${attribution}</p>` : null}
      ${noteItems.map(
        (parts) => html`<p class="pnwm-occ-note">${parts.map(
          (p) => p.url
            ? html`<a href=${p.url} target="_blank" rel="noopener noreferrer">${p.url}</a>`
            : p.text
        )}</p>`
      )}
    `;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPlace(r) {
  const parts = [r.locality, r.county && `${r.county} Co.`, r.state].filter(Boolean);
  let s = parts.join(', ');
  if (r.elevation_ft != null) {
    const elev = `${r.elevation_ft.toLocaleString('en-US')} ft`;
    s = s ? `${s} · ${elev}` : elev;
  }
  return s || null;
}

function formatDateLine(r) {
  let date = null;
  if (r.year && r.month && r.day) date = `${r.day} ${MONTHS[r.month - 1]} ${r.year}`;
  else if (r.year && r.month) date = `${MONTHS[r.month - 1]} ${r.year}`;
  else if (r.year) date = String(r.year);

  if (date && r.record_type) return `${date} · ${r.record_type}`;
  return date || r.record_type || null;
}

function formatAttribution(r) {
  if (r.collector && r.collection) return `${r.collector} (${r.collection})`;
  return r.collector || r.collection || null;
}

/**
 * Split notes on `;`, trim each item, and tokenize URLs so the template can
 * render real <a> elements. Lit's html template still escapes both attr values
 * and text nodes, so this stays XSS-safe.
 */
function formatNotes(notes) {
  if (!notes) return [];
  const URL_RE = /https?:\/\/[^\s)]+/g;
  return notes
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const parts = [];
      let last = 0;
      let m;
      while ((m = URL_RE.exec(item)) !== null) {
        if (m.index > last) parts.push({ text: item.slice(last, m.index) });
        // Strip trailing punctuation that's likely sentence-end, not URL.
        const url = m[0].replace(/[.,;:!?)]+$/, '');
        parts.push({ url });
        last = m.index + url.length;
      }
      if (last < item.length) parts.push({ text: item.slice(last) });
      URL_RE.lastIndex = 0;
      return parts;
    });
}

customElements.define('pnwm-occurrence-popup', PnwmOccurrencePopup);
