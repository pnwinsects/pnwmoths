import { LitElement, html, type PropertyDeclarations, type TemplateResult } from 'lit';
import type { OccurrenceRecord } from '../types/index.ts';

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
  static properties: PropertyDeclarations = {
    record: { attribute: false },
  };

  declare record: OccurrenceRecord | null;

  createRenderRoot(): this { return this; }

  constructor() {
    super();
    this.record = null;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'block';
    this.performUpdate();
  }

  render(): TemplateResult {
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

function formatPlace(r: OccurrenceRecord): string | null {
  const parts = [r.locality, r.county && `${r.county} Co.`, r.state].filter(Boolean);
  const tail: string[] = [];
  if (r.elevation_ft != null) tail.push(`${r.elevation_ft.toLocaleString('en-US')} ft`);
  if (r.latitude != null && r.longitude != null) {
    tail.push(`${formatCoord(r.latitude)}, ${formatCoord(r.longitude)}`);
  }
  const head = parts.join(', ');
  const all = [head, ...tail].filter(Boolean);
  return all.length ? all.join(' · ') : null;
}

/**
 * Preserve source decimal precision (`String(n)` round-trips to the shortest
 * decimal that produces the same double). Cap at 6 decimals (~10cm) to
 * suppress the rare float-representation garbage that escapes from upstream.
 */
function formatCoord(n: number): string {
  const s = String(n);
  const dot = s.indexOf('.');
  if (dot < 0 || s.length - dot - 1 <= 6) return s;
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDateLine(r: OccurrenceRecord): string | null {
  let date: string | null = null;
  // noUncheckedIndexedAccess: MONTHS[r.month - 1] returns string | undefined; non-null assertion
  // safe because r.month is truthy (checked above) and we use it as a month index
  if (r.year && r.month && r.day) date = `${r.day} ${MONTHS[r.month - 1]!} ${r.year}`;
  else if (r.year && r.month) date = `${MONTHS[r.month - 1]!} ${r.year}`;
  else if (r.year) date = String(r.year);

  if (date && r.record_type) return `${date} · ${r.record_type}`;
  return date || r.record_type || null;
}

function formatAttribution(r: OccurrenceRecord): string | null {
  if (r.collector && r.collection) return `${r.collector} (${r.collection})`;
  return r.collector || r.collection || null;
}

/**
 * Split notes on `;`, trim each item, and tokenize URLs so the template can
 * render real <a> elements. Lit's html template still escapes both attr values
 * and text nodes, so this stays XSS-safe.
 */
function formatNotes(notes: string | null): Array<Array<{ text?: string; url?: string }>> {
  if (!notes) return [];
  const URL_RE = /https?:\/\/[^\s)]+/g;
  return notes
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const parts: Array<{ text?: string; url?: string }> = [];
      let last = 0;
      let m: RegExpExecArray | null;
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
