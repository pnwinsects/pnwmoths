// key-results-grid — Presentational Light DOM Lit component for the /identify/ results grid.
// Receives matched species as reactive props from pnwm-identify; renders three mutually-exclusive
// states: at-rest prompt, active results grid, zero-match empty state.
// Exports pure helpers buildCardUrl + buildCountText for unit testing (Wave 0 contracts).
import { LitElement, html, type TemplateResult, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { KeySpecies } from '../types/schemas.ts';

const CDN_BASE_URL = 'https://moths.pnwinsects.org';

/**
 * Construct a CDN thumbnail URL for a species image.
 * Mirrors the pattern from pnwm-taxon-browser.ts (D-07).
 *
 * @param slug - species slug (e.g. 'habrosyne-scripta')
 * @param navImage - bare filename string (e.g. 'Habrosyne scripta-A-D.jpg')
 * @param height - CDN resize height (e.g. 320 for 2x at 160px display height)
 * @returns CDN URL with encodeURIComponent-encoded filename and ?height= query param
 */
export function buildCardUrl(slug: string, navImage: string, height: number): string {
  return `${CDN_BASE_URL}/${slug}/${encodeURIComponent(navImage)}?height=${height}`;
}

/**
 * Construct the count-line text for the results grid.
 * Exact copy strings locked by D-01/D-03 (UI-SPEC Copywriting Contract).
 *
 * @param hasSelection - true when any character state is selected
 * @param count - number of matched species (ignored when hasSelection is false)
 * @param total - total number of key species (e.g. 1192)
 * @returns e.g. "47 species match" or "Showing all 1,192 species"
 */
export function buildCountText(hasSelection: boolean, count: number, total: number): string {
  if (hasSelection) {
    return `${count.toLocaleString('en-US')} species match`;
  }
  return `Showing all ${total.toLocaleString('en-US')} species`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Exported for potential test access alongside the registered custom element. */
export class KeyResultsGrid extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      matchedSpecies: { attribute: false },
      hasSelection:   { type: Boolean },
      matchedCount:   { type: Number },
      totalCount:     { type: Number },
      pathPrefix:     { type: String, attribute: 'path-prefix' },
    };
  }

  matchedSpecies: KeySpecies[] = [];
  hasSelection = false;
  matchedCount = 0;
  totalCount = 1190;
  pathPrefix = '';

  /** Slugs whose CDN thumbnail failed to load — rendered as the gray placeholder
   *  instead of a broken <img> (GRID-03/SC3: "no broken <img> tags appear in the grid").
   *  Guards against bad/missing nav_image data (e.g. CDN 404s). */
  _failedImages = new Set<string>();

  /** Light DOM — theme.css .similar-species-placeholder must reach card internals */
  createRenderRoot(): this { return this; }

  /** Mirror pnwm-taxon-browser.ts line 106 */
  get _prefix(): string {
    return this.pathPrefix || '/';
  }

  /** Gray placeholder block shared by no-photo species and load-failed thumbnails. */
  _renderPlaceholder(): TemplateResult {
    return html`<div class="pnwm-krg-placeholder-wrap"><div class="similar-species-placeholder" aria-hidden="true"></div></div>`;
  }

  _onImageError(slug: string): void {
    if (this._failedImages.has(slug)) return;
    this._failedImages.add(slug);
    this.requestUpdate();
  }

  _renderCard(sp: KeySpecies): TemplateResult {
    return html`
      <a class="pnwm-krg-card" href="${this._prefix}species/${sp.slug}/">
        ${sp.nav_image && !this._failedImages.has(sp.slug)
          ? html`<img
              src="${buildCardUrl(sp.slug, sp.nav_image, 320)}"
              alt="${sp.genus} ${sp.epithet}"
              loading="lazy"
              @error=${() => this._onImageError(sp.slug)}>`
          : this._renderPlaceholder()
        }
        <div class="pnwm-krg-label">
          <em>${sp.genus} ${sp.epithet}</em>${sp.common_name ? html`<br><span class="pnwm-krg-common">${sp.common_name}</span>` : ''}
        </div>
      </a>`;
  }

  render(): TemplateResult {
    const total = this.totalCount ?? 1190;
    const count = this.matchedCount ?? 0;
    const countLine = html`<p class="pnwm-krg-count" aria-live="polite" aria-atomic="true">${buildCountText(this.hasSelection, count, total)}</p>`;

    if (!this.hasSelection) {
      return html`
        ${countLine}
        <p class="pnwm-krg-prompt">Select characters to narrow the ${total.toLocaleString('en-US')} key species</p>`;
    }
    if (!this.matchedSpecies?.length) {
      return html`
        ${countLine}
        <p class="pnwm-krg-empty">No species match the selected characters</p>
        <button type="button" @click=${() => this.dispatchEvent(new CustomEvent('pnwm-key-clear-all', { bubbles: true }))}>
          Clear all
        </button>`;
    }
    return html`
      ${countLine}
      <div class="pnwm-krg-grid">
        ${repeat(this.matchedSpecies, sp => sp.slug, sp => this._renderCard(sp))}
      </div>`;
  }
}

customElements.define('key-results-grid', KeyResultsGrid);
