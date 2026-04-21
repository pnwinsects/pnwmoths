import { LitElement, html, css } from 'lit';

/**
 * Deep-zoom viewer for photographic plates using OpenSeadragon + Zoomify tiles.
 *
 * Usage:
 *   <pnwm-plate-viewer
 *     tiles-url="/pnwmoths/plates/plate-1-drepanidae/"
 *     width="2400"
 *     height="3000">
 *   </pnwm-plate-viewer>
 *
 * OpenSeadragon is dynamically imported so it only loads on pages that
 * actually contain this element (Vite code-splits it automatically).
 */
class PnwmPlateViewer extends LitElement {
  static properties = {
    tilesUrl: { type: String, attribute: 'tiles-url' },
    prefixUrl: { type: String, attribute: 'prefix-url' },
    width: { type: Number },
    height: { type: Number },
  };

  static styles = css`
    :host { display: block; }
    #viewer {
      width: 100%;
      height: 70vh;
      min-height: 400px;
      background: #111;
    }
  `;

  firstUpdated() {
    this._initViewer();
  }

  async _initViewer() {
    const { default: OpenSeadragon } = await import('openseadragon');
    const viewerEl = this.renderRoot.querySelector('#viewer');
    OpenSeadragon({
      element: viewerEl,
      prefixUrl: this.prefixUrl,
      tileSources: {
        type: 'zoomifytileservice',
        width: this.width,
        height: this.height,
        tilesUrl: this.tilesUrl,
      },
      visibilityRatio: 1.0,
      minZoomLevel: 0.5,
      defaultZoomLevel: 0,
      showRotationControl: false,
    });
  }

  render() {
    return html`<div id="viewer"></div>`;
  }
}

customElements.define('pnwm-plate-viewer', PnwmPlateViewer);
